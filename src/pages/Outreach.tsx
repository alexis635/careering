import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Sparkles } from 'lucide-react';
import { api } from '../api';
import CompanyLogo from '../components/CompanyLogo';
import { DraftCard, RunNote } from '../components/Outreach';
import { EmptyState, CardSkeletons, PageHero } from '../components/ui';
import type { OutreachDraft, OutreachRun } from '../types';

interface Queue {
  drafts: OutreachDraft[];
  runs: OutreachRun[];
  not_started: { id: number; company: string; company_domain?: string; role_title: string; stage: string; applied_date: string | null }[];
}

const FILTERS = [
  { key: 'review', label: 'To review', match: (d: OutreachDraft) => d.status === 'drafted' || d.status === 'failed' },
  { key: 'approved', label: 'Waiting for Noelle', match: (d: OutreachDraft) => d.status === 'approved' || d.status === 'sending' },
  { key: 'sent', label: 'Sent', match: (d: OutreachDraft) => d.status === 'sent' },
  { key: 'research', label: 'Needs research', match: () => false },
  { key: 'all', label: 'Everything', match: () => true },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

/** Every job's post-application emails in one place: review and approve in a row, then watch them go out. */
export default function Outreach() {
  const [data, setData] = useState<Queue | null>(null);
  const [filter, setFilter] = useState<Filter>('review');
  const [msg, setMsg] = useState('');
  const [starting, setStarting] = useState(false);
  const timer = useRef<number | null>(null);
  const load = () => api.get<Queue>('outreach').then(setData).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (data?.runs.some((r) => r.status === 'running')) timer.current = window.setTimeout(load, 6000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [data]);

  if (!data) return <div className="max-w-4xl mx-auto"><CardSkeletons n={4} /></div>;

  const count = (k: Filter) => k === 'research' ? data.runs.filter((r) => r.status === 'needs_research').length : data.drafts.filter(FILTERS.find((f) => f.key === k)!.match).length;
  const f = FILTERS.find((x) => x.key === filter)!;
  const shown = data.drafts.filter(f.match);
  const byJob = new Map<number, OutreachDraft[]>();
  for (const d of shown) byJob.set(d.job_id, [...(byJob.get(d.job_id) ?? []), d]);
  const runOf = (id: number) => data.runs.find((r) => r.job_id === id) ?? null;
  const running = data.runs.filter((r) => r.status === 'running');
  const research = data.runs.filter((r) => r.status === 'needs_research' || r.status === 'failed');
  const update = (nd: OutreachDraft) => setData((x) => x && { ...x, drafts: x.drafts.map((d) => (d.id === nd.id ? { ...d, ...nd } : d)) });

  async function startAll() {
    setStarting(true); setMsg('');
    try {
      const r = await api.post<{ started: number[] }>('outreach/start-all');
      setMsg(r.started.length ? `Drafting for ${r.started.length} job${r.started.length === 1 ? '' : 's'}. This takes a minute or two.` : 'Already running.');
      load();
    } catch (e: any) { setMsg(e.message); } finally { setStarting(false); }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHero icon={Send} title="Outreach" blurb="After you apply, Careering drafts one email to the hiring manager and one to HR. You approve, Noelle sends, and you can see where every one stands." />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['review', 'approved', 'sent', 'research'] as Filter[]).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`card p-4 text-center ${filter === k ? 'ring-2 ring-navy' : ''}`}>
            <div className="text-3xl font-bold">{count(k)}</div>
            <div className="text-xs uppercase tracking-wide text-teal mt-1">{FILTERS.find((x) => x.key === k)!.label}</div>
          </button>
        ))}
      </div>

      {data.not_started.length > 0 && (
        <div className="card p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-56 text-sm">
            <span className="font-medium">{data.not_started.length} applied job{data.not_started.length === 1 ? '' : 's'} with no outreach yet:</span>{' '}
            <span className="text-teal">{data.not_started.slice(0, 6).map((j) => j.company || 'Untitled').join(', ')}{data.not_started.length > 6 ? '…' : ''}</span>
          </div>
          <button className="btn" disabled={starting} onClick={startAll}><Sparkles size={14} /> {starting ? 'Starting…' : `Draft for ${Math.min(5, data.not_started.length)}`}</button>
        </div>
      )}
      {msg && <p className="text-sm text-teal text-center">{msg}</p>}
      {running.length > 0 && <p className="text-sm text-teal text-center">Writing now: {running.map((r) => r.company).join(', ')}</p>}

      <div className="flex flex-wrap justify-center gap-1">
        {FILTERS.map((x) => (
          <button key={x.key} onClick={() => setFilter(x.key)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === x.key ? 'bg-navy text-white' : 'text-teal bg-white border border-sky/60'}`}>{x.label}</button>
        ))}
      </div>

      {filter === 'research' ? (
        research.length === 0
          ? <EmptyState icon={Send} title="Nothing to research">Every applied job has contacts for both emails.</EmptyState>
          : research.map((r) => (
            <div key={r.job_id} className="card p-4 space-y-2">
              <JobHead id={r.job_id} company={r.company} domain={r.company_domain} role={r.role_title} />
              <RunNote run={r} />
              <Link className="text-sm underline text-teal" to={`/jobs/${r.job_id}?tab=Contacts`}>Add a contact on People, then Draft missing on the Outreach tab</Link>
            </div>
          ))
      ) : byJob.size === 0 ? (
        <EmptyState icon={Send} title={filter === 'review' ? 'Nothing waiting on you' : 'Nothing here yet'}>
          {filter === 'review' ? 'New drafts show up here when you move a job to Applied.' : 'Approved and sent emails will show here.'}
        </EmptyState>
      ) : (
        [...byJob.entries()].map(([jobId, ds]) => (
          <section key={jobId} className="space-y-3">
            <JobHead id={jobId} company={ds[0].company} domain={ds[0].company_domain} role={ds[0].role_title} applied={ds[0].applied_date} />
            {runOf(jobId)?.status === 'needs_research' && <RunNote run={runOf(jobId)} />}
            {ds.map((d) => <DraftCard key={d.id} draft={d} onChange={update} />)}
          </section>
        ))
      )}
    </div>
  );
}

function JobHead({ id, company, domain, role, applied }: { id: number; company?: string; domain?: string; role?: string; applied?: string | null }) {
  return (
    <Link to={`/jobs/${id}?tab=Outreach`} className="flex items-center gap-3 pt-2">
      <CompanyLogo size="sm" domain={domain} name={company || ''} />
      <span className="font-semibold">{company || 'Untitled'}</span>
      <span className="text-teal text-sm truncate">{role}</span>
      {applied && <span className="ml-auto text-xs text-teal whitespace-nowrap">Applied {applied}</span>}
    </Link>
  );
}
