import 'server-only';
import {
  CLEANING_MEDIA_READ_URL_PATH,
  CLEANING_MEDIA_TICKET_HEADER,
  CLEANING_MEDIA_UPLOAD_URL_PATH,
  isWalkthroughKey,
  type WalkthroughContentType,
  type WalkthroughReadTicket,
  type WalkthroughUploadTicket,
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

export function workerOrigin(): string | null {
  return originOf(process.env.LUXEL_WORKER_URL) ?? originOf(process.env.WHATSAPP_WORKER_SEND_URL);
}

export function mediaToken(): string | null {
  return process.env.CLEANING_MEDIA_KEY?.trim() || process.env.INTERNAL_SEND_TOKEN?.trim() || null;
}

export function cleaningMediaConfigured(): boolean {
  return Boolean(workerOrigin() && mediaToken());
}

async function postToWorker<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const origin = workerOrigin();
  const token = mediaToken();
  if (!origin || !token) return null;
  try {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function createWalkthroughUpload(
  cleaningId: string,
  contentType: WalkthroughContentType,
  bytes?: number,
): Promise<WalkthroughUploadTicket | null> {
  return postToWorker<WalkthroughUploadTicket>(CLEANING_MEDIA_UPLOAD_URL_PATH, {
    cleaningId,
    contentType,
    ...(typeof bytes === 'number' ? { bytes } : {}),
  });
}

export async function createWalkthroughReadUrl(key: string): Promise<WalkthroughReadTicket | null> {
  if (!isWalkthroughKey(key)) return null;
  return postToWorker<WalkthroughReadTicket>(CLEANING_MEDIA_READ_URL_PATH, { key });
}

export function walkthroughObjectRequest(ticket: WalkthroughReadTicket): {
  url: string;
  headers: Record<string, string>;
} {
  if (!ticket.ticket) return { url: ticket.url, headers: {} };
  try {
    const url = new URL(ticket.url);
    url.searchParams.delete('ticket');
    return { url: url.toString(), headers: { [CLEANING_MEDIA_TICKET_HEADER]: ticket.ticket } };
  } catch {
    return { url: ticket.url, headers: {} };
  }
}
