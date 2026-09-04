import { defineHook } from 'eve/hooks';
import { readCaller } from '../lib/caller';
import { emit } from '../lib/events';
import { turnRecord } from '../lib/turn-state';

const HANDOFF_TOOLS = new Set(['escalate_to_human', 'escalate_to_luxel']);

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default defineHook({
  events: {
    'turn.started'() {
      turnRecord.update(() => ({ handoff: false, lastGuestMessage: '', reply: '' }));
    },

    async 'message.received'(event, ctx) {
      const caller = readCaller(ctx.session.auth.current);
      if (!caller) return;
      const body = textOf((event.data as { message?: unknown }).message).trim();
      if (!body) return;
      turnRecord.update((s) => ({ ...s, lastGuestMessage: body }));
      if (caller.surface !== 'web') return;
      await emit({
        kind: 'web_message',
        sessionId: caller.webSessionId ?? ctx.session.id,
        customerId: caller.customerId,
        distinctId: caller.customerId ?? caller.principalId,
        direction: 'in',
        body,
      });
    },

    'actions.requested'(event) {
      const actions = (event.data as unknown as { actions?: readonly { name?: string }[] }).actions;
      if ((actions ?? []).some((a) => a.name && HANDOFF_TOOLS.has(a.name))) {
        turnRecord.update((s) => ({ ...s, handoff: true }));
      }
    },

    'message.completed'(event) {
      const data = event.data as { message?: unknown; finishReason?: unknown };
      if (data.finishReason !== 'stop') return;
      const reply = textOf(data.message).trim();
      if (reply) turnRecord.update((s) => ({ ...s, reply }));
    },

    async 'turn.completed'(_event, ctx) {
      const caller = readCaller(ctx.session.auth.current);
      if (!caller || caller.surface !== 'web') return;
      const state = turnRecord.get();

      if (state.reply) {
        await emit({
          kind: 'web_message',
          sessionId: caller.webSessionId ?? ctx.session.id,
          customerId: caller.customerId,
          distinctId: caller.customerId ?? caller.principalId,
          direction: 'out',
          body: state.reply,
          handoff: state.handoff,
        });
      }
      if (state.handoff) {
        await emit({
          kind: 'lead',
          sessionId: caller.webSessionId ?? ctx.session.id,
          customerId: caller.customerId,
          message: state.lastGuestMessage || null,
        });
      }
    },
  },
});
