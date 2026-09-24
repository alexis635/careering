import { q } from './db.js';

/** A small summary for the home page. Lane counts come from the lanes endpoint. */
export async function home() {
  const label = `COALESCE(NULLIF(j.company,''),'Untitled')`;
  const [recentJobs, replies, recentMail] = await Promise.all([
    q(`SELECT j.id, ${label} AS company, j.role_title, j.stage, j.fit, to_char(j.updated_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at, l.name AS lane_name, l.color
         FROM jobs j JOIN lanes l ON l.id = j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL ORDER BY j.updated_at DESC LIMIT 6`),
    q(`SELECT count(*)::int AS n FROM job_emails WHERE direction='received' AND sent_at > now() - interval '7 days'`),
    q(`SELECT e.id, e.job_id, ${label} AS label, e.direction, e.subject, left(e.body, 120) AS snippet, e.sent_at
         FROM job_emails e JOIN jobs j ON j.id = e.job_id JOIN lanes l ON l.id = j.lane_id WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL ORDER BY e.sent_at DESC LIMIT 4`),
  ]);
  return { recentJobs, repliesThisWeek: replies[0].n, recentMail };
}
