/**
 * Phone numbers the way WhatsApp's Cloud API wants them: E.164 digits, no plus,
 * no spaces. Chile is the default country, so a host typing "9 1234 5678" means
 * +56 9 1234 5678; a "00" international prefix and trunk zeros are dropped. A
 * bare number longer than any national number (11+ digits) is taken as already
 * carrying its country code. Returns null for anything that cannot be a phone.
 */
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

/** Display form: +56 9 1234 5678 for Chilean mobiles, +<digits> otherwise. */
export function formatPhone(raw: string | null | undefined): string {
  const digits = toE164Digits(raw);
  if (!digits) return raw ?? '';
  if (/^569\d{8}$/.test(digits)) return `+56 9 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}
