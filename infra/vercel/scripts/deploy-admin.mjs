// Best-effort: trigger a production deployment of the admin project from git.
// A newly-created git-linked project doesn't deploy until the next push, so on
// first bootstrap we kick one off. Never fails the pipeline — if it errors, the
// next push to main deploys admin anyway.

import { vcProjects, vcPost } from './vercel-api.mjs';

try {
  const projects = await vcProjects();
  const admin =
    projects.find((p) => p.rootDirectory === 'apps/admin') ||
    projects.find((p) => p.name === 'luxel-admin');
  if (!admin) {
    console.log('admin project not found yet — skipping deploy trigger.');
    process.exit(0);
  }
  const repoId = admin.link?.repoId;
  if (!repoId) {
    console.log('admin project has no git link repoId — skipping (will deploy on next push).');
    process.exit(0);
  }
  const dep = await vcPost('/v13/deployments', {
    name: admin.name,
    target: 'production',
    gitSource: { type: 'github', repoId, ref: 'main' },
  });
  console.log(`Triggered admin production deployment: ${dep.url || dep.id || 'ok'}`);
} catch (e) {
  console.log(`admin deploy trigger skipped: ${e.message} (next push to main will deploy it)`);
}
