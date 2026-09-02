import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  '/account(.*)',
  '/book(.*)',
  '/properties(.*)',
  '/admin(.*)',
]);

const intlOnly = (req: NextRequest) => {
  if (req.nextUrl.pathname.startsWith('/api/')) return;
  return intlMiddleware(req);
};

const skipAuth = process.env.E2E_SKIP_AUTH === '1';

const GATE_COOKIE = 'luxel_gate';
const gateActive = process.env.NODE_ENV === 'production';
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
          if (req.nextUrl.pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const signInUrl = new URL('/sign-in', req.url);
          signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
          return NextResponse.redirect(signInUrl);
        }
      }
      if (req.nextUrl.pathname.startsWith('/api/')) return;
      return intlMiddleware(req);
    });

export default withStealthGate(inner);

export const config = {
  matcher: ['/((?!api/webhooks|_next|_vercel|monitoring|.*\\..*).*)'],
};
