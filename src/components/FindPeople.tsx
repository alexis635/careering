import { useState } from 'react';
import { ExternalLink, Plus, Search } from 'lucide-react';
import { api } from '../api';
import type { JobContact } from '../types';

interface Found { name: string; title: string; kind: 'hr' | 'hiring_manager' | 'department_lead'; email: string; source_url: string; why: string }
interface Result { company: string; people: Found[]; email_format: string; general_contact: string; notes: string }

const KIND: Record<Found['kind'], string> = { hr: 'HR / recruiting', hiring_manager: 'Hiring manager', department_lead: 'Department lead' };

export default function FindPeople({ jobId, company, role, contacts, onAdded }: { jobId: number; company: string; role: string; contacts: JobContact[]; onAdded: () => void }) {
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [added, setAdded] = useState<string[]>([]);

  async function run() {
    setBusy(true); setErr('');
    try { setRes(await api.post<Result>('ai/people', { job_id: jobId })); setAdded([]); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function add(p: Found) {
    await api.post(`jobs/${jobId}/contacts`, {
      name: p.name, title: p.title, email: p.email, source: 'search',
      notes: `${KIND[p.kind]}. Found at ${p.source_url}`,
    });
    setAdded((a) => [...a, p.name]); onAdded();
  }
  const have = (n: string) => added.includes(n) || contacts.some((c) => c.name.trim().toLowerCase() === n.trim().toLowerCase());

  // Free, no scraping: opens LinkedIn's own people search in a new tab, pre-filled.
  const li = (kw: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} ${kw}`)}`;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-48">
          <div className="font-medium">Find people at {company || 'this company'}</div>
          <div className="text-xs text-teal">Searches public pages for HR or recruiting contacts and the likely hiring manager. Emails only show when they are printed on a page, never guessed.</div>
        </div>
        <button className="btn" disabled={busy || !company.trim()} onClick={run}><Search size={14} /> {busy ? 'Searching, about a minute…' : res ? 'Search again' : 'Find people'}</button>
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}

      {res && (
        <div className="space-y-2">
          {res.people.length === 0 && <p className="text-sm text-teal">No one turned up with a public source. {res.notes}</p>}
          {res.people.map((p) => (
            <div key={p.name + p.source_url} className="rounded-lg border border-sky/60 p-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-48">
                <div className="font-medium">{p.name} <span className="ml-1 text-xs rounded-full bg-sky/50 px-2 py-0.5 text-navy">{KIND[p.kind]}</span></div>
                <div className="text-sm text-teal">{p.title}{p.title && p.email ? ' · ' : ''}{p.email}</div>
                {p.why && <div className="text-xs text-teal mt-0.5">{p.why}</div>}
                <a className="text-xs text-teal underline inline-flex items-center gap-1 mt-0.5" href={p.source_url} target="_blank" rel="noreferrer">Source <ExternalLink size={11} /></a>
              </div>
              {have(p.name)
                ? <span className="text-xs text-teal">In contacts</span>
                : <button className="btn" onClick={() => add(p)}><Plus size={14} /> Add to contacts</button>}
            </div>
          ))}
          {(res.email_format || res.general_contact) && (
            <div className="text-sm text-navy">
              {res.general_contact && <div><span className="text-teal">General contact:</span> {res.general_contact}</div>}
              {res.email_format && <div><span className="text-teal">Email format seen:</span> {res.email_format}</div>}
            </div>
          )}
          {res.people.length > 0 && res.notes && <p className="text-xs text-teal">{res.notes}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-teal pt-1">
        <span>Search LinkedIn:</span>
        <a className="underline" href={li('recruiter')} target="_blank" rel="noreferrer">Recruiters</a>
        <a className="underline" href={li('human resources')} target="_blank" rel="noreferrer">HR</a>
        {role && <a className="underline" href={li(`${role} manager`)} target="_blank" rel="noreferrer">Hiring manager</a>}
      </div>
    </div>
  );
}
