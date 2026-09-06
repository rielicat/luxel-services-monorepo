import { HardHat } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase';
import { formatPhone } from '@/lib/phone';
import {
  CREW_ROLES,
  PROPERTY_CONTACTS_TABLE,
  TEAM_URL,
  asCrewRole,
  roleLabel,
  type CrewRole,
  type PropertyContactRow,
} from '@/lib/crew';
import { Alert, Card, PageHeader, Pill } from '@/components/ui';
import { CrewToolbar } from './crew-toolbar';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface PropertyRow {
  id: string;
  nickname: string;
  comuna: string | null;
  owner_id: string;
}

interface OwnerRow {
  id: string;
  full_name: string | null;
  email: string;
}

interface Contact {
  id: string;
  name: string;
  contact: string;
  reachable: boolean;
}

interface RoleCoverage {
  role: CrewRole;
  people: Contact[];
}

interface PropertyView {
  id: string;
  nickname: string;
  comuna: string | null;
  owner: string | null;
  roles: RoleCoverage[];
  gaps: number;
}

interface PersonView {
  key: string;
  name: string;
  contact: string;
  reachable: boolean;
  covers: { propertyId: string; nickname: string; role: CrewRole }[];
}

interface Failures {
  properties: boolean;
  contacts: boolean;
  owners: boolean;
}

interface CrewConsole {
  people: PersonView[];
  properties: PropertyView[];
  failures: Failures;
}

function contactLine(whatsapp: string | null, email: string | null): string {
  const parts = [whatsapp ? formatPhone(whatsapp) : null, email].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'sin contacto';
}

function contactName(row: PropertyContactRow): string {
  return row.name?.trim() || row.whatsapp?.trim() || row.email?.trim() || 'sin nombre';
}

function personKey(row: PropertyContactRow): string {
  return row.external_id?.trim() || row.whatsapp?.trim() || row.email?.trim() || row.id;
}

async function getCrewConsole(): Promise<CrewConsole> {
  const supabase = createServiceClient();
  const [propertyRes, contactRes] = await Promise.all([
    supabase
      .from('properties')
      .select('id, nickname, comuna, owner_id')
      .order('nickname')
      .limit(500),
    supabase
      .from(PROPERTY_CONTACTS_TABLE)
      .select('id, property_id, role, external_id, name, whatsapp, email')
      .limit(5000),
  ]);

  const failures: Failures = {
    properties: Boolean(propertyRes.error),
    contacts: Boolean(contactRes.error),
    owners: false,
  };
  for (const res of [propertyRes, contactRes]) {
    if (res.error) console.error('admin.crew_query_failed', { message: res.error.message });
  }

  const propertyRows = (propertyRes.data ?? []) as unknown as PropertyRow[];
  const contactRows = (contactRes.data ?? []) as unknown as PropertyContactRow[];

  const ownerNames: Record<string, string> = {};
  const ownerIds = [...new Set(propertyRows.map((row) => row.owner_id))];
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

  const propertiesById = new Map(propertyRows.map((row) => [row.id, row]));
  const byPropertyRole = new Map<string, Contact[]>();
  const people = new Map<string, PersonView>();

  for (const row of contactRows) {
    const role = asCrewRole(row.role);
    const property = propertiesById.get(row.property_id);
    if (!role || !property) continue;

    const reachable = Boolean(row.whatsapp?.trim() || row.email?.trim());
    const contact: Contact = {
      id: row.id,
      name: contactName(row),
      contact: contactLine(row.whatsapp, row.email),
      reachable,
    };
    const key = `${row.property_id}:${role}`;
    byPropertyRole.set(key, [...(byPropertyRole.get(key) ?? []), contact]);

    const identity = personKey(row);
    const person = people.get(identity);
    if (person) {
      person.covers.push({ propertyId: property.id, nickname: property.nickname, role });
    } else {
      people.set(identity, {
        key: identity,
        name: contact.name,
        contact: contact.contact,
        reachable,
        covers: [{ propertyId: property.id, nickname: property.nickname, role }],
      });
    }
  }

  const properties: PropertyView[] = propertyRows.map((property) => {
    const roles: RoleCoverage[] = CREW_ROLES.map((role) => ({
      role,
      people: (byPropertyRole.get(`${property.id}:${role}`) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name, 'es'),
      ),
    }));
    return {
      id: property.id,
      nickname: property.nickname,
      comuna: property.comuna,
      owner: ownerNames[property.owner_id] ?? null,
      roles,
      gaps: roles.filter((entry) => !entry.people.some((person) => person.reachable)).length,
    };
  });

  properties.sort((a, b) => b.gaps - a.gaps || a.nickname.localeCompare(b.nickname, 'es'));

  return {
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    properties,
    failures,
  };
}

function RoleRow({ coverage }: { coverage: RoleCoverage }) {
  const reachable = coverage.people.filter((person) => person.reachable);
  return (
    <div className="border-border rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">{roleLabel(coverage.role)}</span>
        <Pill tone={reachable.length ? 'converted' : 'new'}>
          {reachable.length ? `${reachable.length} con aviso` : 'Nadie'}
        </Pill>
      </div>

      {coverage.people.length > 0 ? (
        <ul className="mt-2 grid gap-1">
          {coverage.people.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{person.name}</span>
              <span className="text-muted-foreground">{person.contact}</span>
              {!person.reachable && (
                <span className="text-warning font-semibold">sin WhatsApp ni correo</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-destructive mt-2 text-xs font-semibold">
          Nadie recibe el aviso de {roleLabel(coverage.role)} acá.{' '}
          <a className="underline" href={TEAM_URL} target="_blank" rel="noreferrer">
            Agregar
          </a>
        </p>
      )}
    </div>
  );
}

export default async function CrewPage() {
  const { people, properties, failures } = await getCrewConsole();
  const gaps = properties.filter((property) => property.gaps > 0).length;

  return (
    <div>
      <PageHeader icon={HardHat} title="Equipo" actions={<CrewToolbar />}>
        <p>
          {people.length} {people.length === 1 ? 'persona' : 'personas'} · {properties.length}{' '}
          {properties.length === 1 ? 'propiedad' : 'propiedades'} · {gaps} con un rol sin nadie
        </p>
        <p className="mt-1">
          Aseo cubre la limpieza y la lavandería. Conserje cubre la llegada y la salida.
        </p>
      </PageHeader>

      {failures.properties && <Alert tone="error">No pudimos leer las propiedades.</Alert>}
      {failures.contacts && (
        <Alert tone="error">
          No pudimos leer el equipo. La cobertura de abajo está incompleta.
        </Alert>
      )}
      {failures.owners && (
        <Alert tone="warning">
          No pudimos leer los anfitriones. Las propiedades van sin dueño.
        </Alert>
      )}
      {!failures.contacts && gaps > 0 && (
        <Alert tone="warning">
          {gaps === 1
            ? '1 propiedad tiene un rol sin nadie: ese aviso no le llega a ninguna persona.'
            : `${gaps} propiedades tienen un rol sin nadie: esos avisos no le llegan a ninguna persona.`}
        </Alert>
      )}

      <section className="mb-6">
        <h2 className="font-display mb-2 text-sm font-bold">Personas ({people.length})</h2>
        <div className="grid gap-3">
          {people.map((person) => (
            <Card key={person.key} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{person.name}</span>
                    {!person.reachable && <Pill tone="new">Sin contacto</Pill>}
                  </div>
                  <div className="text-muted-foreground text-xs">{person.contact}</div>
                </div>
                <div className="text-muted-foreground text-right text-xs">
                  {person.covers.length}{' '}
                  {person.covers.length === 1 ? 'asignación' : 'asignaciones'}
                </div>
              </div>
              <div className="text-muted-foreground mt-2 text-xs">
                Cubre:{' '}
                {person.covers.map((cover, index) => (
                  <span key={`${cover.propertyId}-${cover.role}`}>
                    {index > 0 && ' · '}
                    <a className="underline" href={`#p-${cover.propertyId}`}>
                      {cover.nickname}
                    </a>{' '}
                    ({roleLabel(cover.role)})
                  </span>
                ))}
              </div>
            </Card>
          ))}
          {!people.length && (
            <Card className="text-muted-foreground p-6 text-center text-sm">
              {failures.contacts ? 'No pudimos leer el equipo.' : 'Todavía no hay nadie.'}
            </Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 text-sm font-bold">
          Cobertura por propiedad ({properties.length})
        </h2>
        <div className="grid gap-3">
          {properties.map((property) => (
            <Card key={property.id} className="p-4">
              <div id={`p-${property.id}`} className="scroll-mt-24">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{property.nickname}</div>
                    <div className="text-muted-foreground text-xs">
                      {property.comuna ?? 'sin comuna'}
                      {property.owner ? ` · ${property.owner}` : ''}
                    </div>
                  </div>
                  <Pill tone={property.gaps ? 'new' : 'converted'}>
                    {property.gaps ? `${property.gaps} sin nadie` : 'Cubierta'}
                  </Pill>
                </div>

                <div className="mt-3 grid gap-2">
                  {property.roles.map((coverage) => (
                    <RoleRow key={coverage.role} coverage={coverage} />
                  ))}
                </div>
              </div>
            </Card>
          ))}
          {!properties.length && (
            <Card className="text-muted-foreground p-6 text-center text-sm">
              Todavía no hay propiedades importadas.
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
