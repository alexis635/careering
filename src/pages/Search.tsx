import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import type { SearchHit } from '../types';

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const job = params.get('job');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setHits(null); setAnswer(''); setErr('');
    if (q.trim().length >= 2) api.get<SearchHit[]>(`search?q=${encodeURIComponent(q)}${job ? `&job_id=${job}` : ''}`).then(setHits).catch((e) => setErr(e.message));
    else setHits([]);
  }, [q, job]);

  async function askClaude() {
    setBusy(true); setErr(''); setAnswer('');
    try { setAnswer((await api.post<{ answer: string }>('ai/ask', { q, job_id: job ? Number(job) : undefined })).answer); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 text-center">{q ? `“${q}”` : 'Search'}</h1>
      <p className="text-sm text-teal mb-4 text-center">{job ? 'Showing this job first, then everything else.' : 'Searching everything: jobs, notes, documents, emails, and the Library.'}</p>
      {q.trim().length >= 2 && (
        <div className="card p-4 mb-5">
          <button className="btn" disabled={busy} onClick={askClaude}><Sparkles size={14} /> {busy ? 'Thinking…' : 'Ask Claude this question'}</button>
          {answer && <p className="whitespace-pre-wrap text-sm mt-3 leading-relaxed">{answer}</p>}
          {err && <p className="text-sm text-red-700 mt-2">{err}</p>}
        </div>
      )}
      {hits && hits.length === 0 && q.trim().length >= 2 && <p className="text-teal text-sm">No matches.</p>}
      <div className="space-y-2">
        {hits?.map((h, i) => (
          <Link key={i} to={h.job_id ? `/jobs/${h.job_id}` : (h.href ?? '/library')} className="card p-3.5 block hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-xs text-teal mb-0.5">
              <span className="uppercase tracking-wide font-semibold">{h.type}</span><span>{h.label}</span>
            </div>
            {h.title && h.title !== h.label && <div className="font-medium text-sm">{h.title}</div>}
            <div className="text-sm text-navy/80">{h.snippet}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
