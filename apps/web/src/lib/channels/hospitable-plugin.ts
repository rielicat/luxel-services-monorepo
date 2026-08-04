import 'server-only';
import type { ChannelAccess, ChannelPlugin, ChannelSyncOutcome } from './types';
import { hospitableAccess } from './scope';
import { syncHospitableAccount } from './hospitable-sync';
import { autoAssignListings } from './auto-assign';

/**
 * Hospitable, as a plugin.
 *
 * This file is the ONLY place that ties the vendor's modules to the scheduler.
 * Everything below it (`hospitable.ts`, `hospitable-sync.ts`) is deliberately
 * named for the vendor it speaks to; everything above it (`./registry.ts`, the
 * cron route) never learns the name. Swapping providers means writing a sibling
 * of this file, not touching either side.
 */
export const hospitablePlugin: ChannelPlugin = {
  id: 'hospitable',

  capabilities: {
    // Verified live: POST /v2/reservations/{id}/messages lands in the Airbnb
    // thread. The whole product depends on this one being true.
    sendsGuestMessages: true,
    // listings[].platform_email carries the host's own channel account, which
    // is what makes attribution automatic rather than an operator step.
    hasHostIdentity: true,
    // /v2/webhooks is 404 at PAT tier, so the scheduled sync is what runs; a
    // configured webhook is a bonus, never the mechanism relied on.
    webhooks: false,
  },

  access(customerId: string): Promise<ChannelAccess | null> {
    return hospitableAccess(customerId);
  },

  async sync(customerId: string, access: ChannelAccess, now: Date): Promise<ChannelSyncOutcome> {
    const r = await syncHospitableAccount(customerId, access.token, now, access.scope);
    return {
      ok: r.ok,
      properties: r.properties,
      reservations: r.reservations,
      replies: r.aiReplies,
      relinked: r.relinked,
    };
  },

  async autoAssign() {
    const r = await autoAssignListings();
    return r.ok ? { assigned: r.assigned } : null;
  },
};
