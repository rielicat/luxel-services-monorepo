'use client';

/* ─────────────────────────────────────────────────────────────────────────
 * TEMPORARY STEALTH GATE — remove before public launch.
 *
 * While the product is in stealth, the DEPLOYED build shows a "restricted
 * access" screen over the whole app. There is no input field and no on-screen
 * hint about how to get in: it listens for keystrokes globally and unlocks the
 * moment the last digits typed match the code — no Enter needed. The unlock is
 * remembered per-browser.
 *
 * Access code: 0612
 * Scope: production only (`NODE_ENV === 'production'`) — local `next dev` is
 *   never gated. To LIFT the gate, delete this component + its mount in
 *   apps/web/src/app/[locale]/layout.tsx. See AGENTS.md § Temporary.
 *
 * NOT real security — the code and app content ship in the client bundle. It's
 * a soft curtain to keep casual visitors out during stealth.
 * ──────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';
import { LuxelMark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

const CODE = '0612';
const STORAGE_KEY = 'luxel.gate.v1';

export function StealthGate({ children }: { children: React.ReactNode }) {
  // Compile-time constant — the gate is stripped from behaviour in dev builds.
  const gateActive = process.env.NODE_ENV === 'production';
  const [unlocked, setUnlocked] = useState(false);
  const [count, setCount] = useState(0);
  const buffer = useRef('');

  useEffect(() => {
    if (!gateActive) return;
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      setUnlocked(true);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (!/^[0-9]$/.test(e.key)) return;
      // Rolling window of the last CODE.length digits — unlock the instant they
      // match, so there's no Enter and no obvious "submit" step.
      buffer.current = (buffer.current + e.key).slice(-CODE.length);
      setCount((c) => Math.min(c + 1, CODE.length));
      if (buffer.current === CODE) {
        localStorage.setItem(STORAGE_KEY, '1');
        setUnlocked(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gateActive]);

  if (!gateActive || unlocked) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 px-6 text-center text-white"
      style={{
        background: 'linear-gradient(145deg, hsl(174 74% 19%) 0%, hsl(178 88% 8%) 100%)',
      }}
    >
      <LuxelMark className="h-10 w-10" />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/50">
          Acceso restringido
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">Esta versión es privada</h1>
      </div>
      <div className="flex gap-2.5" aria-hidden>
        {Array.from({ length: CODE.length }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-colors',
              i < count ? 'bg-lime' : 'bg-white/15',
            )}
          />
        ))}
      </div>
    </div>
  );
}
