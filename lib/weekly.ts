import { q } from './db.js';
import { attention } from './attention.js';
import { ask } from './ai.js';

const LIVE = `j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL`;
const NAME = `COALESCE(NULLIF(j.company,''),'Untitled')`;

export async function weekly() {
  const [added, applied, closed, replies, sent, pipeline, worth, att] = await Promise.all([
    q(`SELECT j.id, ${NAME} AS company, j.role_title, j.stage, j.fit, l.name AS lane_name FROM jobs j JOIN lanes l ON l.id=j.lane_id
        WHERE ${LIVE} AND j.type='application' AND j.created_at > now() - interval '7 days' ORDER BY j.created_at DESC`),
    q(`SELECT j.id, ${NAME} AS company, j.role_title, j.stage, l.name AS lane_name FROM jobs j JOIN lanes l ON l.id=j.lane_id
        WHERE ${LIVE} AND j.applied_date >= current_date - 7 ORDER BY j.applied_date DESC`),
    q(`SELECT j.id, ${NAME} AS company, j.role_title, j.closed_outcome FROM jobs j JOIN lanes l ON l.id=j.lane_id
        WHERE ${LIVE} AND j.stage='Closed' AND j.updated_at > now() - interval '7 days'`),
    q(`SELECT e.id, e.job_id, ${NAME} AS company, e.from_addr, e.subject, left(e.body, 200) AS snippet, e.sent_at FROM job_emails e JOIN jobs j ON j.id=e.job_id JOIN lanes l ON l.id=j.lane_id
        WHERE ${LIVE} AND e.direction='received' AND e.sent_at > now() - interval '7 days' ORDER BY e.sent_at DESC`),
    q(`SELECT count(*)::int AS n FROM job_emails e JOIN jobs j ON j.id=e.job_id JOIN lanes l ON l.id=j.lane_id WHERE ${LIVE} AND e.direction='sent' AND e.sent_at > now() - interval '7 days'`),
    q(`SELECT j.stage, count(*)::int AS n FROM jobs j JOIN lanes l ON l.id=j.lane_id WHERE ${LIVE} AND j.type='application' AND j.stage <> 'Closed' GROUP BY j.stage`),
    q(`SELECT j.id, ${NAME} AS company, j.role_title, j.fit, l.name AS lane_name FROM jobs j JOIN lanes l ON l.id=j.lane_id
        WHERE ${LIVE} AND j.type='application' AND j.stage='Saved' AND j.fit IN ('strong','moderate') ORDER BY (j.fit='strong') DESC, j.updated_at DESC LIMIT 8`),
    attention(),
  ]);
  return { added, applied, closed, replies, emailsSent: sent[0].n, pipeline, worthApplying: worth, deadlines: att.deadlines, stale: att.stale, actions: att.actions };
}

type Weekly = Awaited<ReturnType<typeof weekly>>;

const line = (j: { company: string; role_title?: string }) => `${j.company.trim()}${j.role_title?.trim() ? `, ${j.role_title.trim()}` : ''}`;

/** Plain text version, used for the "email me this" button and as context for the AI focus note. */
export function weeklyText(w: Weekly, focus = ''): string {
  const out: string[] = ['Your Careering week', ''];
  if (focus) out.push(focus, '');
  out.push(`Pipeline now: ${['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer'].map((s) => `${s} ${w.pipeline.find((p: any) => p.stage === s)?.n ?? 0}`).join(', ')}`, '');
  const sec = (title: string, items: string[]) => { if (items.length) out.push(title, ...items.map((i) => `- ${i}`), ''); };
  sec('Applied this week', w.applied.map(line));
  sec('Added this week', w.added.map(line));
  sec(`Replies received (${w.replies.length})`, w.replies.map((r: any) => `${r.company}: ${r.subject}`));
  out.push(`Emails sent this week: ${w.emailsSent}`, '');
  sec('Closed this week', w.closed.map((c: any) => `${line(c)} (${c.closed_outcome ?? 'closed'})`));
  sec('Deadlines coming up', w.deadlines.map((d: any) => `${line(d)}, ${d.deadline}`));
  sec('Next actions due soon', w.actions.map((a: any) => `${a.text} (${a.company}, ${a.due_date})`));
  sec('Gone quiet, worth a follow up', w.stale.map((s: any) => `${line(s)} (${s.stage}, last activity ${s.last_activity})`));
  sec('Strong matches still waiting to be applied to', w.worthApplying.map((j: any) => `${line(j)} (${j.fit} fit)`));
  return out.join('\n').trim();
}

export async function weeklyFocus(w: Weekly): Promise<string> {
  return ask(
    'You are a calm, practical job search coach. From this week\'s snapshot, write a short "focus for the week" note: 3 to 4 sentences, plain text, no headings or bullets. Say what is going well, then name the two or three most valuable things to do next (for example follow ups on quiet applications, strong matches not yet applied to, deadlines). Use only the facts given and mention jobs by company name. Describe only this week and the current pipeline: never guess about earlier weeks or how the person feels, and never call a week slow or busy relative to anything.',
    weeklyText(w),
    3000,
  );
}
