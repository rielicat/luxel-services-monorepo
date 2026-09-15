export const CHANNEL_RECONCILE_PATH = '/api/channels/reconcile';

export interface ChannelReconcileResult {
  ok: boolean;
  connections: number;
  properties: number;
  created: number;
  failed: number;
}
