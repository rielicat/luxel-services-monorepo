'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, ghostButton } from '@/components/ui';

export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('admin.page_crashed', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold">Esta página falló</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            El resto del panel sigue funcionando. Reintenta, y si vuelve a fallar revisa los
            registros del servidor.
          </p>
          {error.digest && (
            <p className="text-muted-foreground mt-2 font-mono text-xs">digest {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className={`${ghostButton} mt-4 inline-flex items-center gap-2`}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      </div>
    </Card>
  );
}
