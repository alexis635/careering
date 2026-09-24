import { q } from './db.js';

/** Everything the app has sent or received, across all jobs. */
export async function mailList(box: string) {
  const label = `COALESCE(NULLIF(j.company,''),'Untitled') || CASE WHEN j.role_title <> '' THEN ' · ' || j.role_title ELSE '' END`;
  if (box === 'drafts') {
    return q(
      `SELECT d.id, d.job_id, ${label} AS label, 'draft' AS direction, '' AS from_addr, '' AS to_addr, d.title AS subject, left(d.body, 180) AS snippet, d.created_at AS sent_at, NULL AS gmail_thread_id, '[]'::jsonb AS attachments
         FROM job_documents d JOIN jobs j ON j.id = d.job_id JOIN lanes l ON l.id = j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND d.kind = 'outreach' ORDER BY d.created_at DESC LIMIT 200`,
    );
  }
  const where = `WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL` + (box === 'sent' ? ` AND e.direction='sent'` : box === 'received' ? ` AND e.direction='received'` : '');
  return q(
    `SELECT e.id, e.job_id, ${label} AS label, e.direction, e.from_addr, e.to_addr, e.subject, left(e.body, 180) AS snippet, e.sent_at, e.gmail_thread_id, e.attachments
       FROM job_emails e JOIN jobs j ON j.id = e.job_id JOIN lanes l ON l.id = j.lane_id ${where} ORDER BY e.sent_at DESC LIMIT 300`,
  );
}
