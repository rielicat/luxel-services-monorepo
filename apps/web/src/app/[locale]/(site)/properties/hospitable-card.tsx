'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plug, CheckCircle2, Unplug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { connectHospitable, disconnectHospitable } from './channel-actions';
import type { HostConnection } from '@/lib/host/queries';

const inputCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Connected accounts sync themselves on every visit — no card, no buttons.
 *  Just a quiet trust line with the last sync time and the disconnect escape
 *  hatch. */
export function ConnectionNote({ connection }: { connection: HostConnection }) {
  const t = useTranslations('hospitable');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-2 px-1 text-xs">
      <span className="flex items-center gap-1.5">
        <CheckCircle2 className="text-success h-3.5 w-3.5" />
        {t('connected_title')}
        {' · '}
        {connection.last_synced_at
          ? t('last_sync', {
              date: new Intl.DateTimeFormat('es-CL', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'America/Santiago',
              }).format(new Date(connection.last_synced_at)),
            })
          : t('syncing_now')}
      </span>
      <button
        type="button"
        disabled={pending}
        aria-label={t('disconnect')}
        className="hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-50"
        onClick={() =>
          start(async () => {
            await disconnectHospitable();
            router.refresh();
          })
        }
      >
        <Unplug className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Connect-your-Airbnb card: the host pastes the Luxel-issued connection code
 *  (a PMS access token, internally) → verified against the live API → stored
 *  encrypted → first sync runs immediately. */
export function HospitableCard({ connection }: { connection: HostConnection | null }) {
  const t = useTranslations('hospitable');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (connection) return null;

  return (
    <Card>
      <CardContent className="grid gap-3 p-4">
        <div className="flex items-start gap-2.5">
          <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
            <Plug className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">{t('connect_title')}</p>
            <p className="text-muted-foreground text-xs">{t('connect_body')}</p>
          </div>
        </div>
        {!open ? (
          <Button size="sm" className="justify-self-start" onClick={() => setOpen(true)}>
            {t('connect_cta')}
          </Button>
        ) : (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const r = await connectHospitable({ token: token.trim() });
                if (!r.ok) {
                  setError(r.error === 'invalid_token' ? t('error_invalid') : t('error_generic'));
                  return;
                }
                setToken('');
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <input
              className={inputCls}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t('token_ph')}
              autoComplete="off"
            />
            <p className="text-muted-foreground text-xs">{t('token_help')}</p>
            {error && <p className="text-destructive text-xs">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={pending || token.trim().length < 20}>
                {pending ? t('connecting') : t('connect_confirm')}
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
