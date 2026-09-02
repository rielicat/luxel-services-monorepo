import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher(['/account(.*)', '/properties(.*)', '/admin(.*)']);

const isApiRoute = (pathname: string) => pathname.startsWith('/api/');
const isFileRoute = (pathname: string) => pathname.includes('.');
const isPageRoute = (pathname: string) => !isApiRoute(pathname) && !isFileRoute(pathname);

const intlOnly = (req: NextRequest) => {
  if (!isPageRoute(req.nextUrl.pathname)) return;
  return intlMiddleware(req);
};

const skipAuth = process.env.E2E_SKIP_AUTH === '1';

const GATE_COOKIE = 'luxel_gate';
const gateActive = process.env.NODE_ENV === 'production';
const isPublicTokenRoute = (pathname: string) => /^\/(checkin|cleaning\/confirm)\//.test(pathname);

const withStealthGate =
  (handler: (req: NextRequest, event: NextFetchEvent) => unknown) =>
  (req: NextRequest, event: NextFetchEvent) => {
    const { pathname } = req.nextUrl;
    if (
      gateActive &&
      isPageRoute(pathname) &&
      !isPublicTokenRoute(pathname) &&
      req.cookies.get(GATE_COOKIE)?.value !== '1'
    ) {
      return NextResponse.rewrite(new URL('/es/gate', req.url));
    }
    return handler(req, event);
  };

const inner = skipAuth
  ? intlOnly
  : clerkMiddleware(async (auth, req) => {
      const { pathname } = req.nextUrl;
      if (isProtectedRoute(req)) {
        const { userId } = await auth();
        if (!userId) {
          if (isApiRoute(pathname)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const signInUrl = new URL('/sign-in', req.url);
          signInUrl.searchParams.set('redirect_url', pathname + req.nextUrl.search);
          return NextResponse.redirect(signInUrl);
        }
      }
      if (!isPageRoute(pathname)) return;
      return intlMiddleware(req);
    });

export default withStealthGate(inner);

export const config = {
  matcher: ['/((?!api/webhooks|_next|_vercel|monitoring).*)'],
};
