export type Surface = 'web' | 'guest';

export type MemoryTier = 'global' | 'property' | 'host';

export type NoteSource = 'distilled' | 'operator' | 'agent' | 'pricing';

export interface MemoryNote {
  id: string;
  noteKey: string | null;
  body: string;
  weight: number;
}

export interface RecallMessage {
  id?: string;
  content: string;
}

export interface ConversationDigest {
  id: string;
  sessionId: string;
  surface: Surface;
  propertyId: string | null;
  threadId: string | null;
  summary: string;
  facts: string[];
  outcome: string | null;
  createdAt: string;
}

export interface AgentSessionRecord {
  sessionId: string;
  principalId: string;
  surface: Surface;
  propertyId: string | null;
  threadId: string | null;
}

export const PLAYBOOK_SCOPE = 'global';

export const MAX_PLAYBOOK_NOTES = 24;

export const MAX_PROPERTY_NOTES = 8;

export const MAX_PROPERTY_DIGESTS = 6;
