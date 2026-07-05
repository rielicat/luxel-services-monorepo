import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Model for the "Lux" concierge. Defaults to Claude Opus 4.8; an operator can
 * point LUXEL_AI_MODEL at a cheaper tier (e.g. claude-haiku-4-5) for volume.
 */
export const AI_MODEL = process.env.LUXEL_AI_MODEL ?? 'claude-opus-4-8';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}
