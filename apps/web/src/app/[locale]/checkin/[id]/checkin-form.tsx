'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronLeft, House, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { LuxelLogo, LuxelMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDocument } from '@luxel/shared/document';
import { arrivalSlots, departureSlots, nightsBetween } from '@luxel/core/checkin/slots';
import type { CheckinDraft } from '@luxel/core/checkin/draft-shape';
import { saveCheckinDraft, submitCheckin } from './actions';

export type DocType = 'rut' | 'passport' | 'dni' | 'other';

export interface Stay {
  propertyName: string;
  address: string | null;
  arrival: string | null;
  departure: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
}

export interface Rules {
  lines?: string[];
}

export interface RegisteredGuest {
  fullName: string;
  docType: string | null;
  docLast4: string | null;
}

export interface CheckinFormProps {
  id: string;
  alreadyDone: boolean;
  stay: Stay;
  expectedGuests: number;
  maxGuests: number;
  askCount?: boolean;
  rules: Rules;
  registered?: RegisteredGuest[];
  draft?: CheckinDraft | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
}

type GuestDraft = {
  uid: string;
  fullName: string;
  docType: DocType;
  docNumber: string;
};

type Parking = '' | 'yes' | 'no';
type Errors = Record<string, string>;
type SaveState = null | 'failed' | 'stale';

type Snapshot = {
  partySize: number;
  guests: GuestDraft[];
  arrival: string;
  departure: string;
  parking: Parking;
  plate: string;
};

const INTL_LOCALE: Record<string, string> = { es: 'es-CL', en: 'en', pt: 'pt-BR' };

const DOC_KEY = {
  rut: 'doc_rut',
  passport: 'doc_passport',
  dni: 'doc_dni',
  other: 'doc_other',
} as const satisfies Record<DocType, string>;
const DOC_TYPES = Object.keys(DOC_KEY) as DocType[];

const isDocType = (v: string): v is DocType => v in DOC_KEY;

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const MIN_DOC = 3;

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const OPTION_BASE = cn(
  'ease-lux flex min-h-12 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-200 active:scale-[0.97]',
  FOCUS,
);
const OPTION_ON = 'border-primary bg-primary text-primary-foreground shadow-soft font-semibold';
const OPTION_OFF =
  'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent font-medium';

const SECTION_TITLE = 'font-display text-base font-semibold';

const nameKey = (i: number): string => `g${i}-name`;
const docKey = (i: number): string => `g${i}-doc`;

const isFilled = (g: GuestDraft): boolean =>
  Boolean(g.fullName.trim()) && g.docNumber.trim().length >= MIN_DOC;

const newGuest = (uid: string, docType: DocType): GuestDraft => ({
  uid,
  fullName: '',
  docType,
  docNumber: '',
});

const freshUid = (): string =>
  `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isParking = (v: string): v is Parking => v === '' || v === 'yes' || v === 'no';
const clock = (time: string | null): string | null => (time ? time.slice(0, 5) : null);
const maskDoc = (n: string): string => n.replace(/\s+/g, '').slice(-4);

function PrivacyLink({ className }: { className?: string }) {
  const t = useTranslations('checkin');
  const locale = useLocale();
  return (
    <a
      href={`/privacy?lang=${locale}`}
      target="_blank"
      rel="noreferrer"
      className={cn('rounded-sm underline underline-offset-2', FOCUS, className)}
    >
      {t('privacy_link')}
    </a>
  );
}

function useStayLine(stay: Stay): string | null {
  const t = useTranslations('checkin');
  const locale = useLocale();
  if (!stay.arrival || !stay.departure) return null;
  const loc = INTL_LOCALE[locale] ?? 'es-CL';
  const fmt = (iso: string, year: boolean) =>
    new Intl.DateTimeFormat(loc, {
      timeZone: 'America/Santiago',
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' as const } : {}),
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
  const nights = t('nights', { n: nightsBetween(stay.arrival, stay.departure) });
  return `${fmt(stay.arrival, false)} – ${fmt(stay.departure, true)} · ${nights}`;
}

function GroupLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-sm font-medium leading-none">
      {children}
    </span>
  );
}

function GroupError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive text-sm font-medium">
      {message}
    </p>
  );
}

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('checkin');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="text-muted-foreground font-normal"> {t('optional')}</span>}
      </Label>
      {error && (
        <p id={`${id}-err`} className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}

function Chips<V extends string>({
  id,
  labelId,
  options,
  value,
  onChange,
  className,
  invalid,
  describedById,
}: {
  id: string;
  labelId: string;
  options: Array<{ value: V; label: string }>;
  value: string;
  onChange: (v: V) => void;
  className?: string;
  invalid?: boolean;
  describedById?: string;
}) {
  const selected = options.findIndex((o) => o.value === value);
  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedById}
      className={cn('grid gap-2', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const focusable = selected === -1 ? i === 0 : on;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const step = ARROW_STEP[e.key];
              if (!step) return;
              e.preventDefault();
              const next = (i + step + options.length) % options.length;
              onChange(options[next]!.value);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('button')
                [next]?.focus();
            }}
            className={cn(OPTION_BASE, on ? OPTION_ON : OPTION_OFF)}
          >
            {on && <Check className="h-3.5 w-3.5 shrink-0" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Welcome({ stay, line, times }: { stay: Stay; line: string | null; times: string | null }) {
  return (
    <header className="grid gap-4">
      <LuxelLogo markClassName="h-7 w-7" />

      <Card className="grid gap-3 p-4">
        <div className="flex gap-3">
          <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
            <House className="h-5 w-5" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <h1 className="font-display text-balance font-semibold leading-snug">
              {stay.propertyName}
            </h1>
            {stay.address && <p className="text-muted-foreground text-sm">{stay.address}</p>}
          </div>
        </div>
        {(line || times) && (
          <div className="border-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3">
            {line && <p className="text-sm font-medium tabular-nums">{line}</p>}
            {times && <p className="text-muted-foreground text-xs tabular-nums">{times}</p>}
          </div>
        )}
      </Card>
    </header>
  );
}

function RemoveGuest({
  index,
  onRemove,
  className,
}: {
  index: number;
  onRemove: () => void;
  className?: string;
}) {
  const t = useTranslations('checkin');
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t('remove_guest', { n: index + 1 })}
      className={cn(
        'text-destructive hover:bg-destructive/10 ease-lux flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
        FOCUS,
        className,
      )}
    >
      <Trash2 aria-hidden className="h-[18px] w-[18px]" />
    </button>
  );
}

function GuestRow({
  index,
  guest,
  errors,
  open,
  onToggle,
  onRemove,
  bindRef,
  onChange,
  onCommit,
  onBlurName,
  onBlurDoc,
}: {
  index: number;
  guest: GuestDraft;
  errors: Errors;
  open: boolean;
  onToggle: () => void;
  onRemove: (() => void) | null;
  bindRef: (key: string, el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<GuestDraft>) => void;
  onCommit: (patch: Partial<GuestDraft>) => void;
  onBlurName: () => void;
  onBlurDoc: () => void;
}) {
  const t = useTranslations('checkin');
  const nameId = nameKey(index);
  const docId = docKey(index);
  const nameErr = errors[nameId];
  const docErr = errors[docId];

  const named = guest.fullName.trim();
  const fallback = t('guest_n', { n: index + 1 });
  const flagged = Boolean(nameErr || docErr);

  return (
    <Card>
      <div className="flex items-center gap-2 p-1">
        <button
          type="button"
          id={`g${index}-label`}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? `g${index}-fields` : undefined}
          className={cn(
            'flex min-h-12 flex-1 items-center gap-3 rounded-lg px-3 text-left',
            'hover:bg-accent transition-colors',
            FOCUS,
          )}
        >
          <span
            className={cn(
              'truncate text-sm',
              named ? 'font-medium' : 'text-muted-foreground font-normal',
            )}
          >
            {named || fallback}
          </span>
          {flagged && !open && (
            <span className="text-destructive ml-auto shrink-0 text-xs font-medium">
              {t('row_incomplete')}
            </span>
          )}
        </button>
        {onRemove && <RemoveGuest index={index} onRemove={onRemove} />}
      </div>

      {open && (
        <div
          id={`g${index}-fields`}
          role="group"
          aria-labelledby={`g${index}-label`}
          className="grid gap-5 px-4 pb-4 pt-1 sm:px-5 sm:pb-5"
        >
          <Field id={nameId} label={t('name')} error={nameErr}>
            <Input
              id={nameId}
              ref={(el) => bindRef(nameId, el)}
              value={guest.fullName}
              onChange={(e) => onChange({ fullName: e.target.value })}
              onBlur={onBlurName}
              maxLength={120}
              aria-required
              aria-invalid={nameErr ? true : undefined}
              aria-describedby={nameErr ? `${nameId}-err` : undefined}
              autoCapitalize="words"
              autoComplete={index === 0 ? 'name' : `section-guest-${index} name`}
              enterKeyHint="next"
              placeholder={fallback}
              className={cn(
                'h-12 text-base',
                nameErr && 'border-destructive focus-visible:border-destructive',
              )}
            />
          </Field>

          <div className="grid gap-1.5">
            <GroupLabel id={`${docId}type-label`}>{t('doc_type')}</GroupLabel>
            <Chips
              id={`${docId}type`}
              labelId={`${docId}type-label`}
              options={DOC_TYPES.map((v) => ({ value: v, label: t(DOC_KEY[v]) }))}
              value={guest.docType}
              onChange={(v) => onCommit({ docType: v })}
              className="grid-cols-2"
            />
          </div>

          <Field id={docId} label={t('doc_number')} error={docErr}>
            <Input
              id={docId}
              ref={(el) => bindRef(docId, el)}
              value={guest.docNumber}
              onChange={(e) => onChange({ docNumber: e.target.value })}
              onBlur={onBlurDoc}
              inputMode="text"
              maxLength={40}
              aria-required
              aria-invalid={docErr ? true : undefined}
              aria-describedby={docErr ? `${docId}-err` : undefined}
              autoCapitalize={guest.docType === 'rut' ? 'none' : 'characters'}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder={t(guest.docType === 'rut' ? 'doc_number_ph' : 'doc_number_ph_other')}
              className={cn(
                'h-12 text-base tabular-nums tracking-wider',
                docErr && 'border-destructive focus-visible:border-destructive',
              )}
            />
          </Field>
        </div>
      )}
    </Card>
  );
}

type RuleItem = { mark: string; text: string };

const EMOJI = '\\p{Extended_Pictographic}(?:️|‍\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*';
const RULE_MARK = new RegExp(`^(${EMOJI})\\s*`, 'u');
const RULE_TAIL = new RegExp(`\\s*(${EMOJI})[\\s.]*$`, 'u');
const RULE_BULLET = /^[-*•]\s*/;
const RULE_HEADING = /^[^\p{Ll}]*:$/u;
const RULE_FALLBACK = '📌';

function splitRule(line: string, title: string): RuleItem {
  const clean = line.replace(RULE_BULLET, '').trim();
  const lead = RULE_MARK.exec(clean);
  const body = lead ? clean.slice(lead[0].length).trim() : clean;
  if (!lead && RULE_HEADING.test(clean)) return { mark: RULE_FALLBACK, text: '' };
  if (body.toLowerCase() === title.toLowerCase()) return { mark: RULE_FALLBACK, text: '' };
  if (lead) return { mark: lead[1]!, text: body };
  const tail = RULE_TAIL.exec(body);
  if (tail) return { mark: tail[1]!, text: body.slice(0, tail.index).trim() };
  return { mark: RULE_FALLBACK, text: body };
}

function DoneView({
  stay,
  registered,
  arrivalTime,
  departureTime,
  rules,
}: {
  stay: Stay;
  registered: RegisteredGuest[];
  arrivalTime: string | null;
  departureTime: string | null;
  rules: Rules;
}) {
  const t = useTranslations('checkin');
  const dates = useStayLine(stay);
  const rows: Array<[string, string]> = [];
  if (stay.propertyName) rows.push([t('summary_property'), stay.propertyName]);
  if (dates) rows.push([t('summary_dates'), dates]);
  if (arrivalTime) rows.push([t('summary_arrival'), arrivalTime]);
  if (departureTime) rows.push([t('summary_departure'), departureTime]);

  const rulesTitle = t('rules_title');
  const allRules = (rules.lines ?? [])
    .map((line) => splitRule(line, rulesTitle))
    .filter((r) => r.text);

  return (
    <div className="grid gap-4">
      <LuxelLogo markClassName="h-7 w-7" />

      <Card className="grid justify-items-center gap-3 p-6 text-center">
        <span className="bg-success/15 flex h-12 w-12 items-center justify-center rounded-full">
          <LuxelMark className="h-6 w-6" />
        </span>
        <h1 className="text-balance font-serif text-2xl font-medium tracking-tight">
          {t('done_title')}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{t('done_body')}</p>
      </Card>

      {rows.length > 0 && (
        <Card className="px-4">
          <dl className="divide-border divide-y">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-3">
                <dt className="text-muted-foreground shrink-0 text-sm">{k}</dt>
                <dd className="text-right text-sm font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {registered.length > 0 && (
        <Card className="p-4">
          <h2 className={cn(SECTION_TITLE, 'mb-2')}>{t('registered_title')}</h2>
          <ul className="divide-border divide-y">
            {registered.map((g, i) => {
              const docLabel = g.docType && isDocType(g.docType) ? t(DOC_KEY[g.docType]) : null;
              const last = g.docLast4 ? `···${g.docLast4}` : null;
              const detail = [docLabel, last].filter(Boolean).join(' ');
              return (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <span className="block truncate text-sm font-medium">{g.fullName}</span>
                  {detail && (
                    <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">{detail}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {allRules.length > 0 && (
        <Card className="p-4">
          <h2 className={cn(SECTION_TITLE, 'mb-2')}>{rulesTitle}</h2>
          <ul className="grid gap-2.5">
            {allRules.map(({ mark, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm leading-snug">
                <span aria-hidden className="w-5 shrink-0 text-base leading-snug">
                  {mark}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-muted-foreground text-xs">{t('missing_someone')}</p>
      <p className="text-muted-foreground text-xs">
        <PrivacyLink />
      </p>
    </div>
  );
}

export function CheckinForm({
  id,
  alreadyDone,
  stay,
  expectedGuests,
  maxGuests,
  askCount = false,
  rules,
  registered: initialRegistered = [],
  draft = null,
  arrivalTime: initialArrival = null,
  departureTime: initialDeparture = null,
}: CheckinFormProps) {
  const t = useTranslations('checkin');
  const locale = useLocale();
  const defaultDocType: DocType = locale === 'es' ? 'rut' : 'passport';
  const ceiling = Math.max(maxGuests, draft?.guests.length ?? 0, 1);

  const resumed = (draft?.guests ?? []).slice(0, ceiling).map<GuestDraft>((g, i) => ({
    uid: g.uid || `g${i + 1}`,
    fullName: g.fullName,
    docType: isDocType(g.docType) ? g.docType : defaultDocType,
    docNumber: g.docNumber,
  }));

  const [done, setDone] = useState(alreadyDone);
  const [registered, setRegistered] = useState<RegisteredGuest[]>(initialRegistered);
  const [partySize, setPartySize] = useState(() => {
    if (!askCount) return expectedGuests;
    return resumed.length ? draft?.partySize || resumed.length : 0;
  });
  const [guests, setGuests] = useState<GuestDraft[]>(() =>
    resumed.length ? resumed : [newGuest('g1', defaultDocType)],
  );
  const [arrival, setArrival] = useState(draft?.arrivalTime ?? '');
  const [departure, setDeparture] = useState(draft?.departureTime ?? '');
  const [parking, setParking] = useState<Parking>(
    isParking(draft?.parking ?? '') ? ((draft?.parking ?? '') as Parking) : '',
  );
  const [plate, setPlate] = useState(draft?.vehiclePlate ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(null);
  const [nav, setNav] = useState(0);
  const [pending, startTransition] = useTransition();

  const countRef = useRef<HTMLHeadingElement>(null);
  const guestsHeadingRef = useRef<HTMLHeadingElement>(null);
  const [openUid, setOpenUid] = useState<string | null>(() => {
    const start = resumed.length ? resumed : [newGuest('g1', defaultDocType)];
    return start.find((g) => !isFilled(g))?.uid ?? null;
  });
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (!openUid) return;
    const i = guests.findIndex((g) => g.uid === openUid);
    if (i < 0) return;
    fields.current[errors[docKey(i)] ? docKey(i) : nameKey(i)]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUid]);

  const fields = useRef<Record<string, HTMLInputElement | null>>({});
  const revision = useRef(draft?.rev ?? 0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(false);

  const counted = partySize > 0;

  useEffect(() => {
    if (!nav) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (counted) guestsHeadingRef.current?.focus({ preventScroll: true });
    else countRef.current?.focus({ preventScroll: true });
  }, [nav, counted]);

  const stayLine = useStayLine(stay);

  if (done) {
    return (
      <DoneView
        stay={stay}
        registered={registered}
        arrivalTime={arrival || initialArrival}
        departureTime={departure || initialDeparture}
        rules={rules}
      />
    );
  }

  const checkinAt = clock(stay.checkinTime);
  const checkoutAt = clock(stay.checkoutTime);
  const times =
    checkinAt && checkoutAt ? t('times', { checkin: checkinAt, checkout: checkoutAt }) : null;

  const bindRef = (key: string, el: HTMLInputElement | null) => {
    fields.current[key] = el;
  };

  const setError = (key: string, msg: string | null) =>
    setErrors((prev) => {
      if (msg) return { ...prev, [key]: msg };
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const runSave = async (s: Snapshot) => {
    if (blocked.current) return;
    try {
      const r = await saveCheckinDraft({
        id,
        rev: revision.current,
        partySize: s.partySize,
        guests: s.guests.map((g) => ({
          uid: g.uid,
          fullName: g.fullName,
          docType: g.docType,
          docNumber: g.docNumber,
        })),
        arrivalTime: s.arrival,
        departureTime: s.departure,
        parking: s.parking,
        vehiclePlate: s.plate,
      });
      if (r.ok) {
        revision.current = r.rev;
        setSaveState(null);
        return;
      }
      if (r.reason === 'stale') {
        blocked.current = true;
        setSaveState('stale');
        return;
      }
      setSaveState('failed');
    } catch {
      setSaveState('failed');
    }
  };

  const save = (patch: Partial<Snapshot> = {}) => {
    const s: Snapshot = { partySize, guests, arrival, departure, parking, plate, ...patch };
    queue.current = queue.current.then(() => runSave(s));
  };

  const docErrorFor = (g: GuestDraft): string | null => {
    const doc = g.docNumber.trim();
    return doc.length >= MIN_DOC ? null : t('error_doc');
  };

  const guestErrors = (list: GuestDraft[]): Errors => {
    const found: Errors = {};
    list.forEach((g, i) => {
      if (!g.fullName.trim()) found[nameKey(i)] = t('error_name');
      const doc = docErrorFor(g);
      if (doc) found[docKey(i)] = doc;
    });
    return found;
  };

  const allErrors = (): Errors => {
    const found = guestErrors(guests);
    if (guests.length !== partySize) found.party = t('error_party', { n: partySize });
    if (!arrival) found.arrival = t('error_time');
    if (!departure) found.departure = t('error_time');
    if (!parking) found.parking = t('error_parking');
    return found;
  };

  const focusFirst = (found: Errors) => {
    for (let i = 0; i < guests.length; i += 1) {
      for (const key of [nameKey(i), docKey(i)]) {
        if (!found[key]) continue;
        const uid = guests[i]!.uid;
        if (openUid !== uid) {
          setOpenUid(uid);
          return;
        }
        if (fields.current[key]) {
          fields.current[key]!.focus();
          return;
        }
      }
    }
    const group = found.arrival
      ? 'arrival'
      : found.departure
        ? 'departure'
        : found.parking
          ? 'parking'
          : null;
    if (group) document.getElementById(group)?.querySelector('button')?.focus();
  };

  const changeGuest = (i: number, patch: Partial<GuestDraft>) =>
    setGuests((list) => list.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  const commitGuest = (i: number, patch: Partial<GuestDraft>) => {
    const list = guests.map((g, j) => (j === i ? { ...g, ...patch } : g));
    setGuests(list);
    save({ guests: list });
    return list;
  };

  const blurName = (i: number) => {
    setError(nameKey(i), guests[i]!.fullName.trim() ? null : t('error_name'));
    save();
  };

  const blurDoc = (i: number) => {
    const g = guests[i]!;
    const raw = g.docNumber;
    const typed = raw.trim();
    const next = typed && g.docType === 'rut' ? formatDocument('rut', typed) : raw;
    const list = commitGuest(i, { docNumber: next });
    setError(docKey(i), docErrorFor(list[i]!));
  };

  const chooseCount = (n: number) => {
    const last = guests[guests.length - 1]?.docType ?? defaultDocType;
    const list = Array.from({ length: n }, (_, i) => guests[i] ?? newGuest(freshUid(), last));
    setGuests(list);
    setPartySize(n);
    setErrors({});
    setMessage(null);
    setNav((c) => c + 1);
    save({ guests: list, partySize: n });
  };

  const addGuest = () => {
    const list = [
      ...guests,
      newGuest(freshUid(), guests[guests.length - 1]?.docType ?? defaultDocType),
    ];
    setGuests(list);
    if (askCount) setPartySize(list.length);
    setErrors({});
    setMessage(null);
    setOpenUid(list[list.length - 1]!.uid);
    save(askCount ? { guests: list, partySize: list.length } : { guests: list });
  };

  const removeGuest = (i: number) => {
    const list = guests.filter((_, j) => j !== i);
    setGuests(list);
    if (askCount) setPartySize(list.length);
    setErrors({});
    setMessage(null);
    if (openUid === guests[i]!.uid) setOpenUid(null);
    save(askCount ? { guests: list, partySize: list.length } : { guests: list });
  };

  const onBack = () => {
    setPartySize(0);
    setErrors({});
    setMessage(null);
    setNav((n) => n + 1);
    save({ partySize: 0 });
  };

  const send = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await submitCheckin({
        id,
        guests: guests.map((g) => ({
          fullName: g.fullName.trim(),
          docType: g.docType,
          docNumber: g.docNumber.trim(),
        })),
        arrivalTime: arrival,
        departureTime: departure,
        parking: parking === 'yes',
        vehiclePlate: parking === 'yes' && plate.trim() ? plate.trim() : undefined,
      }).catch(() => ({ ok: false, error: 'generic', expected: undefined }));
      if (r.ok) {
        setRegistered(
          guests.map((g) => ({
            fullName: g.fullName.trim(),
            docType: g.docType,
            docLast4: maskDoc(g.docNumber.trim()),
          })),
        );
        setDone(true);
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else if (r.error === 'already_submitted') {
        window.location.reload();
      } else if (r.error === 'party_size') {
        setMessage(t('error_party', { n: r.expected ?? partySize }));
      } else {
        setMessage(
          r.error === 'expired' || r.error === 'not_found'
            ? t('error_expired')
            : t('error_generic'),
        );
      }
    });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!counted || blocked.current) return;
    const found = allErrors();
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage(found.party ?? null);
      focusFirst(found);
      return;
    }
    send();
  };

  const addLimit = askCount ? Math.max(maxGuests, 1) : expectedGuests;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <Welcome stay={stay} line={stayLine} times={times} />

      {!counted ? (
        <section className="grid gap-4">
          <h2
            id="count-title"
            ref={countRef}
            tabIndex={-1}
            className={cn(SECTION_TITLE, 'focus:outline-none')}
          >
            {t('count_title')}
          </h2>
          <div role="group" aria-labelledby="count-title" className="flex flex-wrap gap-2">
            {Array.from({ length: Math.max(maxGuests, 1) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-label={n === 1 ? t('count_one') : t('count_many', { n })}
                onClick={() => chooseCount(n)}
                className={cn(
                  'border-border bg-card shadow-xs hover:border-primary/40 hover:bg-accent ease-lux h-11 min-w-11 rounded-lg border px-2 text-base font-semibold tabular-nums transition-colors duration-200 active:scale-[0.97]',
                  FOCUS,
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-3" aria-labelledby="guests-heading">
            <h2 id="guests-heading" ref={guestsHeadingRef} tabIndex={-1} className="sr-only">
              {t('guests_sr', { n: guests.length })}
            </h2>
            <p className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-foreground flex items-start gap-2.5 rounded-xl border p-3 text-sm font-medium">
              <TriangleAlert aria-hidden className="dark:text-warning mt-0.5 h-4 w-4 shrink-0" />
              {askCount ? t('notice') : t('notice_n', { n: expectedGuests })}
            </p>
            {guests.map((g, i) => (
              <GuestRow
                key={g.uid}
                index={i}
                guest={g}
                errors={errors}
                open={openUid === g.uid}
                onToggle={() => setOpenUid(openUid === g.uid ? null : g.uid)}
                onRemove={guests.length > 1 ? () => removeGuest(i) : null}
                bindRef={bindRef}
                onChange={(patch) => {
                  changeGuest(i, patch);
                  if (patch.fullName !== undefined) setError(nameKey(i), null);
                  if (patch.docNumber !== undefined) setError(docKey(i), null);
                }}
                onCommit={(patch) => commitGuest(i, patch)}
                onBlurName={() => blurName(i)}
                onBlurDoc={() => blurDoc(i)}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="xl"
              onClick={addGuest}
              disabled={guests.length >= addLimit}
              aria-describedby={guests.length >= addLimit ? 'add-guest-limit' : undefined}
            >
              <Plus className="h-4 w-4" />
              {t('add_guest')}
            </Button>
            {guests.length >= addLimit && (
              <p id="add-guest-limit" className="text-muted-foreground text-xs">
                {t(askCount ? 'add_guest_max' : 'add_guest_limit', { n: addLimit })}
              </p>
            )}
          </section>

          <section className="grid gap-3">
            <h2 className={SECTION_TITLE}>{t('details_title')}</h2>
            <Card className="divide-border divide-y">
              <div className="grid gap-3 p-4">
                <GroupLabel id="arrival-label">{t('arrival')}</GroupLabel>
                <GroupError id="arrival-err" message={errors.arrival} />
                <Chips
                  id="arrival"
                  labelId="arrival-label"
                  options={arrivalSlots(stay.checkinTime).map((v) => ({ value: v, label: v }))}
                  value={arrival}
                  onChange={(v) => {
                    setArrival(v);
                    setError('arrival', null);
                    save({ arrival: v });
                  }}
                  className="grid-cols-3 tabular-nums"
                  invalid={Boolean(errors.arrival)}
                  describedById={errors.arrival ? 'arrival-err' : undefined}
                />
              </div>

              <div className="grid gap-3 p-4">
                <GroupLabel id="departure-label">{t('departure')}</GroupLabel>
                <GroupError id="departure-err" message={errors.departure} />
                <Chips
                  id="departure"
                  labelId="departure-label"
                  options={departureSlots(stay.checkoutTime).map((v) => ({
                    value: v,
                    label: v,
                  }))}
                  value={departure}
                  onChange={(v) => {
                    setDeparture(v);
                    setError('departure', null);
                    save({ departure: v });
                  }}
                  className="grid-cols-2 tabular-nums"
                  invalid={Boolean(errors.departure)}
                  describedById={errors.departure ? 'departure-err' : undefined}
                />
              </div>

              <div className="grid gap-3 p-4">
                <GroupLabel id="parking-label">{t('parking')}</GroupLabel>
                <GroupError id="parking-err" message={errors.parking} />
                <Chips
                  id="parking"
                  labelId="parking-label"
                  options={[
                    { value: 'yes' as const, label: t('parking_yes') },
                    { value: 'no' as const, label: t('parking_no') },
                  ]}
                  value={parking}
                  onChange={(v) => {
                    setParking(v);
                    setError('parking', null);
                    save({ parking: v });
                  }}
                  className="grid-cols-2"
                  invalid={Boolean(errors.parking)}
                  describedById={errors.parking ? 'parking-err' : undefined}
                />
                {parking === 'yes' && (
                  <div className="animate-fade-in">
                    <Field id="plate" label={t('plate')} optional>
                      <Input
                        id="plate"
                        autoCapitalize="characters"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={12}
                        enterKeyHint="done"
                        placeholder={t('plate_ph')}
                        value={plate}
                        onChange={(e) => setPlate(e.target.value)}
                        onBlur={() => save()}
                        className="h-12 text-base uppercase tracking-wider"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </Card>
          </section>

          <p className="text-muted-foreground text-xs">
            <PrivacyLink />
          </p>

          <div className="grid gap-2">
            {saveState && (
              <p
                role="status"
                className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
              >
                {t(saveState === 'stale' ? 'save_conflict' : 'save_failed')}
                {saveState === 'stale' && (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className={cn(
                      'text-foreground rounded-sm font-semibold underline underline-offset-2',
                      FOCUS,
                    )}
                  >
                    {t('reload')}
                  </button>
                )}
              </p>
            )}
            {message && (
              <p role="alert" className="text-destructive text-sm font-medium">
                {message}
              </p>
            )}
          </div>

          <div className="bg-background/90 border-border fixed inset-x-0 bottom-0 z-10 border-t pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:pb-0 sm:pt-8 sm:backdrop-blur-none">
            <div className="mx-auto grid w-full max-w-md gap-2 px-4 sm:max-w-lg sm:px-0">
              <Button
                type="submit"
                size="xl"
                className="w-full px-4"
                disabled={pending || saveState === 'stale'}
              >
                {pending ? t('sending') : t('submit')}
              </Button>
              {askCount && (
                <Button type="button" variant="ghost" size="lg" className="w-full" onClick={onBack}>
                  <ChevronLeft className="h-4 w-4" />
                  {t('back')}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </form>
  );
}
