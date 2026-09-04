import { defineAgent } from 'eve';
import { AI_GATEWAY_MODEL } from '@luxel/core/ai/model';

export default defineAgent({
  model: AI_GATEWAY_MODEL,
  reasoning: 'none',
  compaction: { thresholdPercent: 0.8 },
  limits: {
    maxOutputTokensPerSession: 200_000,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1_000,
  },
});
