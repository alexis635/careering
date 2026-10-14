import { q } from './db.js';
import { HttpError } from './ai.js';

/** Her professional references. Kept for applications that ask for them; never sent to the AI and never put on a resume. */

const COLS = `id, name, title, organization, relationship, email, phone, notes, okay_to_list, to_char(last_asked,'YYYY-MM-DD') AS last_asked, created_at, updated_at, deleted_at`;
const D = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

let ensured = false;
async function ensure() {
  if (ensured) return;
  await q(`CREATE TABLE IF NOT EXISTS career_references (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', organization TEXT NOT NULL DEFAULT '',
    relationship TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    okay_to_list BOOLEAN NOT NULL DEFAULT false, last_asked DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ)`);
  ensured = true;
}

export async function listReferences(deleted: boolean) {
  await ensure();
  return q(`SELECT ${COLS} FROM career_references WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY okay_to_list DESC, updated_at DESC, id DESC`);
}

export async function createReference(b: any) {
  await ensure();
  if (!String(b.name || '').trim() && !String(b.organization || '').trim()) throw new HttpError(400, 'Add their name or organization first');
  return (await q(
    `INSERT INTO career_references (name, title, organization, relationship, email, phone, notes, okay_to_list, last_asked) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLS}`,
    [b.name ?? '', b.title ?? '', b.organization ?? '', b.relationship ?? '', b.email ?? '', b.phone ?? '', b.notes ?? '', !!b.okay_to_list, D(b.last_asked)].map((v) => (typeof v === 'string' ? v.trim() : v)),
  ))[0];
}

export async function updateReference(id: number, b: any) {
  await ensure();
  const s = (k: string) => (k in b ? String(b[k] ?? '').trim() : null);
  return (await q(
    `UPDATE career_references SET name = COALESCE($2, name), title = COALESCE($3, title), organization = COALESCE($4, organization),
       relationship = COALESCE($5, relationship), email = COALESCE($6, email), phone = COALESCE($7, phone), notes = COALESCE($8, notes),
       okay_to_list = COALESCE($9, okay_to_list), last_asked = CASE WHEN $10::boolean THEN $11::date ELSE last_asked END, updated_at = now()
     WHERE id = $1 RETURNING ${COLS}`,
    [id, s('name'), s('title'), s('organization'), s('relationship'), s('email'), s('phone'), s('notes'), 'okay_to_list' in b ? !!b.okay_to_list : null, 'last_asked' in b, D(b.last_asked)],
  ))[0];
}
export const trashReference = async (id: number) => { await ensure(); await q(`UPDATE career_references SET deleted_at = now() WHERE id=$1`, [id]); };
export const restoreReference = async (id: number) => { await ensure(); return (await q(`UPDATE career_references SET deleted_at = NULL WHERE id=$1 RETURNING ${COLS}`, [id]))[0]; };
