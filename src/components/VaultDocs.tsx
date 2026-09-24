import { useEffect, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Download, Paperclip, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { VaultDoc } from '../types';

const CATS: { key: string; label: string }[] = [
  { key: 'education', label: 'Education' },
  { key: 'certification', label: 'Certifications and licenses' },
  { key: 'employment', label: 'Employment' },
  { key: 'reference', label: 'References and recommendations' },
  { key: 'other', label: 'Other' },
];
const MAX = 2_900_000;

const kb = (n: number | null) => (n == null ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const readFile = (f: File) => new Promise<{ name: string; mime: string; data: string }>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res({ name: f.name, mime: f.type || 'application/pdf', data: String(r.result).split(',')[1] ?? '' });
  r.onerror = () => rej(new Error('Could not read that file'));
  r.readAsDataURL(f);
});

function Expiry({ date }: { date: string | null }) {
  if (!date) return null;
  const d = differenceInCalendarDays(parseISO(date), new Date());
  const text = d < 0 ? `Expired ${format(parseISO(date), 'MMM d, yyyy')}` : d <= 60 ? `Expires in ${d} day${d === 1 ? '' : 's'}` : `Expires ${format(parseISO(date), 'MMM d, yyyy')}`;
  return <span className={`text-xs rounded px-2 py-0.5 ${d <= 60 ? 'bg-navy text-white' : 'bg-beige text-teal border border-sky'}`}>{text}</span>;
}

function DocForm({ initial, onSave, onCancel, busy, err }: { initial?: VaultDoc; onSave: (v: any) => void; onCancel: () => void; busy: boolean; err: string }) {
  const [v, setV] = useState({ title: initial?.title ?? '', category: initial?.category ?? 'education', issuer: initial?.issuer ?? '', expires_on: initial?.expires_on ?? '', notes: initial?.notes ?? '' });
  const [file, setFile] = useState<File | null>(null);
  const [localErr, setLocalErr] = useState('');
  return (
    <form className="card p-4 space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      if (file && file.size > MAX) { setLocalErr('That file is over 3 MB. Try a smaller scan or a compressed PDF.'); return; }
      setLocalErr('');
      onSave({ ...v, expires_on: v.expires_on || null, ...(file ? { file: await readFile(file) } : {}) });
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Title</label><input className="input" required placeholder="Official transcript" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus /></div>
        <div><label className="label">Category</label>
          <select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div><label className="label">Issued by</label><input className="input" placeholder="Dillard University" value={v.issuer} onChange={(e) => setV({ ...v, issuer: e.target.value })} /></div>
        <div><label className="label">Expires (optional)</label><input className="input" type="date" value={v.expires_on ?? ''} onChange={(e) => setV({ ...v, expires_on: e.target.value })} /></div>
      </div>
      <div><label className="label">Notes</label><input className="input" placeholder="Where the original is, when it was ordered, anything to remember" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      <div>
        <label className="label">{initial?.file_name ? `File (currently ${initial.file_name}, choose another to replace it)` : 'File (PDF, Word, PNG, or JPG, up to 3 MB)'}</label>
        <input type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
      </div>
      {(localErr || err) && <p className="text-sm text-red-700">{localErr || err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function VaultDocs() {
  const [docs, setDocs] = useState<VaultDoc[] | null>(null);
  const [gone, setGone] = useState<VaultDoc[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    api.get<VaultDoc[]>('vault/docs').then(setDocs);
    api.get<VaultDoc[]>('vault/docs?deleted=1').then(setGone);
  };
  useEffect(load, []);

  async function save(body: any, id?: number) {
    setBusy(true); setErr('');
    try { if (id) await api.patch(`vault/docs/${id}`, body); else await api.post('vault/docs', body); setAdding(false); setEditing(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-teal text-center">Your official records in one place: transcript, degree, certifications, offer letters, reviews, references. Stored privately in your Careering database. There is no public link, and only you can open them when signed in.</p>
      <div className="text-center"><button className="btn" onClick={() => { setAdding((v) => !v); setEditing(null); setErr(''); }}><Plus size={16} /> Add a document</button></div>
      {adding && <DocForm onSave={(b) => save(b)} onCancel={() => setAdding(false)} busy={busy} err={err} />}

      {docs && docs.length === 0 && !adding && <p className="text-sm text-teal text-center">Nothing here yet. Start with your official transcript and degree.</p>}
      {CATS.map((c) => {
        const list = (docs ?? []).filter((d) => d.category === c.key);
        if (!list.length) return null;
        return (
          <section key={c.key}>
            <h3 className="label mb-1.5">{c.label}</h3>
            <div className="space-y-2">
              {list.map((d) => editing === d.id ? (
                <DocForm key={d.id} initial={d} onSave={(b) => save(b, d.id)} onCancel={() => setEditing(null)} busy={busy} err={err} />
              ) : (
                <div key={d.id} className="card p-3.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex-1 min-w-52">
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-teal">{[d.issuer, d.notes].filter(Boolean).join(' · ')}</div>
                    {d.file_name && <div className="text-xs text-teal mt-0.5 inline-flex items-center gap-1"><Paperclip size={11} /> {d.file_name} ({kb(d.size)})</div>}
                  </div>
                  <Expiry date={d.expires_on} />
                  {d.file_name && <a className="btn-ghost" href={`/api/vault/docs/${d.id}/file`}><Download size={13} /> Download</a>}
                  <button className="btn-ghost" onClick={() => { setEditing(d.id); setAdding(false); setErr(''); }}>Edit</button>
                  <button className="text-teal hover:text-navy" title="Move to Recently deleted" onClick={async () => { await api.del(`vault/docs/${d.id}`); load(); }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {gone.length > 0 && (
        <div className="text-center">
          <button className="text-sm text-teal underline" onClick={() => setShowGone((v) => !v)}>{showGone ? 'Hide' : 'Show'} recently deleted ({gone.length})</button>
          {showGone && <div className="card divide-y divide-sky/60 mt-2 text-left">
            {gone.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span>{d.title}</span><span className="text-xs text-teal">{d.issuer}</span>
                <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`vault/docs/${d.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}
