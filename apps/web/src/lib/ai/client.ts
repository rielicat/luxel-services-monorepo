import 'server-only';
import OpenAI from 'openai';

/**
 * Model for the "Lux" concierge. Cost-optimized default: `gpt-4o-mini` — cheap,
 * low-latency, and more than capable for this tightly-scripted, tool-driven
 * concierge. Point OPENAI_MODEL at a stronger tier if you ever need it.
 */
export const AI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}
