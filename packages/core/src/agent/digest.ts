import OpenAI from 'openai';
import { AI_MODEL } from '../ai/model';
import { accessSecrets, writeDigest } from './store';
import type { Surface } from './types';

export interface TurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM = `Resume una conversación de Servicios Luxel para memoria interna.
Devuelve JSON con esta forma exacta:
{"summary": string, "facts": string[], "outcome": string}
- summary: 1 o 2 frases sobre qué se pidió y qué se respondió.
- facts: hechos duraderos y reutilizables sobre la propiedad o la persona. Nada de saludos, nada de cortesía.
- outcome: una de "resuelto", "derivado", "pendiente".
Nunca incluyas códigos de acceso, contraseñas, correos, teléfonos ni documentos.
Escribe en español, frases cortas.`;

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}

function transcript(messages: readonly TurnMessage[]): string {
  return messages
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Persona' : 'Lux'}: ${m.content.slice(0, 800)}`)
    .join('\n');
}

function extractive(messages: readonly TurnMessage[]): {
  summary: string;
  facts: string[];
  outcome: string;
} {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastReply = [...messages].reverse().find((m) => m.role === 'assistant');
  const summary = [
    lastUser && `Consulta: ${lastUser.content}`,
    lastReply && `Respuesta: ${lastReply.content}`,
  ]
    .filter(Boolean)
    .join(' ');
  return { summary, facts: [], outcome: 'pendiente' };
}

export async function summarizeTurn(
  messages: readonly TurnMessage[],
): Promise<{ summary: string; facts: string[]; outcome: string }> {
  if (!messages.length) return { summary: '', facts: [], outcome: 'pendiente' };
  const openai = getClient();
  if (!openai) return extractive(messages);
  try {
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
      max_completion_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: transcript(messages) },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      facts: Array.isArray(parsed.facts)
        ? parsed.facts.filter((f): f is string => typeof f === 'string')
        : [],
      outcome: typeof parsed.outcome === 'string' ? parsed.outcome : 'pendiente',
    };
  } catch (err) {
    console.error('agent.digest_failed', {
      model: AI_MODEL,
      message: err instanceof Error ? err.message : String(err),
    });
    return extractive(messages);
  }
}

export async function captureTurn(input: {
  sessionId: string;
  operationId: string;
  surface: Surface;
  propertyId: string | null;
  threadId: string | null;
  messages: readonly TurnMessage[];
}): Promise<boolean> {
  const { summary, facts, outcome } = await summarizeTurn(input.messages);
  if (!summary) return false;
  const secrets = await accessSecrets(input.propertyId);
  return writeDigest({
    sessionId: input.sessionId,
    operationId: input.operationId,
    surface: input.surface,
    propertyId: input.propertyId,
    threadId: input.threadId,
    summary,
    facts,
    outcome,
    secrets,
  });
}
