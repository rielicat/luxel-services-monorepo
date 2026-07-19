import 'server-only';
import { devMockEnabled } from '@/lib/dev-mock';

/**
 * Outbound transactional email via Resend. Gated on RESEND_API_KEY + RESEND_FROM
 * so a fresh environment without email configured simply no-ops (the same pattern
 * as the payment providers), and never throws. In dev-mock mode (no real key) it
 * simulates a successful send so notification flows are testable end-to-end.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM) || devMockEnabled();
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ id: string } | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!key || !from) {
    if (devMockEnabled()) {
      console.warn('email.dev_mock', { to: opts.to, subject: opts.subject });
      return { id: `dev_mock_${Date.now()}` };
    }
    return null;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string };
    return json.id ? { id: json.id } : null;
  } catch {
    return null;
  }
}
