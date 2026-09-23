import type { IncomingMessage, ServerResponse } from 'node:http';
import { q } from '../lib/db.js';
import { clearSession, isAuthed, issueSession } from '../lib/auth.js';

type Ctx = { method: string; parts: string[]; body: any; query: URLSearchParams };
type Result = { status?: number; json: any; cookie?: string };

const STAGES = ['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Closed'];

const JOB_FIELDS = [
  'lane_id', 'type', 'company', 'role_title', 'source_link', 'stage', 'closed_outcome',
  'salary_range', 'location', 'remote_type', 'applied_date', 'deadline', 'interview_dates',
  'contact_person', 'contact_notes', 'posting_text', 'match_notes', 'resume_version_id',
  'interview_prep',
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

async function route(c: Ctx): Promise<Result> {
  const [a, b, c2, d] = c.parts;
  const id = b ? Number(b) : NaN;

  // ---- lanes ----
  if (a === 'lanes') {
    if (!b && c.method === 'GET') {
      const lanes = await q(`SELECT * FROM lanes ORDER BY position, id`);
      const counts = await q(`SELECT lane_id, stage, count(*)::int AS n FROM jobs GROUP BY lane_id, stage`);
      return { json: lanes.map((l: any) => ({ ...l, counts: counts.filter((x: any) => x.lane_id === l.id) })) };
    }
    if (!b && c.method === 'POST') {
      const s = buildInsert('lanes', LANE_FIELDS, c.body);
      return { json: (await q(s.text, s.vals))[0] };
    }
    if (b && c.method === 'GET') return { json: (await q(`SELECT * FROM lanes WHERE id=$1`, [id]))[0] ?? null };
    if (b && c.method === 'PATCH') {
      const s = buildUpdate('lanes', LANE_FIELDS, id, c.body);
      return { json: s ? (await q(s.text, s.vals))[0] : null };
    }
    if (b && c.method === 'DELETE') {
      await q(`DELETE FROM lanes WHERE id=$1`, [id]);
      return { json: { ok: true } };
    }
  }

  // ---- jobs ----
  if (a === 'jobs') {
    if (!b && c.method === 'GET') {
      const lane = c.query.get('lane_id');
      const rows = lane
        ? await q(`SELECT * FROM jobs WHERE lane_id=$1 ORDER BY updated_at DESC`, [Number(lane)])
        : await q(`SELECT * FROM jobs ORDER BY updated_at DESC`);
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
        await q(`DELETE FROM jobs WHERE id=$1`, [id]);
        return { json: { ok: true } };
      }
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
          job_contacts: ['name', 'title', 'email', 'source'],
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
          const s = buildUpdate(table, ['name', 'title', 'email'], rid, c.body);
          return { json: s ? (await q(s.text, s.vals))[0] : null };
        }
      }
    }
  }

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

    const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req);
    send(await route({ method, parts, body, query: url.searchParams }));
  } catch (e: any) {
    console.error(e);
    send({ status: 500, json: { error: e?.message || 'Server error' } });
  }
}
