import { Webhook } from 'svix';
import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

/**
 * Clerk → Supabase customer sync.
 * Configure in Clerk dashboard → Webhooks → endpoint = https://serviciosluxel.cl/api/webhooks/clerk
 * Subscribe to: user.created, user.updated, user.deleted
 * Set CLERK_WEBHOOK_SECRET to the signing secret shown in Clerk.
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new NextResponse('Webhook secret not configured', { status: 500 });

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse('Missing svix headers', { status: 400 });
  }

  const body = await req.text();
  let evt: ClerkEvent;
  try {
    evt = new Webhook(secret).verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent;
  } catch {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const u = evt.data;
    const email = u.email_addresses?.[0]?.email_address ?? '';
    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null;
    const phone = u.phone_numbers?.[0]?.phone_number ?? null;

    await supabase.from('customers').upsert(
      {
        clerk_user_id: u.id,
        email,
        full_name: fullName,
        phone,
      },
      { onConflict: 'clerk_user_id' },
    );
  }

  if (evt.type === 'user.deleted' && evt.data.id) {
    await supabase.from('customers').delete().eq('clerk_user_id', evt.data.id);
  }

  return NextResponse.json({ ok: true });
}

interface ClerkEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted' | string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    phone_numbers?: Array<{ phone_number: string }>;
    first_name?: string | null;
    last_name?: string | null;
  };
}
