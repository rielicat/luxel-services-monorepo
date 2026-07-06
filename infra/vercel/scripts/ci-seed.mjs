// Seeds the Pulumi config for the vercel stack from the live web project, in CI.
// Sets web.name + teamId, and copies the admin shared secrets from the web
// project's env. Run with the `prod` stack selected and PULUMI_CONFIG_PASSPHRASE
// set (cwd = infra/vercel). Idempotent — safe to run every deploy.
//
// Secret values are passed to `pulumi config set` as args (not printed); for any
// web env var that is Vercel-'sensitive' (unreadable via API), provide a fallback
// GitHub secret ADMIN_<KEY>.

import { execFileSync } from 'child_process';
import { vcProjects } from './vercel-api.mjs';

const SHARED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
];

// stdout ignored so secret values never surface in logs; stderr passes through.
const pset = (args) =>
  execFileSync('pulumi', ['config', 'set', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

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

// The web project's env vars are all Vercel-"sensitive" (write-only — never
// returned by the API), so the admin values come from ADMIN_<KEY> repo secrets.
const stillMissing = [];
for (const key of SHARED_KEYS) {
  const value = process.env[`ADMIN_${key}`];
  if (value) pset(['--secret', '--path', `adminSharedEnv.${key}`, value]);
  else stillMissing.push(`ADMIN_${key}`);
}

if (stillMissing.length) {
  console.error(`Missing repo secrets: ${stillMissing.join(', ')}.`);
  process.exit(1);
}

console.log(`Seeded web.name=${web.name} + ${SHARED_KEYS.length} admin env keys.`);
