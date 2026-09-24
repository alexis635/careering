import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../api';
import type { Role, Workspace } from '../types';
import { JOB_TYPES } from './Workspace';

const fmt = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'MMM yyyy') : '');

export default function Thrive() {
  const nav = useNavigate();
  const [list, setList] = useState<Workspace[] | null>(null);
  const [gone, setGone] = useState<Workspace[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ role_id: '', employer: '', title: '', start_date: '', job_type: 'general' });
  const [err, setErr] = useState('');
  const load = () => {
    api.get<Workspace[]>('workspaces').then(setList);
    api.get<Workspace[]>('workspaces?deleted=1').then(setGone).catch(() => {});
    api.get<Role[]>('roles').then(setRoles).catch(() => {});
  };
  useEffect(load, []);

  const used = new Set((list ?? []).map((w) => w.role_id));
  const free = roles.filter((r) => !used.has(r.id) && !r.end_date);
  async function create() {
    setErr('');
    try { const w = await api.post<Workspace>('workspaces', form.role_id ? { role_id: Number(form.role_id), job_type: form.job_type } : { employer: form.employer, title: form.title, start_date: form.start_date || null, job_type: form.job_type }); nav(`/thrive/${w.id}`); }
    catch (e: any) { setErr(e.message); }
  }
  const active = (list ?? []).filter((w) => !w.wrapped_up_at);
  const done = (list ?? []).filter((w) => w.wrapped_up_at);
  const card = (w: Workspace) => (
    <Link key={w.id} to={`/thrive/${w.id}`} className="card p-4 block hover:bg-beige">
      <div className="font-semibold">{w.employer}</div>
      <div className="text-sm text-teal">{w.title || 'Role'}{w.start_date ? ` · since ${fmt(w.start_date)}` : ''}{w.wrapped_up_at && w.end_date ? ` to ${fmt(w.end_date)}` : ''}</div>
      {!w.wrapped_up_at && <div className="text-xs text-teal mt-1">{w.open_tasks ? `${w.open_tasks} open task${w.open_tasks === 1 ? '' : 's'}` : 'No open tasks'}</div>}
    </Link>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Thrive</h1>
        <p className="text-teal mt-1">A home for each job you are in now.</p>
      </div>

      {list && active.length === 0 && !adding && (
        <div className="card p-6 text-center space-y-2">
          <p className="text-sm">No workspaces yet. Start one for any job you hold, including several at once. Each keeps its own tasks, goals, notes, and people, and wraps up cleanly when the job ends.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">{active.map(card)}</div>

      {!adding ? (
        <div className="text-center"><button className="btn" onClick={() => setAdding(true)}>Start a workspace</button></div>
      ) : (
        <div className="card p-5 space-y-3">
          {free.length > 0 && (
            <select className="input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              <option value="">A job not in my Roles yet…</option>
              {free.map((r) => <option key={r.id} value={r.id}>{r.employer}{r.title ? `, ${r.title}` : ''}</option>)}
            </select>
          )}
          {!form.role_id && (
            <div className="grid sm:grid-cols-3 gap-2">
              <input className="input" placeholder="Employer" value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} />
              <input className="input" placeholder="Your title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className="input" type="date" title="Start date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
          )}
          <select className="input" value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}>{Object.entries(JOB_TYPES).map(([k, v]) => <option key={k} value={k}>Job type: {v}</option>)}</select>
          <div className="flex items-center gap-3">
            <button className="btn" disabled={!form.role_id && !form.employer.trim()} onClick={create}>Create workspace</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setErr(''); }}>Cancel</button>
            {err && <span className="text-sm text-red-700">{err}</span>}
          </div>
          <p className="text-xs text-teal">A new job is also added to Roles and pay so your history stays in one place.</p>
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-2"><h2 className="text-lg font-semibold text-center">Wrapped up</h2><div className="grid gap-3 sm:grid-cols-2">{done.map(card)}</div></div>
      )}
      {gone.length > 0 && (
        <details><summary className="text-sm text-teal cursor-pointer">Recently deleted ({gone.length})</summary>
          <div className="space-y-2 mt-2">{gone.map((w) => (
            <div key={w.id} className="card p-3 flex items-center gap-3"><span className="text-sm">{w.employer}{w.title ? `, ${w.title}` : ''}</span>
              <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`workspaces/${w.id}/restore`); load(); }}>Restore</button></div>
          ))}</div></details>
      )}
      <div className="card p-5 text-center space-y-2">
        <p className="text-sm">Whatever you accomplish at work, capture it as a win so you have the evidence when it is time to ask for more.</p>
        <Link to="/rise" className="btn inline-flex">Go to Rise</Link>
      </div>
    </div>
  );
}
