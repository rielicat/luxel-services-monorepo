import * as fs from 'fs';
import * as path from 'path';

/**
 * One-time adoption of already-live Vercel resources (the web project + its
 * domains). `scripts/gen-imports.mjs` writes `imports.json`
 * ({ resourceName: vercelImportId }). During adoption — `LUXEL_VC_ADOPT=1
 * pulumi up` — those resources are imported instead of created. New resources
 * (the admin project/domain/env) have no entry, so they are created.
 *
 * Named `adopt.ts`, not `imports.ts`: Pulumi's ts-node resolves `./imports` to
 * the sibling `imports.json`, shadowing the module.
 */
let map: Record<string, string> = {};
try {
  map = JSON.parse(fs.readFileSync(path.join(__dirname, 'imports.json'), 'utf8'));
} catch {
  // No imports.json — normal after adoption.
}

const adopting = process.env.LUXEL_VC_ADOPT === '1';

export function importId(name: string): string | undefined {
  return adopting ? map[name] : undefined;
}
