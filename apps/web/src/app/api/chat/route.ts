import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { auth } from '@clerk/nextjs/server';
import { getAnthropic, AI_MODEL } from '@/lib/ai/client';
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

  const anthropic = getAnthropic();

  // Graceful degradation when the AI key isn't configured.
  if (!anthropic) {
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

  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      let fullText = '';
      let handoff = false;

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const llm = anthropic.messages.stream({
            model: AI_MODEL,
            max_tokens: 1024,
            system,
            tools,
            messages: convo,
          });

          llm.on('text', (delta) => {
            fullText += delta;
            send({ type: 'text', value: delta });
          });

          const message = await llm.finalMessage();
          convo.push({ role: 'assistant', content: message.content });

          const toolUses = message.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          );

          if (message.stop_reason !== 'tool_use' || toolUses.length === 0) {
            break;
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            send({ type: 'tool', name: tu.name, status: 'running' });
            capture(EVENTS.AI_TOOL_CALLED, distinctId, { tool: tu.name, session_id: sessionId });

            const result = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, ctx);
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
            send({ type: 'tool', name: tu.name, status: 'done' });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: result.content,
            });
          }
          convo.push({ role: 'user', content: toolResults });
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
