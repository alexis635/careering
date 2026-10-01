import { q } from './db.js';
import { HttpError, ask, libraryContext, parseJson } from './ai.js';
import { storiesContext } from './stories.js';

const fmtDate = (d: any) => (d instanceof Date ? d.toISOString() : d ? String(d) : '').slice(0, 7);

/** The candidate's own reason she fits a job, plus the experience she picked, formatted for any drafting prompt. Empty when she has not said anything. */
export async function angleContext(job: any): Promise<string> {
  const angle = String(job.angle || '').trim();
  const focus = job.angle_focus || {};
  const roleIds: number[] = (focus.roles || []).map((r: any) => Number(r.id));
  const winIds: number[] = (focus.wins || []).map(Number);
  const stories = await storiesContext();
  if (!angle && !roleIds.length && !winIds.length) return stories;
  const roles = roleIds.length ? await q(`SELECT id, employer, title, start_date, end_date FROM roles WHERE id = ANY($1) AND deleted_at IS NULL`, [roleIds]) : [];
  const wins = winIds.length ? await q(`SELECT title, employer, role, description, impact FROM wins WHERE id = ANY($1) AND deleted_at IS NULL`, [winIds]) : [];
  const lines: string[] = [
    'THE CANDIDATE\'S OWN ANGLE ON THIS JOB. This is her personal reason she fits, in her words. It is authoritative: build the document AROUND it, lead with it, and do not substitute your own idea of why she fits. ' +
      'Her words count as a source of facts, but add nothing beyond what she said and what the candidate material shows. If her angle leans on something the material does not support, use only her own wording of it and never add detail, numbers, or titles she did not give.',
  ];
  if (angle) lines.push(`HER ANGLE:\n${angle}`);
  if (roles.length) {
    lines.push('EXPERIENCE TO LEAD WITH (feature these roles first and pull from them; her note says what to pull out and what to leave alone):');
    for (const id of roleIds) {
      const r: any = roles.find((x: any) => x.id === id);
      if (r) lines.push(`- ${r.title || 'Role'} at ${r.employer} (${fmtDate(r.start_date)} to ${r.end_date ? fmtDate(r.end_date) : 'present'})${(focus.roles.find((x: any) => Number(x.id) === id)?.note || '').trim() ? `. Her note: ${focus.roles.find((x: any) => Number(x.id) === id).note.trim()}` : ''}`);
    }
  }
  if (wins.length) lines.push(`SPECIFIC WINS SHE WANTS INCLUDED:\n${wins.map((w: any) => `- ${w.title} (${[w.employer, w.role].filter(Boolean).join(', ')}): ${w.description}${w.impact ? ` Result: ${w.impact}` : ''}`).join('\n')}`);
  if (stories) lines.push(stories);
  return lines.join('\n');
}

/** One turn of the "talk it through" chat. Saves the exchange on the job. */
export async function angleChat(body: { job_id?: number; message?: string }, job: any) {
  const message = String(body.message || '').trim();
  if (!message) throw new HttpError(400, 'Say something first');
  const history: any[] = Array.isArray(job.angle_chat) ? job.angle_chat : [];
  const lib = await libraryContext();
  const wins = await q(`SELECT title, employer, role, description, impact FROM wins WHERE deleted_at IS NULL ORDER BY happened_on DESC NULLS LAST LIMIT 40`);
  const winText = wins.map((w: any) => `- ${w.title} (${[w.employer, w.role].filter(Boolean).join(', ')}): ${w.description}${w.impact ? ` Result: ${w.impact}` : ''}`).join('\n');
  const ctx = await angleContext(job);
  const out = parseJson<{ reply: string; angle?: string; unsupported?: string[] }>(
    await ask(
      'You help the candidate say, in her own terms, why she fits a job that may not be a textbook match. Her explanation is the point; you are drawing it out, not replacing it. ' +
        'Respond with ONLY a JSON object: reply (1 to 4 plain sentences: react to what she said, then ask at most 2 specific questions about the outcome, numbers, scope, or which real experience she means; if she has said enough, say what you will build around), ' +
        'angle (a first person statement of her angle, 2 to 5 sentences, using ONLY what she has told you plus facts in the material, or an empty string if you do not have enough yet), ' +
        'unsupported (string[]: things she claims that you cannot find in her wins, resume material, or her own words, each phrased as a short question like "Where did you do X? It is not in your record yet." Empty array if none). ' +
        'Never flatter and never invent experience. If a claim is a stretch, say so kindly and ask what makes it true.',
      `${job.company} | ${job.role_title}\n\nJOB POSTING:\n${String(job.posting_text || '(not added yet)').slice(0, 8000)}\n\nHONEST MATCH NOTES:\n${job.match_notes || '(none yet)'}\n\n${ctx ? `${ctx}\n\n` : ''}WINS:\n${winText || '(none)'}\n\nCANDIDATE MATERIAL:\n${lib.text}\n\nCONVERSATION SO FAR:\n${history.map((m) => `${m.role === 'user' ? 'Candidate' : 'You'}: ${m.text}`).join('\n') || '(just starting)'}\n\nCandidate: ${message}`,
      6000,
    ),
  );
  const next = [...history, { role: 'user', text: message }, { role: 'assistant', text: out.reply, angle: out.angle || '', unsupported: Array.isArray(out.unsupported) ? out.unsupported : [] }].slice(-30);
  return (await q(`UPDATE jobs SET angle_chat=$1, updated_at=now() WHERE id=$2 RETURNING *`, [JSON.stringify(next), job.id]))[0];
}
