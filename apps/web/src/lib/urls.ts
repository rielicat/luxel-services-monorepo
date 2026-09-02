const PRODUCTION_ORIGIN = 'https://serviciosluxel.cl';

export function appUrl(): string {
  if (process.env.VERCEL_ENV === 'production') {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return host ? `https://${host}` : PRODUCTION_ORIGIN;
  }
  const preview = process.env.VERCEL_URL;
  if (preview) return `https://${preview}`;
  return 'http://localhost:3000';
}
