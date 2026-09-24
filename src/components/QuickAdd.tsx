import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Job, Lane } from '../types';

/** Paste a job link, pick a lane, and everything else fills itself in. */
export default function QuickAdd({ lanes }: { lanes: Lane[] }) {
  const nav = useNavigate();
  const active = lanes.filter((l) => l.status !== 'achieved');
  const [laneId, setLaneId] = useState<number | ''>('');
  const [link, setLink] = useState('');
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const [newId, setNewId] = useState<number | null>(null);
  const chosen = laneId || active[0]?.id || '';

  if (!active.length) return <p className="text-sm text-teal text-center">Create a lane first, then you can add jobs here. <Link className="underline" to="/lanes">Go to Lanes</Link></p>;

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim() || !chosen) return;
    setErr(''); setNewId(null);
    const job = await api.post<Job>('jobs', { lane_id: Number(chosen), type: 'application', source_link: link.trim() });
    setNewId(job.id);
    try {
      setProgress('Reading the posting…');
      await api.post('ai/import', { job_id: job.id });
      setProgress('Checking how well it fits…');
      await api.post('ai/match', { job_id: job.id }).catch(() => {});
      nav(`/jobs/${job.id}`);
    } catch (x: any) { setErr(x.message); setProgress(''); }
  }

  return (
    <form onSubmit={go} className="space-y-2">
      <div className="flex flex-wrap gap-2 justify-center">
        <input className="input flex-1 min-w-64 max-w-xl" placeholder="Paste a job posting link" value={link} onChange={(e) => setLink(e.target.value)} />
        <select className="input w-auto" value={chosen} onChange={(e) => setLaneId(Number(e.target.value))}>
          {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button className="btn" disabled={!!progress || !link.trim()}>{progress || 'Add and import'}</button>
      </div>
      {err && <p className="text-sm text-red-700 text-center">{err}{newId && <> The job was still added. <Link className="underline" to={`/jobs/${newId}`}>Open it</Link> and paste the posting text.</>}</p>}
    </form>
  );
}
