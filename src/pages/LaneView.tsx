import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import FitBadge from '../components/FitBadge';
import { OUTCOMES, STAGES, type Job, type Lane, type Stage } from '../types';

export default function LaneView() {
  const { id } = useParams();
  const [lane, setLane] = useState<Lane | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ company: '', role_title: '', type: 'application' });
  const [dragId, setDragId] = useState<number | null>(null);
  const [hideClosed, setHideClosed] = useState(false);
  const [sortFit, setSortFit] = useState(false);

  const load = () => {
    api.get<Lane>(`lanes/${id}`).then(setLane);
    api.get<Job[]>(`jobs?lane_id=${id}`).then(setJobs);
  };
  useEffect(load, [id]);

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company.trim() && !form.role_title.trim()) return;
    await api.post('jobs', { ...form, lane_id: Number(id) });
    setForm({ company: '', role_title: '', type: form.type }); setAdding(false); load();
  }

  async function move(job: Job, stage: Stage, outcome?: string) {
    const patch: any = { stage, closed_outcome: stage === 'Closed' ? outcome ?? job.closed_outcome ?? 'Lost' : null };
    if (stage === 'Applied' && !job.applied_date) patch.applied_date = new Date().toISOString().slice(0, 10);
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, ...patch } : j)));
    await api.patch(`jobs/${job.id}`, patch);
  }

  if (!lane) return null;
  const stages = hideClosed ? STAGES.filter((s) => s !== 'Closed') : STAGES;

  return (
    <div>
      <Link to="/" className="text-sm text-teal inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> All lanes</Link>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="w-3 h-8 rounded" style={{ background: lane.color }} />
        <h1 className="text-3xl font-bold">{lane.name}</h1>
        <label className="ml-auto text-sm flex items-center gap-2 text-teal">
          <input type="checkbox" checked={sortFit} onChange={(e) => setSortFit(e.target.checked)} /> Best fit first
        </label>
        <label className="text-sm flex items-center gap-2 text-teal">
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Hide closed
        </label>
        <button className="btn" onClick={() => setAdding((v) => !v)}><Plus size={16} /> Add</button>
      </div>

      {adding && (
        <form onSubmit={addJob} className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="application">Application</option>
              <option value="logistics">Logistics</option>
            </select>
          </div>
          <div className="flex-1 min-w-44">
            <label className="label">{form.type === 'logistics' ? 'Topic' : 'Company'}</label>
            <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} autoFocus />
          </div>
          <div className="flex-1 min-w-44">
            <label className="label">{form.type === 'logistics' ? 'Detail' : 'Role'}</label>
            <input className="input" value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} />
          </div>
          <button className="btn">Save</button>
        </form>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const rank = { strong: 0, moderate: 1, weak: 2 } as Record<string, number>;
          let col = jobs.filter((j) => j.stage === stage);
          if (sortFit) col = [...col].sort((a, b) => (rank[a.fit ?? ''] ?? 3) - (rank[b.fit ?? ''] ?? 3));
          return (
            <div
              key={stage}
              className="w-64 shrink-0 rounded-xl bg-sky/40 p-2.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const j = jobs.find((x) => x.id === dragId);
                if (j && j.stage !== stage) move(j, stage);
                setDragId(null);
              }}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wide">{stage}</span>
                <span className="text-xs text-teal">{col.length}</span>
              </div>
              <div className="space-y-2 min-h-8">
                {col.map((j) => (
                  <div key={j.id} draggable onDragStart={() => setDragId(j.id)} className="card p-3 cursor-grab active:cursor-grabbing" style={{ borderLeft: `4px solid ${lane.color}` }}>
                    <Link to={`/jobs/${j.id}`} className="block">
                      <div className="font-medium leading-snug">{j.company || 'Untitled'}</div>
                      <div className="text-sm text-teal leading-snug">{j.role_title}</div>
                    </Link>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <FitBadge fit={j.fit} />
                      {j.type === 'logistics' && <span className="text-[10px] uppercase bg-beige rounded px-1.5 py-0.5">logistics</span>}
                      {stage === 'Closed' ? (
                        <select className="text-xs bg-beige rounded px-1 py-0.5" value={j.closed_outcome ?? 'Lost'} onChange={(e) => move(j, 'Closed', e.target.value)}>
                          {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : null}
                      <select className="text-xs bg-beige rounded px-1 py-0.5 ml-auto" value={j.stage} onChange={(e) => move(j, e.target.value as Stage)}>
                        {STAGES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
