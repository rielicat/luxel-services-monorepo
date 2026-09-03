export const CREW_MEMBER_TABLE = 'crew_member';
export const CREW_ASSIGNMENT_TABLE = 'crew_assignment';

export const CREW_KINDS = ['internal', 'external'] as const;
export const CREW_ROLES = ['cleaning', 'concierge'] as const;

export type CrewKind = (typeof CREW_KINDS)[number];
export type CrewRole = (typeof CREW_ROLES)[number];

export const KIND_LABEL: Record<CrewKind, string> = {
  internal: 'Interno',
  external: 'Externo',
};

export const ROLE_LABEL: Record<CrewRole, string> = {
  cleaning: 'Aseo',
  concierge: 'Conserje',
};

export interface CrewMemberRow {
  id: string;
  kind: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  note: string | null;
}

export interface CrewAssignmentRow {
  crew_member_id: string;
  property_id: string;
  role: string;
}

export function asCrewRole(value: string | null | undefined): CrewRole | null {
  return CREW_ROLES.includes((value ?? '') as CrewRole) ? ((value ?? '') as CrewRole) : null;
}

export function kindLabel(value: string): string {
  return KIND_LABEL[value as CrewKind] ?? value;
}

export function roleLabel(value: string): string {
  return ROLE_LABEL[value as CrewRole] ?? value;
}
