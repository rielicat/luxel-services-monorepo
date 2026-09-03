import * as Sentry from '@sentry/nextjs';
import { REPLAY_BLOCKED_PATHS, scrubBreadcrumb, scrubEvent } from '@/lib/observability/scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

function replayAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  return !REPLAY_BLOCKED_PATHS.some((prefix) => window.location.pathname.startsWith(prefix));
}

if (dsn) {
  const replay = replayAllowed();
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: replay ? 1.0 : 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    integrations: replay
      ? [
          Sentry.replayIntegration({
            maskAllText: true,
            maskAllInputs: true,
            blockAllMedia: true,
          }),
        ]
      : [],
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb) as typeof breadcrumb | null,
    beforeSend: (event) => {
      scrubEvent(event);
      return event;
    },
    beforeSendTransaction: (event) => {
      scrubEvent(event);
      return event;
    },
  });
}
