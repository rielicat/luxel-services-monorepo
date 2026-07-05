import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher(['/sign-in(.*)']);

// Everything except the sign-in flow requires a signed-in user. The per-layout
// requireAdmin() check then gates by the admin allow-list (domain or email).
// Signed-out visitors are redirected to the sign-in page rather than the bare
// 404 that auth.protect() returns by default.
export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });
});

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
