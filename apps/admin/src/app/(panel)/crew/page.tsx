import { HardHat } from 'lucide-react';
import { getOperators, getOperationPoints } from '@/lib/stats';
import { CrewManager } from './crew-manager';

export const dynamic = 'force-dynamic';

export default async function CrewPage() {
  const [operators, operationPoints] = await Promise.all([getOperators(), getOperationPoints()]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <HardHat className="text-primary h-5 w-5" /> Equipo
        </h1>
        <p className="text-muted-foreground text-sm">
          Operadores disponibles para agendar. Los inactivos no reciben nuevas reservas.
        </p>
      </div>
      <CrewManager operators={operators} operationPoints={operationPoints} />
    </div>
  );
}
