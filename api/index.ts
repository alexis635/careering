import type { IncomingMessage, ServerResponse } from 'node:http';
import { q } from '../lib/db.js';
import { deepNoDash } from '../src/lib/noDash.js';
import { aiRoute } from '../lib/ai-routes.js';
import { attention } from '../lib/attention.js';
import { search } from '../lib/search.js';
import { HttpError } from '../lib/ai.js';
import { authUrl, checkState, gmailStatus, handleCallback, sendEmail, sendToSelf, syncAll, syncReplies, uploadSlides } from '../lib/gmail.js';
import { mailList } from '../lib/mail.js';
import { home } from '../lib/home.js';
import * as vault from '../lib/vault.js';
import * as cases from '../lib/cases.js';
import * as roles from '../lib/roles.js';
import * as decks from '../lib/decks.js';
import * as thrive from '../lib/thrive.js';
import * as lessons from '../lib/lessons.js';
import { exportAll } from '../lib/export.js';
import { cleanStagesConfig } from '../lib/stages.js';
import { weekly, weeklyFocus, weeklyText } from '../lib/weekly.js';
import { clearSession, isAuthed, issueSession } from '../lib/auth.js';

type Ctx = { method: string; parts: string[]; body: any; query: URLSearchParams; host: string };
type Result = { status?: number; json: any; cookie?: string; file?: { name: string; mime: string; data: Buffer } };

const STAGES = ['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Closed'];

const JOB_FIELDS = [
  'lane_id', 'type', 'company', 'role_title', 'source_link', 'stage', 'closed_outcome',
  'salary_range', 'location', 'remote_type', 'applied_date', 'deadline', 'interview_dates',
  'contact_person', 'contact_notes', 'posting_text', 'match_notes', 'resume_version_id',
  'interview_prep', 'fit',
];
const LANE_FIELDS = ['name', 'start_date', 'target_date', 'status', 'notes', 'color', 'position', 'stages_config'];
const JSON_FIELDS = ['interview_dates', 'stages_config'];
const jsonVal = (f: string, v: any) => (JSON_FIELDS.includes(f) && v !== null && v !== undefined ? JSON.stringify(v) : v);
const LIB_FIELDS = ['kind', 'title', 'body', 'tags'];

function buildUpdate(table: string, fields: string[], id: number, body: any, touch = false) {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (f in body) {
      vals.push(jsonVal(f, body[f]));
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
  const vals = cols.map((c) => jsonVal(c, body[c]));
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
    if ('stages_config' in c.body && (c.method === 'POST' || c.method === 'PATCH')) c.body.stages_config = cleanStagesConfig(c.body.stages_config);
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

  // ---- timeline marks: job deadlines on each lane ----
  if (a === 'timeline' && c.method === 'GET') {
    return {
      json: await q(
        `SELECT j.lane_id, j.id, j.company, j.role_title, to_char(j.deadline,'YYYY-MM-DD') AS date
           FROM jobs j JOIN lanes l ON l.id = j.lane_id
          WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL AND j.deadline IS NOT NULL AND j.stage <> 'Closed' ORDER BY j.deadline`),
    };
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
    // everything deleted from this job (documents, notes, next actions, contacts), so it can be restored
    if (b && c2 === 'deleted' && c.method === 'GET') {
      const gone = (t: string) => q(`SELECT * FROM ${t} WHERE job_id=$1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`, [id]);
      const [documents, notes, actions, contacts] = await Promise.all([gone('job_documents'), gone('job_notes'), gone('job_actions'), gone('job_contacts')]);
      return { json: { documents, notes, actions, contacts } };
    }
    const kids: Record<string, string> = {
      documents: 'job_documents', notes: 'job_notes', actions: 'job_actions',
      contacts: 'job_contacts', emails: 'job_emails',
    };
    if (b && c2 && kids[c2]) {
      const table = kids[c2];
      if (!d && c.method === 'GET') {
        const order = table === 'job_actions' ? 'done, id' : 'created_at DESC';
        const col = table === 'job_emails' ? 'sent_at DESC' : order;
        return { json: await q(`SELECT * FROM ${table} WHERE job_id=$1 ${table === 'job_emails' ? '' : 'AND deleted_at IS NULL'} ORDER BY ${col}`, [id]) };
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
      if (d && c.parts[4] === 'restore' && c.method === 'POST' && table !== 'job_emails') {
        return { json: (await q(`UPDATE ${table} SET deleted_at = NULL WHERE id=$1 AND job_id=$2 RETURNING *`, [Number(d), id]))[0] };
      }
      if (d && (c.method === 'PATCH' || c.method === 'DELETE')) {
        const rid = Number(d);
        if (c.method === 'DELETE') {
          // never destroyed: the item goes to Recently deleted on the job and can be restored
          if (table === 'job_emails') return { status: 400, json: { error: 'Emails are a record of what was sent and cannot be deleted' } };
          await q(`UPDATE ${table} SET deleted_at = now() WHERE id=$1 AND job_id=$2`, [rid, id]);
          return { json: { ok: true, trashed: true } };
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

  // ---- career vault: documents and wins (nothing is ever destroyed, delete moves to Recently deleted) ----
  if (a === 'vault' && b === 'docs') {
    const did = Number(c2);
    if (!c2 && c.method === 'GET') return { json: await vault.listDocs(c.query.get('deleted') === '1') };
    if (!c2 && c.method === 'POST') return { json: await vault.createDoc(c.body) };
    if (c2 && d === 'file' && c.method === 'GET') return { json: null, file: await vault.getDocFile(did) };
    if (c2 && d === 'restore' && c.method === 'POST') return { json: (await vault.restoreDoc(did))[0] };
    if (c2 && !d && c.method === 'PATCH') return { json: await vault.updateDoc(did, c.body) };
    if (c2 && !d && c.method === 'DELETE') { await vault.trashDoc(did); return { json: { ok: true, trashed: true } }; }
  }
  if (a === 'wins') {
    if (!b && c.method === 'GET') return { json: await vault.listWins(c.query.get('deleted') === '1') };
    if (!b && c.method === 'POST') return { json: await vault.createWin(c.body) };
    if (b && c2 === 'files' && c.method === 'GET') return { json: await vault.listWinFiles(id) };
    if (b && c2 === 'files' && c.method === 'POST') return { json: await vault.addWinFile(id, c.body) };
    if (b && c2 === 'bullet-draft' && c.method === 'POST') return { json: await vault.winBulletDraft(id) };
    if (b && c2 === 'restore' && c.method === 'POST') return { json: (await vault.restoreWin(id))[0] };
    if (b && !c2 && c.method === 'PATCH') return { json: await vault.updateWin(id, c.body) };
    if (b && !c2 && c.method === 'DELETE') { await vault.trashWin(id); return { json: { ok: true, trashed: true } }; }
  }

  if (a === 'decks') {
    if (!b && c.method === 'GET') return { json: await decks.listDecks(c.query.get('job_id') ? Number(c.query.get('job_id')) : null, c.query.get('deleted') === '1') };
    if (b && c2 === 'restore' && c.method === 'POST') return { json: await decks.restoreDeck(id) };
    if (b && !c2 && c.method === 'PATCH') return { json: await decks.updateDeck(id, c.body) };
    if (b && !c2 && c.method === 'DELETE') { await decks.trashDeck(id); return { json: { ok: true, trashed: true } }; }
  }
  if (a === 'workspaces') {
    if (!b && c.method === 'GET') return { json: await thrive.listWorkspaces(c.query.get('deleted') === '1') };
    if (!b && c.method === 'POST') return { json: await thrive.createWorkspace(c.body) };
    if (b && !c2 && c.method === 'GET') return { json: await thrive.getWorkspace(id) };
    if (b && !c2 && c.method === 'PATCH') return { json: await thrive.updateWorkspace(id, c.body) };
    if (b && !c2 && c.method === 'DELETE') { await thrive.trashWorkspace(id); return { json: { ok: true, trashed: true } }; }
    if (b && c2 === 'restore' && c.method === 'POST') return { json: await thrive.restoreWorkspace(id) };
    if (b && c2 === 'wrapup' && c.method === 'POST') return { json: await thrive.wrapUp(id, c.body) };
    if (b && c2 === 'reopen' && c.method === 'POST') return { json: await thrive.reopen(id) };
    if (b && c2 === 'items' && c.method === 'POST') return { json: await thrive.createItem(id, c.body) };
  }
  if (a === 'lessons') {
    if (!b && c.method === 'GET') return { json: await lessons.listLessons(c.query.get('workspace_id') ? Number(c.query.get('workspace_id')) : null, c.query.get('deleted') === '1') };
    if (b && c2 === 'restore' && c.method === 'POST') return { json: await lessons.restoreLesson(id) };
    if (b && !c2 && c.method === 'PATCH') return { json: await lessons.updateLesson(id, c.body) };
    if (b && !c2 && c.method === 'DELETE') { await lessons.trashLesson(id); return { json: { ok: true, trashed: true } }; }
  }
  if (a === 'ws-items' && b) {
    if (c2 === 'file' && c.method === 'GET') return { json: null, file: await thrive.getItemFile(id) };
    if (c2 === 'file' && c.method === 'POST') return { json: await thrive.attachItemFile(id, c.body) };
    if (c2 === 'restore' && c.method === 'POST') return { json: await thrive.restoreItem(id) };
    if (!c2 && c.method === 'PATCH') return { json: await thrive.updateItem(id, c.body) };
    if (!c2 && c.method === 'DELETE') { await thrive.trashItem(id); return { json: { ok: true, trashed: true } }; }
  }
  if (a === 'cases') {
    if (!b && c.method === 'GET') return { json: await cases.listCases(c.query.get('deleted') === '1') };
    if (b && c2 === 'restore' && c.method === 'POST') return { json: await cases.restoreCase(id) };
    if (b && !c2 && c.method === 'PATCH') return { json: await cases.updateCase(id, c.body) };
    if (b && !c2 && c.method === 'DELETE') { await cases.trashCase(id); return { json: { ok: true, trashed: true } }; }
  }

  if (a === 'roles') {
    if (!b && c.method === 'GET') return { json: await roles.listRoles(c.query.get('deleted') === '1') };
    if (!b && c.method === 'POST') return { json: await roles.createRole(c.body) };
    if (b && c2 === 'comp' && c.method === 'POST') return { json: await roles.createComp(id, c.body) };
    if (b && c2 === 'restore' && c.method === 'POST') return { json: await roles.restoreRole(id) };
    if (b && !c2 && c.method === 'PATCH') return { json: await roles.updateRole(id, c.body) };
    if (b && !c2 && c.method === 'DELETE') { await roles.trashRole(id); return { json: { ok: true, trashed: true } }; }
  }
  if (a === 'comp' && !b && c.method === 'GET') return { json: await roles.listDeletedComp() };
  if (a === 'comp' && b) {
    if (c2 === 'restore' && c.method === 'POST') return { json: await roles.restoreComp(id) };
    if (!c2 && c.method === 'PATCH') return { json: await roles.updateComp(id, c.body) };
    if (!c2 && c.method === 'DELETE') { await roles.trashComp(id); return { json: { ok: true, trashed: true } }; }
  }
  if (a === 'export' && c.method === 'GET') return { json: await exportAll() };

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
    if (b === 'slides' && c.method === 'POST') return { json: await uploadSlides(String(c.body.title ?? ''), String(c.body.data ?? '')) };
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
          ? await q(`SELECT * FROM library_items WHERE kind=$1 AND deleted_at IS ${c.query.get('deleted') === '1' ? 'NOT NULL' : 'NULL'} ORDER BY updated_at DESC`, [kind])
          : await q(`SELECT * FROM library_items WHERE deleted_at IS ${c.query.get('deleted') === '1' ? 'NOT NULL' : 'NULL'} ORDER BY kind, updated_at DESC`),
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
    if (b && c2 === 'restore' && c.method === 'POST') return { json: (await q(`UPDATE library_items SET deleted_at = NULL WHERE id=$1 RETURNING *`, [id]))[0] };
    if (b && c.method === 'DELETE') {
      await q(`UPDATE library_items SET deleted_at = now() WHERE id=$1`, [id]);   // never destroyed
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
    if (r.cookie) res.setHeader('Set-Cookie', r.cookie);
    if (r.file) {   // a private file, only ever served to a signed-in user
      res.setHeader('Content-Type', r.file.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${r.file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.end(r.file.data);
    }
    res.setHeader('Content-Type', 'application/json');
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
