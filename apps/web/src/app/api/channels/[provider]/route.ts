import { handleInboundMessage } from '@/lib/channels/pipeline';
import { devMockEnabled } from '@/lib/dev-mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Inbound message webhook. `local` is the dev/testing channel (dev-mock only);
 *  `hospitable` is the real one (signature + listing→property mapping, gated). */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  if (provider === 'local') {
    if (!devMockEnabled()) return new Response('Disabled', { status: 403 });
    const body = (await req.json().catch(() => null)) as {
      propertyId?: string;
      externalThreadId?: string;
      guestName?: string;
      body?: string;
    } | null;
    if (!body?.propertyId || !body?.body) return Response.json({ ok: false }, { status: 400 });
    const r = await handleInboundMessage({
      propertyId: body.propertyId,
      channel: 'local',
      externalThreadId: body.externalThreadId ?? null,
      guestName: body.guestName ?? null,
      body: body.body,
    });
    return Response.json(r);
  }

  if (provider === 'hospitable') {
    // Real webhook: verify HOSPITABLE_WEBHOOK_SECRET, map the listing to a property,
    // then call handleInboundMessage. Credential-gated; not wired until go-live.
    return new Response('Not configured', { status: 501 });
  }

  return new Response('Unknown provider', { status: 404 });
}
