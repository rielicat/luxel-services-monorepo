import { z } from 'zod';
import type OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { getOpenAI, AI_MODEL } from '@/lib/ai/client';
import { buildSystemPrompt } from '@/lib/ai/system-prompt';
import { buildTools, runTool, type ToolContext } from '@/lib/ai/tools';
import { getPricingData } from '@/lib/pricing-data';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { capture } from '@/lib/analytics/server';
import { EVENTS } from '@/lib/analytics/events';
import { createLead } from '@/lib/leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  sessionId: z.string().min(1).max(64),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

const MAX_TOOL_ROUNDS = 6;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, error: 'validation' }), { status: 400 });
  }
  const { sessionId, messages } = parsed.data;

  const { userId } = await auth();
  const supabase = createSupabaseServiceRoleClient();

  let customerId: string | null = null;
  if (userId) {
    const { data: c } = await supabase
      .from('customers')
      .select('id')
      .eq('clerk_user_id', userId)
      .maybeSingle();
    customerId = c?.id ?? null;
  }
  const distinctId = userId ?? sessionId;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    await supabase.from('messages').insert({
      customer_id: customerId,
      session_id: sessionId,
      direction: 'in',
      channel: 'web',
      body: lastUser.content,
    });
    capture(EVENTS.CHAT_MESSAGE_SENT, distinctId, { session_id: sessionId });
  }

  const openai = getOpenAI();

  // Graceful degradation when the AI key isn't configured.
  if (!openai) {
    const reply =
      'El asistente con IA no está disponible en este momento. Puedes cotizar al instante en la sección Cotizar del sitio, o escribirnos por WhatsApp y te ayudamos.';
    await persistAssistant(supabase, customerId, sessionId, reply, 'ai_unavailable');
    return sseOnce(reply);
  }

  const { pricingConfig, serviceTypes, operationPoints } = await getPricingData();
  const system = buildSystemPrompt({
    serviceTypes,
    operationPoints,
    pricingConfig,
    signedIn: Boolean(userId),
  });
  const tools = buildTools(serviceTypes.map((s) => s.slug));
  const ctx: ToolContext = { whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER };

  // System prompt + tools form a stable prefix → OpenAI prompt caching kicks in
  // automatically for the input tokens, cutting cost on multi-turn sessions.
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      let fullText = '';
      let handoff = false;

      try {
        let completed = false;
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const llm = await openai.chat.completions.create({
            model: AI_MODEL,
            max_completion_tokens: 1024,
            messages: convo,
            tools,
            stream: true,
          });

          let content = '';
          // Tool-call deltas arrive fragmented; accumulate by their stream index.
          const calls = new Map<number, { id: string; name: string; args: string }>();
          let finishReason: string | null = null;

          for await (const chunk of llm) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            if (choice.delta?.content) {
              content += choice.delta.content;
              send({ type: 'text', value: choice.delta.content });
            }
            for (const tc of choice.delta?.tool_calls ?? []) {
              const acc = calls.get(tc.index) ?? { id: '', name: '', args: '' };
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name += tc.function.name;
              if (tc.function?.arguments) acc.args += tc.function.arguments;
              calls.set(tc.index, acc);
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }
          fullText += content;

          const toolCalls = [...calls.values()].filter((c) => c.id && c.name);
          if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
            completed = true;
            break;
          }

          // Parse each call's args ONCE, so what we execute and what we echo back
          // into history always agree and are valid JSON. `ok:false` = the model
          // produced malformed JSON → don't run the tool with empty args.
          const parsed = toolCalls.map((c) => {
            try {
              return {
                c,
                args: (c.args ? JSON.parse(c.args) : {}) as Record<string, unknown>,
                ok: true,
              };
            } catch (e) {
              if (process.env.NODE_ENV !== 'production')
                console.error('tool args parse failed', c.name, e);
              return { c, args: {} as Record<string, unknown>, ok: false };
            }
          });

          convo.push({
            role: 'assistant',
            content: content || null,
            tool_calls: parsed.map(({ c, args }) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: JSON.stringify(args) },
            })),
          });

          for (const { c, args, ok } of parsed) {
            send({ type: 'tool', name: c.name, status: 'running' });
            capture(EVENTS.AI_TOOL_CALLED, distinctId, { tool: c.name, session_id: sessionId });

            if (!ok) {
              send({ type: 'tool', name: c.name, status: 'done' });
              convo.push({
                role: 'tool',
                tool_call_id: c.id,
                content:
                  'Error interno: los argumentos no eran válidos. Vuelve a llamar la herramienta con los datos completos en el formato correcto.',
              });
              continue;
            }

            const result = await runTool(c.name, args, ctx);
            if (result.widget) send({ type: 'widget', ...result.widget });
            if (result.handoff) {
              handoff = true;
              capture(EVENTS.AI_HANDOFF_TO_HUMAN, distinctId, { session_id: sessionId });
              void createLead({
                source: 'chat_handoff',
                sessionId,
                customerId,
                message: lastUser?.content ?? null,
                metadata: { via: 'lux_concierge' },
              });
            }
            send({ type: 'tool', name: c.name, status: 'done' });

            convo.push({ role: 'tool', tool_call_id: c.id, content: result.content });
          }
        }

        // Rounds exhausted while still calling tools → force a final text answer
        // (no tools) so the user always gets a closing reply from the tool results.
        if (!completed) {
          const final = await openai.chat.completions.create({
            model: AI_MODEL,
            max_completion_tokens: 1024,
            messages: convo,
            stream: true,
          });
          for await (const chunk of final) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              send({ type: 'text', value: delta });
            }
          }
        }

        send({ type: 'done', handoff });
        controller.close();

        const persisted = fullText.trim();
        if (persisted) {
          await persistAssistant(
            supabase,
            customerId,
            sessionId,
            persisted,
            handoff ? 'handoff' : 'ai',
          );
        }
      } catch (err) {
        send({
          type: 'error',
          message:
            'Ocurrió un error con el asistente. Intenta nuevamente o escríbenos por WhatsApp.',
        });
        controller.close();
        if (process.env.NODE_ENV !== 'production') console.error('chat route error', err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
    },
  });
}

async function persistAssistant(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  customerId: string | null,
  sessionId: string,
  body: string,
  kind: string,
) {
  await supabase.from('messages').insert({
    customer_id: customerId,
    session_id: sessionId,
    direction: 'out',
    channel: 'web',
    body,
    metadata: { kind },
  });
}

function sseOnce(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'text', value: text })}\n\n`),
      );
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
