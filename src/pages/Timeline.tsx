import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInCalendarDays, eachMonthOfInterval, format, parseISO, startOfMonth } from 'date-fns';
import { api } from '../api';
import type { Lane } from '../types';

interface Mark { lane_id: number; id: number; company: string; role_title: string; date: string }

const day = (s: string) => parseISO(s.slice(0, 10));

export default function Timeline() {
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    api.get<Lane[]>('lanes').then(setLanes).catch(() => setLanes([]));
    api.get<Mark[]>('timeline').then(setMarks).catch(() => {});
  }, []);

  const view = useMemo(() => {
    if (!lanes) return null;
    const today = new Date();
    const rows = lanes.map((l) => {
      const start = day(l.start_date ?? l.created_at ?? format(today, 'yyyy-MM-dd'));
      const end = l.target_date ? day(l.target_date) : null;
      return { lane: l, start, end, hasStart: !!l.start_date };
    });
    const dates = [today, ...rows.flatMap((r) => [r.start, r.end ?? r.start])];
    const min = addDays(startOfMonth(new Date(Math.min(...dates.map((d) => d.getTime())))), 0);
    const max = addDays(new Date(Math.max(...dates.map((d) => d.getTime()))), 45);
    const span = Math.max(differenceInCalendarDays(max, min), 30);
    const pct = (d: Date) => Math.min(100, Math.max(0, (differenceInCalendarDays(d, min) / span) * 100));
    const months = eachMonthOfInterval({ start: min, end: max });
    const step = months.length > 30 ? 6 : months.length > 14 ? 3 : 1;
    return { rows, today, pct, months: months.filter((_, i) => i % step === 0), min, span };
  }, [lanes]);

  if (!view) return null;
  const { rows, today, pct, months } = view;

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-5xl font-bold text-center">Timeline</h1>
      <p className="text-sm text-teal text-center mt-1 mb-6">Each lane runs on its own timeline. Set the start and target dates on a lane with its Edit button.</p>

      {rows.length === 0 && <p className="text-center text-teal text-sm">No lanes yet. <Link to="/lanes" className="underline">Create one</Link>.</p>}

      {rows.length > 0 && (
        <div className="card p-4 overflow-x-auto">
          <div className="min-w-[760px]">
            {/* month axis */}
            <div className="flex">
              <div className="w-52 shrink-0" />
              <div className="relative flex-1 h-6 border-b border-sky">
                {months.map((m) => (
                  <span key={m.toISOString()} className="absolute text-[10px] uppercase tracking-wide text-teal -translate-x-1/2" style={{ left: `${pct(m)}%` }}>
                    {format(m, m.getMonth() === 0 ? 'MMM yyyy' : 'MMM')}
                  </span>
                ))}
              </div>
            </div>

            {/* lane rows, with the today line drawn across all of them */}
            <div className="relative">
              <div className="absolute top-0 bottom-0 flex pointer-events-none" style={{ left: 0, right: 0 }}>
                <div className="w-52 shrink-0" />
                <div className="relative flex-1">
                  {months.map((m) => <div key={m.toISOString()} className="absolute top-0 bottom-0 border-l border-sky/50" style={{ left: `${pct(m)}%` }} />)}
                  <div className="absolute top-0 bottom-0 border-l-2 border-navy z-0" style={{ left: `${pct(today)}%` }}>
                    <span className="absolute -top-0.5 left-1 text-[10px] font-semibold text-navy bg-white/80 px-1 rounded">Today</span>
                  </div>
                </div>
              </div>

              {rows.map(({ lane, start, end, hasStart }) => {
                const left = pct(start);
                const right = end ? pct(end) : Math.min(100, pct(today) + 6);
                const width = Math.max(right - left, 1.2);
                const faded = lane.status !== 'active';
                const daysLeft = end ? differenceInCalendarDays(end, today) : null;
                return (
                  <div key={lane.id} className="flex items-center h-16 border-b border-sky/40 relative">
                    <Link to={`/lanes/${lane.id}`} className="w-52 shrink-0 pr-3 hover:underline">
                      <div className="text-sm font-semibold leading-tight">{lane.name}</div>
                      <div className="text-[11px] text-teal">
                        {end ? `Target ${format(end, 'MMM d, yyyy')}` : 'No target date'}
                        {daysLeft !== null && `, ${daysLeft < 0 ? `${-daysLeft} days past` : daysLeft === 0 ? 'today' : `${daysLeft} days left`}`}
                      </div>
                      {faded && <div className="text-[10px] uppercase text-teal">{lane.status}</div>}
                    </Link>
                    <div className="relative flex-1 h-full">
                      <Link
                        to={`/lanes/${lane.id}`}
                        title={`${lane.name}: ${format(start, 'MMM d, yyyy')} to ${end ? format(end, 'MMM d, yyyy') : 'no target date'}${hasStart ? '' : ' (start is when the lane was created)'}`}
                        className="absolute top-1/2 -translate-y-1/2 h-7 rounded-md hover:opacity-90 flex items-center px-2 overflow-hidden z-10"
                        style={{ left: `${left}%`, width: `${width}%`, background: lane.color, opacity: faded ? 0.45 : 1, backgroundImage: end ? undefined : `repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,.35) 6px 12px)` }}
                      >
                        {end && <span className="text-[11px] font-medium text-white truncate drop-shadow-sm">{format(start, 'MMM yyyy')} to {format(end, 'MMM yyyy')}</span>}
                      </Link>
                      {marks.filter((m) => m.lane_id === lane.id).map((m) => (
                        <Link key={m.id} to={`/jobs/${m.id}`} title={`Deadline: ${m.company || 'Untitled'}, ${format(day(m.date), 'MMM d, yyyy')}`}
                          className="absolute w-3 h-3 -translate-x-1/2 rotate-45 bg-white border-2 border-navy z-20"  style={{ left: `${pct(day(m.date))}%`, top: '8px' }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-teal text-center mt-4">
            Bars run from each lane's start date to its target date. Diamonds are job deadlines. Lanes with no start date begin on the day they were created, and lanes with no target date show a striped bar.
          </p>
        </div>
      )}
    </div>
  );
}
