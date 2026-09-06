'use client';

import posthog from 'posthog-js';
import { posthogHost } from '@luxel/shared/posthog';
import { REPLAY_BLOCKED_PATHS, scrubUrl } from '@/lib/observability/scrub';
import { posthogKey } from '@/lib/posthog/key';

const URL_PROPERTIES = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
];

export function tokenBearing(pathname: string): boolean {
  return REPLAY_BLOCKED_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function sanitize(properties: Record<string, unknown>): Record<string, unknown> {
  for (const name of URL_PROPERTIES) {
    const value = properties[name];
    if (typeof value === 'string') properties[name] = scrubUrl(value);
  }
  return properties;
}

export function initPostHog(): void {
  if (typeof window === 'undefined' || posthog.__loaded) return;
  const key = posthogKey({
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  });
  if (!key || tokenBearing(window.location.pathname)) return;
  posthog.init(key, {
    api_host: posthogHost({ NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST }),
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    sanitize_properties: sanitize,
    loaded: (instance) => {
      if (process.env.NODE_ENV === 'development') instance.debug();
    },
  });
}
