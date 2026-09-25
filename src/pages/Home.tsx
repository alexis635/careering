import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../api';
import FitBadge from '../components/FitBadge';
import NeedsAttention from '../components/NeedsAttention';
import QuickAdd from '../components/QuickAdd';
import type { Attention, Job, Lane } from '../types';

interface HomeData {
  recentJobs: (Pick<Job, 'id' | 'company' | 'role_title' | 'stage' | 'fit'> & { updated_at: string; lane_name: string; color: string })[];
  repliesThisWeek: number;
  recentMail: { id: number; job_id: number; label: string; direction: string; subject: string; snippet: string; sent_at: string }[];
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function Home() {
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [att, setAtt] = useState<Attention | null>(null);
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    api.get<Lane[]>('lanes').then(setLanes).catch(() => setLanes([]));
    api.get<Attention>('attention').then(setAtt).catch(() => {});
    api.get<HomeData>('home').then(setData).catch(() => {});
  }, []);

  const count = (stages: string[]) => (lanes ?? []).reduce((n, l) => n + (l.counts ?? []).filter((c) => stages.includes(c.stage)).reduce((m, c) => m + c.n, 0), 0);
  const inFlight = count(['Applied', 'Screening', 'Interviewing', 'Offer']);
  const summary = lanes === null ? 'Loading your search...' : inFlight ? `${inFlight} ${inFlight === 1 ? 'opportunity' : 'opportunities'} in motion. Here is where things stand.` : 'Nothing in motion yet. Add a job to get started.';
  const tiles = [
    { label: 'To apply', value: count(['Saved']) },
    { label: 'In progress', value: count(['Applied', 'Screening']) },
    { label: 'Interviewing', value: count(['Interviewing']) },
    { label: 'Offers', value: count(['Offer']) },
    { label: 'Replies this week', value: data?.repliesThisWeek ?? 0 },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-navy text-beige px-6 py-12 sm:px-12 sm:py-16 text-center">
        <span aria-hidden="true" className="absolute -right-6 -top-20 font-display text-[22rem] leading-none text-white/[0.04] select-none">C</span>
        <p className="relative text-sm uppercase tracking-[0.2em] text-sky">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="relative text-5xl sm:text-6xl font-extrabold mt-3 leading-[1.05]">{greeting()}</h1>
        <p className="relative text-sky text-lg mt-4 max-w-xl mx-auto">{summary}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <a href="#add-job" className="btn btn-lg !bg-beige !text-navy hover:!bg-white">Add a job</a>
          <Link to="/weekly" className="btn btn-lg !bg-white/10 hover:!bg-white/20 border border-white/20">See your week</Link>
        </div>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 -mt-2">
        {tiles.map((t) => (
          <div key={t.label} className="card card-hover py-6 text-center">
            <div className="text-5xl font-display font-bold leading-none">{t.value}</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-teal mt-2">{t.label}</div>
          </div>
        ))}
      </div>

      <p className="text-center"><Link to="/timeline" className="text-sm text-teal underline">See your lane timeline</Link><span className="text-teal mx-2">|</span><Link to="/case" className="text-sm text-teal underline">Build a case for a raise</Link></p>

      <div id="add-job" className="card p-6 scroll-mt-32">
        <h2 className="text-2xl font-semibold text-center mb-4">Add a job</h2>
        {lanes && <QuickAdd lanes={lanes} />}
      </div>

      <NeedsAttention att={att} />

      {lanes && lanes.length > 0 && (
        <div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <h2 className="text-xl font-semibold">Your lanes</h2>
            <Link to="/lanes" className="text-sm text-teal underline">See all</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lanes.map((l) => {
              const total = (l.counts ?? []).reduce((n, c) => n + c.n, 0);
              return (
                <Link key={l.id} to={`/lanes/${l.id}`} className="card card-hover overflow-hidden text-center">
                  <div className="h-1.5" style={{ background: l.color }} />
                  <div className="p-4"><div className="font-semibold leading-tight">{l.name}</div><div className="text-xs text-teal mt-1">{total} {total === 1 ? 'entry' : 'entries'}</div></div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!!data?.recentJobs.length && (
        <div>
          <h2 className="text-xl font-semibold text-center mb-3">Recently updated</h2>
          <div className="card divide-y divide-sky/60">
            {data.recentJobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-beige/60">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: j.color }} />
                <span className="font-medium">{j.company}</span><span className="text-teal truncate">{j.role_title}</span>
                <FitBadge fit={j.fit} />
                <span className="ml-auto text-xs text-teal whitespace-nowrap">{j.stage}, {format(new Date(j.updated_at), 'MMM d')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!!data?.recentMail.length && (
        <div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <h2 className="text-xl font-semibold">Latest mail</h2>
            <Link to="/mail" className="text-sm text-teal underline">Open Mail</Link>
          </div>
          <div className="card divide-y divide-sky/60">
            {data.recentMail.map((m) => (
              <Link key={`${m.direction}${m.id}`} to={`/jobs/${m.job_id}?tab=Emails`} className="block px-4 py-2.5 text-sm hover:bg-beige/60">
                <div className="flex items-center gap-2 text-xs text-teal">
                  <span className="uppercase tracking-wide font-medium">{m.direction === 'received' ? 'Reply' : 'Sent'}</span><span>{m.label}</span>
                  <span className="ml-auto">{format(new Date(m.sent_at), 'MMM d, h:mm a')}</span>
                </div>
                <div className="font-medium">{m.subject || '(no subject)'}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
