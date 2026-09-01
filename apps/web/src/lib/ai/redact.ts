const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Door codes and wifi passwords live in the guest threads on purpose: the host's
 * own check-in message (Hospitable's rule, 3 days before arrival) carries them.
 * They must never reach the model as something it could repeat to the next
 * guest who asks. Values shorter than 3 characters are skipped — they would
 * blank out ordinary text.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const raw of secrets) {
    const v = raw.trim();
    if (v.length < 3) continue;
    out = out.replace(new RegExp(escapeRe(v), 'gi'), '[dato de acceso]');
  }
  return out;
}
