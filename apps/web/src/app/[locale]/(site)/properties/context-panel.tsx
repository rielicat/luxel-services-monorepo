'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { updatePropertyContext } from './copilot-actions';

const STEPS = [
  { title: 'step1_title', fields: ['wifi', 'devices'] },
  { title: 'step2_title', fields: ['arrival', 'parking'] },
  { title: 'step3_title', fields: ['warnings', 'recommend', 'notes'] },
] as const;

type Field = (typeof STEPS)[number]['fields'][number];

const FIELDS: Field[] = STEPS.flatMap((s) => s.fields);
const FIELD_MAX = 400;

const emptyAnswers = (source?: Record<string, string> | null): Record<Field, string> =>
  Object.fromEntries(FIELDS.map((f) => [f, source?.[f] ?? ''])) as Record<Field, string>;

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
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    (open ? headingRef.current : openerRef.current)?.focus();
  }, [step, open]);

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
      if (r.ok && collapse) setOpen(false);
    });

  return (
    <Card>
      <CardContent className="grid gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="grid flex-1 gap-1">
            <h2 className="font-display text-base font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {answered.length
                ? t('summary_count', { i: answered.length, n: FIELDS.length })
                : t('body')}
            </p>
          </div>
          <Button
            ref={openerRef}
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={open}
            aria-controls={`${uid}-form`}
            onClick={() => {
              setStatus('idle');
              setOpen((v) => !v);
            }}
          >
            {open ? (
              <>
                <X className="h-4 w-4" /> {t('close')}
              </>
            ) : answered.length ? (
              <>
                <Pencil className="h-4 w-4" /> {t('edit')}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {t('add')}
              </>
            )}
          </Button>
        </div>

        {!open && status === 'saved' && (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {t('saved')}
          </p>
        )}

        {open && (
          <div id={`${uid}-form`} className="border-border grid gap-4 border-t pt-4">
            <div className="grid gap-2">
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

            <div role="group" aria-labelledby={`${uid}-step`} className="grid gap-3">
              {current.fields.map((field) => (
                <div key={field} className="grid gap-1.5">
                  <Label htmlFor={`${uid}-${field}`} className="text-xs leading-snug">
                    {t(`label_${field}`)}
                  </Label>
                  <textarea
                    id={`${uid}-${field}`}
                    rows={2}
                    maxLength={FIELD_MAX}
                    value={answers[field]}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAnswers((prev) => ({ ...prev, [field]: value }));
                      setStatus('idle');
                    }}
                    placeholder={t(`ph_${field}`)}
                    className="border-input bg-card placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-ring/25 hover:border-primary/30 w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-[3px]"
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-2">
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
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
