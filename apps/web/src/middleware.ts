import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
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

/* TEMP stealth gate — remove before launch (see AGENTS.md § Temporary).
 * Production only: while the unlock cookie is absent, every PAGE request is
 * rewritten server-side to the gate route (app/[locale]/gate), so the gate
 * arrives fully rendered and unlocked visitors never see it — no client-side
 * flicker in either direction. API routes stay open (they were never gated). */
const GATE_COOKIE = 'luxel_gate';
const gateActive = process.env.NODE_ENV === 'production';
// Tokenized links sent to guests and cleaning crews — people who never got the
// unlock code. The token itself is the access control.
const isPublicTokenRoute = (pathname: string) => /^\/(checkin|cleaning\/confirm)\//.test(pathname);

const withStealthGate =
  (handler: (req: NextRequest, event: NextFetchEvent) => unknown) =>
  (req: NextRequest, event: NextFetchEvent) => {
    if (
      gateActive &&
      !req.nextUrl.pathname.startsWith('/api/') &&
      !isPublicTokenRoute(req.nextUrl.pathname) &&
      req.cookies.get(GATE_COOKIE)?.value !== '1'
    ) {
      return NextResponse.rewrite(new URL('/es/gate', req.url));
    }
    return handler(req, event);
  };

const inner = skipAuth
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

export default withStealthGate(inner);

export const config = {
  matcher: [
    // Skip Next internals and static assets unless used in search params
    '/((?!api/webhooks|_next|_vercel|monitoring|.*\\..*).*)',
    // Always run for protected API routes
    '/api/protected(.*)',
  ],
};
