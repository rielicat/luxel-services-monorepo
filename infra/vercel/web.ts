import * as vercel from '@pulumiverse/vercel';
import { teamId, gitRepo, productionBranch, web, slug } from './config';
import { importId } from './adopt';

export const webProject = new vercel.Project(
  'web',
  {
    name: web.name,
    framework: 'nextjs',
    rootDirectory: web.rootDirectory,
    nodeVersion: '24.x',
    teamId,
    gitRepository: { type: 'github', repo: gitRepo, productionBranch },
  },
  {
    import: importId('web-project'),
    ignoreChanges: [
      'buildCommand',
      'installCommand',
      'outputDirectory',
      'devCommand',
      'ignoreCommand',
    ],
  },
);

export const webApex = new vercel.ProjectDomain(
  'web-apex',
  { projectId: webProject.id, domain: 'serviciosluxel.cl', teamId },
  { import: importId('web-domain-apex') },
);

export const webWww = new vercel.ProjectDomain(
  'web-www',
  { projectId: webProject.id, domain: 'www.serviciosluxel.cl', teamId },
  { import: importId('web-domain-www') },
);

const TARGETS = ['production', 'preview'];
const PLAIN_ENV: Record<string, string> = {
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_n66z3Aoe9DdbqqSv9V3U3nkVK4WWAiHoZQ9Q4kYTSKfy',
};

export const webEnv = Object.entries(PLAIN_ENV).map(
  ([key, value]) =>
    new vercel.ProjectEnvironmentVariable(`web-env-${slug(key)}`, {
      projectId: webProject.id,
      key,
      value,
      targets: TARGETS,
      sensitive: false,
      teamId,
    }),
);
