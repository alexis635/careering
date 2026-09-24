import { q } from './db.js';
import { HttpError } from './ai.js';
import { noDash } from '../src/lib/noDash.js';

const D = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const KINDS = ['task', 'goal', 'note', 'contact', 'event', 'project', 'document', 'stakeholder', 'risk', 'course', 'lesson', 'cert', 'client', 'deliverable', 'invoice'];
const JOB_TYPES = ['general', 'pm', 'teaching', 'freelance'];
const clean = (v: any, n: number) => noDash(String(v ?? '')).trim().slice(0, n);

const WS = `w.id, w.role_id, w.kind AS job_type, w.responsibilities, w.wrapup, w.wrapped_up_at, w.created_at, w.deleted_at,
  r.employer, r.title, to_char(r.start_date,'YYYY-MM-DD') AS start_date, to_char(r.end_date,'YYYY-MM-DD') AS end_date`;
const ITEM = `id, workspace_id, kind, title, body, to_char(due_on,'YYYY-MM-DD') AS due_on, done_at, extra, created_at, deleted_at`;

/** Workspaces, one per role. Active ones first. */
export async function listWorkspaces(deleted: boolean) {
  return q(`SELECT ${WS},
      (SELECT count(*)::int FROM ws_items i WHERE i.workspace_id = w.id AND i.kind='task' AND i.done_at IS NULL AND i.deleted_at IS NULL) AS open_tasks
    FROM workspaces w JOIN roles r ON r.id = w.role_id
    WHERE w.deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} AND r.deleted_at IS NULL
    ORDER BY (w.wrapped_up_at IS NULL) DESC, w.created_at DESC`);
}

export async function createWorkspace(b: any) {
  let roleId = Number(b.role_id);
  if (!Number.isFinite(roleId)) {
    const employer = clean(b.employer, 120);
    if (!employer) throw new HttpError(400, 'Which employer is this job at?');
    roleId = (await q(`INSERT INTO roles (employer, title, start_date) VALUES ($1,$2,$3) RETURNING id`, [employer, clean(b.title, 120), D(b.start_date)]))[0].id;
  }
  const have = (await q(`SELECT id FROM workspaces WHERE role_id=$1 AND deleted_at IS NULL`, [roleId]))[0];
  if (have) throw new HttpError(409, 'That job already has a workspace');
  const id = (await q(`INSERT INTO workspaces (role_id, kind) VALUES ($1,$2) RETURNING id`, [roleId, JOB_TYPES.includes(b.job_type) ? b.job_type : 'general']))[0].id;
  return getWorkspace(id);
}

export async function getWorkspace(id: number) {
  const ws = (await q(`SELECT ${WS} FROM workspaces w JOIN roles r ON r.id = w.role_id WHERE w.id=$1`, [id]))[0];
  if (!ws) throw new HttpError(404, 'Workspace not found');
  const items = await q(`SELECT ${ITEM} FROM ws_items WHERE workspace_id=$1 ORDER BY created_at DESC, id DESC`, [id]);
  return { ...ws, items: items.filter((i: any) => !i.deleted_at), gone: items.filter((i: any) => i.deleted_at) };
}

export async function updateWorkspace(id: number, b: any) {
  await q(`UPDATE workspaces SET
      kind = COALESCE($6, kind),
      responsibilities = COALESCE($2, responsibilities),
      wrapup = COALESCE($3::jsonb, wrapup),
      wrapped_up_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE wrapped_up_at END
    WHERE id=$1`,
    [id, 'responsibilities' in b ? clean(b.responsibilities, 8000) : null, b.wrapup && typeof b.wrapup === 'object' ? JSON.stringify(b.wrapup) : null, 'wrapped_up_at' in b, b.wrapped_up_at ? new Date().toISOString() : null, JOB_TYPES.includes(b.job_type) ? b.job_type : null]);
  return getWorkspace(id);
}

/** Wrap up: records the end date on the role and marks the workspace archived (still searchable, never destroyed). */
export async function wrapUp(id: number, b: any) {
  const end = D(b.end_date);
  if (!end) throw new HttpError(400, 'Pick the last day of this job');
  const ws = (await q(`SELECT role_id FROM workspaces WHERE id=$1`, [id]))[0];
  if (!ws) throw new HttpError(404, 'Workspace not found');
  await q(`UPDATE roles SET end_date = $2::date, updated_at = now() WHERE id=$1`, [ws.role_id, end]);
  await q(`UPDATE workspaces SET wrapped_up_at = now() WHERE id=$1`, [id]);
  return getWorkspace(id);
}
export async function reopen(id: number) {
  const ws = (await q(`SELECT role_id FROM workspaces WHERE id=$1`, [id]))[0];
  if (!ws) throw new HttpError(404, 'Workspace not found');
  await q(`UPDATE roles SET end_date = NULL, updated_at = now() WHERE id=$1`, [ws.role_id]);
  await q(`UPDATE workspaces SET wrapped_up_at = NULL WHERE id=$1`, [id]);
  return getWorkspace(id);
}
export const trashWorkspace = (id: number) => q(`UPDATE workspaces SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreWorkspace = async (id: number) => { await q(`UPDATE workspaces SET deleted_at = NULL WHERE id=$1`, [id]); return getWorkspace(id); };

export async function createItem(workspaceId: number, b: any) {
  const kind = KINDS.includes(b.kind) ? b.kind : 'task';
  const title = clean(b.title, 300);
  if (!title) throw new HttpError(400, 'Add a title');
  return (await q(`INSERT INTO ws_items (workspace_id, kind, title, body, due_on, extra) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING ${ITEM}`,
    [workspaceId, kind, title, clean(b.body, 10000), D(b.due_on), JSON.stringify(b.extra && typeof b.extra === 'object' ? b.extra : {})]))[0];
}
export async function updateItem(id: number, b: any) {
  return (await q(`UPDATE ws_items SET
      title = COALESCE($2, title), body = COALESCE($3, body),
      due_on = CASE WHEN $4::boolean THEN $5::date ELSE due_on END,
      done_at = CASE WHEN $6::boolean THEN (CASE WHEN $7::boolean THEN now() ELSE NULL END) ELSE done_at END,
      extra = COALESCE($8::jsonb, extra)
    WHERE id=$1 RETURNING ${ITEM}`,
    [id, 'title' in b ? clean(b.title, 300) || null : null, 'body' in b ? clean(b.body, 10000) : null, 'due_on' in b, D(b.due_on), 'done' in b, !!b.done, b.extra && typeof b.extra === 'object' ? JSON.stringify(b.extra) : null]))[0];
}
export const trashItem = (id: number) => q(`UPDATE ws_items SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreItem = async (id: number) => (await q(`UPDATE ws_items SET deleted_at = NULL WHERE id=$1 RETURNING ${ITEM}`, [id]))[0];
