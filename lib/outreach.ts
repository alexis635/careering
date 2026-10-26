// Post-application outreach. When a job moves to Applied, Careering picks (or finds) the hiring manager and
// the HR/recruiting contact, looks up missing emails with Hunter, and drafts one personal email to each.
// Nothing is ever sent here on its own: a draft has to be approved by Alexis, and the exact approved
// To/Subject/Body is what goes out (any edit after approval sends it back to review). Noelle sends approved
// drafts through the agent API, or Alexis clicks Send herself. Every draft is soft deleted only.
import { createHash } from 'node:crypto';
import { q } from './db.js';
import { HttpError, askJson, libraryContext, loadJob } from './ai.js';
import { jobBrief } from './advisor.js';
import { findPeople, type FoundPerson } from './people.js';
import { hunterFind } from './hunter.js';
import { checkAttachments, sendEmail, type Attachment } from './gmail.js';
import { noDash } from '../src/lib/noDash.js';

export type Recipient = 'hiring_manager' | 'hr';
export type Seat = Recipient | 'other';
export const RECIPIENTS: Recipient[] = ['hiring_manager', 'hr'];
const LABEL: Record<Seat, string> = { hiring_manager: 'hiring manager', hr: 'HR or recruiting', other: 'other contact at the company' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUCK_MINUTES = 6;   // a run still "running" after this long died with its function; it can be started again

let ready: Promise<void> | null = null;
export function ensureOutreachSchema() {
  ready ??= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS outreach_runs (
      job_id INT PRIMARY KEY, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', started_by TEXT NOT NULL DEFAULT 'alexis',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ)`);
    await q(`CREATE TABLE IF NOT EXISTS outreach_drafts (
      id SERIAL PRIMARY KEY, job_id INT NOT NULL, contact_id INT, recipient TEXT NOT NULL,
      to_name TEXT NOT NULL DEFAULT '', to_title TEXT NOT NULL DEFAULT '', to_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', tailored TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'drafted', approved_at TIMESTAMPTZ, approved_hash TEXT,
      sent_at TIMESTAMPTZ, sent_by TEXT, email_id INT, error TEXT NOT NULL DEFAULT '', history JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ)`);
    await q(`CREATE INDEX IF NOT EXISTS outreach_drafts_job ON outreach_drafts (job_id)`);
    // files go out with the email; the digest is part of the approval so a swapped file needs approval again
    await q(`ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'`);
    await q(`ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS attachment_names JSONB NOT NULL DEFAULT '[]'`);
    await q(`ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS attach_digest TEXT NOT NULL DEFAULT ''`);
    // who wrote the draft: Careering's own outreach run, or Noelle staging one through the agent API
    await q(`ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS drafted_by TEXT NOT NULL DEFAULT 'careering'`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/** What gets approved, so a send can prove it is the exact text she said yes to. */
export const approvalHash = (d: { to_email: string; subject: string; body: string; attach_digest?: string }) =>
  createHash('sha256').update(`${d.to_email.trim().toLowerCase()}\n${d.subject}\n${d.body}${d.attach_digest ? `\n${d.attach_digest}` : ''}`).digest('hex');
export const attachDigest = (atts: Attachment[]) =>
  atts.length ? createHash('sha256').update(atts.map((a) => `${a.name}\n${a.mime}\n${a.data}`).join('\n')).digest('hex') : '';

// ---- who to write to ----

/** Which seat a saved contact sits in. Find people writes the kind first in the notes ("Hiring manager. Found at ..."). Lower rank is a better fit. */
export function seatOf(c: { title?: string; notes?: string }): { recipient: Recipient; rank: number } | null {
  const notes = String(c.notes || '');
  const title = String(c.title || '');
  if (/^HR \/ recruiting/i.test(notes)) return { recipient: 'hr', rank: 0 };
  if (/^Hiring manager/i.test(notes)) return { recipient: 'hiring_manager', rank: 0 };
  if (/^Department lead/i.test(notes)) return { recipient: 'hiring_manager', rank: 1 };
  if (/^VP of the department/i.test(notes)) return { recipient: 'hiring_manager', rank: 2 };
  if (/^CEO/i.test(notes)) return { recipient: 'hiring_manager', rank: 3 };
  if (/^Personal connection/i.test(notes)) return null;   // a friend or alum, never picked as the hiring manager or HR seat
  if (/recruit|talent|sourc|human resources|people (ops|operations|partner|team)|head of people|\bhr\b/i.test(title)) return { recipient: 'hr', rank: 1 };
  if (/\b(ceo|founder|owner|president)\b/i.test(title)) return { recipient: 'hiring_manager', rank: 3 };
  if (/\b(vp|vice president|svp|chief)\b/i.test(title)) return { recipient: 'hiring_manager', rank: 2 };
  if (/manager|director|head of|lead\b|supervisor|principal/i.test(title)) return { recipient: 'hiring_manager', rank: 1 };
  return null;
}

function pick(contacts: any[], recipient: Recipient, used: Set<number>) {
  return contacts
    .filter((c) => !used.has(c.id) && seatOf(c)?.recipient === recipient)
    .sort((a, b) => (seatOf(a)!.rank + (EMAIL_RE.test(a.email) ? 0 : 0.5)) - (seatOf(b)!.rank + (EMAIL_RE.test(b.email) ? 0 : 0.5)))[0] ?? null;
}

const KIND_NOTE: Record<FoundPerson['kind'], string> = { hr: 'HR / recruiting', hiring_manager: 'Hiring manager', department_lead: 'Department lead', vp: 'VP of the department', ceo: 'CEO' };

// ---- the run ----

async function setRun(jobId: number, status: string, note = '') {
  await q(`UPDATE outreach_runs SET status=$2, note=$3, finished_at=now() WHERE job_id=$1`, [jobId, status, noDash(note)]);
}

/** Claim the run so two clicks (or a click and a stage move) never draft twice. Returns false if one is already going. */
export async function claimRun(jobId: number, by: string): Promise<boolean> {
  await ensureOutreachSchema();
  const got = await q(
    `INSERT INTO outreach_runs (job_id, status, started_by) VALUES ($1,'running',$2)
     ON CONFLICT (job_id) DO UPDATE SET status='running', note='', started_by=$2, started_at=now(), finished_at=NULL
       WHERE outreach_runs.status <> 'running' OR outreach_runs.started_at < now() - interval '${STUCK_MINUTES} minutes'
     RETURNING job_id`,
    [jobId, by],
  );
  return got.length > 0;
}

/**
 * Fill in whatever is missing for this job: one hiring manager draft and one HR draft.
 * Seats that already have a live draft (anything but skipped) are left alone, so running it again after
 * adding a contact by hand only drafts the missing one. Call claimRun first.
 */
export async function runOutreach(jobId: number): Promise<void> {
  const notes: string[] = [];
  try {
    const job = await loadJob(jobId);
    if (job.deleted_at) throw new HttpError(404, 'This job is in the Trash');
    const prior = await q(`SELECT recipient, contact_id, status FROM outreach_drafts WHERE job_id=$1 AND deleted_at IS NULL`, [jobId]);
    const needed = RECIPIENTS.filter((r) => !prior.some((d: any) => d.recipient === r && d.status !== 'skipped'));
    if (!needed.length) { await setRun(jobId, 'ready', 'Both drafts are already here.'); return; }
    // anyone already written to (or skipped) is not picked again
    const used = new Set<number>(prior.map((d: any) => d.contact_id).filter(Boolean));

    const contactsNow = () => q(`SELECT * FROM job_contacts WHERE job_id=$1 AND deleted_at IS NULL ORDER BY id`, [jobId]);
    let contacts = await contactsNow();
    let domain = String(job.company_domain || '');

    // 1. Nobody saved for a seat (or only the CEO for the hiring manager): search public pages, the same search as
    //    Find people, and save the best matches. The CEO stays a last resort if the search finds no one closer.
    const weak = (r: Recipient) => { const p = pick(contacts, r, used); return !p || seatOf(p)!.rank >= 3; };
    if (needed.some(weak) && String(job.company || '').trim()) {
      try {
        const found = await findPeople({ job_id: jobId });
        domain ||= found.domain;
        const have = (n: string) => contacts.some((c: any) => c.name.trim().toLowerCase() === n.trim().toLowerCase());
        for (const r of needed.filter(weak)) {
          const kinds: FoundPerson['kind'][] = r === 'hr' ? ['hr'] : ['hiring_manager', 'department_lead', 'vp'];
          const best = found.people
            .filter((p) => kinds.includes(p.kind) && !have(p.name))
            .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || (b.email ? 1 : 0) - (a.email ? 1 : 0))[0];
          if (!best) continue;
          await q(`INSERT INTO job_contacts (job_id, name, title, email, source, notes) VALUES ($1,$2,$3,$4,'outreach',$5)`,
            [jobId, best.name, best.title, best.email, noDash(`${KIND_NOTE[best.kind]}. Found at ${best.source_url}${best.why ? `. ${best.why}` : ''}`)]);
        }
        if (!found.people.length && found.notes) notes.push(`Search: ${found.notes}`);
        contacts = await contactsNow();
      } catch (e: any) {
        notes.push(`The people search did not finish (${e?.message || 'error'}).`);
      }
    }

    const picks = needed.map((r) => ({ recipient: r, contact: pick(contacts, r, used) })).filter((p) => p.contact);
    picks.forEach((p) => used.add(p.contact.id));

    // 2. Missing addresses: Hunter, one lookup per person, only for the people we are actually writing to.
    let hunterOut = !process.env.HUNTER_API_KEY;
    for (const p of picks) {
      if (EMAIL_RE.test(p.contact.email)) continue;
      if (String(p.contact.name).trim().split(/\s+/).length < 2) { notes.push(`${p.contact.name}: only a first name is known, so Hunter cannot look up the email.`); continue; }
      if (hunterOut) continue;
      try {
        const h = await hunterFind({ job_id: jobId, name: p.contact.name, domain });
        const how = h.verified ? 'verified' : `confidence ${h.score}%`;
        const row = (await q(`UPDATE job_contacts SET email=$1, notes = COALESCE(notes, '') || $2 WHERE id=$3 RETURNING *`,
          [h.email, `. Email from Hunter, ${how}`, p.contact.id]))[0];
        p.contact = row;
        if (!h.verified && h.score < 80) notes.push(`${row.name}: Hunter is only ${h.score}% sure of ${h.email}. Double check before approving.`);
      } catch (e: any) {
        if (e instanceof HttpError && e.status === 429) { hunterOut = true; notes.push('Out of Hunter lookups for this month.'); }
        else notes.push(`${p.contact.name}: ${e?.message || 'Hunter lookup failed'}`);
      }
    }

    // 3. Draft one email per person, in one pass so the two never read alike.
    if (picks.length) {
      const drafts = await draftFor(job, picks.map((p) => ({ recipient: p.recipient, contact: p.contact })));
      for (const p of picks) {
        const d = drafts.find((x) => x.recipient === p.recipient);
        if (!d) continue;
        await q(
          `INSERT INTO outreach_drafts (job_id, contact_id, recipient, to_name, to_title, to_email, subject, body, tailored)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [jobId, p.contact.id, p.recipient, p.contact.name, p.contact.title, EMAIL_RE.test(p.contact.email) ? p.contact.email : '', d.subject, d.body, d.tailored],
        );
        if (!EMAIL_RE.test(p.contact.email)) notes.push(`No email for ${p.contact.name} yet. Add it on the draft before approving.`);
      }
    }

    const missing = needed.filter((r) => !picks.some((p) => p.recipient === r));
    if (missing.length) {
      notes.unshift(`Research by hand: no ${missing.map((r) => LABEL[r]).join(' or ')} contact found for ${job.company || 'this company'}. Add one under People, then click Draft missing.`);
      await setRun(jobId, 'needs_research', notes.join(' '));
    } else {
      await setRun(jobId, 'ready', notes.join(' '));
    }
  } catch (e: any) {
    console.error('outreach run failed', jobId, e);
    await setRun(jobId, 'failed', [`Drafting stopped: ${e?.message || 'server error'}.`, ...notes].join(' ')).catch(() => {});
  }
}

// ---- writing ----

const GUIDE =
  'You write post-application outreach emails for the candidate. She has ALREADY APPLIED to this role through the posting; each email follows up on that application with one specific person. ' +
  'Each email must be written for its recipient, not a template: use their first name, and shape the message around what someone in their seat cares about, judged from their title and the notes about them. Never invent facts about the recipient, their team, or anything they said or posted. If the notes do not support a personal detail, do not add one. ' +
  'HIRING MANAGER (the person the role reports to or the leader of that team): under 140 words. Show she understands what the team needs from this hire (from the posting), connect one or two specific, real results from her record to those needs, and ask for a short conversation. Talk about the work, not the application process. ' +
  'HR OR RECRUITING: under 120 words. Say she applied for the exact role title (include a requisition or job number only if the posting shows one), give two or three crisp matches to the must have requirements, and ask about next steps or timing. Easy to forward, easy to screen. ' +
  'When both are written, they must open differently, use different proof points where the record allows, and share no sentences. ' +
  'Subject lines are specific to the role and recipient (no "Following up" alone, no "Quick question"). Plain text, short paragraphs, no bullet lists, no exclamation points, no flattery about the company. ' +
  'Do not put "Subject:" in the body. End the body with "Best," on its own line and then the candidate\'s full name from the CAREER FACTS. Never use a placeholder like [Your Name]. ' +
  '"tailored" is one short sentence for the candidate saying what makes this email specific to this person (for example which requirement or which part of their title it speaks to).';

// The same rules before she applies, for drafts Noelle stages on a Saved job.
const PRE_APPLY_GUIDE = GUIDE
  .replace('You write post-application outreach emails', 'You write outreach emails')
  .replace('She has ALREADY APPLIED to this role through the posting; each email follows up on that application with one specific person.', 'She has NOT applied yet; each email reaches out to one specific person about the role before she applies. Never say she applied.')
  .replace('Say she applied for the exact role title', 'Name the exact role title she is interested in');

type Pick = { recipient: Recipient; contact: any };
type Drafted = { recipient: Recipient; subject: string; body: string; tailored: string };

async function context(job: any) {
  const [lib, brief, settings, tailored] = await Promise.all([
    libraryContext(), jobBrief(job),
    q(`SELECT value FROM settings WHERE key='portfolio_url'`),
    q(`SELECT body FROM job_documents WHERE job_id=$1 AND kind='resume' AND deleted_at IS NULL AND source <> 'noelle' ORDER BY version DESC, id DESC LIMIT 1`, [job.id]),   // her own versions, not Noelle's proposals
  ]);
  const resume = tailored[0]?.body ? `THE RESUME SHE SUBMITTED FOR THIS ROLE (the emails should agree with it):\n${String(tailored[0].body).slice(0, 6000)}\n\n` : '';
  const parsed = job.posting_parsed;
  const posting = String(job.posting_text || '').trim()
    ? String(job.posting_text).slice(0, 14000)
    : parsed?.summary ? `${parsed.summary}\nRequirements: ${(parsed.requirements || []).join('; ')}` : '(posting text not saved; use only the role title and company)';
  const pos = job.positioning ? `POSITIONING FOR THIS ROLE:\n${JSON.stringify(job.positioning).slice(0, 4000)}\n\n` : '';
  const applied = job.applied_date ? new Date(job.applied_date).toISOString().slice(0, 10) : 'recently';
  const portfolio = String(settings[0]?.value || '').trim();
  return {
    portfolio,
    text: `Company: ${job.company}\nRole: ${job.role_title}\nApplied on: ${applied}\n\nJOB POSTING:\n${posting}\n\n${pos}` +
      `${resume}${job.match_notes ? `MATCH NOTES:\n${String(job.match_notes).slice(0, 3000)}\n\n` : ''}CANDIDATE MATERIAL:\n${lib.text}${brief ? `\n\n${brief}` : ''}`,
  };
}

const person = (p: Pick) =>
  `- key "${p.recipient}" (${LABEL[p.recipient]}): ${p.contact.name}${p.contact.title ? `, ${p.contact.title}` : ''}${p.contact.notes ? `. Notes: ${String(p.contact.notes).slice(0, 500)}` : ''}`;

const withPortfolio = (body: string, url: string) => (url && !body.includes(url) ? `${body.trim()}\n\nPortfolio: ${url}` : body.trim());

async function draftFor(job: any, picks: Pick[], extra = '', guide = GUIDE): Promise<Drafted[]> {
  const ctx = await context(job);
  const out = await askJson<{ drafts: Drafted[] }>(
    guide,
    `${ctx.text}\n\nWRITE ONE EMAIL FOR EACH OF THESE RECIPIENTS:\n${picks.map(person).join('\n')}${extra}`,
    {
      properties: {
        drafts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              recipient: { type: 'string', enum: picks.map((p) => p.recipient) },
              subject: { type: 'string' }, body: { type: 'string' }, tailored: { type: 'string' },
            },
            required: ['recipient', 'subject', 'body', 'tailored'],
          },
        },
      },
      required: ['drafts'],
    },
    12000,
  );
  const drafts = (out.drafts || []).filter((d) => d?.subject?.trim() && d?.body?.trim());
  if (!drafts.length) throw new HttpError(502, 'The AI returned no drafts this time. Please try again.');
  return drafts.map((d) => ({ ...d, subject: noDash(d.subject).trim(), body: withPortfolio(noDash(d.body).replace(/^Subject:.*\n+/i, ''), ctx.portfolio), tailored: noDash(String(d.tailored || '')).trim() }));
}

// ---- reading ----

const DRAFT_COLS = `d.id, d.job_id, d.contact_id, d.recipient, d.to_name, d.to_title, d.to_email, d.subject, d.body, d.tailored, d.status,
  d.approved_at, d.sent_at, d.sent_by, d.email_id, d.error, d.created_at, d.updated_at,
  (d.approved_hash IS NOT NULL AND d.approved_hash = encode(sha256(convert_to(lower(trim(d.to_email)) || E'\\n' || d.subject || E'\\n' || d.body || CASE WHEN d.attach_digest <> '' THEN E'\\n' || d.attach_digest ELSE '' END, 'UTF8')), 'hex')) AS approval_valid,
  d.attachment_names, d.drafted_by,
  EXISTS (SELECT 1 FROM job_emails r JOIN job_emails s ON s.gmail_thread_id = r.gmail_thread_id
           WHERE s.id = d.email_id AND r.direction = 'received') AS replied`;

export async function jobOutreach(jobId: number) {
  await ensureOutreachSchema();
  const run = (await q(`SELECT * FROM outreach_runs WHERE job_id=$1`, [jobId]))[0] ?? null;
  const drafts = await q(`SELECT ${DRAFT_COLS} FROM outreach_drafts d WHERE d.job_id=$1 AND d.deleted_at IS NULL ORDER BY d.recipient, d.id`, [jobId]);
  return { run: run && stuck(run) ? { ...run, status: 'failed', note: 'The last run stopped partway. Start it again.' } : run, drafts };
}
const stuck = (run: any) => run.status === 'running' && Date.now() - new Date(run.started_at).getTime() > STUCK_MINUTES * 60_000;

/** Everything across jobs, for the Outreach page and for Noelle. */
export async function outreachQueue(status?: string) {
  await ensureOutreachSchema();
  const vals: any[] = [];
  let where = '';
  if (status) { vals.push(status); where = `AND d.status = $1`; }
  const drafts = await q(
    `SELECT ${DRAFT_COLS}, j.company, j.company_domain, j.role_title, j.stage, to_char(j.applied_date,'YYYY-MM-DD') AS applied_date
       FROM outreach_drafts d JOIN jobs j ON j.id = d.job_id JOIN lanes l ON l.id = j.lane_id
      WHERE d.deleted_at IS NULL AND j.deleted_at IS NULL AND l.deleted_at IS NULL ${where}
      ORDER BY j.applied_date DESC NULLS LAST, d.job_id DESC, d.recipient`, vals);
  const runs = await q(
    `SELECT r.*, j.company, j.company_domain, j.role_title, to_char(j.applied_date,'YYYY-MM-DD') AS applied_date
       FROM outreach_runs r JOIN jobs j ON j.id = r.job_id JOIN lanes l ON l.id = j.lane_id
      WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL ORDER BY r.started_at DESC`);
  // applied (or further along) jobs where outreach never started
  const notStarted = await q(
    `SELECT j.id, j.company, j.company_domain, j.role_title, j.stage, to_char(j.applied_date,'YYYY-MM-DD') AS applied_date
       FROM jobs j JOIN lanes l ON l.id = j.lane_id
      WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL AND j.type = 'application'
        AND j.stage IN ('Applied','Screening','Interviewing') AND NOT EXISTS (SELECT 1 FROM outreach_runs r WHERE r.job_id = j.id)
      ORDER BY j.applied_date DESC NULLS LAST`);
  return { drafts, runs: runs.map((r: any) => (stuck(r) ? { ...r, status: 'failed', note: 'The last run stopped partway. Start it again.' } : r)), not_started: notStarted };
}

async function getDraft(id: number) {
  await ensureOutreachSchema();
  const d = (await q(`SELECT ${DRAFT_COLS}, d.approved_hash, d.history, d.attach_digest FROM outreach_drafts d WHERE d.id=$1 AND d.deleted_at IS NULL`, [id]))[0];
  if (!d) throw new HttpError(404, 'No draft with that id');
  return d;
}

// ---- Alexis's actions (cookie session only; the agent key never reaches these) ----

export async function editDraft(id: number, body: any) {
  const d = await getDraft(id);
  if (d.status === 'sent' || d.status === 'sending') throw new HttpError(409, 'This email was already sent and cannot be edited');
  const next = {
    to_email: 'to_email' in body ? String(body.to_email || '').trim() : d.to_email,
    to_name: 'to_name' in body ? String(body.to_name || '').trim() : d.to_name,
    subject: 'subject' in body ? noDash(String(body.subject || '')).trim() : d.subject,
    body: 'body' in body ? noDash(String(body.body || '')).trim() : d.body,
  };
  if (next.to_email && !EMAIL_RE.test(next.to_email)) throw new HttpError(400, 'That email address looks invalid');
  const changed = next.to_email !== d.to_email || next.subject !== d.subject || next.body !== d.body;
  // Any change to what would be sent takes it back to review.
  const row = (await q(
    `UPDATE outreach_drafts SET to_email=$1, to_name=$2, subject=$3, body=$4, updated_at=now(),
       status = CASE WHEN $5 AND status IN ('approved','failed') THEN 'drafted' ELSE status END,
       approved_hash = CASE WHEN $5 THEN NULL ELSE approved_hash END, approved_at = CASE WHEN $5 THEN NULL ELSE approved_at END
     WHERE id=$6 RETURNING id`, [next.to_email, next.to_name, next.subject, next.body, changed, id]))[0];
  if (changed && next.to_email && d.contact_id && next.to_email !== d.to_email) {
    await q(`UPDATE job_contacts SET email=$1 WHERE id=$2 AND (email = '' OR email IS NULL)`, [next.to_email, d.contact_id]);
  }
  return getDraft(row.id);
}

export async function approveDraft(id: number) {
  const d = await getDraft(id);
  if (!['drafted', 'failed'].includes(d.status)) throw new HttpError(409, d.status === 'approved' ? 'Already approved' : `Cannot approve a ${d.status} email`);
  if (!EMAIL_RE.test(d.to_email)) throw new HttpError(400, 'Add the recipient\'s email address before approving');
  if (!d.subject.trim() || !d.body.trim()) throw new HttpError(400, 'Subject and message cannot be empty');
  await q(`UPDATE outreach_drafts SET status='approved', approved_at=now(), approved_hash=$1, error='', updated_at=now() WHERE id=$2`, [approvalHash({ ...d, attach_digest: d.attach_digest }), id]);
  return getDraft(id);
}

export async function unapproveDraft(id: number) {
  const d = await getDraft(id);
  if (d.status !== 'approved' && d.status !== 'failed') throw new HttpError(409, 'Only an approved email can be taken back');
  await q(`UPDATE outreach_drafts SET status='drafted', approved_at=NULL, approved_hash=NULL, updated_at=now() WHERE id=$1`, [id]);
  return getDraft(id);
}

export async function skipDraft(id: number, restore = false) {
  const d = await getDraft(id);
  if (restore ? d.status !== 'skipped' : !['drafted', 'approved', 'failed'].includes(d.status)) throw new HttpError(409, `Cannot ${restore ? 'restore' : 'skip'} a ${d.status} email`);
  await q(`UPDATE outreach_drafts SET status=$1, approved_at=NULL, approved_hash=NULL, updated_at=now() WHERE id=$2`, [restore ? 'drafted' : 'skipped', id]);
  return getDraft(id);
}

/** She sent it some other way (LinkedIn, her phone). Recorded as sent so the tracking stays honest. */
export async function markSentElsewhere(id: number) {
  const d = await getDraft(id);
  if (d.status === 'sent' || d.status === 'sending') throw new HttpError(409, 'Already sent');
  await q(`UPDATE outreach_drafts SET status='sent', sent_at=now(), sent_by='alexis (outside Careering)', updated_at=now() WHERE id=$1`, [id]);
  return getDraft(id);
}

export async function redraft(id: number, instructions: string) {
  const d = await getDraft(id);
  if (d.status === 'sent' || d.status === 'sending') throw new HttpError(409, 'This email was already sent');
  const job = await loadJob(d.job_id);
  const contact = (d.contact_id && (await q(`SELECT * FROM job_contacts WHERE id=$1`, [d.contact_id]))[0]) || { name: d.to_name, title: d.to_title, notes: '' };
  const other = (await q(`SELECT subject, body FROM outreach_drafts WHERE job_id=$1 AND id<>$2 AND deleted_at IS NULL AND status <> 'skipped' ORDER BY id DESC LIMIT 1`, [d.job_id, id]))[0];
  const extra =
    `\n\nTHE CURRENT DRAFT (rewrite it, do not just polish it):\nSubject: ${d.subject}\n${d.body}` +
    (other ? `\n\nTHE OTHER EMAIL FOR THIS JOB (do not repeat its opening, sentences, or proof points):\nSubject: ${other.subject}\n${other.body}` : '') +
    (instructions.trim() ? `\n\nHER DIRECTION FOR THIS REWRITE: ${instructions.trim()}` : '');
  const [x] = await draftFor(job, [{ recipient: d.recipient, contact: { ...contact, name: d.to_name || contact.name } }], extra);
  await q(
    `UPDATE outreach_drafts SET subject=$1, body=$2, tailored=$3, status='drafted', approved_at=NULL, approved_hash=NULL, error='', updated_at=now(),
       history = history || $4::jsonb WHERE id=$5`,
    [x.subject, x.body, x.tailored, JSON.stringify([{ subject: d.subject, body: d.body, at: new Date().toISOString() }]), id]);
  return getDraft(id);
}

/**
 * An email she wrote (or generated) herself on the Emails tab and approved for Noelle instead of sending.
 * Saved already approved, locked to exactly this To/Subject/Body. The seat follows the contact so the
 * automatic run will not write to that seat again.
 */
export async function createApprovedDraft(jobId: number, body: any) {
  await ensureOutreachSchema();
  const job = await loadJob(jobId);
  if (job.deleted_at) throw new HttpError(404, 'This job is in the Trash');
  const to_email = String(body.to || '').trim();
  const subject = noDash(String(body.subject || '')).trim();
  const text = noDash(String(body.body || '')).trim();
  if (!EMAIL_RE.test(to_email)) throw new HttpError(400, 'Recipient email looks invalid');
  if (!subject || !text) throw new HttpError(400, 'Subject and message cannot be empty');
  const atts: Attachment[] = body.attachments ?? [];
  checkAttachments(atts);
  const digest = attachDigest(atts);
  const contact = (await q(`SELECT * FROM job_contacts WHERE job_id=$1 AND deleted_at IS NULL AND (id=$2 OR lower(email)=lower($3)) ORDER BY (id=$2) DESC LIMIT 1`,
    [jobId, Number(body.contact_id) || 0, to_email]))[0];
  const seat: Seat = (contact && seatOf(contact)?.recipient) || 'other';
  const row = (await q(
    `INSERT INTO outreach_drafts (job_id, contact_id, recipient, to_name, to_title, to_email, subject, body, tailored, status, approved_at, approved_hash, attachments, attachment_names, attach_digest)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Written by you on the Emails tab','approved',now(),$9,$10,$11,$12) RETURNING id`,
    [jobId, contact?.id ?? null, seat, contact?.name ?? '', contact?.title ?? '', to_email, subject, text, approvalHash({ to_email, subject, body: text, attach_digest: digest }),
      JSON.stringify(atts.map((a) => ({ name: a.name, mime: a.mime, data: a.data }))), JSON.stringify(atts.map((a) => a.name)), digest]))[0];
  return getDraft(row.id);
}

/**
 * Noelle stages a draft for one contact. It always lands as 'drafted': only Alexis can approve it, and nothing
 * here sends. Without a subject and body, Careering writes it from the job brief (her angle and advisor notes).
 */
export async function stageDraft(jobId: number, body: { contact_id: number; subject?: string; body?: string; instructions?: string }) {
  await ensureOutreachSchema();
  const job = await loadJob(jobId);
  if (job.deleted_at) throw new HttpError(404, 'This job is in the Trash');
  const contact = (await q(`SELECT * FROM job_contacts WHERE id=$1 AND job_id=$2 AND deleted_at IS NULL`, [body.contact_id, jobId]))[0];
  if (!contact) throw new HttpError(404, 'No contact with that id on this job');
  const open = (await q(`SELECT id FROM outreach_drafts WHERE job_id=$1 AND contact_id=$2 AND deleted_at IS NULL AND status NOT IN ('skipped','sent')`, [jobId, contact.id]))[0];
  if (open) throw new HttpError(409, `There is already an open draft (id ${open.id}) for ${contact.name} on this job`);
  let subject = noDash(String(body.subject || '')).trim();
  let text = noDash(String(body.body || '')).trim();
  let tailored = 'Staged by Noelle';
  // a friend or fellow alum (Dillard, AKA, T.Howard) gets a warm note, not a hiring pitch, even with a senior title
  const connection = /^(Personal connection|Other)\b/i.test(String(contact.notes || ''));
  if (!subject || !text) {
    const extra = `\n\nWHO THIS EMAIL IS FOR: ${contact.name}${contact.title ? `, ${contact.title}` : ''}${contact.notes ? `. Notes: ${String(contact.notes).slice(0, 500)}` : ''}` +
      `${connection ? '\nThis person is a personal connection or fellow alum (see the notes), not the hiring manager or recruiter. Write a warm, brief note that names the shared connection, says which role she is looking at, and asks for their perspective or a referral. Do not pitch them as if they were hiring.' : ''}` +
      `${body.instructions ? `\nDIRECTION FROM NOELLE: ${String(body.instructions).slice(0, 2000)}` : ''}`;
    const recipient: Recipient = seatOf(contact)?.recipient ?? 'hiring_manager';
    const [d] = await draftFor(job, [{ recipient, contact }], extra, job.stage === 'Saved' ? PRE_APPLY_GUIDE : GUIDE);
    subject = d.subject; text = d.body; tailored = `Staged by Noelle. ${d.tailored}`.trim();
  }
  const seat: Seat = connection ? 'other' : seatOf(contact)?.recipient ?? 'other';
  const row = (await q(
    `INSERT INTO outreach_drafts (job_id, contact_id, recipient, to_name, to_title, to_email, subject, body, tailored, status, drafted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'drafted','noelle') RETURNING id`,
    [jobId, contact.id, seat, contact.name, contact.title || '', EMAIL_RE.test(contact.email) ? contact.email : '', subject, text, tailored]))[0];
  return getDraft(row.id);
}

// ---- sending (Alexis's Send button, or Noelle through the agent API) ----

/**
 * Sends exactly what was approved. The claim is one UPDATE that only matches an approved row whose
 * current To/Subject/Body still hash to the approval, so an edit, a second click, or a retry from
 * Noelle can never send twice or send something she did not approve.
 */
export async function sendDraft(id: number, by: 'alexis' | 'noelle') {
  const d = await getDraft(id);
  if (d.status === 'sent') throw new HttpError(409, 'Already sent');
  if (d.status === 'sending') throw new HttpError(409, 'This email is being sent right now');
  if (!['approved', 'failed'].includes(d.status) || !d.approved_hash) throw new HttpError(403, 'Not approved. Alexis has to approve this email first.');
  if (!d.approval_valid) throw new HttpError(409, 'This email changed after it was approved. It needs approval again.');
  const claimed = await q(
    `UPDATE outreach_drafts SET status='sending', updated_at=now() WHERE id=$1 AND status IN ('approved','failed') AND approved_hash=$2 RETURNING id`,
    [id, d.approved_hash]);
  if (!claimed.length) throw new HttpError(409, 'This email changed or was already sent. Read it again.');
  try {
    const atts: Attachment[] = (await q(`SELECT attachments FROM outreach_drafts WHERE id=$1`, [id]))[0]?.attachments ?? [];
    if (attachDigest(atts) !== (d.attach_digest || '')) throw new HttpError(409, 'The attached files changed after approval.');
    const email = await sendEmail(d.job_id, d.to_email, d.subject, d.body, atts);
    await q(`UPDATE outreach_drafts SET status='sent', sent_at=now(), sent_by=$1, email_id=$2, error='', updated_at=now() WHERE id=$3`, [by, email.id, id]);
  } catch (e: any) {
    await q(`UPDATE outreach_drafts SET status='failed', error=$1, updated_at=now() WHERE id=$2`, [String(e?.message || 'Send failed').slice(0, 500), id]);
    throw e;
  }
  return getDraft(id);
}

/** For Needs attention: drafts waiting on her, and companies that need hand research. */
export async function outreachAttention() {
  await ensureOutreachSchema();
  return q(
    `SELECT j.id, j.company, j.company_domain, j.role_title,
            count(*) FILTER (WHERE d.status = 'drafted')::int AS to_review,
            count(*) FILTER (WHERE d.status = 'failed')::int AS failed,
            bool_or(r.status = 'needs_research') AS needs_research
       FROM jobs j JOIN lanes l ON l.id = j.lane_id
       LEFT JOIN outreach_runs r ON r.job_id = j.id
       LEFT JOIN outreach_drafts d ON d.job_id = j.id AND d.deleted_at IS NULL
      WHERE j.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL AND (r.job_id IS NOT NULL)
      GROUP BY j.id HAVING count(*) FILTER (WHERE d.status IN ('drafted','failed')) > 0 OR bool_or(r.status = 'needs_research')
      ORDER BY j.id DESC`);
}
