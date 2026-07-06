import * as pulumi from '@pulumi/pulumi';

const c = new pulumi.Config();

export interface WebCfg {
  name: string;
  rootDirectory: string;
}
export interface AdminCfg {
  name: string;
  rootDirectory: string;
  domain: string;
}

/** Empty for a personal account; `team_xxx` for a Vercel Team. */
export const teamId = c.get('teamId') || undefined;
/** `owner/repo`, e.g. rielicat/luxel-services-monorepo. */
export const gitRepo = c.require('gitRepo');
export const productionBranch = c.get('productionBranch') ?? 'main';

export const web = c.requireObject<WebCfg>('web');
export const admin = c.requireObject<AdminCfg>('admin');

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
