'use client';

import { useEffect, useRef, useState } from 'react';
import { LuxelMark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

const CODE = '0612';
const COOKIE = 'luxel_gate';
const LEGACY_KEY = 'luxel.gate.v1';

function unlock() {
  document.cookie = `${COOKIE}=1; path=/; max-age=31536000; samesite=lax; secure`;
  window.location.reload();
}

export default function GatePage() {
  const [count, setCount] = useState(0);
  const buffer = useRef('');

  useEffect(() => {
    if (localStorage.getItem(LEGACY_KEY) === '1') {
      unlock();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (!/^[0-9]$/.test(e.key)) return;
      buffer.current = (buffer.current + e.key).slice(-CODE.length);
      setCount((c) => Math.min(c + 1, CODE.length));
      if (buffer.current === CODE) unlock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
