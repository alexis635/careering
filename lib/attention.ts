import { q } from './db.js';
import { stageLabel } from './stages.js';

/** Things that need a nudge. Dates come back as plain YYYY-MM-DD strings so the browser can compare in local time. */
export async function attention() {
  const deadlines = await q(
    `SELECT j.id, j.company, j.role_title, j.stage, to_char(j.deadline,'YYYY-MM-DD') AS deadline, l.name AS lane_name, l.color
       FROM jobs j JOIN lanes l ON l.id = j.lane_id
      WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL AND j.deadline IS NOT NULL AND j.stage <> 'Closed' AND j.deadline <= current_date + 16
      ORDER BY j.deadline`,
  );
  const stale = await q(
    `SELECT j.id, j.company, j.role_title, j.stage, l.name AS lane_name, l.color, l.stages_config,
            to_char(GREATEST(j.updated_at, COALESCE(e.last_email, j.updated_at)),'YYYY-MM-DD') AS last_activity
       FROM jobs j JOIN lanes l ON l.id = j.lane_id
       LEFT JOIN (SELECT job_id, max(sent_at) AS last_email FROM job_emails GROUP BY job_id) e ON e.job_id = j.id
      WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL AND j.stage IN ('Applied','Screening','Interviewing','Offer')
        AND GREATEST(j.updated_at, COALESCE(e.last_email, j.updated_at)) < now() - interval '7 days'
      ORDER BY last_activity`,
  );
  const actions = await q(
    `SELECT a.id, a.text, to_char(a.due_date,'YYYY-MM-DD') AS due_date, j.id AS job_id, j.company, j.role_title
       FROM job_actions a JOIN jobs j ON j.id = a.job_id JOIN lanes l ON l.id = j.lane_id
      WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL AND a.deleted_at IS NULL AND a.done = false AND a.due_date IS NOT NULL AND a.due_date <= current_date + 4
      ORDER BY a.due_date`,
  );
  // credentials (transcripts, certifications, permits) that expire within 90 days, or lapsed in the last 30
  const credentials = await q(
    `SELECT id, title, category, to_char(expires_on,'YYYY-MM-DD') AS expires_on FROM career_docs
      WHERE deleted_at IS NULL AND expires_on IS NOT NULL AND expires_on <= current_date + 90 AND expires_on >= current_date - 30 ORDER BY expires_on`);
  const named = (rows: any[]) => rows.map(({ stages_config, ...r }) => ({ ...r, stage: stageLabel(stages_config, r.stage) }));
  return { deadlines, stale: named(stale), actions, credentials };
}
