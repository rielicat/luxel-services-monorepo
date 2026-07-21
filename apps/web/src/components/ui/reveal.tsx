'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Reveals its children with a soft rise as they scroll into view (once).
 *  Pairs with the `.reveal` / `.is-visible` utilities in globals.css; SSR-safe
 *  and no-ops under prefers-reduced-motion. Pass `delay` (ms) to stagger. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('reveal', shown && 'is-visible', className)}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
