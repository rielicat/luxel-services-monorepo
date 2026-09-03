import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CLEANING_MEDIA_OBJECT_PATH,
  CLEANING_MEDIA_TICKET_HEADER,
  READ_TICKET_TTL_SECONDS,
  UPLOAD_TICKET_TTL_SECONDS,
  WALKTHROUGH_KEY_PREFIX,
  WALKTHROUGH_MAX_BYTES,
  isWalkthroughContentType,
  isWalkthroughKey,
  walkthroughExtension,
  type WalkthroughContentType,
} from '@luxel/shared/cleaning-media';
import { deriveAesKey, openBase64Url, randomHex, sealBase64Url, timingSafeEqual } from './crypto';

export interface MediaEnv {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  INTERNAL_SEND_TOKEN?: string;
  CLEANING_MEDIA_KEY?: string;
  CLEANING_MEDIA?: R2Bucket;
  CLEANING_MEDIA_ORIGINS?: string;
  MEDIA_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

const TICKET_LABEL = 'luxel.cleaning-media.v2';
const TICKET_VERSION = 'v2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ORIGINS = ['https://serviciosluxel.cl', 'https://www.serviciosluxel.cl'];
const PURGE_BATCH = 200;
const RECONCILE_PAGES = 10;
const KNOWN_KEY_BATCH = 1000;
const KNOWN_KEY_PAGES = 50;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

type TicketOp = 'put' | 'get';

interface TicketPayload {
  o: TicketOp;
  k: string;
  c: string;
  m: number;
  e: number;
}

function allowedOrigins(env: MediaEnv): string[] {
  const raw = env.CLEANING_MEDIA_ORIGINS?.trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function corsHeaders(env: MediaEnv, req: Request): Headers {
  const headers = new Headers({ vary: 'Origin' });
  const origin = req.headers.get('origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, PUT, OPTIONS');
    headers.set('access-control-allow-headers', `content-type, ${CLEANING_MEDIA_TICKET_HEADER}`);
    headers.set('access-control-max-age', '600');
  }
  return headers;
}

function json(body: unknown, status: number, extra?: Headers): Response {
  const headers = new Headers(extra ?? undefined);
  headers.set('content-type', 'application/json');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function mediaSecret(env: MediaEnv): string | null {
  return env.CLEANING_MEDIA_KEY?.trim() || env.INTERNAL_SEND_TOKEN?.trim() || null;
}

function authorised(env: MediaEnv, req: Request): boolean {
  const token = req.headers.get('x-luxel-internal-token');
  const secret = mediaSecret(env);
  if (!token || !secret) return false;
  return timingSafeEqual(token, secret);
}

async function ticketKey(env: MediaEnv): Promise<CryptoKey | null> {
  const secret = mediaSecret(env);
  if (!secret) return null;
  return deriveAesKey(secret, TICKET_LABEL);
}

async function mintTicket(env: MediaEnv, payload: TicketPayload): Promise<string | null> {
  const key = await ticketKey(env);
  if (!key) return null;
  return `${TICKET_VERSION}.${await sealBase64Url(key, JSON.stringify(payload))}`;
}

export function ticketFrom(req: Request): string | null {
  const sent = req.headers.get(CLEANING_MEDIA_TICKET_HEADER);
  if (sent) return sent;
  return new URL(req.url).searchParams.get('ticket');
}

async function readTicket(
  env: MediaEnv,
  raw: string | null,
  op: TicketOp,
): Promise<TicketPayload | null> {
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot < 0 || raw.slice(0, dot) !== TICKET_VERSION) return null;
  const key = await ticketKey(env);
  if (!key) return null;
  const plain = await openBase64Url(key, raw.slice(dot + 1));
  if (!plain) return null;
  let payload: TicketPayload;
  try {
    payload = JSON.parse(plain) as TicketPayload;
  } catch {
    return null;
  }
  if (payload.o !== op) return null;
  if (!isWalkthroughKey(payload.k)) return null;
  if (!Number.isFinite(payload.e) || payload.e * 1000 <= Date.now()) return null;
  return payload;
}

async function limited(env: MediaEnv, key: string): Promise<boolean> {
  if (!env.MEDIA_LIMITER) return false;
  const { success } = await env.MEDIA_LIMITER.limit({ key });
  return !success;
}

function supabase(env: MediaEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

async function coverableCleaning(env: MediaEnv, cleaningId: string): Promise<boolean> {
  const { data } = await supabase(env)
    .from('cleanings')
    .select('id')
    .eq('id', cleaningId)
    .in('status', ['scheduled', 'done'])
    .maybeSingle();
  return Boolean(data);
}

export async function handleUploadUrl(req: Request, env: MediaEnv): Promise<Response> {
  if (!authorised(env, req)) return new Response('Unauthorized', { status: 401 });
  if (!env.CLEANING_MEDIA) return json({ error: 'media_unavailable' }, 503);

  let body: { cleaningId?: unknown; contentType?: unknown; bytes?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const cleaningId = typeof body.cleaningId === 'string' ? body.cleaningId.toLowerCase() : '';
  if (!UUID.test(cleaningId)) return json({ error: 'bad_cleaning_id' }, 400);
  if (await limited(env, `media:mint:${cleaningId}`)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  if (!isWalkthroughContentType(contentType)) return json({ error: 'bad_content_type' }, 400);

  const hinted = typeof body.bytes === 'number' && Number.isFinite(body.bytes) ? body.bytes : 0;
  if (hinted > WALKTHROUGH_MAX_BYTES) return json({ error: 'too_large' }, 413);
  const maxBytes = WALKTHROUGH_MAX_BYTES;

  if (!(await coverableCleaning(env, cleaningId))) {
    return json({ error: 'unknown_cleaning' }, 404);
  }

  const key = `${WALKTHROUGH_KEY_PREFIX}${cleaningId}/${randomHex(16)}.${walkthroughExtension(
    contentType as WalkthroughContentType,
  )}`;
  const expires = Math.floor(Date.now() / 1000) + UPLOAD_TICKET_TTL_SECONDS;
  const ticket = await mintTicket(env, {
    o: 'put',
    k: key,
    c: contentType,
    m: maxBytes,
    e: expires,
  });
  if (!ticket) return json({ error: 'media_unavailable' }, 503);

  const base = new URL(req.url).origin;
  return json(
    {
      key,
      uploadUrl: `${base}${CLEANING_MEDIA_OBJECT_PATH}?ticket=${encodeURIComponent(ticket)}`,
      ticket,
      expiresAt: new Date(expires * 1000).toISOString(),
      maxBytes,
    },
    200,
  );
}

export async function handleReadUrl(req: Request, env: MediaEnv): Promise<Response> {
  if (!authorised(env, req)) return new Response('Unauthorized', { status: 401 });
  if (!env.CLEANING_MEDIA) return json({ error: 'media_unavailable' }, 503);

  let body: { key?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const key = typeof body.key === 'string' ? body.key : '';
  if (!isWalkthroughKey(key)) return json({ error: 'bad_key' }, 400);

  const head = await env.CLEANING_MEDIA.head(key);
  if (!head) return json({ error: 'not_found' }, 404);

  const expires = Math.floor(Date.now() / 1000) + READ_TICKET_TTL_SECONDS;
  const ticket = await mintTicket(env, {
    o: 'get',
    k: key,
    c: head.httpMetadata?.contentType ?? 'application/octet-stream',
    m: head.size,
    e: expires,
  });
  if (!ticket) return json({ error: 'media_unavailable' }, 503);

  const base = new URL(req.url).origin;
  return json(
    {
      url: `${base}${CLEANING_MEDIA_OBJECT_PATH}?ticket=${encodeURIComponent(ticket)}`,
      ticket,
      expiresAt: new Date(expires * 1000).toISOString(),
    },
    200,
  );
}

export async function handleObjectPut(req: Request, env: MediaEnv): Promise<Response> {
  const cors = corsHeaders(env, req);
  if (!env.CLEANING_MEDIA) return json({ error: 'media_unavailable' }, 503, cors);

  const ticket = await readTicket(env, ticketFrom(req), 'put');
  if (!ticket) return json({ error: 'bad_ticket' }, 401, cors);
  if (await limited(env, `media:put:${ticket.k}`)) {
    return new Response('Too Many Requests', { status: 429, headers: cors });
  }

  const sent = req.headers.get('content-type')?.split(';')[0]?.trim();
  if (sent && sent !== ticket.c) return json({ error: 'content_type_mismatch' }, 400, cors);

  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0)
    return json({ error: 'length_required' }, 411, cors);
  if (declared > ticket.m) return json({ error: 'too_large' }, 413, cors);
  if (!req.body) return json({ error: 'empty' }, 400, cors);

  const stored = await env.CLEANING_MEDIA.put(ticket.k, req.body, {
    httpMetadata: { contentType: ticket.c, cacheControl: 'private, no-store' },
  });
  if (!stored) return json({ error: 'store_failed' }, 502, cors);
  if (stored.size > ticket.m) {
    await env.CLEANING_MEDIA.delete(ticket.k);
    return json({ error: 'too_large' }, 413, cors);
  }

  return json({ key: ticket.k, bytes: stored.size, contentType: ticket.c }, 200, cors);
}

function contentRange(range: R2Range | undefined, size: number): { start: number; length: number } {
  if (!range) return { start: 0, length: size };
  if ('suffix' in range) {
    const length = Math.min(range.suffix, size);
    return { start: size - length, length };
  }
  const start = range.offset ?? 0;
  const length = range.length ?? size - start;
  return { start, length };
}

export async function handleObjectGet(req: Request, env: MediaEnv): Promise<Response> {
  const cors = corsHeaders(env, req);
  if (!env.CLEANING_MEDIA) return json({ error: 'media_unavailable' }, 503, cors);

  const ticket = await readTicket(env, ticketFrom(req), 'get');
  if (!ticket) return json({ error: 'bad_ticket' }, 401, cors);
  if (await limited(env, `media:get:${ticket.k}`)) {
    return new Response('Too Many Requests', { status: 429, headers: cors });
  }

  const wantsRange = req.headers.has('range');
  const object = await env.CLEANING_MEDIA.get(
    ticket.k,
    wantsRange ? { range: req.headers } : undefined,
  );
  if (!object) return json({ error: 'not_found' }, 404, cors);

  const headers = new Headers(cors);
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, no-store');
  headers.set('accept-ranges', 'bytes');

  if (wantsRange && object.range) {
    const { start, length } = contentRange(object.range, object.size);
    headers.set('content-range', `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}

export function handleObjectPreflight(env: MediaEnv, req: Request): Response {
  const headers = corsHeaders(env, req);
  return new Response(null, { status: 204, headers });
}

async function deleteObject(bucket: R2Bucket, key: string): Promise<boolean> {
  if (!isWalkthroughKey(key)) return false;
  try {
    await bucket.delete(key);
    return true;
  } catch {
    return false;
  }
}

async function purgeRows(db: SupabaseClient, bucket: R2Bucket): Promise<number> {
  const { data } = await db
    .from('cleaning_walkthrough')
    .select('id, object_key')
    .not('object_key', 'is', null)
    .lte('retention_until', new Date().toISOString())
    .limit(PURGE_BATCH);
  const rows = (data ?? []) as Array<{ id: string; object_key: string }>;

  let purged = 0;
  for (const row of rows) {
    if (!(await deleteObject(bucket, row.object_key))) continue;
    const { error } = await db
      .from('cleaning_walkthrough')
      .update({ object_key: null, status: 'purged', purged_at: new Date().toISOString() })
      .eq('id', row.id);
    if (!error) purged += 1;
  }
  return purged;
}

async function drainTombstones(db: SupabaseClient, bucket: R2Bucket): Promise<number> {
  const { data } = await db.from('media_tombstone').select('id, object_key').limit(PURGE_BATCH);
  const rows = (data ?? []) as Array<{ id: string; object_key: string }>;

  let purged = 0;
  for (const row of rows) {
    if (!isWalkthroughKey(row.object_key)) {
      await db.from('media_tombstone').delete().eq('id', row.id);
      continue;
    }
    if (!(await deleteObject(bucket, row.object_key))) continue;
    const { error } = await db.from('media_tombstone').delete().eq('id', row.id);
    if (!error) purged += 1;
  }
  return purged;
}

async function knownWalkthroughKeys(db: SupabaseClient): Promise<Set<string> | null> {
  const known = new Set<string>();
  for (let page = 0; page < KNOWN_KEY_PAGES; page += 1) {
    const from = page * KNOWN_KEY_BATCH;
    const { data, error } = await db
      .from('cleaning_walkthrough')
      .select('object_key')
      .not('object_key', 'is', null)
      .range(from, from + KNOWN_KEY_BATCH - 1);
    if (error) return null;
    const rows = (data ?? []) as Array<{ object_key: string }>;
    for (const row of rows) known.add(row.object_key);
    if (rows.length < KNOWN_KEY_BATCH) return known;
  }
  return null;
}

async function reconcileOrphans(db: SupabaseClient, bucket: R2Bucket): Promise<number> {
  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  let cursor: string | undefined;
  let purged = 0;

  const known = await knownWalkthroughKeys(db);
  if (!known) return purged;

  for (let page = 0; page < RECONCILE_PAGES; page += 1) {
    const listed = await bucket.list({
      prefix: WALKTHROUGH_KEY_PREFIX,
      limit: PURGE_BATCH,
      cursor,
    });
    const candidates = listed.objects
      .filter((object) => object.uploaded.getTime() < cutoff)
      .map((object) => object.key)
      .filter(isWalkthroughKey);

    if (candidates.length) {
      for (const key of candidates) {
        if (known.has(key)) continue;
        if (await deleteObject(bucket, key)) purged += 1;
      }
    }

    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
  return purged;
}

async function purgeDraftText(db: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  const { data } = await db
    .from('cleaning_inventory_draft')
    .select('id')
    .lte('retention_until', now)
    .is('purged_at', null)
    .limit(PURGE_BATCH);
  const rows = (data ?? []) as Array<{ id: string }>;
  if (!rows.length) return;
  await db
    .from('cleaning_inventory_draft')
    .update({ items: [], differences: [], purged_at: now })
    .in(
      'id',
      rows.map((row) => row.id),
    );
}

async function purgeReviewText(db: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  const { data } = await db
    .from('cleaning_review')
    .select('id, findings')
    .lte('retention_until', now)
    .is('purged_at', null)
    .limit(PURGE_BATCH);
  const rows = (data ?? []) as Array<{ id: string; findings: unknown }>;

  for (const row of rows) {
    const findings = Array.isArray(row.findings) ? row.findings : [];
    const stripped = findings.map((finding) => {
      const { detail: _detail, ...rest } = (finding ?? {}) as Record<string, unknown>;
      return rest;
    });
    await db
      .from('cleaning_review')
      .update({ findings: stripped, purged_at: now })
      .eq('id', row.id);
  }
}

export async function purgeExpiredWalkthroughs(env: MediaEnv): Promise<number> {
  const bucket = env.CLEANING_MEDIA;
  if (!bucket) return 0;
  const db = supabase(env);

  const purged =
    (await purgeRows(db, bucket)) +
    (await drainTombstones(db, bucket)) +
    (await reconcileOrphans(db, bucket));

  await purgeDraftText(db);
  await purgeReviewText(db);

  return purged;
}
