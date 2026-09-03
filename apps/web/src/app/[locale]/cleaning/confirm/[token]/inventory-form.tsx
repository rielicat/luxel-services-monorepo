'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  INVENTORY_CONDITIONS,
  INVENTORY_MAX_ITEMS,
  type InventoryCondition,
  type InventoryDifference,
  type InventoryItem,
} from '@luxel/shared/cleaning-inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirmCleaningInventory } from './actions';

const blank = (): InventoryItem => ({
  room: '',
  name: '',
  expected: null,
  observed: 1,
  condition: 'ok',
  note: null,
});

export interface InventoryFormProps {
  token: string;
  draftStatus: 'pending' | 'ready' | 'unavailable' | 'failed' | null;
  draftItems: InventoryItem[];
  differences: InventoryDifference[];
  onConfirmed: () => void;
  blocked?: boolean;
  blockedNote?: string;
}

export function InventoryForm({
  token,
  draftStatus,
  draftItems,
  differences,
  onConfirmed,
  blocked = false,
  blockedNote,
}: InventoryFormProps) {
  const t = useTranslations('crew.inventory');
  const conditions = useTranslations('crew.condition');
  const [items, setItems] = useState<InventoryItem[]>(draftItems.length ? draftItems : [blank()]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const touched = useRef(draftItems.length > 0);

  useEffect(() => {
    if (touched.current || !draftItems.length) return;
    touched.current = true;
    setItems(draftItems);
  }, [draftItems]);

  const patch = (index: number, change: Partial<InventoryItem>) => {
    touched.current = true;
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));
  };

  const remove = (index: number) => {
    touched.current = true;
    setItems((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  };

  const add = () => {
    touched.current = true;
    setItems((current) =>
      current.length >= INVENTORY_MAX_ITEMS ? current : [...current, blank()],
    );
  };

  const submit = () => {
    const filled = items.filter((item) => item.name.trim().length > 0);
    if (!filled.length) {
      setProblem('empty');
      return;
    }
    setProblem(null);
    start(async () => {
      const result = await confirmCleaningInventory(token, filled, note, name);
      if (result.ok) onConfirmed();
      else setProblem(result.error === 'empty' ? 'empty' : 'error');
    });
  };

  return (
    <div className="grid gap-4">
      {draftStatus === 'pending' && (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> {t('analysing')}
        </p>
      )}
      {draftStatus === 'ready' && (
        <p className="text-primary flex items-start gap-2 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" /> {t('ready')}
        </p>
      )}
      {draftStatus === 'unavailable' && (
        <p className="text-muted-foreground text-sm">{t('unavailable')}</p>
      )}
      {draftStatus === 'failed' && <p className="text-muted-foreground text-sm">{t('failed')}</p>}
      <p className="text-muted-foreground text-xs">{t('draft')}</p>

      {differences.length > 0 && (
        <div className="border-warning/40 bg-warning/5 grid gap-1 rounded-xl border p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> {t('differences')}
          </p>
          <ul className="text-muted-foreground grid gap-1 text-sm">
            {differences.map((difference, index) => (
              <li key={`${difference.name}-${index}`}>
                {[difference.room, difference.name].filter(Boolean).join(' · ')}
                {difference.detail ? ` — ${difference.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="grid gap-3">
        {items.map((item, index) => (
          <li key={index} className="border-border grid gap-2 rounded-xl border p-3">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-2">
                <Input
                  value={item.name}
                  placeholder={t('item')}
                  aria-label={t('item')}
                  onChange={(event) => patch(index, { name: event.target.value })}
                />
                <Input
                  value={item.room}
                  placeholder={t('room')}
                  aria-label={t('room')}
                  onChange={(event) => patch(index, { room: event.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t('remove')}
                className="text-muted-foreground hover:text-destructive mt-1 p-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-muted-foreground text-xs">{t('observed')}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  value={item.observed}
                  onChange={(event) =>
                    patch(index, { observed: Math.max(0, Number(event.target.value) || 0) })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-muted-foreground text-xs">{t('condition')}</Label>
                <select
                  value={item.condition}
                  onChange={(event) =>
                    patch(index, { condition: event.target.value as InventoryCondition })
                  }
                  className="border-input bg-card h-10 rounded-lg border px-3 text-sm"
                >
                  {INVENTORY_CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {conditions(condition)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {item.expected !== null && (
              <p className="text-muted-foreground text-xs">
                {t('expected')}: {item.expected}
              </p>
            )}
            <Input
              value={item.note ?? ''}
              placeholder={t('note')}
              aria-label={t('note')}
              onChange={(event) => patch(index, { note: event.target.value || null })}
            />
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" onClick={add}>
        <Plus className="h-4 w-4" /> {t('add')}
      </Button>

      <div className="grid gap-2">
        <Label htmlFor="crew-name">{t('name')}</Label>
        <Input
          id="crew-name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        <Label htmlFor="crew-note">{t('comment')}</Label>
        <Input
          id="crew-note"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {blocked && blockedNote && <p className="text-warning text-sm">{blockedNote}</p>}
      <Button size="lg" disabled={pending || blocked} onClick={submit}>
        {pending ? t('confirming') : t('confirm')}
      </Button>
      {problem === 'empty' && <p className="text-warning text-sm">{t('empty')}</p>}
      {problem === 'error' && <p className="text-warning text-sm">{t('error')}</p>}
    </div>
  );
}
