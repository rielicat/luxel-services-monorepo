'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmCleaningAttendance } from './actions';

export function ConfirmButton({ token }: { token: string }) {
  const t = useTranslations('crew');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');

  if (state === 'done') {
    return (
      <p className="text-success flex items-center gap-2 text-base font-semibold">
        <CheckCircle2 className="h-5 w-5" /> {t('confirmed')}
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await confirmCleaningAttendance(token);
            setState(r.ok ? 'done' : 'error');
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? t('confirming') : t('confirm')}
      </Button>
      {state === 'error' && <p className="text-warning text-sm">{t('error')}</p>}
    </div>
  );
}
