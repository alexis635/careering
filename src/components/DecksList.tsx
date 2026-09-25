import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../api';
import type { Deck } from '../types';
import { Presentation } from 'lucide-react';
import { EmptyState } from './ui';

/** Rise > Decks: every deck across all jobs, plus Recently deleted. Building and editing happens on the job. */
export default function DecksList() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [gone, setGone] = useState<Deck[]>([]);
  const load = () => { api.get<Deck[]>('decks').then(setDecks).catch(() => {}); api.get<Deck[]>('decks?deleted=1').then(setGone).catch(() => {}); };
  useEffect(load, []);
  const row = (d: Deck, trashed: boolean) => (
    <div key={d.id} className="card p-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0">
        <div className="font-semibold truncate">{d.title}</div>
        <div className="text-xs text-teal">{d.company}{d.role_title ? `, ${d.role_title}` : ''} · {d.spec.slides.length} slides · {format(new Date(d.created_at), 'MMM d')}</div>
      </div>
      <div className="ml-auto">
        {trashed
          ? <button className="btn-ghost" onClick={async () => { await api.post(`decks/${d.id}/restore`); load(); }}>Restore</button>
          : <Link className="btn-ghost" to={`/jobs/${d.job_id}?tab=Interview%20deck`}>Open</Link>}
      </div>
    </div>
  );
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {decks.length === 0 && <EmptyState icon={Presentation} title="No decks yet">Open a job and choose the Interview deck tab to build one.</EmptyState>}
      {decks.map((d) => row(d, false))}
      {gone.length > 0 && (
        <details className="pt-2"><summary className="text-sm text-teal cursor-pointer">Recently deleted ({gone.length})</summary>
          <div className="space-y-2 mt-2">{gone.map((d) => row(d, true))}</div></details>
      )}
    </div>
  );
}
