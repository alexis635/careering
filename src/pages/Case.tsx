import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO, subMonths } from 'date-fns';
import { ArrowLeft, Download, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Win } from '../types';

interface Case { id: number; title: string; purpose: string; employer: string; body: string; created_at: string; params: any }

const PURPOSES = [
  { key: 'promotion', label: 'A promotion' },
  { key: 'raise', label: 'A raise' },
  { key: 'review', label: 'A performance review' },
];

export default function CaseBuilder() {
  const [wins, setWins] = useState<Win[] | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [purpose, setPurpose] = useState('promotion');
  const [employer, setEmployer] = useState('');
  const [role, setRole] = useState('');
  const [target, setTarget] = useState('');
  const [range, setRange] = useState<'all' | '12' | 'custom'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [context, setContext] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [current, setCurrent] = useState<Case | null>(null);
  const [text, setText] = useState('');
  const [fit, setFit] = useState<{ pages: number; fs: number } | null>(null);
  const [refine, setRefine] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const loadCases = () => api.get<Case[]>('cases').then(setCases).catch(() => {});
  useEffect(() => { api.get<Win[]>('wins').then(setWins); loadCases(); }, []);

  const employers = useMemo(() => [...new Set((wins ?? []).map((w) => w.employer).filter(Boolean))], [wins]);
  const lo = range === '12' ? format(subMonths(new Date(), 12), 'yyyy-MM-dd') : range === 'custom' ? from : '';
  const hi = range === 'custom' ? to : '';
  const inRange = (w: Win) => !w.happened_on || ((!lo || w.happened_on >= lo) && (!hi || w.happened_on <= hi));
  const atEmployer = (w: Win) => !!employer && w.employer.toLowerCase().includes(employer.toLowerCase().trim());

  // Default selection: wins at the chosen employer, inside the period. Everything else is available as supporting evidence.
  useEffect(() => {
    if (!wins) return;
    setPicked(new Set(wins.filter((w) => (employer ? atEmployer(w) : true) && inRange(w)).map((w) => w.id)));
    const latest = wins.find((w) => atEmployer(w) && w.role);
    if (latest && !role) setRole(latest.role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wins, employer, range, from, to]);

  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const measure = async (body: string) => (await import('../lib/resumePdf')).measureFit('case', body);

  async function show(c: Case) { setCurrent(c); setText(c.body); setFit(null); setFit(await measure(c.body)); loadCases(); }
  async function run(fn: () => Promise<Case>, label: string) {
    setBusy(label); setMsg('');
    try { await show(await fn()); } catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  }

  const generate = () => run(() => api.post<Case>('ai/case', { purpose, employer, current_role: role, target, from: lo || undefined, to: hi || undefined, win_ids: [...picked], context }), 'Building your case, about a minute…');

  async function saveEdits() {
    if (!current) return null;
    const saved = await api.patch<Case>(`cases/${current.id}`, { body: text });
    setCurrent(saved); loadCases(); setFit(await measure(saved.body));
    return saved;
  }
  const revise = () => run(async () => { const s = await saveEdits(); setRefine(''); return api.post<Case>('ai/case', { case_id: s!.id, feedback: refine }); }, 'Revising…');

  async function download() {
    setBusy('Building PDF…');
    try { const { downloadPdf } = await import('../lib/resumePdf'); await downloadPdf('case', text, (current?.title || 'Case').replace(/[^\w ]+/g, '').trim().slice(0, 50)); } finally { setBusy(''); }
  }

  const otherEmployers = (wins ?? []).filter((w) => employer && !atEmployer(w));
  const mine = (wins ?? []).filter((w) => !employer || atEmployer(w));
  const row = (w: Win) => (
    <label key={w.id} className={`flex items-start gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-beige/60 ${inRange(w) ? '' : 'opacity-50'}`}>
      <input type="checkbox" className="mt-1" checked={picked.has(w.id)} onChange={() => toggle(w.id)} />
      <span className="flex-1"><span className="font-medium">{w.title}</span>
        <span className="block text-xs text-teal">{w.happened_on ? format(parseISO(w.happened_on), 'MMM yyyy') : 'No date yet'}{w.employer && `, ${w.employer}`}{w.impact && `. ${w.impact}`}</span></span>
    </label>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/rise" className="text-sm text-teal inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Rise</Link>
        <h1 className="text-5xl font-bold text-center">Build my case</h1>
        <p className="text-sm text-teal text-center mt-1">Turn your logged wins into a case for a promotion, raise, or review. It uses only the wins you choose, in your own voice, and it never invents a number.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">This is for</label><select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>{PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
          <div><label className="label">At which employer</label><input className="input" list="case-employers" placeholder="Charter Schools USA" value={employer} onChange={(e) => setEmployer(e.target.value)} /><datalist id="case-employers">{employers.map((x) => <option key={x} value={x} />)}</datalist></div>
          <div><label className="label">Your current title</label><input className="input" value={role} onChange={(e) => setRole(e.target.value)} /></div>
          <div><label className="label">What you are asking for</label><input className="input" placeholder="Senior Manager, or a raise to a number you name" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
        </div>
        <div>
          <label className="label">Period to cover</label>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={range} onChange={(e) => setRange(e.target.value as any)}><option value="all">All time</option><option value="12">Last 12 months</option><option value="custom">Custom dates</option></select>
            {range === 'custom' && <><input className="input w-auto" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="text-teal text-sm">to</span><input className="input w-auto" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></>}
          </div>
        </div>
        <div><label className="label">Anything I should know (optional)</label><textarea className="input" rows={2} placeholder="For example: my manager cares most about retention, the review is in March, budgets are tight" value={context} onChange={(e) => setContext(e.target.value)} /></div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-center mb-1">Choose the wins to build from ({picked.size} picked)</h2>
        <p className="text-xs text-teal text-center mb-2">Wins at your employer are picked for you. Wins with no date are included, so add dates in Rise, Wins for a tighter case.{' '}<Link to="/rise" className="underline">Open Wins</Link></p>
        {wins && wins.length === 0 && <p className="text-sm text-teal text-center">No wins yet. Add some in Rise, then Wins.</p>}
        {mine.length > 0 && <div className="card divide-y divide-sky/60">{mine.map(row)}</div>}
        {otherEmployers.length > 0 && <>
          <p className="label text-center mt-4 mb-1.5">Other employers, only as short supporting evidence</p>
          <div className="card divide-y divide-sky/60">{otherEmployers.map(row)}</div>
        </>}
        <div className="text-center mt-4">
          <button className="btn" disabled={!!busy || !picked.size} onClick={generate}><Sparkles size={14} /> {busy || 'Build my case'}</button>
          {msg && <p className="text-sm text-red-700 mt-2">{msg}</p>}
        </div>
      </div>

      {current && (
        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{current.title}</span>
            {fit && <span className="text-xs rounded px-2 py-0.5 bg-beige text-teal border border-sky">{fit.pages === 1 ? `One page, ${fit.fs.toFixed(1)} pt` : `${fit.pages} pages, ${fit.fs.toFixed(1)} pt`}</span>}
            <span className="text-xs text-teal ml-auto">Saved</span>
          </div>
          <p className="text-xs text-teal">The last section, Evidence to gather, is for you. Remove it before you share the case with anyone.</p>
          <textarea className="input font-mono text-[12px] leading-relaxed" rows={26} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={!!busy} onClick={download}><Download size={14} /> Download PDF</button>
            <button className="btn-ghost" disabled={!!busy || text === current.body} onClick={() => run(async () => (await saveEdits()) as Case, 'Saving…')}>Save edits</button>
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="Refine it: for example, lead with the revenue results, or make it shorter" value={refine} onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && refine.trim() && !busy) revise(); }} />
            <button className="btn-ghost whitespace-nowrap" disabled={!!busy || !refine.trim()} onClick={revise}>Revise</button>
          </div>
          <p className="text-xs text-teal">Each revision is saved as a new version. Your text edits are saved when you revise.</p>
        </div>
      )}

      {cases.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-center mb-3">Your saved cases</h2>
          <div className="card divide-y divide-sky/60">
            {cases.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <button className="font-medium text-left hover:underline truncate" onClick={() => show(c)}>{c.title}</button>
                <span className="ml-auto text-xs text-teal whitespace-nowrap">{format(new Date(c.created_at), 'MMM d, yyyy')}</span>
                <button className="text-teal hover:text-navy" title="Delete (kept in the database)" onClick={async () => { await api.del(`cases/${c.id}`); if (current?.id === c.id) setCurrent(null); loadCases(); }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
