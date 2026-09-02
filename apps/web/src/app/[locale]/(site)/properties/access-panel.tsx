'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { TriangleAlert, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateAccess } from './actions';
import { ContactList, type PropertyContact } from './contact-list';

export type AccessRow = {
  method: 'keyless' | 'physical_concierge' | 'physical_none';
  require_id: boolean;
  keyless_code: string | null;
  keyless_instructions: string | null;
  concierge_name: string | null;
  concierge_hours: string | null;
  id_basis: string | null;
  id_disclosed: boolean;
  unit: string | null;
} | null;

export function AccessPanel({
  propertyId,
  access,
  contacts,
}: {
  propertyId: string;
  access: AccessRow;
  contacts: PropertyContact[];
}) {
  const t = useTranslations('properties');
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const [s, setS] = useState({
    method: access?.method ?? 'physical_none',
    keylessCode: access?.keyless_code ?? '',
    keylessInstructions: access?.keyless_instructions ?? '',
    conciergeName: access?.concierge_name ?? '',
    conciergeHours: access?.concierge_hours ?? '',
    unit: access?.unit ?? '',
    requireId: access?.require_id ?? false,
    idBasis: access?.id_basis ?? '',
    idDisclosed: access?.id_disclosed ?? false,
  });
  const upd = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  const [saveError, setSaveError] = useState(false);
  const latest = useRef(s);
  latest.current = s;
  const dirty = useRef(false);
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    dirty.current = true;
    const id = setTimeout(() => {
      start(async () => {
        const r = await updateAccess({ propertyId, ...latest.current });
        if (r.ok) {
          dirty.current = false;
          setSaveError(false);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        } else {
          setSaveError(true);
        }
      });
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  useEffect(
    () => () => {
      if (dirty.current) void updateAccess({ propertyId, ...latest.current });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-muted-foreground text-xs">{t('method_help')}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { id: 'keyless', title: t('method_keyless_short'), body: t('method_keyless_body') },
              {
                id: 'physical_concierge',
                title: t('method_concierge_short'),
                body: t('method_concierge_body'),
              },
              { id: 'physical_none', title: t('method_none_short'), body: t('method_none_body') },
            ] as const
          ).map(({ id, title, body }) => (
            <button
              key={id}
              type="button"
              onClick={() => upd('method', id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                s.method === id
                  ? 'border-primary/50 bg-accent/60'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <span className="block text-sm font-semibold">{title}</span>
              <span className="text-muted-foreground mt-0.5 block text-xs">{body}</span>
            </button>
          ))}
        </div>
        {s.method === 'physical_none' && (
          <p className="text-warning flex items-start gap-1.5 text-xs">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('none_warning')}
          </p>
        )}
      </div>

      {s.method === 'keyless' && (
        <div className="border-border grid gap-3 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">{t('keyless_help')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="keyless-code">{t('keyless_code')}</Label>
              <Input
                id="keyless-code"
                inputMode="numeric"
                autoComplete="off"
                placeholder="4821"
                value={s.keylessCode}
                onChange={(e) => upd('keylessCode', e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="keyless-where">
                {t('keyless_where')}{' '}
                <span className="text-muted-foreground font-normal">{t('optional')}</span>
              </Label>
              <Input
                id="keyless-where"
                placeholder={t('keyless_where_ph')}
                value={s.keylessInstructions}
                onChange={(e) => upd('keylessInstructions', e.target.value)}
              />
            </div>
          </div>
          {!s.keylessCode.trim() && (
            <p className="text-warning flex items-start gap-1.5 text-xs">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('keyless_missing')}
            </p>
          )}
        </div>
      )}

      {s.method === 'physical_concierge' && (
        <div className="border-border grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>{t('concierge_name')}</Label>
            <Input value={s.conciergeName} onChange={(e) => upd('conciergeName', e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('concierge_hours')}</Label>
            <Input
              value={s.conciergeHours}
              onChange={(e) => upd('conciergeHours', e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="border-border grid gap-3 rounded-lg border p-3">
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="unit">{t('unit')}</Label>
          <Input
            id="unit"
            placeholder={t('unit_ph')}
            value={s.unit}
            onChange={(e) => upd('unit', e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('unit_help')}</p>
        </div>
        <ContactList
          propertyId={propertyId}
          role="concierge"
          contacts={contacts}
          title={t('concierge_title')}
          body={t('concierge_body')}
          addTitle={t('concierge_add_title')}
        />
      </div>

      <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={s.requireId}
            onChange={(e) => upd('requireId', e.target.checked)}
          />
          <span>
            <span className="font-medium">{t('require_id')}</span>
            <span className="text-muted-foreground block text-xs">{t('require_id_help')}</span>
          </span>
        </label>
        {s.requireId && (
          <div className="grid gap-2 pl-6">
            <div className="grid gap-1.5">
              <Label>{t('id_basis')}</Label>
              <Input
                value={s.idBasis}
                onChange={(e) => upd('idBasis', e.target.value)}
                placeholder={t('id_basis_ph')}
              />
            </div>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={s.idDisclosed}
                onChange={(e) => upd('idDisclosed', e.target.checked)}
              />
              <span className="text-muted-foreground">{t('id_disclosed')}</span>
            </label>
          </div>
        )}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>{t('checkin_auto_note')}</span>
        <span className="flex items-center gap-1.5">
          {pending && t('saving')}
          {!pending && saved && (
            <span className="text-success flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> {t('saved')}
            </span>
          )}
          {!pending && saveError && <span className="text-warning">{t('save_error')}</span>}
        </span>
      </div>
    </div>
  );
}
