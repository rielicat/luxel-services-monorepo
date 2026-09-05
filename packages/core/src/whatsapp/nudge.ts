import 'server-only';

export interface HostConnectNudge {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  inviteUrl: string;
}

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
