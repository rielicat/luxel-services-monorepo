import 'server-only';
import type { ChannelPlugin, ProviderId } from './types';
import { hospitablePlugin } from './hospitable-plugin';

/**
 * The channel plugin registry.
 *
 * A static map, not a `register()` side effect: import order decides what a
 * side-effect registry contains, and a plugin that failed to load would look
 * identical to one that was never configured — which, on a strict mirror, is the
 * difference between "nothing to sync" and "delete everything not in an empty
 * set". A map that the bundler can see is checked by the compiler instead.
 */
const PLUGINS: Record<ProviderId, ChannelPlugin> = {
  hospitable: hospitablePlugin,
};

export const DEFAULT_PROVIDER: ProviderId = 'hospitable';

/** Null for any id that is not registered — callers must fail loudly rather
 *  than fall back, because falling back means mirroring the wrong account. */
export function channelPlugin(id: string): ChannelPlugin | null {
  return PLUGINS[id.trim().toLowerCase() as ProviderId] ?? null;
}

export function registeredProviderIds(): ProviderId[] {
  return Object.keys(PLUGINS) as ProviderId[];
}

/**
 * Which provider drives the mirror, from `CHANNEL_PROVIDER`.
 *
 * Explicit rather than inferred from whichever credential happens to be
 * present: a token added for a local experiment would otherwise switch
 * production onto a different provider, and the mirror is keyed per provider,
 * so that is a data event, not a config change. An unrecognised value is an
 * error, never a silent fallback to the default.
 */
export function activeChannelPlugin():
  | { ok: true; plugin: ChannelPlugin }
  | { ok: false; requested: string } {
  const requested = (process.env.CHANNEL_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase();
  const plugin = channelPlugin(requested);
  return plugin ? { ok: true, plugin } : { ok: false, requested };
}
