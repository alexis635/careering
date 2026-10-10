import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../api';

interface Entry {
  id: number; at: string; method: string; path: string; status: number; job_id: number | null;
  summary: string; before: Record<string, any> | null; after: Record<string, any> | null;
  company: string | null; role_title: string | null;
}

// Fields worth showing in a before/after diff (skip timestamps and links that always change).
const SKIP = new Set(['updated_at', 'created_at', 'app_url', 'notes', 'posting_text']);

function Changes({ before, after }: { before: Entry['before']; after: Entry['after'] }) {
  if (!before || !after) return null;
  const keys = Object.keys(after).filter((k) => !SKIP.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (!keys.length) return null;
  return (
    <ul className="mt-1 text-xs text-teal space-y-0.5">
      {keys.map((k) => <li key={k}><span className="font-medium text-navy">{k}</span>: {String(before[k] ?? 'empty')} → {String(after[k] ?? 'empty')}</li>)}
    </ul>
  );
}

export default function Noelle() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  useEffect(() => { api.get<Entry[]>('noelle/activity').then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return null;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Noelle's work</h1>
        <p className="text-teal mt-1">Everything Noelle has added or changed in Careering, newest first. Refused calls are listed too.</p>
      </div>
      {!rows.length ? (
        <p className="text-sm text-teal text-center">Nothing yet.</p>
      ) : (
        <div className="card divide-y divide-sky/60">
          {rows.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    {r.status >= 400
                      ? <span className="text-red-700">Refused ({r.status}): {r.method} {r.path}</span>
                      : r.job_id && r.company !== null
                        ? <Link to={`/jobs/${r.job_id}`} className="hover:underline">{r.summary}</Link>
                        : r.summary || `${r.method} ${r.path}`}
                  </div>
                  <Changes before={r.before} after={r.after} />
                </div>
                <div className="text-xs text-teal whitespace-nowrap">{format(new Date(r.at), 'MMM d · h:mm a')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
