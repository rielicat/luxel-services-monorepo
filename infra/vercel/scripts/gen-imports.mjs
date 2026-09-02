import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { vc, vcProjects } from './vercel-api.mjs';

const WEB_NAME = process.env.WEB_PROJECT_NAME || '';

const projects = await vcProjects();
const web =
  (WEB_NAME && projects.find((p) => p.name === WEB_NAME)) ||
  projects.find((p) => p.rootDirectory === 'apps/web') ||
  projects.find((p) => /web|serviciosluxel/.test(p.name));

if (!web) {
  console.error('Could not find the web project. Set WEB_PROJECT_NAME=<name> and retry.');
  process.exit(1);
}

const imports = { 'web-project': web.id };

const { domains } = await vc(`/v9/projects/${web.id}/domains`);
for (const d of domains || []) {
  if (d.name === 'serviciosluxel.cl') imports['web-domain-apex'] = `${web.id}/${d.name}`;
  else if (d.name === 'www.serviciosluxel.cl') imports['web-domain-www'] = `${web.id}/${d.name}`;
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'imports.json');
fs.writeFileSync(out, JSON.stringify(imports, null, 2) + '\n');
console.log(`Wrote ${Object.keys(imports).length} import ids → ${out}`);
console.log(JSON.stringify(imports, null, 2));
console.log(
  '\nNext:  LUXEL_VC_ADOPT=1 pulumi up   (adopts the web project + domains; creates the admin project)',
);
