import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { LANE_COLORS, STAGES, type Lane } from '../types';

function countdown(d: string | null) {
  if (!d) return null;
  const date = parseISO(d.slice(0, 10));
  const days = differenceInCalendarDays(date, new Date());
  const label = format(date, 'MMM yyyy');
  if (days < 0) return `${label} · passed`;
  return days > 60 ? `${label} · ${Math.round(days / 30)} mo` : `${label} · ${days} days`;
}

export default function Lanes() {
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  const load = () => api.get<Lane[]>('lanes').then(setLanes);
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post('lanes', {
      name: name.trim(),
      target_date: target || null,
      color: LANE_COLORS[(lanes?.length ?? 0) % LANE_COLORS.length],
      position: lanes?.length ?? 0,
    });
    setName(''); setTarget(''); setAdding(false); load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-3xl font-bold">Lanes</h1>
        <button className="btn" onClick={() => setAdding((v) => !v)}><Plus size={16} /> New lane</button>
      </div>

      {adding && (
        <form onSubmit={create} className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-56">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LA · Teaching" autoFocus />
          </div>
          <div>
            <label className="label">Target date</label>
            <input className="input" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <button className="btn">Add</button>
        </form>
      )}

      {lanes && lanes.length === 0 && !adding && (
        <p className="text-teal">No lanes yet. A lane is a parallel career track, like "Bridge · Remote" or "LA · Teaching".</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lanes?.map((l) => {
          const total = l.counts?.reduce((s, c) => s + c.n, 0) ?? 0;
          return (
            <Link key={l.id} to={`/lanes/${l.id}`} className="card overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-2" style={{ background: l.color }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xl font-semibold leading-tight">{l.name}</h2>
                  {l.status !== 'active' && <span className="text-xs bg-sky/60 rounded px-2 py-0.5">{l.status}</span>}
                </div>
                {countdown(l.target_date) && <p className="text-sm text-teal mt-1">{countdown(l.target_date)}</p>}
                <div className="mt-4 grid grid-cols-6 gap-1 text-center">
                  {STAGES.map((s) => (
                    <div key={s}>
                      <div className="text-lg font-semibold">{l.counts?.find((c) => c.stage === s)?.n ?? 0}</div>
                      <div className="text-[10px] uppercase tracking-wide text-teal truncate">{s}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-teal mt-3">{total} {total === 1 ? 'entry' : 'entries'}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
