// Minimal Cloudflare API v4 helper shared by the export/import scripts.
// Requires env: CLOUDFLARE_API_TOKEN, CF_ZONE_ID, CF_ACCOUNT_ID.

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
export const ZONE_ID = process.env.CF_ZONE_ID;
export const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

if (!TOKEN) {
  console.error('Missing CLOUDFLARE_API_TOKEN.');
  process.exit(1);
}

const BASE = 'https://api.cloudflare.com/client/v4';

export async function cf(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = (body.errors || []).map((e) => `${e.code} ${e.message}`).join('; ');
    throw new Error(`CF ${path} → ${res.status} ${msg || res.statusText}`);
  }
  return body.result;
}

// Some collections (Email Routing rules/addresses) cap per_page at 50, so use
// 50 everywhere and page while a full page comes back — never assume 100.
const PER_PAGE = 50;

/** GET a paginated collection (dns_records, rules, addresses). */
export async function cfAll(path) {
  const out = [];
  let page = 1;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await cf(`${path}${sep}page=${page}&per_page=${PER_PAGE}`);
    if (!Array.isArray(res)) return res;
    out.push(...res);
    if (res.length < PER_PAGE) break;
    page += 1;
  }
  return out;
}
