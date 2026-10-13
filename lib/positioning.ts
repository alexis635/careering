import { q } from './db.js';
import { noDash } from '../src/lib/noDash.js';
import { HttpError, askJson } from './ai.js';

/**
 * Positioning: the match step works as her advocate. It maps every requirement in a posting to her real
 * experience (met, transferable, or a true gap), writes a senior headline, rates fit as positioned, and
 * separately says how much of a reach the role is. Tools named in a posting are confirmed by her case by case;
 * once she confirms one it is remembered for every later job.
 */

export type ToolAnswer = { name: string; used: boolean | null };
export type Requirement = { requirement: string; status: 'met' | 'transferable' | 'gap'; proof: string; say_it: string };
export type Positioning = {
  real_posting: boolean; headline: string; summary: string; requirements: Requirement[];
  reach: 'in reach' | 'stretch' | 'big stretch' | ''; reach_reason: string; rated_at: string;
};

const TOOLS_TITLE = 'Tools I have used (confirmed)';

let ensured = false;
export async function ensurePositioningColumns() {
  if (ensured) return;
  await q(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS positioning JSONB`);
  await q(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'`);
  ensured = true;
}

const key = (s: string) => s.trim().toLowerCase();

/** Her confirmed tools live in one Library bio so every AI prompt sees them with the rest of her material. */
async function toolsItem() {
  return (await q(`SELECT id, body FROM library_items WHERE kind='bio' AND title=$1 AND deleted_at IS NULL ORDER BY id LIMIT 1`, [TOOLS_TITLE]))[0] as { id: number; body: string } | undefined;
}
export async function confirmedTools(): Promise<string[]> {
  const it = await toolsItem();
  if (!it) return [];
  return it.body.split('\n').map((l) => l.replace(/^[-\s]+/, '').trim()).filter((l) => l && !l.endsWith(':'));
}
async function rememberTool(name: string) {
  const have = await confirmedTools();
  if (have.some((t) => key(t) === key(name))) return;
  const list = [...have, name.trim()].sort((a, b) => a.localeCompare(b));
  const body = `Tools and platforms she has confirmed using (list these on resumes when a posting asks for them):\n${list.map((t) => `- ${t}`).join('\n')}`;
  const it = await toolsItem();
  if (it) await q(`UPDATE library_items SET body=$1, updated_at=now() WHERE id=$2`, [body, it.id]);
  else await q(`INSERT INTO library_items (kind, title, body, tags) VALUES ('bio', $1, $2, $3)`, [TOOLS_TITLE, body, ['facts', 'tools']]);
}

/** She answers "I have used this" or "not yet" for one tool on one job. A yes is remembered for every job. */
export async function answerTool(jobId: number, name: string, used: boolean | null) {
  await ensurePositioningColumns();
  if (!name?.trim()) throw new HttpError(400, 'Tool name required');
  const job = (await q(`SELECT tools FROM jobs WHERE id=$1`, [jobId]))[0];
  if (!job) throw new HttpError(404, 'Job not found');
  const tools: ToolAnswer[] = Array.isArray(job.tools) ? job.tools : [];
  const i = tools.findIndex((t) => key(t.name) === key(name));
  if (i >= 0) tools[i] = { ...tools[i], used }; else tools.push({ name: name.trim(), used });
  if (used) await rememberTool(name);
  return (await q(`UPDATE jobs SET tools=$1, updated_at=now() WHERE id=$2 RETURNING *`, [JSON.stringify(tools), jobId]))[0];
}

/** Prompt block for drafting: which posting tools may go on the resume, and which must stay off. */
export async function toolsBlock(job: any): Promise<string> {
  await ensurePositioningColumns();
  const fresh = (await q(`SELECT tools, positioning FROM jobs WHERE id=$1`, [job.id]))[0] || {};
  const tools: ToolAnswer[] = Array.isArray(fresh.tools) ? fresh.tools : [];
  const parts: string[] = [];
  const yes = tools.filter((t) => t.used).map((t) => t.name);
  const no = tools.filter((t) => !t.used).map((t) => t.name);
  if (yes.length) parts.push(`TOOLS FROM THIS POSTING SHE HAS USED (name these in the skills section): ${yes.join(', ')}`);
  if (no.length) parts.push(`TOOLS FROM THIS POSTING SHE HAS NOT CONFIRMED (never list these as skills; if it helps, show she adopts new platforms quickly by naming a similar tool she has used): ${no.join(', ')}`);
  const p: Positioning | null = fresh.positioning;
  if (p?.requirements?.length) {
    parts.push(
      `POSITIONING FOR THIS ROLE (how each requirement maps to her real experience; use it to choose and word her strongest proof):\nHeadline: ${p.headline}\n` +
        p.requirements.map((r) => `- [${r.status}] ${r.requirement}${r.proof ? `: ${r.proof}` : ''}${r.say_it ? ` (say it: ${r.say_it})` : ''}`).join('\n'),
    );
  }
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

const MATCH_SYSTEM =
  'You are her career advocate and an honest recruiter in one. Show how her REAL experience answers this posting so she is seen as the strongest candidate, and tell her the truth about reach. ' +
  'Answer with the answer tool, using these fields:\n' +
  'real_posting (boolean: false when the text is a careers page, a list of jobs, or has no actual description and requirements for one role),\n' +
  'headline (a senior resume headline for this role, under 10 words, built only from her real experience),\n' +
  'summary (3 to 4 sentences: why she is a strong candidate in terms of the posting\'s top needs, then the one or two things to address),\n' +
  'requirements (array, one per must-have requirement in the posting, at most 12, each {requirement, status, proof, say_it}: status is exactly "met", "transferable", or "gap"; proof names the real employer or project and its real numbers, empty for a gap; say_it is one line on how to word it on her resume or letter in the posting\'s own language, or for a gap how to address it honestly),\n' +
  'tools (string[]: every named software, platform, or tool the posting asks for, short names only),\n' +
  'fit (exactly "strong", "moderate", or "weak": her fit once positioned. strong = nearly every requirement met or transferable with solid proof; moderate = most are; weak = several core requirements are true gaps),\n' +
  'reach (exactly "in reach", "stretch", or "big stretch": how the role\'s level and specialty compare to hers), reach_reason (one sentence),\n' +
  'suggested_resume_id (number id of the best RESUME VERSION as shown in [#id], or null).\n\n' +
  'HOW TO JUDGE:\n' +
  '- She is a senior professional. Use her total years from the CAREER FACTS. Judge seniority by scope shown in the material (direct reports, budgets owned, schools or people reached, revenue, national brands), never by job titles alone.\n' +
  '- Her WarnerMedia and Showtime work is professional experience. Judge it by what she delivered. Never call it internship level, junior, or too old.\n' +
  '- "transferable" means her real experience does the same work in a different setting (for example media pitching and community outreach for a PR requirement, or running a 20 creator influencer program for creator management). Be generous where the proof is real, never where it is not.\n' +
  '- Leave out physical demands, schedule, location, travel, and benefits boilerplate; they are not requirements to map.\n' +
  '- Tools and software are never a gap. List them in tools only; she confirms them case by case.\n' +
  '- Industry is rarely a core requirement. Do not mark a requirement as a gap only because her work was in a different industry when the work itself matches.\n' +
  '- If real_posting is false, set fit to null, requirements to [], and say in the summary that the link has no job description to rate.\n' +
  '- Rate fit ONLY on the candidate material, never on her angle.';

const str = { type: 'string' };
const MATCH_SCHEMA = {
  properties: {
    real_posting: { type: 'boolean' }, headline: str, summary: str,
    requirements: { type: 'array', items: { type: 'object', properties: { requirement: str, status: { type: 'string', enum: ['met', 'transferable', 'gap'] }, proof: str, say_it: str }, required: ['requirement', 'status', 'proof', 'say_it'] } },
    tools: { type: 'array', items: str },
    fit: { type: ['string', 'null'], enum: ['strong', 'moderate', 'weak', null] },
    reach: { type: 'string', enum: ['in reach', 'stretch', 'big stretch', ''] }, reach_reason: str,
    suggested_resume_id: { type: ['number', 'null'] }, angle_read: str,
  },
  required: ['real_posting', 'headline', 'summary', 'requirements', 'tools', 'fit', 'reach', 'reach_reason', 'suggested_resume_id'],
};

/** The match step: positions her for the role, rates fit as positioned, and records the tools the posting asks for. */
export async function matchJob(job: any, posting: string, lib: { text: string; resumes: any[] }, angleBlock: string) {
  await ensurePositioningColumns();
  const out = await askJson<any>(
      MATCH_SYSTEM +
        (job.angle?.trim() ? '\nAlso include angle_read (3 to 5 sentences): an honest read of her stated angle. Which parts the material backs up, which parts are only her own word or are not in her record yet and what to add to make them defensible, and how well the angle answers the posting\'s top needs. Be kind and straight.' : ''),
      `Company: ${job.company}\nRole: ${job.role_title}\n\nJOB POSTING:\n${posting}\n\nCANDIDATE MATERIAL:\n${lib.text}${angleBlock}`,
      MATCH_SCHEMA,
      12000,
  );
  const real = out.real_posting !== false;
  const reqs: Requirement[] = (Array.isArray(out.requirements) ? out.requirements : [])
    .filter((r: any) => r && r.requirement)
    .map((r: any) => ({
      requirement: noDash(String(r.requirement)),
      status: ['met', 'transferable', 'gap'].includes(r.status) ? r.status : 'gap',
      proof: noDash(String(r.proof || '')),
      say_it: noDash(String(r.say_it || '')),
    }));
  const positioning: Positioning = {
    real_posting: real,
    headline: noDash(String(out.headline || '')),
    summary: noDash(String(out.summary || '')),
    requirements: real ? reqs : [],
    reach: real && ['in reach', 'stretch', 'big stretch'].includes(out.reach) ? out.reach : '',
    reach_reason: real ? noDash(String(out.reach_reason || '')) : '',
    rated_at: new Date().toISOString(),
  };
  const fit = real && ['strong', 'moderate', 'weak'].includes(out.fit) ? out.fit : null;

  // Tools: keep her earlier answers, pre-check anything she has already confirmed on another job.
  const known = (await confirmedTools()).map(key);
  const prev: ToolAnswer[] = Array.isArray(job.tools) ? job.tools : [];
  const tools: ToolAnswer[] = [...prev];
  for (const t of (Array.isArray(out.tools) ? out.tools : []).map((x: any) => String(x).trim()).filter(Boolean)) {
    if (!tools.some((p) => key(p.name) === key(t))) tools.push({ name: t, used: known.includes(key(t)) ? true : null });
  }

  const group = (s: Requirement['status'], label: string, withSay: boolean) => {
    const list = positioning.requirements.filter((r) => r.status === s);
    return list.length ? `\n\n${label}:\n${list.map((r) => `- ${r.requirement}${r.proof ? `: ${r.proof}` : ''}${withSay && r.say_it ? ` (${s === 'gap' ? 'how to address' : 'say it'}: ${r.say_it})` : ''}`).join('\n')}` : '';
  };
  const notes = real
    ? `${positioning.summary}${positioning.reach ? `\n\nReach: ${positioning.reach}. ${positioning.reach_reason}` : ''}${positioning.headline ? `\nHeadline to use: ${positioning.headline}` : ''}` +
      group('met', 'Strengths', false) + group('transferable', 'Transferable experience', true) + group('gap', 'Gaps', true)
    : positioning.summary || 'This link has no job description to rate. Paste the posting text on the Overview tab and analyze again.';
  const valid = lib.resumes.some((r: any) => r.id === out.suggested_resume_id);

  return (
    await q(
      `UPDATE jobs SET match_notes=$1, resume_version_id=COALESCE($2, resume_version_id), fit=$3, angle_check=$5, positioning=$6, tools=$7, updated_at=now() WHERE id=$4 RETURNING *`,
      [notes, valid ? out.suggested_resume_id : null, fit, job.id, job.angle?.trim() ? noDash(String(out.angle_read || '')) : '', JSON.stringify(positioning), JSON.stringify(tools)],
    )
  )[0];
}
