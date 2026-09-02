import * as fs from 'fs';
import * as path from 'path';

let map: Record<string, string> = {};
try {
  map = JSON.parse(fs.readFileSync(path.join(__dirname, 'imports.json'), 'utf8'));
} catch {}

const adopting = process.env.LUXEL_CF_ADOPT === '1';

export function importId(name: string): string | undefined {
  return adopting ? map[name] : undefined;
}
