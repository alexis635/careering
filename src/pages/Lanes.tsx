import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { LANE_COLORS, stageInfo, type Lane } from '../types';

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
  const [start, setStart] = useState('');
  const [target, setTarget] = useState('');

  const load = () => api.get<Lane[]>('lanes').then(setLanes);
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post('lanes', {
      name: name.trim(),
      start_date: start || null,
      target_date: target || null,
      color: LANE_COLORS[(lanes?.length ?? 0) % LANE_COLORS.length],
      position: lanes?.length ?? 0,
    });
    setName(''); setStart(''); setTarget(''); setAdding(false); load();
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-3 mb-6">
        <h1 className="text-4xl font-bold">Lanes</h1>
        <button className="btn" onClick={() => setAdding((v) => !v)}><Plus size={16} /> New lane</button>
      </div>

      {adding && (
        <form onSubmit={create} className="card p-4 mb-5 max-w-2xl mx-auto flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-56">
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LA · Teaching" autoFocus />
          </div>
          <div>
            <label className="label">Starts</label>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Target date</label>
            <input className="input" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <button className="btn">Add</button>
        </form>
      )}

      {lanes && lanes.length === 0 && !adding && (
        <p className="text-teal text-center">No lanes yet. A lane is a parallel career track, like "Bridge · Remote" or "LA · Teaching".</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
        {lanes?.map((l) => {
          const total = l.counts?.reduce((s, c) => s + c.n, 0) ?? 0;
          return (
            <Link key={l.id} to={`/lanes/${l.id}`} className="card overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-2" style={{ background: l.color }} />
              <div className="p-5">
                <div className="flex items-start justify-center gap-2 text-center">
                  <h2 className="text-xl font-semibold leading-tight">{l.name}</h2>
                  {l.status !== 'active' && <span className="text-xs bg-sky/60 rounded px-2 py-0.5">{l.status}</span>}
                </div>
                {l.start_date && l.target_date && <p className="text-xs text-teal mt-1 text-center">{format(parseISO(l.start_date.slice(0, 10)), 'MMM yyyy')} to {format(parseISO(l.target_date.slice(0, 10)), 'MMM yyyy')}</p>}
                {countdown(l.target_date) && <p className="text-sm text-teal mt-1 text-center">{countdown(l.target_date)}</p>}
                <div className="mt-4 grid gap-1 text-center" style={{ gridTemplateColumns: `repeat(${stageInfo(l).stages.length}, minmax(0, 1fr))` }}>
                  {stageInfo(l).stages.map((s) => (
                    <div key={s.key}>
                      <div className="text-lg font-semibold">{l.counts?.find((c) => c.stage === s.key)?.n ?? 0}</div>
                      <div className="text-[10px] uppercase tracking-wide text-teal truncate">{s.label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-teal mt-3 text-center">{total} {total === 1 ? 'entry' : 'entries'}</p>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-center mt-8"><Link to="/archive" className="text-sm text-teal underline">Archive & Trash</Link></p>
    </div>
  );
}
