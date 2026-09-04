import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest, type NextFetchEvent } from 'next/server';
import { tryToParsePath } from 'next/dist/lib/try-to-parse-path';

process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk';
process.env.CLERK_SECRET_KEY ??= 'sk_test_stubstubstubstubstubstubstubstub';
delete process.env.E2E_SKIP_AUTH;

type Middleware = (req: NextRequest, event: NextFetchEvent) => unknown;
type MiddlewareModule = { default: Middleware; config: { matcher: string[] } };

const event = { waitUntil: () => {} } as unknown as NextFetchEvent;

let middleware: Middleware;
let matches: (pathname: string) => boolean;

beforeAll(async () => {
  const mod = (await import('../src/middleware')) as MiddlewareModule;
  middleware = mod.default;
  const regexes = mod.config.matcher.map((m) => {
    const parsed = tryToParsePath(m);
    if (parsed.error || !parsed.regexStr) throw parsed.error ?? new Error(`bad matcher ${m}`);
    return new RegExp(parsed.regexStr, 'i');
  });
  matches = (pathname) => regexes.some((r) => r.test(pathname));
});

const run = async (pathname: string) =>
  (await middleware(new NextRequest(`http://localhost:3000${pathname}`), event)) as Response;

const servedPath = (res: Response, requested: string) => {
  const rewrite = res.headers.get('x-middleware-rewrite');
  return rewrite ? new URL(rewrite).pathname : requested;
};

describe('middleware matcher', () => {
  it.each([
    '/',
    '/es',
    '/account',
    '/api/events',
    '/favicon.ico',
    '/robots.txt',
    '/apple-touch-icon.png',
    '/.well-known/security.txt',
    '/wp-login.php',
  ])('covers %s', (pathname) => {
    expect(matches(pathname)).toBe(true);
  });

  it.each([
    '/_next/static/chunk.js',
    '/_vercel/insights/script.js',
    '/api/webhooks/clerk',
    '/monitoring',
  ])('skips %s', (pathname) => {
    expect(matches(pathname)).toBe(false);
  });
});

describe('clerk auth status on every matched request', () => {
  it.each(['/favicon.ico', '/robots.txt', '/wp-login.php'])(
    'decorates file-like %s without rewriting it',
    async (pathname) => {
      const res = await run(pathname);
      expect(res.headers.get('x-middleware-request-x-clerk-auth-status')).toBe('signed-out');
      expect(servedPath(res, pathname)).toBe(pathname);
    },
  );

  it('decorates and locale-rewrites the homepage', async () => {
    const res = await run('/');
    expect(res.headers.get('x-middleware-request-x-clerk-auth-status')).toBe('signed-out');
    expect(servedPath(res, '/')).toBe('/es');
  });

  it('redirects a protected page to sign-in', async () => {
    const res = await run('/account');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/sign-in');
  });

  it('decorates an API route without a locale rewrite', async () => {
    const res = await run('/api/events');
    expect(res.headers.get('x-middleware-request-x-clerk-auth-status')).toBe('signed-out');
    expect(servedPath(res, '/api/events')).toBe('/api/events');
  });

  it('leaves the crew walkthrough routes on the token, with no sign-in bounce', async () => {
    const token = '11111111-2222-4333-8444-555555555555';
    const page = await run(`/cleaning/confirm/${token}`);
    expect(page.status).not.toBe(307);
    expect(servedPath(page, `/cleaning/confirm/${token}`)).toBe(`/es/cleaning/confirm/${token}`);

    const api = await run('/api/cleaning/inventory');
    expect(api.status).not.toBe(307);
    expect(api.status).not.toBe(401);
    expect(servedPath(api, '/api/cleaning/inventory')).toBe('/api/cleaning/inventory');
  });

  it('keeps the legal pages reachable through the production stealth gate', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const gated = ((await import('../src/middleware')) as MiddlewareModule).default;
      const call = async (pathname: string) =>
        (await gated(new NextRequest(`http://localhost:3000${pathname}`), event)) as Response;

      for (const path of [
        '/privacy',
        '/es/privacy',
        '/privacy/',
        '/terms',
        '/es/terms',
        '/terms/',
      ]) {
        expect(servedPath(await call(path), path)).not.toContain('/gate');
      }
      expect(servedPath(await call('/calculator'), '/calculator')).toContain('/gate');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('leaves the legal pages public, with no sign-in bounce', async () => {
    for (const path of ['/privacy', '/terms']) {
      const res = await run(path);
      expect(res.status).not.toBe(307);
      expect(servedPath(res, path)).toBe(`/es${path}`);
    }
  });

  it('leaves the review callback on its own token, with no sign-in bounce', async () => {
    const res = await run('/api/cleaning/review');
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(401);
    expect(servedPath(res, '/api/cleaning/review')).toBe('/api/cleaning/review');
  });
});
