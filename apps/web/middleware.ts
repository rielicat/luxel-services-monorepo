import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  '/(es)/cuenta(.*)',
  '/(es)/calendario(.*)',
  '/api/protected(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // Skip Next internals and static assets unless used in search params
    '/((?!api/webhooks|_next|_vercel|monitoring|.*\\..*).*)',
    // Always run for protected API routes
    '/api/protected(.*)',
  ],
};
