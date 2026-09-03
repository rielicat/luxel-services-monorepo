'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { updateGuestInfo } from './copilot-actions';

const HINTS = ['hint_wifi', 'hint_access', 'hint_quirks', 'hint_area'] as const;

export function ContextPanel({
  propertyId,
  guestInfo,
}: {
  propertyId: string;
  guestInfo: string | null;
}) {
  const t = useTranslations('context');
  const [info, setInfo] = useState(guestInfo ?? '');
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const dirty = info.trim() !== (guestInfo ?? '').trim();

  return (
    <Card>
      <CardContent className="grid gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="grid gap-1">
            <h2 className="font-display text-base font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground text-sm">{t('body')}</p>
          </div>
        </div>

        <textarea
          aria-label={t('title')}
          className="border-input bg-background focus-visible:ring-ring min-h-32 w-full rounded-md border p-3 text-sm focus-visible:outline-none focus-visible:ring-2"
          rows={5}
          maxLength={2000}
          value={info}
          onChange={(e) => {
            setInfo(e.target.value);
            setSaved(false);
            setFailed(false);
          }}
          placeholder={t('placeholder')}
        />

        <ul className="text-muted-foreground grid gap-1 text-xs">
          {HINTS.map((key) => (
            <li key={key}>· {t(key)}</li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="justify-self-start"
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => {
                const r = await updateGuestInfo({ propertyId, guestInfo: info });
                setSaved(r.ok);
                setFailed(!r.ok);
              })
            }
          >
            {saved ? t('saved') : t('save')}
          </Button>
          {failed && <p className="text-destructive text-xs font-medium">{t('failed')}</p>}
          <p className="text-muted-foreground text-xs">{t('optional')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
