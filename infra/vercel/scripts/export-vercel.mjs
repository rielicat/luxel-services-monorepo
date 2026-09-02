import { vc, vcProjects } from './vercel-api.mjs';

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
  console.log('\n# Could not auto-identify the web project (rootDirectory apps/web).');
  process.exit(0);
}

console.log(`\n# web project: name=${web.name}`);
const { domains } = await vc(`/v9/projects/${web.id}/domains`);
console.log('# domains:', (domains || []).map((d) => d.name).join(', '));
