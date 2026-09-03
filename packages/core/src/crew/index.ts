import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { toE164Digits } from '../phone';

export type CrewClient = ReturnType<typeof createSupabaseServiceRoleClient>;
export type CrewKind = 'internal' | 'external';
export type CrewRole = 'cleaning' | 'concierge';
export type CrewSource = 'crew' | 'mirror';

export const CREW_KINDS: readonly CrewKind[] = ['internal', 'external'];
export const CREW_ROLES: readonly CrewRole[] = ['cleaning', 'concierge'];

export interface CrewMember {
  id: string;
  kind: CrewKind;
  name: string;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
}

export interface CrewAssignment {
  id: string;
  propertyId: string;
  role: CrewRole;
  createdAt: string;
  member: CrewMember;
}

export interface CrewRecipient {
  memberId: string | null;
  kind: CrewKind | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: CrewSource;
}

export interface CrewMemberInput {
  kind: CrewKind;
  name: string;
  whatsapp?: string | null;
  email?: string | null;
  note?: string | null;
  active?: boolean;
}

export type CrewMemberPatch = Partial<CrewMemberInput>;

const MEMBER_COLUMNS = 'id, kind, name, whatsapp, email, active, note, created_at';

interface MemberRow {
  id: string;
  kind: string;
  name: string | null;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
}

interface AssignmentRow {
  id: string;
  property_id: string;
  role: string;
  created_at: string;
  crew_member: MemberRow | MemberRow[] | null;
}

function db(client?: CrewClient): CrewClient {
  return client ?? createSupabaseServiceRoleClient();
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function storedPhone(value: string | null | undefined): string | null {
  const digits = toE164Digits(value);
  return digits ? `+${digits}` : null;
}

function toMember(row: MemberRow): CrewMember {
  return {
    id: row.id,
    kind: row.kind === 'external' ? 'external' : 'internal',
    name: row.name ?? '',
    whatsapp: row.whatsapp,
    email: row.email,
    active: row.active,
    note: row.note,
    createdAt: row.created_at,
  };
}

function embeddedMember(row: AssignmentRow): MemberRow | null {
  const value = row.crew_member;
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listCrewMembers(
  filter?: { kind?: CrewKind; active?: boolean },
  client?: CrewClient,
): Promise<CrewMember[]> {
  let query = db(client).from('crew_member').select(MEMBER_COLUMNS).order('name');
  if (filter?.kind) query = query.eq('kind', filter.kind);
  if (filter?.active !== undefined) query = query.eq('active', filter.active);
  const { data, error } = await query;
  if (error) {
    console.warn('crew.members_query_failed', { message: error.message });
    return [];
  }
  return ((data ?? []) as unknown as MemberRow[]).map(toMember);
}

export async function getCrewMember(id: string, client?: CrewClient): Promise<CrewMember | null> {
  const { data, error } = await db(client)
    .from('crew_member')
    .select(MEMBER_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('crew.member_query_failed', { id, message: error.message });
    return null;
  }
  return data ? toMember(data as unknown as MemberRow) : null;
}

export async function createCrewMember(
  input: CrewMemberInput,
  client?: CrewClient,
): Promise<CrewMember | null> {
  const name = cleanText(input.name);
  if (!name) {
    console.warn('crew.member_create_invalid', { reason: 'name' });
    return null;
  }
  const { data, error } = await db(client)
    .from('crew_member')
    .insert({
      kind: input.kind === 'external' ? 'external' : 'internal',
      name,
      whatsapp: storedPhone(input.whatsapp),
      email: cleanText(input.email),
      note: cleanText(input.note),
      active: input.active ?? true,
    })
    .select(MEMBER_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    console.error('crew.member_create_failed', { message: error?.message ?? 'no row inserted' });
    return null;
  }
  return toMember(data as unknown as MemberRow);
}

export async function updateCrewMember(
  id: string,
  patch: CrewMemberPatch,
  client?: CrewClient,
): Promise<CrewMember | null> {
  const changes: Record<string, unknown> = {};
  if (patch.kind !== undefined) changes.kind = patch.kind === 'external' ? 'external' : 'internal';
  if (patch.name !== undefined) {
    const name = cleanText(patch.name);
    if (!name) {
      console.warn('crew.member_update_invalid', { id, reason: 'name' });
      return null;
    }
    changes.name = name;
  }
  if (patch.whatsapp !== undefined) changes.whatsapp = storedPhone(patch.whatsapp);
  if (patch.email !== undefined) changes.email = cleanText(patch.email);
  if (patch.note !== undefined) changes.note = cleanText(patch.note);
  if (patch.active !== undefined) changes.active = patch.active;
  if (!Object.keys(changes).length) return getCrewMember(id, client);

  const { data, error } = await db(client)
    .from('crew_member')
    .update(changes)
    .eq('id', id)
    .select(MEMBER_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    console.error('crew.member_update_failed', { id, message: error?.message ?? 'no row updated' });
    return null;
  }
  return toMember(data as unknown as MemberRow);
}

export async function deactivateCrewMember(id: string, client?: CrewClient): Promise<boolean> {
  return Boolean(await updateCrewMember(id, { active: false }, client));
}

export async function assignCrew(
  input: { memberId: string; propertyId: string; role: CrewRole },
  client?: CrewClient,
): Promise<boolean> {
  const { error } = await db(client).from('crew_assignment').upsert(
    {
      crew_member_id: input.memberId,
      property_id: input.propertyId,
      role: input.role,
    },
    { onConflict: 'crew_member_id,property_id,role' },
  );
  if (error) {
    console.error('crew.assign_failed', {
      propertyId: input.propertyId,
      role: input.role,
      message: error.message,
    });
    return false;
  }
  return true;
}

export async function unassignCrew(
  input: { memberId: string; propertyId: string; role: CrewRole },
  client?: CrewClient,
): Promise<boolean> {
  const { error } = await db(client)
    .from('crew_assignment')
    .delete()
    .eq('crew_member_id', input.memberId)
    .eq('property_id', input.propertyId)
    .eq('role', input.role);
  if (error) {
    console.error('crew.unassign_failed', {
      propertyId: input.propertyId,
      role: input.role,
      message: error.message,
    });
    return false;
  }
  return true;
}

export async function listCrewAssignments(
  propertyId: string | string[],
  client?: CrewClient,
): Promise<CrewAssignment[]> {
  const ids = Array.isArray(propertyId) ? propertyId : [propertyId];
  if (!ids.length) return [];
  const { data, error } = await db(client)
    .from('crew_assignment')
    .select(`id, property_id, role, created_at, crew_member ( ${MEMBER_COLUMNS} )`)
    .in('property_id', ids)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('crew.assignments_query_failed', { message: error.message });
    return [];
  }
  const out: CrewAssignment[] = [];
  for (const row of (data ?? []) as unknown as AssignmentRow[]) {
    const member = embeddedMember(row);
    if (!member) continue;
    out.push({
      id: row.id,
      propertyId: row.property_id,
      role: row.role === 'concierge' ? 'concierge' : 'cleaning',
      createdAt: row.created_at,
      member: toMember(member),
    });
  }
  return out;
}

export async function recipients(
  propertyId: string,
  role: CrewRole,
  client?: CrewClient,
): Promise<CrewRecipient[]> {
  const supabase = db(client);
  const out: CrewRecipient[] = [];
  const seen = new Set<string>();

  const push = (candidate: CrewRecipient): void => {
    if (!candidate.phone && !candidate.email) return;
    const key = candidate.phone ? `p:${candidate.phone}` : `e:${candidate.email!.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  const { data: assigned, error: assignedError } = await supabase
    .from('crew_assignment')
    .select(`id, property_id, role, created_at, crew_member ( ${MEMBER_COLUMNS} )`)
    .eq('property_id', propertyId)
    .eq('role', role)
    .order('created_at', { ascending: true });
  if (assignedError) {
    console.warn('crew.recipients_query_failed', {
      propertyId,
      role,
      message: assignedError.message,
    });
  }

  const assignmentRows = (assigned ?? []) as unknown as AssignmentRow[];
  for (const row of assignmentRows) {
    const member = embeddedMember(row);
    if (!member || !member.active) continue;
    push({
      memberId: member.id,
      kind: member.kind === 'external' ? 'external' : 'internal',
      name: member.name,
      phone: toE164Digits(member.whatsapp),
      email: cleanText(member.email),
      source: 'crew',
    });
  }
  if (out.length) return out;

  const { data: mirrored, error: mirroredError } = await supabase
    .from('property_contacts')
    .select('name, email, whatsapp')
    .eq('property_id', propertyId)
    .eq('role', role);
  if (mirroredError) {
    console.warn('crew.mirror_query_failed', { propertyId, role, message: mirroredError.message });
    return out;
  }
  for (const contact of (mirrored ?? []) as unknown as Array<{
    name: string | null;
    email: string | null;
    whatsapp: string | null;
  }>) {
    push({
      memberId: null,
      kind: null,
      name: contact.name,
      phone: toE164Digits(contact.whatsapp),
      email: cleanText(contact.email),
      source: 'mirror',
    });
  }
  return out;
}
