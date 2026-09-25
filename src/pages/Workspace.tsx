import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { AlertTriangle, ArrowLeft, Award, BookOpen, Briefcase, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, ClipboardList, FileText, Flag, FolderKanban, GraduationCap, LayoutDashboard, Map, NotebookPen, Package, Paperclip, Plus, Receipt, RotateCcw, Target, Trash2, Trophy, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../api';
import { MAX_UPLOAD, kb, readFile } from '../lib/files';
import LessonPlanner, { STANDARD_OPTIONS } from '../components/LessonPlanner';
import type { Win, Workspace, WsItem } from '../types';
import { CardSkeletons } from '../components/ui';

const day = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'MMM d, yyyy') : '');
const today = () => format(new Date(), 'yyyy-MM-dd');

export const JOB_TYPES: Record<string, string> = { general: 'General', pm: 'Project management', teaching: 'Teaching', freelance: 'Freelance or contract' };

/** How each list section behaves. One generic list draws them all, so adding a module is adding a line here. */
interface Spec {
  kind: string; label: string; add: string; body?: string; due?: string; time?: boolean; done?: boolean; email?: boolean; link?: boolean; amount?: boolean;
  status?: string[]; note?: string; empty: string; file?: string;
  extras?: { key: string; label: string; options?: [string, string][] }[]; courseSelect?: boolean;
}
const SPECS: Record<string, Spec> = {
  tasks: { kind: 'task', label: 'Tasks', add: 'Add a task', due: 'Due', done: true, empty: 'No tasks yet.' },
  projects: { kind: 'project', label: 'Projects', add: 'Add a project', body: 'What it is and what done looks like', due: 'Target date', status: ['Planning', 'In progress', 'On hold', 'Done'], empty: 'No projects yet.' },
  goals: { kind: 'goal', label: 'Goals', add: 'Add a goal, like: run the fall showcase', body: 'Optional detail', due: 'By', done: true, empty: 'No goals yet.' },
  notes: { kind: 'note', label: 'Notes and 1:1s', add: 'Title, like: 1:1 with my manager', body: 'What was said, decided, or promised', empty: 'No notes yet.' },
  people: { kind: 'contact', label: 'People', add: 'Name', body: 'Their role and how they help', email: true, empty: 'No one yet.' },
  trainings: { kind: 'training', label: 'Trainings', add: 'Training, like: Mandated reporter', body: 'What it covers, who assigns it, how you finish it', due: 'Due by', status: ['Not started', 'In progress', 'Complete'], link: true, file: 'Attach certificate', note: 'Track the trainings your employer requires. Attach the completion certificate when you have it, and give each a due date so it shows on your Schedule.', empty: 'No trainings yet.' },
  docs: { kind: 'document', label: 'Documents and handbooks', add: 'Document name, like: Employee handbook', body: 'What it covers, or the parts you need to remember', link: true, file: 'Attach a PDF', note: 'Upload a handbook or policy as a PDF (up to 3 MB) or keep a link and notes. Employer handbooks can be confidential, so keep only what you are allowed to. Files stay private to you.', empty: 'Nothing saved yet.' },
  stakeholders: { kind: 'stakeholder', label: 'Stakeholders', add: 'Name', body: 'Role, what they care about, how to keep them informed', email: true, empty: 'No stakeholders yet.' },
  risks: { kind: 'risk', label: 'Risks', add: 'Add a risk', body: 'What could go wrong and what you will do about it', status: ['Open', 'Watching', 'Resolved'], empty: 'No risks logged.' },
  courses: { kind: 'course', label: 'Courses', add: 'Course or class, like: Creative Writing', body: 'What the course is, how it runs, what students leave able to do', extras: [{ key: 'subject', label: 'Subject' }, { key: 'grade', label: 'Grade or level' }, { key: 'standards', label: 'Standards', options: STANDARD_OPTIONS }], note: 'Keep student names, grades, and personal details out of Careering.', empty: 'No courses yet.' },
  curriculum: { kind: 'unit', label: 'Curriculum', add: 'Unit title, like: Voice and Narrative', body: 'Big questions, key skills, texts, the assessment at the end, and how many weeks', due: 'Starts', courseSelect: true, status: ['Planning', 'Teaching', 'Taught'], note: 'Map each course as a sequence of units. Lessons you build can hang off a unit.', empty: 'No units yet. Add a course first, then map its units here.' },
  certs: { kind: 'cert', label: 'Certification progress', add: 'Requirement', body: 'Details, hours, who to send it to', due: 'Due', status: ['Not started', 'In progress', 'Submitted', 'Complete'], empty: 'Nothing tracked yet.' },
  clients: { kind: 'client', label: 'Clients', add: 'Client name', body: 'Scope, rate, terms', email: true, empty: 'No clients yet.' },
  deliverables: { kind: 'deliverable', label: 'Deliverables', add: 'Add a deliverable', body: 'What you owe and to whom', due: 'Due', done: true, empty: 'No deliverables yet.' },
  invoices: { kind: 'invoice', label: 'Invoices', add: 'Invoice, like: October retainer', body: 'What it covers', due: 'Due', amount: true, status: ['Draft', 'Sent', 'Paid'], empty: 'No invoices yet.' },
};

interface Sec { id: string; label: string; icon: LucideIcon }
const GROUPS: { title: string; secs: Sec[] }[] = [
  { title: '', secs: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'schedule', label: 'Schedule', icon: CalendarDays }] },
  { title: 'Work', secs: [{ id: 'tasks', label: 'Tasks', icon: CheckSquare }, { id: 'projects', label: 'Projects', icon: FolderKanban }, { id: 'goals', label: 'Goals', icon: Target }, { id: 'wins', label: 'Wins', icon: Trophy }] },
  { title: 'People and notes', secs: [{ id: 'notes', label: 'Notes and 1:1s', icon: NotebookPen }, { id: 'people', label: 'People', icon: Users }] },
  { title: 'Records', secs: [{ id: 'docs', label: 'Handbooks and documents', icon: FileText }, { id: 'trainings', label: 'Trainings', icon: GraduationCap }] },
];
const BY_TYPE: Record<string, Sec[]> = {
  general: [],
  pm: [{ id: 'stakeholders', label: 'Stakeholders', icon: Users }, { id: 'risks', label: 'Risks', icon: AlertTriangle }],
  teaching: [{ id: 'courses', label: 'Courses', icon: BookOpen }, { id: 'curriculum', label: 'Curriculum', icon: Map }, { id: 'lessons', label: 'Lesson plans', icon: ClipboardList }, { id: 'certs', label: 'Certification progress', icon: Award }],
  freelance: [{ id: 'clients', label: 'Clients', icon: Briefcase }, { id: 'deliverables', label: 'Deliverables', icon: Package }, { id: 'invoices', label: 'Invoices', icon: Receipt }],
};
const WRAP: Sec = { id: 'wrap', label: 'Wrap up', icon: Flag };
const CLOSED = ['Done', 'Complete', 'Paid', 'Resolved', 'Submitted'];
const CHECKS: [string, string, string?, string?][] = [
  ['wins', 'Capture your wins from this job', '/rise', 'Open Rise'],
  ['vault', 'Save your offer letter, reviews, recommendation letters, and certificates', '/vault', 'Open Vault'],
  ['pay', 'Record your final pay in Roles and pay', '/rise?tab=roles', 'Open Roles and pay'],
  ['copies', 'Save copies of anything you need while you still have access: work samples, policies you may want, contact details'],
  ['refs', 'Ask for a recommendation or agree on a reference'],
];

export default function WorkspacePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [qs] = useSearchParams();
  const [sec, setSec] = useState(qs.get('section') || 'overview');
  const [resp, setResp] = useState('');
  const [respDirty, setRespDirty] = useState(false);
  const [end, setEnd] = useState('');
  const [msg, setMsg] = useState('');
  const [wins, setWins] = useState<Win[]>([]);
  const [win, setWin] = useState({ title: '', impact: '' });

  const load = () => api.get<Workspace>(`workspaces/${id}`).then((w) => { setWs(w); if (!respDirty) setResp(w.responsibilities); });
  const loadWins = (w: Workspace) => api.get<Win[]>('wins').then((all) => setWins(all.filter((x) => x.employer === w.employer))).catch(() => {});
  useEffect(() => { load().then(() => {}); }, [id]);
  useEffect(() => { if (ws && sec === 'wins') loadWins(ws); }, [sec, ws?.employer]);
  if (!ws) return <div className="max-w-3xl mx-auto p-6"><CardSkeletons n={3} className="h-24" /></div>;
  const items = ws.items ?? [];
  const locked = !!ws.wrapped_up_at;
  const modules = BY_TYPE[ws.job_type] ?? [];
  const patchItem = async (i: WsItem, body: any) => { await api.patch(`ws-items/${i.id}`, body); load(); };

  const Section = ({ spec }: { spec: Spec }) => {
    const [f, setF] = useState<Record<string, string>>({ title: '', body: '', due_on: '', email: '', link: '', amount: '', time: '', status: spec.status?.[0] ?? '', course_id: '' });
    const [file, setFile] = useState<File | null>(null);
    const [err, setErr] = useState('');
    const list = items.filter((i) => i.kind === spec.kind);
    const open = spec.done ? [...list.filter((i) => !i.done_at).sort((a, b) => (a.due_on ?? '9').localeCompare(b.due_on ?? '9')), ...list.filter((i) => i.done_at)] : list;
    const add = async () => {
      if (!f.title.trim()) return;
      const extra: Record<string, string> = {};
      if (spec.email && f.email) extra.email = f.email;
      if (spec.link && f.link) extra.link = f.link;
      if (spec.amount && f.amount) extra.amount = f.amount;
      if (spec.status) extra.status = f.status;
      if (spec.courseSelect && f.course_id) extra.course_id = f.course_id;
      for (const x of spec.extras ?? []) if (f[x.key]) extra[x.key] = f[x.key];
      if (file && file.size > MAX_UPLOAD) { setErr('That file is over 3 MB. Try a compressed PDF.'); return; }
      setErr('');
      const made = await api.post<WsItem>(`workspaces/${id}/items`, { kind: spec.kind, title: f.title, body: f.body, due_on: f.due_on || null, extra });
      if (file) { try { await api.post(`ws-items/${made.id}/file`, { file: await readFile(file) }); } catch (e: any) { setMsg(`Saved, but the file did not attach: ${e.message}`); } }
      setFile(null); setF({ ...f, title: '', body: '', due_on: '', email: '', link: '', amount: '' }); load();
    };
    return (
      <div className="space-y-4">
        {spec.note && <p className="text-xs text-teal rounded-lg bg-beige p-3">{spec.note}</p>}
        <div className="card p-4 space-y-2">
          <input className="input" placeholder={spec.add} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          {spec.body && <textarea className="input" rows={spec.kind === 'note' ? 6 : 2} placeholder={spec.body} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}
          {(spec.extras || spec.courseSelect) && (
            <div className="flex flex-wrap gap-2">
              {spec.courseSelect && <select className="input flex-1 min-w-40" value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">Which course?</option>{items.filter((i) => i.kind === 'course').map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}
              {(spec.extras ?? []).map((x) => x.options
                ? <select key={x.key} className="input flex-1 min-w-40" value={f[x.key] ?? ''} onChange={(e) => setF({ ...f, [x.key]: e.target.value })}><option value="">{x.label}</option>{x.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                : <input key={x.key} className="input flex-1 min-w-40" placeholder={x.label} value={f[x.key] ?? ''} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {spec.email && <input className="input flex-1 min-w-40" type="email" placeholder="Email (optional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
            {spec.link && <input className="input flex-1 min-w-40" placeholder="Link (optional)" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />}
            {spec.amount && <input className="input w-32" inputMode="decimal" placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
            {spec.status && <select className="input w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{spec.status.map((s) => <option key={s}>{s}</option>)}</select>}
            {spec.due && <input className="input w-auto" type="date" title={spec.due} value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} />}
            {spec.file && <label className="btn-ghost cursor-pointer text-xs"><Paperclip size={13} /> {file ? file.name.slice(0, 24) : spec.file}<input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} /></label>}
            <button className="btn" disabled={!f.title.trim()} onClick={add}><Plus size={14} /> Add</button>
          </div>
          {err && <div className="text-sm text-red-700">{err}</div>}
        </div>
        <div className="card p-4">
          {open.length === 0 && <p className="text-sm text-teal">{spec.empty}</p>}
          {open.map((i) => (
            <div key={i.id} className="flex items-start gap-3 py-2 border-b border-sky/60 last:border-0">
              {spec.done && <input type="checkbox" className="mt-1" checked={!!i.done_at} onChange={(e) => patchItem(i, { done: e.target.checked })} />}
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${i.done_at ? 'line-through text-teal' : 'font-medium'}`}>{i.title}</div>
                {i.body && <div className="text-sm text-teal whitespace-pre-wrap">{i.body}</div>}
                <div className="text-xs text-teal flex flex-wrap gap-x-3">
                  {i.due_on && <span>{spec.due} {day(i.due_on)}</span>}
                  {spec.courseSelect && i.extra?.course_id && <span>{items.find((c) => String(c.id) === i.extra.course_id)?.title}</span>}
                  {(spec.extras ?? []).map((x) => i.extra?.[x.key] ? <span key={x.key}>{x.options?.find(([v]) => v === i.extra[x.key])?.[1] ?? i.extra[x.key]}</span> : null)}
                  {i.extra?.amount && <span>${Number(i.extra.amount).toLocaleString()}</span>}
                  {i.extra?.email && <a href={`mailto:${i.extra.email}`} className="underline">{i.extra.email}</a>}
                  {i.file_name && <a href={`/api/ws-items/${i.id}/file`} className="underline inline-flex items-center gap-1"><Paperclip size={11} /> {i.file_name} ({kb(i.size ?? null)})</a>}
                  {spec.file && !i.file_name && <label className="underline cursor-pointer inline-flex items-center gap-1"><Paperclip size={11} /> Attach a file<input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={async (e) => { const fl = e.target.files?.[0]; e.target.value = ''; if (!fl) return; if (fl.size > MAX_UPLOAD) { setMsg('That file is over 3 MB. Try a compressed PDF.'); return; } try { await api.post(`ws-items/${i.id}/file`, { file: await readFile(fl) }); load(); } catch (er: any) { setMsg(er.message); } }} /></label>}
                  {i.extra?.link && <a href={/^https?:/.test(i.extra.link) ? i.extra.link : `https://${i.extra.link}`} target="_blank" rel="noreferrer" className="underline">Open link</a>}
                </div>
              </div>
              {spec.status && <select className="input w-auto text-xs" value={i.extra?.status ?? spec.status[0]} onChange={(e) => patchItem(i, { extra: { ...i.extra, status: e.target.value } })}>{spec.status.map((s) => <option key={s}>{s}</option>)}</select>}
              <button className="btn-ghost" title="Move to Recently deleted" onClick={async () => { await api.del(`ws-items/${i.id}`); load(); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Schedule = () => {
    const [view, setView] = useState<'calendar' | 'list'>('calendar');
    const [month, setMonth] = useState(startOfMonth(new Date()));
    const [picked, setPicked] = useState(today());
    const [f, setF] = useState({ title: '', time: '' });
    const dated = items.filter((i) => i.due_on && !i.done_at && i.kind !== 'note' && !CLOSED.includes(i.extra?.status ?? ''));
    const key = (i: WsItem) => `${i.due_on}${i.extra?.time ?? ''}`;
    const upcoming = dated.filter((i) => i.due_on! >= today()).sort((a, b) => key(a).localeCompare(key(b)));
    const past = dated.filter((i) => i.due_on! < today()).sort((a, b) => key(b).localeCompare(key(a)));
    const LABEL: Record<string, string> = { event: 'Event', task: 'Task', goal: 'Goal', project: 'Project', deliverable: 'Deliverable', lesson: 'Lesson', cert: 'Requirement', invoice: 'Invoice', training: 'Training' };
    const TONE: Record<string, string> = { event: 'bg-navy text-white', training: 'bg-amber-100 text-amber-900', invoice: 'bg-emerald-100 text-emerald-900' };
    const line = (i: WsItem) => (
      <div key={i.id} className="flex items-center gap-3 py-1.5 text-sm border-b border-sky/60 last:border-0">
        <span className="w-28 text-teal shrink-0">{day(i.due_on)}{i.extra?.time ? `, ${i.extra.time}` : ''}</span>
        <span className="flex-1 min-w-0 truncate">{i.title}</span>
        <span className="text-xs text-teal">{LABEL[i.kind] ?? i.kind}</span>
      </div>
    );
    const weeks: Date[] = [];
    for (let d = startOfWeek(startOfMonth(month)); d <= endOfWeek(endOfMonth(month)); d = addDays(d, 1)) weeks.push(d);
    const on = (d: string) => dated.filter((i) => i.due_on === d).sort((a, b) => (a.extra?.time ?? '').localeCompare(b.extra?.time ?? ''));
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-sky overflow-hidden text-sm">
            {(['calendar', 'list'] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? 'bg-navy text-white' : 'text-navy hover:bg-sky/40'}`}>{v === 'calendar' ? 'Calendar' : 'List'}</button>)}
          </div>
          <p className="text-xs text-teal hidden sm:block">Anything with a date in this job shows here.</p>
        </div>

        {view === 'calendar' && (
          <div className="card p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <button className="btn-ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
              <div className="font-semibold">{format(month, 'MMMM yyyy')} <button className="text-xs text-teal underline ml-2 font-normal" onClick={() => { setMonth(startOfMonth(new Date())); setPicked(today()); }}>Today</button></div>
              <button className="btn-ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] text-teal mb-1">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-px bg-sky/60 border border-sky/60 rounded-lg overflow-hidden">
              {weeks.map((d) => {
                const k = format(d, 'yyyy-MM-dd'), list = on(k);
                return (
                  <button key={k} onClick={() => setPicked(k)} className={`min-h-16 sm:min-h-24 p-1 text-left align-top bg-white hover:bg-beige ${isSameMonth(d, month) ? '' : 'opacity-40'} ${picked === k ? 'ring-2 ring-inset ring-navy' : ''}`}>
                    <div className={`text-xs ${k === today() ? 'inline-flex w-5 h-5 items-center justify-center rounded-full bg-navy text-white' : 'text-teal'}`}>{format(d, 'd')}</div>
                    <div className="space-y-0.5 mt-0.5">
                      {list.slice(0, 2).map((i) => <div key={i.id} className={`hidden sm:block truncate rounded px-1 text-[11px] leading-4 ${TONE[i.kind] ?? 'bg-sky/50 text-navy'}`}>{i.title}</div>)}
                      {list.length > 2 && <div className="hidden sm:block text-[11px] text-teal">+{list.length - 2} more</div>}
                      {list.length > 0 && <div className="sm:hidden flex gap-0.5 flex-wrap">{list.slice(0, 3).map((i) => <span key={i.id} className="w-1.5 h-1.5 rounded-full bg-navy" />)}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'calendar' && (
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold">{day(picked)}</h3>
            {on(picked).length === 0 ? <p className="text-sm text-teal">Nothing on this day.</p> : on(picked).map((i) => (
              <div key={i.id} className="flex items-center gap-3 text-sm"><span className="w-14 text-teal shrink-0">{i.extra?.time ?? ''}</span><span className="flex-1 min-w-0 truncate">{i.title}</span><span className="text-xs text-teal">{LABEL[i.kind] ?? i.kind}</span></div>
            ))}
            <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-sky/60">
              <input className="input flex-1 min-w-40" placeholder="Add an event on this day" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <input className="input w-auto" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
              <button className="btn" disabled={!f.title.trim()} onClick={async () => { await api.post(`workspaces/${id}/items`, { kind: 'event', title: f.title, due_on: picked, extra: f.time ? { time: f.time } : {} }); setF({ title: '', time: '' }); load(); }}><Plus size={14} /> Add</button>
            </div>
          </div>
        )}

        {view === 'list' && (
          <>
            <div className="card p-4"><h3 className="font-semibold mb-1">Coming up</h3>{upcoming.length === 0 ? <p className="text-sm text-teal">Nothing dated yet.</p> : upcoming.map(line)}</div>
            {past.length > 0 && <details><summary className="text-sm text-teal cursor-pointer">Past or overdue ({past.length})</summary><div className="card p-4 mt-2">{past.map(line)}</div></details>}
          </>
        )}
      </div>
    );
  };

  const groups = [...GROUPS, ...(modules.length ? [{ title: JOB_TYPES[ws.job_type], secs: modules }] : []), { title: '', secs: [WRAP] }];
  const flat = groups.flatMap((g) => g.secs);
  const spec = SPECS[sec];
  const label = flat.find((x) => x.id === sec)?.label ?? '';
  const navBtn = (x: Sec) => {
    const on = sec === x.id, Icon = x.icon;
    return (
      <button key={x.id} onClick={() => { setSec(x.id); setMsg(''); }} className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl text-sm whitespace-nowrap transition-colors ${on ? 'bg-white/15 text-white font-semibold' : 'text-sky hover:bg-white/10 hover:text-white'}`}>
        <Icon size={17} className={on ? 'text-white' : 'text-sky/80'} /> {x.label}
      </button>
    );
  };

  return (
    <div className="md:flex md:min-h-[calc(100vh-56px)]">
      <aside className="bg-navy text-white border-t border-white/10 md:w-64 md:shrink-0 md:sticky md:top-0 md:self-start md:h-screen md:overflow-y-auto">
        <div className="px-4 pt-4 pb-3 md:px-5 md:pt-5 md:pb-4 border-b border-white/10">
          <Link to="/thrive" className="text-xs text-sky hover:text-white inline-flex items-center gap-1 mb-3"><ArrowLeft size={13} /> All workspaces</Link>
          <div className="font-display text-lg font-bold leading-tight">{ws.employer}</div>
          <div className="text-sm text-sky mt-0.5">{ws.title}</div>
          {locked && <div className="text-[11px] text-sky/80 mt-1">Wrapped up{ws.end_date ? ` ${day(ws.end_date)}` : ''}</div>}
        </div>
        <nav className="hidden md:block px-3 py-4 space-y-5">
          {groups.map((g, k) => (
            <div key={k} className={k > 0 && !g.title ? 'pt-4 border-t border-white/10' : ''}>
              {g.title && <div className="text-[11px] uppercase tracking-wider text-sky/60 px-3 pb-1.5">{g.title}</div>}
              <div className="space-y-0.5">{g.secs.map(navBtn)}</div>
            </div>
          ))}
        </nav>
        <nav className="md:hidden flex gap-1 overflow-x-auto px-3 py-2">
          {flat.map((x) => <div key={x.id} className="shrink-0">{navBtn(x)}</div>)}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 px-4 py-6 md:px-10 md:py-8">
        <div className="max-w-6xl space-y-5">
          <h2 className="text-2xl font-semibold">{label}</h2>
          {msg && <div className="text-sm text-teal">{msg}</div>}

          {sec === 'overview' && (
            <div className="space-y-5">
              <div className="card p-4 space-y-2">
                <h3 className="font-semibold">What this job is</h3>
                <textarea className="input" rows={6} placeholder="Your responsibilities, in your own words." value={resp} onChange={(e) => { setResp(e.target.value); setRespDirty(true); }} />
                <button className="btn" disabled={!respDirty} onClick={async () => { await api.patch(`workspaces/${id}`, { responsibilities: resp }); setRespDirty(false); setMsg('Saved.'); load(); }}>{respDirty ? 'Save' : 'Saved'}</button>
              </div>
              <div className="card p-4 space-y-2">
                <h3 className="font-semibold">Job type</h3>
                <p className="text-xs text-teal">Adds the sections that fit this kind of work. Changing it never removes anything you have saved.</p>
                <select className="input w-auto" value={ws.job_type} onChange={async (e) => setWs(await api.patch<Workspace>(`workspaces/${id}`, { job_type: e.target.value }))}>
                  {Object.entries(JOB_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold mb-1">Next up</h3>
                {items.filter((i) => ['task', 'goal', 'deliverable'].includes(i.kind) && !i.done_at).slice(0, 5).map((i) => <div key={i.id} className="text-sm py-1">{i.title}{i.due_on ? <span className="text-teal"> · {day(i.due_on)}</span> : ''}</div>)}
                {items.filter((i) => ['task', 'goal', 'deliverable'].includes(i.kind) && !i.done_at).length === 0 && <p className="text-sm text-teal">Nothing open.</p>}
              </div>
            </div>
          )}

          {sec === 'schedule' && <Schedule />}
          {spec && <Section spec={spec} key={sec} />}

          {sec === 'lessons' && <LessonPlanner workspaceId={ws.id} items={items} />}

          {sec === 'wins' && (
            <div className="space-y-4">
              <div className="card p-4 space-y-2">
                <p className="text-xs text-teal">Saved to Rise as a win at {ws.employer}, so you have the evidence when it is time to ask for more.</p>
                <input className="input" placeholder="What did you do?" value={win.title} onChange={(e) => setWin({ ...win, title: e.target.value })} />
                <input className="input" placeholder="What changed because of it? Numbers only if they are real." value={win.impact} onChange={(e) => setWin({ ...win, impact: e.target.value })} />
                <button className="btn" disabled={!win.title.trim()} onClick={async () => { await api.post('wins', { title: win.title, impact: win.impact, employer: ws.employer, role: ws.title, happened_on: today(), category: 'project' }); setWin({ title: '', impact: '' }); loadWins(ws); }}>Save win</button>
              </div>
              <div className="card p-4">
                {wins.length === 0 && <p className="text-sm text-teal">No wins logged for {ws.employer} yet.</p>}
                {wins.map((w) => <div key={w.id} className="py-2 border-b border-sky/60 last:border-0"><div className="text-sm font-medium">{w.title}</div>{w.impact && <div className="text-sm text-teal">{w.impact}</div>}</div>)}
                {wins.length > 0 && <Link to="/rise" className="text-xs text-teal underline">Edit or add proof in Rise</Link>}
              </div>
            </div>
          )}

          {sec === 'wrap' && (
            <div className="space-y-4">
              {!locked ? (
                <>
                  <div className="card p-5 space-y-3">
                    <p className="text-sm">When a job ends, go through this list. Nothing is deleted: the workspace moves to Wrapped up and stays here.</p>
                    {CHECKS.map(([k, text, to, lab]) => (
                      <label key={k} className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={!!ws.wrapup[k]} onChange={async () => setWs(await api.patch<Workspace>(`workspaces/${id}`, { wrapup: { ...ws.wrapup, [k]: !ws.wrapup[k] } }))} />
                        <span className="flex-1">{text}{to && <> <Link to={to} className="text-teal underline">{lab}</Link></>}</span></label>
                    ))}
                  </div>
                  <div className="card p-5 flex flex-wrap items-center gap-3">
                    <label className="text-sm">Last day <input className="input w-auto ml-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
                    <button className="btn" disabled={!end} onClick={async () => { if (confirm('Wrap up this job? It moves to Wrapped up and its end date is saved to Roles and pay. You can reopen it any time.')) setWs(await api.post<Workspace>(`workspaces/${id}/wrapup`, { end_date: end })); }}>Wrap up this job</button>
                  </div>
                </>
              ) : (
                <div className="card p-5 space-y-3 text-center">
                  <p className="text-sm">Wrapped up on {day(ws.wrapped_up_at!.slice(0, 10))}. Your wins, tasks, notes, and people are all still here.</p>
                  <button className="btn-ghost" onClick={async () => setWs(await api.post<Workspace>(`workspaces/${id}/reopen`))}><RotateCcw size={13} /> Reopen this job</button>
                </div>
              )}
              <button className="btn-ghost mx-auto block" onClick={async () => { if (confirm('Move this workspace to Recently deleted? You can restore it from Thrive.')) { await api.del(`workspaces/${id}`); nav('/thrive'); } }}><Trash2 size={13} className="inline" /> Delete this workspace</button>
            </div>
          )}

          {(ws.gone ?? []).length > 0 && (
            <details><summary className="text-sm text-teal cursor-pointer">Recently deleted ({ws.gone!.length})</summary>
              <div className="card p-3 mt-2">{ws.gone!.map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-1.5 text-sm"><span className="text-teal w-20 truncate">{i.kind}</span><span className="flex-1 truncate">{i.title}</span>
                  <button className="btn-ghost" onClick={async () => { await api.post(`ws-items/${i.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>
              ))}</div></details>
          )}
        </div>
      </div>
    </div>
  );
}
