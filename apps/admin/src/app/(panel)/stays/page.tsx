import { CalendarPlus } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase';
import {
  MANUAL_ORIGIN,
  MANUAL_REF_PREFIX,
  checkinUrl,
  santiagoToday,
  stayNights,
  type ManualBlockRow,
  type ManualStayRow,
} from '@/lib/stays';
import { providerApiKey } from '@/lib/hospitable';
import { Card, Pill } from '@/components/ui';
import { submitCancelManualStay, submitCreateManualStay } from './actions';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGE: Record<string, string> = {
  denied: 'No tienes permiso de operador. Vuelve a entrar.',
  invalid: 'Faltan datos o quedaron mal escritos. El nombre necesita al menos 2 letras.',
  bad_range: 'La salida tiene que ser después de la llegada.',
  past: 'Esa llegada ya pasó. Elige de hoy en adelante.',
  too_long: 'Esa estadía es muy larga. El máximo son 90 noches.',
  unknown_property: 'Esa propiedad ya no existe.',
  no_listing: 'Esa propiedad no está enlazada a Hospitable. No podemos bloquear sus noches.',
  no_credential: 'Falta la credencial de Hospitable en este proyecto. No tocamos el calendario.',
  read_failed: 'No pudimos leer el calendario guardado. No tocamos nada.',
  overlaps: 'Esas noches ya están ocupadas. No las pisamos.',
  calendar_unreadable: 'Hospitable no nos contestó el calendario. No guardamos nada.',
  taken: 'Hospitable marca esas noches como no disponibles. No guardamos nada.',
  hospitable_refused: 'Hospitable rechazó el bloqueo. No guardamos nada.',
  release_failed: 'Hospitable no soltó las noches. Dejamos la estadía como estaba.',
  write_failed: 'No pudimos guardar el cambio. Revisa los registros del servidor.',
  unknown_stay: 'Esa estadía ya no existe.',
  confirm_cancel: 'Confirma abajo para cancelar la estadía.',
};

const OK_MESSAGE: Record<string, string> = {
  created: 'Bloqueamos las noches y armamos el link de check-in.',
  cancelled: 'Cancelamos la estadía y soltamos las noches.',
  saved: 'Guardado.',
};

interface PropertyRow {
  id: string;
  nickname: string;
  comuna: string | null;
  external_listing_id: string | null;
}

interface StayView {
  stayId: string;
  checkinId: string | null;
  token: string | null;
  guestName: string | null;
  arrival: string | null;
  departure: string | null;
  arrivalTime: string | null;
  departureTime: string | null;
  guests: number | null;
  nights: number;
  blocked: boolean;
  cancelled: boolean;
  submitted: boolean;
  over: boolean;
}

interface PropertyView {
  id: string;
  nickname: string;
  comuna: string | null;
  linked: boolean;
  stays: StayView[];
  live: number;
}

interface Failures {
  properties: boolean;
  stays: boolean;
  blocks: boolean;
  missingColumn: boolean;
}

interface StaysConsole {
  properties: PropertyView[];
  total: number;
  live: number;
  failures: Failures;
}

function refOf(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  return raw.startsWith(MANUAL_REF_PREFIX) ? raw.slice(MANUAL_REF_PREFIX.length) : null;
}

async function getStaysConsole(today: string): Promise<StaysConsole> {
  const supabase = createServiceClient();
  const [propertyRes, stayRes, blockRes] = await Promise.all([
    supabase
      .from('properties')
      .select('id, nickname, comuna, external_listing_id')
      .order('nickname')
      .limit(500),
    supabase
      .from('checkins')
      .select(
        'id, property_id, token, status, guest_name, arrival_date, departure_date, arrival_time, departure_time, expected_guests, reservation_uid, revoked_at, submitted_at, created_at',
      )
      .eq('origin', MANUAL_ORIGIN)
      .order('arrival_date', { ascending: true })
      .limit(1000),
    supabase
      .from('calendar_blocks')
      .select('id, property_id, starts_on, ends_on, external_uid')
      .eq('origin', MANUAL_ORIGIN)
      .limit(1000),
  ]);

  const missingColumn = [propertyRes, stayRes, blockRes].some((res) => res.error?.code === '42703');
  const failures: Failures = {
    properties: Boolean(propertyRes.error),
    stays: Boolean(stayRes.error),
    blocks: Boolean(blockRes.error),
    missingColumn,
  };
  for (const res of [propertyRes, stayRes, blockRes]) {
    if (res.error) console.error('admin.stays_query_failed', { message: res.error.message });
  }

  const propertyRows = (propertyRes.data ?? []) as unknown as PropertyRow[];
  const stayRows = (stayRes.data ?? []) as unknown as ManualStayRow[];
  const blockRows = (blockRes.data ?? []) as unknown as ManualBlockRow[];

  const blockByRef = new Map<string, ManualBlockRow>();
  for (const block of blockRows) {
    const ref = refOf(block.external_uid);
    if (ref) blockByRef.set(ref, block);
  }

  const staysByProperty = new Map<string, StayView[]>();
  const seen = new Set<string>();
  for (const row of stayRows) {
    const stayId = refOf(row.reservation_uid);
    if (!stayId) continue;
    seen.add(stayId);
    const block = blockByRef.get(stayId) ?? null;
    const arrival = row.arrival_date ?? block?.starts_on ?? null;
    const departure = row.departure_date ?? block?.ends_on ?? null;
    const list = staysByProperty.get(row.property_id) ?? [];
    list.push({
      stayId,
      checkinId: row.id,
      token: row.token,
      guestName: row.guest_name,
      arrival,
      departure,
      arrivalTime: row.arrival_time,
      departureTime: row.departure_time,
      guests: row.expected_guests,
      nights: arrival && departure ? stayNights(arrival, departure).length : 0,
      blocked: Boolean(block),
      cancelled: Boolean(row.revoked_at),
      submitted: Boolean(row.submitted_at),
      over: Boolean(departure && departure < today),
    });
    staysByProperty.set(row.property_id, list);
  }
  for (const [stayId, block] of blockByRef) {
    if (seen.has(stayId)) continue;
    const list = staysByProperty.get(block.property_id) ?? [];
    list.push({
      stayId,
      checkinId: null,
      token: null,
      guestName: null,
      arrival: block.starts_on,
      departure: block.ends_on,
      arrivalTime: null,
      departureTime: null,
      guests: null,
      nights: stayNights(block.starts_on, block.ends_on).length,
      blocked: true,
      cancelled: false,
      submitted: false,
      over: block.ends_on < today,
    });
    staysByProperty.set(block.property_id, list);
  }

  let total = 0;
  let live = 0;
  const properties: PropertyView[] = propertyRows.map((row) => {
    const stays = (staysByProperty.get(row.id) ?? []).sort((a, b) =>
      (b.arrival ?? '').localeCompare(a.arrival ?? ''),
    );
    const liveHere = stays.filter((s) => !s.cancelled && !s.over).length;
    total += stays.length;
    live += liveHere;
    return {
      id: row.id,
      nickname: row.nickname,
      comuna: row.comuna,
      linked: Boolean(row.external_listing_id),
      stays,
      live: liveHere,
    };
  });
  properties.sort((a, b) => b.live - a.live || a.nickname.localeCompare(b.nickname));

  return { properties, total, live, failures };
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
const dangerButton =
  'border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg border px-3 py-2 text-xs font-semibold';

function Feedback({ error, ok, detail }: { error?: string; ok?: string; detail?: string }) {
  if (!error && !ok) return null;
  return error ? (
    <p className="text-destructive mt-2 text-xs font-semibold">
      {ERROR_MESSAGE[error] ?? error}
      {detail ? ` (${detail})` : ''}
    </p>
  ) : (
    <p className="text-success mt-2 text-xs font-semibold">{OK_MESSAGE[ok ?? ''] ?? ok}</p>
  );
}

function stayLine(stay: StayView): string {
  const dates =
    stay.arrival && stay.departure ? `${stay.arrival} → ${stay.departure}` : 'sin fechas';
  const nights = stay.nights ? `${stay.nights} ${stay.nights === 1 ? 'noche' : 'noches'}` : null;
  const guests = stay.guests ? `${stay.guests} huéspedes` : null;
  const times = [stay.arrivalTime, stay.departureTime].filter(Boolean).join(' → ') || null;
  return [dates, nights, guests, times].filter(Boolean).join(' · ');
}

function StayRow({
  stay,
  propertyId,
  askConfirm,
}: {
  stay: StayView;
  propertyId: string;
  askConfirm: boolean;
}) {
  const url = stay.token ? checkinUrl(stay.token) : null;
  const tone = stay.cancelled ? 'lost' : stay.submitted ? 'converted' : 'new';
  const label = stay.cancelled ? 'Cancelada' : stay.submitted ? 'Registrada' : 'Sin registrar';
  return (
    <div className="border-border/60 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{stay.guestName ?? 'Sin nombre'}</div>
          <div className="text-muted-foreground text-xs">{stayLine(stay)}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Pill tone={tone}>{label}</Pill>
          {!stay.cancelled && (
            <Pill tone={stay.blocked ? 'contacted' : 'new'}>
              {stay.blocked ? 'Noches bloqueadas' : 'Sin bloqueo'}
            </Pill>
          )}
        </div>
      </div>

      {!stay.cancelled && url && (
        <div className="mt-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-xs font-semibold underline"
          >
            Abrir el check-in
          </a>
          <pre className="bg-muted text-muted-foreground mt-1 overflow-x-auto rounded-lg p-2 text-xs">
            {url}
          </pre>
        </div>
      )}
      {!stay.cancelled && !url && stay.token && (
        <p className="text-warning mt-2 text-xs font-semibold">
          Falta NEXT_PUBLIC_WEB_URL en este proyecto, así que no podemos armar el link.
        </p>
      )}
      {!stay.token && (
        <p className="text-warning mt-2 text-xs font-semibold">
          Esta estadía bloquea noches pero no tiene link de check-in.
        </p>
      )}

      {!stay.cancelled && (
        <form action={submitCancelManualStay} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="stayId" value={stay.stayId} />
          {askConfirm && <input type="hidden" name="confirm" value="yes" />}
          <button className={dangerButton}>
            {askConfirm ? 'Sí, cancelar y soltar las noches' : 'Cancelar estadía'}
          </button>
          <span className="text-muted-foreground text-xs">
            Soltamos las noches en Hospitable y el link deja de funcionar.
          </span>
        </form>
      )}
    </div>
  );
}

function PropertyCard({
  property,
  today,
  feedback,
}: {
  property: PropertyView;
  today: string;
  feedback: { error?: string; ok?: string; detail?: string; stay?: string };
}) {
  const askConfirmFor = feedback.error === 'confirm_cancel' ? (feedback.stay ?? '') : '';
  return (
    <Card className="p-4">
      <div id={`p-${property.id}`} className="scroll-mt-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-medium">{property.nickname}</div>
            <div className="text-muted-foreground text-xs">
              {property.comuna ?? 'sin comuna'} · {property.stays.length} registradas
            </div>
          </div>
          <Pill tone={property.live ? 'contacted' : 'lost'}>
            {property.live} {property.live === 1 ? 'activa' : 'activas'}
          </Pill>
        </div>

        <Feedback error={feedback.error} ok={feedback.ok} detail={feedback.detail} />

        {!property.linked && (
          <p className="text-destructive mt-2 text-xs font-semibold">
            Esta propiedad no está enlazada a Hospitable. No podemos bloquear sus noches.
          </p>
        )}

        {property.stays.length > 0 && (
          <div className="mt-3 grid gap-2">
            {property.stays.map((stay) => (
              <StayRow
                key={stay.stayId}
                stay={stay}
                propertyId={property.id}
                askConfirm={askConfirmFor === stay.stayId}
              />
            ))}
          </div>
        )}

        <form action={submitCreateManualStay} className="mt-3 grid gap-2">
          <input type="hidden" name="propertyId" value={property.id} />
          <div className="grid gap-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Nombre del huésped">
                <input
                  className={inputClass}
                  name="guestName"
                  maxLength={120}
                  placeholder="Nombre y apellido"
                  aria-label={`Huésped en ${property.nickname}`}
                />
              </Field>
            </div>
            <Field label="Llegada">
              <input className={inputClass} type="date" name="arrival" min={today} />
            </Field>
            <Field label="Salida">
              <input className={inputClass} type="date" name="departure" min={today} />
            </Field>
            <Field label="Hora de llegada">
              <input className={inputClass} type="time" name="arrivalTime" defaultValue="15:00" />
            </Field>
            <Field label="Hora de salida">
              <input className={inputClass} type="time" name="departureTime" defaultValue="11:00" />
            </Field>
          </div>
          <div>
            <button className={primaryButton} disabled={!property.linked}>
              Bloquear noches y crear el link
            </button>
          </div>
        </form>
      </div>
    </Card>
  );
}

export default async function StaysPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    error?: string;
    ok?: string;
    detail?: string;
    stay?: string;
  }>;
}) {
  const { id, error, ok, detail, stay } = await searchParams;
  const today = santiagoToday();
  const { properties, total, live, failures } = await getStaysConsole(today);
  const credential = Boolean(providerApiKey());

  const feedbackFor = (key: string) =>
    id === key ? { error, ok, detail, stay } : ({} as { error?: string; ok?: string });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <CalendarPlus className="text-primary h-5 w-5" /> Estadías directas
        </h1>
        <p className="text-muted-foreground text-sm">
          {total} registradas · {live} activas · {properties.length} propiedades
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Acá va la estadía que no llegó por Airbnb: una reserva directa, un invitado del anfitrión,
          una noche del propio dueño. Primero bloqueamos esas noches en Hospitable, así Airbnb ya no
          las puede vender, y recién después las guardamos acá con su link de check-in.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Al huésped no le llega nada de nuestra parte: los mensajes automáticos son reglas de
          Hospitable y esta reserva no existe ahí. Copia el link y entrégaselo tú. El aseo del día
          de salida se programa solo, en la próxima sincronización.
        </p>
      </div>

      {failures.missingColumn && (
        <Alert tone="error">
          Falta la migración de estadías directas en la base de datos. Aplícala antes de usar esta
          página.
        </Alert>
      )}
      {!credential && (
        <Alert tone="error">
          Falta la credencial de Hospitable (PROVIDER_API_KEY) en este proyecto. Sin ella no podemos
          bloquear ni soltar noches.
        </Alert>
      )}
      {failures.properties && <Alert tone="error">No pudimos leer las propiedades.</Alert>}
      {failures.stays && !failures.missingColumn && (
        <Alert tone="error">No pudimos leer las estadías directas.</Alert>
      )}
      {failures.blocks && !failures.missingColumn && (
        <Alert tone="warning">
          No pudimos leer el calendario guardado. Las estadías aparecen sin su bloqueo.
        </Alert>
      )}

      <section>
        <div className="grid gap-3">
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              today={today}
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
