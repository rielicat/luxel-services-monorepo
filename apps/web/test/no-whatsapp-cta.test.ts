import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { messages } from '@luxel/shared/i18n';

const SITE = fileURLToPath(new URL('../src', import.meta.url));

const CREW_SURFACE = /cleaning[\\/]confirm/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const sources = walk(SITE).filter((file) => !CREW_SURFACE.test(file));

const HOST_NAMESPACES = ['connect', 'chat', 'onboarding', 'properties', 'home', 'about'] as const;

describe('the website never sends anyone to WhatsApp', () => {
  it('links to no wa.me anywhere a host or a visitor reads', () => {
    const offenders = sources.filter((file) => /wa\.me/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.slice(SITE.length))).toEqual([]);
  });

  it('offers no WhatsApp call to action in the copy a host reads', () => {
    const found: string[] = [];
    for (const namespace of HOST_NAMESPACES) {
      const catalog = (messages as Record<string, unknown>)[namespace];
      if (!catalog || typeof catalog !== 'object') continue;
      for (const [key, value] of Object.entries(catalog as Record<string, unknown>)) {
        if (typeof value !== 'string') continue;
        if (/whatsapp/i.test(value)) found.push(`${namespace}.${key}`);
      }
    }
    expect(found).toEqual([]);
  });
});
