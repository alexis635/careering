import { q } from './db.js';

/**
 * Everything the user owns, as plain data, for the Export everything button. The browser packs it into a zip together with the uploaded files.
 * Deliberately NOT included: the settings table's Gmail connection token, and file bytes (those are fetched one by one through the signed-in file route).
 */
export async function exportAll() {
  const t = (name: string, sql: string) => q(sql).then((rows) => [name, rows] as const);
  const tables = await Promise.all([
    t('lanes', `SELECT * FROM lanes ORDER BY id`),
    t('jobs', `SELECT * FROM jobs ORDER BY id`),
    t('job_documents', `SELECT * FROM job_documents ORDER BY id`),
    t('job_notes', `SELECT * FROM job_notes ORDER BY id`),
    t('job_actions', `SELECT * FROM job_actions ORDER BY id`),
    t('job_contacts', `SELECT * FROM job_contacts ORDER BY id`),
    t('job_emails', `SELECT * FROM job_emails ORDER BY id`),
    t('library_items', `SELECT * FROM library_items ORDER BY id`),
    t('wins', `SELECT * FROM wins ORDER BY id`),
    t('career_docs', `SELECT id, title, category, issuer, notes, expires_on, file_name, mime, size, created_at, updated_at, deleted_at FROM career_docs ORDER BY id`),
    t('career_cases', `SELECT * FROM career_cases ORDER BY id`),
    t('roles', `SELECT * FROM roles ORDER BY id`),
    t('comp_entries', `SELECT id, role_id, effective_on, kind, amount::float8 AS amount, note, created_at, deleted_at FROM comp_entries ORDER BY id`),
    t('settings', `SELECT key, value FROM settings WHERE key = 'portfolio_url'`),
  ]);
  const files = await q(`SELECT id, file_name FROM career_docs WHERE file_data IS NOT NULL ORDER BY id`);
  return { exported_at: new Date().toISOString(), tables: Object.fromEntries(tables), files };
}
