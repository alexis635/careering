import { q } from './db.js';
import { HttpError } from './ai.js';

const KINDS = ['start', 'raise', 'promotion', 'bonus', 'other'];
const D = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const ROLE = `id, employer, title, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date, approx, notes, job_id, created_at, deleted_at`;
const COMP = `id, role_id, to_char(effective_on,'YYYY-MM-DD') AS effective_on, kind, amount::float8 AS amount, note, deleted_at`;

/** Roles newest first, each with its pay history (oldest first). */
export async function listRoles(deleted: boolean) {
  const roles = await q(`SELECT ${ROLE} FROM roles WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY (end_date IS NULL) DESC, COALESCE(end_date, start_date) DESC NULLS LAST, start_date DESC NULLS LAST, id DESC`);
  const comp = await q(`SELECT ${COMP} FROM comp_entries WHERE deleted_at IS NULL ORDER BY effective_on NULLS FIRST, id`);
  return roles.map((r: any) => ({ ...r, comp: comp.filter((c: any) => c.role_id === r.id) }));
}

export async function createRole(b: any) {
  if (!String(b.employer || '').trim()) throw new HttpError(400, 'Which employer is this role at?');
  return (await q(`INSERT INTO roles (employer, title, start_date, end_date, approx, notes, job_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${ROLE}`,
    [String(b.employer).trim(), b.title ?? '', D(b.start_date), D(b.end_date), !!b.approx, b.notes ?? '', b.job_id ?? null]))[0];
}

export async function updateRole(id: number, b: any) {
  return (await q(
    `UPDATE roles SET employer = COALESCE($2, employer), title = COALESCE($3, title),
       start_date = CASE WHEN $4::boolean THEN $5::date ELSE start_date END, end_date = CASE WHEN $6::boolean THEN $7::date ELSE end_date END,
       approx = COALESCE($8, approx), notes = COALESCE($9, notes), updated_at = now() WHERE id = $1 RETURNING ${ROLE}`,
    [id, b.employer?.trim() || null, b.title ?? null, 'start_date' in b, D(b.start_date), 'end_date' in b, D(b.end_date), b.approx ?? null, b.notes ?? null]))[0];
}
export const trashRole = (id: number) => q(`UPDATE roles SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreRole = async (id: number) => (await q(`UPDATE roles SET deleted_at = NULL WHERE id=$1 RETURNING ${ROLE}`, [id]))[0];

export async function createComp(roleId: number, b: any) {
  const amount = b.amount === '' || b.amount == null ? null : Number(b.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new HttpError(400, 'Enter the amount as a plain number, like 65000');
  return (await q(`INSERT INTO comp_entries (role_id, effective_on, kind, amount, note) VALUES ($1,$2,$3,$4,$5) RETURNING ${COMP}`,
    [roleId, D(b.effective_on), KINDS.includes(b.kind) ? b.kind : 'raise', amount, b.note ?? '']))[0];
}
export async function updateComp(id: number, b: any) {
  const amount = 'amount' in b ? (b.amount === '' || b.amount == null ? null : Number(b.amount)) : undefined;
  if (amount !== undefined && amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new HttpError(400, 'Enter the amount as a plain number, like 65000');
  return (await q(
    `UPDATE comp_entries SET effective_on = CASE WHEN $2::boolean THEN $3::date ELSE effective_on END, kind = COALESCE($4, kind),
       amount = CASE WHEN $5::boolean THEN $6::numeric ELSE amount END, note = COALESCE($7, note) WHERE id = $1 RETURNING ${COMP}`,
    [id, 'effective_on' in b, D(b.effective_on), KINDS.includes(b.kind) ? b.kind : null, amount !== undefined, amount ?? null, b.note ?? null]))[0];
}
export const trashComp = (id: number) => q(`UPDATE comp_entries SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreComp = async (id: number) => (await q(`UPDATE comp_entries SET deleted_at = NULL WHERE id=$1 RETURNING ${COMP}`, [id]))[0];
