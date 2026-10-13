import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../api';
import FitBadge from './FitBadge';
import type { Job, Positioning } from '../types';

const STATUS: Record<Positioning['requirements'][number]['status'], { label: string; dot: string }> = {
  met: { label: 'You have this', dot: 'bg-navy' },
  transferable: { label: 'You have this, framed for them', dot: 'bg-teal' },
  gap: { label: 'Address this', dot: 'bg-sky border border-teal' },
};
const REACH: Record<string, string> = { 'in reach': 'bg-navy text-white', stretch: 'bg-sky text-navy', 'big stretch': 'bg-beige text-navy border border-sky' };

/** How the app positions her for this role: fit as positioned, reach, headline, requirement map, and tools to confirm. */
export default function PositioningCard({ job, save, setJob, children }: { job: Job; save: (p: Partial<Job>) => void; setJob: (j: Job) => void; children?: React.ReactNode }) {
  const p = job.positioning;
  const [busyTool, setBusyTool] = useState('');
  const answer = async (name: string, used: boolean | null) => {
    setBusyTool(name);
    try { setJob(await api.post<Job>('ai/tool', { job_id: job.id, tool: name, used })); } finally { setBusyTool(''); }
  };
  const tools = job.tools ?? [];

  return (
    <div className="card p-5 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="label mb-0">Fit as positioned</label>
        <select className="input w-40" value={job.fit ?? ''} onChange={(e) => save({ fit: (e.target.value || null) as Job['fit'] })}>
          <option value="">Not rated</option><option value="strong">Strong</option><option value="moderate">Moderate</option><option value="weak">Weak</option>
        </select>
        <FitBadge fit={job.fit} />
        {p?.reach && <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 font-medium ${REACH[p.reach]}`}>{p.reach}</span>}
      </div>

      {!p && <p className="text-sm text-teal">Analyze this job to see how your experience lines up with each requirement.</p>}
      {p && !p.real_posting && <p className="text-sm rounded-xl bg-beige p-4">{p.summary || 'This link has no job description to rate. Paste the posting text below and analyze again.'}</p>}

      {p?.real_posting && (
        <>
          {p.headline && (
            <div className="rounded-xl bg-navy text-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-sky">Your headline for this role</div>
              <div className="font-display text-lg font-semibold">{p.headline}</div>
            </div>
          )}
          <p className="text-[15px] leading-relaxed">{p.summary}</p>
          {p.reach_reason && <p className="text-sm text-teal"><span className="font-medium text-navy">Reach check:</span> {p.reach_reason}</p>}

          {(['met', 'transferable', 'gap'] as const).map((s) => {
            const list = p.requirements.filter((r) => r.status === s);
            if (!list.length) return null;
            return (
              <div key={s}>
                <div className="label">{STATUS[s].label} ({list.length})</div>
                <ul className="space-y-2">
                  {list.map((r, i) => (
                    <li key={i} className="rounded-lg border border-sky/70 bg-white px-3 py-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS[s].dot}`} />
                        <div className="min-w-0">
                          <div className="font-medium">{r.requirement}</div>
                          {r.proof && <div className="text-navy/80">{r.proof}</div>}
                          {r.say_it && <div className="text-teal mt-0.5"><span className="font-medium">{s === 'gap' ? 'How to address it' : 'Say it'}:</span> {r.say_it}</div>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}

      {tools.length > 0 && (
        <div>
          <div className="label">Tools in this posting</div>
          <p className="text-xs text-teal mb-2">Mark the ones you have used. Those go on your resume for this job, and the app remembers them for every job after.</p>
          <ul className="divide-y divide-sky/60 rounded-lg border border-sky/70 bg-white">
            {tools.map((t) => (
              <li key={t.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{t.name}</span>
                <button disabled={busyTool === t.name} onClick={() => answer(t.name, t.used === true ? null : true)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border ${t.used === true ? 'bg-navy text-white border-navy' : 'border-sky text-navy hover:bg-sky/40'}`}><Check size={12} /> Used it</button>
                <button disabled={busyTool === t.name} onClick={() => answer(t.name, t.used === false ? null : false)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border ${t.used === false ? 'bg-beige text-navy border-teal' : 'border-sky text-teal hover:bg-sky/40'}`}><X size={12} /> Not yet</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-teal"><span className="group-open:hidden">Show match notes (editable)</span><span className="hidden group-open:inline">Hide match notes</span></summary>
        <div className="mt-3">{children}</div>
      </details>
    </div>
  );
}
