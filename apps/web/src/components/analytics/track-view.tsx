'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/client';

/** Fires a one-shot event when mounted (e.g. account_viewed). */
export function TrackView({
  event,
  properties,
}: {
  event: string;
  properties?: Record<string, unknown>;
}) {
  useEffect(() => {
    track(event, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}

/** Captures $pageview on every path change (capture_pageview is off in the provider). */
export function PostHogPageview() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) track('$pageview', { $current_url: window.location.href });
  }, [pathname]);
  return null;
}
