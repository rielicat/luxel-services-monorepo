import { defineMemory } from 'eve/memory';
import { readCaller } from '../lib/caller';
import { propertyMemory } from '../lib/memory';

export default defineMemory({
  description: 'Lo que Lux ya sabe de este alojamiento por conversaciones anteriores.',
  provider: propertyMemory(),
  scope(ctx) {
    return readCaller(ctx.session.auth.current)?.propertyId ?? null;
  },
  visibility: 'scope',
});
