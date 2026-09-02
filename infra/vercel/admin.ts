import * as vercel from '@pulumiverse/vercel';
import { teamId, gitRepo, productionBranch, admin, slug } from './config';

export const adminProject = new vercel.Project('admin', {
  name: admin.name,
  framework: 'nextjs',
  rootDirectory: admin.rootDirectory,
  teamId,
  gitRepository: { type: 'github', repo: gitRepo, productionBranch },
});

export const adminDomain = new vercel.ProjectDomain('admin-panel', {
  projectId: adminProject.id,
  domain: admin.domain,
  teamId,
});

const TARGETS = ['production', 'preview'];
const PLAIN_ENV: Record<string, string> = {
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/sign-in',
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/',
  LUXEL_ADMIN_ORG_SLUG: 'servicios-luxel-1783354109102489708',
};

export const adminEnv = Object.entries(PLAIN_ENV).map(
  ([key, value]) =>
    new vercel.ProjectEnvironmentVariable(`admin-env-${slug(key)}`, {
      projectId: adminProject.id,
      key,
      value,
      targets: TARGETS,
      sensitive: false,
      teamId,
    }),
);
