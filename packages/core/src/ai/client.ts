import 'server-only';
import OpenAI from 'openai';

export const AI_MODEL = 'gpt-5.6-terra';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}
