import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { LANE_COLORS, STAGES, type Attention, type Lane } from '../types';

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
  const [att, setAtt] = useState<Attention | null>(null);

  const load = () => api.get<Lane[]>('lanes').then(setLanes);
  useEffect(() => { load(); api.get<Attention>('attention').then(setAtt).catch(() => {}); }, []);

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

      <NeedsAttention att={att} />

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

function rel(dateStr: string) {
  const d = differenceInCalendarDays(parseISO(dateStr.slice(0, 10)), new Date());
  if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, late: true };
  if (d === 0) return { text: 'today', late: true };
  if (d === 1) return { text: 'tomorrow', late: false };
  return { text: `in ${d} days`, late: false };
}

function NeedsAttention({ att }: { att: Attention | null }) {
  if (!att) return null;
  const soon = att.deadlines.filter((d) => differenceInCalendarDays(parseISO(d.deadline), new Date()) <= 14);
  const acts = att.actions;
  const stale = att.stale.filter((s) => differenceInCalendarDays(new Date(), parseISO(s.last_activity)) >= 7);
  if (!soon.length && !acts.length && !stale.length) return null;
  const row = 'flex items-center gap-3 py-1.5 text-sm';
  return (
    <div className="card p-5 mb-6">
      <h2 className="text-xl font-semibold mb-2">Needs attention</h2>
      <div className="divide-y divide-sky/60">
        {soon.map((d) => { const r = rel(d.deadline); return (
          <Link key={`d${d.id}`} to={`/jobs/${d.id}`} className={row}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="font-medium">{d.company || 'Untitled'}</span><span className="text-teal">{d.role_title}</span>
            <span className={`ml-auto ${r.late ? 'font-semibold' : 'text-teal'}`}>Deadline {r.text}</span>
          </Link>); })}
        {acts.map((a) => { const r = rel(a.due_date); return (
          <Link key={`a${a.id}`} to={`/jobs/${a.job_id}`} className={row}>
            <span className="w-2 h-2 rounded-full shrink-0 bg-navy" />
            <span>{a.text}</span><span className="text-teal">{a.company}</span>
            <span className={`ml-auto ${r.late ? 'font-semibold' : 'text-teal'}`}>Due {r.text}</span>
          </Link>); })}
        {stale.map((s) => { const days = differenceInCalendarDays(new Date(), parseISO(s.last_activity)); return (
          <Link key={`s${s.id}`} to={`/jobs/${s.id}`} className={row}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="font-medium">{s.company || 'Untitled'}</span><span className="text-teal">{s.role_title}</span>
            <span className="ml-auto text-teal">{s.stage}, no activity for {days} days. Time to follow up?</span>
          </Link>); })}
      </div>
    </div>
  );
}
