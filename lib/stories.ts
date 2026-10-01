import { q } from './db.js';
import { HttpError } from './ai.js';

const COLS = 'id, title, body, employer, job_id, created_at, updated_at, deleted_at';

export const listStories = (deleted: boolean) =>
  q(`SELECT ${COLS}, (SELECT NULLIF(concat_ws(' · ', NULLIF(j.company,''), NULLIF(j.role_title,'')), '') FROM jobs j WHERE j.id = stories.job_id) AS job_label
       FROM stories WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY updated_at DESC, id DESC`);

export async function createStory(b: any) {
  const body = String(b.body || '').trim();
  if (!body) throw new HttpError(400, 'Write the story first');
  const title = String(b.title || '').trim() || body.replace(/\s+/g, ' ').slice(0, 60);
  return (await q(`INSERT INTO stories (title, body, employer, job_id) VALUES ($1,$2,$3,$4) RETURNING ${COLS}`, [title, body, String(b.employer || '').trim(), b.job_id ? Number(b.job_id) : null]))[0];
}

export async function updateStory(id: number, b: any) {
  return (await q(
    `UPDATE stories SET title = COALESCE($2, title), body = COALESCE($3, body), employer = COALESCE($4, employer), updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    [id, b.title?.trim() || null, b.body?.trim() || null, b.employer ?? null],
  ))[0];
}
export const trashStory = (id: number) => q(`UPDATE stories SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreStory = async (id: number) => (await q(`UPDATE stories SET deleted_at = NULL WHERE id=$1 RETURNING ${COLS}`, [id]))[0];

/** Her saved explanations of why her experience fits things, for any drafting prompt. */
export async function storiesContext(): Promise<string> {
  const rows = await q(`SELECT title, body, employer FROM stories WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20`);
  if (!rows.length) return '';
  return 'STORY BANK. Explanations she wrote herself of why her experience fits things. They are her own words and count as a source of facts. Use one only when it genuinely fits this posting, and keep her meaning:\n' +
    rows.map((s: any) => `- ${s.title}${s.employer ? ` (${s.employer})` : ''}: ${String(s.body).slice(0, 700)}`).join('\n');
}
