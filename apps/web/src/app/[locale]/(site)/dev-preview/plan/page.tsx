import { notFound } from 'next/navigation';
import { PlanBar, type Plan } from '../../properties/plan-bar';

export const dynamic = 'force-dynamic';

const STATES: Record<string, Plan> = {
  none: null,
  requested: { plan: 'hybrid', status: 'requested' },
  active: { plan: 'fixed', status: 'active' },
  cancelled: { plan: 'commission', status: 'cancelled' },
};

export default async function PreviewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { status } = await searchParams;
  const plan = status && status in STATES ? STATES[status]! : null;
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
      <PlanBar plan={plan} />
    </div>
  );
}
