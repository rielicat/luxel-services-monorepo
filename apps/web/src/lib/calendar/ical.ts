/** Minimal RFC 5545 iCal read/write for availability-only calendars (busy dates,
 *  no guest data). AirBnB/Booking/Vrbo feeds are simple all-day VEVENTs. */

export interface ICalEvent {
  uid: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (exclusive)
  summary: string;
}

function toDate(v: string): string {
  const d = v.replace(/[^0-9]/g, '').slice(0, 8);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function addDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function parseICal(text: string): ICalEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, ''); // RFC 5545 line unfolding
  const events: ICalEvent[] = [];
  let cur: Partial<ICalEvent> | null = null;
  for (const line of unfolded.split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur?.start) {
        const end = cur.end ?? addDay(cur.start);
        events.push({
          uid: cur.uid ?? `${cur.start}-${end}`,
          start: cur.start,
          end,
          summary: cur.summary ?? '',
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const name = (line.slice(0, idx).split(';')[0] ?? '').toUpperCase();
    const value = line.slice(idx + 1).trim();
    if (name === 'UID') cur.uid = value;
    else if (name === 'DTSTART') cur.start = toDate(value);
    else if (name === 'DTEND') cur.end = toDate(value);
    else if (name === 'SUMMARY') cur.summary = value;
  }
  return events;
}

export function buildICal(
  name: string,
  blocks: Array<{ id: string; starts_on: string; ends_on: string; summary: string | null }>,
  stamp: string,
): string {
  const compact = (d: string) => d.replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Luxel//Calendar//ES',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${name.replace(/[\r\n]+/g, ' ')}`,
  ];
  for (const b of blocks) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@luxel.cl`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(b.starts_on)}`,
      `DTEND;VALUE=DATE:${compact(b.ends_on)}`,
      `SUMMARY:${(b.summary ?? 'No disponible').replace(/[\r\n]+/g, ' ')}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
