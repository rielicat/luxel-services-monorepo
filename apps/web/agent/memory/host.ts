import { defineMemory } from 'eve/memory';
import { readCaller } from '../lib/caller';
import { hostMemory } from '../lib/memory';

export default defineMemory({
  description: 'Preferencias duraderas del anfitrión con sesión iniciada.',
  provider: hostMemory(),
  scope(ctx) {
    const caller = readCaller(ctx.session.auth.current);
    if (!caller || caller.surface !== 'web' || !caller.signedIn) return null;
    return caller.customerId;
  },
  visibility: 'scope',
});
