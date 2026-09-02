const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const raw of secrets) {
    const v = raw.trim();
    if (v.length < 3) continue;
    out = out.replace(new RegExp(escapeRe(v), 'gi'), '[dato de acceso]');
  }
  return out;
}
