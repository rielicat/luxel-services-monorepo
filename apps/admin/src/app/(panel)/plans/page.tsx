import { CreditCard } from 'lucide-react';
import { PLAN_COMMISSION_PCT, planMonthlyCost } from '@luxel/shared/plan-pricing';
import { createServiceClient } from '@/lib/supabase';
import { formatCLP } from '@/lib/utils';
import {
  Alert,
  DataTable,
  EmptyRow,
  PageHeader,
  Pill,
  ghostButton,
  primaryButton,
} from '@/components/ui';
import { submitPlanStatus } from './actions';

export const dynamic = 'force-dynamic';

const PCT_LABEL = `${Math.round(PLAN_COMMISSION_PCT * 100)}%`;

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
  status: string;
  customers: { email: string; full_name: string | null } | null;
}

interface HostListings {
  count: number;
  nicknames: string[];
}

interface PlansView {
  rows: PlanRow[];
  listings: Record<string, HostListings>;
  revenue: Record<string, number>;
  unknownCleaning: Record<string, number>;
  failed: boolean;
  statsFailed: boolean;
}

function santiagoToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function monthBounds(today: string): { from: string; to: string } {
  const from = `${today.slice(0, 7)}-01`;
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { from, to: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01` };
}

async function getPlans(now: Date = new Date()): Promise<PlansView> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('plan_subscriptions')
    .select('id, customer_id, status, created_at, customers(email, full_name)')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('admin.plans_query_failed', { message: error.message });
    return {
      rows: [],
      listings: {},
      revenue: {},
      unknownCleaning: {},
      failed: true,
      statsFailed: true,
    };
  }

  const rows = (data ?? []) as unknown as PlanRow[];
  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  if (!customerIds.length) {
    return {
      rows,
      listings: {},
      revenue: {},
      unknownCleaning: {},
      failed: false,
      statsFailed: false,
    };
  }

  const { data: propertyData, error: propertyError } = await supabase
    .from('properties')
    .select('id, owner_id, nickname')
    .in('owner_id', customerIds);

  if (propertyError) {
    console.error('admin.plans_properties_failed', { message: propertyError.message });
    return {
      rows,
      listings: {},
      revenue: {},
      unknownCleaning: {},
      failed: false,
      statsFailed: true,
    };
  }

  const properties = (propertyData ?? []) as unknown as {
    id: string;
    owner_id: string;
    nickname: string | null;
  }[];
  const listings: Record<string, HostListings> = {};
  const ownerByProperty: Record<string, string> = {};
  for (const id of customerIds) listings[id] = { count: 0, nicknames: [] };
  for (const property of properties) {
    ownerByProperty[property.id] = property.owner_id;
    const entry = listings[property.owner_id];
    if (!entry) continue;
    entry.count += 1;
    if (property.nickname) entry.nicknames.push(property.nickname);
  }

  const revenue: Record<string, number> = {};
  const unknownCleaning: Record<string, number> = {};
  for (const id of customerIds) {
    revenue[id] = 0;
    unknownCleaning[id] = 0;
  }

  const today = santiagoToday(now);
  const { from, to } = monthBounds(today);
  const until = to < today ? to : today;
  if (!properties.length || until <= from) {
    return { rows, listings, revenue, unknownCleaning, failed: false, statsFailed: false };
  }

  const { data: revenueData, error: revenueError } = await supabase
    .from('reservation_revenue')
    .select('property_id, host_revenue_clp, cleaning_fee_clp')
    .in(
      'property_id',
      properties.map((p) => p.id),
    )
    .gte('departure_date', from)
    .lt('departure_date', until);

  if (revenueError) {
    console.error('admin.plans_revenue_failed', { message: revenueError.message });
    return { rows, listings, revenue: {}, unknownCleaning: {}, failed: false, statsFailed: true };
  }

  for (const row of (revenueData ?? []) as unknown as {
    property_id: string;
    host_revenue_clp: number | null;
    cleaning_fee_clp: number | null;
  }[]) {
    const owner = ownerByProperty[row.property_id];
    if (!owner) continue;
    const base = Math.max(0, (row.host_revenue_clp ?? 0) - (row.cleaning_fee_clp ?? 0));
    revenue[owner] = (revenue[owner] ?? 0) + base;
    if (row.cleaning_fee_clp == null) unknownCleaning[owner] = (unknownCleaning[owner] ?? 0) + 1;
  }

  return { rows, listings, revenue, unknownCleaning, failed: false, statsFailed: false };
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed: failedId } = await searchParams;
  const { rows, listings, revenue, unknownCleaning, failed, statsFailed } = await getPlans();
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const billable = rows
    .filter((r) => r.status === 'active')
    .reduce((sum, r) => sum + planMonthlyCost(revenue[r.customer_id] ?? 0), 0);

  return (
    <div>
      <PageHeader icon={CreditCard} title="Planes">
        <p>
          {rows.length} en total · {counts.requested ?? 0} por activar · {counts.active ?? 0}{' '}
          activos
          {!statsFailed && <> · {formatCLP(billable)} por facturar este mes</>}
        </p>
        <p className="mt-1">
          Plan único: {PCT_LABEL} de las reservas del anfitrión, sin la tarifa de limpieza, IVA
          incluido. Luxel cobra cada mes, fuera de la plataforma.
        </p>
      </PageHeader>

      {failed && (
        <Alert tone="error">
          No se pudieron cargar los planes. Recarga la página o revisa los registros del servidor.
        </Alert>
      )}

      {!failed && statsFailed && (
        <Alert tone="warning">
          No se pudieron calcular los ingresos del mes. Los montos aparecen sin dato.
        </Alert>
      )}

      {!failed && failedId && (
        <Alert tone="error">
          No se pudo cambiar el estado del plan. El plan sigue como estaba.
        </Alert>
      )}

      <DataTable
        head={[
          'Anfitrión',
          'Propiedades',
          'Base del mes',
          `Cobro ${PCT_LABEL}`,
          'Estado',
          'Acciones',
        ]}
      >
        {rows.map((r) => {
          const hostListings = listings[r.customer_id];
          const commissionBase = revenue[r.customer_id];
          const unknown = unknownCleaning[r.customer_id] ?? 0;
          return (
            <tr key={r.id} className="border-border/60 hover:bg-muted/40 border-b">
              <td className="px-4 py-3">
                <div className="font-medium">{r.customers?.full_name ?? '—'}</div>
                <div className="text-muted-foreground text-xs">
                  {r.customers?.email ?? r.customer_id}
                </div>
              </td>
              <td className="px-4 py-3">
                {hostListings ? (
                  <>
                    <div className="tabular-nums">{hostListings.count}</div>
                    {hostListings.nicknames.length > 0 && (
                      <div className="text-muted-foreground text-xs">
                        {hostListings.nicknames.join(' · ')}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="text-muted-foreground px-4 py-3 tabular-nums">
                {commissionBase === undefined ? '—' : formatCLP(commissionBase)}
                {unknown > 0 && (
                  <div className="text-warning text-xs font-medium">
                    {unknown === 1
                      ? '1 estadía sin tarifa de limpieza reconocida — revísala antes de cobrar'
                      : `${unknown} estadías sin tarifa de limpieza reconocida — revísalas antes de cobrar`}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 font-medium tabular-nums">
                {commissionBase === undefined
                  ? '—'
                  : `${formatCLP(planMonthlyCost(commissionBase))}/mes`}
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
                      <button className={primaryButton}>Activar</button>
                    </form>
                  )}
                  {r.status !== 'cancelled' && (
                    <form action={submitPlanStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button className={ghostButton}>Cancelar</button>
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
          );
        })}
        {!rows.length && (
          <EmptyRow span={6}>
            {failed ? 'No se pudo leer la lista de planes.' : 'Aún no hay planes solicitados.'}
          </EmptyRow>
        )}
      </DataTable>
    </div>
  );
}
