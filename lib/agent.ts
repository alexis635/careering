// Agent API for Noelle (Muse). Lives under /api/agent/v1 and is the ONLY way her key gets in.
// Shared rules (auth, envelope, idempotency, allowlists, audit) are in noelle-api/CONVENTIONS.md.
// She can add jobs to the Saved stage, fix their details, and leave notes. Stage, lane moves,
// outcomes, and deletes are Alexis only, so her key is refused on those fields instead of ignoring them.
import { createHash, timingSafeEqual } from 'node:crypto';
import { q } from './db.js';
import { deepNoDash } from '../src/lib/noDash.js';
import { waitUntil } from '@vercel/functions';
import { aiRoute, parseJob } from './ai-routes.js';
import { fetchPosting } from './posting.js';
import { resolveLogo } from './logo.js';
import { loadJob } from './ai.js';

type Out = { status?: number; json: any; headers?: Record<string, string> };
type Req = { method: string; parts: string[]; query: URLSearchParams; headers: Record<string, any>; host: string; ip: string; readBody: () => Promise<any> };

const AGENT = 'noelle';
const FITS = ['strong', 'moderate', 'weak'];
const STAGES = ['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Closed'];
// API name -> column. Anything not listed here cannot be written with the agent key.
const WRITABLE: Record<string, string> = {
  title: 'role_title', company: 'company', posting_url: 'source_link', fit: 'fit',
  salary: 'salary_range', location: 'location', remote_type: 'remote_type', deadline: 'deadline', posting_text: 'posting_text',
};
const HUMAN_ONLY = ['stage', 'lane_id', 'closed_outcome', 'applied_date', 'type', 'created_by'];

const ok = (data: any, status = 200): Out => ({ status, json: { data } });
const fail = (status: number, code: string, message: string, details?: any): Out => ({ status, json: { error: { code, message, ...(details ? { details } : {}) } } });

// ---- schema (created on first use so a deploy needs no manual migration) ----
let ready: Promise<void> | null = null;
export function ensureAgentSchema() {
  ready ??= (async () => {
    await q(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'alexis'`);
    await q(`CREATE TABLE IF NOT EXISTS agent_log (
      id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), agent TEXT NOT NULL,
      method TEXT NOT NULL, path TEXT NOT NULL, status INT NOT NULL, job_id INT,
      summary TEXT NOT NULL DEFAULT '', before JSONB, after JSONB)`);
    await q(`CREATE TABLE IF NOT EXISTS agent_requests (
      idem_key TEXT PRIMARY KEY, method TEXT NOT NULL, path TEXT NOT NULL,
      status INT NOT NULL, response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

// ---- auth: AGENT_API_KEY, plus AGENT_API_KEY_NEXT while rotating. Neither set = agent API off. ----
const digest = (s: string) => createHash('sha256').update(s).digest();
function checkKey(header: string | undefined): 'primary' | 'next' | 'none' | 'off' {
  const keys = [['primary', process.env.AGENT_API_KEY], ['next', process.env.AGENT_API_KEY_NEXT]] as const;
  if (!keys.some(([, k]) => k)) return 'off';
  const given = (header || '').replace(/^Bearer\s+/i, '').trim();
  if (!given) return 'none';
  for (const [name, k] of keys) if (k && timingSafeEqual(digest(given), digest(k))) return name;
  return 'none';
}

// ---- posting URL normalization, so tracking params and LinkedIn/Indeed variants dedupe ----
export function normalizeUrl(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^[a-z]{2}\.linkedin\.com$/, 'linkedin.com');
    if (host.endsWith('linkedin.com')) {
      const id = u.searchParams.get('currentJobId') || u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d+)\/?$/)?.[1];
      if (id) return `linkedin.com/jobs/view/${id}`;
    }
    if (host.endsWith('indeed.com')) {
      const jk = u.searchParams.get('jk') || u.searchParams.get('vjk');
      if (jk) return `indeed.com/viewjob?jk=${jk.toLowerCase()}`;
    }
    const keep = ['gh_jid', 'jobid', 'job_id', 'jk', 'id', 'req', 'requisitionid', 'jobreqid'];
    const qs = [...u.searchParams.entries()].filter(([k]) => keep.includes(k.toLowerCase()))
      .map(([k, v]) => `${k.toLowerCase()}=${v.toLowerCase()}`).sort().join('&');
    return `${host}${u.pathname.replace(/\/+$/, '').toLowerCase()}${qs ? `?${qs}` : ''}`;
  } catch {
    return s.toLowerCase();
  }
}
const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---- enrichment: the same steps the app runs when Alexis adds a job by link ----
// Read the posting (or use the text Noelle sent), parse it into the overview,
// rate the fit against the Library, find the logo. Runs after the response
// (waitUntil) because the AI steps can take a minute.
export async function enrichJob(id: number): Promise<{ ok: boolean; reason?: string }> {
  try {
    let job = await loadJob(id);
    let text: string = job.posting_text ?? '';
    if (!text.trim() && job.source_link) {
      try {
        text = await fetchPosting(job.source_link);
        job = (await q(`UPDATE jobs SET posting_text=$1, updated_at=now() WHERE id=$2 RETURNING *`, [text, id]))[0];
      } catch (e: any) {
        await q(`INSERT INTO job_notes (job_id, body, kind) VALUES ($1, $2, 'Careering')`,
          [id, `Couldn't read this posting automatically (${e?.message || 'the site blocked it'}). Paste the posting text on the Overview tab to fill in the overview and fit.`]);
        await resolveLogo(id).catch(() => {});
        return { ok: false, reason: e?.message || 'fetch failed' };
      }
    }
    if (text.trim()) {
      try {
        await parseJob(job, text);
      } catch (e: any) {
        // Read fine but no posting in it: usually closed, or the page builds itself with scripts.
        await q(`INSERT INTO job_notes (job_id, body, kind) VALUES ($1, $2, 'Careering')`,
          [id, `Careering read this link but couldn't find a job posting in it. The posting may have closed, or the page only loads in a browser. Check the link, and paste the posting text on the Overview tab if it's still open.`]);
        await resolveLogo(id).catch(() => {});
        return { ok: false, reason: e?.message || 'no posting found' };
      }
    }
    await aiRoute('match', { job_id: id }).catch((e) => console.warn('enrich match skipped', id, e?.message));
    await resolveLogo(id).catch(() => {});
    return { ok: true };
  } catch (e: any) {
    console.error('enrichJob failed', id, e);
    return { ok: false, reason: e?.message };
  }
}

// ---- reading jobs in the API shape ----
const JOB_SELECT = `
  SELECT j.id, j.role_title, j.company, j.source_link, j.stage, j.closed_outcome, j.lane_id, l.name AS lane_name,
         j.fit, j.salary_range, j.location, j.remote_type, j.type, j.created_by,
         to_char(j.deadline, 'YYYY-MM-DD') AS deadline, to_char(j.applied_date, 'YYYY-MM-DD') AS applied_date,
         to_char(j.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
         to_char(j.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`;
const JOB_FROM = `FROM jobs j JOIN lanes l ON l.id = j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL`;

function shape(j: any, host: string) {
  return {
    id: j.id, title: j.role_title, company: j.company, posting_url: j.source_link || null,
    stage: String(j.stage).toLowerCase(), closed_outcome: j.closed_outcome ?? null,
    lane_id: j.lane_id, lane_name: j.lane_name, fit: j.fit ?? null,
    salary: j.salary_range || null, location: j.location || null, remote_type: j.remote_type || null,
    deadline: j.deadline ?? null, applied_date: j.applied_date ?? null, type: j.type, created_by: j.created_by,
    created_at: j.created_at, updated_at: j.updated_at, app_url: `https://${host}/jobs/${j.id}`,
    ...(j.posting_text !== undefined ? { posting_text: j.posting_text } : {}),
  };
}

async function getJob(id: number, host: string, full = false) {
  const row = (await q(`${JOB_SELECT}${full ? ', j.posting_text' : ''} ${JOB_FROM} AND j.id = $1`, [id]))[0];
  if (!row) return null;
  const job: any = shape(row, host);
  if (full) {
    job.notes = await q(
      `SELECT id, kind AS author, body, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM job_notes WHERE job_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [id]);
  }
  return job;
}

// Every job (trashed included) whose posting URL or company + title matches.
async function findDuplicates(b: { posting_url?: string; company?: string; title?: string }, exceptId?: number) {
  const rows = await q(
    `SELECT j.id, j.company, j.role_title, j.source_link, j.stage, (j.deleted_at IS NOT NULL OR l.deleted_at IS NOT NULL) AS in_trash
       FROM jobs j JOIN lanes l ON l.id = j.lane_id WHERE j.type = 'application'`);
  const url = normalizeUrl(b.posting_url || '');
  const others = rows.filter((r: any) => r.id !== exceptId);
  const byUrl = url ? others.find((r: any) => normalizeUrl(r.source_link) === url) : undefined;
  const byName = b.company && b.title ? others.filter((r: any) => sameName(r.company, b.company!) && sameName(r.role_title, b.title!)) : [];
  return { byUrl, byName };
}
const dupView = (r: any) => ({ id: r.id, company: r.company, title: r.role_title, posting_url: r.source_link || null, stage: String(r.stage).toLowerCase(), in_trash: !!r.in_trash });

function validate(body: any): string | null {
  if ('fit' in body && body.fit !== null && !FITS.includes(body.fit)) return 'fit must be strong, moderate, weak, or null';
  if ('deadline' in body && body.deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.deadline))) return 'deadline must be YYYY-MM-DD or null';
  for (const f of ['title', 'company']) if (f in body && (typeof body[f] !== 'string' || !body[f].trim())) return `${f} must be a non-empty string`;
  for (const [f, v] of Object.entries(body)) if (f in WRITABLE && v !== null && typeof v !== 'string') return `${f} must be a string or null`;
  return null;
}
const colVal = (f: string, v: any) => (v === null && !['fit', 'deadline'].includes(f) ? '' : typeof v === 'string' ? v.trim() : v);

async function log(r: Req, status: number, entry: { job_id?: number | null; summary?: string; before?: any; after?: any }) {
  try {
    await q(`INSERT INTO agent_log (agent, method, path, status, job_id, summary, before, after) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [AGENT, r.method, '/' + r.parts.join('/'), status, entry.job_id ?? null, entry.summary ?? '',
        entry.before ? JSON.stringify(entry.before) : null, entry.after ? JSON.stringify(entry.after) : null]);
  } catch (e) { console.error('agent_log write failed', e); }
}

// ---- routes (parts are after /agent/v1) ----
async function route(r: Req, body: any): Promise<Out & { audit?: Parameters<typeof log>[2] }> {
  const [a, b, c] = r.parts;
  const id = b ? Number(b) : NaN;

  if (a === 'whoami' && r.method === 'GET') {
    return ok({ app: 'careering', agent: AGENT, time: new Date().toISOString(), timezone: 'America/Chicago' });
  }

  if (a === 'lanes' && !b && r.method === 'GET') {
    const lanes = await q(`SELECT id, name, notes, stages_config FROM lanes WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY position, id`);
    return ok(lanes.map((l: any) => ({ id: l.id, name: l.name, notes: l.notes || null, stage_labels: l.stages_config?.stages ?? null })));
  }

  if (a !== 'jobs') return fail(404, 'not_found', 'No such endpoint. See CONVENTIONS.md and careering.md.');

  // GET /jobs
  if (!b && r.method === 'GET') {
    const where: string[] = [];
    const vals: any[] = [];
    const add = (sql: string, v: any) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
    const p = r.query;
    if (p.get('lane_id')) add('j.lane_id = ?', Number(p.get('lane_id')));
    if (p.get('stage') && p.get('stage') !== 'all') {
      const st = STAGES.find((s) => s.toLowerCase() === p.get('stage')!.toLowerCase());
      if (!st) return fail(400, 'invalid_filter', 'stage must be saved, applied, screening, interviewing, offer, closed, or all');
      add('j.stage = ?', st);
    }
    if (p.get('fit')) add('j.fit = ?', p.get('fit'));
    if (p.get('created_by')) add('j.created_by = ?', p.get('created_by'));
    if (p.get('updated_since')) add('j.updated_at > ?::timestamptz', p.get('updated_since'));
    if (p.get('search')) add(`(j.company ILIKE ? OR j.role_title ILIKE $${vals.length + 1})`, `%${p.get('search')}%`);
    if (p.get('posting_url')) {
      const { byUrl } = await findDuplicates({ posting_url: p.get('posting_url')! });
      add('j.id = ?', byUrl && !byUrl.in_trash ? byUrl.id : -1);
    }
    const per = Math.min(Math.max(Number(p.get('per_page')) || 50, 1), 200);
    const page = Math.max(Number(p.get('page')) || 1, 1);
    const rows = await q(`${JOB_SELECT} ${JOB_FROM} ${where.length ? 'AND ' + where.join(' AND ') : ''} ORDER BY j.updated_at DESC, j.id DESC LIMIT ${per + 1} OFFSET ${(page - 1) * per}`, vals);
    return { json: { data: rows.slice(0, per).map((j: any) => shape(j, r.host)), page, per_page: per, has_more: rows.length > per } };
  }

  // POST /jobs: always lands in Saved, in the lane she names
  if (!b && r.method === 'POST') {
    const banned = HUMAN_ONLY.filter((f) => f in body && !(f === 'lane_id' || (f === 'stage' && String(body.stage).toLowerCase() === 'saved')));
    if (banned.length) return fail(403, 'field_not_allowed', `Only Alexis can set: ${banned.join(', ')}. New jobs always start in Saved.`);
    const unknown = Object.keys(body).filter((f) => !(f in WRITABLE) && !['lane_id', 'stage', 'confirm_new'].includes(f));
    if (unknown.length) return fail(400, 'unknown_field', `Unknown field(s): ${unknown.join(', ')}`);
    if (!body.title || !body.company) return fail(400, 'missing_field', 'title and company are required');
    const bad = validate(body);
    if (bad) return fail(400, 'invalid_field', bad);
    const lanes = await q(`SELECT id, name FROM lanes WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY position, id`);
    const lane = lanes.find((l: any) => l.id === Number(body.lane_id));
    if (!lane) return fail(400, 'lane_required', 'lane_id must be one of the active lanes. Pick the closest fit by name.', { lanes });

    const { byUrl, byName } = await findDuplicates(body);
    if (byUrl) return fail(409, 'duplicate', byUrl.in_trash ? 'This posting is already in Careering (Alexis moved it to the Trash). Do not re-add it.' : 'This posting is already in Careering.', { existing: dupView(byUrl) });
    if (byName.length && body.confirm_new !== true) {
      return fail(409, 'possible_duplicate', 'A job with the same company and title exists. If it is truly a different posting, resend with "confirm_new": true.', { existing: byName.map(dupView) });
    }

    const cols = ['lane_id', 'stage', 'type', 'created_by'];
    const vals: any[] = [lane.id, 'Saved', 'application', AGENT];
    for (const [f, col] of Object.entries(WRITABLE)) if (f in body) { cols.push(col); vals.push(colVal(f, body[f])); }
    const row = (await q(`INSERT INTO jobs (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals))[0];
    const job = await getJob(row.id, r.host);
    waitUntil(enrichJob(row.id));
    return { ...ok(job, 201), audit: { job_id: row.id, summary: `Added ${job.company}, ${job.title} to Saved in ${lane.name}`, after: job } };
  }

  if (!Number.isInteger(id)) return fail(404, 'not_found', 'Job id must be a number');

  // GET /jobs/:id
  if (!c && r.method === 'GET') {
    const job = await getJob(id, r.host, true);
    return job ? ok(job) : fail(404, 'not_found', 'No job with that id (or it is in the Trash)');
  }

  // PATCH /jobs/:id
  if (!c && r.method === 'PATCH') {
    const banned = HUMAN_ONLY.filter((f) => f in body);
    if (banned.length) return fail(403, 'field_not_allowed', `Only Alexis can change: ${banned.join(', ')}`);
    const unknown = Object.keys(body).filter((f) => !(f in WRITABLE));
    if (unknown.length) return fail(400, 'unknown_field', `Unknown field(s): ${unknown.join(', ')}`);
    if (!Object.keys(body).length) return fail(400, 'empty_update', 'Send at least one field');
    const bad = validate(body);
    if (bad) return fail(400, 'invalid_field', bad);
    const before = await getJob(id, r.host, true);
    if (!before) return fail(404, 'not_found', 'No job with that id (or it is in the Trash)');
    const ifMatch = String(r.headers['if-match'] || '').replace(/"/g, '').trim();
    if (ifMatch && ifMatch !== before.updated_at) return fail(409, 'stale_write', 'This job changed since you read it. Re-read it and try again.', { current: before });
    if (body.posting_url) {
      const { byUrl } = await findDuplicates({ posting_url: body.posting_url }, id);
      if (byUrl) return fail(409, 'duplicate', 'Another job already has this posting URL', { existing: dupView(byUrl) });
    }
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [f, col] of Object.entries(WRITABLE)) if (f in body) { vals.push(colVal(f, body[f])); sets.push(`${col} = $${vals.length}`); }
    vals.push(id);
    await q(`UPDATE jobs SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
    const after = await getJob(id, r.host, true);
    const changed = Object.keys(body).join(', ');
    // New posting text or link: re-read and re-parse so the overview and fit stay in step.
    if ('posting_text' in body || 'posting_url' in body) waitUntil(enrichJob(id));
    return { ...ok(after), audit: { job_id: id, summary: `Updated ${after.company}, ${after.title}: ${changed}`, before, after } };
  }

  // POST /jobs/:id/notes: her notes sit in the job's Notes Log, marked Noelle
  if (c === 'notes' && r.method === 'POST') {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) return fail(400, 'missing_field', 'body is required');
    if (text.length > 20000) return fail(400, 'too_long', 'Notes are capped at 20,000 characters');
    const job = await getJob(id, r.host);
    if (!job) return fail(404, 'not_found', 'No job with that id (or it is in the Trash)');
    const note = (await q(
      `INSERT INTO job_notes (job_id, body, kind) VALUES ($1, $2, 'Noelle')
       RETURNING id, kind AS author, body, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`, [id, text]))[0];
    return { ...ok(note, 201), audit: { job_id: id, summary: `Added a note to ${job.company}, ${job.title}`, after: note } };
  }

  if (r.method === 'DELETE') return fail(403, 'not_allowed', 'Only Alexis can delete. If something is a duplicate, add a note saying so.');
  return fail(405, 'method_not_allowed', `${r.method} is not supported here`);
}

export async function handleAgent(r: Req): Promise<Out> {
  if (r.parts[0] !== 'v1') return fail(404, 'not_found', 'Use /api/agent/v1/...');
  r = { ...r, parts: r.parts.slice(1) };
  const who = checkKey(r.headers.authorization);
  if (who === 'off') return fail(503, 'agent_api_off', 'The agent API is turned off');
  if (who === 'none') {
    console.warn(JSON.stringify({ event: 'agent_auth_failed', path: '/' + r.parts.join('/'), method: r.method, ip: r.ip, had_header: !!r.headers.authorization }));
    return fail(401, 'unauthorized', 'Missing or invalid API key');
  }
  await ensureAgentSchema();

  const writes = r.method === 'POST' || r.method === 'PATCH';
  const path = '/' + r.parts.join('/');
  const idem = writes ? String(r.headers['idempotency-key'] || '').trim().slice(0, 200) : '';
  if (idem) {
    const prior = (await q(`SELECT method, path, status, response FROM agent_requests WHERE idem_key = $1`, [idem]))[0];
    if (prior) {
      if (prior.method !== r.method || prior.path !== path) return fail(422, 'idempotency_key_reused', 'That Idempotency-Key was already used for a different request');
      return { status: prior.status, json: prior.response, headers: { 'Idempotent-Replayed': 'true' } };
    }
  }

  let body: any = {};
  if (writes) {
    const raw = await r.readBody();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(400, 'invalid_json', 'Body must be a JSON object');
    body = deepNoDash(raw);
  }

  let res: Awaited<ReturnType<typeof route>>;
  try {
    res = await route(r, body);
  } catch (e: any) {
    console.error('agent route failed', e);
    res = /invalid input syntax|out of range/i.test(e?.message || '')
      ? fail(400, 'invalid_field', 'A value was not valid (check dates and numbers)')
      : fail(500, 'server_error', 'Something went wrong on the server');
  }
  const { audit, ...out } = res;
  const status = out.status ?? 200;
  await log(r, status, audit ?? {});
  if (idem && status < 500) {
    await q(`INSERT INTO agent_requests (idem_key, method, path, status, response) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [idem, r.method, path, status, JSON.stringify(out.json)]);
  }
  return out;
}

// For the in-app "Noelle" page (cookie auth, not the agent key).
export async function agentActivity(limit = 100) {
  await ensureAgentSchema();
  return q(
    `SELECT a.id, a.at, a.method, a.path, a.status, a.job_id, a.summary, a.before, a.after, j.company, j.role_title
       FROM agent_log a LEFT JOIN jobs j ON j.id = a.job_id
      WHERE a.method <> 'GET' OR a.status >= 400 ORDER BY a.at DESC LIMIT $1`, [Math.min(limit, 500)]);
}
