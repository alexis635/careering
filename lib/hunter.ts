import { HttpError, loadJob } from './ai.js';

const BASE = 'https://api.hunter.io/v2';

/** Vercel values sometimes pick up a stray space, newline, or quote marks when pasted. */
const cleanKey = () => (process.env.HUNTER_API_KEY || '').trim().replace(/^['"]|['"]$/g, '').trim();

async function hunter(path: string, params: Record<string, string>) {
  const key = cleanKey();
  if (!key) throw new HttpError(400, 'HUNTER_API_KEY is not set');
  const qs = new URLSearchParams({ ...params, api_key: key });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  const json: any = await res.json().catch(() => ({}));
  if (res.status === 429 || res.status === 402) throw new HttpError(429, 'Out of Hunter lookups for this month. They reset on your billing date.');
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, json?.errors?.[0]?.details || 'Hunter could not answer this time.');
  return json.data;
}

/** Remaining free lookups, so she can see what is left. This call does not cost credits. */
export async function hunterUsage() {
  if (!cleanKey()) return { enabled: false, reason: 'The app cannot see HUNTER_API_KEY yet. Check the name in Vercel and redeploy.' };
  let d: any;
  try { d = await hunter('account', {}); } catch (e: any) { return { enabled: false, reason: `Hunter said: ${e.message}. The saved key is ${cleanKey().length} characters long and ends in ${cleanKey().slice(-4)}. The right one is 40 characters and ends in 8f2a.` }; }
  return { enabled: true, searches: d?.requests?.searches ?? null, verifications: d?.requests?.verifications ?? null };
}

/** Find one person's email from name + company. Only spends a lookup when she clicks. */
export async function hunterFind(body: { job_id?: number; name?: string; domain?: string }) {
  const job = await loadJob(Number(body.job_id));
  const parts = String(body.name || '').trim().split(/\s+/);
  if (parts.length < 2) throw new HttpError(400, 'Hunter needs a first and last name');
  const first = parts[0];
  const last = parts.slice(1).join(' ');
  const domain = String(body.domain || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const d = await hunter('email-finder', { first_name: first, last_name: last, ...(domain ? { domain } : { company: job.company }) });
  if (!d?.email) throw new HttpError(404, 'Hunter has no email on file for this person.');
  return {
    email: String(d.email),
    score: Number(d.score ?? 0),
    verified: d.verification?.status === 'valid',
    position: String(d.position || ''),
    domain: String(d.domain || domain || ''),
  };
}
