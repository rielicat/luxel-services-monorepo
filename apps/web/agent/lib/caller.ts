import type { Surface } from '@luxel/core/agent/types';

export type BridgeSurface = Surface | 'analyst';

export interface Caller {
  surface: BridgeSurface;
  principalId: string;
  signedIn: boolean;
  customerId: string | null;
  propertyId: string | null;
  threadId: string | null;
  webSessionId: string | null;
  simulation: boolean;
}

interface PrincipalLike {
  principalId?: string;
  attributes?: Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readCaller(principal: PrincipalLike | null | undefined): Caller | null {
  if (!principal) return null;
  const attributes = principal.attributes ?? {};
  const surface = text(attributes.surface);
  if (surface !== 'web' && surface !== 'guest') return null;
  return {
    surface,
    principalId: principal.principalId ?? 'anonymous',
    signedIn: attributes.signedIn === '1',
    customerId: text(attributes.customerId),
    propertyId: text(attributes.propertyId),
    threadId: text(attributes.threadId),
    webSessionId: text(attributes.webSessionId),
    simulation: attributes.simulation === '1',
  };
}
