// Dumps the live Vercel projects and prints the config you need to fill before
// adopting. Read-only.
//   VERCEL_API_TOKEN=... [VERCEL_TEAM_ID=...] pnpm --filter @luxel/infra-vercel export

import { vc, vcProjects } from './vercel-api.mjs';

const SHARED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
];

const projects = await vcProjects();
console.log('# ===== Vercel projects =====');
for (const p of projects) {
  const link = p.link
    ? `${p.link.type}:${p.link.org}/${p.link.repo}@${p.link.productionBranch}`
    : 'none';
  console.log(
    `  ${p.id}  name=${p.name}  root=${p.rootDirectory ?? '(root)'}  framework=${p.framework ?? '-'}  git=${link}`,
  );
}

const web =
  projects.find((p) => p.rootDirectory === 'apps/web') ||
  projects.find((p) => /web|serviciosluxel/.test(p.name));
if (!web) {
  console.log(
    '\n# Could not auto-identify the web project (rootDirectory apps/web). Set web.name manually.',
  );
  process.exit(0);
}

console.log('\n# ===== web project =====');
console.log(`#   pulumi config set web.name ${web.name}`);
const { domains } = await vc(`/v9/projects/${web.id}/domains`);
console.log('#   domains:', (domains || []).map((d) => d.name).join(', '));

console.log('\n# ===== admin shared env (seed adminSharedEnv) =====');
const { envs } = await vc(`/v9/projects/${web.id}/env?decrypt=true`);
for (const key of SHARED_KEYS) {
  const hit = (envs || [])
    .filter((e) => e.key === key)
    .sort((a, b) => (a.target?.includes('production') ? -1 : 1))[0];
  if (hit && typeof hit.value === 'string' && hit.value !== '') {
    console.log(
      `pulumi config set --secret --path adminSharedEnv.${key} '${hit.value.replace(/'/g, "'\\''")}'`,
    );
  } else {
    console.log(`# ${key}: not readable via API (sensitive) — set it manually:`);
    console.log(`#   pulumi config set --secret --path adminSharedEnv.${key} '<value>'`);
  }
}
