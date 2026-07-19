import 'server-only';

/**
 * Umbrella dev-only stub flag. When set (non-production + LUXEL_DEV_MOCK=1),
 * integrations without real credentials — email, AI drafting — simulate success
 * so the whole host↔guest journey can be exercised locally and in tests. Real
 * keys always take precedence over the stub.
 */
export function devMockEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LUXEL_DEV_MOCK === '1';
}
