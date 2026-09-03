import 'server-only';
import { WHATSAPP_TEMPLATE_KINDS, type WhatsAppTemplateKind } from '@luxel/shared/whatsapp';
import { toE164Digits } from '@/lib/phone';
import { sendWhatsAppTemplate, sendWhatsAppViaWorker, whatsappBridgeConfigured } from './send';

export const HOST_CONNECT_NUDGE_KIND = 'host_connect_reminder';

export interface HostConnectNudge {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  inviteUrl: string;
}

export type HostNudgeFailure =
  | 'no_invite'
  | 'no_phone'
  | 'bridge_off'
  | 'template_not_approved'
  | 'send_failed';

export type HostNudgeResult =
  | { ok: true; wamid: string }
  | { ok: false; reason: HostNudgeFailure; text: string; relayed: boolean };

export function hostConnectNudgeName(input: HostConnectNudge): string {
  const first = (input.fullName ?? '').trim().split(/\s+/)[0] ?? '';
  if (first) return first;
  const local = (input.email ?? '').split('@')[0]?.trim() ?? '';
  return local || 'anfitrión';
}

export function hostConnectNudgeParams(input: HostConnectNudge): string[] {
  return [hostConnectNudgeName(input), input.inviteUrl.trim()];
}

export function hostConnectNudgeText(input: HostConnectNudge): string {
  const [name, link] = hostConnectNudgeParams(input);
  return [
    'Tu Airbnb en Luxel',
    `Hola ${name}, acá está el link para conectar tu cuenta y partir: ${link}`,
    'Lo abres, autorizas y de ahí seguimos nosotros.',
  ].join('\n');
}

export function hostConnectTemplateKind(): WhatsAppTemplateKind | null {
  const kinds: readonly string[] = WHATSAPP_TEMPLATE_KINDS;
  return kinds.includes(HOST_CONNECT_NUDGE_KIND)
    ? (HOST_CONNECT_NUDGE_KIND as WhatsAppTemplateKind)
    : null;
}

async function relayToOperator(text: string, reason: HostNudgeFailure): Promise<boolean> {
  const wamid = await sendWhatsAppViaWorker(
    `No pudimos recordarle al anfitrión por WhatsApp (${reason}). Mándaselo tú:\n${text}`,
  );
  return Boolean(wamid);
}

const RELAYED_FAILURES: HostNudgeFailure[] = ['no_phone', 'template_not_approved', 'send_failed'];

export async function sendHostConnectNudge(input: HostConnectNudge): Promise<HostNudgeResult> {
  const text = hostConnectNudgeText(input);
  const fail = async (reason: HostNudgeFailure): Promise<HostNudgeResult> => ({
    ok: false,
    reason,
    text,
    relayed: RELAYED_FAILURES.includes(reason) ? await relayToOperator(text, reason) : false,
  });

  if (!input.inviteUrl.trim()) return fail('no_invite');
  if (!whatsappBridgeConfigured()) return fail('bridge_off');

  const phone = toE164Digits(input.phone);
  if (!phone) return fail('no_phone');

  const kind = hostConnectTemplateKind();
  if (!kind) return fail('template_not_approved');

  const wamid = await sendWhatsAppTemplate(phone, kind, hostConnectNudgeParams(input));
  return wamid ? { ok: true, wamid } : fail('send_failed');
}
