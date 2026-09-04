import 'server-only';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { encryptPII, decryptPII } from '../crypto/pii';
import { providerApiKey } from './credentials';
import type { ChannelListing, ChannelReservation, ReservationState } from './types';

const BASE = 'https://public.api.hospitable.com/v2';

interface HospitableChannelListing {
  platform: string | null;
  platform_id?: string | null;
  platform_user_id?: string | null;
  platform_name?: string | null;
  platform_email?: string | null;
}

export interface HospitableProperty {
  id: string;
  listings?: HospitableChannelListing[];
  name: string | null;
  public_name: string | null;
  picture?: string | null;
  address: {
    number?: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    postcode?: string | null;
    country?: string | null;
    country_name?: string | null;
    coordinates?: { latitude: string | number | null; longitude: string | number | null } | null;
    display?: string | null;
  } | null;
  timezone?: string | null;
  listed: boolean;
  currency?: string | null;
  summary?: string | null;
  description?: string | null;
  checkin?: string | null;
  checkout?: string | null;
  amenities?: string[] | null;
  capacity: {
    max: number | null;
    bedrooms: number | null;
    beds?: number | null;
    bathrooms: number | null;
  } | null;
  property_type?: string | null;
  room_type?: string | null;
  house_rules?: {
    pets_allowed?: boolean | null;
    smoking_allowed?: boolean | null;
    events_allowed?: boolean | null;
  } | null;
  details?: HospitableListingDetails | null;
  calendar_restricted?: boolean | null;
}

interface HospitableListingDetails {
  space_overview?: string | null;
  guest_access?: string | null;
  house_manual?: string | null;
  other_details?: string | null;
  additional_rules?: string | null;
  neighborhood_description?: string | null;
  getting_around?: string | null;
  wifi_name?: string | null;
  wifi_password?: string | null;
}

export interface HospitableReservation {
  id: string;
  code: string;
  platform: string | null;
  arrival_date: string;
  departure_date: string;
  check_in?: string | null;
  check_out?: string | null;
  status: string | null;
  reservation_status?: { current?: { category?: string | null } | null } | null;
  properties?: { id?: string | null }[] | null;
  guests?: { total?: number | null } | null;
  conversation_id?: string | null;
  conversation_language?: string | null;
  guest?: {
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    language?: string | null;
    phone_numbers?: string[] | null;
  } | null;
}

async function hospGet<T>(
  token: string,
  path: string,
): Promise<{ ok: boolean; data?: T[]; nextUrl?: string | null }> {
  try {
    const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { data?: T[]; links?: { next?: string | null } };
    if (!Array.isArray(json.data)) return { ok: false };
    return { ok: true, data: json.data, nextUrl: json.links?.next ?? null };
  } catch {
    return { ok: false };
  }
}

export async function verifyHospitableToken(
  token: string,
): Promise<{ ok: boolean; properties?: number; firstName?: string | null }> {
  const r = await hospGet<HospitableProperty>(token, '/properties?per_page=100');
  if (!r.ok) return { ok: false };
  return {
    ok: true,
    properties: r.data!.length,
    firstName: r.data![0]?.public_name ?? r.data![0]?.name ?? null,
  };
}

export async function listHospitableProperties(
  token: string,
): Promise<HospitableProperty[] | null> {
  const out: HospitableProperty[] = [];
  let url: string | null = '/properties?per_page=100&include=listings,details';
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableProperty>>> = await hospGet(token, url);
    if (!r.ok) return null;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  if (url) return null;
  return out;
}

export interface HospitableChannel {
  id?: string | null;
  user_id: string | null;
  name: string | null;
  login: string | null;
  email?: string | null;
  platform: string | null;
}

export async function listHospitableChannels(token: string): Promise<HospitableChannel[] | null> {
  const out: HospitableChannel[] = [];
  let url: string | null = '/channels?per_page=100';
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableChannel>>> = await hospGet(token, url);
    if (!r.ok) return null;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  if (url) return null;
  return out;
}

export function normalizeChannelEmail(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed || null;
}

export function normalizeChannelUserId(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
}

export interface AirbnbIdentity {
  email: string | null;
  userId: string | null;
}

export function airbnbIdentities(rp: HospitableProperty): AirbnbIdentity[] {
  return (rp.listings ?? [])
    .filter((l) => l.platform === 'airbnb')
    .map((l) => ({
      email: normalizeChannelEmail(l.platform_email),
      userId: normalizeChannelUserId(l.platform_user_id),
    }))
    .filter((i) => Boolean(i.email || i.userId));
}

export interface HospitableTeammate {
  id: string;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  is_company?: boolean | null;
  company_name?: string | null;
  email: string | null;
  phone_number: string | null;
  language?: string | null;
  timezone?: string | null;
  all_services: boolean;
  all_properties: boolean;
  services?: { id: number; label?: string | null }[] | null;
  properties?: 'all' | unknown[] | null;
}

export async function listHospitableTeammates(token: string): Promise<HospitableTeammate[] | null> {
  const out: HospitableTeammate[] = [];
  let url: string | null = '/teammates?per_page=100&include=properties';
  for (let page = 0; url && page < 50; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableTeammate>>> = await hospGet(token, url);
    if (!r.ok) return null;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  if (url) return null;
  return out;
}

export const RESERVATION_CATEGORIES = [
  'request',
  'checkpoint',
  'accepted',
  'cancelled',
  'not_accepted',
] as const;
export type ReservationCategory = (typeof RESERVATION_CATEGORIES)[number];

const RESERVATION_STATUS_QUERY = RESERVATION_CATEGORIES.map((s) => `&status%5B%5D=${s}`).join('');

export function reservationCategory(r: HospitableReservation): ReservationCategory | null {
  const raw = String(r.reservation_status?.current?.category ?? r.status ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  return (RESERVATION_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as ReservationCategory)
    : null;
}

export async function listHospitableReservations(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<HospitableReservation[] | null> {
  const out: HospitableReservation[] = [];
  let url: string | null =
    `/reservations?properties%5B%5D=${encodeURIComponent(propertyId)}&start_date=${startDate}&end_date=${endDate}&per_page=100&include=guest${RESERVATION_STATUS_QUERY}`;
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableReservation>>> = await hospGet(token, url);
    if (!r.ok) return null;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  return out;
}

interface HospitableFinancialLine {
  amount?: number | null;
  formatted?: string | null;
  label?: string | null;
  category?: string | null;
}

export interface HospitableFinancials {
  currency?: string | null;
  guest?: { total_price?: HospitableFinancialLine | null } | null;
  host?: {
    revenue?: HospitableFinancialLine | null;
    guest_fees?: HospitableFinancialLine[] | null;
  } | null;
}

export interface HospitablePricedReservation extends HospitableReservation {
  nights?: number | null;
  financials?: HospitableFinancials | null;
}

function formattedClp(formatted: string | null | undefined): number | null {
  const digits = (formatted ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

export function hospitableAmountToClp(
  line: HospitableFinancialLine | null | undefined,
  currency: string | null | undefined,
): number | null {
  if ((currency ?? '').trim().toUpperCase() !== 'CLP') return null;
  const amount = line?.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const shown = formattedClp(line?.formatted);
  if (shown && Math.round(Math.abs(amount) / shown) === 100) return Math.round(amount / 100);
  return Math.round(amount);
}

const CLEANING_LABEL = /(clean|aseo|limpie)/i;

export function hospitableCleaningFeeClp(
  financials: HospitableFinancials | null | undefined,
  currency: string | null | undefined,
): number | null {
  const fees = financials?.host?.guest_fees;
  if (!Array.isArray(fees)) return null;
  let total = 0;
  let matched = 0;
  for (const fee of fees) {
    if (!CLEANING_LABEL.test(fee?.label ?? '')) continue;
    const clp = hospitableAmountToClp(fee, currency);
    if (clp === null) return null;
    matched += 1;
    total += clp;
  }
  if (!matched && fees.length) {
    console.warn('hospitable.cleaning_fee_unrecognised', {
      labels: fees.map((fee) => fee?.label ?? '').filter(Boolean),
    });
  }
  return total;
}

export async function listHospitablePricedReservations(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<HospitablePricedReservation[] | null> {
  const out: HospitablePricedReservation[] = [];
  let url: string | null =
    `/reservations?properties%5B%5D=${encodeURIComponent(propertyId)}&start_date=${startDate}&end_date=${endDate}&date_query=checkout&per_page=100&include=financials`;
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitablePricedReservation>>> = await hospGet(
      token,
      url,
    );
    if (!r.ok) return null;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  return out;
}

export async function getHospitableReservation(
  token: string,
  reservationId: string,
): Promise<HospitableReservation | null> {
  try {
    const res = await fetch(
      `${BASE}/reservations/${encodeURIComponent(reservationId)}?include=guest,properties`,
      { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: HospitableReservation | null };
    const one = json.data ?? null;
    return one && typeof one.id === 'string' ? one : null;
  } catch {
    return null;
  }
}

interface HospitableCalendarDay {
  date: string;
  day?: string | null;
  min_stay?: number | null;
  closed_for_checkin?: boolean | null;
  closed_for_checkout?: boolean | null;
  status?: {
    reason?: string | null;
    source_type?: string | null;
    available?: boolean | null;
  } | null;
  price?: { amount?: number | null; currency?: string | null; formatted?: string | null } | null;
}

export async function listHospitableCalendar(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<HospitableCalendarDay[] | null> {
  try {
    const res = await fetch(
      `${BASE}/properties/${encodeURIComponent(propertyId)}/calendar?start_date=${startDate}&end_date=${endDate}`,
      { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: HospitableCalendarDay[] | { days?: HospitableCalendarDay[] };
    };
    const days = Array.isArray(json.data) ? json.data : (json.data?.days ?? null);
    return Array.isArray(days) ? days : null;
  } catch {
    return null;
  }
}

export interface HospitableMessage {
  id: string | number;
  body: string | null;
  sender_type: string | null;
  created_at: string;
  conversation_id?: string | null;
  reservation_id?: string | null;
  sender?: { first_name?: string | null; full_name?: string | null } | null;
}

export async function listHospitableMessages(
  token: string,
  reservationId: string,
): Promise<HospitableMessage[] | null> {
  const out: HospitableMessage[] = [];
  let url: string | null =
    `/reservations/${encodeURIComponent(reservationId)}/messages?per_page=100`;
  for (let page = 0; url && page < 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableMessage>>> = await hospGet(token, url);
    if (!r.ok) return page === 0 ? null : out;
    out.push(...(r.data ?? []));
    url = r.nextUrl ?? null;
  }
  return out;
}

export interface HospitableInquiry {
  id: string;
  platform?: string | null;
  inquiry_date?: string | null;
  arrival_date?: string | null;
  departure_date?: string | null;
  conversation_language?: string | null;
  guest?: { first_name?: string | null; last_name?: string | null } | null;
}

export async function listHospitableInquiries(
  token: string,
  propertyId: string,
): Promise<HospitableInquiry[] | null> {
  const out: HospitableInquiry[] = [];
  const base = `/inquiries?properties%5B%5D=${encodeURIComponent(propertyId)}&per_page=100&include=guest`;
  for (let page = 1; page <= 10; page++) {
    const r: Awaited<ReturnType<typeof hospGet<HospitableInquiry>>> = await hospGet(
      token,
      `${base}&page=${page}`,
    );
    if (!r.ok) return page === 1 ? null : out;
    const rows = r.data ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

export async function getHospitableInquiry(
  token: string,
  inquiryId: string,
): Promise<{ guestName: string | null; messages: HospitableMessage[] } | null> {
  try {
    const res = await fetch(
      `${BASE}/inquiries/${encodeURIComponent(inquiryId)}?include=messages,guest`,
      { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        guest?: { first_name?: string | null } | null;
        messages?: HospitableMessage[] | null;
      } | null;
    };
    const data = json.data;
    if (!data) return null;
    return {
      guestName: data.guest?.first_name ?? null,
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch {
    return null;
  }
}

const PLACEHOLDER_MESSAGE_PREFIX = 'hosp_';

export function placeholderMessageId(): string {
  return `${PLACEHOLDER_MESSAGE_PREFIX}${Date.now()}`;
}

export function isPlaceholderMessageId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(PLACEHOLDER_MESSAGE_PREFIX);
}

export async function sendHospitableInquiryMessage(
  token: string,
  inquiryId: string,
  body: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/inquiries/${encodeURIComponent(inquiryId)}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      console.error('hospitable.inquiry_send_failed', { status: res.status });
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as { data?: { id?: string | number } };
    const id = json.data?.id;
    return id === undefined || id === null ? placeholderMessageId() : String(id);
  } catch {
    return null;
  }
}

export async function sendHospitableMessage(
  token: string,
  reservationId: string,
  body: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/reservations/${reservationId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { data?: { id?: string } };
    return json.data?.id ?? placeholderMessageId();
  } catch {
    return null;
  }
}

export function toChannelListing(rp: HospitableProperty): ChannelListing {
  const airbnb = (rp.listings ?? []).find((l) => l.platform === 'airbnb' && l.platform_email);
  return {
    ref: { provider: 'hospitable', id: rp.id },
    name: rp.name ?? rp.public_name ?? null,
    hostEmail: airbnb?.platform_email?.trim().toLowerCase() ?? null,
  };
}

function toState(r: HospitableReservation): ReservationState {
  const raw = String(r.reservation_status?.current?.category ?? r.status ?? '').toLowerCase();
  if (['accepted', 'active', 'confirmed'].includes(raw)) return 'confirmed';
  if (raw.includes('cancel') || raw.includes('denied')) return 'cancelled';
  if (raw.includes('request') || raw.includes('pending')) return 'pending';
  return 'unknown';
}

export function toChannelReservation(
  r: HospitableReservation,
  listingId: string,
): ChannelReservation {
  return {
    ref: { provider: 'hospitable', id: r.id },
    listingRef: { provider: 'hospitable', id: listingId },
    arrivalDate: r.arrival_date.slice(0, 10),
    departureDate: r.departure_date.slice(0, 10),
    state: toState(r),
    confirmationCode: r.code || null,
  };
}

export async function saveHospitableConnection(
  customerId: string,
  token: string,
  accountLabel: string | null,
): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('channel_connections').upsert(
    {
      customer_id: customerId,
      provider: 'hospitable',
      token_enc: encryptPII(token),
      account_label: accountLabel,
      status: 'connected',
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'customer_id,provider' },
  );
  return !error;
}

export async function customerHospitableToken(customerId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('channel_connections')
    .select('token_enc')
    .eq('customer_id', customerId)
    .eq('provider', 'hospitable')
    .eq('status', 'connected')
    .maybeSingle();
  if (!data?.token_enc) return null;
  try {
    return decryptPII(data.token_enc as string);
  } catch {
    return null;
  }
}

export async function hospitableTokenForCustomer(
  customerId: string | null,
): Promise<string | null> {
  if (customerId) {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase
      .from('channel_connections')
      .select('token_enc')
      .eq('customer_id', customerId)
      .eq('provider', 'hospitable')
      .eq('status', 'connected')
      .maybeSingle();
    if (data?.token_enc) {
      try {
        return decryptPII(data.token_enc as string);
      } catch {}
    }
  }
  return providerApiKey();
}
