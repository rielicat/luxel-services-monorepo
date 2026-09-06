import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher(['/account(.*)', '/properties(.*)']);

const isApiRoute = (pathname: string) => pathname.startsWith('/api/');
const isAgentRoute = (pathname: string) => pathname === '/eve' || pathname.startsWith('/eve/');
const isFileRoute = (pathname: string) => pathname.includes('.');
const isPageRoute = (pathname: string) =>
  !isApiRoute(pathname) && !isAgentRoute(pathname) && !isFileRoute(pathname);

const intlOnly = (req: NextRequest) => {
  if (!isPageRoute(req.nextUrl.pathname)) return;
  return intlMiddleware(req);
};

const skipAuth = process.env.E2E_SKIP_AUTH === '1';

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

export default inner;

export const config = {
  matcher: ['/((?!api/webhooks|eve|_next|_vercel|monitoring).*)'],
};
