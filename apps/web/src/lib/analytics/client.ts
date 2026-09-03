'use client';

import posthog from 'posthog-js';
import { scrubUrl } from '@/lib/observability/scrub';

const ANON_KEY = 'luxel.anon';
const SESSION_KEY = 'luxel.session';
const UTM_KEY = 'luxel.utm';

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function getAnonId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function captureUtm(): Record<string, string> | undefined {
  if (typeof window === 'undefined') return undefined;
  const stored = sessionStorage.getItem(UTM_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {}
  }
  const p = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const v = p.get(k);
    if (v) utm[k.replace('utm_', '')] = v.slice(0, 200);
  }
  if (Object.keys(utm).length) {
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    return utm;
  }
  return undefined;
}

export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  const safe: Record<string, unknown> = { ...properties };
  for (const key of ['$current_url', 'url', 'href']) {
    if (typeof safe[key] === 'string') safe[key] = scrubUrl(safe[key] as string);
  }

  try {
    if (posthog.__loaded) posthog.capture(event, safe);
  } catch {}

  try {
    const body = JSON.stringify({
      events: [
        {
          event,
          anonId: getAnonId(),
          sessionId: getSessionId(),
          path: scrubUrl(window.location.pathname),
          referrer: document.referrer ? scrubUrl(document.referrer) : undefined,
          utm: captureUtm(),
          properties: safe,
        },
      ],
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {}
}
