import { q } from './db.js';
import { HttpError, ask, loadJob, parseJson, postingOrThrow } from './ai.js';
import { sanitizeSpec, slideText, type DeckSpec } from '../src/lib/deckSpec.js';

const COLS = `id, job_id, title, angle, minutes, spec, created_at, updated_at, deleted_at`;

export const listDecks = (jobId: number | null, deleted: boolean) =>
  q(`SELECT d.id, d.job_id, d.title, d.angle, d.minutes, d.spec, d.created_at, d.updated_at, d.deleted_at, j.company, j.role_title
       FROM decks d LEFT JOIN jobs j ON j.id = d.job_id
      WHERE d.deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} AND (j.id IS NULL OR j.deleted_at IS NULL) ${jobId ? 'AND d.job_id = $1' : ''} ORDER BY d.created_at DESC`, jobId ? [jobId] : []);

export async function updateDeck(id: number, b: any) {
  const spec = b.spec ? sanitizeSpec(b.spec) : null;
  return (await q(`UPDATE decks SET spec = COALESCE($2::jsonb, spec), title = COALESCE($3, title), updated_at = now() WHERE id = $1 RETURNING ${COLS}`, [id, spec ? JSON.stringify(spec) : null, b.title ? String(b.title).slice(0, 120) : null]))[0];
}
export const trashDeck = (id: number) => q(`UPDATE decks SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreDeck = async (id: number) => (await q(`UPDATE decks SET deleted_at = NULL WHERE id=$1 RETURNING ${COLS}`, [id]))[0];

const LAYOUT_HELP =
  'Each slide is an object with "layout" and "notes" (2 to 4 sentences of first person speaker notes) and these fields by layout:\n' +
  '- title: heading, subheading\n' +
  '- statement: heading (the one big idea, under 14 words), body (1 to 2 sentences)\n' +
  '- bigNumber: heading, stat {value, label} where value is ONLY the figure, at most 6 characters, such as "30%", "$75K+", or "3x" (never words), and label says what it measures (for example "increase in engagement among 5,000+ attendees"), plus body (one sentence of context) and source_win_ids\n' +
  '- list: heading, bullets (3 to 5, each under 14 words)\n' +
  '- twoColumn: heading, left {heading, bullets}, right {heading, bullets} (for example What I did and What it changed) plus source_win_ids\n' +
  '- timeline: heading, steps (exactly 3: {label, detail}) for a proposed plan\n' +
  '- closing: heading, body (what you bring and the ask, at most 2 short sentences and under 230 characters)';

const SYSTEM =
  'You build short, credible interview decks that a candidate presents live to a hiring team. Respond with ONLY a JSON object: ' +
  '{"title": string, "subtitle": string, "slides": Slide[], "check_before_sharing": string[]}.\n' +
  `${LAYOUT_HELP}\n` +
  'STRUCTURE for an interview deck: (1) title; (2) statement: the candidate\'s viewpoint on what this role really requires; (3) list: what the role needs, taken from the posting; (4 and 5) evidence slides built from the candidate\'s WINS using bigNumber or twoColumn, chosen because they match what the role needs most; (6) timeline: a PROPOSED first 90 days, clearly framed as an approach and drawn only from the posting, never as a claim of fact; (7) closing. Fewer minutes means fewer slides.\n' +
  'EVIDENCE RULES: Every number, employer, result, and title must come from a WIN or the CAREER FACTS given. Never invent achievements, clients, or outcomes. Put the ids of the wins you used in source_win_ids. The proposed plan may mention what the posting asks for, but must not state results.\n' +
  'ATTRIBUTION: Keep each evidence slide to ONE employer\'s wins. If a slide draws on more than one employer, name each employer next to its own points. Every employer named on a slide or in its speaker notes must match the employer of the win each fact came from. Never attribute one employer\'s result to another.\n' +
  'STYLE: sentence case headings under 9 words, no filler, no buzzwords, plain confident language. Never use em dashes or en dashes.\n' +
  'check_before_sharing: list every metric you used as "the figure, the employer, what it measures" so the candidate can confirm each is fine to show outside that employer.';

const NUM = /\$?\d[\d,]*(?:\.\d+)?(?:[kKmM]\+?|\+|%|x)?/g;

/** Metrics on a slide (percentages, dollars, multiples, plus signs, or 3 digit and larger figures) that appear nowhere in the evidence. */
function unsupportedNumbers(spec: DeckSpec, evidence: string): string[] {
  const norm = (s: string) => s.replace(/,/g, '').toLowerCase();
  const ev = norm(evidence);
  const bad = new Set<string>();
  for (const s of spec.slides) {
    for (const raw of slideText(s).match(NUM) ?? []) {
      const t = raw.replace(/[.,]$/, '');
      const metric = /[%$x+kKmM]/.test(t) || t.replace(/\D/g, '').length >= 3;
      if (!metric) continue;
      if (s.layout === 'timeline' && /^(30|60|90)$/.test(t.replace(/\D/g, ''))) continue;   // the 30, 60, 90 day plan is a proposal, not a claim
      if (!ev.includes(norm(t)) && !ev.includes(norm(t).replace(/\+$/, ''))) bad.add(t);
    }
  }
  return [...bad];
}

async function evidence(job: any) {
  const wins = await q(`SELECT id, title, to_char(happened_on,'Mon YYYY') AS happened, employer, role, description, impact FROM wins WHERE deleted_at IS NULL ORDER BY happened_on DESC NULLS LAST, id DESC LIMIT 40`);
  const facts = (await q(`SELECT body FROM library_items WHERE kind='bio' AND title='Career facts (source of truth)' AND deleted_at IS NULL LIMIT 1`))[0]?.body ?? '';
  if (!wins.length) throw new HttpError(400, 'Add some wins in Rise first. The deck is built from them.');
  return { wins, facts, text: JSON.stringify(wins) + facts + (job?.posting_text ?? '') + (job?.company ?? '') + (job?.role_title ?? '') };
}

/** Three angles worth presenting for this role, drawn from the posting and the wins. */
export async function deckAngles(body: { job_id?: number }) {
  const job = await loadJob(Number(body.job_id));
  const posting = postingOrThrow(job);
  const { wins } = await evidence(job);
  const out = parseJson<{ angles: { title: string; why: string }[] }>(
    await ask(
      'Suggest exactly 3 different angles for a short interview deck. An angle is a viewpoint the candidate can argue with real evidence, phrased as a sentence they could say (for example "Consistency across many sites comes from a shared system plus local voice"). Each must be supported by at least one of the candidate\'s wins and matter to the role. Respond with ONLY JSON: {"angles":[{"title": string (under 16 words), "why": string (under 20 words, naming the win it rests on)}]}.',
      `ROLE: ${job.company} ${job.role_title}\nPOSTING:\n${posting}\n\nMATCH NOTES:\n${job.match_notes || '(none)'}\n\nWINS:\n${JSON.stringify(wins)}`,
      3000,
    ),
  );
  return { angles: (out.angles ?? []).slice(0, 3).map((a) => ({ title: sanitizeSpec({ title: a.title }).title, why: String(a.why ?? '').slice(0, 160) })) };
}

/** Build a new interview deck for a job, or revise an existing one from feedback. Each result is saved as its own version. */
export async function deckRoute(b: { job_id?: number; angle?: string; minutes?: number; deck_id?: number; feedback?: string }) {
  const prev = b.deck_id ? (await q(`SELECT ${COLS} FROM decks WHERE id=$1`, [b.deck_id]))[0] : null;
  if (b.deck_id && !prev) throw new HttpError(404, 'That deck was not found');
  if (prev && !(b.feedback || '').trim()) throw new HttpError(400, 'Say what to change first');
  const job = await loadJob(Number(prev?.job_id ?? b.job_id));
  const posting = postingOrThrow(job);
  const minutes = Math.min(20, Math.max(3, Number(prev?.minutes ?? b.minutes) || 10));
  const angle = String(prev?.angle ?? b.angle ?? '').trim();
  const ev = await evidence(job);

  const input =
    `ROLE: ${job.company} | ${job.role_title} | ${job.location} ${job.remote_type}\nTIME: ${minutes} minutes, so about ${Math.max(5, Math.min(9, Math.round(minutes / 1.5)))} slides.\n` +
    `ANGLE TO ARGUE: ${angle || '(none given, so choose the strongest one the evidence supports)'}\n\nPOSTING:\n${posting}\n\nMATCH NOTES:\n${job.match_notes || '(none)'}\n\nWINS (the only evidence you may use, with ids):\n${JSON.stringify(ev.wins)}\n\nCAREER FACTS:\n${ev.facts}` +
    (prev ? `\n\nCURRENT DECK (revise it, changing only what the feedback asks):\n${JSON.stringify(prev.spec)}\n\nFEEDBACK: ${b.feedback}` : '');

  let spec = sanitizeSpec(parseJson<any>(await ask(SYSTEM, input, 9000)));
  if (spec.slides.length < 3) throw new HttpError(502, 'The AI returned an unusable deck. Please try again.');
  let bad = unsupportedNumbers(spec, ev.text);
  if (bad.length) {   // one correction pass, so an invented figure never reaches the candidate silently
    spec = sanitizeSpec(parseJson<any>(await ask(SYSTEM, `${input}\n\nYOUR PREVIOUS DRAFT USED THESE FIGURES THAT ARE NOT IN THE EVIDENCE: ${bad.join(', ')}. Rewrite the deck without them. Use only figures found in the wins, the facts, or the posting.\n\nPREVIOUS DRAFT:\n${JSON.stringify(spec)}`, 9000)));
    bad = unsupportedNumbers(spec, ev.text);
  }
  if (bad.length) spec.warnings = [`Check these figures, they were not found in your wins: ${bad.join(', ')}`];

  const root = prev ? String(prev.title).replace(/ v\d+$/, '') : `${job.company || 'Interview'} interview deck`;
  const n = (await q(`SELECT count(*)::int AS n FROM decks WHERE job_id=$1 AND (title=$2 OR title LIKE $3)`, [job.id, root, `${root} v%`]))[0].n;
  return (await q(`INSERT INTO decks (job_id, title, angle, minutes, spec) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`, [job.id, n ? `${root} v${n + 1}` : root, angle, minutes, JSON.stringify(spec)]))[0];
}
