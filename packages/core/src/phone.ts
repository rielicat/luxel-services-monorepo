export function toE164Digits(raw: string | null | undefined, defaultCountry = '56'): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else {
      digits = digits.replace(/^0+/, '');
      if (digits.length <= 10) digits = `${defaultCountry}${digits}`;
    }
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function formatPhone(raw: string | null | undefined): string {
  const digits = toE164Digits(raw);
  if (!digits) return raw ?? '';
  if (/^569\d{8}$/.test(digits)) return `+56 9 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}
