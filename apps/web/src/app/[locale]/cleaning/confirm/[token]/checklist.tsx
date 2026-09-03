'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import {
  CLEANING_CHECKLIST_STEPS,
  type CleaningChecklistStep,
} from '@luxel/shared/cleaning-inventory';
import { cn } from '@/lib/utils';
import { saveCleaningChecklist } from './actions';

export function CleaningChecklist({
  token,
  initial,
}: {
  token: string;
  initial: CleaningChecklistStep[];
}) {
  const t = useTranslations('crew.checklist');
  const [done, setDone] = useState<CleaningChecklistStep[]>(initial);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const toggle = (step: CleaningChecklistStep) => {
    const next = done.includes(step) ? done.filter((s) => s !== step) : [...done, step];
    setDone(next);
    setFailed(false);
    start(async () => {
      const saved = await saveCleaningChecklist(token, next);
      if (!saved.ok) setFailed(true);
    });
  };

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">{t('hint')}</p>
      <ul className="grid gap-2">
        {CLEANING_CHECKLIST_STEPS.map((step) => {
          const checked = done.includes(step);
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => toggle(step)}
                aria-pressed={checked}
                className={cn(
                  'border-border flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  checked ? 'border-primary/40 bg-primary/5' : 'hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                    checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {checked && <Check className="h-4 w-4" />}
                </span>
                <span className={cn(checked && 'text-muted-foreground line-through')}>
                  {t(step)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-xs">
        {failed
          ? t('error')
          : pending
            ? t('saving')
            : t('progress', { done: done.length, total: CLEANING_CHECKLIST_STEPS.length })}
      </p>
    </div>
  );
}
