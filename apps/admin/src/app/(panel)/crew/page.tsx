import { HardHat } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase';
import { formatPhone } from '@/lib/phone';
import {
  CREW_ASSIGNMENT_TABLE,
  CREW_KINDS,
  CREW_MEMBER_TABLE,
  CREW_ROLES,
  asCrewRole,
  kindLabel,
  roleLabel,
  type CrewAssignmentRow,
  type CrewMemberRow,
  type CrewRole,
} from '@/lib/crew';
import { Card, Pill } from '@/components/ui';
import {
  submitAssignCrew,
  submitCreateCrewMember,
  submitCrewMemberActive,
  submitUnassignCrew,
  submitUpdateCrewMember,
} from './actions';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGE: Record<string, string> = {
  denied: 'No tienes permiso de operador. Vuelve a entrar.',
  invalid: 'Faltan datos o quedaron mal escritos. El nombre necesita al menos 2 letras.',
  invalid_phone: 'Ese WhatsApp no es un número válido. Usa el formato +56 9 1234 5678.',
  invalid_email: 'Ese correo no es válido.',
  no_channel: 'Deja al menos un WhatsApp o un correo: si no, nadie recibe el aviso.',
  read_failed: 'No pudimos leer el equipo para revisar el cambio. No tocamos nada.',
  write_failed: 'No pudimos guardar el cambio. Revisa los registros del servidor.',
  unknown_member: 'Esa persona ya no existe en el equipo.',
  unknown_property: 'Esa propiedad ya no existe.',
  member_inactive: 'Esa persona está inactiva. Reactívala antes de asignarla.',
  not_assigned: 'Esa persona ya no estaba asignada. Nada que quitar.',
  sole_cover: 'Es la única persona activa en al menos una propiedad. Confirma abajo.',
  last_assignment: 'Es la última persona activa asignada a ese rol. Lee la advertencia y confirma.',
};

const OK_MESSAGE: Record<string, string> = {
  member_created: 'Agregamos a la persona al equipo.',
  member_saved: 'Guardamos los datos de la persona.',
  member_deactivated: 'La persona quedó inactiva. Ya no le escribimos.',
  member_reactivated: 'La persona vuelve a estar activa.',
  assigned: 'Asignamos a la persona a esa propiedad.',
  already_assigned: 'Esa persona ya cubría ese rol en esa propiedad.',
  unassigned: 'Quitamos la asignación.',
  saved: 'Guardado.',
};

const SOURCE_LABEL: Record<string, string> = {
  luxel: 'Asignado en Luxel',
  hospitable: 'Espejo de Hospitable',
  stale: 'Nadie: solo gente inactiva',
  none: 'Nadie',
  unknown: 'Sin dato',
};

const SOURCE_TONE: Record<string, string> = {
  luxel: 'converted',
  hospitable: 'contacted',
  stale: 'new',
  none: 'new',
  unknown: 'lost',
};

interface PropertyRow {
  id: string;
  nickname: string;
  comuna: string | null;
  owner_id: string;
}

interface MirrorRow {
  id: string;
  property_id: string;
  role: string;
  name: string | null;
  whatsapp: string | null;
  email: string | null;
}

interface OwnerRow {
  id: string;
  full_name: string | null;
  email: string;
}

interface Coverage {
  propertyId: string;
  nickname: string;
  role: CrewRole;
}

interface MemberView extends CrewMemberRow {
  covers: Coverage[];
  soleCover: Coverage[];
}

interface MirrorContact {
  id: string;
  label: string;
  contact: string;
}

interface RoleCoverage {
  role: CrewRole;
  assigned: CrewMemberRow[];
  activeCount: number;
  mirror: MirrorContact[];
  source: 'luxel' | 'hospitable' | 'stale' | 'none' | 'unknown';
}

interface PropertyView {
  id: string;
  nickname: string;
  comuna: string | null;
  owner: string | null;
  roles: RoleCoverage[];
  rank: number;
}

interface Failures {
  members: boolean;
  assignments: boolean;
  properties: boolean;
  mirror: boolean;
  owners: boolean;
  missingTables: boolean;
}

interface CrewConsole {
  members: MemberView[];
  properties: PropertyView[];
  failures: Failures;
}

const EMPTY_FAILURES: Failures = {
  members: false,
  assignments: false,
  properties: false,
  mirror: false,
  owners: false,
  missingTables: false,
};

function contactLine(whatsapp: string | null, email: string | null): string {
  const parts = [whatsapp ? formatPhone(whatsapp) : null, email].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'sin contacto';
}

function mirrorLabel(row: MirrorRow): string {
  return row.name?.trim() || row.whatsapp?.trim() || row.email?.trim() || 'sin nombre';
}

function rankOf(roles: RoleCoverage[]): number {
  if (roles.some((role) => role.source === 'stale')) return 0;
  if (roles.some((role) => role.source === 'none')) return 1;
  if (roles.some((role) => role.source === 'hospitable')) return 2;
  return 3;
}

async function getCrewConsole(): Promise<CrewConsole> {
  const supabase = createServiceClient();
  const [memberRes, assignmentRes, propertyRes, mirrorRes] = await Promise.all([
    supabase
      .from(CREW_MEMBER_TABLE)
      .select('id, kind, name, whatsapp, email, active, note')
      .order('name')
      .limit(500),
    supabase.from(CREW_ASSIGNMENT_TABLE).select('crew_member_id, property_id, role').limit(5000),
    supabase
      .from('properties')
      .select('id, nickname, comuna, owner_id')
      .order('nickname')
      .limit(500),
    supabase
      .from('property_contacts')
      .select('id, property_id, role, name, whatsapp, email')
      .limit(2000),
  ]);

  const failures: Failures = {
    ...EMPTY_FAILURES,
    members: Boolean(memberRes.error),
    assignments: Boolean(assignmentRes.error),
    properties: Boolean(propertyRes.error),
    mirror: Boolean(mirrorRes.error),
    missingTables: memberRes.error?.code === '42P01' || assignmentRes.error?.code === '42P01',
  };
  for (const res of [memberRes, assignmentRes, propertyRes, mirrorRes]) {
    if (res.error) console.error('admin.crew_query_failed', { message: res.error.message });
  }

  const memberRows = (memberRes.data ?? []) as unknown as CrewMemberRow[];
  const assignments = (assignmentRes.data ?? []) as unknown as CrewAssignmentRow[];
  const propertyRows = (propertyRes.data ?? []) as unknown as PropertyRow[];
  const mirrorRows = (mirrorRes.data ?? []) as unknown as MirrorRow[];

  const ownerIds = [...new Set(propertyRows.map((row) => row.owner_id))];
  const ownerNames: Record<string, string> = {};
  if (ownerIds.length) {
    const ownerRes = await supabase
      .from('customers')
      .select('id, full_name, email')
      .in('id', ownerIds);
    if (ownerRes.error) {
      failures.owners = true;
      console.error('admin.crew_owners_failed', { message: ownerRes.error.message });
    }
    for (const owner of (ownerRes.data ?? []) as unknown as OwnerRow[]) {
      ownerNames[owner.id] = owner.full_name?.trim() || owner.email;
    }
  }

  const membersById = new Map(memberRows.map((row) => [row.id, row]));
  const propertiesById = new Map(propertyRows.map((row) => [row.id, row]));

  const byProperty = new Map<string, CrewMemberRow[]>();
  const covers = new Map<string, Coverage[]>();
  for (const assignment of assignments) {
    const role = asCrewRole(assignment.role);
    const member = membersById.get(assignment.crew_member_id);
    const property = propertiesById.get(assignment.property_id);
    if (!role || !member || !property) continue;
    const key = `${assignment.property_id}:${role}`;
    byProperty.set(key, [...(byProperty.get(key) ?? []), member]);
    covers.set(member.id, [
      ...(covers.get(member.id) ?? []),
      { propertyId: property.id, nickname: property.nickname, role },
    ]);
  }

  const mirrorByProperty = new Map<string, MirrorContact[]>();
  for (const row of mirrorRows) {
    const role = asCrewRole(row.role);
    if (!role) continue;
    const key = `${row.property_id}:${role}`;
    mirrorByProperty.set(key, [
      ...(mirrorByProperty.get(key) ?? []),
      { id: row.id, label: mirrorLabel(row), contact: contactLine(row.whatsapp, row.email) },
    ]);
  }

  const properties: PropertyView[] = propertyRows.map((property) => {
    const roles: RoleCoverage[] = CREW_ROLES.map((role) => {
      const key = `${property.id}:${role}`;
      const assigned = [...(byProperty.get(key) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const activeCount = assigned.filter((member) => member.active).length;
      const mirror = mirrorByProperty.get(key) ?? [];
      const source = failures.assignments
        ? 'unknown'
        : activeCount > 0
          ? 'luxel'
          : assigned.length > 0
            ? 'stale'
            : mirror.length
              ? 'hospitable'
              : 'none';
      return { role, assigned, activeCount, mirror, source };
    });
    return {
      id: property.id,
      nickname: property.nickname,
      comuna: property.comuna,
      owner: ownerNames[property.owner_id] ?? null,
      roles,
      rank: rankOf(roles),
    };
  });

  properties.sort((a, b) => a.rank - b.rank || a.nickname.localeCompare(b.nickname));

  const members: MemberView[] = memberRows.map((member) => {
    const mine = covers.get(member.id) ?? [];
    return {
      ...member,
      covers: mine,
      soleCover: mine.filter((cover) => {
        const key = `${cover.propertyId}:${cover.role}`;
        const others = (byProperty.get(key) ?? []).filter(
          (other) => other.id !== member.id && other.active,
        );
        return others.length === 0;
      }),
    };
  });

  return { members, properties, failures };
}

function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'warning' | 'ok';
  children: React.ReactNode;
}) {
  const styles = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    ok: 'border-success/40 bg-success/10 text-success',
  } as const;
  return (
    <div
      role="alert"
      className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${styles[tone]}`}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground font-medium uppercase">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'border-input bg-background focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2';
const primaryButton =
  'bg-primary text-primary-foreground rounded-lg px-3 py-2 text-xs font-semibold';
const ghostButton =
  'border-border hover:bg-accent rounded-lg border px-3 py-2 text-xs font-semibold';
const dangerButton =
  'border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg border px-3 py-2 text-xs font-semibold';

function Feedback({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return error ? (
    <p className="text-destructive mt-2 text-xs font-semibold">{ERROR_MESSAGE[error] ?? error}</p>
  ) : (
    <p className="text-success mt-2 text-xs font-semibold">{OK_MESSAGE[ok ?? ''] ?? ok}</p>
  );
}

function MemberFields({ member }: { member?: MemberView }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Field label="Tipo">
        <select className={inputClass} name="kind" defaultValue={member?.kind ?? 'internal'}>
          {CREW_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kindLabel(kind)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nombre">
        <input
          className={inputClass}
          name="name"
          defaultValue={member?.name ?? ''}
          placeholder="Nombre y apellido"
        />
      </Field>
      <Field label="WhatsApp">
        <input
          className={inputClass}
          name="whatsapp"
          defaultValue={member?.whatsapp ?? ''}
          placeholder="+56 9 1234 5678"
        />
      </Field>
      <Field label="Correo">
        <input
          className={inputClass}
          type="email"
          name="email"
          defaultValue={member?.email ?? ''}
          placeholder="correo de respaldo"
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Nota del operador">
          <input
            className={inputClass}
            name="note"
            defaultValue={member?.note ?? ''}
            placeholder="Horarios, llaves, quién la recomendó"
          />
        </Field>
      </div>
    </div>
  );
}

function MemberCard({
  member,
  feedback,
}: {
  member: MemberView;
  feedback: { error?: string; ok?: string };
}) {
  const confirmDeactivate = feedback.error === 'sole_cover';
  return (
    <Card className="p-4">
      <div id={`m-${member.id}`} className="scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{member.name}</span>
              <Pill tone={member.kind === 'internal' ? 'converted' : 'contacted'}>
                {kindLabel(member.kind)}
              </Pill>
              {!member.active && <Pill tone="lost">Inactiva</Pill>}
            </div>
            <div className="text-muted-foreground text-xs">
              {contactLine(member.whatsapp, member.email)}
            </div>
            {member.note && <div className="text-muted-foreground text-xs">{member.note}</div>}
          </div>
          <div className="text-right text-xs">
            <div className="font-semibold">
              {member.covers.length} {member.covers.length === 1 ? 'propiedad' : 'propiedades'}
            </div>
            <div className="text-muted-foreground">
              {member.soleCover.length
                ? `${member.soleCover.length} sin nadie más`
                : 'siempre con respaldo'}
            </div>
          </div>
        </div>

        <div className="text-muted-foreground mt-2 text-xs">
          {member.covers.length ? (
            <>
              Cubre:{' '}
              {member.covers.map((cover, index) => (
                <span key={`${cover.propertyId}-${cover.role}`}>
                  {index > 0 && ' · '}
                  <a className="underline" href={`#p-${cover.propertyId}`}>
                    {cover.nickname}
                  </a>{' '}
                  ({roleLabel(cover.role)})
                </span>
              ))}
            </>
          ) : (
            'Sin propiedades asignadas.'
          )}
        </div>

        {member.active && member.soleCover.length > 0 && (
          <p className="text-warning mt-2 text-xs font-semibold">
            Es la única persona activa en:{' '}
            {member.soleCover
              .map((cover) => `${cover.nickname} (${roleLabel(cover.role)})`)
              .join(' · ')}
            . Si la desactivas, esas propiedades quedan sin nadie: la asignación sigue ahí, así que
            el aviso tampoco vuelve al espejo de Hospitable. Asigna a otra persona antes, o quita la
            asignación después.
          </p>
        )}

        <Feedback error={feedback.error} ok={feedback.ok} />

        <form action={submitUpdateCrewMember} className="mt-3 grid gap-2">
          <input type="hidden" name="id" value={member.id} />
          <MemberFields member={member} />
          <div className="flex flex-wrap items-center gap-2">
            <button className={ghostButton}>Guardar cambios</button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {member.active ? (
            <form action={submitCrewMemberActive}>
              <input type="hidden" name="id" value={member.id} />
              <input type="hidden" name="active" value="false" />
              <input type="hidden" name="confirm" value="" />
              <button className={dangerButton}>Desactivar</button>
            </form>
          ) : (
            <form action={submitCrewMemberActive}>
              <input type="hidden" name="id" value={member.id} />
              <input type="hidden" name="active" value="true" />
              <input type="hidden" name="confirm" value="" />
              <button className={primaryButton}>Reactivar</button>
            </form>
          )}
          {confirmDeactivate && (
            <form action={submitCrewMemberActive}>
              <input type="hidden" name="id" value={member.id} />
              <input type="hidden" name="active" value="false" />
              <input type="hidden" name="confirm" value="yes" />
              <button className={dangerButton}>Sí, desactivar igual</button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}

function RoleRow({
  property,
  coverage,
  feedback,
}: {
  property: PropertyView;
  coverage: RoleCoverage;
  feedback: { error?: string; member?: string; role?: string };
}) {
  return (
    <div className="border-border rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">{roleLabel(coverage.role)}</span>
        <Pill tone={SOURCE_TONE[coverage.source]}>{SOURCE_LABEL[coverage.source]}</Pill>
      </div>

      {coverage.assigned.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {coverage.assigned.map((member) => {
            const pending =
              feedback.error === 'last_assignment' &&
              feedback.member === member.id &&
              feedback.role === coverage.role;
            return (
              <li key={member.id} className="grid gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs">
                    <a className="font-medium underline" href={`#m-${member.id}`}>
                      {member.name}
                    </a>{' '}
                    <span className="text-muted-foreground">
                      · {kindLabel(member.kind)} · {contactLine(member.whatsapp, member.email)}
                    </span>
                    {!member.active && (
                      <span className="text-warning font-semibold"> · inactiva</span>
                    )}
                  </span>
                  <form action={submitUnassignCrew}>
                    <input type="hidden" name="propertyId" value={property.id} />
                    <input type="hidden" name="crewMemberId" value={member.id} />
                    <input type="hidden" name="role" value={coverage.role} />
                    <input type="hidden" name="confirm" value="" />
                    <button className={ghostButton}>Quitar</button>
                  </form>
                </div>
                {pending && (
                  <div className="border-warning/40 bg-warning/10 grid gap-2 rounded-lg border p-2">
                    <p className="text-warning text-xs font-semibold">
                      Es la última persona activa de Luxel para {roleLabel(coverage.role)} acá.{' '}
                      {coverage.assigned.length > 1
                        ? `Si la quitas, quedan solo asignaciones inactivas: nadie recibe el aviso y el espejo de Hospitable no toma el relevo. Quita también a ${coverage.assigned
                            .filter((other) => other.id !== member.id)
                            .map((other) => other.name)
                            .join(' y ')} si quieres volver al espejo.`
                        : `Si la quitas, esta propiedad vuelve al espejo de Hospitable: ${
                            coverage.mirror.length
                              ? coverage.mirror.map((contact) => contact.label).join(' · ')
                              : 'que hoy no tiene a nadie para este rol'
                          }.`}
                    </p>
                    <form action={submitUnassignCrew}>
                      <input type="hidden" name="propertyId" value={property.id} />
                      <input type="hidden" name="crewMemberId" value={member.id} />
                      <input type="hidden" name="role" value={coverage.role} />
                      <input type="hidden" name="confirm" value="yes" />
                      <button className={dangerButton}>Sí, quitar igual</button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {coverage.source === 'stale' && (
        <p className="text-destructive mt-2 text-xs font-semibold">
          Nadie recibe el aviso de {roleLabel(coverage.role)}: las personas asignadas están
          inactivas y, mientras quede una asignación, el espejo de Hospitable no toma el relevo.
          Reactiva a alguien, asigna a otra persona o quita las asignaciones que sobran.
        </p>
      )}

      {coverage.source === 'hospitable' && (
        <div className="mt-2">
          <p className="text-muted-foreground text-xs">
            Sin gente de Luxel. Avisamos a los teammates que Hospitable espeja:
          </p>
          <ul className="mt-1 grid gap-1">
            {coverage.mirror.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Pill>Hospitable</Pill>
                <span className="font-medium">{contact.label}</span>
                <span className="text-muted-foreground">{contact.contact}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-1 text-xs">
            Esa lista no se edita acá: se maneja en Hospitable, en Operations y luego Teammates.
          </p>
        </div>
      )}

      {coverage.source === 'none' && (
        <p className="text-destructive mt-2 text-xs font-semibold">
          Nadie recibe el aviso de {roleLabel(coverage.role)} en esta propiedad. Asigna a alguien.
        </p>
      )}

      {coverage.source === 'unknown' && (
        <p className="text-warning mt-2 text-xs font-semibold">
          No pudimos leer las asignaciones. No sabemos quién cubre esto ahora.
        </p>
      )}
    </div>
  );
}

function PropertyCard({
  property,
  members,
  feedback,
}: {
  property: PropertyView;
  members: MemberView[];
  feedback: { error?: string; ok?: string; member?: string; role?: string };
}) {
  const activeMembers = members.filter((member) => member.active);
  return (
    <Card className="p-4">
      <div id={`p-${property.id}`} className="scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-medium">{property.nickname}</div>
            <div className="text-muted-foreground text-xs">
              {property.comuna ?? 'sin comuna'}
              {property.owner ? ` · ${property.owner}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {property.roles.map((coverage) => (
              <Pill key={coverage.role} tone={SOURCE_TONE[coverage.source]}>
                {roleLabel(coverage.role)}: {SOURCE_LABEL[coverage.source]}
              </Pill>
            ))}
          </div>
        </div>

        <Feedback error={feedback.error} ok={feedback.ok} />

        <div className="mt-3 grid gap-2">
          {property.roles.map((coverage) => (
            <RoleRow
              key={coverage.role}
              property={property}
              coverage={coverage}
              feedback={feedback}
            />
          ))}
        </div>

        <form action={submitAssignCrew} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="propertyId" value={property.id} />
          <div className="min-w-52 flex-1">
            <Field label="Persona">
              <select
                className={inputClass}
                name="crewMemberId"
                defaultValue=""
                aria-label={`Persona para ${property.nickname}`}
              >
                <option value="" disabled>
                  Elige a alguien del equipo
                </option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {kindLabel(member.kind)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="min-w-32">
            <Field label="Rol">
              <select
                className={inputClass}
                name="role"
                defaultValue="cleaning"
                aria-label={`Rol en ${property.nickname}`}
              >
                {CREW_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button className={primaryButton} disabled={!activeMembers.length}>
            Asignar
          </button>
        </form>
      </div>
    </Card>
  );
}

export default async function CrewPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    error?: string;
    ok?: string;
    member?: string;
    role?: string;
  }>;
}) {
  const { id, error, ok, member, role } = await searchParams;
  const { members, properties, failures } = await getCrewConsole();

  const internal = members.filter((row) => row.kind === 'internal' && row.active).length;
  const external = members.filter((row) => row.kind === 'external' && row.active).length;
  const inactive = members.filter((row) => !row.active).length;
  const stale = properties.filter((property) => property.rank === 0).length;
  const nobody = properties.filter((property) => property.rank === 1).length;
  const mirrored = properties.filter((property) => property.rank === 2).length;

  const feedbackFor = (key: string) =>
    id === key ? { error, ok, member, role } : ({} as { error?: string; ok?: string });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <HardHat className="text-primary h-5 w-5" /> Equipo
        </h1>
        <p className="text-muted-foreground text-sm">
          {internal} internas · {external} externas · {inactive} inactivas · {properties.length}{' '}
          propiedades · {nobody + stale} sin nadie · {mirrored} solo con el espejo de Hospitable
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Hospitable manda quién existe como teammate y ese espejo no se edita acá. Esta página dice
          a quién avisamos: si una propiedad tiene alguna asignación en Luxel, el aviso va solo a la
          gente activa de esa lista. El espejo de Hospitable entra solo cuando la propiedad no tiene
          ninguna asignación.
        </p>
      </div>

      {failures.missingTables && (
        <Alert tone="error">
          Faltan las tablas del equipo en la base de datos. Aplica la migración de crew antes de
          usar esta página.
        </Alert>
      )}
      {failures.members && !failures.missingTables && (
        <Alert tone="error">No pudimos leer al equipo de Luxel.</Alert>
      )}
      {failures.assignments && !failures.missingTables && (
        <Alert tone="error">
          No pudimos leer las asignaciones. La página no sabe quién cubre cada propiedad, así que no
          te fíes de la cobertura de abajo.
        </Alert>
      )}
      {failures.properties && <Alert tone="error">No pudimos leer las propiedades.</Alert>}
      {failures.owners && (
        <Alert tone="warning">
          No pudimos leer a los anfitriones. Las propiedades aparecen sin dueño.
        </Alert>
      )}
      {failures.mirror && (
        <Alert tone="warning">
          No pudimos leer el espejo de Hospitable. Las propiedades sin gente de Luxel aparecen como
          si no tuvieran a nadie.
        </Alert>
      )}
      {stale > 0 && !failures.assignments && (
        <Alert tone="error">
          {stale} {stale === 1 ? 'propiedad tiene' : 'propiedades tienen'} solo personas inactivas
          asignadas en algún rol. Nadie recibe ese aviso y el espejo de Hospitable no toma el
          relevo.
        </Alert>
      )}
      {nobody > 0 && !failures.assignments && (
        <Alert tone="error">
          {nobody} {nobody === 1 ? 'propiedad' : 'propiedades'} sin nadie en algún rol: ni gente de
          Luxel ni teammates en el espejo de Hospitable.
        </Alert>
      )}

      <section className="mb-6">
        <h2 className="font-display mb-2 text-sm font-bold">Personas ({members.length})</h2>

        <Card className="mb-3 p-4">
          <div id="crew-new" className="scroll-mt-24">
            <h3 className="text-sm font-semibold">Agregar a alguien</h3>
            <p className="text-muted-foreground text-xs">
              Interno es gente de Luxel. Externo es gente del edificio o del anfitrión, como un
              conserje. Deja al menos un WhatsApp o un correo.
            </p>
            <Feedback {...feedbackFor('new')} />
            <form action={submitCreateCrewMember} className="mt-3 grid gap-2">
              <MemberFields />
              <div>
                <button className={primaryButton}>Agregar persona</button>
              </div>
            </form>
          </div>
        </Card>

        <div className="grid gap-3">
          {members.map((row) => (
            <MemberCard key={row.id} member={row} feedback={feedbackFor(row.id)} />
          ))}
          {!members.length && (
            <Card className="text-muted-foreground p-6 text-center text-sm">
              Aún no hay nadie en el equipo de Luxel. Toda la operación depende del espejo de
              Hospitable.
            </Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 text-sm font-bold">
          Cobertura por propiedad ({properties.length})
        </h2>
        <p className="text-muted-foreground mb-2 text-xs">
          Primero las propiedades que necesitan atención.
        </p>
        <div className="grid gap-3">
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              members={members}
              feedback={feedbackFor(property.id)}
            />
          ))}
          {!properties.length && (
            <Card className="text-muted-foreground p-6 text-center text-sm">
              Todavía no hay propiedades importadas de Hospitable.
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
