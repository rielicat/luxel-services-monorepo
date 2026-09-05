import { Link2 } from 'lucide-react';
import { matchableEmails } from '@luxel/core/channels/connection';
import { hostConnectNudgeText } from '@luxel/core/whatsapp/nudge';
import { createServiceClient } from '@/lib/supabase';
import { fmtDateTime, relativeTime } from '@/lib/utils';
import { Card, Pill } from '@/components/ui';
import {
  assignListingToHost,
  loadCentralView,
  markInviteSent,
  reverifyConnection,
  saveClaimedEmail,
  saveConnectionNote,
  saveInviteLink,
} from './actions';

export const dynamic = 'force-dynamic';

const STALE_INVITE_DAYS = 4;
const DAY_MS = 86_400_000;

const STATE_LABEL: Record<string, string> = {
  not_started: 'Sin empezar',
  invite_sent: 'Invitación enviada',
  connecting: 'Conectando',
  connected: 'Conectado',
  no_listings: 'Sin listings',
  needs_operator: 'Necesita operador',
};

const STATE_TONE: Record<string, string> = {
  not_started: 'lost',
  invite_sent: 'contacted',
  connecting: 'contacted',
  connected: 'converted',
  no_listings: 'new',
  needs_operator: 'new',
};

const ERROR_MESSAGE: Record<string, string> = {
  denied: 'No tienes permiso de operador. Vuelve a entrar.',
  invalid: 'Los datos del formulario no sirven. Inténtalo de nuevo.',
  invalid_email: 'Ese correo no es válido.',
  invalid_url: 'El link tiene que empezar con https:// y no llevar espacios.',
  email_taken:
    'Otro anfitrión ya usa ese correo de Airbnb. Lo dejamos en "necesita operador" para que lo revises.',
  write_failed: 'No pudimos guardar el cambio. Revisa los registros del servidor.',
  no_invite: 'Primero guarda el link de la invitación.',
  hospitable_off: 'Falta PROVIDER_API_KEY en el panel: no podemos preguntarle a Hospitable.',
  hospitable_failed: 'Hospitable no respondió. Prueba de nuevo en un momento.',
  assign_failed: 'No se pudo asignar el listing. Puede que ya tenga dueño.',
  assigned_state_failed: 'El listing quedó asignado, pero no pudimos actualizar el estado.',
};

const OK_MESSAGE: Record<string, string> = {
  email_saved: 'Guardamos el correo de Airbnb del anfitrión.',
  invite_saved: 'Guardamos el link de la invitación.',
  invite_sent: 'Marcamos la invitación como enviada.',
  verified: 'Revisamos Hospitable con el token de Luxel.',
  assigned: 'Listing asignado al anfitrión.',
  note_saved: 'Nota guardada.',
};

type CentralView = Awaited<ReturnType<typeof loadCentralView>>;
type CentralListing = CentralView['listings'][number];

interface CustomerRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}

interface ConnectionRow {
  customer_id: string;
  state: string;
  claimed_airbnb_email: string | null;
  invite_url: string | null;
  invite_sent_at: string | null;
  connecting_at: string | null;
  connected_at: string | null;
  no_listings_at: string | null;
  needs_operator_at: string | null;
  last_checked_at: string | null;
  operator_note: string | null;
}

interface HostView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  storedState: string;
  state: string;
  claimedEmail: string | null;
  inviteUrl: string | null;
  inviteSentAt: string | null;
  note: string | null;
  lastCheckedAt: string | null;
  planStatus: string | null;
  listings: number;
  candidates: CentralListing[];
  waiting: 'luxel' | 'host' | 'none';
  next: string;
  since: string;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function derivedState(stored: string, listings: number): string {
  if (listings > 0) return 'connected';
  if (stored === 'connected') return 'needs_operator';
  return STATE_LABEL[stored] ? stored : 'not_started';
}

function nextStep(view: {
  state: string;
  inviteUrl: string | null;
  inviteSentAt: string | null;
  candidates: CentralListing[];
}): { waiting: 'luxel' | 'host' | 'none'; next: string } {
  if (view.state === 'connected') return { waiting: 'none', next: 'Nada pendiente.' };
  if (view.state === 'needs_operator') {
    return {
      waiting: 'luxel',
      next: view.candidates.length
        ? 'Hay listings que calzan con su correo: asígnalos.'
        : 'Revisa la cuenta en Hospitable y asigna el listing a mano.',
    };
  }
  if (view.state === 'no_listings') {
    return {
      waiting: 'luxel',
      next: 'La cuenta quedó conectada y no trae publicaciones. Escríbele al anfitrión.',
    };
  }
  if (view.state === 'not_started') {
    return {
      waiting: 'luxel',
      next: view.inviteUrl
        ? 'Ya tienes el link: mándaselo y márcalo como enviado.'
        : 'Crea la invitación en Hospitable y pega el link acá.',
    };
  }
  if (view.state === 'invite_sent' && daysSince(view.inviteSentAt) >= STALE_INVITE_DAYS) {
    return {
      waiting: 'luxel',
      next: `La invitación lleva ${daysSince(view.inviteSentAt)} días sin abrirse. Recuérdale.`,
    };
  }
  return { waiting: 'host', next: 'El anfitrión tiene que autorizar su cuenta de Airbnb.' };
}

function sinceFor(state: string, row: ConnectionRow | undefined, createdAt: string): string {
  if (state === 'invite_sent') return row?.invite_sent_at ?? createdAt;
  if (state === 'connecting') return row?.connecting_at ?? createdAt;
  if (state === 'no_listings') return row?.no_listings_at ?? createdAt;
  if (state === 'needs_operator') return row?.needs_operator_at ?? createdAt;
  return createdAt;
}

interface ConsoleData {
  hosts: HostView[];
  orphans: CentralListing[];
  central: CentralView;
  customersFailed: boolean;
  connectionsFailed: boolean;
  assignmentsFailed: boolean;
}

async function getConsole(): Promise<ConsoleData> {
  const supabase = createServiceClient();
  const central = await loadCentralView();

  const [customersRes, connectionsRes, assignmentsRes, plansRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, email, full_name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('host_connection')
      .select(
        'customer_id, state, claimed_airbnb_email, invite_url, invite_sent_at, connecting_at, connected_at, no_listings_at, needs_operator_at, last_checked_at, operator_note',
      )
      .limit(500),
    supabase.from('listing_assignments').select('external_listing_id, customer_id').limit(1000),
    supabase.from('plan_subscriptions').select('customer_id, status').limit(500),
  ]);

  if (customersRes.error) {
    console.error('admin.connections_customers_failed', { message: customersRes.error.message });
  }
  if (connectionsRes.error) {
    console.error('admin.connections_state_failed', { message: connectionsRes.error.message });
  }
  if (assignmentsRes.error) {
    console.error('admin.connections_assignments_failed', {
      message: assignmentsRes.error.message,
    });
  }

  const customers = (customersRes.data ?? []) as unknown as CustomerRow[];
  const connections = new Map(
    ((connectionsRes.data ?? []) as unknown as ConnectionRow[]).map((row) => [
      row.customer_id,
      row,
    ]),
  );

  const listingsByOwner = new Map<string, string[]>();
  const owned = new Set<string>();
  for (const row of (assignmentsRes.data ?? []) as unknown as {
    external_listing_id: string;
    customer_id: string;
  }[]) {
    owned.add(row.external_listing_id);
    listingsByOwner.set(row.customer_id, [
      ...(listingsByOwner.get(row.customer_id) ?? []),
      row.external_listing_id,
    ]);
  }

  const planByCustomer = new Map<string, string>();
  for (const row of (plansRes.data ?? []) as unknown as {
    customer_id: string;
    status: string;
  }[]) {
    if (!planByCustomer.has(row.customer_id)) planByCustomer.set(row.customer_id, row.status);
  }

  const orphans = central.listings.filter((listing) => !owned.has(listing.id));

  const hosts: HostView[] = customers.map((customer) => {
    const row = connections.get(customer.id);
    const listings = listingsByOwner.get(customer.id)?.length ?? 0;
    const emails = new Set(
      matchableEmails({
        signupEmail: customer.email,
        claimedEmail: row?.claimed_airbnb_email ?? null,
        inviteUrl: row?.invite_url ?? null,
      }),
    );
    const candidates = orphans.filter((listing) =>
      listing.airbnbEmails.some((email) => emails.has(email)),
    );
    const state = derivedState(row?.state ?? 'not_started', listings);
    const { waiting, next } = nextStep({
      state,
      inviteUrl: row?.invite_url ?? null,
      inviteSentAt: row?.invite_sent_at ?? null,
      candidates,
    });

    return {
      id: customer.id,
      name: customer.full_name ?? customer.email,
      email: customer.email,
      phone: customer.phone,
      storedState: row?.state ?? 'not_started',
      state,
      claimedEmail: row?.claimed_airbnb_email ?? null,
      inviteUrl: row?.invite_url ?? null,
      inviteSentAt: row?.invite_sent_at ?? null,
      note: row?.operator_note ?? null,
      lastCheckedAt: row?.last_checked_at ?? null,
      planStatus: planByCustomer.get(customer.id) ?? null,
      listings,
      candidates,
      waiting,
      next,
      since: sinceFor(state, row, customer.created_at),
    };
  });

  hosts.sort((a, b) => a.since.localeCompare(b.since));

  return {
    hosts,
    orphans,
    central,
    customersFailed: Boolean(customersRes.error),
    connectionsFailed: Boolean(connectionsRes.error),
    assignmentsFailed: Boolean(assignmentsRes.error),
  };
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

function HostCard({
  host,
  central,
  feedback,
}: {
  host: HostView;
  central: CentralView;
  feedback: { error?: string; ok?: string };
}) {
  const prepared = host.inviteUrl
    ? hostConnectNudgeText({
        fullName: host.name,
        email: host.email,
        phone: host.phone,
        inviteUrl: host.inviteUrl,
      })
    : null;
  const waLink =
    prepared && host.phone
      ? `https://wa.me/${host.phone.replace(/\D/g, '')}?text=${encodeURIComponent(prepared)}`
      : null;

  return (
    <Card className="p-4">
      <div id={`c-${host.id}`} className="scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{host.name}</span>
              <Pill tone={STATE_TONE[host.state]}>{STATE_LABEL[host.state] ?? host.state}</Pill>
              {host.planStatus && <Pill>Plan {host.planStatus}</Pill>}
            </div>
            <div className="text-muted-foreground text-xs">
              {host.email}
              {host.phone ? ` · ${host.phone}` : ' · sin teléfono'}
            </div>
            <div className="text-muted-foreground text-xs">
              Airbnb: {host.claimedEmail ?? 'sin dato'} · {host.listings} propiedades
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="font-semibold">{host.next}</div>
            <div className="text-muted-foreground">
              Esperando {relativeTime(host.since)}
              {host.inviteSentAt ? ` · invitación ${relativeTime(host.inviteSentAt)}` : ''}
            </div>
            <div className="text-muted-foreground">
              {host.lastCheckedAt ? `Revisado ${relativeTime(host.lastCheckedAt)}` : 'Sin revisar'}
            </div>
          </div>
        </div>

        {host.storedState !== host.state && (
          <p className="text-warning mt-2 text-xs font-semibold">
            Guardado como {STATE_LABEL[host.storedState] ?? host.storedState} y sin propiedades
            asignadas.
          </p>
        )}

        {feedback.error && (
          <p className="text-destructive mt-2 text-xs font-semibold">
            {ERROR_MESSAGE[feedback.error] ?? feedback.error}
          </p>
        )}
        {feedback.ok && (
          <p className="text-success mt-2 text-xs font-semibold">
            {OK_MESSAGE[feedback.ok] ?? feedback.ok}
          </p>
        )}

        {feedback.error === 'template_not_approved' && prepared && (
          <pre className="bg-muted text-muted-foreground mt-2 whitespace-pre-wrap rounded-lg p-3 text-xs">
            {prepared}
          </pre>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <form action={saveClaimedEmail} className="grid gap-2">
            <input type="hidden" name="customerId" value={host.id} />
            <Field label="Correo de Airbnb del anfitrión">
              <input
                className={inputClass}
                type="email"
                name="email"
                defaultValue={host.claimedEmail ?? ''}
                placeholder="correo con el que publica en Airbnb"
              />
            </Field>
            <button className={ghostButton}>Guardar correo</button>
          </form>

          <form action={saveInviteLink} className="grid gap-2">
            <input type="hidden" name="customerId" value={host.id} />
            <Field label="Link de invitación de Hospitable">
              <input
                className={inputClass}
                type="url"
                name="inviteUrl"
                defaultValue={host.inviteUrl ?? ''}
                placeholder="https://my.hospitable.com/..."
              />
            </Field>
            <button className={ghostButton}>Guardar link</button>
          </form>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={markInviteSent}>
            <input type="hidden" name="customerId" value={host.id} />
            <button className={primaryButton}>Marcar invitación enviada</button>
          </form>
          <form action={reverifyConnection}>
            <input type="hidden" name="customerId" value={host.id} />
            <button className={ghostButton} disabled={!central.configured}>
              Re-verificar en Hospitable
            </button>
          </form>
          {waLink && (
            <a className={ghostButton} href={waLink} target="_blank" rel="noreferrer">
              Mandar a mano
            </a>
          )}
          {host.inviteUrl && (
            <a
              className="text-primary text-xs font-semibold underline"
              href={host.inviteUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir invitación
            </a>
          )}
        </div>

        {host.candidates.length > 0 && (
          <div className="border-border mt-3 rounded-lg border p-3">
            <p className="text-xs font-semibold">Listings que calzan con su correo</p>
            <ul className="mt-2 grid gap-2">
              {host.candidates.map((listing) => (
                <li key={listing.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs">
                    {listing.name}
                    <span className="text-muted-foreground">
                      {' '}
                      · {listing.airbnbEmails.join(' · ') || 'sin correo'}
                    </span>
                  </span>
                  <form action={assignListingToHost}>
                    <input type="hidden" name="customerId" value={host.id} />
                    <input type="hidden" name="externalListingId" value={listing.id} />
                    <button className={primaryButton}>Asignar</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={saveConnectionNote} className="mt-3 grid gap-2">
          <input type="hidden" name="customerId" value={host.id} />
          <Field label="Nota del operador">
            <textarea
              className={inputClass}
              name="note"
              rows={2}
              defaultValue={host.note ?? ''}
              placeholder="Qué pasó con este anfitrión"
            />
          </Field>
          <div>
            <button className={ghostButton}>Guardar nota</button>
          </div>
        </form>
      </div>
    </Card>
  );
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string; ok?: string }>;
}) {
  const { id, error, ok } = await searchParams;
  const { hosts, orphans, central, customersFailed, connectionsFailed, assignmentsFailed } =
    await getConsole();

  const waitingLuxel = hosts.filter((h) => h.waiting === 'luxel');
  const waitingHost = hosts.filter((h) => h.waiting === 'host');
  const connected = hosts.filter((h) => h.waiting === 'none');
  const unmatched = orphans.filter(
    (listing) => !hosts.some((host) => host.candidates.some((c) => c.id === listing.id)),
  );
  const feedbackFor = (hostId: string) =>
    id === hostId ? { error, ok } : ({} as { error?: string; ok?: string });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Link2 className="text-primary h-5 w-5" /> Conexiones
        </h1>
        <p className="text-muted-foreground text-sm">
          {waitingLuxel.length} esperan a Luxel · {waitingHost.length} esperan al anfitrión ·{' '}
          {connected.length} conectados · {orphans.length} listings sin dueño
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          La invitación se crea en Hospitable a mano. Pega el link acá, márcalo como enviado y
          vuelve a verificar hasta que las publicaciones aparezcan.
        </p>
      </div>

      {customersFailed && <Alert tone="error">No pudimos leer la lista de anfitriones.</Alert>}
      {connectionsFailed && (
        <Alert tone="warning">
          No pudimos leer el estado de conexión. La lista muestra solo lo que sabemos por las
          propiedades ya asignadas.
        </Alert>
      )}
      {assignmentsFailed && (
        <Alert tone="warning">
          No pudimos leer las asignaciones de listings. Los conteos pueden estar incompletos.
        </Alert>
      )}
      {!central.configured && (
        <Alert tone="warning">
          Falta PROVIDER_API_KEY en el panel: no podemos preguntarle a Hospitable qué listings hay.
        </Alert>
      )}
      {central.configured && !central.ok && (
        <Alert tone="warning">
          Hospitable no respondió. Los listings sin dueño y la re-verificación no están disponibles
          ahora.
        </Alert>
      )}
      {error && <Alert tone="error">{ERROR_MESSAGE[error] ?? error}</Alert>}
      {ok && <Alert tone="ok">{OK_MESSAGE[ok] ?? ok}</Alert>}

      {unmatched.length > 0 && (
        <Card className="mb-6 p-4">
          <h2 className="font-display text-sm font-bold">Listings sin dueño</h2>
          <p className="text-muted-foreground text-xs">
            Están en la cuenta de Luxel y ningún anfitrión los reclama. Asígnalos a mano.
          </p>
          <ul className="mt-3 grid gap-2">
            {unmatched.map((listing) => (
              <li key={listing.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs">
                  {listing.name}
                  <span className="text-muted-foreground">
                    {' '}
                    · {listing.airbnbEmails.join(' · ') || 'sin correo'}
                    {listing.airbnbName ? ` · ${listing.airbnbName}` : ''}
                  </span>
                </span>
                <form action={assignListingToHost} className="flex items-center gap-2">
                  <input type="hidden" name="externalListingId" value={listing.id} />
                  <select
                    className={inputClass}
                    name="customerId"
                    aria-label={`Anfitrión para ${listing.name}`}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Elige un anfitrión
                    </option>
                    {hosts.map((host) => (
                      <option key={host.id} value={host.id}>
                        {host.name} · {host.email}
                      </option>
                    ))}
                  </select>
                  <button className={primaryButton}>Asignar</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mb-6">
        <h2 className="font-display mb-2 text-sm font-bold">
          Te toca a ti ({waitingLuxel.length})
        </h2>
        <div className="grid gap-3">
          {waitingLuxel.map((host) => (
            <HostCard key={host.id} host={host} central={central} feedback={feedbackFor(host.id)} />
          ))}
          {!waitingLuxel.length && (
            <Card className="text-muted-foreground p-6 text-center text-sm">
              Nada pendiente de tu lado.
            </Card>
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-display mb-2 text-sm font-bold">
          Esperando al anfitrión ({waitingHost.length})
        </h2>
        <div className="grid gap-3">
          {waitingHost.map((host) => (
            <HostCard key={host.id} host={host} central={central} feedback={feedbackFor(host.id)} />
          ))}
          {!waitingHost.length && (
            <Card className="text-muted-foreground p-6 text-center text-sm">
              Ningún anfitrión con la invitación abierta.
            </Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 text-sm font-bold">Conectados ({connected.length})</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted-foreground border-b text-left text-xs uppercase">
                  <th className="px-4 py-3 font-medium">Anfitrión</th>
                  <th className="px-4 py-3 font-medium">Correo de Airbnb</th>
                  <th className="px-4 py-3 font-medium">Propiedades</th>
                  <th className="px-4 py-3 font-medium">Última revisión</th>
                </tr>
              </thead>
              <tbody>
                {connected.map((host) => (
                  <tr key={host.id} className="border-border/60 border-b">
                    <td className="px-4 py-3">
                      <div className="font-medium">{host.name}</div>
                      <div className="text-muted-foreground text-xs">{host.email}</div>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {host.claimedEmail ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{host.listings}</td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {host.lastCheckedAt ? fmtDateTime(host.lastCheckedAt) : '—'}
                    </td>
                  </tr>
                ))}
                {!connected.length && (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground px-4 py-10 text-center">
                      Aún no hay anfitriones conectados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
