import { defineHook } from 'eve/hooks';
import { captureTurn } from '@luxel/core/agent/digest';
import { finalMessage, receivedMessage, requestedHandoff } from '@luxel/core/agent/stream';
import { readCaller } from '../lib/caller';
import { emit } from '../lib/events';
import { turnRecord } from '../lib/turn-state';

export default defineHook({
  events: {
    'turn.started'() {
      turnRecord.update(() => ({ handoff: false, lastGuestMessage: '', reply: '' }));
    },

    async 'message.received'(event, ctx) {
      const caller = readCaller(ctx.session.auth.current);
      if (!caller) return;
      const body = receivedMessage(event.data).trim();
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
      if (requestedHandoff(event.data)) {
        turnRecord.update((s) => ({ ...s, handoff: true }));
      }
    },

    'message.completed'(event) {
      const reply = (finalMessage(event.data) ?? '').trim();
      if (reply) turnRecord.update((s) => ({ ...s, reply }));
    },

    async 'turn.completed'(event, ctx) {
      const caller = readCaller(ctx.session.auth.current);
      if (!caller) return;
      const state = turnRecord.get();

      if (
        (caller.surface === 'web' || caller.surface === 'guest') &&
        state.lastGuestMessage &&
        state.reply
      ) {
        const turnId = (event.data as { turnId?: unknown } | null)?.turnId;
        await captureTurn({
          sessionId: ctx.session.id,
          operationId: `${ctx.session.id}:${typeof turnId === 'string' ? turnId : ctx.session.turn.id}`,
          surface: caller.surface,
          propertyId: caller.propertyId,
          threadId: caller.threadId,
          messages: [
            { role: 'user', content: state.lastGuestMessage },
            { role: 'assistant', content: state.reply },
          ],
        });
      }

      if (caller.surface !== 'web') return;

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
