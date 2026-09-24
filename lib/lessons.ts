import { q } from './db.js';
import { HttpError, ask, parseJson } from './ai.js';
import { sanitizePlan, type LessonPlan } from '../src/lib/lessonSpec.js';
import { noDash } from '../src/lib/noDash.js';

const COLS = `id, workspace_id, course_id, unit_id, title, params, plan, created_at, updated_at, deleted_at`;
const NUM = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export const STANDARD_SETS: Record<string, string> = {
  louisiana: 'Louisiana Student Standards for the subject and grade (ELA, math, science, or social studies)',
  ccss: 'Common Core State Standards (ELA and literacy, or math) for the grade',
  ngss: 'Next Generation Science Standards',
  arts: 'National Core Arts Standards (music, theatre, media arts, visual arts, dance)',
  none: 'no formal standards: write clear learning objectives only, and leave the standards list empty',
};

export const listLessons = (workspaceId: number | null, deleted: boolean) =>
  q(`SELECT ${COLS} FROM lesson_plans WHERE deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ${workspaceId ? 'AND workspace_id = $1' : ''} ORDER BY updated_at DESC`, workspaceId ? [workspaceId] : []);
export async function updateLesson(id: number, b: any) {
  const plan = b.plan ? sanitizePlan(b.plan) : null;
  return (await q(`UPDATE lesson_plans SET plan = COALESCE($2::jsonb, plan), title = COALESCE($3, title),
      course_id = CASE WHEN $4::boolean THEN $5::int ELSE course_id END, unit_id = CASE WHEN $6::boolean THEN $7::int ELSE unit_id END, updated_at = now()
    WHERE id=$1 RETURNING ${COLS}`,
    [id, plan ? JSON.stringify(plan) : null, b.title ? noDash(String(b.title)).slice(0, 140) : (plan?.title || null), 'course_id' in b, NUM(b.course_id), 'unit_id' in b, NUM(b.unit_id)]))[0];
}
export const trashLesson = (id: number) => q(`UPDATE lesson_plans SET deleted_at = now() WHERE id=$1`, [id]);
export const restoreLesson = async (id: number) => (await q(`UPDATE lesson_plans SET deleted_at = NULL WHERE id=$1 RETURNING ${COLS}`, [id]))[0];

const SYSTEM = `You are a master teacher and curriculum designer writing a complete, classroom-ready lesson plan that veteran teachers, new teachers, and school administrators would all respect. Be specific and concrete: name the actual texts, prompts, examples, questions, and moves. Never write filler like "discuss the topic".

Respond with ONLY a JSON object:
{
 "title": string, "subject": string, "grade": string, "minutes": number, "unit": string,
 "standards": [{"code": string, "text": string}],
 "big_idea": string (an essential question students can wrestle with),
 "objectives": string[] (2 to 4, "Students will be able to ..." each measurable),
 "vocabulary": [{"term": string, "meaning": string (student friendly)}],
 "materials": string[], "prep": string[] (what the teacher does BEFORE class),
 "hook": string (the opening 3 to 7 minutes, word for word what to say or show),
 "segments": [{"title": string, "minutes": number, "mode": one of "Hook"|"I do"|"We do"|"You do"|"Discuss"|"Workshop"|"Assess"|"Closure", "teacher": string (what the teacher says and does, with sample questions and prompts), "students": string (what students are doing), "tips": string (pacing, common misconceptions, what to watch for)}],
 "differentiation": {"support": string[], "extension": string[], "multilingual": string[], "accommodations": string[]},
 "assessment": {"formative": string[] (checks for understanding built into the lesson), "exit_ticket": string, "rubric": [{"criterion": string, "levels": [string, string, string, string]}] (levels from beginning to exceeding)},
 "closure": string, "exemplar": string (a strong model response or sample the teacher can show, written the way a student at this level could write it, or a mentor text excerpt idea), "homework": string (optional, empty if none)
}
RULES:
- Segment minutes MUST add up to exactly the total lesson minutes.
- The whole plan must be teachable by someone who has not seen it before.
- STANDARDS: cite a standard code ONLY if you are confident it is a real code in the chosen set; otherwise leave code empty and paraphrase the skill. Never invent a code. The teacher will verify them.
- Never include real student names, grades, IEP or 504 details, or any personal student information. Use "a student" or generic examples.
- Do not quote long passages from copyrighted texts: name the text and describe or paraphrase.
- Do not invent facts about the teacher or the school. Use only what you are given.
- Never use em dashes or en dashes. Use commas, periods, colons, or the word "to".`;

const SUB_SYSTEM = `You write a SUBSTITUTE-READY handout for an existing lesson plan, for a substitute teacher who has never met the class and may not know the subject. Respond with ONLY JSON: {"overview": string (what happens in this class period, in plain words, 3 to 5 sentences), "routine": string (a numbered, minute by minute script, ONE STEP PER LINE separated by newline characters the sub can follow, using the plan's segments), "if_done_early": string (a specific meaningful extension activity), "behavior": string (calm, practical classroom management guidance for this activity), "emergency": string (what to do if something goes wrong: a fallback activity, who to contact in general terms)}. No student names, no invented school details. Never use em dashes or en dashes.`;

/** Generate a new lesson plan, revise one from feedback, or build its substitute version. Each generation is saved. */
export async function lessonRoute(b: any) {
  const prev = b.lesson_id ? (await q(`SELECT ${COLS} FROM lesson_plans WHERE id=$1`, [b.lesson_id]))[0] : null;
  if (b.lesson_id && !prev) throw new HttpError(404, 'That lesson plan was not found');
  const wsId = Number(prev?.workspace_id ?? b.workspace_id);
  const ws = (await q(`SELECT w.responsibilities, r.employer, r.title FROM workspaces w JOIN roles r ON r.id=w.role_id WHERE w.id=$1`, [wsId]))[0];
  if (!ws) throw new HttpError(404, 'Workspace not found');

  const courseId = NUM(b.course_id ?? prev?.course_id), unitId = NUM(b.unit_id ?? prev?.unit_id);
  const course = courseId ? (await q(`SELECT title, body, extra FROM ws_items WHERE id=$1 AND kind='course'`, [courseId]))[0] : null;
  const unit = unitId ? (await q(`SELECT title, body FROM ws_items WHERE id=$1 AND kind='unit'`, [unitId]))[0] : null;

  if (b.mode === 'sub') {
    if (!prev) throw new HttpError(400, 'Open a lesson plan first');
    const plan = prev.plan as LessonPlan;
    const out = parseJson<any>(await ask(SUB_SYSTEM, `LESSON PLAN:\n${JSON.stringify(plan)}`, 6000));
    const next = sanitizePlan({ ...plan, sub_notes: out });
    return (await q(`UPDATE lesson_plans SET plan=$2::jsonb, updated_at=now() WHERE id=$1 RETURNING ${COLS}`, [prev.id, JSON.stringify(next)]))[0];
  }

  const p = { topic: String(b.topic ?? prev?.params?.topic ?? '').trim(), grade: String(b.grade ?? prev?.params?.grade ?? '').trim(), subject: String(b.subject ?? prev?.params?.subject ?? '').trim(),
    minutes: Math.min(240, Math.max(10, Number(b.minutes ?? prev?.params?.minutes) || 45)), standards: String(b.standards ?? prev?.params?.standards ?? 'none'), focus: String(b.focus ?? prev?.params?.focus ?? '').trim() };
  if (!prev && !p.topic) throw new HttpError(400, 'What is the lesson about?');
  if (prev && !String(b.feedback ?? '').trim()) throw new HttpError(400, 'Say what to change first');
  const set = STANDARD_SETS[p.standards] ?? STANDARD_SETS.none;

  const input = `TOTAL MINUTES: ${p.minutes}\nTOPIC: ${p.topic || '(same as the current plan)'}\nSUBJECT: ${p.subject || course?.extra?.subject || '(infer from the topic)'}\nGRADE OR LEVEL: ${p.grade || course?.extra?.grade || '(infer, or mixed levels)'}\nSTANDARDS TO ALIGN TO: ${set}\n` +
    `STYLE OR FOCUS: ${p.focus || '(none)'}\n\nCOURSE: ${course ? `${course.title}. ${course.body}` : '(none)'}\nUNIT: ${unit ? `${unit.title}. ${unit.body}` : '(none)'}\nTEACHER CONTEXT: ${ws.title} at ${ws.employer}. ${ws.responsibilities || ''}` +
    (prev ? `\n\nCURRENT PLAN (revise it, changing only what the feedback asks, keeping segment minutes summing to ${p.minutes}):\n${JSON.stringify(prev.plan)}\n\nFEEDBACK: ${b.feedback}` : '');
  const plan = sanitizePlan(parseJson<any>(await ask(SYSTEM, input, 12000)));
  if (plan.segments.length < 2 || !plan.objectives.length) throw new HttpError(502, 'The AI returned an incomplete lesson plan. Please try again.');
  const total = plan.segments.reduce((n, s) => n + s.minutes, 0);
  if (total !== plan.minutes) plan.minutes = total;   // the schedule is the truth; never show a plan whose parts disagree with its length
  if (prev?.plan?.sub_notes && !plan.sub_notes) plan.sub_notes = null;

  const root = prev ? String(prev.title).replace(/ v\d+$/, '') : (plan.title || p.topic).slice(0, 100);
  const n = (await q(`SELECT count(*)::int AS n FROM lesson_plans WHERE workspace_id=$1 AND (title=$2 OR title LIKE $3)`, [wsId, root, `${root} v%`]))[0].n;
  return (await q(`INSERT INTO lesson_plans (workspace_id, course_id, unit_id, title, params, plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
    [wsId, courseId, unitId, n ? `${root} v${n + 1}` : root, JSON.stringify(p), JSON.stringify(plan)]))[0];
}
