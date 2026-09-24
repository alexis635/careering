import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Win, Workspace, WsItem } from '../types';

const day = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'MMM d, yyyy') : '');
const today = () => format(new Date(), 'yyyy-MM-dd');

export const JOB_TYPES: Record<string, string> = { general: 'General', pm: 'Project management', teaching: 'Teaching', freelance: 'Freelance or contract' };

/** How each list section behaves. One generic list draws them all, so adding a module is adding a line here. */
interface Spec {
  kind: string; label: string; add: string; body?: string; due?: string; time?: boolean; done?: boolean; email?: boolean; link?: boolean; amount?: boolean;
  status?: string[]; note?: string; empty: string;
}
const SPECS: Record<string, Spec> = {
  tasks: { kind: 'task', label: 'Tasks', add: 'Add a task', due: 'Due', done: true, empty: 'No tasks yet.' },
  projects: { kind: 'project', label: 'Projects', add: 'Add a project', body: 'What it is and what done looks like', due: 'Target date', status: ['Planning', 'In progress', 'On hold', 'Done'], empty: 'No projects yet.' },
  goals: { kind: 'goal', label: 'Goals', add: 'Add a goal, like: run the fall showcase', body: 'Optional detail', due: 'By', done: true, empty: 'No goals yet.' },
  notes: { kind: 'note', label: 'Notes and 1:1s', add: 'Title, like: 1:1 with my manager', body: 'What was said, decided, or promised', empty: 'No notes yet.' },
  people: { kind: 'contact', label: 'People', add: 'Name', body: 'Their role and how they help', email: true, empty: 'No one yet.' },
  docs: { kind: 'document', label: 'Documents and handbooks', add: 'Document name, like: Employee handbook', body: 'What it covers, or the parts you need to remember', link: true, note: 'Keep links and notes here. Employer handbooks can be confidential, so paste only what you are allowed to keep. Files and questions to AI are not part of this yet.', empty: 'Nothing saved yet.' },
  stakeholders: { kind: 'stakeholder', label: 'Stakeholders', add: 'Name', body: 'Role, what they care about, how to keep them informed', email: true, empty: 'No stakeholders yet.' },
  risks: { kind: 'risk', label: 'Risks', add: 'Add a risk', body: 'What could go wrong and what you will do about it', status: ['Open', 'Watching', 'Resolved'], empty: 'No risks logged.' },
  courses: { kind: 'course', label: 'Courses', add: 'Course or class', body: 'Grade level, focus, what you are covering', note: 'Keep student names, grades, and personal details out of Careering.', empty: 'No courses yet.' },
  lessons: { kind: 'lesson', label: 'Lesson plans', add: 'Lesson or unit title', body: 'Objective, activities, materials, how you will know it worked', due: 'Teach on', note: 'Keep student names, grades, and personal details out of Careering. Materials your employer owns may not be yours to keep.', empty: 'No lesson plans yet.' },
  certs: { kind: 'cert', label: 'Certification progress', add: 'Requirement', body: 'Details, hours, who to send it to', due: 'Due', status: ['Not started', 'In progress', 'Submitted', 'Complete'], empty: 'Nothing tracked yet.' },
  clients: { kind: 'client', label: 'Clients', add: 'Client name', body: 'Scope, rate, terms', email: true, empty: 'No clients yet.' },
  deliverables: { kind: 'deliverable', label: 'Deliverables', add: 'Add a deliverable', body: 'What you owe and to whom', due: 'Due', done: true, empty: 'No deliverables yet.' },
  invoices: { kind: 'invoice', label: 'Invoices', add: 'Invoice, like: October retainer', body: 'What it covers', due: 'Due', amount: true, status: ['Draft', 'Sent', 'Paid'], empty: 'No invoices yet.' },
};

interface Sec { id: string; label: string }
const CORE: Sec[] = [{ id: 'overview', label: 'Overview' }, { id: 'schedule', label: 'Schedule' }, { id: 'tasks', label: 'Tasks' }, { id: 'projects', label: 'Projects' }, { id: 'goals', label: 'Goals' }, { id: 'notes', label: 'Notes and 1:1s' }, { id: 'people', label: 'People' }, { id: 'docs', label: 'Documents and handbooks' }, { id: 'wins', label: 'Wins' }];
const BY_TYPE: Record<string, Sec[]> = {
  general: [],
  pm: [{ id: 'stakeholders', label: 'Stakeholders' }, { id: 'risks', label: 'Risks' }],
  teaching: [{ id: 'courses', label: 'Courses' }, { id: 'lessons', label: 'Lesson plans' }, { id: 'certs', label: 'Certification progress' }],
  freelance: [{ id: 'clients', label: 'Clients' }, { id: 'deliverables', label: 'Deliverables' }, { id: 'invoices', label: 'Invoices' }],
};
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
  const [sec, setSec] = useState('overview');
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
  if (!ws) return <div className="text-teal text-center">Loading…</div>;
  const items = ws.items ?? [];
  const locked = !!ws.wrapped_up_at;
  const modules = BY_TYPE[ws.job_type] ?? [];
  const patchItem = async (i: WsItem, body: any) => { await api.patch(`ws-items/${i.id}`, body); load(); };

  const Section = ({ spec }: { spec: Spec }) => {
    const [f, setF] = useState({ title: '', body: '', due_on: '', email: '', link: '', amount: '', time: '', status: spec.status?.[0] ?? '' });
    const list = items.filter((i) => i.kind === spec.kind);
    const open = spec.done ? [...list.filter((i) => !i.done_at).sort((a, b) => (a.due_on ?? '9').localeCompare(b.due_on ?? '9')), ...list.filter((i) => i.done_at)] : list;
    const add = async () => {
      if (!f.title.trim()) return;
      const extra: Record<string, string> = {};
      if (spec.email && f.email) extra.email = f.email;
      if (spec.link && f.link) extra.link = f.link;
      if (spec.amount && f.amount) extra.amount = f.amount;
      if (spec.status) extra.status = f.status;
      await api.post(`workspaces/${id}/items`, { kind: spec.kind, title: f.title, body: f.body, due_on: f.due_on || null, extra });
      setF({ ...f, title: '', body: '', due_on: '', email: '', link: '', amount: '' }); load();
    };
    return (
      <div className="space-y-4">
        {spec.note && <p className="text-xs text-teal rounded-lg bg-beige p-3">{spec.note}</p>}
        <div className="card p-4 space-y-2">
          <input className="input" placeholder={spec.add} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          {spec.body && <textarea className="input" rows={spec.kind === 'note' ? 6 : 2} placeholder={spec.body} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}
          <div className="flex flex-wrap items-center gap-2">
            {spec.email && <input className="input flex-1 min-w-40" type="email" placeholder="Email (optional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
            {spec.link && <input className="input flex-1 min-w-40" placeholder="Link (optional)" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />}
            {spec.amount && <input className="input w-32" inputMode="decimal" placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
            {spec.status && <select className="input w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{spec.status.map((s) => <option key={s}>{s}</option>)}</select>}
            {spec.due && <input className="input w-auto" type="date" title={spec.due} value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} />}
            <button className="btn" disabled={!f.title.trim()} onClick={add}><Plus size={14} /> Add</button>
          </div>
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
                  {i.extra?.amount && <span>${Number(i.extra.amount).toLocaleString()}</span>}
                  {i.extra?.email && <a href={`mailto:${i.extra.email}`} className="underline">{i.extra.email}</a>}
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
    const [f, setF] = useState({ title: '', date: today(), time: '', body: '' });
    const dated = items.filter((i) => i.due_on && !i.done_at && i.kind !== 'note');
    const key = (i: WsItem) => `${i.due_on}${i.extra?.time ?? ''}`;
    const upcoming = dated.filter((i) => i.due_on! >= today()).sort((a, b) => key(a).localeCompare(key(b)));
    const past = dated.filter((i) => i.due_on! < today()).sort((a, b) => key(b).localeCompare(key(a)));
    const LABEL: Record<string, string> = { event: 'Event', task: 'Task', goal: 'Goal', project: 'Project', deliverable: 'Deliverable', lesson: 'Lesson', cert: 'Requirement', invoice: 'Invoice' };
    const line = (i: WsItem) => (
      <div key={i.id} className="flex items-center gap-3 py-1.5 text-sm border-b border-sky/60 last:border-0">
        <span className="w-28 text-teal shrink-0">{day(i.due_on)}{i.extra?.time ? `, ${i.extra.time}` : ''}</span>
        <span className="flex-1 min-w-0 truncate">{i.title}</span>
        <span className="text-xs text-teal">{LABEL[i.kind] ?? i.kind}</span>
      </div>
    );
    return (
      <div className="space-y-4">
        <p className="text-sm text-teal">Everything with a date in this job, in one view. Tasks, goals, deliverables and the rest show up here once you give them a date.</p>
        <div className="card p-4 space-y-2">
          <input className="input" placeholder="Add an event, like: staff meeting" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="flex flex-wrap gap-2 items-center">
            <input className="input w-auto" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <input className="input w-auto" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
            <button className="btn" disabled={!f.title.trim() || !f.date} onClick={async () => { await api.post(`workspaces/${id}/items`, { kind: 'event', title: f.title, due_on: f.date, extra: f.time ? { time: f.time } : {} }); setF({ ...f, title: '', time: '' }); load(); }}><Plus size={14} /> Add</button>
          </div>
        </div>
        <div className="card p-4"><h2 className="font-semibold mb-1">Coming up</h2>{upcoming.length === 0 ? <p className="text-sm text-teal">Nothing dated yet.</p> : upcoming.map(line)}</div>
        {past.length > 0 && <details><summary className="text-sm text-teal cursor-pointer">Past or overdue ({past.length})</summary><div className="card p-4 mt-2">{past.map(line)}</div></details>}
      </div>
    );
  };

  const secs = [...CORE, ...modules, { id: 'wrap', label: 'Wrap up' }];
  const spec = SPECS[sec];
  const label = secs.find((s) => s.id === sec)?.label ?? '';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link to="/thrive" className="text-sm text-teal inline-flex items-center gap-1"><ArrowLeft size={14} /> Thrive</Link>
      <div className="text-center">
        <h1 className="text-3xl font-bold">{ws.employer}</h1>
        <p className="text-teal">{ws.title}{ws.start_date ? ` · since ${day(ws.start_date)}` : ''}{locked && ws.end_date ? ` · ended ${day(ws.end_date)}` : ''}</p>
        {locked && <p className="text-xs text-teal mt-1">Wrapped up. Everything stays here and stays searchable.</p>}
      </div>

      <div className="md:grid md:grid-cols-[220px_1fr] md:gap-6 items-start">
        <nav className="md:sticky md:top-4 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 mb-4 md:mb-0 border-b md:border-b-0 border-sky">
          {secs.map((s, k) => (
            <div key={s.id} className="md:w-full shrink-0">
              {(k === CORE.length && modules.length > 0) && <div className="hidden md:block text-[11px] uppercase tracking-wide text-teal px-3 pt-3 pb-1">{JOB_TYPES[ws.job_type]}</div>}
              {(s.id === 'wrap') && <div className="hidden md:block h-2" />}
              <button onClick={() => { setSec(s.id); setMsg(''); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm whitespace-nowrap ${sec === s.id ? 'bg-navy text-white font-semibold' : 'text-navy hover:bg-sky/40'}`}>{s.label}</button>
            </div>
          ))}
        </nav>

        <div className="space-y-5 min-w-0">
          <h2 className="text-xl font-semibold">{label}</h2>
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
