import { defineDynamic, defineInstructions } from 'eve/instructions';
import { guestPersona, webPersona } from '@luxel/core/agent/personas';
import { luxelPolicy } from '@luxel/core/agent/policy';
import { readCaller } from '../lib/caller';

export default defineDynamic({
  events: {
    'session.started': async (_event, ctx) => {
      const caller = readCaller(ctx.session.auth.current);
      if (!caller) return null;
      if (caller.surface !== 'guest') {
        return defineInstructions({ content: webPersona({ signedIn: caller.signedIn }) });
      }
      const policy = await luxelPolicy();
      return defineInstructions({
        content: policy ? `${guestPersona()}\n\n# ${policy}` : guestPersona(),
      });
    },
  },
});
