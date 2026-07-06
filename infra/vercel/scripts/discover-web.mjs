// Sets the non-secret identity config Pulumi needs to adopt the web project:
// its Vercel project name (and teamId, if the projects live under a Team). Run
// with the `prod` stack selected (cwd = infra/vercel). Both values are
// non-secret project metadata, read straight from the Vercel API.

import { execFileSync } from 'child_process';
import { vcProjects } from './vercel-api.mjs';

const pset = (args) => execFileSync('pulumi', ['config', 'set', ...args], { stdio: 'inherit' });

const projects = await vcProjects();
const web =
  projects.find((p) => p.rootDirectory === 'apps/web') ||
  projects.find((p) => /web|serviciosluxel/.test(p.name));
if (!web) {
  console.error(
    'Web project not found. If it lives under a Vercel Team, set the VERCEL_TEAM_ID secret.',
  );
  process.exit(1);
}

pset(['--path', 'web.name', web.name]);
if (process.env.VERCEL_TEAM_ID) pset(['teamId', process.env.VERCEL_TEAM_ID]);
console.log(`web project: ${web.name} (${web.id})`);
