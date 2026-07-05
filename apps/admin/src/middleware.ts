import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher(['/sign-in(.*)']);

// Everything except the sign-in flow requires a signed-in user. The per-layout
// requireAdmin() check then gates by the admin-email allow-list.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
