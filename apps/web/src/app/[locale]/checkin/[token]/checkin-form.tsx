'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check,
  KeyRound,
  UserPlus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  ConciergeBell,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitCheckin } from './actions';
import type { AccessInfo } from '@/lib/checkin/access';

interface Props {
  token: string;
  propertyName: string;
  requireId: boolean;
  alreadyDone: boolean;
  access?: AccessInfo | null;
}

type Companion = { fullName: string; docType: string; docNumber: string };

const inputCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function DocFields({
  t,
  docType,
  docNumber,
  required,
  onType,
  onNumber,
}: {
  t: (k: string) => string;
  docType: string;
  docNumber: string;
  required: boolean;
  onType: (v: string) => void;
  onNumber: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <select
        className={inputCls}
        value={docType}
        onChange={(e) => onType(e.target.value)}
        aria-label={t('doc_type')}
      >
        <option value="rut">{t('doc_rut')}</option>
        <option value="passport">{t('doc_passport')}</option>
        <option value="dni">{t('doc_dni')}</option>
        <option value="other">{t('doc_other')}</option>
      </select>
      <Input
        required={required}
        value={docNumber}
        onChange={(e) => onNumber(e.target.value)}
        placeholder={t('doc_number_ph')}
        aria-label={t('doc_number')}
      />
    </div>
  );
}

function AccessCard({ access, t }: { access: AccessInfo | null; t: (k: string) => string }) {
  if (!access) return null;
  const shell = 'border-primary/30 bg-primary/5 grid gap-1.5 rounded-xl border p-4 text-center';
  const heading =
    'text-muted-foreground flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide';

  if (access.method === 'keyless' && (access.keylessCode || access.keylessInstructions)) {
    return (
      <div className={shell}>
        <p className={heading}>
          <KeyRound className="h-3.5 w-3.5" /> {t('access_title')}
        </p>
        {access.keylessCode && (
          <p className="font-display text-3xl font-bold tracking-[0.3em]">{access.keylessCode}</p>
        )}
        {access.keylessInstructions && (
          <p className="text-muted-foreground text-sm">{access.keylessInstructions}</p>
        )}
      </div>
    );
  }

  if (access.method === 'physical_concierge') {
    return (
      <div className={shell}>
        <p className={heading}>
          <ConciergeBell className="h-3.5 w-3.5" /> {t('access_title')}
        </p>
        <p className="text-sm">
          {t('access_concierge')
            .replace('{name}', access.conciergeName ?? t('access_concierge_generic'))
            .replace('{hours}', access.conciergeHours ?? '24/7')}
        </p>
      </div>
    );
  }
  return null;
}

export function CheckinForm({
  token,
  propertyName,
  requireId,
  alreadyDone,
  access: initialAccess = null,
}: Props) {
  const t = useTranslations('checkin');
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(alreadyDone);
  const [access, setAccess] = useState<AccessInfo | null>(initialAccess);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [f, setF] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    arrival: '',
    docType: 'rut',
    docNumber: '',
    consent: false,
  });
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [parking, setParking] = useState<'' | 'yes' | 'no'>('');
  const [plate, setPlate] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({
      ...p,
      [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value,
    }));

  const step1Valid =
    f.guestName.trim() &&
    /.+@.+\..+/.test(f.guestEmail) &&
    (!requireId || f.docNumber.trim().length >= 3);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await submitCheckin({
        token,
        guestName: f.guestName.trim(),
        guestEmail: f.guestEmail.trim(),
        guestPhone: f.guestPhone.trim() || undefined,
        arrivalAt: f.arrival ? new Date(f.arrival).toISOString() : undefined,
        docType: f.docNumber.trim() ? (f.docType as 'rut') : undefined,
        docNumber: f.docNumber.trim() || undefined,
        companions: companions
          .filter((c) => c.fullName.trim())
          .map((c) => ({
            fullName: c.fullName.trim(),
            docType: c.docNumber.trim() ? (c.docType as 'rut') : undefined,
            docNumber: c.docNumber.trim() || undefined,
          })),
        parking: parking ? parking === 'yes' : undefined,
        vehiclePlate: parking === 'yes' && plate.trim() ? plate.trim() : undefined,
        consent: f.consent as true,
      });
      if (r.ok) {
        setAccess(r.access ?? null);
        setDone(true);
      } else {
        setError(
          r.error === 'id_required'
            ? t('error_id_required')
            : r.error === 'expired'
              ? t('error_expired')
              : t('error_generic'),
        );
      }
    });
  };

  if (done) {
    return (
      <Card>
        <CardContent className="grid gap-4 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="bg-success/15 text-success flex h-14 w-14 items-center justify-center rounded-full">
              <Check className="h-7 w-7" />
            </span>
            <h1 className="font-display text-xl font-semibold">{t('done_title')}</h1>
            <p className="text-muted-foreground text-sm">{t('done_body')}</p>
          </div>

          <AccessCard access={access} t={t} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5 flex items-start gap-2">
          <KeyRound className="text-primary mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-balance text-xl font-semibold">{t('title')}</h1>
            <p className="text-muted-foreground text-sm">{propertyName || t('subtitle')}</p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
            {step}/2
          </span>
        </div>
        <div className="bg-muted mb-5 h-1 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: step === 1 ? '50%' : '100%' }}
          />
        </div>

        {step === 1 ? (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (step1Valid) setStep(2);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="ci-name">{t('name')}</Label>
              <Input
                id="ci-name"
                required
                autoFocus
                autoComplete="name"
                value={f.guestName}
                onChange={set('guestName')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ci-email">{t('email')}</Label>
              <Input
                id="ci-email"
                type="email"
                required
                autoComplete="email"
                value={f.guestEmail}
                onChange={set('guestEmail')}
              />
              <p className="text-muted-foreground text-xs">{t('email_help')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ci-phone">{t('phone_opt')}</Label>
                <Input
                  id="ci-phone"
                  type="tel"
                  autoComplete="tel"
                  value={f.guestPhone}
                  onChange={set('guestPhone')}
                  placeholder="+56 9 ..."
                />
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
            </div>
            <div className="grid gap-1.5">
              <Label>{requireId ? t('your_id') : t('your_id_opt')}</Label>
              <DocFields
                t={t}
                docType={f.docType}
                docNumber={f.docNumber}
                required={requireId}
                onType={(v) => setF((p) => ({ ...p, docType: v }))}
                onNumber={(v) => setF((p) => ({ ...p, docNumber: v }))}
              />
            </div>
            <Button type="submit" size="lg" disabled={!step1Valid}>
              {t('next')} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </form>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div>
              <p className="font-medium">{t('companions_title')}</p>
              <p className="text-muted-foreground text-sm">
                {requireId ? t('companions_body_id') : t('companions_body')}
              </p>
            </div>

            {companions.map((c, i) => (
              <div key={i} className="border-border grid gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    required
                    value={c.fullName}
                    onChange={(e) =>
                      setCompanions((list) =>
                        list.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)),
                      )
                    }
                    placeholder={t('companion_name_ph')}
                    aria-label={t('companion_name_ph')}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
                    aria-label={t('remove')}
                    onClick={() => setCompanions((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <DocFields
                  t={t}
                  docType={c.docType}
                  docNumber={c.docNumber}
                  required={requireId}
                  onType={(v) =>
                    setCompanions((list) =>
                      list.map((x, j) => (j === i ? { ...x, docType: v } : x)),
                    )
                  }
                  onNumber={(v) =>
                    setCompanions((list) =>
                      list.map((x, j) => (j === i ? { ...x, docNumber: v } : x)),
                    )
                  }
                />
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={() =>
                setCompanions((list) => [...list, { fullName: '', docType: 'rut', docNumber: '' }])
              }
            >
              <UserPlus className="mr-1.5 h-4 w-4" /> {t('add_companion')}
            </Button>

            <div className="grid gap-2">
              <p className="font-medium">{t('parking')}</p>
              <div className="flex gap-2">
                {(['yes', 'no'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setParking(v)}
                    className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                      parking === v
                        ? 'border-primary/50 bg-accent/60 font-medium'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {t(v === 'yes' ? 'parking_yes' : 'parking_no')}
                  </button>
                ))}
              </div>
              {parking === 'yes' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="ci-plate">{t('plate')}</Label>
                  <Input
                    id="ci-plate"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder={t('plate_ph')}
                    autoCapitalize="characters"
                    className="sm:max-w-xs"
                  />
                </div>
              )}
            </div>

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

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> {t('back')}
              </Button>
              <Button type="submit" size="lg" className="flex-1" disabled={pending || !f.consent}>
                {pending ? t('sending') : t('submit')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
