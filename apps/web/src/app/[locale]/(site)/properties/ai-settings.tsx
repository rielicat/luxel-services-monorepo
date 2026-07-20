'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setAiEnabled, updateGuestInfo } from './copilot-actions';

/** The host's two AI controls, nothing more: an on/off switch for automatic
 *  replies, and the property info the AI answers from. */
export function AiSettings({
  propertyId,
  aiEnabled,
  guestInfo,
}: {
  propertyId: string;
  aiEnabled: boolean;
  guestInfo: string | null;
}) {
  const t = useTranslations('ai');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(aiEnabled);
  const [info, setInfo] = useState(guestInfo ?? '');
  const [saved, setSaved] = useState(false);

  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await setAiEnabled({ propertyId, enabled: next });
      if (!r.ok) setOn(!next);
      router.refresh();
    });
  };

  return (
    <div className="border-border grid gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Bot className="text-primary mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{t('toggle_title')}</p>
            <p className="text-muted-foreground text-xs">{on ? t('on_body') : t('off_body')}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={pending}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
          />
        </button>
      </div>

      <div className="grid gap-1.5">
        <label className="text-muted-foreground text-xs font-medium">{t('info_label')}</label>
        <textarea
          className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          rows={4}
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          placeholder={t('info_ph')}
        />
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await updateGuestInfo({ propertyId, guestInfo: info });
              if (r.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }
            })
          }
        >
          {saved ? t('saved') : t('save')}
        </Button>
      </div>
    </div>
  );
}
