'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Consistent opt-in reveal: a quiet bordered row that opens into its content.
 *  Used for the optional/advanced blocks (extra AI context, ID requirements). */
export function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-border rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 p-3 text-left text-xs font-medium transition-colors"
      >
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-border/60 border-t p-3">{children}</div>}
    </div>
  );
}
