export function formatDocument(docType: string | null, num: string): string {
  if (docType !== 'rut') return num;
  const clean = num.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return num;
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${clean.slice(-1)}`;
}
