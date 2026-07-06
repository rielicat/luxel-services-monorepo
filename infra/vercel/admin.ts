import * as pulumi from '@pulumi/pulumi';
import * as vercel from '@pulumiverse/vercel';
import { teamId, gitRepo, productionBranch, admin, adminSharedEnv, slug } from './config';

// The operator panel — a NEW Vercel project (created, not adopted), git-linked
// so Vercel deploys it on every push to the production branch.
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

function envVar(key: string, value: pulumi.Input<string>, sensitive: boolean) {
  return new vercel.ProjectEnvironmentVariable(`admin-env-${slug(key)}`, {
    projectId: adminProject.id,
    key,
    value,
    targets: TARGETS,
    sensitive,
    teamId,
  });
}

// Non-secret config (public / operator settings).
const PLAIN_ENV: Record<string, string> = {
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/sign-in',
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: '/',
  LUXEL_ADMIN_DOMAINS: 'serviciosluxel.cl',
};

// Shared secrets mirrored from the web project.
const SHARED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
];

export const adminEnv = [
  ...Object.entries(PLAIN_ENV).map(([k, v]) => envVar(k, v, false)),
  ...SHARED_KEYS.map((k) =>
    envVar(
      k,
      // Fail the apply loudly rather than shipping an empty secret (which would
      // build a broken admin app). Seed these via scripts/export-vercel.mjs.
      adminSharedEnv.apply((m) => {
        const v = m[k];
        if (!v) throw new Error(`adminSharedEnv.${k} is not set — seed it before deploying admin`);
        return v;
      }),
      true,
    ),
  ),
];
