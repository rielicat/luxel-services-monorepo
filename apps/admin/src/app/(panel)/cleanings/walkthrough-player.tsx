'use client';

import { useState, useTransition } from 'react';
import { PlayCircle } from 'lucide-react';
import { loadWalkthroughUrl } from './actions';

const ERROR_MESSAGE: Record<string, string> = {
  denied: 'No tienes permiso de operador. Vuelve a entrar.',
  invalid: 'Ese video ya no existe.',
  purged: 'Ese video ya se borró por retención. Queda el inventario confirmado.',
  unavailable: 'No pudimos pedir el video al worker. Revisa LUXEL_WORKER_URL.',
};

export function WalkthroughPlayer({ walkthroughId }: { walkthroughId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState('video/mp4');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (url) {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        className="bg-muted mt-2 w-full max-w-md rounded-lg"
      >
        <source src={url} type={contentType} />
      </video>
    );
  }

  return (
    <div className="mt-2 grid gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await loadWalkthroughUrl(walkthroughId);
            if (result.ok && result.url) {
              setContentType(result.contentType ?? 'video/mp4');
              setUrl(result.url);
            } else {
              setError(result.error ?? 'unavailable');
            }
          })
        }
        className="border-border hover:bg-accent inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        <PlayCircle className="h-4 w-4" />
        {pending ? 'Pidiendo el video…' : 'Ver el recorrido'}
      </button>
      {error && <p className="text-warning text-xs">{ERROR_MESSAGE[error] ?? error}</p>}
    </div>
  );
}
