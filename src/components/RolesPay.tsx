import { useEffect, useMemo, useState } from 'react';
import { differenceInMonths, format, parseISO } from 'date-fns';
import { Eye, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { CompEntry, Role } from '../types';

const KINDS: Record<string, string> = { start: 'Starting pay', raise: 'Raise', promotion: 'Promotion', bonus: 'Bonus', other: 'Other' };
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const mask = '$ ••••••';
const pct = (from: number, to: number) => { const p = ((to - from) / from) * 100; return `${p >= 0 ? '+' : ''}${p.toFixed(p % 1 === 0 || Math.abs(p) >= 10 ? 0 : 1)}%`; };

function span(r: Role) {
  const fmt = (d: string) => (r.approx ? format(parseISO(d), 'yyyy') : format(parseISO(d), 'MMM yyyy'));
  if (!r.start_date) return 'Start date not set';
  const end = r.end_date ? parseISO(r.end_date) : new Date();
  const m = Math.max(0, differenceInMonths(end, parseISO(r.start_date)));
  const len = m >= 12 ? `${Math.floor(m / 12)} yr${m >= 24 ? 's' : ''}${m % 12 ? ` ${m % 12} mo` : ''}` : `${m} mo`;
  return `${fmt(r.start_date)} to ${r.end_date ? fmt(r.end_date) : 'present'}${r.approx ? ' (approx)' : `, ${len}`}`;
}

function RoleForm({ initial, onSave, onCancel, busy, err }: { initial?: Role; onSave: (v: any) => void; onCancel: () => void; busy: boolean; err: string }) {
  const [v, setV] = useState({ employer: initial?.employer ?? '', title: initial?.title ?? '', start_date: initial?.start_date ?? '', end_date: initial?.end_date ?? '', approx: initial?.approx ?? false, notes: initial?.notes ?? '' });
  return (
    <form className="card p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...v, start_date: v.start_date || null, end_date: v.end_date || null }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Employer</label><input className="input" required value={v.employer} onChange={(e) => setV({ ...v, employer: e.target.value })} autoFocus /></div>
        <div><label className="label">Title</label><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div><label className="label">Started</label><input className="input" type="date" value={v.start_date ?? ''} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></div>
        <div><label className="label">Ended (leave empty if current)</label><input className="input" type="date" value={v.end_date ?? ''} onChange={(e) => setV({ ...v, end_date: e.target.value })} /></div>
      </div>
      <label className="text-sm text-teal flex items-center gap-2"><input type="checkbox" checked={v.approx} onChange={(e) => setV({ ...v, approx: e.target.checked })} /> These dates are approximate (show years only)</label>
      <div><label className="label">Notes</label><input className="input" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function CompForm({ onSave, onCancel, busy, err }: { onSave: (v: any) => void; onCancel: () => void; busy: boolean; err: string }) {
  const [v, setV] = useState({ effective_on: '', kind: 'raise', amount: '', note: '' });
  return (
    <form className="rounded-lg bg-beige p-3 space-y-2" onSubmit={(e) => { e.preventDefault(); onSave({ ...v, effective_on: v.effective_on || null, amount: v.amount.replace(/[$,\s]/g, '') }); }}>
      <div className="grid gap-2 sm:grid-cols-4">
        <input className="input" type="date" title="Effective date" value={v.effective_on} onChange={(e) => setV({ ...v, effective_on: e.target.value })} />
        <select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="input" inputMode="decimal" placeholder="Annual pay, e.g. 65000" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        <input className="input" placeholder="Note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><button className="btn" disabled={busy}>Add pay entry</button><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function RolesPay() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [gone, setGone] = useState<Role[]>([]);
  const [show, setShow] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [showGone, setShowGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { api.get<Role[]>('roles').then(setRoles); api.get<Role[]>('roles?deleted=1').then(setGone); };
  useEffect(load, []);

  // every pay figure across your career, oldest first, so each change can be compared with the one before it
  const timeline = useMemo(() => {
    const all: (CompEntry & { employer: string })[] = [];
    (roles ?? []).forEach((r) => r.comp.forEach((c) => c.amount != null && all.push({ ...c, employer: r.employer })));
    return all.sort((a, b) => (a.effective_on ?? '').localeCompare(b.effective_on ?? '') || a.id - b.id);
  }, [roles]);
  const prevOf = (id: number) => { const i = timeline.findIndex((c) => c.id === id); return i > 0 ? timeline[i - 1] : null; };
  const first = timeline[0], latest = timeline[timeline.length - 1];
  const raises = timeline.filter((c) => c.kind === 'raise' || c.kind === 'promotion').length;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr('');
    try { await fn(); setAdding(false); setEditing(null); setPayFor(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-teal text-center">Your career record: every role you have held, and the pay that went with it. When it is time to ask for a raise, you will have the whole history in one place.</p>

      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn" onClick={() => { setAdding((v) => !v); setEditing(null); setErr(''); }}><Plus size={16} /> Add a role</button>
        <button className="btn-ghost" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Hide amounts' : 'Show amounts'}</button>
      </div>

      {timeline.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card py-3 text-center"><div className="text-xl font-display font-bold">{show ? money(latest.amount!) : mask}</div><div className="text-[10px] uppercase tracking-wide text-teal">Latest annual pay</div></div>
          <div className="card py-3 text-center"><div className="text-xl font-display font-bold">{timeline.length > 1 ? pct(first.amount!, latest.amount!) : 'n/a'}</div><div className="text-[10px] uppercase tracking-wide text-teal">Growth since first entry</div></div>
          <div className="card py-3 text-center"><div className="text-xl font-display font-bold">{raises}</div><div className="text-[10px] uppercase tracking-wide text-teal">Raises and promotions</div></div>
        </div>
      )}

      {adding && <RoleForm onSave={(b) => run(() => api.post('roles', b))} onCancel={() => setAdding(false)} busy={busy} err={err} />}

      <div className="space-y-3">
        {(roles ?? []).map((r) => editing === r.id ? (
          <RoleForm key={r.id} initial={r} onSave={(b) => run(() => api.patch(`roles/${r.id}`, b))} onCancel={() => setEditing(null)} busy={busy} err={err} />
        ) : (
          <div key={r.id} className="card p-4 space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1 min-w-52">
                <div className="font-semibold leading-snug font-sans">{r.title || 'Role'}</div>
                <div className="text-sm text-teal">{r.employer}</div>
                <div className="text-xs text-teal">{span(r)}{r.notes && ` · ${r.notes}`}</div>
              </div>
              {!r.end_date && <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-navy text-white">Current</span>}
              <button className="btn-ghost" onClick={() => { setEditing(r.id); setAdding(false); setErr(''); }}>Edit</button>
              <button className="text-teal hover:text-navy" title="Move to Recently deleted" onClick={async () => { await api.del(`roles/${r.id}`); load(); }}><Trash2 size={15} /></button>
            </div>

            {r.comp.length > 0 && (
              <div className="divide-y divide-sky/60 border-t border-sky/60">
                {r.comp.map((c) => {
                  const prev = c.amount != null ? prevOf(c.id) : null;
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-x-3 py-1.5 text-sm">
                      <span className="w-20 text-xs text-teal">{c.effective_on ? format(parseISO(c.effective_on), 'MMM yyyy') : 'No date'}</span>
                      <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-sky text-navy">{KINDS[c.kind] ?? c.kind}</span>
                      <span className="font-medium">{c.amount == null ? 'No amount' : show ? money(c.amount) : mask}</span>
                      {prev && c.amount != null && <span className="text-xs text-teal">{pct(prev.amount!, c.amount)} from previous</span>}
                      {c.note && <span className="text-xs text-teal">{c.note}</span>}
                      <button className="ml-auto text-teal hover:text-navy" title="Remove (kept in your export)" onClick={async () => { if (confirm('Remove this pay entry? It stays in the database and in Export everything.')) { await api.del(`comp/${c.id}`); load(); } }}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            )}
            {payFor === r.id
              ? <CompForm onSave={(b) => run(() => api.post(`roles/${r.id}/comp`, b))} onCancel={() => setPayFor(null)} busy={busy} err={err} />
              : <button className="text-xs text-teal underline" onClick={() => { setPayFor(r.id); setErr(''); }}>Add a pay entry</button>}
          </div>
        ))}
        {roles && roles.length === 0 && <p className="text-sm text-teal text-center">No roles yet. Add your current one to start.</p>}
      </div>

      {gone.length > 0 && (
        <div className="text-center">
          <button className="text-sm text-teal underline" onClick={() => setShowGone((v) => !v)}>{showGone ? 'Hide' : 'Show'} recently deleted ({gone.length})</button>
          {showGone && <div className="card divide-y divide-sky/60 mt-2 text-left">
            {gone.map((r) => <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span>{r.title}, {r.employer}</span>
              <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`roles/${r.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button></div>)}
          </div>}
        </div>
      )}
    </div>
  );
}
