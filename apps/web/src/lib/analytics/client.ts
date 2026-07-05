'use client';

import posthog from 'posthog-js';

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

/** Stable per-browser id (localStorage) — used to count unique visitors. */
export function getAnonId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

/** Per-tab session id (sessionStorage). */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** First-touch UTM params, remembered for the session. */
function captureUtm(): Record<string, string> | undefined {
  if (typeof window === 'undefined') return undefined;
  const stored = sessionStorage.getItem(UTM_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      /* fall through */
    }
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

/**
 * Track an event to our OWNED store (analytics_events via /api/events) and,
 * if configured, PostHog. No-ops safely on the server / when unavailable.
 */
export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  try {
    if (posthog.__loaded) posthog.capture(event, properties);
  } catch {
    /* ignore */
  }

  try {
    const body = JSON.stringify({
      events: [
        {
          event,
          anonId: getAnonId(),
          sessionId: getSessionId(),
          path: window.location.pathname,
          referrer: document.referrer || undefined,
          utm: captureUtm(),
          properties,
        },
      ],
    });
    // sendBeacon survives page unload and includes same-origin cookies.
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
  } catch {
    /* best-effort */
  }
}
