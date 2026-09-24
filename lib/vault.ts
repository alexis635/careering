import { q } from './db.js';
import { HttpError, ask } from './ai.js';

const DOC_MIME = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain|image\/(png|jpeg))$/;
const MAX_BYTES = 3_000_000;   // JSON upload limit on the host is 4.5 MB, and base64 adds a third
const DOC_CATEGORIES = ['education', 'certification', 'employment', 'reference', 'other'];
const WIN_CATEGORIES = ['revenue', 'leadership', 'recognition', 'project', 'growth'];

// Files are stored in the database and only ever returned through the signed-in file endpoint. They have no public URL.
const DOC_COLS = `id, title, category, issuer, notes, to_char(expires_on,'YYYY-MM-DD') AS expires_on, file_name, mime, size, created_at, updated_at, deleted_at`;
const WIN_COLS = `id, title, to_char(happened_on,'YYYY-MM-DD') AS happened_on, employer, role, description, impact, category, proof_url, bullet_id, created_at, updated_at`;

type FileIn = { name: string; mime: string; data: string } | null | undefined;
function checkFile(f: FileIn) {
  if (!f) return null;
  if (!DOC_MIME.test(f.mime)) throw new HttpError(400, 'Files can be PDF, Word, text, PNG, or JPG');
  const pad = f.data.endsWith('==') ? 2 : f.data.endsWith('=') ? 1 : 0;
  const size = Math.floor((f.data.length * 3) / 4) - pad;   // exact decoded size
  if (size > MAX_BYTES) throw new HttpError(400, 'That file is over 3 MB. Try a smaller scan or a compressed PDF.');
  return { name: String(f.name).slice(0, 200), mime: f.mime, data: f.data, size };
}
const cat = (v: any, list: string[], fallback: string) => (list.includes(v) ? v : fallback);
const dateOrNull = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// ---------------- career documents ----------------
export const listDocs = (deleted: boolean) =>
  q(`SELECT ${DOC_COLS} FROM career_docs WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY category, lower(title)`);

export async function createDoc(b: any) {
  if (!String(b.title || '').trim()) throw new HttpError(400, 'Give the document a title');
  const f = checkFile(b.file);
  return (
    await q(
      `INSERT INTO career_docs (title, category, issuer, notes, expires_on, file_name, mime, size, file_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $9::text IS NULL THEN NULL ELSE decode($9::text,'base64') END) RETURNING ${DOC_COLS}`,
      [String(b.title).trim(), cat(b.category, DOC_CATEGORIES, 'other'), b.issuer ?? '', b.notes ?? '', dateOrNull(b.expires_on), f?.name ?? null, f?.mime ?? null, f?.size ?? null, f?.data ?? null],
    )
  )[0];
}

export async function updateDoc(id: number, b: any) {
  const f = b.file ? checkFile(b.file) : null;
  return (
    await q(
      `UPDATE career_docs SET
         title = COALESCE($2, title), category = COALESCE($3, category), issuer = COALESCE($4, issuer), notes = COALESCE($5, notes),
         expires_on = CASE WHEN $6::boolean THEN $7::date ELSE expires_on END,
         file_name = COALESCE($8, file_name), mime = COALESCE($9, mime), size = COALESCE($10, size),
         file_data = CASE WHEN $11::text IS NULL THEN file_data ELSE decode($11::text,'base64') END, updated_at = now()
       WHERE id = $1 RETURNING ${DOC_COLS}`,
      [id, b.title?.trim() || null, b.category ? cat(b.category, DOC_CATEGORIES, 'other') : null, b.issuer ?? null, b.notes ?? null,
       'expires_on' in b, dateOrNull(b.expires_on), f?.name ?? null, f?.mime ?? null, f?.size ?? null, f?.data ?? null],
    )
  )[0];
}

export const trashDoc = (id: number) => q(`UPDATE career_docs SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreDoc = (id: number) => q(`UPDATE career_docs SET deleted_at = NULL WHERE id=$1 RETURNING ${DOC_COLS}`, [id]);

export async function getDocFile(id: number) {
  const r = (await q(`SELECT file_name, mime, encode(file_data,'base64') AS b64 FROM career_docs WHERE id=$1 AND file_data IS NOT NULL`, [id]))[0];
  if (!r) throw new HttpError(404, 'No file is attached to that document');
  return { name: r.file_name as string, mime: r.mime as string, data: Buffer.from(r.b64, 'base64') };
}

// ---------------- wins ----------------
export const listWins = (deleted: boolean) =>
  q(`SELECT ${WIN_COLS}, deleted_at FROM wins WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY happened_on DESC NULLS LAST, id DESC`);

export async function createWin(b: any) {
  if (!String(b.title || '').trim()) throw new HttpError(400, 'Give the win a short title');
  return (
    await q(
      `INSERT INTO wins (title, happened_on, employer, role, description, impact, category, proof_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${WIN_COLS}`,
      [String(b.title).trim(), dateOrNull(b.happened_on), b.employer ?? '', b.role ?? '', b.description ?? '', b.impact ?? '', cat(b.category, WIN_CATEGORIES, 'project'), b.proof_url ?? ''],
    )
  )[0];
}

export async function updateWin(id: number, b: any) {
  return (
    await q(
      `UPDATE wins SET title = COALESCE($2, title), happened_on = CASE WHEN $3::boolean THEN $4::date ELSE happened_on END,
         employer = COALESCE($5, employer), role = COALESCE($6, role), description = COALESCE($7, description), impact = COALESCE($8, impact),
         category = COALESCE($9, category), proof_url = COALESCE($10, proof_url), bullet_id = CASE WHEN $11::boolean THEN $12::int ELSE bullet_id END, updated_at = now()
       WHERE id = $1 RETURNING ${WIN_COLS}`,
      [id, b.title?.trim() || null, 'happened_on' in b, dateOrNull(b.happened_on), b.employer ?? null, b.role ?? null, b.description ?? null, b.impact ?? null,
       b.category ? cat(b.category, WIN_CATEGORIES, 'project') : null, b.proof_url ?? null, 'bullet_id' in b, b.bullet_id ?? null],
    )
  )[0];
}

export const trashWin = (id: number) => q(`UPDATE wins SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreWin = (id: number) => q(`UPDATE wins SET deleted_at = NULL WHERE id=$1 RETURNING ${WIN_COLS}`, [id]);

/** Turn a win into a resume bullet draft. The user edits it before it goes into the bullet bank. */
export async function winBulletDraft(id: number) {
  const w = (await q(`SELECT ${WIN_COLS} FROM wins WHERE id=$1`, [id]))[0];
  if (!w) throw new HttpError(404, 'Win not found');
  const text = await ask(
    'Turn this accomplishment into ONE resume bullet. Start with a strong past tense action verb, stay under 30 words, keep every number and exactly what it measures, and add nothing that is not in the accomplishment. Output only the bullet text, no dash or bullet symbol at the start.',
    JSON.stringify({ title: w.title, employer: w.employer, role: w.role, what_was_done: w.description, result: w.impact }),
    2000,
  );
  return { text: text.replace(/^[-•*]\s*/, '').trim() };
}
