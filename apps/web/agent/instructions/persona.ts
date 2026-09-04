import { defineDynamic, defineInstructions } from 'eve/instructions';
import { guestPersona, webPersona } from '@luxel/core/agent/personas';
import { readCaller } from '../lib/caller';

export default defineDynamic({
  events: {
    'session.started': (_event, ctx) => {
      const caller = readCaller(ctx.session.auth.current);
      if (!caller) return null;
      return defineInstructions({
        content:
          caller.surface === 'guest' ? guestPersona() : webPersona({ signedIn: caller.signedIn }),
      });
    },
  },
});
