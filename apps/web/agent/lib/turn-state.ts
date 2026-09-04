import { defineState } from 'eve/context';

export interface TurnRecord {
  handoff: boolean;
  lastGuestMessage: string;
  reply: string;
}

export const turnRecord = defineState<TurnRecord>('lux.turn', () => ({
  handoff: false,
  lastGuestMessage: '',
  reply: '',
}));
