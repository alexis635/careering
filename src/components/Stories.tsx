import { useEffect, useState } from 'react';
import { BookOpen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Story } from '../types';
import { EmptyState } from './ui';

function StoryForm({ initial, onSave, onCancel, busy, err }: { initial?: Story; onSave: (v: { title: string; body: string; employer: string }) => void; onCancel: () => void; busy: boolean; err: string }) {
  const [v, setV] = useState({ title: initial?.title ?? '', body: initial?.body ?? '', employer: initial?.employer ?? '' });
  return (
    <form className="card p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Short title</label><input className="input" placeholder="Why I can run vendor programs" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus /></div>
        <div><label className="label">Employer (optional)</label><input className="input" value={v.employer} onChange={(e) => setV({ ...v, employer: e.target.value })} /></div>
      </div>
      <div><label className="label">The story, in your words</label><textarea className="input leading-relaxed" rows={5} required placeholder="What you did, what it shows about you, and why it matters for the kind of job you want." value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

/** Her saved explanations of why her experience fits things. The AI draws on these for every job, and she can drop one into any job's angle. */
export default function Stories() {
  const [items, setItems] = useState<Story[] | null>(null);
  const [gone, setGone] = useState<Story[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => { api.get<Story[]>('stories').then(setItems); api.get<Story[]>('stories?deleted=1').then(setGone); };
  useEffect(load, []);

  async function save(body: any, id?: number) {
    setBusy(true); setErr('');
    try { if (id) await api.patch(`stories/${id}`, body); else await api.post('stories', body); setAdding(false); setEditing(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-teal text-center">The reasons you fit, in your own words. Save one once and it is there for every job: the AI uses your stories when they fit a posting, and you can drop one into a job's angle with a click.</p>
      <div className="flex justify-center"><button className="btn" onClick={() => { setAdding((v) => !v); setEditing(null); setErr(''); }}><Plus size={16} /> Add a story</button></div>
      {adding && <StoryForm onSave={(b) => save(b)} onCancel={() => setAdding(false)} busy={busy} err={err} />}
      <div className="space-y-3">
        {(items ?? []).map((s) => editing === s.id ? (
          <StoryForm key={s.id} initial={s} onSave={(b) => save(b, s.id)} onCancel={() => setEditing(null)} busy={busy} err={err} />
        ) : (
          <div key={s.id} className="card p-4 space-y-1.5">
            <h3 className="font-semibold leading-snug font-sans">{s.title}</h3>
            <div className="text-xs text-teal">{[s.employer, s.job_label && `Saved from ${s.job_label}`].filter(Boolean).join(' · ')}</div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.body}</p>
            <div className="flex items-center gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setEditing(s.id); setAdding(false); setErr(''); }}>Edit</button>
              <button className="text-teal hover:text-navy ml-auto" title="Move to Recently deleted" onClick={async () => { await api.del(`stories/${s.id}`); load(); }}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {items && items.length === 0 && <EmptyState icon={BookOpen} title="No stories yet">Save one from a job's Your angle card, or add one here.</EmptyState>}
      </div>
      {gone.length > 0 && (
        <div className="text-center">
          <button className="text-sm text-teal underline" onClick={() => setShowGone((v) => !v)}>{showGone ? 'Hide' : 'Show'} recently deleted ({gone.length})</button>
          {showGone && <div className="card divide-y divide-sky/60 mt-2 text-left">
            {gone.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span>{s.title}</span>
                <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`stories/${s.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}
