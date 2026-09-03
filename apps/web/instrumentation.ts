import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@/lib/observability/scrub';

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const runtime = process.env.NEXT_RUNTIME;
  if (runtime !== 'nodejs' && runtime !== 'edge') return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
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

export const onRequestError = Sentry.captureRequestError;
