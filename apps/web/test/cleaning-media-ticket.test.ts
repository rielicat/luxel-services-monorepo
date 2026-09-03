import { describe, it, expect } from 'vitest';
import {
  CLEANING_MEDIA_OBJECT_PATH,
  CLEANING_MEDIA_TICKET_HEADER,
} from '@luxel/shared/cleaning-media';
import {
  corsHeaders,
  handleObjectGet,
  handleReadUrl,
  type MediaEnv,
} from '../../../workers/whatsapp/src/media';

const KEY = 'walkthrough/11111111-2222-4333-8444-555555555500/0123456789abcdef0123456789abcdef.mp4';
const ORIGIN = 'https://worker.test';
const BYTES = new Uint8Array(64).fill(9);

function bucket(): NonNullable<MediaEnv['CLEANING_MEDIA']> {
  const stored = {
    size: BYTES.byteLength,
    httpEtag: '"etag"',
    httpMetadata: { contentType: 'video/mp4' },
    body: new Blob([BYTES]).stream(),
    range: undefined,
    writeHttpMetadata(headers: Headers) {
      headers.set('content-type', 'video/mp4');
    },
  };
  return {
    head: async (key: string) => (key === KEY ? stored : null),
    get: async (key: string) => (key === KEY ? stored : null),
  } as unknown as NonNullable<MediaEnv['CLEANING_MEDIA']>;
}

function env(over: Partial<MediaEnv> = {}): MediaEnv {
  return {
    SUPABASE_URL: 'https://db.test',
    SUPABASE_SECRET_KEY: 'secret',
    INTERNAL_SEND_TOKEN: 'send-token',
    CLEANING_MEDIA_KEY: 'media-key',
    CLEANING_MEDIA: bucket(),
    CLEANING_MEDIA_ORIGINS: 'https://app.test',
    ...over,
  };
}

const readUrlRequest = (token: string) =>
  new Request(`${ORIGIN}/cleaning-media/read-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-luxel-internal-token': token },
    body: JSON.stringify({ key: KEY }),
  });

async function mint(
  medium: MediaEnv,
  token = 'media-key',
): Promise<{ url: string; ticket: string }> {
  const res = await handleReadUrl(readUrlRequest(token), medium);
  expect(res.status).toBe(200);
  return (await res.json()) as { url: string; ticket: string };
}

const objectRequest = (init: { ticket?: string; query?: string }) =>
  new Request(`${ORIGIN}${CLEANING_MEDIA_OBJECT_PATH}${init.query ?? ''}`, {
    headers: init.ticket ? { [CLEANING_MEDIA_TICKET_HEADER]: init.ticket } : {},
  });

function decodeAll(ticket: string): string {
  const body = ticket.slice(ticket.indexOf('.') + 1);
  const padded = body.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return '';
  }
}

describe('cleaning media tickets', () => {
  it('hands back a ticket no one can read the object key out of', async () => {
    const { url, ticket } = await mint(env());

    expect(url).not.toContain(KEY);
    expect(url).not.toContain('walkthrough');
    expect(ticket).not.toContain(KEY);
    expect(decodeAll(ticket)).not.toContain('walkthrough/');
    expect(decodeAll(ticket)).not.toContain('.mp4');
    expect(new URL(url).searchParams.get('ticket')).toBe(ticket);
  });

  it('serves the object from the header, and still from the query the video tag needs', async () => {
    const medium = env();
    const { url, ticket } = await mint(medium);

    const viaHeader = await handleObjectGet(objectRequest({ ticket }), medium);
    expect(viaHeader.status).toBe(200);

    const viaQuery = await handleObjectGet(objectRequest({ query: new URL(url).search }), medium);
    expect(viaQuery.status).toBe(200);
  });

  it('refuses a ticket sealed under another media key, so a rotation revokes video access', async () => {
    const { ticket } = await mint(env());

    const rotated = env({ CLEANING_MEDIA_KEY: 'rotated-key' });
    expect((await handleObjectGet(objectRequest({ ticket }), rotated)).status).toBe(401);

    const stillFine = env();
    expect((await handleObjectGet(objectRequest({ ticket }), stillFine)).status).toBe(200);
  });

  it('falls back to the send token only while no media key is set', async () => {
    const fallback = env({ CLEANING_MEDIA_KEY: undefined });
    const { ticket } = await mint(fallback, 'send-token');
    expect((await handleObjectGet(objectRequest({ ticket }), fallback)).status).toBe(200);
    expect((await handleReadUrl(readUrlRequest('send-token'), fallback)).status).toBe(200);
  });

  it('stops taking the send token once a media key exists, so rotating it revokes video access', async () => {
    const both = env();
    expect((await handleReadUrl(readUrlRequest('media-key'), both)).status).toBe(200);
    expect((await handleReadUrl(readUrlRequest('send-token'), both)).status).toBe(401);
    expect((await handleReadUrl(readUrlRequest('nope'), both)).status).toBe(401);
  });

  it('refuses a mangled ticket and lets the browser send the ticket header', async () => {
    const medium = env();
    const { ticket } = await mint(medium);
    const mangled = `${ticket.slice(0, -2)}xy`;
    expect((await handleObjectGet(objectRequest({ ticket: mangled }), medium)).status).toBe(401);

    const cors = corsHeaders(
      medium,
      new Request(`${ORIGIN}${CLEANING_MEDIA_OBJECT_PATH}`, {
        headers: { origin: 'https://app.test' },
      }),
    );
    expect(cors.get('access-control-allow-headers')).toContain(CLEANING_MEDIA_TICKET_HEADER);
  });
});
