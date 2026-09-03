'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { updateProfileAction } from './actions';

export function ProfileForm({
  initial,
}: {
  initial: { email: string; full_name: string | null; phone: string | null };
}) {
  const t = useTranslations('account.profile');
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <form
      className="grid gap-5 p-6"
      action={(fd) =>
        startTransition(async () => {
          setFailed(false);
          const r = await updateProfileAction(fd);
          if (r.ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          } else {
            setFailed(true);
          }
        })
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="full_name">{t('name')}</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={initial.full_name ?? ''}
            placeholder={t('name_placeholder')}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder={t('phone_placeholder')}
            defaultValue={initial.phone ?? ''}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="w-fit">
          {t('save')}
        </Button>
        {saved && <span className="text-sm text-emerald-600">{t('saved')}</span>}
        {failed && <span className="text-destructive text-sm">{t('error')}</span>}
      </div>
    </form>
  );
}
