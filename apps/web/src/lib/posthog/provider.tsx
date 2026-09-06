'use client';

import posthog from 'posthog-js';
import { PostHogProvider as Provider } from 'posthog-js/react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { initPostHog, tokenBearing } from '@/lib/posthog/init';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSignedIn, userId } = useAuth();
  const blocked = tokenBearing(pathname);

  useEffect(() => {
    if (!blocked) initPostHog();
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
