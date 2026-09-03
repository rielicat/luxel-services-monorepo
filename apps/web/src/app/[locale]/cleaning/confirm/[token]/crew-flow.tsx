'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ClipboardList, PackageSearch, Video } from 'lucide-react';
import { CLEANING_CHECKLIST_STEPS } from '@luxel/shared/cleaning-inventory';
import type { CrewState } from '@luxel/core/cleaning/inventory';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { loadCrewState } from './actions';
import { CleaningChecklist } from './checklist';
import { InventoryForm } from './inventory-form';
import { WalkthroughRecorder } from './recorder';

const POLL_MS = 4_000;
const POLL_TRIES = 20;

type Stage = 'checklist' | 'video' | 'inventory' | 'done';

const STAGES = [
  { id: 'checklist', Icon: ClipboardList, key: 'stepChecklist' },
  { id: 'video', Icon: Video, key: 'stepVideo' },
  { id: 'inventory', Icon: PackageSearch, key: 'stepInventory' },
] as const;

const startingStage = (state: CrewState): Stage => {
  if (state.confirmed) return 'done';
  if (state.walkthrough) return 'inventory';
  return state.steps.length >= CLEANING_CHECKLIST_STEPS.length ? 'video' : 'checklist';
};

export function CrewFlow({
  token,
  initial,
  captureEnabled,
  aiEnabled,
}: {
  token: string;
  initial: CrewState;
  captureEnabled: boolean;
  aiEnabled: boolean;
}) {
  const t = useTranslations('crew');
  const finished = useTranslations('crew.finished');
  const [state, setState] = useState<CrewState>(initial);
  const [stage, setStage] = useState<Stage>(startingStage(initial));
  const [recording, setRecording] = useState(false);
  const polling = useRef(false);
  const kicked = useRef(false);

  const refresh = useCallback(async () => {
    const next = await loadCrewState(token);
    if (next) setState(next);
    return next;
  }, [token]);

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    for (let attempt = 0; attempt < POLL_TRIES; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const next = await refresh();
      if (!next?.draft || next.draft.status !== 'pending') break;
    }
    polling.current = false;
  }, [refresh]);

  const runAnalysis = useCallback(async () => {
    if (!aiEnabled) return;
    try {
      const res = await fetch('/api/cleaning/inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      if (body?.status && body.status !== 'pending') {
        await refresh();
        return;
      }
    } catch {}
    await poll();
  }, [aiEnabled, poll, refresh, token]);

  useEffect(() => {
    if (kicked.current || state.confirmed || !state.walkthrough) return;
    if (state.draft && state.draft.status !== 'pending') return;
    kicked.current = true;
    void runAnalysis();
  }, [runAnalysis, state.confirmed, state.draft, state.walkthrough]);

  const onUploaded = useCallback(() => {
    kicked.current = true;
    setStage('inventory');
    void refresh().then(() => runAnalysis());
  }, [refresh, runAnalysis]);

  const onRecordingChange = useCallback((value: boolean) => setRecording(value), []);

  if (stage === 'done' && state.confirmed && !recording) {
    const confirmed = state.confirmed;
    return (
      <div className="grid gap-3">
        <p className="text-success flex items-center gap-2 text-base font-semibold">
          <CheckCircle2 className="h-5 w-5" /> {finished('title')}
        </p>
        <p className="text-muted-foreground text-sm">{finished('body')}</p>
        <p className="text-muted-foreground text-sm">
          {finished('items', { count: confirmed.items.length })}
        </p>
        <ul className="border-border grid gap-1 rounded-xl border p-3 text-sm">
          {confirmed.items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
              <span>{[item.room, item.name].filter(Boolean).join(' · ')}</span>
              <span className="text-muted-foreground shrink-0">{item.observed}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-1.5">
        {STAGES.map(({ id, Icon, key }) => (
          <button
            key={id}
            type="button"
            disabled={recording && id !== 'video'}
            onClick={() => setStage(id)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-40',
              stage === id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {t(key)}
          </button>
        ))}
      </div>
      {recording && <p className="text-muted-foreground text-sm">{t('video.stopFirst')}</p>}

      <div className={stage === 'checklist' ? undefined : 'hidden'}>
        <div className="grid gap-4">
          <h2 className="font-display text-base font-semibold">{t('checklist.title')}</h2>
          <CleaningChecklist token={token} initial={state.steps} />
          <Button size="lg" onClick={() => setStage('video')}>
            {t('checklist.next')}
          </Button>
        </div>
      </div>

      <div className={stage === 'video' ? undefined : 'hidden'}>
        <div className="grid gap-4">
          <h2 className="font-display text-base font-semibold">{t('video.title')}</h2>
          <WalkthroughRecorder
            token={token}
            enabled={captureEnabled}
            uploadedBytes={state.walkthrough?.bytes ?? null}
            onRecordingChange={onRecordingChange}
            onUploaded={onUploaded}
          />
          <Button
            size="lg"
            variant="outline"
            disabled={recording}
            onClick={() => setStage('inventory')}
          >
            {state.walkthrough ? t('video.next') : t('video.skip')}
          </Button>
        </div>
      </div>

      <div className={stage === 'inventory' ? undefined : 'hidden'}>
        <div className="grid gap-4">
          <h2 className="font-display text-base font-semibold">{t('inventory.title')}</h2>
          <InventoryForm
            token={token}
            draftStatus={state.draft?.status ?? (aiEnabled ? null : 'unavailable')}
            draftItems={state.draft?.status === 'ready' ? state.draft.items : []}
            differences={state.draft?.status === 'ready' ? state.draft.differences : []}
            blocked={recording}
            blockedNote={t('video.stopFirst')}
            onConfirmed={() => {
              void refresh().then(() => setStage('done'));
            }}
          />
        </div>
      </div>
    </div>
  );
}
