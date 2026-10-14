import { useEffect, useState } from 'react';
import { Copy, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { api } from '../api';
import type { CareerReference } from '../types';
import { EmptyState } from './ui';

type Draft = Omit<CareerReference, 'id' | 'deleted_at'>;
const BLANK: Draft = { name: '', title: '', organization: '', relationship: '', email: '', phone: '', notes: '', okay_to_list: false, last_asked: null };

function RefForm({ initial, onSave, onCancel, busy, err }: { initial?: CareerReference; onSave: (v: Draft) => void; onCancel: () => void; busy: boolean; err: string }) {
  const [v, setV] = useState<Draft>(initial ? { ...BLANK, ...initial } : BLANK);
  const f = (k: keyof Draft, label: string, placeholder = '', type = 'text') => (
    <div><label className="label">{label}</label><input className="input" type={type} placeholder={placeholder} value={(v[k] as string) ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <form className="card p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {f('name', 'Name')}
        {f('title', 'Their title')}
        {f('organization', 'Organization')}
        {f('relationship', 'How you know them', 'Worked together at Essence Festival, summer 2026')}
        {f('email', 'Email', '', 'email')}
        {f('phone', 'Phone', '', 'tel')}
        {f('last_asked', 'Last asked or updated them', '', 'date')}
        <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={v.okay_to_list} onChange={(e) => setV({ ...v, okay_to_list: e.target.checked })} /> They said yes to being a reference</label>
      </div>
      <div><label className="label">Notes</label><textarea className="input" rows={2} placeholder="What they can speak to, best way to reach them" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

const block = (r: CareerReference) =>
  [r.name, [r.title, r.organization].filter(Boolean).join(', '), r.relationship, [r.email, r.phone].filter(Boolean).join(' · ')].filter(Boolean).join('\n');

/** Her professional references, ready to paste into an application. Private: never used by the AI or put on a resume. */
export default function References() {
  const [items, setItems] = useState<CareerReference[] | null>(null);
  const [gone, setGone] = useState<CareerReference[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const load = () => { api.get<CareerReference[]>('references').then(setItems); api.get<CareerReference[]>('references?deleted=1').then(setGone); };
  useEffect(load, []);

  async function save(body: Draft, id?: number) {
    setBusy(true); setErr('');
    try { if (id) await api.patch(`references/${id}`, body); else await api.post('references', body); setAdding(false); setEditing(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 2000); } catch { /* clipboard blocked */ }
  }
  const ready = (items ?? []).filter((r) => r.okay_to_list);

  return (
    <div className="space-y-5">
      <p className="text-sm text-teal text-center">The people who will vouch for you, ready for any application that asks. Private: they never go on a resume and the AI never sees them.</p>
      <div className="flex justify-center gap-2 flex-wrap">
        <button className="btn" onClick={() => { setAdding((v) => !v); setEditing(null); setErr(''); }}><Plus size={16} /> Add a reference</button>
        {ready.length > 0 && <button className="btn-ghost" onClick={() => copy(ready.map(block).join('\n\n'), 'all')}><Copy size={14} /> {copied === 'all' ? 'Copied' : `Copy references list (${ready.length})`}</button>}
      </div>
      {adding && <RefForm onSave={(b) => save(b)} onCancel={() => setAdding(false)} busy={busy} err={err} />}
      <div className="space-y-3">
        {(items ?? []).map((r) => editing === r.id ? (
          <RefForm key={r.id} initial={r} onSave={(b) => save(b, r.id)} onCancel={() => setEditing(null)} busy={busy} err={err} />
        ) : (
          <div key={r.id} className="card p-4 space-y-1.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug font-sans">{r.name || 'Name not added yet'}</h3>
                <div className="text-sm text-teal">{[r.title, r.organization].filter(Boolean).join(', ')}</div>
              </div>
              <span className={`ml-auto shrink-0 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 font-medium ${r.okay_to_list ? 'bg-navy text-white' : 'bg-beige text-teal border border-sky'}`}>{r.okay_to_list ? 'Said yes' : 'Not asked yet'}</span>
            </div>
            {r.relationship && <p className="text-sm">{r.relationship}</p>}
            {(r.email || r.phone) && <p className="text-sm">{[r.email, r.phone].filter(Boolean).join(' · ')}</p>}
            {r.notes && <p className="text-sm text-teal whitespace-pre-wrap">{r.notes}</p>}
            {r.last_asked && <p className="text-xs text-teal">Last asked or updated {r.last_asked}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button className="btn-ghost" onClick={() => { setEditing(r.id); setAdding(false); setErr(''); }}>Edit</button>
              <button className="btn-ghost" onClick={() => copy(block(r), `r${r.id}`)}><Copy size={13} /> {copied === `r${r.id}` ? 'Copied' : 'Copy'}</button>
              <button className="text-teal hover:text-navy ml-auto" title="Move to Recently deleted" onClick={async () => { await api.del(`references/${r.id}`); load(); }}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {items && items.length === 0 && <EmptyState icon={Users} title="No references yet">Add the people who have agreed to vouch for you.</EmptyState>}
      </div>
      {gone.length > 0 && (
        <div className="text-center">
          <button className="text-sm text-teal underline" onClick={() => setShowGone((v) => !v)}>{showGone ? 'Hide' : 'Show'} recently deleted ({gone.length})</button>
          {showGone && <div className="card divide-y divide-sky/60 mt-2 text-left">
            {gone.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span>{r.name || r.organization}</span>
                <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`references/${r.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}
