import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Surface } from './types';

export interface AgentClaims {
  surface: Surface;
  principalId: string;
  signedIn: boolean;
  customerId: string | null;
  propertyId: string | null;
  threadId: string | null;
  webSessionId: string | null;
  exp: number;
}

export const AGENT_TOKEN_TTL_SECONDS = 60 * 60 * 12;

function secret(): string | null {
  return process.env.LUXEL_AGENT_TOKEN_SECRET?.trim() || null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function newPrincipalId(): string {
  return randomUUID();
}

export function mintAgentToken(
  claims: Omit<AgentClaims, 'exp'>,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  const key = secret();
  if (!key) return null;
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(
    JSON.stringify({ ...claims, exp: nowSeconds + AGENT_TOKEN_TTL_SECONDS } satisfies AgentClaims),
  );
  const payload = `${header}.${body}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifyAgentToken(
  token: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): AgentClaims | null {
  const key = secret();
  if (!key || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];

  const expected = sign(`${header}.${body}`, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AgentClaims;
    if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null;
    if (claims.surface !== 'web' && claims.surface !== 'guest') return null;
    if (typeof claims.principalId !== 'string' || !claims.principalId) return null;
    return claims;
  } catch {
    return null;
  }
}
