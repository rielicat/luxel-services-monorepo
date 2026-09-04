import 'server-only';
import OpenAI from 'openai';

export { AI_MODEL, AI_GATEWAY_MODEL } from './model';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}
