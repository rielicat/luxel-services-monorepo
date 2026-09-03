const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
function parts(isoDate: string): { m: number; d: number } {
  const [, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return { m: m ?? 1, d: d ?? 1 };
}

export function stayRangeEs(arrival: string, departure: string): string {
  return `del ${longDateEs(arrival)} al ${longDateEs(departure)}`;
}

export function longDateEs(isoDate: string): string {
  const { m, d } = parts(isoDate);
  return `${String(d).padStart(2, '0')} de ${MONTHS_ES[m - 1]}`;
}
