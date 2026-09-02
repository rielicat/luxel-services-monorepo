'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/client';

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

export function PostHogPageview() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) track('$pageview', { $current_url: window.location.href });
  }, [pathname]);
  return null;
}
