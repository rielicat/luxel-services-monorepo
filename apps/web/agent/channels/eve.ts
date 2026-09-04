import { eveChannel } from 'eve/channels/eve';
import { ForbiddenError, localDev, type AuthFn } from 'eve/channels/auth';
import { verifyAgentToken } from '@luxel/core/agent/token';
import { readSession } from '@luxel/core/agent/session';

const SESSION_PATH = /\/eve\/v1\/session\/([^/?]+)/;

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function targetSessionId(request: Request): string | null {
  const match = SESSION_PATH.exec(new URL(request.url).pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function assertOwnership(request: Request, principalId: string): Promise<void> {
  const sessionId = targetSessionId(request);
  if (!sessionId) return;
  const record = await readSession(sessionId);
  if (record && record.principalId === principalId) return;
  throw new ForbiddenError({ message: 'This session belongs to another caller.' });
}

function luxelToken(): AuthFn<Request> {
  return async (request) => {
    const claims = verifyAgentToken(bearer(request));
    if (!claims) return null;
    await assertOwnership(request, claims.principalId);
    return {
      authenticator: 'luxel',
      issuer: 'serviciosluxel.cl',
      principalId: claims.principalId,
      principalType: 'user',
      subject: claims.principalId,
      attributes: {
        surface: claims.surface,
        signedIn: claims.signedIn ? '1' : '0',
        ...(claims.customerId ? { customerId: claims.customerId } : {}),
        ...(claims.propertyId ? { propertyId: claims.propertyId } : {}),
        ...(claims.threadId ? { threadId: claims.threadId } : {}),
      },
    };
  };
}

export default eveChannel({
  auth: [luxelToken(), localDev()],
});
