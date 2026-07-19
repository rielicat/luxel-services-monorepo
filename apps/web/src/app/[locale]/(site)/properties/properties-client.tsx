'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Home, Plus, Link2, Copy, Check, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProperty, updateAccess, createCheckinLink } from './actions';
import { CalendarPanel, type Feed, type Block } from './calendar-panel';

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

export type PropertyRow = {
  id: string;
  nickname: string;
  address: string | null;
  comuna: string | null;
  property_access: AccessRow;
  property_calendars: Feed[];
  calendar_blocks: Block[];
};

const inputCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function PropertiesClient({ initial }: { initial: PropertyRow[] }) {
  const t = useTranslations('properties');
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Home className="text-primary h-6 w-6" />
        <div>
          <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
      </div>
      <NewProperty />
      <div className="mt-6 grid gap-4">
        {initial.map((p) => (
          <PropertyCard key={p.id} property={p} />
        ))}
      </div>
    </div>
  );
}

function NewProperty() {
  const t = useTranslations('properties');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    nickname: '',
    address: '',
    comuna: '',
    bedrooms: '',
    bathrooms: '',
    sizeM2: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createProperty({
        nickname: f.nickname.trim(),
        address: f.address.trim() || undefined,
        comuna: f.comuna.trim() || undefined,
        bedrooms: f.bedrooms ? Number(f.bedrooms) : undefined,
        bathrooms: f.bathrooms ? Number(f.bathrooms) : undefined,
        sizeM2: f.sizeM2 ? Number(f.sizeM2) : undefined,
      });
      if (r.ok) {
        setF({ nickname: '', address: '', comuna: '', bedrooms: '', bathrooms: '', sizeM2: '' });
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" /> {t('new_title')}
      </Button>
    );
  }
  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="np-nick">{t('nickname')}</Label>
            <Input id="np-nick" required value={f.nickname} onChange={set('nickname')} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np-addr">{t('address')}</Label>
            <Input id="np-addr" value={f.address} onChange={set('address')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="np-comuna">{t('comuna')}</Label>
              <Input id="np-comuna" value={f.comuna} onChange={set('comuna')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="np-size">{t('size_m2')}</Label>
              <Input id="np-size" type="number" value={f.sizeM2} onChange={set('sizeM2')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="np-bed">{t('bedrooms')}</Label>
              <Input id="np-bed" type="number" value={f.bedrooms} onChange={set('bedrooms')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="np-bath">{t('bathrooms')}</Label>
              <Input id="np-bath" type="number" value={f.bathrooms} onChange={set('bathrooms')} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !f.nickname.trim()}>
              {pending ? t('creating') : t('create')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PropertyCard({ property }: { property: PropertyRow }) {
  const t = useTranslations('properties');
  const a = property.property_access;
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [s, setS] = useState({
    method: a?.method ?? 'physical_none',
    keylessCode: a?.keyless_code ?? '',
    keylessInstructions: a?.keyless_instructions ?? '',
    conciergeName: a?.concierge_name ?? '',
    conciergeWhatsapp: a?.concierge_whatsapp ?? '',
    conciergeEmail: a?.concierge_email ?? '',
    conciergeHours: a?.concierge_hours ?? '',
    requireId: a?.require_id ?? false,
    idBasis: a?.id_basis ?? '',
    idDisclosed: a?.id_disclosed ?? false,
  });
  const upd = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  const save = () => {
    setSaved(false);
    start(async () => {
      const r = await updateAccess({ propertyId: property.id, ...s });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  const genLink = () => {
    start(async () => {
      const r = await createCheckinLink(property.id);
      if (r.ok && r.token) setLink(`${window.location.origin}/checkin/${r.token}`);
    });
  };

  const copy = () => {
    if (!link) return;
    void navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <div>
          <p className="font-display font-semibold">{property.nickname}</p>
          {property.address && <p className="text-muted-foreground text-sm">{property.address}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label>{t('method')}</Label>
          <select
            className={inputCls}
            value={s.method}
            onChange={(e) => upd('method', e.target.value as typeof s.method)}
          >
            <option value="keyless">{t('method_keyless')}</option>
            <option value="physical_concierge">{t('method_concierge')}</option>
            <option value="physical_none">{t('method_none')}</option>
          </select>
          {s.method === 'physical_none' && (
            <p className="text-warning flex items-start gap-1.5 text-xs">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('none_warning')}
            </p>
          )}
        </div>

        {s.method === 'keyless' && (
          <div className="grid gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('concierge_name')}</Label>
              <Input
                value={s.conciergeName}
                onChange={(e) => upd('conciergeName', e.target.value)}
              />
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

        <div className="border-border grid gap-2 rounded-lg border p-3">
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

        <CalendarPanel
          propertyId={property.id}
          feeds={property.property_calendars}
          blocks={property.calendar_blocks}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending}>
            {pending ? t('saving') : saved ? t('saved') : t('save')}
          </Button>
          <Button variant="outline" onClick={genLink} disabled={pending}>
            <Link2 className="mr-1.5 h-4 w-4" /> {t('gen_link')}
          </Button>
        </div>

        {link && (
          <div className="bg-muted/50 flex items-center gap-2 rounded-md p-2 text-xs">
            <span className="truncate font-mono">{link}</span>
            <button
              type="button"
              onClick={copy}
              className="text-primary shrink-0"
              aria-label={t('copy')}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
