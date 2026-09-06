import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../src');
const APP = path.join(SRC, 'app');
const PANEL = path.join(APP, '(panel)');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function routeOf(file: string): string | null {
  const base = path.basename(file);
  if (base !== 'page.tsx' && base !== 'route.ts') return null;
  const segments = path
    .relative(APP, path.dirname(file))
    .split(path.sep)
    .filter((s) => s && !s.startsWith('('));
  return `/${segments.join('/')}`.replace(/\/$/, '') || '/';
}

const routes = new Set(walk(APP).map(routeOf).filter(Boolean) as string[]);

const staticHrefs = walk(SRC)
  .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
  .flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/href="(\/[A-Za-z0-9\-/]*)"/g)].map((match) => ({
      file: path.relative(SRC, file),
      href: match[1],
    }));
  });

describe('panel routes', () => {
  it('finds the routes it is about to check', () => {
    expect(routes.has('/')).toBe(true);
    expect(routes.has('/listings')).toBe(true);
    expect(routes.has('/inbox')).toBe(true);
    expect(staticHrefs.length).toBeGreaterThan(0);
  });

  it('points every static internal link at a route that exists', () => {
    const broken = staticHrefs.filter(({ href }) => {
      const clean = href.length > 1 ? href.replace(/\/$/, '') : href;
      return !routes.has(clean);
    });
    expect(broken).toEqual([]);
  });

  it('keeps a loading and an error boundary on the panel', () => {
    expect(existsSync(path.join(PANEL, 'loading.tsx'))).toBe(true);
    expect(existsSync(path.join(PANEL, 'error.tsx'))).toBe(true);
  });
});
