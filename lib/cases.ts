import { q } from './db.js';
import { HttpError, ask } from './ai.js';

const PURPOSES: Record<string, { label: string; focus: string }> = {
  promotion: { label: 'Promotion', focus: 'Emphasize growth in scope and responsibility, leadership, initiative beyond the current title, and readiness for the next level.' },
  raise: { label: 'Raise', focus: 'Emphasize the value already delivered (revenue, savings, growth, retention) and why compensation should reflect it. Advise bringing researched market pay for the role and location, but never state a market figure yourself.' },
  review: { label: 'Performance review', focus: 'Write a look back summary of the period: what was accomplished, the measurable results, and what to set up next. A tone of ownership and momentum.' },
};

const FORMAT =
  'Write a case document in EXACTLY this plain-text layout (no code fences, no commentary):\n' +
  'Line 1: the candidate\'s full name. Line 2: a headline such as "Case for promotion to Senior Manager" (use the target if one is given). Line 3: one contact line (email · phone) from the CAREER FACTS. Never add a location.\n' +
  '## SUMMARY\nThree sentences: who the candidate is, what is being asked for, and the single strongest piece of evidence.\n' +
  '## IMPACT\nGroup the wins into 3 or 4 themes. Each theme is one line "### Theme title | Period" followed by bullets starting "- " that state what was done and the measurable result, using the exact numbers.\n' +
  '## GROWTH BEYOND THE CURRENT ROLE\nOnly if the wins show real scope, leadership, or initiative. Bullets. Omit this section if they do not.\n' +
  '## THE ASK\n2 to 3 sentences on what is requested and why now, tied to the evidence. Never state a salary figure or percentage unless the user\'s TARGET already contains one.\n' +
  '## TALKING POINTS\n5 to 7 short bullets to say out loud in the conversation.\n' +
  '## LIKELY QUESTIONS AND ANSWERS\n3 or 4 items, each "### The question" then 1 or 2 bullets with an answer built from the wins.\n' +
  '## EVIDENCE TO GATHER\n3 bullets naming proof to collect before the conversation (for example kudos emails, dashboards, before and after numbers) for the claims that have the thinnest support.\n' +
  'VOICE AND LENGTH: Write in the FIRST PERSON as the candidate ("I designed", "my results"), because this document is used in the candidate\'s own conversation. Keep the whole document under 700 words.\n' +
  'EMPLOYER FOCUS: If an EMPLOYER is given, build the IMPACT section from wins at that employer. Wins from other employers may appear only as a short supporting line or two (no more than 3 bullets in total) showing readiness and range, never as the main evidence.\n' +
  'NO STRETCHING: Never claim a result caused an outcome the win does not state (for example, do not say an enrollment gain improved retention or saved money unless a win says so). Never infer workload, hours, or circumstances that are not written in a win. If the user\'s CONTEXT names something their manager cares about, connect to it only by saying what evidence exists, and put how to measure the missing link under EVIDENCE TO GATHER.\n' +
  'PRESENTABLE: Everything except the final EVIDENCE TO GATHER section may be shown to the candidate\'s manager, so it must read as confident and factual. Never put apologies, admissions of missing data, or doubts in SUMMARY, IMPACT, THE ASK, TALKING POINTS, or the answers. Put every gap only in EVIDENCE TO GATHER. Theme titles must plainly describe the work, never mention what the manager cares about. Answer likely questions with what the wins support and stop there.\n' +
  'RULES: Use ONLY the wins provided. Every number, employer, and title must come from a win or the CAREER FACTS. Never invent achievements, feedback, praise, or things a manager said. If a claim has thin evidence, leave it out and list what proof to gather instead.';

export const listCases = (deleted: boolean) =>
  q(`SELECT id, title, purpose, employer, params, body, created_at, updated_at, deleted_at FROM career_cases WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY created_at DESC`);
export const updateCase = async (id: number, b: any) =>
  (await q(`UPDATE career_cases SET body = COALESCE($2, body), title = COALESCE($3, title), updated_at = now() WHERE id=$1 RETURNING *`, [id, b.body ?? null, b.title ?? null]))[0];
export const trashCase = (id: number) => q(`UPDATE career_cases SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreCase = async (id: number) => (await q(`UPDATE career_cases SET deleted_at = NULL WHERE id=$1 RETURNING *`, [id]))[0];

type Body = { purpose?: string; employer?: string; current_role?: string; target?: string; from?: string; to?: string; win_ids?: number[]; context?: string; case_id?: number; feedback?: string };

/** Build a promotion, raise, or review case from the wins the user picked. Every generation and revision is saved as its own version. */
export async function caseRoute(b: Body) {
  const prev = b.case_id ? (await q(`SELECT * FROM career_cases WHERE id=$1`, [b.case_id]))[0] : null;
  if (b.case_id && !prev) throw new HttpError(404, 'That case was not found');
  const params: Body = prev ? { ...prev.params } : { purpose: b.purpose, employer: b.employer, current_role: b.current_role, target: b.target, from: b.from, to: b.to, win_ids: b.win_ids, context: b.context };
  const purpose = PURPOSES[params.purpose || ''] ? (params.purpose as string) : 'promotion';
  const ids = (params.win_ids ?? []).map(Number).filter(Boolean);
  if (!ids.length) throw new HttpError(400, 'Pick at least one win to build the case from');
  if (prev && !(b.feedback || '').trim()) throw new HttpError(400, 'Say what to change first');

  const wins = await q(
    `SELECT title, to_char(happened_on,'Mon YYYY') AS happened, employer, role, description, impact, category, proof_url FROM wins WHERE id = ANY($1) AND deleted_at IS NULL ORDER BY happened_on NULLS LAST`, [ids]);
  if (!wins.length) throw new HttpError(400, 'Those wins could not be found');
  const facts = (await q(`SELECT body FROM library_items WHERE kind='bio' AND title='Career facts (source of truth)' LIMIT 1`))[0]?.body ?? '';

  const text = await ask(
    `${FORMAT}\n\nPURPOSE: ${PURPOSES[purpose].label}. ${PURPOSES[purpose].focus}${prev ? '\n\nRevise the CURRENT CASE below according to the feedback. Change only what the feedback asks for and keep the same layout and rules.' : ''}`,
    `${prev ? `CURRENT CASE:\n${prev.body}\n\nFEEDBACK: ${b.feedback}\n\n` : ''}EMPLOYER: ${params.employer || '(not given)'}\nCURRENT ROLE: ${params.current_role || '(not given)'}\nTARGET / ASK: ${params.target || '(not given)'}\nPERIOD COVERED: ${params.from || 'start'} to ${params.to || 'now'}\n${params.context ? `CONTEXT FROM THE USER: ${params.context}\n` : ''}\nWINS (the only evidence you may use):\n${JSON.stringify(wins, null, 1)}\n\nCAREER FACTS (name, contact, titles, dates):\n${facts}`,
    9000,
  );

  const label = `${PURPOSES[purpose].label} case${params.employer ? `, ${params.employer}` : ''}`;
  const root = prev ? String(prev.title).replace(/ v\d+$/, '') : label;
  const n = (await q(`SELECT count(*)::int AS n FROM career_cases WHERE title = $1 OR title LIKE $2`, [root, `${root} v%`]))[0].n;
  return (
    await q(`INSERT INTO career_cases (title, purpose, employer, params, body) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [n ? `${root} v${n + 1}` : root, purpose, params.employer ?? '', JSON.stringify({ ...params, purpose }), text])
  )[0];
}
