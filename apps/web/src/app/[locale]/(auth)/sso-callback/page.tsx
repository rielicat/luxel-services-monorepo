'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { safeRedirect } from '@/components/auth/clerk-error';

function Callback() {
  const to = safeRedirect(useSearchParams().get('redirect_url'));
  return (
    <AuthenticateWithRedirectCallback signInForceRedirectUrl={to} signUpForceRedirectUrl={to} />
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense fallback={null}>
      <Callback />
    </Suspense>
  );
}
