import { AI_MODEL } from '../ai/model';
import { getAgentModelClient, modelId } from './gateway';
import { accessSecrets, writeDigest } from './store';
import {
  threadHeads,
  threadMessages,
  threadOperationId,
  threadSessionId,
  undigestedThreads,
  type ThreadHead,
  type ThreadMessage,
} from './thread-store';

const MAX_THREADS_PER_RUN = 20;
const MIN_MESSAGES = 2;

const SYSTEM = `Lees una conversación real entre un huésped y Servicios Luxel, y la resumes para la memoria interna de Lux.

En la transcripción hay tres voces:
- "Huésped": la persona que se aloja.
- "Luxel": un operador humano de Luxel. Su forma de responder es la referencia de cómo debe sonar Lux.
- "Lux": la IA.

Devuelve JSON con esta forma exacta:
{"summary": string, "facts": string[], "outcome": string}
- summary: 2 o 3 frases. Qué pidió el huésped y cómo se resolvió.
- facts: hechos duraderos y reutilizables de esta propiedad o de cómo responde Luxel. Nada de saludos, nada de cortesía, nada que solo sirva para esta estadía.
- outcome: una de "resuelto", "derivado", "pendiente".
- Español, frases cortas, una idea por frase.
- Nunca incluyas códigos de acceso, contraseñas, correos, teléfonos ni documentos.`;

function speaker(message: ThreadMessage): string {
  if (message.direction === 'in') return 'Huésped';
  return message.source === 'ai' ? 'Lux' : 'Luxel';
}

function transcript(messages: readonly ThreadMessage[]): string {
  return messages.map((m) => `${speaker(m)}: ${m.body.slice(0, 600)}`).join('\n');
}

async function digestThread(
  head: ThreadHead,
  openai: NonNullable<ReturnType<typeof getAgentModelClient>>,
): Promise<boolean> {
  const messages = await threadMessages(head.threadId);
  if (messages.length < MIN_MESSAGES) return false;

  let parsed: { summary: string; facts: string[]; outcome: string };
  try {
    const res = await openai.chat.completions.create({
      model: modelId(AI_MODEL),
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
      max_completion_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: transcript(messages) },
      ],
    });
    const json = JSON.parse(res.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
    parsed = {
      summary: typeof json.summary === 'string' ? json.summary : '',
      facts: Array.isArray(json.facts)
        ? json.facts.filter((fact): fact is string => typeof fact === 'string')
        : [],
      outcome: typeof json.outcome === 'string' ? json.outcome : 'pendiente',
    };
  } catch (err) {
    console.error('agent.thread_digest_failed', {
      model: modelId(AI_MODEL),
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  if (!parsed.summary) return false;
  const secrets = await accessSecrets(head.propertyId);
  return writeDigest({
    sessionId: threadSessionId(head.threadId),
    operationId: threadOperationId(head.threadId, head.lastMessageId),
    surface: 'guest',
    propertyId: head.propertyId,
    threadId: head.threadId,
    summary: parsed.summary,
    facts: parsed.facts,
    outcome: parsed.outcome,
    secrets,
  });
}

export async function ingestThreads(): Promise<{
  ok: boolean;
  reason?: string;
  pending: number;
  threads: number;
  digests: number;
}> {
  const heads = (await threadHeads()).filter((head) => head.messages >= MIN_MESSAGES);
  const pending = await undigestedThreads(heads);
  if (!pending.length) return { ok: true, pending: 0, threads: 0, digests: 0 };

  const openai = getAgentModelClient();
  if (!openai)
    return { ok: false, reason: 'no_ai', pending: pending.length, threads: 0, digests: 0 };

  const batch = pending.slice(0, MAX_THREADS_PER_RUN);
  let digests = 0;
  for (const head of batch) {
    try {
      if (await digestThread(head, openai)) digests += 1;
    } catch (err) {
      console.error('agent.thread_ingest_failed', {
        threadId: head.threadId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ok: true, pending: pending.length, threads: batch.length, digests };
}
