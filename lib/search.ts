import { q } from './db.js';

export interface Hit { type: string; id: number; job_id: number | null; label: string; title: string; snippet: string }

const esc = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function snippet(text: string, term: string) {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 60);
  return (start ? '…' : '') + text.slice(start, i + term.length + 90).replace(/\s+/g, ' ') + (i + term.length + 90 < text.length ? '…' : '');
}

/** Keyword search across everything in the app. Hits from the current job come first. */
export async function search(term: string, jobId: number | null): Promise<Hit[]> {
  term = term.trim();
  if (term.length < 2) return [];
  const like = `%${esc(term)}%`;
  const label = `COALESCE(NULLIF(j.company,''),'Untitled') || CASE WHEN j.role_title <> '' THEN ' · ' || j.role_title ELSE '' END`;
  const [jobs, docs, notes, acts, mails, contacts, lib] = await Promise.all([
    q(`SELECT j.id, ${label} AS label, concat_ws(' ', j.company, j.role_title, j.location, j.contact_person, j.contact_notes, j.match_notes, j.interview_prep, j.posting_text) AS body FROM jobs j JOIN lanes l ON l.id = j.lane_id
        WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND concat_ws(' ', j.company, j.role_title, j.location, j.contact_person, j.contact_notes, j.match_notes, j.interview_prep, j.posting_text) ILIKE $1 LIMIT 15`, [like]),
    q(`SELECT d.id, d.job_id, ${label} AS label, d.title, d.body FROM job_documents d JOIN jobs j ON j.id=d.job_id JOIN lanes l ON l.id=j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND (d.title ILIKE $1 OR d.body ILIKE $1) LIMIT 15`, [like]),
    q(`SELECT n.id, n.job_id, ${label} AS label, n.body FROM job_notes n JOIN jobs j ON j.id=n.job_id JOIN lanes l ON l.id=j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND n.body ILIKE $1 LIMIT 15`, [like]),
    q(`SELECT a.id, a.job_id, ${label} AS label, a.text AS body FROM job_actions a JOIN jobs j ON j.id=a.job_id JOIN lanes l ON l.id=j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND a.text ILIKE $1 LIMIT 10`, [like]),
    q(`SELECT m.id, m.job_id, ${label} AS label, m.subject, m.body FROM job_emails m JOIN jobs j ON j.id=m.job_id JOIN lanes l ON l.id=j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND (m.subject ILIKE $1 OR m.body ILIKE $1) LIMIT 15`, [like]),
    q(`SELECT c.id, c.job_id, ${label} AS label, concat_ws(' · ', c.name, c.title, c.email, c.notes) AS body FROM job_contacts c JOIN jobs j ON j.id=c.job_id JOIN lanes l ON l.id=j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND concat_ws(' ', c.name, c.title, c.email, c.notes) ILIKE $1 LIMIT 10`, [like]),
    q(`SELECT id, kind, title, body FROM library_items WHERE NOT ('archived' = ANY(tags)) AND (title ILIKE $1 OR body ILIKE $1 OR array_to_string(tags,' ') ILIKE $1) LIMIT 15`, [like]),
  ]);
  const hits: Hit[] = [
    ...jobs.map((r: any) => ({ type: 'Job', id: r.id, job_id: r.id, label: r.label, title: r.label, snippet: snippet(r.body, term) })),
    ...docs.map((r: any) => ({ type: 'Document', id: r.id, job_id: r.job_id, label: r.label, title: r.title, snippet: snippet(r.body, term) })),
    ...notes.map((r: any) => ({ type: 'Note', id: r.id, job_id: r.job_id, label: r.label, title: 'Note', snippet: snippet(r.body, term) })),
    ...acts.map((r: any) => ({ type: 'Next action', id: r.id, job_id: r.job_id, label: r.label, title: 'Next action', snippet: snippet(r.body, term) })),
    ...mails.map((r: any) => ({ type: 'Email', id: r.id, job_id: r.job_id, label: r.label, title: r.subject, snippet: snippet(r.body, term) })),
    ...contacts.map((r: any) => ({ type: 'Contact', id: r.id, job_id: r.job_id, label: r.label, title: 'Contact', snippet: snippet(r.body, term) })),
    ...lib.map((r: any) => ({ type: `Library · ${r.kind}`, id: r.id, job_id: null, label: 'Content Library', title: r.title || r.kind, snippet: snippet(r.body, term) })),
  ];
  return jobId ? [...hits.filter((h) => h.job_id === jobId), ...hits.filter((h) => h.job_id !== jobId)] : hits;
}
