import type { IncomingMessage, ServerResponse } from 'node:http';
import { q } from '../lib/db.js';
import { deepNoDash } from '../src/lib/noDash.js';
import { aiRoute } from '../lib/ai-routes.js';
import { attention } from '../lib/attention.js';
import { search } from '../lib/search.js';
import { HttpError } from '../lib/ai.js';
import { authUrl, checkState, gmailStatus, handleCallback, sendEmail, sendToSelf, syncAll, syncReplies } from '../lib/gmail.js';
import { mailList } from '../lib/mail.js';
import { home } from '../lib/home.js';
import { weekly, weeklyFocus, weeklyText } from '../lib/weekly.js';
import { clearSession, isAuthed, issueSession } from '../lib/auth.js';

type Ctx = { method: string; parts: string[]; body: any; query: URLSearchParams; host: string };
type Result = { status?: number; json: any; cookie?: string };

const STAGES = ['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Closed'];

const JOB_FIELDS = [
  'lane_id', 'type', 'company', 'role_title', 'source_link', 'stage', 'closed_outcome',
  'salary_range', 'location', 'remote_type', 'applied_date', 'deadline', 'interview_dates',
  'contact_person', 'contact_notes', 'posting_text', 'match_notes', 'resume_version_id',
  'interview_prep', 'fit',
];
const LANE_FIELDS = ['name', 'target_date', 'status', 'notes', 'color', 'position'];
const LIB_FIELDS = ['kind', 'title', 'body', 'tags'];

function buildUpdate(table: string, fields: string[], id: number, body: any, touch = false) {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (f in body) {
      vals.push(f === 'interview_dates' ? JSON.stringify(body[f]) : body[f]);
      sets.push(`${f} = $${vals.length}`);
    }
  }
  if (touch) sets.push('updated_at = now()');
  if (!sets.length) return null;
  vals.push(id);
  return { text: `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals };
}

function buildInsert(table: string, fields: string[], body: any) {
  const cols = fields.filter((f) => f in body);
  const vals = cols.map((c) => (c === 'interview_dates' ? JSON.stringify(body[c]) : body[c]));
  if (!cols.length) return { text: `INSERT INTO ${table} DEFAULT VALUES RETURNING *`, vals: [] };
  return {
    text: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    vals,
  };
}

export async function route(c: Ctx): Promise<Result> {
  const [a, b, c2, d] = c.parts;
  const id = b ? Number(b) : NaN;

  // ---- lanes ----
  if (a === 'lanes') {
    if (!b && c.method === 'GET') {
      // Active lanes only. Archived and trashed lanes live on the Archive page.
      const lanes = await q(`SELECT * FROM lanes WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY position, id`);
      const counts = await q(`SELECT lane_id, stage, count(*)::int AS n FROM jobs WHERE deleted_at IS NULL GROUP BY lane_id, stage`);
      return { json: lanes.map((l: any) => ({ ...l, counts: counts.filter((x: any) => x.lane_id === l.id) })) };
    }
    if (!b && c.method === 'POST') {
      const s = buildInsert('lanes', LANE_FIELDS, c.body);
      return { json: (await q(s.text, s.vals))[0] };
    }
    if (b && !c2 && c.method === 'GET') return { json: (await q(`SELECT * FROM lanes WHERE id=$1`, [id]))[0] ?? null };
    if (b && !c2 && c.method === 'PATCH') {
      const s = buildUpdate('lanes', LANE_FIELDS, id, c.body);
      return { json: s ? (await q(s.text, s.vals))[0] : null };
    }
    // Nothing is ever destroyed here: archive hides a lane, delete moves it (and every job in it) to the Trash. Restore brings it back.
    if (b && c2 === 'archive' && c.method === 'POST') return { json: (await q(`UPDATE lanes SET archived_at = now() WHERE id=$1 RETURNING *`, [id]))[0] };
    if (b && c2 === 'restore' && c.method === 'POST') return { json: (await q(`UPDATE lanes SET archived_at = NULL, deleted_at = NULL WHERE id=$1 RETURNING *`, [id]))[0] };
    if (b && !c2 && c.method === 'DELETE') {
      await q(`UPDATE lanes SET deleted_at = now() WHERE id=$1`, [id]);
      return { json: { ok: true, trashed: true } };
    }
  }

  // ---- archive + trash ----
  if (a === 'archive' && c.method === 'GET') {
    const laneRows = (where: string) => q(
      `SELECT l.*, (SELECT count(*)::int FROM jobs j WHERE j.lane_id = l.id AND j.deleted_at IS NULL) AS job_count FROM lanes l WHERE ${where} ORDER BY COALESCE(l.deleted_at, l.archived_at) DESC`);
    return {
      json: {
        archivedLanes: await laneRows('l.archived_at IS NOT NULL AND l.deleted_at IS NULL'),
        trashedLanes: await laneRows('l.deleted_at IS NOT NULL'),
        // jobs deleted on their own (jobs inside a trashed lane are restored with the lane)
        trashedJobs: await q(
          `SELECT j.id, j.company, j.role_title, j.stage, j.deleted_at, l.name AS lane_name, l.color FROM jobs j JOIN lanes l ON l.id = j.lane_id
            WHERE j.deleted_at IS NOT NULL AND l.deleted_at IS NULL ORDER BY j.deleted_at DESC`),
      },
    };
  }

  // ---- jobs ----
  if (a === 'jobs') {
    if (!b && c.method === 'GET') {
      const lane = c.query.get('lane_id');
      const rows = lane
        ? await q(`SELECT * FROM jobs WHERE lane_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC`, [Number(lane)])
        : await q(`SELECT * FROM jobs WHERE deleted_at IS NULL ORDER BY updated_at DESC`);
      return { json: rows };
    }
    if (!b && c.method === 'POST') {
      const s = buildInsert('jobs', JOB_FIELDS, c.body);
      return { json: (await q(s.text, s.vals))[0] };
    }
    if (b && !c2) {
      if (c.method === 'GET') return { json: (await q(`SELECT * FROM jobs WHERE id=$1`, [id]))[0] ?? null };
      if (c.method === 'PATCH') {
        if (c.body.stage && !STAGES.includes(c.body.stage)) return { status: 400, json: { error: 'bad stage' } };
        const s = buildUpdate('jobs', JOB_FIELDS, id, c.body, true);
        return { json: s ? (await q(s.text, s.vals))[0] : null };
      }
      if (c.method === 'DELETE') {
        await q(`UPDATE jobs SET deleted_at = now() WHERE id=$1`, [id]);   // to the Trash, never destroyed
        return { json: { ok: true, trashed: true } };
      }
    }
    if (b && c2 === 'restore' && c.method === 'POST') {
      const job = (await q(`UPDATE jobs SET deleted_at = NULL, updated_at = now() WHERE id=$1 RETURNING *`, [id]))[0];
      if (job) await q(`UPDATE lanes SET deleted_at = NULL WHERE id=$1`, [job.lane_id]);   // a job needs a visible lane
      return { json: job };
    }
    // job children: documents, notes, actions, contacts, emails
    const kids: Record<string, string> = {
      documents: 'job_documents', notes: 'job_notes', actions: 'job_actions',
      contacts: 'job_contacts', emails: 'job_emails',
    };
    if (b && c2 && kids[c2]) {
      const table = kids[c2];
      if (!d && c.method === 'GET') {
        const order = table === 'job_actions' ? 'done, id' : 'created_at DESC';
        const col = table === 'job_emails' ? 'sent_at DESC' : order;
        return { json: await q(`SELECT * FROM ${table} WHERE job_id=$1 ORDER BY ${col}`, [id]) };
      }
      if (!d && c.method === 'POST') {
        const allowed: Record<string, string[]> = {
          job_documents: ['kind', 'title', 'body', 'source'],
          job_notes: ['body', 'kind'],
          job_actions: ['text', 'due_date'],
          job_contacts: ['name', 'title', 'email', 'source', 'notes'],
          job_emails: ['direction', 'from_addr', 'to_addr', 'subject', 'body', 'gmail_thread_id'],
        };
        const body = { ...c.body, job_id: id };
        if (table === 'job_documents') {
          const v = await q(
            `SELECT coalesce(max(version),0)+1 AS v FROM job_documents WHERE job_id=$1 AND kind=$2`,
            [id, body.kind],
          );
          body.version = v[0].v;
        }
        const s = buildInsert(table, ['job_id', ...allowed[table], ...(table === 'job_documents' ? ['version'] : [])], body);
        return { json: (await q(s.text, s.vals))[0] };
      }
      if (d && (c.method === 'PATCH' || c.method === 'DELETE')) {
        const rid = Number(d);
        if (c.method === 'DELETE') {
          await q(`DELETE FROM ${table} WHERE id=$1 AND job_id=$2`, [rid, id]);
          return { json: { ok: true } };
        }
        if (table === 'job_actions') {
          const s = buildUpdate(table, ['text', 'done', 'due_date'], rid, c.body);
          return { json: s ? (await q(s.text, s.vals))[0] : null };
        }
        if (table === 'job_contacts') {
          const s = buildUpdate(table, ['name', 'title', 'email', 'notes'], rid, c.body);
          return { json: s ? (await q(s.text, s.vals))[0] : null };
        }
      }
    }
  }

  if (a === 'home' && c.method === 'GET') return { json: await home() };

  // ---- weekly summary ----
  if (a === 'weekly' && c.method === 'GET') return { json: await weekly() };
  if (a === 'weekly' && b === 'focus' && c.method === 'POST') return { json: { focus: await weeklyFocus(await weekly()) } };
  if (a === 'weekly' && b === 'email' && c.method === 'POST') {
    const w = await weekly();
    const focus = typeof c.body.focus === 'string' ? c.body.focus : '';
    return { json: await sendToSelf('Your Careering week', weeklyText(w, focus)) };
  }

  // ---- attention + search ----
  if (a === 'attention' && c.method === 'GET') return { json: await attention() };
  if (a === 'search' && c.method === 'GET') return { json: await search(c.query.get('q') || '', c.query.get('job_id') ? Number(c.query.get('job_id')) : null) };

  // ---- mail center + settings ----
  if (a === 'mail' && c.method === 'GET') return { json: await mailList(c.query.get('box') || 'all') };
  if (a === 'settings') {
    const KEYS = ['portfolio_url'];   // whitelist: the settings table also holds the Gmail token, which must never be exposed
    if (!b && c.method === 'GET') {
      const rows = await q(`SELECT key, value FROM settings WHERE key = ANY($1)`, [KEYS]);
      return { json: Object.fromEntries(rows.map((r: any) => [r.key, r.value])) };
    }
    if (b && KEYS.includes(b) && c.method === 'PUT') {
      await q(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`, [b, JSON.stringify(String(c.body.value ?? ''))]);
      return { json: { ok: true } };
    }
  }

  // ---- gmail ----
  if (a === 'gmail') {
    if (b === 'status') return { json: await gmailStatus() };
    if (b === 'connect') return { json: { url: authUrl(c.host) } };
    if (b === 'send' && c.method === 'POST') return { json: await sendEmail(Number(c.body.job_id), c.body.to, c.body.subject, c.body.body, c.body.attachments ?? []) };
    if (b === 'sync-all' && c.method === 'POST') return { json: await syncAll() };
    if (b === 'sync' && c.method === 'POST') return { json: await syncReplies(Number(c.body.job_id)) };
  }

  // ---- ai ----
  if (a === 'ai' && b && c.method === 'POST') return { json: await aiRoute(b, c.body) };

  // ---- library ----
  if (a === 'library') {
    if (!b && c.method === 'GET') {
      const kind = c.query.get('kind');
      return {
        json: kind
          ? await q(`SELECT * FROM library_items WHERE kind=$1 ORDER BY updated_at DESC`, [kind])
          : await q(`SELECT * FROM library_items ORDER BY kind, updated_at DESC`),
      };
    }
    if (!b && c.method === 'POST') {
      const s = buildInsert('library_items', LIB_FIELDS, c.body);
      return { json: (await q(s.text, s.vals))[0] };
    }
    if (b && c.method === 'PATCH') {
      const s = buildUpdate('library_items', LIB_FIELDS, id, c.body, true);
      return { json: s ? (await q(s.text, s.vals))[0] : null };
    }
    if (b && c.method === 'DELETE') {
      await q(`DELETE FROM library_items WHERE id=$1`, [id]);
      return { json: { ok: true } };
    }
  }

  return { status: 404, json: { error: 'not found' } };
}

async function readBody(req: IncomingMessage): Promise<any> {
  if ((req as any).body !== undefined) return (req as any).body;
  const chunks: Buffer[] = [];
  for await (const ch of req) chunks.push(ch as Buffer);
  const raw = Buffer.concat(chunks).toString();
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const send = (r: Result) => {
    res.statusCode = r.status ?? 200;
    res.setHeader('Content-Type', 'application/json');
    if (r.cookie) res.setHeader('Set-Cookie', r.cookie);
    res.end(JSON.stringify(r.json));
  };
  try {
    // vercel.json rewrites /api/:path* to /api?path=:path*; in dev the URL path is used directly.
    const url = new URL(req.url || '/', 'http://x');
    const orig = url.searchParams.get('path') ?? url.pathname.replace(/^\/api\/?/, '');
    url.searchParams.delete('path');
    const parts = orig.split('/').filter(Boolean);
    const method = req.method || 'GET';

    if (parts[0] === 'login' && method === 'POST') {
      const body = await readBody(req);
      if (process.env.APP_PASSWORD && body.password === process.env.APP_PASSWORD) {
        return send({ json: { ok: true }, cookie: await issueSession() });
      }
      return send({ status: 401, json: { error: 'Wrong password' } });
    }
    if (parts[0] === 'logout') return send({ json: { ok: true }, cookie: clearSession() });
    if (parts[0] === 'me') return send({ json: { authed: await isAuthed(req.headers.cookie) } });

    if (!(await isAuthed(req.headers.cookie))) return send({ status: 401, json: { error: 'Not signed in' } });

    if (parts[0] === 'gmail' && parts[1] === 'callback') {
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
      const code = url.searchParams.get('code');
      if (!code || !checkState(url.searchParams.get('state') || '')) return send({ status: 400, json: { error: 'Invalid Gmail callback' } });
      await handleCallback(code, host);
      res.statusCode = 302; res.setHeader('Location', '/?gmail=connected'); return res.end();
    }

    const body = method === 'GET' || method === 'DELETE' ? {} : deepNoDash(await readBody(req));
    send(await route({ method, parts, body, query: url.searchParams, host: String(req.headers['x-forwarded-host'] || req.headers.host || '') }));
  } catch (e: any) {
    console.error(e);
    send({ status: e instanceof HttpError ? e.status : 500, json: { error: e?.message || 'Server error' } });
  }
}
