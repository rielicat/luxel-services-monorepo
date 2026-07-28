'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, Copy, Check, TriangleAlert, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { updateAccess, createCheckinLink } from './actions';

export type AccessRow = {
  method: 'keyless' | 'physical_concierge' | 'physical_none';
  require_id: boolean;
  keyless_code: string | null;
  keyless_instructions: string | null;
  concierge_name: string | null;
  concierge_whatsapp: string | null;
  concierge_email: string | null;
  concierge_hours: string | null;
  id_basis: string | null;
  id_disclosed: boolean;
} | null;

export function AccessPanel({ propertyId, access }: { propertyId: string; access: AccessRow }) {
  const t = useTranslations('properties');
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [idOpen, setIdOpen] = useState(false);

  const [s, setS] = useState({
    method: access?.method ?? 'physical_none',
    keylessCode: access?.keyless_code ?? '',
    keylessInstructions: access?.keyless_instructions ?? '',
    conciergeName: access?.concierge_name ?? '',
    conciergeWhatsapp: access?.concierge_whatsapp ?? '',
    conciergeEmail: access?.concierge_email ?? '',
    conciergeHours: access?.concierge_hours ?? '',
    requireId: access?.require_id ?? false,
    idBasis: access?.id_basis ?? '',
    idDisclosed: access?.id_disclosed ?? false,
  });
  const upd = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  const save = () =>
    start(async () => {
      const r = await updateAccess({ propertyId, ...s });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });

  const genLink = () =>
    start(async () => {
      const r = await createCheckinLink(propertyId);
      if (r.ok && r.token) setLink(`${window.location.origin}/checkin/${r.token}`);
    });

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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>{t('keyless_code')}</Label>
            <Input value={s.keylessCode} onChange={(e) => upd('keylessCode', e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('keyless_instructions')}</Label>
            <Input
              value={s.keylessInstructions}
              onChange={(e) => upd('keylessInstructions', e.target.value)}
            />
          </div>
        </div>
      )}

      {s.method === 'physical_concierge' && (
        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="grid gap-1.5">
            <Label>{t('concierge_whatsapp')}</Label>
            <Input
              value={s.conciergeWhatsapp}
              onChange={(e) => upd('conciergeWhatsapp', e.target.value)}
              placeholder="+56 9 ..."
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('concierge_email')}</Label>
            <Input
              type="email"
              value={s.conciergeEmail}
              onChange={(e) => upd('conciergeEmail', e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? t('saving') : saved ? t('saved') : t('save')}
        </Button>
        <Button variant="outline" onClick={genLink} disabled={pending}>
          <Link2 className="mr-1.5 h-4 w-4" /> {t('gen_link')}
        </Button>
        <button
          type="button"
          onClick={() => setIdOpen(true)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <IdCard className="h-3.5 w-3.5" />
          {s.requireId ? t('id_advanced_on') : t('id_advanced')}
        </button>
      </div>

      <Modal open={idOpen} onClose={() => setIdOpen(false)} title={t('id_advanced')}>
        <div className="grid gap-3">
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
          <Button
            size="sm"
            className="justify-self-start"
            disabled={pending}
            onClick={() => {
              save();
              setIdOpen(false);
            }}
          >
            {t('save')}
          </Button>
        </div>
      </Modal>

      {link && (
        <div className="bg-muted/50 flex items-center gap-2 rounded-md p-2 text-xs">
          <span className="truncate font-mono">{link}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-primary shrink-0"
            aria-label={t('copy')}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
