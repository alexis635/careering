import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Mail, Sparkles } from 'lucide-react';
import { api } from '../api';
import FitBadge from '../components/FitBadge';
import type { WeeklyData } from '../types';

const STAGES = ['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer'];

function Block({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-center mb-2">{title}{count !== undefined && <span className="text-teal font-normal"> ({count})</span>}</h2>
      <div className="divide-y divide-sky/60">{children}</div>
    </section>
  );
}

const Row = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm hover:bg-beige/60 -mx-2 px-2 rounded">{children}</Link>
);

export default function Weekly() {
  const [w, setW] = useState<WeeklyData | null>(null);
  const [focus, setFocus] = useState('');
  const [focusBusy, setFocusBusy] = useState(true);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get<WeeklyData>('weekly').then(setW);
    api.post<{ focus: string }>('weekly/focus').then((r) => setFocus(r.focus)).catch(() => {}).finally(() => setFocusBusy(false));
  }, []);

  async function emailMe() {
    setSending(true); setMsg('');
    try { const r = await api.post<{ sentTo: string }>('weekly/email', { focus }); setMsg(`Sent to ${r.sentTo}.`); }
    catch (e: any) { setMsg(e.message); } finally { setSending(false); }
  }

  if (!w) return null;
  const nothing = !w.applied.length && !w.added.length && !w.replies.length && !w.emailsSent && !w.closed.length;
  const days = (d: string) => differenceInCalendarDays(new Date(), parseISO(d.slice(0, 10)));
  const untilDays = (d: string) => differenceInCalendarDays(parseISO(d.slice(0, 10)), new Date());

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Your week</h1>
        <p className="text-teal mt-1">The last 7 days, and what needs you next.</p>
      </div>

      <div className="card p-5 text-center">
        <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wide text-teal mb-1"><Sparkles size={13} /> Focus for the week</div>
        {focusBusy ? <p className="text-sm text-teal">Thinking…</p> : <p className="text-sm leading-relaxed">{focus || 'Add a few jobs and a summary will appear here.'}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <button className="btn-ghost" disabled={sending || focusBusy} onClick={emailMe}><Mail size={14} /> {sending ? 'Sending…' : 'Email me this summary'}</button>
          {msg && <span className="text-sm text-teal">{msg}</span>}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {STAGES.map((s) => (
          <div key={s} className="card py-3 text-center">
            <div className="text-2xl font-display font-bold">{w.pipeline.find((p) => p.stage === s)?.n ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wide text-teal">{s}</div>
          </div>
        ))}
      </div>

      {nothing && <p className="text-center text-sm text-teal">Quiet week so far. Nothing applied, added, or received in the last 7 days.</p>}

      {!!w.applied.length && <Block title="Applied this week" count={w.applied.length}>
        {w.applied.map((j) => <Row key={j.id} to={`/jobs/${j.id}`}><span className="font-medium">{j.company}</span><span className="text-teal">{j.role_title}</span><span className="ml-auto text-xs text-teal">{j.lane_name}</span></Row>)}
      </Block>}

      {!!w.added.length && <Block title="Added this week" count={w.added.length}>
        {w.added.map((j) => <Row key={j.id} to={`/jobs/${j.id}`}><span className="font-medium">{j.company}</span><span className="text-teal">{j.role_title}</span><span className="ml-auto text-xs text-teal">{j.stage}</span></Row>)}
      </Block>}

      <Block title="Replies received" count={w.replies.length}>
        {w.replies.length === 0 && <p className="text-sm text-teal text-center py-1">No replies this week. {w.emailsSent ? `You sent ${w.emailsSent} email${w.emailsSent === 1 ? '' : 's'}.` : ''}</p>}
        {w.replies.map((r) => <Row key={r.id} to={`/jobs/${r.job_id}?tab=Emails`}><span className="font-medium">{r.company}</span><span className="text-teal truncate">{r.subject}</span><span className="ml-auto text-xs text-teal">{format(new Date(r.sent_at), 'MMM d')}</span></Row>)}
      </Block>

      {!!w.closed.length && <Block title="Closed this week" count={w.closed.length}>
        {w.closed.map((j) => <Row key={j.id} to={`/jobs/${j.id}`}><span className="font-medium">{j.company}</span><span className="text-teal">{j.role_title}</span><span className="ml-auto text-xs text-teal">{j.closed_outcome}</span></Row>)}
      </Block>}

      {!!w.stale.length && <Block title="Gone quiet, worth a follow up" count={w.stale.length}>
        {w.stale.map((j) => <Row key={j.id} to={`/jobs/${j.id}`}><span className="font-medium">{j.company}</span><span className="text-teal">{j.role_title}</span><span className="ml-auto text-xs text-teal">{j.stage}, {days(j.last_activity)} days quiet</span></Row>)}
      </Block>}

      {(!!w.deadlines.length || !!w.actions.length) && <Block title="Coming up">
        {w.deadlines.map((d) => <Row key={`d${d.id}`} to={`/jobs/${d.id}`}><span className="font-medium">{d.company || 'Untitled'}</span><span className="text-teal">Deadline</span><span className="ml-auto text-xs text-teal">{untilDays(d.deadline) < 0 ? `${-untilDays(d.deadline)} days overdue` : untilDays(d.deadline) === 0 ? 'today' : `in ${untilDays(d.deadline)} days`}</span></Row>)}
        {w.actions.map((a) => <Row key={`a${a.id}`} to={`/jobs/${a.job_id}`}><span>{a.text}</span><span className="text-teal">{a.company}</span><span className="ml-auto text-xs text-teal">due {format(parseISO(a.due_date.slice(0, 10)), 'MMM d')}</span></Row>)}
      </Block>}

      {!!w.worthApplying.length && <Block title="Good matches you have not applied to yet" count={w.worthApplying.length}>
        {w.worthApplying.map((j) => <Row key={j.id} to={`/jobs/${j.id}`}><span className="font-medium">{j.company}</span><span className="text-teal">{j.role_title}</span><FitBadge fit={j.fit} /><span className="ml-auto text-xs text-teal">{j.lane_name}</span></Row>)}
      </Block>}
    </div>
  );
}
