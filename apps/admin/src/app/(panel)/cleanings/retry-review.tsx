'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { retryCleaningReview } from './actions';

const MESSAGE: Record<string, string> = {
  denied: 'No tienes permiso de operador. Vuelve a entrar.',
  invalid: 'Esa revisión ya no existe.',
};

export function RetryReview({ runId }: { runId: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-2 grid gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setNote(null);
            const result = await retryCleaningReview(runId);
            if (!result.ok) {
              setNote(MESSAGE[result.error ?? ''] ?? 'No pudimos reintentar.');
              return;
            }
            setNote(
              result.started
                ? 'Reintento en marcha.'
                : 'Quedó en cola. El worker la toma en la pasada de la noche.',
            );
          })
        }
        className="border-border hover:bg-accent inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {pending ? 'Reintentando…' : 'Reintentar la revisión'}
      </button>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  );
}
