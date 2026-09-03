'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { updatePropertyContext } from './copilot-actions';

const STEPS = [
  { title: 'step1_title', fields: ['wifi', 'devices'] },
  { title: 'step2_title', fields: ['arrival', 'parking', 'lift'] },
  { title: 'step3_title', fields: ['warnings', 'supplies'] },
  { title: 'step4_title', fields: ['recommend', 'transport', 'notes'] },
] as const;

type Field = (typeof STEPS)[number]['fields'][number];

const FIELDS: Field[] = STEPS.flatMap((s) => s.fields);
const FIELD_MAX = 400;

const emptyAnswers = (source?: Record<string, string> | null): Record<Field, string> =>
  Object.fromEntries(FIELDS.map((f) => [f, source?.[f] ?? ''])) as Record<Field, string>;

function AutoTextarea({
  value,
  onValueChange,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string;
  onValueChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={3}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="border-input bg-card placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-ring/25 shadow-xs hover:border-primary/30 min-h-20 w-full resize-none overflow-hidden rounded-lg border px-3 py-2 text-sm leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-[3px]"
      {...rest}
    />
  );
}

export function ContextPanel({
  propertyId,
  guestContext,
}: {
  propertyId: string;
  guestContext: Record<string, string> | null;
}) {
  const t = useTranslations('context');
  const uid = useId();
  const [answers, setAnswers] = useState(() => emptyAnswers(guestContext));
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [editing, setEditing] = useState(() => !FIELDS.some((f) => guestContext?.[f]?.trim()));
  const [pending, start] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    (editing ? headingRef.current : summaryRef.current)?.focus();
  }, [step, editing]);

  const answered = FIELDS.filter((f) => answers[f].trim());
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  const save = (collapse: boolean) =>
    start(async () => {
      const payload: Record<string, string> = {};
      for (const f of FIELDS) {
        const value = answers[f].trim();
        if (value) payload[f] = value;
      }
      const r = await updatePropertyContext({ propertyId, answers: payload });
      setStatus(r.ok ? 'saved' : 'failed');
      if (r.ok && collapse) setEditing(false);
    });

  return (
    <Card>
      <CardContent className="grid gap-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="grid gap-1.5">
            <h2 className="font-display text-base font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{t('body')}</p>
          </div>
        </div>

        {editing ? (
          <div className="grid gap-6">
            <div className="grid gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <h3
                  ref={headingRef}
                  id={`${uid}-step`}
                  tabIndex={-1}
                  className="text-sm font-semibold focus-visible:outline-none"
                >
                  {t(current.title)}
                </h3>
                <p className="text-muted-foreground text-xs font-medium tabular-nums">
                  {t('step_of', { i: step + 1, n: STEPS.length })}
                </p>
              </div>
              <div className="bg-muted h-1 w-full overflow-hidden rounded-full" aria-hidden>
                <span
                  className="bg-primary ease-lux block h-full rounded-full transition-all duration-300"
                  style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                />
              </div>
            </div>

            <div role="group" aria-labelledby={`${uid}-step`} className="grid gap-6">
              {current.fields.map((field) => (
                <div key={field} className="grid gap-2">
                  <Label htmlFor={`${uid}-${field}`} className="leading-snug">
                    {t(`label_${field}`)}
                  </Label>
                  <AutoTextarea
                    id={`${uid}-${field}`}
                    maxLength={FIELD_MAX}
                    value={answers[field]}
                    onValueChange={(value) => {
                      setAnswers((prev) => ({ ...prev, [field]: value }));
                      setStatus('idle');
                    }}
                    placeholder={t(`ph_${field}`)}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {step > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    <ArrowLeft className="h-4 w-4" /> {t('back')}
                  </Button>
                )}
                <div className="flex-1" />
                {!last && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => save(false)}
                  >
                    {t('save_draft')}
                  </Button>
                )}
                {last ? (
                  <Button type="button" size="sm" disabled={pending} onClick={() => save(true)}>
                    <Check className="h-4 w-4" /> {t('save')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  >
                    {t('next')} <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p
                className={cn(
                  'text-xs',
                  status === 'failed' ? 'text-destructive font-medium' : 'text-muted-foreground',
                )}
                aria-live="polite"
              >
                {status === 'failed'
                  ? t('failed')
                  : status === 'saved'
                    ? t('saved')
                    : t('optional')}
              </p>
              <p className="text-muted-foreground text-xs">{t('no_secrets')}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <p
              ref={summaryRef}
              tabIndex={-1}
              className="text-sm font-semibold focus-visible:outline-none"
            >
              {answered.length ? t('summary_title') : t('summary_empty')}
            </p>
            {answered.length > 0 && (
              <>
                <dl className="grid gap-4">
                  {answered.map((field) => (
                    <div key={field} className="grid gap-1">
                      <dt className="text-muted-foreground text-xs font-medium">
                        {t(`label_${field}`)}
                      </dt>
                      <dd className="text-sm leading-relaxed">{answers[field]}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted-foreground text-xs">
                  {t('summary_count', { i: answered.length, n: FIELDS.length })}
                </p>
              </>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setStep(0);
                  setStatus('idle');
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" /> {t('edit')}
              </Button>
              <p className="text-muted-foreground text-xs" aria-live="polite">
                {status === 'saved' ? t('saved') : ''}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
