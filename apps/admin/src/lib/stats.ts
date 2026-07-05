import 'server-only';
import { createServiceClient } from './supabase';

export interface DashboardData {
  days: number;
  traffic: { pageviews: number; visitors: number; sessions: number; events: number };
  funnel: {
    quoteStarted: number;
    quoteCalculated: number;
    outOfArea: number;
    bookingsCreated: number;
    paid: number;
  };
  revenue: { totalClp: number; paidCount: number; avgClp: number };
  daily: { day: string; count: number }[];
  eventCounts: { event: string; count: number }[];
  topCommunes: { commune: string; count: number }[];
  leads: { total: number; new: number };
  recentBookings: BookingRow[];
}

export interface BookingRow {
  id: string;
  scheduled_date: string;
  timeblock: string;
  status: string;
  payment_status: string;
  total_price_clp: number;
  square_meters: number;
  created_at: string;
  email: string | null;
  commune: string | null;
}

export interface LeadRow {
  id: string;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  commune: string | null;
  service_slug: string | null;
  square_meters: number | null;
  quote_amount_clp: number | null;
  message: string | null;
  status: string;
  created_at: string;
}

export interface SessionRow {
  session_id: string;
  anon_id: string | null;
  distinct_id: string | null;
  events: number;
  started_at: string;
  last_at: string;
  first_path: string | null;
  last_path: string | null;
  converted: boolean;
}

export interface EventRow {
  id: string;
  event: string;
  path: string | null;
  anon_id: string | null;
  session_id: string | null;
  source: string;
  properties: Record<string, unknown> | null;
  country: string | null;
  created_at: string;
}

const since = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();

export async function getDashboard(days = 30): Promise<DashboardData> {
  const supabase = createServiceClient();
  const from = since(days);

  const [traffic, eventCounts, daily, bookingsRes, leadsRes] = await Promise.all([
    supabase.rpc('admin_traffic', { p_days: days }),
    supabase.rpc('admin_event_counts', { p_days: days }),
    supabase.rpc('admin_daily_events', { p_days: Math.min(days, 30) }),
    supabase
      .from('bookings')
      .select(
        'id, scheduled_date, timeblock, status, payment_status, total_price_clp, square_meters, created_at, customers(email), addresses(commune)',
      )
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('leads').select('status').limit(1000),
  ]);

  const trafficRow = (traffic.data?.[0] ?? {}) as Record<string, number>;
  const evc = (eventCounts.data ?? []) as { event: string; count: number }[];
  const evcMap = new Map(evc.map((e) => [e.event, Number(e.count)]));

  const bookings = (bookingsRes.data ?? []) as unknown as Array<
    Omit<BookingRow, 'email' | 'commune'> & {
      customers: { email: string } | { email: string }[] | null;
      addresses: { commune: string | null } | { commune: string | null }[] | null;
    }
  >;
  const flatEmail = (c: (typeof bookings)[number]['customers']) =>
    (Array.isArray(c) ? c[0]?.email : c?.email) ?? null;
  const flatCommune = (a: (typeof bookings)[number]['addresses']) =>
    (Array.isArray(a) ? a[0]?.commune : a?.commune) ?? null;

  const inWindow = bookings.filter((b) => b.created_at >= from);
  const paidInWindow = inWindow.filter((b) => b.payment_status === 'paid');
  const totalRevenue = paidInWindow.reduce((s, b) => s + (b.total_price_clp ?? 0), 0);

  const communeCounts = new Map<string, number>();
  for (const b of bookings) {
    const c = flatCommune(b.addresses);
    if (c) communeCounts.set(c, (communeCounts.get(c) ?? 0) + 1);
  }

  const leads = (leadsRes.data ?? []) as { status: string }[];

  return {
    days,
    traffic: {
      pageviews: Number(trafficRow.pageviews ?? 0),
      visitors: Number(trafficRow.visitors ?? 0),
      sessions: Number(trafficRow.sessions ?? 0),
      events: Number(trafficRow.events ?? 0),
    },
    funnel: {
      quoteStarted: evcMap.get('quote_started') ?? 0,
      quoteCalculated: evcMap.get('quote_calculated') ?? 0,
      outOfArea: evcMap.get('quote_out_of_area') ?? 0,
      bookingsCreated: inWindow.length,
      paid: paidInWindow.length,
    },
    revenue: {
      totalClp: totalRevenue,
      paidCount: paidInWindow.length,
      avgClp: paidInWindow.length ? Math.round(totalRevenue / paidInWindow.length) : 0,
    },
    daily: (daily.data ?? []).map((d: { day: string; count: number }) => ({
      day: d.day,
      count: Number(d.count),
    })),
    eventCounts: evc.map((e) => ({ event: e.event, count: Number(e.count) })),
    topCommunes: [...communeCounts.entries()]
      .map(([commune, count]) => ({ commune, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    leads: { total: leads.length, new: leads.filter((l) => l.status === 'new').length },
    recentBookings: bookings.slice(0, 10).map((b) => ({
      id: b.id,
      scheduled_date: b.scheduled_date,
      timeblock: b.timeblock,
      status: b.status,
      payment_status: b.payment_status,
      total_price_clp: b.total_price_clp,
      square_meters: b.square_meters,
      created_at: b.created_at,
      email: flatEmail(b.customers),
      commune: flatCommune(b.addresses),
    })),
  };
}

export async function getLeads(): Promise<LeadRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('leads')
    .select(
      'id, source, name, email, phone, commune, service_slug, square_meters, quote_amount_clp, message, status, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(300);
  return (data ?? []) as LeadRow[];
}

export async function getSessions(days = 30, limit = 100): Promise<SessionRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.rpc('admin_sessions', { p_days: days, p_limit: limit });
  return ((data ?? []) as SessionRow[]).map((s) => ({ ...s, events: Number(s.events) }));
}

export async function getSessionEvents(sessionId: string): Promise<EventRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('analytics_events')
    .select('id, event, path, anon_id, session_id, source, properties, country, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(500);
  return (data ?? []) as EventRow[];
}

export async function getEvents(eventFilter?: string, limit = 100): Promise<EventRow[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('analytics_events')
    .select('id, event, path, anon_id, session_id, source, properties, country, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (eventFilter) q = q.eq('event', eventFilter);
  const { data } = await q;
  return (data ?? []) as EventRow[];
}

export async function getEventNames(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.rpc('admin_event_counts', { p_days: 90 });
  return ((data ?? []) as { event: string }[]).map((e) => e.event);
}
