'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ghostButton, primaryButton } from '@/components/ui';
import { TEAM_URL } from '@/lib/crew';
import { refreshCrew } from './actions';

const MESSAGE: Record<string, string> = {
  denied: 'No tienes permiso de operador. Vuelve a entrar.',
  sync_failed: 'No pudimos actualizar. Prueba de nuevo en un momento.',
};

export function CrewToolbar() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <a className={primaryButton} href={TEAM_URL} target="_blank" rel="noreferrer">
          <span className="inline-flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" /> Agregar o editar
          </span>
        </a>
        <button
          type="button"
          disabled={pending}
          className={ghostButton}
          onClick={() =>
            start(async () => {
              setNote(null);
              const result = await refreshCrew();
              if (!result.ok) {
                setNote({
                  ok: false,
                  text: MESSAGE[result.error ?? ''] ?? 'No pudimos actualizar.',
                });
                return;
              }
              setNote({
                ok: true,
                text: result.failed
                  ? `Actualizado. ${result.failed} cuenta(s) no respondieron.`
                  : 'Actualizado.',
              });
              router.refresh();
            })
          }
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} />
            {pending ? 'Actualizando…' : 'Actualizar'}
          </span>
        </button>
      </div>
      {note && (
        <p className={cn('text-xs font-medium', note.ok ? 'text-success' : 'text-destructive')}>
          {note.text}
        </p>
      )}
    </div>
  );
}
