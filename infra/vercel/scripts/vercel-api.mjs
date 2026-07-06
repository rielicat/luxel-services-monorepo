// Minimal Vercel API helper. Requires env VERCEL_API_TOKEN; optional VERCEL_TEAM_ID.
const TOKEN = process.env.VERCEL_API_TOKEN;
export const TEAM_ID = process.env.VERCEL_TEAM_ID || '';

if (!TOKEN) {
  console.error('Missing VERCEL_API_TOKEN.');
  process.exit(1);
}

const BASE = 'https://api.vercel.com';
const teamQ = TEAM_ID
  ? (p) => (p.includes('?') ? `${p}&teamId=${TEAM_ID}` : `${p}?teamId=${TEAM_ID}`)
  : (p) => p;

export async function vc(path) {
  const res = await fetch(`${BASE}${teamQ(path)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Vercel ${path} → ${res.status} ${JSON.stringify(body.error || body)}`);
  }
  return body;
}

export async function vcPost(path, body) {
  const res = await fetch(`${BASE}${teamQ(path)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`Vercel POST ${path} → ${res.status} ${JSON.stringify(out.error || out)}`);
  return out;
}

/** All projects across every page (Vercel paginates via pagination.next timestamp). */
export async function vcProjects() {
  const out = [];
  let until = '';
  for (;;) {
    const body = await vc(`/v9/projects?limit=100${until ? `&until=${until}` : ''}`);
    out.push(...(body.projects || []));
    const next = body.pagination?.next;
    if (!next) break;
    until = next;
  }
  return out;
}
