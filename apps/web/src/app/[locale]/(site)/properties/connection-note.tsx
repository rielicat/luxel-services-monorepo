'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import type { HostConnection } from '@/lib/host/queries';

export function ConnectionNote({ connection }: { connection: HostConnection }) {
  const t = useTranslations('channel');
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
