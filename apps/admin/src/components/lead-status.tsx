'use client';

import { useState, useTransition } from 'react';
import { updateLeadStatus } from '@/app/(panel)/leads/actions';
import { cn } from '@/lib/utils';

const STATUSES = ['new', 'contacted', 'converted', 'lost'] as const;
const LABEL: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  converted: 'Convertido',
  lost: 'Perdido',
};
const TONE: Record<string, string> = {
  new: 'bg-warning/15 text-warning',
  contacted: 'bg-accent text-accent-foreground',
  converted: 'bg-success/15 text-success',
  lost: 'bg-muted text-muted-foreground',
};

export function LeadStatus({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-0.5">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const s = e.target.value;
          setValue(s);
          setFailed(false);
          startTransition(async () => {
            const r = await updateLeadStatus({ id, status: s });
            if (!r.ok) {
              setValue(status);
              setFailed(true);
            }
          });
        }}
        className={cn(
          'cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none',
          TONE[value] ?? 'bg-muted',
          pending && 'opacity-60',
          failed && 'ring-destructive ring-2',
        )}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {LABEL[s]}
          </option>
        ))}
      </select>
      {failed && (
        <span role="alert" className="text-destructive text-[11px] font-semibold">
          No se guardó
        </span>
      )}
    </div>
  );
}
