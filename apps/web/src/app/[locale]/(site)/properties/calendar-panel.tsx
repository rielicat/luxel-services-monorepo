'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarDays, RefreshCw, Trash2, Plus, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  addCalendarFeed,
  removeCalendarFeed,
  syncNow,
  addManualBlock,
  removeBlock,
  exportUrl,
} from './calendar-actions';

export type Feed = { id: string; label: string; ical_url: string; last_synced_at: string | null };
export type Block = {
  id: string;
  starts_on: string;
  ends_on: string;
  source: 'import' | 'manual';
  summary: string | null;
};

const inputCls =
  'flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CalendarPanel({
  propertyId,
  feeds,
  blocks,
}: {
  propertyId: string;
  feeds: Feed[];
  blocks: Block[];
}) {
  const t = useTranslations('properties');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feed, setFeed] = useState({ label: 'airbnb', url: '' });
  const [blk, setBlk] = useState({ startsOn: '', endsOn: '', summary: '' });
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const upcoming = [...blocks].sort((a, b) => a.starts_on.localeCompare(b.starts_on));

  const getExport = () =>
    start(async () => {
      const r = await exportUrl(propertyId);
      if (r.ok && r.url) setLink(`${window.location.origin}${r.url}`);
    });

  return (
    <div className="border-border grid gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <CalendarDays className="text-primary h-4 w-4" /> {t('calendar')}
      </div>

      {/* feeds */}
      <div className="grid gap-1.5">
        {feeds.map((f) => (
          <div
            key={f.id}
            className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
          >
            <span className="truncate">
              {f.label} · {f.last_synced_at ? t('synced') : t('never_synced')}
            </span>
            <button
              type="button"
              onClick={() => run(() => removeCalendarFeed(f.id))}
              disabled={pending}
              aria-label={t('remove')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder={t('feed_url_ph')}
            value={feed.url}
            onChange={(e) => setFeed((p) => ({ ...p, url: e.target.value }))}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !feed.url.trim()}
            onClick={() =>
              run(async () => {
                const r = await addCalendarFeed({
                  propertyId,
                  label: feed.label,
                  url: feed.url.trim(),
                });
                if (r.ok) setFeed({ label: 'airbnb', url: '' });
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {feeds.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => syncNow(propertyId))}
              aria-label={t('sync_now')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* blocks */}
      <div className="grid gap-1.5">
        {upcoming.length === 0 && <p className="text-muted-foreground text-xs">{t('no_blocks')}</p>}
        {upcoming.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">
              {b.starts_on} → {b.ends_on} ·{' '}
              {b.source === 'manual' ? t('block_manual') : b.summary || t('block_import')}
            </span>
            {b.source === 'manual' && (
              <button
                type="button"
                onClick={() => run(() => removeBlock(b.id))}
                disabled={pending}
                aria-label={t('remove')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">{t('block_from')}</Label>
            <input
              type="date"
              className={inputCls}
              value={blk.startsOn}
              onChange={(e) => setBlk((p) => ({ ...p, startsOn: e.target.value }))}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t('block_to')}</Label>
            <input
              type="date"
              className={inputCls}
              value={blk.endsOn}
              onChange={(e) => setBlk((p) => ({ ...p, endsOn: e.target.value }))}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !blk.startsOn || !blk.endsOn}
            onClick={() =>
              run(async () => {
                const r = await addManualBlock({
                  propertyId,
                  startsOn: blk.startsOn,
                  endsOn: blk.endsOn,
                  summary: blk.summary || undefined,
                });
                if (r.ok) setBlk({ startsOn: '', endsOn: '', summary: '' });
              })
            }
          >
            {t('add')}
          </Button>
        </div>
      </div>

      {/* export */}
      <div>
        {!link ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={getExport}>
            {t('export_feed')}
          </Button>
        ) : (
          <div className="bg-muted/50 flex items-center gap-2 rounded-md p-2 text-xs">
            <span className="truncate font-mono">{link}</span>
            <button
              type="button"
              className="text-primary shrink-0"
              aria-label={t('copy')}
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
        <p className="text-muted-foreground mt-1 text-xs">{t('export_help')}</p>
      </div>
    </div>
  );
}
