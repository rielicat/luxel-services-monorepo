import { describe, it, expect } from 'vitest';
import {
  calledTools,
  finalMessage,
  messageDelta,
  receivedMessage,
  requestedHandoff,
  resultWidget,
} from '@luxel/core/agent/stream';

const ACTIONS_REQUESTED = {
  actions: [
    {
      callId: 'call_2ufUJ4aEX8Nlox9nLBoKscA8',
      input: { listings: 1, monthly_revenue_clp: 900000 },
      kind: 'tool-call',
      toolName: 'get_airbnb_quote',
    },
    {
      callId: 'call_QTfH4DbUKU7bdNgiEASEKLNk',
      input: { destinations: ['pricing', 'properties'] },
      kind: 'tool-call',
      toolName: 'share_links',
    },
  ],
  sequence: 1,
  stepIndex: 1,
  turnId: 'turn_1',
};

const ACTION_RESULT = {
  result: {
    callId: 'call_QTfH4DbUKU7bdNgiEASEKLNk',
    kind: 'tool-result',
    output: {
      content: 'Se mostraron accesos directos al usuario.',
      widget: {
        kind: 'links',
        actions: [{ label: 'Ver el precio', href: '/calculator', style: 'primary' }],
      },
    },
    toolName: 'share_links',
  },
  sequence: 1,
  status: 'completed',
  stepIndex: 1,
  turnId: 'turn_1',
};

describe('agent stream shapes', () => {
  it('reads tool names from toolName, not name', () => {
    expect(calledTools(ACTIONS_REQUESTED)).toEqual(['get_airbnb_quote', 'share_links']);
  });

  it('finds a widget under result.output, not output', () => {
    const widget = resultWidget(ACTION_RESULT);
    expect(widget).not.toBeNull();
    expect(widget?.kind).toBe('links');
  });

  it('detects a handoff tool call', () => {
    expect(requestedHandoff(ACTIONS_REQUESTED)).toBe(false);
    expect(
      requestedHandoff({ actions: [{ kind: 'tool-call', toolName: 'escalate_to_human' }] }),
    ).toBe(true);
    expect(
      requestedHandoff({ actions: [{ kind: 'tool-call', toolName: 'escalate_to_luxel' }] }),
    ).toBe(true);
  });

  it('takes the final message only when the turn stops', () => {
    expect(finalMessage({ message: 'listo', finishReason: 'stop' })).toBe('listo');
    expect(finalMessage({ message: 'narración', finishReason: 'tool-calls' })).toBeNull();
  });

  it('reads a delta and a received message', () => {
    expect(messageDelta({ messageDelta: 'hola' })).toBe('hola');
    expect(messageDelta({ message: 'hola' })).toBe('');
    expect(receivedMessage({ message: 'hola' })).toBe('hola');
  });

  it('survives a malformed or empty payload', () => {
    for (const bad of [null, undefined, {}, { actions: 'nope' }, { result: null }]) {
      expect(calledTools(bad)).toEqual([]);
      expect(requestedHandoff(bad)).toBe(false);
      expect(resultWidget(bad)).toBeNull();
      expect(finalMessage(bad)).toBeNull();
    }
  });
});
