import { Wrench } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { runProbes, listDebugProperties } from './actions';
import { DebugBench } from './debug-bench';

export const dynamic = 'force-dynamic';

export default async function AdminDebugPage() {
  const [probes, properties] = await Promise.all([runProbes(), listDebugProperties()]);

  return (
    <div>
      <PageHeader icon={Wrench} title="Diagnóstico">
        Estado de integraciones y enlaces de prueba.{' '}
        <Link href="/listings" className="text-primary hover:underline">
          Asignar propiedades
        </Link>{' '}
        ·{' '}
        <Link href="/inbox" className="text-primary hover:underline">
          Bandeja de huéspedes
        </Link>
      </PageHeader>

      <DebugBench probes={probes.probes ?? []} properties={properties.rows ?? []} />
    </div>
  );
}
