import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';
import { isClerkAdmin } from '@/lib/auth/admin';
import { autoAssignListings } from '@/lib/channels/auto-assign';
import {
  listUnclaimedListings,
  listAssignments,
  listAssignableCustomers,
} from '../../properties/assignment-actions';
import { AssignmentsManager } from './assignments-manager';

export const dynamic = 'force-dynamic';

export default async function AdminListingsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  if (!(await isClerkAdmin(userId))) notFound();

  const t = await getTranslations('assign');
  await autoAssignListings().catch(() => null);
  const [unclaimed, assigned, customers] = await Promise.all([
    listUnclaimedListings(),
    listAssignments(),
    listAssignableCustomers(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
          <Building2 className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
      </div>

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
