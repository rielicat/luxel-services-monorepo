'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase';
import { toE164Digits } from '@/lib/phone';
import { CREW_ASSIGNMENT_TABLE, CREW_KINDS, CREW_MEMBER_TABLE, CREW_ROLES } from '@/lib/crew';

export interface CrewActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const MemberSchema = z.object({
  kind: z.enum(CREW_KINDS),
  name: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().max(40),
  email: z.string().trim().max(200),
  note: z.string().trim().max(500),
});

const UpdateSchema = MemberSchema.extend({ id: z.string().uuid() });

const ActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  confirm: z.boolean(),
});

const AssignSchema = z.object({
  crewMemberId: z.string().uuid(),
  propertyId: z.string().uuid(),
  role: z.enum(CREW_ROLES),
});

const UnassignSchema = AssignSchema.extend({ confirm: z.boolean() });

type SupabaseClient = ReturnType<typeof createServiceClient>;

type ContactFields =
  | { ok: true; whatsapp: string | null; email: string | null }
  | { ok: false; error: string };

function contactFields(input: { whatsapp: string; email: string }): ContactFields {
  const digits = input.whatsapp ? toE164Digits(input.whatsapp) : null;
  const whatsapp = digits ? `+${digits}` : null;
  if (input.whatsapp && !whatsapp) return { ok: false, error: 'invalid_phone' };
  const email = input.email ? input.email.toLowerCase() : null;
  if (email && !z.string().email().safeParse(email).success) {
    return { ok: false, error: 'invalid_email' };
  }
  if (!whatsapp && !email) return { ok: false, error: 'no_channel' };
  return { ok: true, whatsapp, email };
}

async function recordCrewEvent(
  actor: string,
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('analytics_events').insert({
    event,
    distinct_id: `operator:${actor}`,
    properties: { ...properties, actor: 'operator' },
    source: 'server',
  });
  if (error) console.warn('admin.crew_event_failed', { event, message: error.message });
}

async function activeMemberIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Set<string> | null> {
  if (!ids.length) return new Set<string>();
  const { data, error } = await supabase
    .from(CREW_MEMBER_TABLE)
    .select('id')
    .in('id', ids)
    .eq('active', true);
  if (error) {
    console.error('admin.crew_active_read_failed', { message: error.message });
    return null;
  }
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
}

async function soleCoverage(
  supabase: SupabaseClient,
  memberId: string,
): Promise<{ propertyId: string; role: string }[] | null> {
  const mineRes = await supabase
    .from(CREW_ASSIGNMENT_TABLE)
    .select('property_id, role')
    .eq('crew_member_id', memberId);
  if (mineRes.error) {
    console.error('admin.crew_assignments_read_failed', { message: mineRes.error.message });
    return null;
  }
  const mine = (mineRes.data ?? []) as { property_id: string; role: string }[];
  if (!mine.length) return [];

  const propertyIds = [...new Set(mine.map((row) => row.property_id))];
  const allRes = await supabase
    .from(CREW_ASSIGNMENT_TABLE)
    .select('crew_member_id, property_id, role')
    .in('property_id', propertyIds);
  if (allRes.error) {
    console.error('admin.crew_assignments_read_failed', { message: allRes.error.message });
    return null;
  }
  const all = (allRes.data ?? []) as {
    crew_member_id: string;
    property_id: string;
    role: string;
  }[];
  const otherIds = [
    ...new Set(all.map((row) => row.crew_member_id).filter((id) => id !== memberId)),
  ];
  const actives = await activeMemberIds(supabase, otherIds);
  if (!actives) return null;

  return mine
    .filter(
      (row) =>
        !all.some(
          (other) =>
            other.property_id === row.property_id &&
            other.role === row.role &&
            other.crew_member_id !== memberId &&
            actives.has(other.crew_member_id),
        ),
    )
    .map((row) => ({ propertyId: row.property_id, role: row.role }));
}

export async function createCrewMember(input: {
  kind: string;
  name: string;
  whatsapp: string;
  email: string;
  note: string;
}): Promise<CrewActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.crew_create_denied');
    return { ok: false, error: 'denied' };
  }

  const parsed = MemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const contact = contactFields(parsed.data);
  if (!contact.ok) return { ok: false, error: contact.error };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(CREW_MEMBER_TABLE)
    .insert({
      kind: parsed.data.kind,
      name: parsed.data.name,
      whatsapp: contact.whatsapp,
      email: contact.email,
      note: parsed.data.note || null,
      active: true,
    })
    .select('id')
    .maybeSingle();

  const row = (data ?? null) as { id: string } | null;
  if (error || !row) {
    console.error('admin.crew_create_failed', {
      message: error?.message ?? 'no row inserted',
    });
    return { ok: false, error: 'write_failed' };
  }

  await recordCrewEvent(admin.email, 'crew_member_created', {
    crewMemberId: row.id,
    kind: parsed.data.kind,
  });
  revalidatePath('/crew');
  return { ok: true, message: 'member_created' };
}

export async function updateCrewMember(input: {
  id: string;
  kind: string;
  name: string;
  whatsapp: string;
  email: string;
  note: string;
}): Promise<CrewActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.crew_update_denied', { id: input.id });
    return { ok: false, error: 'denied' };
  }

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const contact = contactFields(parsed.data);
  if (!contact.ok) return { ok: false, error: contact.error };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(CREW_MEMBER_TABLE)
    .update({
      kind: parsed.data.kind,
      name: parsed.data.name,
      whatsapp: contact.whatsapp,
      email: contact.email,
      note: parsed.data.note || null,
    })
    .eq('id', parsed.data.id)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('admin.crew_update_failed', {
      id: parsed.data.id,
      message: error?.message ?? 'no row updated',
    });
    return { ok: false, error: 'write_failed' };
  }

  await recordCrewEvent(admin.email, 'crew_member_updated', { crewMemberId: parsed.data.id });
  revalidatePath('/crew');
  return { ok: true, message: 'member_saved' };
}

export async function setCrewMemberActive(input: {
  id: string;
  active: boolean;
  confirm: boolean;
}): Promise<CrewActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.crew_active_denied', { id: input.id });
    return { ok: false, error: 'denied' };
  }

  const parsed = ActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = createServiceClient();

  if (!parsed.data.active) {
    const sole = await soleCoverage(supabase, parsed.data.id);
    if (!sole) return { ok: false, error: 'read_failed' };
    if (sole.length && !parsed.data.confirm) return { ok: false, error: 'sole_cover' };
  }

  const { data, error } = await supabase
    .from(CREW_MEMBER_TABLE)
    .update({ active: parsed.data.active })
    .eq('id', parsed.data.id)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('admin.crew_active_failed', {
      id: parsed.data.id,
      active: parsed.data.active,
      message: error?.message ?? 'no row updated',
    });
    return { ok: false, error: 'write_failed' };
  }

  await recordCrewEvent(
    admin.email,
    parsed.data.active ? 'crew_member_reactivated' : 'crew_member_deactivated',
    { crewMemberId: parsed.data.id },
  );
  revalidatePath('/crew');
  return { ok: true, message: parsed.data.active ? 'member_reactivated' : 'member_deactivated' };
}

export async function assignCrew(input: {
  crewMemberId: string;
  propertyId: string;
  role: string;
}): Promise<CrewActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.crew_assign_denied', { propertyId: input.propertyId });
    return { ok: false, error: 'denied' };
  }

  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = createServiceClient();
  const [memberRes, propertyRes, existingRes] = await Promise.all([
    supabase
      .from(CREW_MEMBER_TABLE)
      .select('id, active')
      .eq('id', parsed.data.crewMemberId)
      .maybeSingle(),
    supabase.from('properties').select('id').eq('id', parsed.data.propertyId).maybeSingle(),
    supabase
      .from(CREW_ASSIGNMENT_TABLE)
      .select('crew_member_id')
      .eq('crew_member_id', parsed.data.crewMemberId)
      .eq('property_id', parsed.data.propertyId)
      .eq('role', parsed.data.role)
      .maybeSingle(),
  ]);

  if (memberRes.error || propertyRes.error || existingRes.error) {
    console.error('admin.crew_assign_read_failed', {
      message: memberRes.error?.message ?? propertyRes.error?.message ?? existingRes.error?.message,
    });
    return { ok: false, error: 'read_failed' };
  }

  const member = (memberRes.data ?? null) as { id: string; active: boolean } | null;
  if (!member) return { ok: false, error: 'unknown_member' };
  if (!member.active) return { ok: false, error: 'member_inactive' };
  if (!propertyRes.data) return { ok: false, error: 'unknown_property' };
  if (existingRes.data) return { ok: true, message: 'already_assigned' };

  const { error } = await supabase.from(CREW_ASSIGNMENT_TABLE).insert({
    crew_member_id: parsed.data.crewMemberId,
    property_id: parsed.data.propertyId,
    role: parsed.data.role,
  });
  if (error) {
    console.error('admin.crew_assign_failed', {
      crewMemberId: parsed.data.crewMemberId,
      propertyId: parsed.data.propertyId,
      role: parsed.data.role,
      message: error.message,
    });
    return { ok: false, error: 'write_failed' };
  }

  await recordCrewEvent(admin.email, 'crew_assigned', {
    crewMemberId: parsed.data.crewMemberId,
    propertyId: parsed.data.propertyId,
    role: parsed.data.role,
  });
  revalidatePath('/crew');
  return { ok: true, message: 'assigned' };
}

export async function unassignCrew(input: {
  crewMemberId: string;
  propertyId: string;
  role: string;
  confirm: boolean;
}): Promise<CrewActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    console.warn('admin.crew_unassign_denied', { propertyId: input.propertyId });
    return { ok: false, error: 'denied' };
  }

  const parsed = UnassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = createServiceClient();
  const currentRes = await supabase
    .from(CREW_ASSIGNMENT_TABLE)
    .select('crew_member_id')
    .eq('property_id', parsed.data.propertyId)
    .eq('role', parsed.data.role);
  if (currentRes.error) {
    console.error('admin.crew_unassign_read_failed', { message: currentRes.error.message });
    return { ok: false, error: 'read_failed' };
  }

  const others = ((currentRes.data ?? []) as { crew_member_id: string }[])
    .map((row) => row.crew_member_id)
    .filter((id) => id !== parsed.data.crewMemberId);
  const actives = await activeMemberIds(supabase, others);
  if (!actives) return { ok: false, error: 'read_failed' };
  if (!actives.size && !parsed.data.confirm) return { ok: false, error: 'last_assignment' };

  const { data, error } = await supabase
    .from(CREW_ASSIGNMENT_TABLE)
    .delete()
    .eq('crew_member_id', parsed.data.crewMemberId)
    .eq('property_id', parsed.data.propertyId)
    .eq('role', parsed.data.role)
    .select('crew_member_id');

  if (error) {
    console.error('admin.crew_unassign_failed', {
      crewMemberId: parsed.data.crewMemberId,
      propertyId: parsed.data.propertyId,
      role: parsed.data.role,
      message: error.message,
    });
    return { ok: false, error: 'write_failed' };
  }
  if (!((data ?? []) as unknown[]).length) return { ok: false, error: 'not_assigned' };

  await recordCrewEvent(admin.email, 'crew_unassigned', {
    crewMemberId: parsed.data.crewMemberId,
    propertyId: parsed.data.propertyId,
    role: parsed.data.role,
  });
  revalidatePath('/crew');
  return { ok: true, message: 'unassigned' };
}

function crewUrl(params: Record<string, string>, hash: string): string {
  const entries = Object.entries(params).filter(([, value]) => value);
  const query = new URLSearchParams(entries).toString();
  return `/crew${query ? `?${query}` : ''}${hash}`;
}

function feedbackUrl(
  result: CrewActionResult,
  params: Record<string, string>,
  hash: string,
): string {
  return crewUrl(
    result.ok
      ? { ...params, ok: result.message ?? 'saved' }
      : { ...params, error: result.error ?? 'write_failed' },
    hash,
  );
}

export async function submitCreateCrewMember(formData: FormData): Promise<void> {
  const result = await createCrewMember({
    kind: String(formData.get('kind') ?? ''),
    name: String(formData.get('name') ?? ''),
    whatsapp: String(formData.get('whatsapp') ?? ''),
    email: String(formData.get('email') ?? ''),
    note: String(formData.get('note') ?? ''),
  });
  redirect(feedbackUrl(result, { id: 'new' }, '#crew-new'));
}

export async function submitUpdateCrewMember(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const result = await updateCrewMember({
    id,
    kind: String(formData.get('kind') ?? ''),
    name: String(formData.get('name') ?? ''),
    whatsapp: String(formData.get('whatsapp') ?? ''),
    email: String(formData.get('email') ?? ''),
    note: String(formData.get('note') ?? ''),
  });
  redirect(feedbackUrl(result, { id }, `#m-${id}`));
}

export async function submitCrewMemberActive(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const result = await setCrewMemberActive({
    id,
    active: String(formData.get('active') ?? '') === 'true',
    confirm: String(formData.get('confirm') ?? '') === 'yes',
  });
  redirect(feedbackUrl(result, { id }, `#m-${id}`));
}

export async function submitAssignCrew(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const result = await assignCrew({
    crewMemberId: String(formData.get('crewMemberId') ?? ''),
    propertyId,
    role: String(formData.get('role') ?? ''),
  });
  redirect(feedbackUrl(result, { id: propertyId }, `#p-${propertyId}`));
}

export async function submitUnassignCrew(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const crewMemberId = String(formData.get('crewMemberId') ?? '');
  const role = String(formData.get('role') ?? '');
  const result = await unassignCrew({
    crewMemberId,
    propertyId,
    role,
    confirm: String(formData.get('confirm') ?? '') === 'yes',
  });
  redirect(feedbackUrl(result, { id: propertyId, member: crewMemberId, role }, `#p-${propertyId}`));
}
