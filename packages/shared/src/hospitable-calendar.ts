const BASE = 'https://public.api.hospitable.com/v2';

export interface CalendarDay {
  date: string;
  available: boolean | null;
}

export interface CalendarWrite {
  date: string;
  available: boolean;
}

export interface CalendarResult {
  ok: boolean;
  status: number;
  detail: string | null;
}

interface RemoteDay {
  date?: string | null;
  status?: { available?: boolean | null } | null;
}

function printable(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? ' ' : ch;
  }
  return out;
}

async function failureDetail(res: Response): Promise<string | null> {
  try {
    const text = printable(await res.text())
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, 140) : null;
  } catch {
    return null;
  }
}

export async function listHospitableCalendar(
  token: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<CalendarDay[] | null> {
  try {
    const res = await fetch(
      `${BASE}/properties/${encodeURIComponent(propertyId)}/calendar?start_date=${startDate}&end_date=${endDate}`,
      {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: RemoteDay[] | { days?: RemoteDay[] } };
    const days = Array.isArray(json.data) ? json.data : (json.data?.days ?? null);
    if (!Array.isArray(days)) return null;
    return days
      .filter((d): d is RemoteDay & { date: string } => typeof d.date === 'string')
      .map((d) => ({ date: d.date.slice(0, 10), available: d.status?.available ?? null }));
  } catch {
    return null;
  }
}

export async function setHospitableCalendar(
  token: string,
  propertyId: string,
  dates: CalendarWrite[],
): Promise<CalendarResult> {
  if (!dates.length) return { ok: true, status: 204, detail: null };
  try {
    const res = await fetch(`${BASE}/properties/${encodeURIComponent(propertyId)}/calendar`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ dates }),
    });
    if (res.ok) return { ok: true, status: res.status, detail: null };
    return { ok: false, status: res.status, detail: await failureDetail(res) };
  } catch {
    return { ok: false, status: 0, detail: null };
  }
}
