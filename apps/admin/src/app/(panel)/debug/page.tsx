import { Wrench } from 'lucide-react';
import Link from 'next/link';
import { runProbes, listDebugProperties } from './actions';
import { DebugBench } from './debug-bench';

export const dynamic = 'force-dynamic';

export default async function AdminDebugPage() {
  const [probes, properties] = await Promise.all([runProbes(), listDebugProperties()]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
          <Wrench className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Diagnóstico</h1>
          <p className="text-muted-foreground text-sm">
            Estado de integraciones y enlaces de prueba.{' '}
            <Link href="/admin/listings" className="text-primary hover:underline">
              Asignar propiedades
            </Link>{' '}
            ·{' '}
            <Link href="/admin/inbox" className="text-primary hover:underline">
              Bandeja de huéspedes
            </Link>
          </p>
        </div>
      </div>

      <DebugBench probes={probes.probes ?? []} properties={properties.rows ?? []} />
    </div>
  );
}
