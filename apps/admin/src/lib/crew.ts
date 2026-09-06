export const PROPERTY_CONTACTS_TABLE = 'property_contacts';

export const CREW_ROLES = ['cleaning', 'concierge'] as const;

export type CrewRole = (typeof CREW_ROLES)[number];

export const ROLE_LABEL: Record<CrewRole, string> = {
  cleaning: 'Aseo',
  concierge: 'Conserje',
};

export interface PropertyContactRow {
  id: string;
  property_id: string;
  role: string;
  external_id: string | null;
  name: string | null;
  whatsapp: string | null;
  email: string | null;
}

export function asCrewRole(value: string | null | undefined): CrewRole | null {
  return CREW_ROLES.includes((value ?? '') as CrewRole) ? ((value ?? '') as CrewRole) : null;
}

export function roleLabel(value: string): string {
  return ROLE_LABEL[value as CrewRole] ?? value;
}
