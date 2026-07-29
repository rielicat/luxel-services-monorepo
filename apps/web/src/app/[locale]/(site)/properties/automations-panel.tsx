'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Pencil, LineChart, Plus, ExternalLink, TriangleAlert, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { ADDON_KEYS, ADDONS, type AddonKey } from '@/lib/addons/catalog';
import { setAiEnabled, setPriceOptimization, updateGuestInfo } from './copilot-actions';
import { subscribeAddon, unsubscribeAddon, markPricelabsConnected } from './addon-actions';
import type { LiveDay } from './stays-timeline';

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const PRICING_SETUP_URL = '/api/go/pricing-setup';

function Switch({
  on,
  disabled,
  onClick,
  label,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        on ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          on ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

/** The two automations Luxel sells, front and center: AI guest replies (part of
 *  the plan) and dynamic pricing (a paid add-on). Everything else PriceLabs
 *  offers hangs off the extras modal. */
export function AutomationsPanel({
  propertyId,
  aiEnabled,
  priceOptEnabled,
  guestInfo,
  liveDays,
  activeAddons,
  pricelabsStatus,
}: {
  propertyId: string;
  aiEnabled: boolean;
  priceOptEnabled: boolean;
  guestInfo: string | null;
  liveDays: LiveDay[] | null;
  activeAddons: AddonKey[];
  pricelabsStatus: 'off' | 'pending_connection' | 'connected';
}) {
  const t = useTranslations('ai');
  const ta = useTranslations('addons');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ai, setAi] = useState(aiEnabled);
  const [teachOpen, setTeachOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [offerAddon, setOfferAddon] = useState<AddonKey | null>(null);
  // Which add-on opened the setup guide — the pricing hand-over has a step the
  // others don't (turning Airbnb's own smart pricing off).
  const [stepsFor, setStepsFor] = useState<AddonKey | null>(null);
  const [info, setInfo] = useState(guestInfo ?? '');
  const [saved, setSaved] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const pricingActive = activeAddons.includes('dynamic_pricing');

  const toggleAi = () => {
    const next = !ai;
    setAi(next);
    start(async () => {
      const r = await setAiEnabled({ propertyId, enabled: next });
      if (!r.ok) setAi(!next);
      router.refresh();
    });
  };

  // The switch never activates an unpaid add-on: without the subscription it
  // opens the offer instead.
  const togglePricing = () => {
    if (!pricingActive) {
      setOfferAddon('dynamic_pricing');
      return;
    }
    run(() => setPriceOptimization({ propertyId, enabled: !priceOptEnabled }));
  };

  const priced = (liveDays ?? []).slice(0, 30).filter((d) => d.priceClp != null);
  const min = priced.length ? Math.min(...priced.map((d) => d.priceClp!)) : null;
  const max = priced.length ? Math.max(...priced.map((d) => d.priceClp!)) : null;
  const avg = priced.length
    ? Math.round(priced.reduce((s, d) => s + d.priceClp!, 0) / priced.length)
    : null;

  // Subscribed and not paused — but only "live" once the host's authorisation
  // actually landed. Affirmative copy and styling key off `pricingLive`, so
  // the card never claims to be managing rates before it can.
  const pricingOn = pricingActive && priceOptEnabled;
  const pricingLive = pricingOn && pricelabsStatus === 'connected';

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <Card className={cn('transition-colors', ai && 'border-primary/40')}>
        <CardContent className="grid gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  ai ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <Bot className="h-[18px] w-[18px]" />
              </span>
              <span className="text-sm font-semibold">{t('toggle_title')}</span>
            </span>
            <Switch on={ai} disabled={pending} onClick={toggleAi} label={t('toggle_title')} />
          </div>
          <p className="text-muted-foreground text-xs">{ai ? t('on_body') : t('off_body')}</p>
          {ai && (
            <button
              type="button"
              onClick={() => setTeachOpen(true)}
              className="text-primary flex w-fit items-center gap-1 text-xs font-medium hover:underline"
            >
              <Pencil className="h-3 w-3" /> {t('teach_link')}
            </button>
          )}
        </CardContent>
      </Card>

      <Card className={cn('transition-colors', pricingLive && 'border-primary/40')}>
        <CardContent className="grid gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  pricingLive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <LineChart className="h-[18px] w-[18px]" />
              </span>
              <span className="text-sm font-semibold">{t('price_title')}</span>
            </span>
            <Switch
              on={pricingOn}
              disabled={pending}
              onClick={togglePricing}
              label={t('price_title')}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {!pricingActive
              ? ta('price_offer_body', { price: clp(ADDONS.dynamic_pricing.priceClp) })
              : !priceOptEnabled
                ? ta('paused_body')
                : pricingLive
                  ? t('price_on_body')
                  : ta('price_waiting_body')}
          </p>

          {pricingActive && pricelabsStatus !== 'connected' && (
            <button
              type="button"
              onClick={() => setStepsFor('dynamic_pricing')}
              className="text-warning flex w-fit items-center gap-1 text-xs font-medium hover:underline"
            >
              <TriangleAlert className="h-3 w-3" /> {ta('pending_connection')}
            </button>
          )}
          {pricingActive && pricelabsStatus === 'connected' && (
            <p
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                priceOptEnabled ? 'text-success' : 'text-muted-foreground',
              )}
            >
              <Check className="h-3 w-3" />
              {priceOptEnabled ? ta('connected') : ta('paused_still_connected')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {avg != null && (
              <button
                type="button"
                onClick={() => setPricesOpen(true)}
                className="text-primary flex w-fit items-center gap-1 text-xs font-medium hover:underline"
              >
                <LineChart className="h-3 w-3" /> {t('price_preview_link')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setExtrasOpen(true)}
              className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs font-medium transition-colors"
            >
              <Plus className="h-3 w-3" /> {ta('extras_link')}
            </button>
          </div>
        </CardContent>
      </Card>

      <Modal open={teachOpen} onClose={() => setTeachOpen(false)} title={t('teach_title')}>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('teach_body')}</p>
          <textarea
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            rows={5}
            value={info}
            onChange={(e) => setInfo(e.target.value)}
            placeholder={t('info_ph')}
          />
          <Button
            size="sm"
            className="justify-self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateGuestInfo({ propertyId, guestInfo: info });
                if (r.ok) {
                  setSaved(true);
                  setTimeout(() => {
                    setSaved(false);
                    setTeachOpen(false);
                  }, 800);
                }
              })
            }
          >
            {saved ? t('saved') : t('save')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={pricesOpen}
        onClose={() => setPricesOpen(false)}
        title={t('price_preview_title')}
      >
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t('price_preview_body')}</p>
          {avg != null && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  [t('price_min'), min],
                  [t('price_avg'), avg],
                  [t('price_max'), max],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="border-border rounded-lg border p-3">
                  <p className="font-display text-lg font-semibold tabular-nums">{clp(v!)}</p>
                  <p className="text-muted-foreground text-xs">{label}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs">{t('price_preview_note')}</p>
        </div>
      </Modal>

      {/* The add-on offer: price up front, cancel-anytime, no dark patterns. */}
      <Modal
        open={offerAddon != null}
        onClose={() => setOfferAddon(null)}
        title={offerAddon ? ta(`${offerAddon}_title`) : ''}
      >
        {offerAddon && (
          <div className="grid gap-3">
            <p className="font-display text-2xl font-semibold tabular-nums">
              {clp(ADDONS[offerAddon].priceClp)}
              <span className="text-muted-foreground ml-1 text-sm font-normal">
                {ta('per_month')}
              </span>
            </p>
            <p className="text-sm">{ta(`${offerAddon}_body`)}</p>
            {ADDONS[offerAddon].needsPricelabs && (
              <p className="text-muted-foreground text-xs">{ta('setup_note')}</p>
            )}
            {!ADDONS[offerAddon].selfServe && (
              <p className="text-muted-foreground text-xs">{ta('external_note')}</p>
            )}
            <Button
              className="justify-self-start"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await subscribeAddon({ propertyId, addon: offerAddon });
                  if (r.ok) {
                    const next = ADDONS[offerAddon].needsPricelabs ? offerAddon : null;
                    setOfferAddon(null);
                    setStepsFor(next);
                  }
                })
              }
            >
              {ta('activate')}
            </Button>
            <p className="text-muted-foreground text-xs">{ta('cancel_note')}</p>
          </div>
        )}
      </Modal>

      {/* Everything else PriceLabs offers, each priced on its own. */}
      <Modal open={extrasOpen} onClose={() => setExtrasOpen(false)} title={ta('extras_title')}>
        <div className="grid gap-2">
          {ADDON_KEYS.map((key) => {
            const active = activeAddons.includes(key);
            return (
              <div key={key} className="border-border grid gap-1.5 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{ta(`${key}_title`)}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {clp(ADDONS[key].priceClp)}
                    <span className="text-muted-foreground text-xs"> {ta('per_month')}</span>
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">{ta(`${key}_body`)}</p>
                {active ? (
                  <div className="flex items-center gap-2">
                    {ADDONS[key].needsPricelabs && pricelabsStatus !== 'connected' ? (
                      <button
                        type="button"
                        onClick={() => setStepsFor(key)}
                        className="text-warning flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        <TriangleAlert className="h-3 w-3" /> {ta('pending_connection')}
                      </button>
                    ) : (
                      <span className="text-success flex items-center gap-1 text-xs font-medium">
                        <Check className="h-3 w-3" /> {ta('active')}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => unsubscribeAddon({ propertyId, addon: key }))}
                    >
                      {ta('cancel')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="justify-self-start"
                    disabled={pending}
                    onClick={() => {
                      setExtrasOpen(false);
                      setOfferAddon(key);
                    }}
                  >
                    {ta('activate')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* The one step no API can do for the host: authorising the pricing tool
          against their own account. */}
      <Modal open={stepsFor != null} onClose={() => setStepsFor(null)} title={ta('steps_title')}>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">{ta('steps_intro')}</p>
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
            {stepsFor === 'dynamic_pricing' && <li>{ta('step_smart_pricing')}</li>}
            <li>{ta('step_1')}</li>
            <li>{ta('step_2')}</li>
            <li>{ta('step_3')}</li>
          </ol>
          <a
            href={PRICING_SETUP_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary flex w-fit items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> {ta('steps_cta')}
          </a>
          <p className="text-muted-foreground text-xs">{ta('steps_help')}</p>
          <Button
            size="sm"
            variant={pricelabsStatus === 'connected' ? 'ghost' : 'default'}
            className="justify-self-start"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await markPricelabsConnected({
                  propertyId,
                  connected: pricelabsStatus !== 'connected',
                });
                setStepsFor(null);
              })
            }
          >
            {pricelabsStatus === 'connected' ? ta('mark_pending') : ta('mark_done')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
