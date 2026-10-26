// Usage: npm run verify-emails -- [--dry-run]
// Checks the contact emails saved as "UNVERIFIED GUESS" (built from each company's email format) with Hunter.
// Hiring managers and HR go first. Each address is checked once even when the person is on several jobs.
//   valid       -> marked verified
//   accept_all  -> kept, marked "catch-all, Hunter cannot confirm"
//   invalid     -> Hunter's email finder looks for the right one (spends a search); if none, the guess is removed
// Searches left after that go to people at open jobs who have no email at all, hiring managers and HR first.
// Stops cleanly when Hunter runs out of verifications or searches for the month; run it again after the reset.
import { neon } from '@neondatabase/serverless';

const dry = process.argv.includes('--dry-run');
const sql = neon(process.env.DATABASE_URL!);
const key = (process.env.HUNTER_API_KEY || '').trim().replace(/^['"]|['"]$/g, '').trim();
if (!key) { console.error('HUNTER_API_KEY is not set'); process.exit(1); }

class OutOfLookups extends Error {}
async function hunter(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.hunter.io/v2/${path}?${new URLSearchParams({ ...params, api_key: key })}`);
  if (res.status === 429 || res.status === 402) throw new OutOfLookups(path);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.errors?.[0]?.details || `Hunter ${path} failed (${res.status})`);
  return json.data;
}

const SEAT_ORDER = ['Hiring manager', 'HR / recruiting', 'Department lead', 'VP of the department', 'CEO', 'Personal connection', 'Other'];
const rank = (notes: string) => { const i = SEAT_ORDER.findIndex((s) => notes.startsWith(s)); return i < 0 ? SEAT_ORDER.length : i; };
const today = new Date().toISOString().slice(0, 10);
const GUESS = /Email UNVERIFIED GUESS[^.]*\. Verify with Hunter before sending/;

const rows = await sql`SELECT c.id, c.name, c.email, c.notes, j.company FROM job_contacts c JOIN jobs j ON j.id = c.job_id
  WHERE c.deleted_at IS NULL AND j.deleted_at IS NULL AND j.stage <> 'Closed' AND c.notes LIKE '%Email UNVERIFIED GUESS%' AND coalesce(c.email, '') <> ''`;
rows.sort((a: any, b: any) => rank(a.notes) - rank(b.notes) || a.id - b.id);
const byEmail = new Map<string, any[]>();
for (const r of rows) byEmail.set(r.email.toLowerCase(), [...(byEmail.get(r.email.toLowerCase()) || []), r]);
console.log(`${rows.length} guessed contacts, ${byEmail.size} distinct addresses${dry ? ' (dry run, nothing is spent or saved)' : ''}`);

async function mark(group: any[], email: string, note: string) {
  if (dry) return;
  for (const r of group) await sql`UPDATE job_contacts SET email = ${email}, notes = ${String(r.notes).replace(GUESS, note)} WHERE id = ${r.id}`;
}

const tally = { verified: 0, catch_all: 0, found: 0, removed: 0, unknown: 0 };
let searchesLeft = true;
try {
  for (const [email, group] of byEmail) {
    const who = `${group[0].name} (${group[0].company})`;
    if (dry) { console.log(`would check ${email}  ${who}`); continue; }
    const v = await hunter('email-verifier', { email });
    if (v?.status === 'valid') { tally.verified++; await mark(group, email, `Email verified by Hunter ${today}`); console.log(`valid     ${email}  ${who}`); continue; }
    if (v?.status === 'accept_all') { tally.catch_all++; await mark(group, email, `Email is a guess at a catch-all domain; Hunter cannot confirm it (${today})`); console.log(`catch-all ${email}  ${who}`); continue; }
    if (v?.status !== 'invalid') { tally.unknown++; await mark(group, email, `Email still unverified; Hunter returned "${v?.status || 'unknown'}" (${today})`); console.log(`unknown   ${email}  ${who}`); continue; }
    // the guess bounces: look for the real one while searches last
    const [first, ...rest] = String(group[0].name).replace(/\(.*?\)/g, '').trim().split(/\s+/);
    let found: any = null;
    if (searchesLeft && rest.length) {
      try { found = await hunter('email-finder', { first_name: first, last_name: rest.join(' '), domain: email.split('@')[1] }); }
      catch (e) { if (e instanceof OutOfLookups) searchesLeft = false; else throw e; }
    }
    if (found?.email) { tally.found++; await mark(group, String(found.email).toLowerCase(), `Email found by Hunter ${today}, confidence ${found.score ?? '?'}%`); console.log(`found     ${found.email}  ${who} (guess ${email} was invalid)`); }
    else { tally.removed++; await mark(group, '', `Guessed email ${email} was invalid per Hunter ${today}; no other address found${searchesLeft ? '' : ' (out of searches, run again after the reset)'}`); console.log(`invalid   ${email}  ${who}, removed`); }
  }
} catch (e) {
  if (!(e instanceof OutOfLookups)) throw e;
  console.log('Hunter is out of verifications for the month. Run this again after the reset to finish the rest.');
}

// Searches left over go to people at open jobs with no email at all (companies whose format could not be found).
const missing = await sql`SELECT c.id, c.name, c.notes, j.company FROM job_contacts c JOIN jobs j ON j.id = c.job_id JOIN lanes l ON l.id = j.lane_id
  WHERE c.deleted_at IS NULL AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.stage <> 'Closed' AND coalesce(c.email, '') = ''`;
missing.sort((a: any, b: any) => rank(a.notes || '') - rank(b.notes || '') || a.id - b.id);
const searched = new Map<string, string | null>();
for (const r of missing) {
  const [first, ...rest] = String(r.name).replace(/\(.*?\)/g, '').trim().split(/\s+/);
  if (!rest.length || !searchesLeft) continue;
  const k = `${r.name}|${r.company}`.toLowerCase();
  if (dry) { if (!searched.has(k)) console.log(`would search ${r.name} (${r.company})`); searched.set(k, null); continue; }
  if (!searched.has(k)) {
    try { const f = await hunter('email-finder', { first_name: first, last_name: rest.join(' '), company: String(r.company).trim() }); searched.set(k, f?.email ? `${String(f.email).toLowerCase()}|${f.score ?? '?'}` : null); }
    catch (e) { if (e instanceof OutOfLookups) { searchesLeft = false; continue; } searched.set(k, null); }
  }
  const hit = searched.get(k);
  if (!hit) continue;
  const [email, score] = hit.split('|');
  tally.found++;
  await sql`UPDATE job_contacts SET email = ${email}, notes = CASE WHEN coalesce(notes, '') = '' THEN ${`Email found by Hunter ${today}, confidence ${score}%`} ELSE notes || '. ' || ${`Email found by Hunter ${today}, confidence ${score}%`} END WHERE id = ${r.id}`;
  console.log(`found     ${email}  ${r.name} (${r.company})`);
}
if (!searchesLeft) console.log('Hunter is out of searches for the month; the rest wait for the next reset.');
console.log(tally);
