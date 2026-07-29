'use client';

import { useTranslations } from 'next-intl';
import { Plug, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { HostConnection } from '@/lib/host/queries';

/** Connected accounts sync themselves on every visit — no card, no buttons, and
 *  deliberately no disconnect: leaving is an operator action (offboarding), not
 *  a one-tap icon. A host who tapped it deleted their own listing assignments
 *  and orphaned the account, with no self-service way back. */
export function ConnectionNote({ connection }: { connection: HostConnection }) {
  const t = useTranslations('hospitable');
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs">
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
    </div>
  );
}

/** Not connected yet. Luxel operates the channel account, so there is nothing
 *  for the host to paste or configure: we send the invitation, they accept it on
 *  Airbnb, and their listings show up here. */
export function ConnectInviteCard() {
  const t = useTranslations('hospitable');
  const wa = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
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
        <Button size="sm" className="justify-self-start" asChild>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer noopener">
            {t('connect_cta')}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
