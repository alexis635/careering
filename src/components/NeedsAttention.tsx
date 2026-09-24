import { Link } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Attention } from '../types';

function rel(dateStr: string) {
  const d = differenceInCalendarDays(parseISO(dateStr.slice(0, 10)), new Date());
  if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, late: true };
  if (d === 0) return { text: 'today', late: true };
  if (d === 1) return { text: 'tomorrow', late: false };
  return { text: `in ${d} days`, late: false };
}

export default function NeedsAttention({ att }: { att: Attention | null }) {
  if (!att) return null;
  const soon = att.deadlines.filter((d) => differenceInCalendarDays(parseISO(d.deadline), new Date()) <= 14);
  const acts = att.actions;
  const stale = att.stale.filter((s) => differenceInCalendarDays(new Date(), parseISO(s.last_activity)) >= 7);
  const creds = att.credentials ?? [];
  if (!soon.length && !acts.length && !stale.length && !creds.length) return null;
  const row = 'flex items-center gap-3 py-1.5 text-sm';
  return (
    <div className="card p-5 mb-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-2 text-center">Needs attention</h2>
      <div className="divide-y divide-sky/60">
        {creds.map((c) => { const r = rel(c.expires_on); const past = differenceInCalendarDays(parseISO(c.expires_on), new Date()) < 0; return (
          <Link key={`c${c.id}`} to="/vault" className={row}>
            <span className="w-2 h-2 rounded-full shrink-0 bg-navy" />
            <span className="font-medium">{c.title}</span><span className="text-teal">Credential</span>
            <span className={`ml-auto ${r.late ? 'font-semibold' : 'text-teal'}`}>{past ? `Expired ${r.text.replace(' overdue', ' ago')}` : `Expires ${r.text}`}</span>
          </Link>); })}
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
