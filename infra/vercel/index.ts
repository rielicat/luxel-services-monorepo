import { webProject, webApex, webWww } from './web';
import { adminProject, adminDomain } from './admin';

export const webProjectId = webProject.id;
export const webDomains = [webApex.domain, webWww.domain];
export const adminProjectId = adminProject.id;
export const adminDomainName = adminDomain.domain;
