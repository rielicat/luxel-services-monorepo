import * as fs from 'fs';
import * as path from 'path';

/**
 * One-time adoption of already-live Cloudflare resources.
 *
 * `scripts/gen-imports.mjs` writes `imports.json` ({ resourceName: cloudflareId })
 * from the real account. During the adoption run — `LUXEL_CF_ADOPT=1 pulumi up` —
 * each resource is imported (adopted into state) instead of created, so nothing is
 * destroyed or recreated. If a declared property doesn't match the live value,
 * Pulumi fails the import loudly rather than mutating production.
 *
 * After adoption, run without the flag: `importId` returns undefined, the `import`
 * option drops off, and resources are managed normally. New resources (e.g. the
 * _dmarc record) have no entry here, so they are created as usual.
 *
 * NB: this module is intentionally NOT named `imports.ts` — Pulumi's ts-node
 * resolves `./imports` to the sibling `imports.json` (the `.json` extension wins
 * over `.ts` at require time), which silently shadows the module.
 */
let map: Record<string, string> = {};
try {
  map = JSON.parse(fs.readFileSync(path.join(__dirname, 'imports.json'), 'utf8'));
} catch {
  // No imports.json — normal steady state after adoption.
}

const adopting = process.env.LUXEL_CF_ADOPT === '1';

export function importId(name: string): string | undefined {
  return adopting ? map[name] : undefined;
}
