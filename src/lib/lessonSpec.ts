import { noDash } from './noDash';

/** A full lesson plan. Shared by the server (to clean what the AI writes) and the browser (to edit and export). */
export interface Segment { title: string; minutes: number; mode: string; teacher: string; students: string; tips: string }
export interface Rubric { criterion: string; levels: string[] }   // four levels, strongest last
export interface LessonPlan {
  title: string; subject: string; grade: string; minutes: number; unit: string;
  standards: { code: string; text: string }[];
  big_idea: string; objectives: string[]; vocabulary: { term: string; meaning: string }[];
  materials: string[]; prep: string[];
  hook: string;
  segments: Segment[];
  differentiation: { support: string[]; extension: string[]; multilingual: string[]; accommodations: string[] };
  assessment: { formative: string[]; exit_ticket: string; rubric: Rubric[] };
  closure: string; exemplar: string; homework: string;
  sub_notes: { overview: string; routine: string; if_done_early: string; behavior: string; emergency: string } | null;
  reflection: string;
}
export const MODES = ['Hook', 'I do', 'We do', 'You do', 'Discuss', 'Workshop', 'Assess', 'Closure'];

const clip = (s: unknown, n: number) => {
  const t = noDash(String(s ?? '')).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n), stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > n * 0.45) return cut.slice(0, stop + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '');
};
const list = (v: unknown, max: number, n: number) => (Array.isArray(v) ? v.map((x) => clip(x, n)).filter(Boolean).slice(0, max) : []);

export function sanitizePlan(raw: any): LessonPlan {
  const r = raw ?? {};
  const sn = r.sub_notes;
  return {
    title: clip(r.title, 120), subject: clip(r.subject, 60), grade: clip(r.grade, 40), unit: clip(r.unit, 100),
    minutes: Math.min(240, Math.max(5, Math.round(Number(r.minutes)) || 45)),
    standards: (Array.isArray(r.standards) ? r.standards : []).slice(0, 8).map((s: any) => ({ code: clip(s?.code, 30), text: clip(s?.text, 260) })).filter((s: any) => s.text || s.code),
    big_idea: clip(r.big_idea, 260), objectives: list(r.objectives, 6, 220),
    vocabulary: (Array.isArray(r.vocabulary) ? r.vocabulary : []).slice(0, 10).map((v: any) => ({ term: clip(v?.term, 40), meaning: clip(v?.meaning, 160) })).filter((v: any) => v.term),
    materials: list(r.materials, 14, 140), prep: list(r.prep, 8, 200),
    hook: clip(r.hook, 900),
    segments: (Array.isArray(r.segments) ? r.segments : []).slice(0, 10).map((s: any): Segment => ({
      title: clip(s?.title, 80), minutes: Math.min(120, Math.max(1, Math.round(Number(s?.minutes)) || 5)), mode: clip(s?.mode, 20),
      teacher: clip(s?.teacher, 1100), students: clip(s?.students, 900), tips: clip(s?.tips, 600),
    })).filter((s: Segment) => s.title),
    differentiation: {
      support: list(r.differentiation?.support, 6, 220), extension: list(r.differentiation?.extension, 6, 220),
      multilingual: list(r.differentiation?.multilingual, 6, 220), accommodations: list(r.differentiation?.accommodations, 6, 220),
    },
    assessment: {
      formative: list(r.assessment?.formative, 6, 220), exit_ticket: clip(r.assessment?.exit_ticket, 400),
      rubric: (Array.isArray(r.assessment?.rubric) ? r.assessment.rubric : []).slice(0, 6).map((x: any): Rubric => ({
        criterion: clip(x?.criterion, 60), levels: [0, 1, 2, 3].map((i) => clip(x?.levels?.[i], 160)),
      })).filter((x: Rubric) => x.criterion),
    },
    closure: clip(r.closure, 600), exemplar: clip(r.exemplar, 2500), homework: clip(r.homework, 500),
    sub_notes: sn && typeof sn === 'object' ? {
      overview: clip(sn.overview, 700), routine: clip(sn.routine, 900), if_done_early: clip(sn.if_done_early, 500), behavior: clip(sn.behavior, 500), emergency: clip(sn.emergency, 400),
    } : null,
    reflection: clip(r.reflection, 3000),
  };
}
