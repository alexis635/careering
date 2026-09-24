import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Download, Plus, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import { MODES, sanitizePlan, type LessonPlan, type Segment } from '../lib/lessonSpec';
import type { WsItem } from '../types';

export interface LessonRow { id: number; workspace_id: number; course_id: number | null; unit_id: number | null; title: string; params: any; plan: LessonPlan; updated_at: string; deleted_at?: string | null }
export const STANDARD_OPTIONS: [string, string][] = [['louisiana', 'Louisiana Student Standards'], ['ccss', 'Common Core'], ['ngss', 'NGSS (science)'], ['arts', 'National Core Arts Standards'], ['none', 'No standards, my own objectives']];
const MINUTES = [15, 20, 30, 40, 45, 50, 60, 75, 90, 120];

const Lines = ({ label, value, onChange, rows = 3, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number; hint?: string }) => (
  <label className="block"><span className="text-xs font-semibold text-teal">{label}</span>{hint && <span className="text-xs text-teal"> · {hint}</span>}
    <textarea className="input mt-0.5" rows={rows} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} onBlur={(e) => onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} /></label>
);
const Txt = ({ label, value, onChange, rows = 3, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) => (
  <label className="block"><span className="text-xs font-semibold text-teal">{label}</span>{hint && <span className="text-xs text-teal"> · {hint}</span>}
    <textarea className="input mt-0.5" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /></label>
);
const Card = ({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) => (
  <section className="card p-4 space-y-3"><div><h3 className="font-semibold text-lg">{title}</h3>{note && <p className="text-xs text-teal">{note}</p>}</div>{children}</section>
);

function Editor({ row, onBack, onSaved, onTrashed }: { row: LessonRow; onBack: () => void; onSaved: (r: LessonRow) => void; onTrashed: () => void }) {
  const [plan, setPlan] = useState<LessonPlan>(row.plan);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(() => { setPlan(row.plan); setDirty(false); }, [row.id, row.updated_at]);
  const set = (p: Partial<LessonPlan>) => { setPlan((x) => ({ ...x, ...p })); setDirty(true); };
  const total = plan.segments.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const seg = (i: number, p: Partial<Segment>) => set({ segments: plan.segments.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const clean = () => sanitizePlan({ ...plan, minutes: total || plan.minutes });

  async function save() {
    setBusy('save'); setMsg('');
    try { const r = await api.patch<LessonRow>(`lessons/${row.id}`, { plan: clean() }); setDirty(false); onSaved(r); setMsg('Saved.'); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  }
  async function ai(body: any, key: string) {
    if (dirty && !confirm('Your unsaved edits are not part of this. Save first if you want them kept. Continue anyway?')) return;
    setBusy(key); setMsg('');
    try { const r = await api.post<LessonRow>('ai/lesson', { lesson_id: row.id, ...body }); setFeedback(''); onSaved(r); if (key === 'sub') setMsg('Substitute version added at the bottom.'); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  }
  async function pdf(sub: boolean) {
    setBusy(sub ? 'pdfsub' : 'pdf'); setMsg('');
    try {
      const { lessonPdfBlob } = await import('../lib/lessonPdf');
      const url = URL.createObjectURL(await lessonPdfBlob(clean(), sub));
      const a = document.createElement('a'); a.href = url; a.download = `${(row.title || 'Lesson plan').replace(/[^\w .&'()-]+/g, '').trim().slice(0, 60)}${sub ? ' (substitute)' : ''}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { setMsg(e.message || 'Could not build the PDF'); } finally { setBusy(null); }
  }
  const sn = plan.sub_notes;

  return (
    <div className="space-y-4">
      <button className="text-sm text-teal inline-flex items-center gap-1" onClick={onBack}><ArrowLeft size={14} /> All lesson plans</button>
      <div className="card p-4 space-y-3">
        <input className="input text-lg font-semibold" value={plan.title} onChange={(e) => set({ title: e.target.value })} />
        <div className="grid sm:grid-cols-4 gap-2">
          <label className="text-xs text-teal">Subject<input className="input" value={plan.subject} onChange={(e) => set({ subject: e.target.value })} /></label>
          <label className="text-xs text-teal">Grade or level<input className="input" value={plan.grade} onChange={(e) => set({ grade: e.target.value })} /></label>
          <label className="text-xs text-teal">Unit<input className="input" value={plan.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
          <div className="text-xs text-teal">Length<div className={`input flex items-center ${total !== plan.minutes && dirty ? 'text-amber-800' : ''}`}>{total || plan.minutes} minutes</div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={!dirty || !!busy} onClick={save}><Save size={14} /> {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => pdf(false)}><Download size={14} /> {busy === 'pdf' ? 'Building…' : 'Lesson plan PDF'}</button>
          <button className="btn-ghost" disabled={!!busy || !sn} onClick={() => pdf(true)} title={sn ? '' : 'Build the substitute version first'}><Download size={14} /> {busy === 'pdfsub' ? 'Building…' : 'Substitute PDF'}</button>
          <button className="btn-ghost ml-auto" title="Move to Recently deleted" onClick={async () => { if (confirm('Move this lesson plan to Recently deleted? You can restore it any time.')) { await api.del(`lessons/${row.id}`); onTrashed(); } }}><Trash2 size={13} /></button>
          {msg && <span className="text-sm text-teal">{msg}</span>}
        </div>
      </div>

      <Card title="Standards" note="The AI suggests these. Check each one against your official standards document before you rely on it.">
        {plan.standards.map((st, i) => (
          <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-2 items-start">
            <input className="input" placeholder="Code" value={st.code} onChange={(e) => set({ standards: plan.standards.map((x, k) => (k === i ? { ...x, code: e.target.value } : x)) })} />
            <textarea className="input" rows={2} value={st.text} onChange={(e) => set({ standards: plan.standards.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
            <button className="btn-ghost" onClick={() => set({ standards: plan.standards.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="btn-ghost" onClick={() => set({ standards: [...plan.standards, { code: '', text: '' }] })}><Plus size={13} /> Add a standard</button>
      </Card>

      <Card title="Aims">
        <Txt label="Big idea, the essential question" rows={2} value={plan.big_idea} onChange={(v) => set({ big_idea: v })} />
        <Lines label="Objectives" hint="one per line" value={plan.objectives} onChange={(v) => set({ objectives: v })} />
        <Lines label="Vocabulary" hint="term: meaning, one per line" value={plan.vocabulary.map((v) => `${v.term}: ${v.meaning}`)}
          onChange={(v) => set({ vocabulary: v.map((l) => { const [t, ...m] = l.split(':'); return { term: t.trim(), meaning: m.join(':').trim() }; }) })} />
      </Card>

      <Card title="Getting ready">
        <Lines label="Materials" hint="one per line" value={plan.materials} onChange={(v) => set({ materials: v })} />
        <Lines label="Before class, what you do" hint="one per line" value={plan.prep} onChange={(v) => set({ prep: v })} />
      </Card>

      <Card title="Opening hook"><Txt label="What you say or show first" rows={4} value={plan.hook} onChange={(v) => set({ hook: v })} /></Card>

      <Card title="The lesson, minute by minute" note={`Segments add up to ${total} minutes.`}>
        {plan.segments.map((g, i) => (
          <div key={i} className="rounded-lg border border-sky p-3 space-y-2">
            <div className="grid grid-cols-[1fr_120px_80px_auto] gap-2 items-center">
              <input className="input font-medium" value={g.title} onChange={(e) => seg(i, { title: e.target.value })} />
              <select className="input" value={g.mode} onChange={(e) => seg(i, { mode: e.target.value })}>{[...(MODES.includes(g.mode) ? [] : [g.mode]), ...MODES].map((m) => <option key={m}>{m}</option>)}</select>
              <input className="input" type="number" min={1} value={g.minutes} onChange={(e) => seg(i, { minutes: Number(e.target.value) })} title="Minutes" />
              <button className="btn-ghost" title="Remove this segment" onClick={() => set({ segments: plan.segments.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
            </div>
            <Txt label="Teacher" rows={4} value={g.teacher} onChange={(v) => seg(i, { teacher: v })} />
            <Txt label="Students" rows={3} value={g.students} onChange={(v) => seg(i, { students: v })} />
            <Txt label="Watch for" rows={2} value={g.tips} onChange={(v) => seg(i, { tips: v })} />
          </div>
        ))}
        <button className="btn-ghost" onClick={() => set({ segments: [...plan.segments, { title: 'New segment', minutes: 5, mode: 'Discuss', teacher: '', students: '', tips: '' }] })}><Plus size={13} /> Add a segment</button>
      </Card>

      <Card title="Reaching every learner">
        <div className="grid sm:grid-cols-2 gap-3">
          <Lines label="Support" value={plan.differentiation.support} onChange={(v) => set({ differentiation: { ...plan.differentiation, support: v } })} />
          <Lines label="Extension" value={plan.differentiation.extension} onChange={(v) => set({ differentiation: { ...plan.differentiation, extension: v } })} />
          <Lines label="Multilingual learners" value={plan.differentiation.multilingual} onChange={(v) => set({ differentiation: { ...plan.differentiation, multilingual: v } })} />
          <Lines label="Accommodations" hint="general, never a named student" value={plan.differentiation.accommodations} onChange={(v) => set({ differentiation: { ...plan.differentiation, accommodations: v } })} />
        </div>
      </Card>

      <Card title="Assessment">
        <Lines label="Checks for understanding" hint="one per line" value={plan.assessment.formative} onChange={(v) => set({ assessment: { ...plan.assessment, formative: v } })} />
        <Txt label="Exit ticket" rows={2} value={plan.assessment.exit_ticket} onChange={(v) => set({ assessment: { ...plan.assessment, exit_ticket: v } })} />
        <div className="space-y-2 overflow-x-auto">
          <div className="text-xs font-semibold text-teal">Rubric, beginning to exceeding</div>
          {plan.assessment.rubric.map((r, i) => (
            <div key={i} className="grid grid-cols-[130px_repeat(4,minmax(130px,1fr))_auto] gap-2 min-w-[760px]">
              <input className="input" value={r.criterion} onChange={(e) => set({ assessment: { ...plan.assessment, rubric: plan.assessment.rubric.map((x, k) => (k === i ? { ...x, criterion: e.target.value } : x)) } })} />
              {r.levels.map((l, j) => <textarea key={j} className="input text-xs" rows={3} value={l} onChange={(e) => set({ assessment: { ...plan.assessment, rubric: plan.assessment.rubric.map((x, k) => (k === i ? { ...x, levels: x.levels.map((y, m) => (m === j ? e.target.value : y)) } : x)) } })} />)}
              <button className="btn-ghost" onClick={() => set({ assessment: { ...plan.assessment, rubric: plan.assessment.rubric.filter((_, k) => k !== i) } })}><Trash2 size={13} /></button>
            </div>
          ))}
          <button className="btn-ghost" onClick={() => set({ assessment: { ...plan.assessment, rubric: [...plan.assessment.rubric, { criterion: 'New criterion', levels: ['', '', '', ''] }] } })}><Plus size={13} /> Add a criterion</button>
        </div>
      </Card>

      <Card title="Closing and beyond">
        <Txt label="Closure" rows={3} value={plan.closure} onChange={(v) => set({ closure: v })} />
        <Txt label="Model example to show students" rows={5} value={plan.exemplar} onChange={(v) => set({ exemplar: v })} />
        <Txt label="Homework" rows={2} value={plan.homework} onChange={(v) => set({ homework: v })} />
      </Card>

      <Card title="Substitute-ready version" note="A version someone who has never met the class can run.">
        {!sn && <p className="text-sm text-teal">Not built yet.</p>}
        {sn && (
          <div className="space-y-3">
            <Txt label="What happens today" rows={3} value={sn.overview} onChange={(v) => set({ sub_notes: { ...sn, overview: v } })} />
            <Txt label="Minute by minute" rows={8} value={sn.routine} onChange={(v) => set({ sub_notes: { ...sn, routine: v } })} />
            <Txt label="If students finish early" rows={3} value={sn.if_done_early} onChange={(v) => set({ sub_notes: { ...sn, if_done_early: v } })} />
            <Txt label="Classroom management" rows={3} value={sn.behavior} onChange={(v) => set({ sub_notes: { ...sn, behavior: v } })} />
            <Txt label="If something goes wrong" rows={3} value={sn.emergency} onChange={(v) => set({ sub_notes: { ...sn, emergency: v } })} />
          </div>
        )}
        <button className="btn" disabled={!!busy} onClick={() => ai({ mode: 'sub' }, 'sub')}><Sparkles size={14} /> {busy === 'sub' ? 'Writing, about a minute…' : sn ? 'Rebuild the substitute version' : 'Build the substitute version'}</button>
      </Card>

      <Card title="After you teach it" note="Only you write this. It stays with the plan.">
        <Txt label="What worked, what to change next time" rows={5} value={plan.reflection} onChange={(v) => set({ reflection: v })} />
        {dirty && <button className="btn" onClick={save}><Save size={14} /> Save changes</button>}
      </Card>

      <div className="card p-4 flex flex-wrap gap-2">
        <input className="input flex-1 min-w-56 text-sm" placeholder="Ask for changes, like: make it 40 minutes, add a partner share, more scaffolding" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className="btn" disabled={!!busy || !feedback.trim()} onClick={() => ai({ feedback }, 'revise')}><Sparkles size={14} /> {busy === 'revise' ? 'Revising, about 90 seconds…' : 'Revise as a new version'}</button>
      </div>
    </div>
  );
}

/** Lesson plans for a teaching workspace: generate a full plan, edit every part, build a substitute version, export PDFs. */
export default function LessonPlanner({ workspaceId, items, focusId }: { workspaceId: number; items: WsItem[]; focusId?: number | null }) {
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [gone, setGone] = useState<LessonRow[]>([]);
  const [sel, setSel] = useState<number | null>(focusId ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const courses = items.filter((i) => i.kind === 'course'), units = items.filter((i) => i.kind === 'unit');
  const [f, setF] = useState({ course_id: '', unit_id: '', topic: '', grade: '', subject: '', minutes: 45, standards: 'course', focus: '' });
  const load = () => { api.get<LessonRow[]>(`lessons?workspace_id=${workspaceId}`).then(setRows); api.get<LessonRow[]>(`lessons?workspace_id=${workspaceId}&deleted=1`).then(setGone).catch(() => {}); };
  useEffect(load, [workspaceId]);
  const course = courses.find((c) => String(c.id) === f.course_id);

  async function build() {
    if (!f.topic.trim()) return;
    setBusy(true); setErr('');
    try {
      const standards = f.standards === 'course' ? (course?.extra?.standards || 'none') : f.standards;
      const r = await api.post<LessonRow>('ai/lesson', { workspace_id: workspaceId, course_id: f.course_id || null, unit_id: f.unit_id || null, topic: f.topic, grade: f.grade, subject: f.subject, minutes: f.minutes, standards, focus: f.focus });
      setF({ ...f, topic: '', focus: '' }); load(); setSel(r.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const cur = rows.find((r) => r.id === sel);
  if (cur) return <Editor row={cur} onBack={() => setSel(null)} onSaved={(r) => { setRows((xs) => { const has = xs.some((x) => x.id === r.id); return has ? xs.map((x) => (x.id === r.id ? r : x)) : [r, ...xs]; }); setSel(r.id); load(); }} onTrashed={() => { setSel(null); load(); }} />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-teal rounded-lg bg-beige p-3">Keep student names, grades, and personal details out of Careering. Materials your employer owns may not be yours to keep.</p>
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold text-lg">Build a lesson plan</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <select className="input" value={f.course_id} onChange={(e) => { const c = courses.find((x) => String(x.id) === e.target.value); setF({ ...f, course_id: e.target.value, unit_id: '', grade: c?.extra?.grade ?? f.grade, subject: c?.extra?.subject ?? f.subject }); }}>
            <option value="">No course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <select className="input" value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })} disabled={!f.course_id}>
            <option value="">No unit</option>{units.filter((u) => u.extra?.course_id === f.course_id).map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
          </select>
        </div>
        <input className="input" placeholder="What is the lesson about? For example: writing a scene with sensory detail" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
        <div className="grid sm:grid-cols-4 gap-2">
          <input className="input" placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          <input className="input" placeholder="Grade or level" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} />
          <select className="input" value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })}>{MINUTES.map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>
          <select className="input" value={f.standards} onChange={(e) => setF({ ...f, standards: e.target.value })}>
            <option value="course">Standards: use the course setting</option>{STANDARD_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <input className="input" placeholder="Style or focus (optional): workshop, mentor text, station rotation, sub-friendly, hands-on" value={f.focus} onChange={(e) => setF({ ...f, focus: e.target.value })} />
        <div className="flex items-center gap-3">
          <button className="btn" disabled={busy || !f.topic.trim()} onClick={build}><Sparkles size={14} /> {busy ? 'Building, about 90 seconds…' : 'Build lesson plan'}</button>
          {err && <span className="text-sm text-red-700">{err}</span>}
        </div>
      </div>

      {rows.length === 0 && <div className="card p-5 text-sm text-teal text-center">No lesson plans yet.</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        {rows.map((r) => (
          <button key={r.id} onClick={() => setSel(r.id)} className="card p-4 text-left hover:bg-beige">
            <div className="font-semibold">{r.title}</div>
            <div className="text-xs text-teal mt-0.5">{[r.plan.subject, r.plan.grade && `Grade ${r.plan.grade}`, `${r.plan.minutes} min`, r.plan.sub_notes ? 'Sub-ready' : ''].filter(Boolean).join(' · ')}</div>
            <div className="text-xs text-teal">{courses.find((c) => c.id === r.course_id)?.title ?? ''} · {format(new Date(r.updated_at), 'MMM d')}</div>
          </button>
        ))}
      </div>
      {rows.length > 0 && <p className="text-xs text-teal text-center">Open any plan to edit it, build a substitute version, or export it.</p>}
      {gone.length > 0 && (
        <details><summary className="text-sm text-teal cursor-pointer">Recently deleted ({gone.length})</summary>
          <div className="card p-3 mt-2">{gone.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-1.5 text-sm"><span className="flex-1 truncate">{r.title}</span>
              <button className="btn-ghost" onClick={async () => { await api.post(`lessons/${r.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>
          ))}</div></details>
      )}
    </div>
  );
}
