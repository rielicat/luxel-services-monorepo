import 'server-only';

export function devMockEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LUXEL_DEV_MOCK === '1';
}
