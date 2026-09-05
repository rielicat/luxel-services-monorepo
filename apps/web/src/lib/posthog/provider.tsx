'use client';

import posthog from 'posthog-js';
import { PostHogProvider as Provider } from 'posthog-js/react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { REPLAY_BLOCKED_PATHS, scrubUrl } from '@/lib/observability/scrub';

const URL_PROPERTIES = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
];

function tokenBearing(pathname: string): boolean {
  return REPLAY_BLOCKED_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function sanitize(properties: Record<string, unknown>): Record<string, unknown> {
  for (const name of URL_PROPERTIES) {
    const value = properties[name];
    if (typeof value === 'string') properties[name] = scrubUrl(value);
  }
  return properties;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSignedIn, userId } = useAuth();
  const blocked = tokenBearing(pathname);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || blocked || posthog.__loaded) return;
    posthog.init(key, {
      api_host: '/ingest',
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
  }, [blocked]);

  useEffect(() => {
    if (!posthog.__loaded || blocked) return;
    if (isSignedIn && userId) {
      if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
      return;
    }
    if (isSignedIn === false && posthog.get_distinct_id()?.startsWith('user_')) posthog.reset();
  }, [blocked, isSignedIn, userId]);

  return <Provider client={posthog}>{children}</Provider>;
}
