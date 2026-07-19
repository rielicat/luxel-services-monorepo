'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Copy, Check, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateGuestInfo, draftReply } from './copilot-actions';

const areaCls =
  'w-full rounded-md border border-input bg-background p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CopilotPanel({
  propertyId,
  guestInfo,
}: {
  propertyId: string;
  guestInfo: string | null;
}) {
  const t = useTranslations('copilot');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [info, setInfo] = useState(guestInfo ?? '');
  const [savedInfo, setSavedInfo] = useState(false);
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState<{ text: string; handoff: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const saveInfo = () =>
    start(async () => {
      const r = await updateGuestInfo({ propertyId, guestInfo: info });
      if (r.ok) {
        setSavedInfo(true);
        setTimeout(() => setSavedInfo(false), 2000);
        router.refresh();
      }
    });

  const doDraft = () =>
    start(async () => {
      setDraft(null);
      const r = await draftReply({ propertyId, guestMessage: msg.trim() });
      if (r.ok && r.reason === 'no_ai') setDraft({ text: t('no_ai'), handoff: true });
      else if (r.ok) setDraft({ text: r.draft ?? '', handoff: Boolean(r.handoff) });
      else setDraft({ text: t('error'), handoff: true });
    });

  return (
    <div className="border-border grid gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Bot className="text-primary h-4 w-4" /> {t('title')}
      </div>

      <div className="grid gap-1.5">
        <label className="text-muted-foreground text-xs">{t('info_label')}</label>
        <textarea
          className={areaCls}
          rows={3}
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          placeholder={t('info_ph')}
        />
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          disabled={pending}
          onClick={saveInfo}
        >
          {savedInfo ? t('info_saved') : t('info_save')}
        </Button>
      </div>

      <div className="grid gap-1.5">
        <label className="text-muted-foreground text-xs">{t('msg_label')}</label>
        <textarea
          className={areaCls}
          rows={2}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={t('msg_ph')}
        />
        <Button
          size="sm"
          className="justify-self-start"
          disabled={pending || !msg.trim()}
          onClick={doDraft}
        >
          {pending ? t('drafting') : t('draft')}
        </Button>
      </div>

      {draft && (
        <div className="bg-muted/50 grid gap-2 rounded-md p-2.5 text-sm">
          {draft.handoff && (
            <span className="text-warning flex items-center gap-1 text-xs">
              <TriangleAlert className="h-3.5 w-3.5" /> {t('handoff')}
            </span>
          )}
          {draft.text && <p className="whitespace-pre-wrap">{draft.text}</p>}
          {draft.text && (
            <button
              type="button"
              className="text-primary flex items-center gap-1 justify-self-start text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(draft.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{' '}
              {t('copy')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
