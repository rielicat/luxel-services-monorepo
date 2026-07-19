'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitCheckin } from './actions';

interface Props {
  token: string;
  propertyName: string;
  requireId: boolean;
  alreadyDone: boolean;
}

const inputCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CheckinForm({ token, propertyName, requireId, alreadyDone }: Props) {
  const t = useTranslations('checkin');
  const [done, setDone] = useState(alreadyDone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [f, setF] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    partySize: '',
    arrival: '',
    docType: 'rut',
    docNumber: '',
    nationality: '',
    dateOfBirth: '',
    consent: false,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({
      ...p,
      [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value,
    }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await submitCheckin({
        token,
        guestName: f.guestName.trim(),
        guestEmail: f.guestEmail.trim(),
        guestPhone: f.guestPhone.trim() || undefined,
        partySize: f.partySize ? Number(f.partySize) : undefined,
        arrivalAt: f.arrival ? new Date(f.arrival).toISOString() : undefined,
        docType: f.docNumber.trim() ? f.docType : undefined,
        docNumber: f.docNumber.trim() || undefined,
        nationality: f.nationality.trim() || undefined,
        dateOfBirth: f.dateOfBirth || undefined,
        consent: f.consent as true,
      });
      if (r.ok) setDone(true);
      else setError(r.error === 'id_required' ? t('error_id_required') : t('error_generic'));
    });
  };

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="bg-success/15 text-success flex h-12 w-12 items-center justify-center rounded-full">
            <Check className="h-6 w-6" />
          </span>
          <h1 className="font-display text-xl font-semibold">{t('done_title')}</h1>
          <p className="text-muted-foreground text-sm">{t('done_body')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5 flex items-start gap-2">
          <KeyRound className="text-primary mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h1 className="font-display text-balance text-xl font-semibold">{t('title')}</h1>
            <p className="text-muted-foreground text-sm">{propertyName || t('subtitle')}</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ci-name">{t('name')}</Label>
            <Input id="ci-name" required value={f.guestName} onChange={set('guestName')} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ci-email">{t('email')}</Label>
            <Input
              id="ci-email"
              type="email"
              required
              value={f.guestEmail}
              onChange={set('guestEmail')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ci-phone">{t('phone')}</Label>
              <Input
                id="ci-phone"
                type="tel"
                value={f.guestPhone}
                onChange={set('guestPhone')}
                placeholder="+56 9 ..."
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ci-party">{t('party_size')}</Label>
              <Input
                id="ci-party"
                type="number"
                min={1}
                max={30}
                value={f.partySize}
                onChange={set('partySize')}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ci-arrival">{t('arrival')}</Label>
            <input
              id="ci-arrival"
              type="datetime-local"
              className={inputCls}
              value={f.arrival}
              onChange={set('arrival')}
            />
          </div>

          <fieldset className="border-border grid gap-3 rounded-lg border p-3">
            <legend className="text-muted-foreground px-1 text-xs font-medium">
              {t('id_section')} {requireId ? '' : `· ${t('id_optional_note')}`}
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ci-doctype">{t('doc_type')}</Label>
                <select
                  id="ci-doctype"
                  className={inputCls}
                  value={f.docType}
                  onChange={set('docType')}
                >
                  <option value="rut">{t('doc_rut')}</option>
                  <option value="passport">{t('doc_passport')}</option>
                  <option value="dni">{t('doc_dni')}</option>
                  <option value="other">{t('doc_other')}</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ci-docnum">{t('doc_number')}</Label>
                <Input
                  id="ci-docnum"
                  required={requireId}
                  value={f.docNumber}
                  onChange={set('docNumber')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ci-nat">{t('nationality')}</Label>
                <Input id="ci-nat" value={f.nationality} onChange={set('nationality')} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ci-dob">{t('dob')}</Label>
                <input
                  id="ci-dob"
                  type="date"
                  className={inputCls}
                  value={f.dateOfBirth}
                  onChange={set('dateOfBirth')}
                />
              </div>
            </div>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              required
              checked={f.consent}
              onChange={set('consent')}
              className="mt-1"
            />
            <span className="text-muted-foreground">{t('consent')}</span>
          </label>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" disabled={pending}>
            {pending ? t('sending') : t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
