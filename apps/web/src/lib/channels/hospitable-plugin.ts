import 'server-only';
import type { ChannelAccess, ChannelPlugin, ChannelSyncOutcome } from './types';
import { hospitableAccess } from './scope';
import { syncHospitableAccount } from './hospitable-sync';
import { autoAssignListings } from './auto-assign';

export const hospitablePlugin: ChannelPlugin = {
  id: 'hospitable',

  capabilities: {
    sendsGuestMessages: true,
    hasHostIdentity: true,
    webhooks: true,
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
      contacts: r.contacts,
      replies: r.aiReplies,
      relinked: r.relinked,
    };
  },

  async autoAssign() {
    const r = await autoAssignListings();
    return r.ok ? { assigned: r.assigned } : null;
  },
};
