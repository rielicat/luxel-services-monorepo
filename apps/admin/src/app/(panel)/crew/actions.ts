'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { syncAllConnectedAccounts } from '@luxel/core/channels/sync-all';

export interface CrewSyncResult {
  ok: boolean;
  error?: string;
  accounts?: number;
  failed?: number;
}

export async function refreshCrew(): Promise<CrewSyncResult> {
  if (!(await requireAdmin())) return { ok: false, error: 'denied' };

  try {
    const sync = await syncAllConnectedAccounts();
    revalidatePath('/crew');
    return { ok: true, accounts: sync.accounts, failed: sync.failed };
  } catch (err) {
    console.error('admin.crew_refresh_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'sync_failed' };
  }
}
