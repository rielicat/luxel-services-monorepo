import 'server-only';
import type { ChannelPlugin, ProviderId } from './types';
import { hospitablePlugin } from './hospitable-plugin';

const PLUGINS: Record<ProviderId, ChannelPlugin> = {
  hospitable: hospitablePlugin,
};

export function channelPlugin(id: string): ChannelPlugin | null {
  return PLUGINS[id.trim().toLowerCase() as ProviderId] ?? null;
}
