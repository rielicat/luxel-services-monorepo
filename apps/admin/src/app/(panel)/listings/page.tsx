import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';
import { autoAssignListings } from '@luxel/core/channels/auto-assign';
import { PageHeader } from '@/components/ui';
import {
  listUnclaimedListings,
  listAssignments,
  listAssignableCustomers,
} from './assignment-actions';
import { AssignmentsManager } from './assignments-manager';

export const dynamic = 'force-dynamic';

export default async function AdminListingsPage() {
  const t = await getTranslations('assign');
  await autoAssignListings().catch(() => null);
  const [unclaimed, assigned, customers] = await Promise.all([
    listUnclaimedListings(),
    listAssignments(),
    listAssignableCustomers(),
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader icon={Building2} title={t('title')}>
        {t('subtitle')}
      </PageHeader>

      <AssignmentsManager
        unclaimed={unclaimed.listings ?? []}
        unclaimedFailed={!unclaimed.ok}
        assigned={assigned.rows ?? []}
        assignedFailed={!assigned.ok}
        customers={customers.customers ?? []}
      />
    </div>
  );
}
