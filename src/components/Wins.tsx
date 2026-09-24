import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { LibItem, Win } from '../types';

const CATS: Record<string, string> = { revenue: 'Revenue and growth', leadership: 'Leadership', recognition: 'Recognition', project: 'Project or launch', growth: 'Skills and growth' };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const when = (d: string | null) => (d ? format(parseISO(d), 'MMM yyyy') : 'No date yet');

function WinForm({ initial, employers, onSave, onCancel, busy, err }: { initial?: Win; employers: string[]; onSave: (v: any) => void; onCancel: () => void; busy: boolean; err: string }) {
  const [v, setV] = useState({ title: initial?.title ?? '', happened_on: initial?.happened_on ?? '', employer: initial?.employer ?? '', role: initial?.role ?? '', description: initial?.description ?? '', impact: initial?.impact ?? '', category: initial?.category ?? 'project', proof_url: initial?.proof_url ?? '' });
  const set = (k: keyof typeof v, val: string) => setV({ ...v, [k]: val });
  return (
    <form className="card p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...v, happened_on: v.happened_on || null }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">The win, in a short line</label><input className="input" required placeholder="Grew newsletter signups 40% in one quarter" value={v.title} onChange={(e) => set('title', e.target.value)} autoFocus /></div>
        <div><label className="label">When</label><input className="input" type="date" value={v.happened_on ?? ''} onChange={(e) => set('happened_on', e.target.value)} /></div>
        <div><label className="label">Type</label><select className="input" value={v.category} onChange={(e) => set('category', e.target.value)}>{Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label">Employer</label><input className="input" list="win-employers" value={v.employer} onChange={(e) => set('employer', e.target.value)} /><datalist id="win-employers">{employers.map((x) => <option key={x} value={x} />)}</datalist></div>
        <div><label className="label">Your role</label><input className="input" value={v.role} onChange={(e) => set('role', e.target.value)} /></div>
      </div>
      <div><label className="label">What you did</label><textarea className="input" rows={3} placeholder="The situation, and what you specifically did" value={v.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div><label className="label">The result</label><input className="input" placeholder="The number or outcome: revenue, time saved, growth, feedback" value={v.impact} onChange={(e) => set('impact', e.target.value)} /></div>
      <div><label className="label">Proof link (optional)</label><input className="input" placeholder="A kudos email, deck, article, or dashboard link" value={v.proof_url} onChange={(e) => set('proof_url', e.target.value)} /></div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function Wins() {
  const [wins, setWins] = useState<Win[] | null>(null);
  const [gone, setGone] = useState<Win[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [employer, setEmployer] = useState('');
  const [year, setYear] = useState('');
  const [cat, setCat] = useState('');
  const [bullet, setBullet] = useState<{ id: number; text: string } | null>(null);
  const [bulletBusy, setBulletBusy] = useState<number | null>(null);

  const load = () => {
    api.get<Win[]>('wins').then(setWins);
    api.get<Win[]>('wins?deleted=1').then(setGone);
  };
  useEffect(load, []);

  const employers = useMemo(() => [...new Set((wins ?? []).map((w) => w.employer).filter(Boolean))], [wins]);
  const years = useMemo(() => [...new Set((wins ?? []).map((w) => w.happened_on?.slice(0, 4)).filter(Boolean) as string[])].sort().reverse(), [wins]);
  const shown = (wins ?? []).filter((w) =>
    (!employer || w.employer === employer) && (!year || w.happened_on?.startsWith(year)) && (!cat || w.category === cat) &&
    (!q || `${w.title} ${w.description} ${w.impact} ${w.employer} ${w.role}`.toLowerCase().includes(q.toLowerCase())));

  async function save(body: any, id?: number) {
    setBusy(true); setErr('');
    try { if (id) await api.patch(`wins/${id}`, body); else await api.post('wins', body); setAdding(false); setEditing(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function draftBullet(w: Win) {
    setBulletBusy(w.id); setErr('');
    try { setBullet({ id: w.id, ...(await api.post<{ text: string }>(`wins/${w.id}/bullet-draft`)) }); }
    catch (e: any) { setErr(e.message); } finally { setBulletBusy(null); }
  }
  async function addBullet(w: Win) {
    if (!bullet?.text.trim()) return;
    const item = await api.post<LibItem>('library', { kind: 'bullet', title: '', body: bullet.text.trim(), tags: ['win', ...(w.employer ? [slug(w.employer)] : [])] });
    await api.patch(`wins/${w.id}`, { bullet_id: item.id });
    setBullet(null); load();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-teal text-center">A running record of what you have done and what it achieved. Keep it current, and it becomes your evidence for resumes, reviews, promotions, and raises. One click turns a win into a resume bullet.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn" onClick={() => { setAdding((v) => !v); setEditing(null); setErr(''); }}><Plus size={16} /> Add a win</button>
        <Link to="/case" className="btn-ghost"><Sparkles size={14} /> Build my case for a raise or promotion</Link>
      </div>
      {adding && <WinForm employers={employers} onSave={(b) => save(b)} onCancel={() => setAdding(false)} busy={busy} err={err} />}

      {(wins?.length ?? 0) > 4 && (
        <div className="flex flex-wrap gap-2 justify-center">
          <input className="input w-48" placeholder="Search wins…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={employer} onChange={(e) => setEmployer(e.target.value)}><option value="">All employers</option>{employers.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{years.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All types</option>{Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
      )}
      {err && !adding && editing === null && <p className="text-sm text-red-700 text-center">{err}</p>}

      <div className="space-y-3">
        {shown.map((w) => editing === w.id ? (
          <WinForm key={w.id} initial={w} employers={employers} onSave={(b) => save(b, w.id)} onCancel={() => setEditing(null)} busy={busy} err={err} />
        ) : (
          <div key={w.id} className="card p-4 space-y-1.5">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="font-semibold leading-snug flex-1 min-w-52 font-sans">{w.title}</h3>
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-sky text-navy">{CATS[w.category] ?? w.category}</span>
            </div>
            <div className="text-xs text-teal">{when(w.happened_on)}{w.employer && ` · ${w.employer}`}{w.role && ` · ${w.role}`}</div>
            {w.description && <p className="text-sm">{w.description}</p>}
            {w.impact && <p className="text-sm"><span className="font-semibold">Result:</span> {w.impact}</p>}
            {w.proof_url && <a className="text-xs text-teal underline inline-flex items-center gap-1" href={w.proof_url} target="_blank" rel="noreferrer"><ExternalLink size={11} /> Proof</a>}

            {bullet?.id === w.id ? (
              <div className="rounded-lg bg-beige p-3 space-y-2 mt-2">
                <label className="label mb-0">Resume bullet (edit it if you like)</label>
                <textarea className="input text-sm" rows={2} value={bullet.text} onChange={(e) => setBullet({ ...bullet, text: e.target.value })} />
                <div className="flex gap-2"><button className="btn" onClick={() => addBullet(w)}>Add to bullet bank</button><button className="btn-ghost" onClick={() => setBullet(null)}>Cancel</button></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {w.bullet_id
                  ? <span className="text-xs text-teal border border-sky bg-beige rounded px-2 py-1">In your bullet bank</span>
                  : <button className="btn-ghost" disabled={bulletBusy === w.id} onClick={() => draftBullet(w)}><Sparkles size={13} /> {bulletBusy === w.id ? 'Writing…' : 'Make resume bullet'}</button>}
                <button className="btn-ghost" onClick={() => { setEditing(w.id); setAdding(false); setErr(''); }}>Edit</button>
                <button className="text-teal hover:text-navy ml-auto" title="Move to Recently deleted" onClick={async () => { await api.del(`wins/${w.id}`); load(); }}><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        ))}
        {wins && shown.length === 0 && <p className="text-sm text-teal text-center">{wins.length ? 'No wins match those filters.' : 'No wins yet. Add your first one, even a small one.'}</p>}
      </div>

      {gone.length > 0 && (
        <div className="text-center">
          <button className="text-sm text-teal underline" onClick={() => setShowGone((v) => !v)}>{showGone ? 'Hide' : 'Show'} recently deleted ({gone.length})</button>
          {showGone && <div className="card divide-y divide-sky/60 mt-2 text-left">
            {gone.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span>{w.title}</span>
                <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`wins/${w.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}
