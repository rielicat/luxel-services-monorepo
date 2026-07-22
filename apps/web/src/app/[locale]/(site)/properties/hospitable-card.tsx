'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plug, RefreshCw, CheckCircle2, Unplug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { connectHospitable, disconnectHospitable, syncHospitable } from './channel-actions';
import type { HostConnection } from '@/lib/host/queries';

const inputCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
  const [note, setNote] = useState<string | null>(null);

  if (connection) {
    return (
      <Card className="border-success/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-success/15 text-success flex h-9 w-9 items-center justify-center rounded-full">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t('connected_title')}</p>
              <p className="text-muted-foreground text-xs">
                {connection.last_synced_at
                  ? t('last_sync', {
                      date: new Intl.DateTimeFormat('es-CL', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'America/Santiago',
                      }).format(new Date(connection.last_synced_at)),
                    })
                  : t('never_synced')}
                {note ? ` · ${note}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await syncHospitable();
                  if (r.ok) setNote(t('sync_done', { n: r.reservations ?? 0 }));
                  router.refresh();
                })
              }
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
              {t('sync')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={t('disconnect')}
              onClick={() =>
                start(async () => {
                  await disconnectHospitable();
                  router.refresh();
                })
              }
            >
              <Unplug className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
