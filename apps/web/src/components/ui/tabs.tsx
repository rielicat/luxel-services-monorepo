'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabDef {
  id: string;
  label: ReactNode;
  badge?: number;
  content: ReactNode;
}

/** Lightweight tab bar: underline style, horizontal scroll on mobile, optional
 *  count badge per tab (e.g. threads needing a reply). */
export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="grid gap-4">
      <div role="tablist" className="border-border -mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === current?.id}
            onClick={() => setActive(t.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
              t.id === current?.id
                ? 'text-primary border-primary -mb-px border-b-2'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.badge ? (
              <span className="bg-warning/15 text-warning rounded-full px-1.5 text-xs font-semibold">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
