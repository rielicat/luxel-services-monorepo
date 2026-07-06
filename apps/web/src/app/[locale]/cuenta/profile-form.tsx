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

  return (
    <form
      className="grid gap-4 sm:max-w-md"
      action={(fd) =>
        startTransition(async () => {
          const r = await updateProfileAction(fd);
          if (r.ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }
        })
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" value={initial.email} disabled />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="full_name">{t('name')}</Label>
        <Input id="full_name" name="full_name" defaultValue={initial.full_name ?? ''} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">{t('phone')}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="+56 9 ..."
          defaultValue={initial.phone ?? ''}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="w-fit">
          {t('save')}
        </Button>
        {saved && <span className="text-sm text-emerald-600">{t('saved')}</span>}
      </div>
    </form>
  );
}
