import 'server-only';
import { createServiceClient } from './supabase';

interface DashboardData {
  days: number;
  traffic: { pageviews: number; visitors: number; sessions: number; events: number };
  daily: { day: string; count: number }[];
  eventCounts: { event: string; count: number }[];
  leads: { total: number; new: number };
  error: string | null;
}

interface LeadRow {
  id: string;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  commune: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

interface SessionRow {
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

interface EventRow {
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

const EMPTY_DASHBOARD = (days: number, error: string | null): DashboardData => ({
  days,
  traffic: { pageviews: 0, visitors: 0, sessions: 0, events: 0 },
  daily: [],
  eventCounts: [],
  leads: { total: 0, new: 0 },
  error,
});

export async function getDashboard(days = 30): Promise<DashboardData> {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return EMPTY_DASHBOARD(days, e instanceof Error ? e.message : 'supabase_env_missing');
  }

  const [traffic, eventCounts, daily, leadsRes] = await Promise.all([
    supabase.rpc('admin_traffic', { p_days: days }),
    supabase.rpc('admin_event_counts', { p_days: days }),
    supabase.rpc('admin_daily_events', { p_days: Math.min(days, 30) }),
    supabase.from('leads').select('status').limit(1000),
  ]);

  const dbError =
    traffic.error?.message ??
    eventCounts.error?.message ??
    daily.error?.message ??
    leadsRes.error?.message ??
    null;

  const trafficRow = (traffic.data?.[0] ?? {}) as Record<string, number>;
  const evc = (eventCounts.data ?? []) as { event: string; count: number }[];
  const leads = (leadsRes.data ?? []) as { status: string }[];

  return {
    days,
    traffic: {
      pageviews: Number(trafficRow.pageviews ?? 0),
      visitors: Number(trafficRow.visitors ?? 0),
      sessions: Number(trafficRow.sessions ?? 0),
      events: Number(trafficRow.events ?? 0),
    },
    daily: (daily.data ?? []).map((d: { day: string; count: number }) => ({
      day: d.day,
      count: Number(d.count),
    })),
    eventCounts: evc.map((e) => ({ event: e.event, count: Number(e.count) })),
    leads: { total: leads.length, new: leads.filter((l) => l.status === 'new').length },
    error: dbError,
  };
}

export async function getLeads(): Promise<LeadRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('leads')
    .select('id, source, name, email, phone, commune, message, status, created_at')
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

export async function getEvents(eventFilter?: string, limit = 100, days = 30): Promise<EventRow[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('analytics_events')
    .select('id, event, path, anon_id, session_id, source, properties, country, created_at')
    .gte('created_at', since(days))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (eventFilter) q = q.eq('event', eventFilter);
  const { data } = await q;
  return (data ?? []) as EventRow[];
}

export async function getEventsForExport(
  eventFilter?: string,
  days = 30,
  limit = 10000,
): Promise<EventRow[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('analytics_events')
    .select('id, event, path, anon_id, session_id, source, properties, country, created_at')
    .gte('created_at', since(days))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (eventFilter) q = q.eq('event', eventFilter);
  const { data } = await q;
  return (data ?? []) as EventRow[];
}

export async function getEventNames(days = 90): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.rpc('admin_event_counts', { p_days: days });
  return ((data ?? []) as { event: string }[]).map((e) => e.event);
}
