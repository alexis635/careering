import { q } from './db.js';
import { HttpError, ask, libraryContext, parseJson } from './ai.js';
import { angleContext } from './angle.js';
import { noDash } from '../src/lib/noDash.js';

let ensured = false;
/** Adds the advisor columns the first time anything needs them, so no manual migration step is required. */
export async function ensureAdvisorColumns() {
  if (ensured) return;
  await q(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS advisor_chat JSONB NOT NULL DEFAULT '[]'`);
  await q(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS advisor_notes TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS advisor_tone TEXT NOT NULL DEFAULT ''`);
  ensured = true;
}

const clip = (s: any, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Everything the candidate has settled for this one role, in one block: her angle, what she told the advisor,
 * her tone, the people, and the recent advisor conversation. Every draft (resume, letter, emails, prep) gets this,
 * so the whole role reads as one story instead of separate guesses.
 */
export async function jobBrief(job: any): Promise<string> {
  await ensureAdvisorColumns();
  const fresh = (await q(`SELECT advisor_chat, advisor_notes, advisor_tone FROM jobs WHERE id=$1`, [job.id]))[0] || {};
  const parts: string[] = [];
  const angle = await angleContext(job);
  if (angle) parts.push(angle);

  const tone = String(fresh.advisor_tone || '').trim();
  if (tone) parts.push(`TONE SHE WANTS FOR THIS ROLE (applies to the letter and every email, and to how the resume summary sounds): ${tone}`);
  const notes = String(fresh.advisor_notes || '').trim();
  if (notes) parts.push(`WHAT SHE HAS TOLD HER CAREER ADVISOR ABOUT THIS ROLE (her words, treat as facts she stated; add nothing beyond them):\n${notes}`);

  const people = await q(`SELECT name, title, email, notes FROM job_contacts WHERE job_id=$1 AND deleted_at IS NULL ORDER BY id`, [job.id]);
  if (people.length) {
    parts.push(
      'PEOPLE CONNECTED TO THIS ROLE (use their title to judge what each cares about and how formal to be; their notes are what she knows about them. Never invent personal facts, shared history, or things they said):\n' +
        people.map((p: any) => `- ${p.name}${p.title ? `, ${p.title}` : ''}${p.notes ? `. Notes: ${clip(p.notes, 500)}` : ''}`).join('\n'),
    );
  }

  const chat: any[] = Array.isArray(fresh.advisor_chat) ? fresh.advisor_chat : [];
  if (chat.length) {
    parts.push(`RECENT ADVISOR CONVERSATION (decisions made there should carry into this draft):\n${chat.slice(-10).map((m) => `${m.role === 'user' ? 'Candidate' : 'Advisor'}: ${clip(m.text, 600)}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

export const ADVISOR_KINDS = ['resume', 'cover_letter', 'outreach', 'follow_up', 'thank_you', 'prep'] as const;

/** One turn with the role's career advisor. Saves the exchange, anything she asked it to remember, and her tone. */
export async function advisorChat(body: { message?: string; tone?: string }, job: any) {
  await ensureAdvisorColumns();
  // Tone can be set alone from the chips, without a message.
  if (typeof body.tone === 'string' && !String(body.message || '').trim()) {
    return (await q(`UPDATE jobs SET advisor_tone=$1, updated_at=now() WHERE id=$2 RETURNING *`, [noDash(body.tone.trim().slice(0, 300)), job.id]))[0];
  }
  const message = String(body.message || '').trim();
  if (!message) throw new HttpError(400, 'Say something first');

  const row = (await q(`SELECT advisor_chat, advisor_notes, advisor_tone FROM jobs WHERE id=$1`, [job.id]))[0];
  const history: any[] = Array.isArray(row.advisor_chat) ? row.advisor_chat : [];
  const lib = await libraryContext();
  const [wins, docs, emails, people] = await Promise.all([
    q(`SELECT title, employer, role, description, impact FROM wins WHERE deleted_at IS NULL ORDER BY happened_on DESC NULLS LAST LIMIT 40`),
    q(`SELECT id, kind, title, version, left(body, 1500) AS body FROM job_documents WHERE job_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 6`, [job.id]),
    q(`SELECT direction, subject, left(body, 500) AS body FROM job_emails WHERE job_id=$1 ORDER BY sent_at DESC LIMIT 5`, [job.id]),
    q(`SELECT id, name, title, email, notes FROM job_contacts WHERE job_id=$1 AND deleted_at IS NULL ORDER BY id`, [job.id]),
  ]);
  const brief = await jobBrief(job);
  const winText = wins.map((w: any) => `- ${w.title} (${[w.employer, w.role].filter(Boolean).join(', ')}): ${w.description}${w.impact ? ` Result: ${w.impact}` : ''}`).join('\n');

  const out = parseJson<{ reply: string; remember?: string[]; tone?: string; angle?: string; suggestions?: any[] }>(
    await ask(
      'You are the candidate\'s personal career advisor for ONE role. You know the posting, her record, the people tied to the role, her angle, and every draft so far. ' +
        'Talk with her like a sharp, warm advisor: help her work out her fit, her story, what to emphasize, and how to approach each person. When she asks about a person, reason from their title, notes, and the posting about what someone in that seat usually looks for, and say plainly when that is an inference rather than something known. Never invent facts about people. ' +
        'Her experience claims must come from her record or her own words; if something is not supported, say so kindly and ask. Do not flatter. Keep replies short (2 to 6 sentences) and ask at most 2 questions. ' +
        'Respond with ONLY a JSON object with keys: ' +
        'reply (string); ' +
        'remember (string[]: durable facts, decisions, or emphasis she just told you that every draft should honor, each one short, in her words; [] if nothing new); ' +
        'tone (string: only if she stated a tone preference this turn, such as "warm and conversational, not stiff"; otherwise ""); ' +
        'angle (string: a first person 2 to 5 sentence statement of why she fits, only when you now have enough from her to write it using only her words and her record; otherwise ""); ' +
        'suggestions (array, at most 3, only when she has said enough for a draft to be worthwhile or she asked for one: each {kind: one of "resume","cover_letter","outreach","follow_up","thank_you","prep", label: short button text, contact_id: number id from PEOPLE when the item is an email to a specific person otherwise null, instructions: one or two sentences of direction for the draft that reflect what you two decided}). ' +
        'Do not write the drafts here; the suggestions are one click buttons that generate them.',
      `${job.company} | ${job.role_title}\n\nJOB POSTING:\n${String(job.posting_text || '(not added yet)').slice(0, 8000)}\n\nHONEST MATCH NOTES:\n${job.match_notes || '(none yet)'}\n\n` +
        `PEOPLE (with ids):\n${people.map((p: any) => `[id ${p.id}] ${p.name}${p.title ? `, ${p.title}` : ''}${p.email ? ` <${p.email}>` : ''}${p.notes ? `. Notes: ${clip(p.notes, 400)}` : ''}`).join('\n') || '(no people added yet)'}\n\n` +
        `${brief ? `${brief}\n\n` : ''}DRAFTS SO FAR:\n${docs.map((d: any) => `[${d.kind} v${d.version}] ${d.title}\n${d.body}`).join('\n\n') || '(none yet)'}\n\n` +
        `EMAILS SO FAR:\n${emails.map((e: any) => `[${e.direction}] ${e.subject}\n${e.body}`).join('\n\n') || '(none)'}\n\nWINS:\n${winText || '(none)'}\n\nCANDIDATE MATERIAL:\n${lib.text}\n\n` +
        `CONVERSATION SO FAR:\n${history.map((m) => `${m.role === 'user' ? 'Candidate' : 'You'}: ${m.text}`).join('\n') || '(just starting)'}\n\nCandidate: ${message}`,
      6000,
    ),
  );

  const personIds = new Set(people.map((p: any) => p.id));
  const suggestions = (Array.isArray(out.suggestions) ? out.suggestions : [])
    .filter((s: any) => (ADVISOR_KINDS as readonly string[]).includes(s?.kind))
    .slice(0, 3)
    .map((s: any) => ({ kind: s.kind, label: clip(s.label, 60) || s.kind, contact_id: personIds.has(Number(s.contact_id)) ? Number(s.contact_id) : null, instructions: clip(s.instructions, 500) }));
  const next = [
    ...history,
    { role: 'user', text: message },
    { role: 'assistant', text: out.reply, angle: out.angle ? noDash(String(out.angle)) : '', suggestions },
  ].slice(-40);

  const remembered = (Array.isArray(out.remember) ? out.remember : []).map((r) => clip(r, 300)).filter(Boolean);
  const oldNotes = String(row.advisor_notes || '').trim();
  const newNotes = [oldNotes, ...remembered.filter((r) => !oldNotes.toLowerCase().includes(r.toLowerCase()))].filter(Boolean).map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n').slice(-4000);
  const tone = typeof out.tone === 'string' && out.tone.trim() ? noDash(out.tone.trim().slice(0, 300)) : row.advisor_tone;
  return (
    await q(`UPDATE jobs SET advisor_chat=$1, advisor_notes=$2, advisor_tone=$3, updated_at=now() WHERE id=$4 RETURNING *`, [JSON.stringify(next), noDash(newNotes), tone || '', job.id])
  )[0];
}
