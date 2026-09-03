import 'server-only';
import {
  CLEANING_MEDIA_READ_URL_PATH,
  isWalkthroughKey,
  type WalkthroughReadTicket,
} from '@luxel/shared/cleaning-media';

function originOf(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function workerOrigin(): string | null {
  return originOf(process.env.LUXEL_WORKER_URL) ?? originOf(process.env.WHATSAPP_WORKER_SEND_URL);
}

function mediaToken(): string | null {
  return process.env.CLEANING_MEDIA_KEY?.trim() || process.env.INTERNAL_SEND_TOKEN?.trim() || null;
}

export function cleaningMediaConfigured(): boolean {
  return Boolean(workerOrigin() && mediaToken());
}

export async function createWalkthroughReadUrl(key: string): Promise<WalkthroughReadTicket | null> {
  const origin = workerOrigin();
  const token = mediaToken();
  if (!origin || !token || !isWalkthroughKey(key)) return null;
  try {
    const res = await fetch(`${origin}${CLEANING_MEDIA_READ_URL_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify({ key }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as WalkthroughReadTicket;
  } catch {
    return null;
  }
}
