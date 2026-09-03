import { CreditCard } from 'lucide-react';
import {
  PLAN_COMMISSION_PCT,
  PLAN_FIXED_CLP,
  PLAN_HYBRID_BASE_CLP,
  PLAN_HYBRID_PCT,
} from '@luxel/shared/plan-pricing';
import { createServiceClient } from '@/lib/supabase';
import { formatCLP, fmtDateTime } from '@/lib/utils';
import { Card, Pill } from '@/components/ui';
import { submitPlanStatus } from './actions';

export const dynamic = 'force-dynamic';

const COUNT_BATCH = 20;

const PLAN_LABEL: Record<string, string> = {
  fixed: 'Fijo',
  hybrid: 'Mixto',
  commission: 'Comisión',
};
const STATUS_LABEL: Record<string, string> = {
  requested: 'Solicitado',
  active: 'Activo',
  cancelled: 'Cancelado',
};
const STATUS_TONE: Record<string, string> = {
  requested: 'new',
  active: 'converted',
  cancelled: 'lost',
};

interface PlanRow {
  id: string;
  customer_id: string;
  plan: string;
  status: string;
  created_at: string;
  updated_at: string;
  customers: { email: string; full_name: string | null } | null;
}

interface PlansView {
  rows: PlanRow[];
  properties: Record<string, number>;
  failed: boolean;
}

function monthlyAmount(plan: string): string {
  if (plan === 'fixed') return `${formatCLP(PLAN_FIXED_CLP)}/mes`;
  if (plan === 'hybrid') {
    return `${formatCLP(PLAN_HYBRID_BASE_CLP)}/mes + ${Math.round(PLAN_HYBRID_PCT * 100)}% de ingresos`;
  }
  return `${Math.round(PLAN_COMMISSION_PCT * 100)}% de ingresos`;
}

function committedClp(plan: string): number {
  if (plan === 'fixed') return PLAN_FIXED_CLP;
  if (plan === 'hybrid') return PLAN_HYBRID_BASE_CLP;
  return 0;
}

async function countProperties(
  supabase: ReturnType<typeof createServiceClient>,
  customerIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < customerIds.length; i += COUNT_BATCH) {
    const batch = customerIds.slice(i, i + COUNT_BATCH);
    const results = await Promise.all(
      batch.map(async (id) => {
        const { count, error } = await supabase
          .from('properties')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', id);
        if (error) {
          console.warn('admin.plans_property_count_failed', {
            customerId: id,
            message: error.message,
          });
          return [id, 0] as const;
        }
        return [id, count ?? 0] as const;
      }),
    );
    for (const [id, count] of results) counts[id] = count;
  }
  return counts;
}

async function getPlans(): Promise<PlansView> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('plan_subscriptions')
    .select('id, customer_id, plan, status, created_at, updated_at, customers(email, full_name)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('admin.plans_query_failed', { message: error.message });
    return { rows: [], properties: {}, failed: true };
  }

  const rows = (data ?? []) as unknown as PlanRow[];
  const ids = [...new Set(rows.map((r) => r.customer_id))];
  return { rows, properties: await countProperties(supabase, ids), failed: false };
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed: failedId } = await searchParams;
  const { rows, properties, failed } = await getPlans();
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const committed = rows
    .filter((r) => r.status === 'active')
    .reduce((sum, r) => sum + committedClp(r.plan), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <CreditCard className="text-primary h-5 w-5" /> Planes
        </h1>
        <p className="text-muted-foreground text-sm">
          {rows.length} en total · {counts.requested ?? 0} por activar · {counts.active ?? 0}{' '}
          activos · base fija {formatCLP(committed)}/mes
        </p>
      </div>

      {failed && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-xl border px-4 py-3 text-sm font-medium"
        >
          No se pudieron cargar los planes. Recarga la página o revisa los registros del servidor.
        </div>
      )}

      {!failed && failedId && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-xl border px-4 py-3 text-sm font-medium"
        >
          No se pudo cambiar el estado del plan. El plan sigue como estaba.
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs uppercase">
                <th className="px-4 py-3 font-medium">Anfitrión</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Monto mensual</th>
                <th className="px-4 py-3 font-medium">Propiedades</th>
                <th className="px-4 py-3 font-medium">Actualizado</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border/60 hover:bg-muted/40 border-b">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.customers?.full_name ?? '—'}</div>
                    <div className="text-muted-foreground text-xs">
                      {r.customers?.email ?? r.customer_id}
                    </div>
                  </td>
                  <td className="px-4 py-3">{PLAN_LABEL[r.plan] ?? r.plan}</td>
                  <td className="px-4 py-3 tabular-nums">{monthlyAmount(r.plan)}</td>
                  <td className="text-muted-foreground px-4 py-3 tabular-nums">
                    {properties[r.customer_id] ?? 0}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {fmtDateTime(r.updated_at ?? r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {r.status !== 'active' && (
                        <form action={submitPlanStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="active" />
                          <button className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold">
                            Activar
                          </button>
                        </form>
                      )}
                      {r.status !== 'cancelled' && (
                        <form action={submitPlanStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="cancelled" />
                          <button className="border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-semibold">
                            Cancelar
                          </button>
                        </form>
                      )}
                    </div>
                    {failedId === r.id && (
                      <p className="text-destructive mt-1 text-xs font-semibold">
                        No se pudo actualizar
                      </p>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-4 py-10 text-center">
                    {failed
                      ? 'No se pudo leer la lista de planes.'
                      : 'Aún no hay planes solicitados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
