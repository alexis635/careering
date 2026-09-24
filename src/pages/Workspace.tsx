import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Workspace, WsItem } from '../types';

const TABS = ['Overview', 'Tasks', 'Notes', 'People', 'Wrap up'] as const;
type Tab = (typeof TABS)[number];
const day = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'MMM d, yyyy') : '');

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
  const [tab, setTab] = useState<Tab>('Overview');
  const [resp, setResp] = useState('');
  const [respDirty, setRespDirty] = useState(false);
  const [end, setEnd] = useState('');
  const [win, setWin] = useState({ title: '', impact: '' });
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ title: '', body: '', due_on: '', email: '' });

  const load = () => api.get<Workspace>(`workspaces/${id}`).then((w) => { setWs(w); if (!respDirty) setResp(w.responsibilities); });
  useEffect(() => { load(); }, [id]);
  if (!ws) return <div className="text-teal text-center">Loading…</div>;
  const items = ws.items ?? [];
  const of = (k: WsItem['kind']) => items.filter((i) => i.kind === k);
  const locked = !!ws.wrapped_up_at;

  const add = async (kind: WsItem['kind'], extra: Record<string, string> = {}) => {
    if (!f.title.trim()) return;
    await api.post(`workspaces/${id}/items`, { kind, title: f.title, body: f.body, due_on: f.due_on || null, extra });
    setF({ title: '', body: '', due_on: '', email: '' }); load();
  };
  const patch = async (i: WsItem, body: any) => { await api.patch(`ws-items/${i.id}`, body); load(); };
  const del = async (i: WsItem) => { await api.del(`ws-items/${i.id}`); load(); };
  const saveResp = async () => { await api.patch(`workspaces/${id}`, { responsibilities: resp }); setRespDirty(false); setMsg('Saved.'); load(); };
  const logWin = async () => {
    if (!win.title.trim()) return;
    await api.post('wins', { title: win.title, impact: win.impact, employer: ws.employer, role: ws.title, happened_on: format(new Date(), 'yyyy-MM-dd'), category: 'project' });
    setWin({ title: '', impact: '' }); setMsg('Win saved to Rise.');
  };
  const toggleCheck = async (k: string) => { const w = await api.patch<Workspace>(`workspaces/${id}`, { wrapup: { ...ws.wrapup, [k]: !ws.wrapup[k] } }); setWs(w); };

  const row = (i: WsItem, extra?: React.ReactNode) => (
    <div key={i.id} className="flex items-start gap-3 py-2 border-b border-sky/60 last:border-0">
      {extra}
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${i.done_at ? 'line-through text-teal' : 'font-medium'}`}>{i.title}</div>
        {i.body && <div className="text-sm text-teal whitespace-pre-wrap">{i.body}</div>}
        {(i.due_on || i.extra?.email) && <div className="text-xs text-teal">{i.due_on ? `Due ${day(i.due_on)}` : ''}{i.extra?.email ? i.extra.email : ''}</div>}
      </div>
      <button className="btn-ghost" title="Move to Recently deleted" onClick={() => del(i)}><Trash2 size={13} /></button>
    </div>
  );
  const AddBox = ({ kind, ph, due, bodyPh, email }: { kind: WsItem['kind']; ph: string; due?: boolean; bodyPh?: string; email?: boolean }) => (
    <div className="card p-4 space-y-2">
      <input className="input" placeholder={ph} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      {bodyPh && <textarea className="input" rows={kind === 'note' ? 6 : 2} placeholder={bodyPh} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}
      {email && <input className="input" type="email" placeholder="Email (optional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
      <div className="flex items-center gap-2">
        {due && <input className="input w-auto" type="date" title="Due date" value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} />}
        <button className="btn" disabled={!f.title.trim()} onClick={() => add(kind, email && f.email ? { email: f.email } : {})}><Plus size={14} /> Add</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link to="/thrive" className="text-sm text-teal inline-flex items-center gap-1"><ArrowLeft size={14} /> Thrive</Link>
      <div className="text-center">
        <h1 className="text-3xl font-bold">{ws.employer}</h1>
        <p className="text-teal">{ws.title}{ws.start_date ? ` · since ${day(ws.start_date)}` : ''}{locked && ws.end_date ? ` · ended ${day(ws.end_date)}` : ''}</p>
        {locked && <p className="text-xs text-teal mt-1">Wrapped up. Everything stays here and stays searchable.</p>}
      </div>
      <div className="flex justify-center gap-1 border-b border-sky overflow-x-auto overflow-y-hidden">
        {TABS.map((t) => <button key={t} onClick={() => { setTab(t); setMsg(''); }} className={`px-3.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-navy font-semibold' : 'border-transparent text-teal hover:text-navy'}`}>{t}</button>)}
      </div>
      {msg && <div className="text-sm text-teal text-center">{msg}</div>}

      {tab === 'Overview' && (
        <div className="space-y-5">
          <div className="card p-4 space-y-2">
            <h2 className="font-semibold">What this job is</h2>
            <textarea className="input" rows={6} placeholder="Your responsibilities, in your own words." value={resp} onChange={(e) => { setResp(e.target.value); setRespDirty(true); }} />
            <button className="btn" disabled={!respDirty} onClick={saveResp}>{respDirty ? 'Save' : 'Saved'}</button>
          </div>
          <div className="card p-4">
            <h2 className="font-semibold mb-1">Goals</h2>
            {of('goal').length === 0 && <p className="text-sm text-teal">No goals yet.</p>}
            {of('goal').map((g) => row(g, <input type="checkbox" className="mt-1" checked={!!g.done_at} onChange={(e) => patch(g, { done: e.target.checked })} />))}
          </div>
          <AddBox kind="goal" ph="Add a goal, like: run the fall showcase" due bodyPh="Optional detail" />
          <div className="card p-4 space-y-2">
            <h2 className="font-semibold">Capture a win</h2>
            <p className="text-xs text-teal">Saved to Rise as a win at {ws.employer}, so you have it when you need it.</p>
            <input className="input" placeholder="What did you do?" value={win.title} onChange={(e) => setWin({ ...win, title: e.target.value })} />
            <input className="input" placeholder="What changed because of it? Numbers only if they are real." value={win.impact} onChange={(e) => setWin({ ...win, impact: e.target.value })} />
            <button className="btn" disabled={!win.title.trim()} onClick={logWin}>Save win</button>
          </div>
        </div>
      )}

      {tab === 'Tasks' && (
        <div className="space-y-4">
          <AddBox kind="task" ph="Add a task" due />
          <div className="card p-4">
            {of('task').length === 0 && <p className="text-sm text-teal">No tasks yet.</p>}
            {[...of('task').filter((t) => !t.done_at).sort((a, b) => (a.due_on ?? '9') .localeCompare(b.due_on ?? '9')), ...of('task').filter((t) => t.done_at)].map((t) => row(t, <input type="checkbox" className="mt-1" checked={!!t.done_at} onChange={(e) => patch(t, { done: e.target.checked })} />))}
          </div>
        </div>
      )}

      {tab === 'Notes' && (
        <div className="space-y-4">
          <AddBox kind="note" ph="Title, like: 1:1 with my manager" bodyPh="What was said, decided, or promised" />
          <div className="card p-4">{of('note').length === 0 && <p className="text-sm text-teal">No notes yet.</p>}{of('note').map((n) => row(n))}</div>
        </div>
      )}

      {tab === 'People' && (
        <div className="space-y-4">
          <AddBox kind="contact" ph="Name" bodyPh="Their role and how they help" email />
          <div className="card p-4">{of('contact').length === 0 && <p className="text-sm text-teal">No one yet.</p>}{of('contact').map((n) => row(n))}</div>
        </div>
      )}

      {tab === 'Wrap up' && (
        <div className="space-y-4">
          {!locked ? (
            <>
              <div className="card p-5 space-y-3">
                <p className="text-sm">When a job ends, go through this list. Nothing is deleted: the workspace moves to Wrapped up and stays here.</p>
                {CHECKS.map(([k, text, to, label]) => (
                  <label key={k} className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={!!ws.wrapup[k]} onChange={() => toggleCheck(k)} />
                    <span className="flex-1">{text}{to && <> <Link to={to} className="text-teal underline">{label}</Link></>}</span></label>
                ))}
              </div>
              <div className="card p-5 flex flex-wrap items-center gap-3">
                <label className="text-sm">Last day <input className="input w-auto ml-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
                <button className="btn" disabled={!end} onClick={async () => { if (confirm('Wrap up this job? It moves to Wrapped up and its end date is saved to Roles and pay. You can reopen it any time.')) { setWs(await api.post<Workspace>(`workspaces/${id}/wrapup`, { end_date: end })); } }}>Wrap up this job</button>
              </div>
            </>
          ) : (
            <div className="card p-5 space-y-3 text-center">
              <p className="text-sm">Wrapped up on {day(ws.wrapped_up_at!.slice(0, 10))}. Your wins, tasks, notes, and people are all still here.</p>
              <button className="btn-ghost" onClick={async () => { setWs(await api.post<Workspace>(`workspaces/${id}/reopen`)); }}><RotateCcw size={13} /> Reopen this job</button>
            </div>
          )}
          <button className="btn-ghost mx-auto block" onClick={async () => { if (confirm('Move this workspace to Recently deleted? You can restore it from Thrive.')) { await api.del(`workspaces/${id}`); nav('/thrive'); } }}><Trash2 size={13} className="inline" /> Delete this workspace</button>
        </div>
      )}

      {(ws.gone ?? []).length > 0 && (
        <details><summary className="text-sm text-teal cursor-pointer">Recently deleted ({ws.gone!.length})</summary>
          <div className="card p-3 mt-2">{ws.gone!.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-1.5 text-sm"><span className="text-teal w-14">{i.kind}</span><span className="flex-1 truncate">{i.title}</span>
              <button className="btn-ghost" onClick={async () => { await api.post(`ws-items/${i.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>
          ))}</div></details>
      )}
    </div>
  );
}
