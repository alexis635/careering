import { q } from './db.js';

export interface Hit { type: string; id: number; job_id: number | null; href?: string; label: string; title: string; snippet: string }

const esc = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function snippet(text: string, term: string) {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 60);
  return (start ? '…' : '') + text.slice(start, i + term.length + 90).replace(/\s+/g, ' ') + (i + term.length + 90 < text.length ? '…' : '');
}

/**
 * Keyword search across everything in the app, hits from the current job first.
 * Deleted items are never searched. Pay amounts and the contents of uploaded documents are never searched:
 * roles are matched on employer, title, and notes only, and documents on their title, issuer, and notes.
 */
export async function search(term: string, jobId: number | null): Promise<Hit[]> {
  term = term.trim();
  if (term.length < 2) return [];
  const like = `%${esc(term)}%`;
  const label = `COALESCE(NULLIF(j.company,''),'Untitled') || CASE WHEN j.role_title <> '' THEN ' · ' || j.role_title ELSE '' END`;
  const LIVE = `j.deleted_at IS NULL AND l.deleted_at IS NULL`;
  const FROM_JOB = (alias: string, table: string) => `FROM ${table} ${alias} JOIN jobs j ON j.id=${alias}.job_id JOIN lanes l ON l.id=j.lane_id`;
  const [jobs, docs, notes, acts, mails, contacts, lib, wins, cases, roles, decks, work, plans, vault] = await Promise.all([
    q(`SELECT j.id, ${label} AS label, concat_ws(' ', j.company, j.role_title, j.location, j.contact_person, j.contact_notes, j.match_notes, j.interview_prep, j.posting_text) AS body FROM jobs j JOIN lanes l ON l.id = j.lane_id
        WHERE ${LIVE} AND concat_ws(' ', j.company, j.role_title, j.location, j.contact_person, j.contact_notes, j.match_notes, j.interview_prep, j.posting_text) ILIKE $1 LIMIT 15`, [like]),
    q(`SELECT d.id, d.job_id, ${label} AS label, d.title, d.body ${FROM_JOB('d', 'job_documents')} WHERE ${LIVE} AND d.deleted_at IS NULL AND (d.title ILIKE $1 OR d.body ILIKE $1) LIMIT 15`, [like]),
    q(`SELECT n.id, n.job_id, ${label} AS label, n.body ${FROM_JOB('n', 'job_notes')} WHERE ${LIVE} AND n.deleted_at IS NULL AND n.body ILIKE $1 LIMIT 15`, [like]),
    q(`SELECT a.id, a.job_id, ${label} AS label, a.text AS body ${FROM_JOB('a', 'job_actions')} WHERE ${LIVE} AND a.deleted_at IS NULL AND a.text ILIKE $1 LIMIT 10`, [like]),
    q(`SELECT m.id, m.job_id, ${label} AS label, m.subject, m.body ${FROM_JOB('m', 'job_emails')} WHERE ${LIVE} AND (m.subject ILIKE $1 OR m.body ILIKE $1) LIMIT 15`, [like]),
    q(`SELECT c.id, c.job_id, ${label} AS label, concat_ws(' · ', c.name, c.title, c.email, c.notes) AS body ${FROM_JOB('c', 'job_contacts')} WHERE ${LIVE} AND c.deleted_at IS NULL AND concat_ws(' ', c.name, c.title, c.email, c.notes) ILIKE $1 LIMIT 10`, [like]),
    q(`SELECT id, kind, title, body FROM library_items WHERE deleted_at IS NULL AND NOT ('archived' = ANY(tags)) AND (title ILIKE $1 OR body ILIKE $1 OR array_to_string(tags,' ') ILIKE $1) LIMIT 15`, [like]),
    q(`SELECT id, title, employer, role, concat_ws(' ', description, 'Result:', impact) AS body FROM wins WHERE deleted_at IS NULL AND concat_ws(' ', title, employer, role, description, impact) ILIKE $1 LIMIT 15`, [like]),
    q(`SELECT id, title, body FROM career_cases WHERE deleted_at IS NULL AND (title ILIKE $1 OR body ILIKE $1) LIMIT 8`, [like]),
    q(`SELECT id, employer, title, notes FROM roles WHERE deleted_at IS NULL AND concat_ws(' ', employer, title, notes) ILIKE $1 LIMIT 10`, [like]),
    q(`SELECT d.id, d.job_id, ${label} AS label, d.title, concat_ws(' ', d.angle, d.spec::text) AS body FROM decks d JOIN jobs j ON j.id=d.job_id JOIN lanes l ON l.id=j.lane_id WHERE ${LIVE} AND d.deleted_at IS NULL AND concat_ws(' ', d.title, d.angle, d.spec::text) ILIKE $1 LIMIT 8`, [like]),
    q(`SELECT i.id, i.workspace_id, i.kind, i.title, concat_ws(' ', i.body, i.extra->>'email') AS body, r.employer FROM ws_items i JOIN workspaces w ON w.id=i.workspace_id JOIN roles r ON r.id=w.role_id WHERE i.deleted_at IS NULL AND w.deleted_at IS NULL AND r.deleted_at IS NULL AND concat_ws(' ', i.title, i.body, i.extra->>'email') ILIKE $1 LIMIT 12`, [like]),
    q(`SELECT p.id, p.workspace_id, p.title, p.plan::text AS body, r.employer FROM lesson_plans p JOIN workspaces w ON w.id=p.workspace_id JOIN roles r ON r.id=w.role_id WHERE p.deleted_at IS NULL AND w.deleted_at IS NULL AND r.deleted_at IS NULL AND concat_ws(' ', p.title, p.plan::text) ILIKE $1 LIMIT 8`, [like]),
    q(`SELECT id, title, issuer, notes, category FROM career_docs WHERE deleted_at IS NULL AND win_id IS NULL AND concat_ws(' ', title, issuer, notes) ILIKE $1 LIMIT 10`, [like]),
  ]);
  const hits: Hit[] = [
    ...jobs.map((r: any) => ({ type: 'Job', id: r.id, job_id: r.id, label: r.label, title: r.label, snippet: snippet(r.body, term) })),
    ...docs.map((r: any) => ({ type: 'Document', id: r.id, job_id: r.job_id, label: r.label, title: r.title, snippet: snippet(r.body, term) })),
    ...notes.map((r: any) => ({ type: 'Note', id: r.id, job_id: r.job_id, label: r.label, title: 'Note', snippet: snippet(r.body, term) })),
    ...acts.map((r: any) => ({ type: 'Next action', id: r.id, job_id: r.job_id, label: r.label, title: 'Next action', snippet: snippet(r.body, term) })),
    ...mails.map((r: any) => ({ type: 'Email', id: r.id, job_id: r.job_id, label: r.label, title: r.subject, snippet: snippet(r.body, term) })),
    ...contacts.map((r: any) => ({ type: 'Contact', id: r.id, job_id: r.job_id, label: r.label, title: 'Contact', snippet: snippet(r.body, term) })),
    ...lib.map((r: any) => ({ type: `Library · ${r.kind}`, id: r.id, job_id: null, href: '/library', label: 'Library', title: r.title || r.kind, snippet: snippet(r.body, term) })),
    ...wins.map((r: any) => ({ type: 'Win', id: r.id, job_id: null, href: '/rise', label: [r.employer, r.role].filter(Boolean).join(' · ') || 'Rise', title: r.title, snippet: snippet(r.body, term) })),
    ...cases.map((r: any) => ({ type: 'Case', id: r.id, job_id: null, href: '/case', label: 'Rise', title: r.title, snippet: snippet(r.body, term) })),
    ...roles.map((r: any) => ({ type: 'Role', id: r.id, job_id: null, href: '/rise?tab=roles', label: r.employer, title: r.title || 'Role', snippet: snippet([r.employer, r.title, r.notes].filter(Boolean).join(' · '), term) })),
    ...decks.map((r: any) => ({ type: 'Interview deck', id: r.id, job_id: r.job_id, href: `/jobs/${r.job_id}?tab=Interview%20deck`, label: r.label, title: r.title, snippet: snippet(String(r.body).replace(/["{}[\]\\]/g, ' '), term) })),
    ...work.map((r: any) => ({ type: `Thrive · ${r.kind}`, id: r.id, job_id: null, href: `/thrive/${r.workspace_id}`, label: r.employer, title: r.title, snippet: snippet(r.body || r.title, term) })),
    ...plans.map((r: any) => ({ type: 'Lesson plan', id: r.id, job_id: null, href: `/thrive/${r.workspace_id}?section=lessons`, label: r.employer, title: r.title, snippet: snippet(String(r.body).replace(/["{}[\]\\]/g, ' '), term) })),
    ...vault.map((r: any) => ({ type: 'Vault document', id: r.id, job_id: null, href: '/vault', label: 'Vault', title: r.title, snippet: snippet([r.issuer, r.notes].filter(Boolean).join(' · ') || r.category, term) })),
  ];
  return jobId ? [...hits.filter((h) => h.job_id === jobId), ...hits.filter((h) => h.job_id !== jobId)] : hits;
}
