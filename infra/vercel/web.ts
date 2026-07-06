import * as vercel from '@pulumiverse/vercel';
import { teamId, gitRepo, productionBranch, web } from './config';
import { importId } from './adopt';

// The live customer site. Adopted via import — Pulumi manages its identity, git
// link and domains, but deliberately does NOT manage:
//   - env vars (separate resources, left in Vercel — they're secrets), and
//   - build/runtime commands (`ignoreChanges` below): these are Optional,
//     non-computed fields, so if the live project has a custom install/build
//     command (common in a pnpm monorepo) an undeclared field would otherwise be
//     RESET to Vercel's auto-detect defaults on the first apply. Ignoring them
//     leaves whatever is configured in Vercel untouched.
export const webProject = new vercel.Project(
  'web',
  {
    name: web.name,
    framework: 'nextjs',
    rootDirectory: web.rootDirectory,
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
