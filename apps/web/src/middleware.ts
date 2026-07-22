import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// URLs are locale-prefix-free (see i18n/routing.ts). Match user-facing paths directly.
const isProtectedRoute = createRouteMatcher([
  '/account(.*)',
  '/calendar(.*)',
  '/book(.*)',
  '/properties(.*)',
  '/api/protected(.*)',
]);

const intlOnly = (req: NextRequest) => {
  if (req.nextUrl.pathname.startsWith('/api/')) return;
  return intlMiddleware(req);
};

// E2E smoke tests drive the dev server with stub Clerk creds, whose dev-browser
// handshake can't complete (the stub publishable key points at a FAPI host that
// doesn't exist) and 400s every browser navigation. The smoke suite only hits
// public routes, so we skip Clerk there. Set ONLY by the CI e2e job — never in
// production (Vercel never sets it), so real auth is always enforced in prod.
const skipAuth = process.env.E2E_SKIP_AUTH === '1';

export default skipAuth
  ? intlOnly
  : clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        const { userId } = await auth();
        if (!userId) {
          // auth.protect()'s default redirect resolves the sign-in URL via
          // requestState.signInUrl → NEXT_PUBLIC_CLERK_SIGN_IN_URL, which is
          // unset on Vercel prod, so it falls back to Clerk's hosted Account
          // Portal. Build the redirect to our own /sign-in explicitly instead.
          if (req.nextUrl.pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const signInUrl = new URL('/sign-in', req.url);
          signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
          return NextResponse.redirect(signInUrl);
        }
      }
      // API routes are not locale-aware — skip intl middleware
      if (req.nextUrl.pathname.startsWith('/api/')) return;
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
