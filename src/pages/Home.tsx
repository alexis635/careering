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
  const tiles = [
    { label: 'To apply', value: count(['Saved']) },
    { label: 'In progress', value: count(['Applied', 'Screening']) },
    { label: 'Interviewing', value: count(['Interviewing']) },
    { label: 'Offers', value: count(['Offer']) },
    { label: 'Replies this week', value: data?.repliesThisWeek ?? 0 },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">{greeting()}</h1>
        <p className="text-teal mt-1">{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card py-4 text-center">
            <div className="text-3xl font-display font-bold">{t.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-teal mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>

      <p className="text-center -mt-2"><Link to="/weekly" className="text-sm text-teal underline">See your week in full</Link><span className="text-teal mx-2">|</span><Link to="/timeline" className="text-sm text-teal underline">See your lane timeline</Link><span className="text-teal mx-2">|</span><Link to="/case" className="text-sm text-teal underline">Build a case for a raise</Link></p>

      <div className="card p-5">
        <h2 className="text-xl font-semibold text-center mb-3">Add a job</h2>
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
                <Link key={l.id} to={`/lanes/${l.id}`} className="card overflow-hidden hover:shadow-md transition-shadow text-center">
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
