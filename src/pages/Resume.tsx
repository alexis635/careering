import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Download, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { LibItem } from '../types';

const EXAMPLES = [
  'A one page resume for a creative producer role in music and live events',
  'Teaching focused, for LA charter schools, leading with curriculum work',
  'Corporate strategy manager at a media company, emphasizing data and partnerships',
];

const SHORTEN = 'Shorten so it fits on one page at a readable size: remove the 3 least relevant bullets and tighten the summary. Keep everything else exactly as it is.';

export default function ResumeBuilder() {
  const [request, setRequest] = useState('');
  const [baseId, setBaseId] = useState('');
  const [refine, setRefine] = useState('');
  const [items, setItems] = useState<LibItem[]>([]);
  const [current, setCurrent] = useState<LibItem | null>(null);
  const [text, setText] = useState('');
  const [fit, setFit] = useState<{ pages: number; fs: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api.get<LibItem[]>('library?kind=resume').then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const masters = items.filter((i) => !i.tags.includes('generated') && !i.tags.includes('archived'));
  const generated = items.filter((i) => i.tags.includes('generated'));

  async function measure(body: string) {
    const { measureFit } = await import('../lib/resumePdf');
    return measureFit('resume', body);
  }

  /** Show a result, and if it runs past one page, ask for a shorter version (up to twice). Every version is saved. */
  async function adopt(item: LibItem) {
    let cur = item;
    let f = await measure(cur.body);
    for (let i = 0; i < 2 && f.pages > 1; i++) {
      setBusy('Fitting to one page…');
      cur = await api.post<LibItem>('ai/resume', { item_id: cur.id, feedback: SHORTEN });
      f = await measure(cur.body);
    }
    setCurrent(cur); setText(cur.body); setFit(f); load();
  }

  async function run(fn: () => Promise<LibItem>, label: string) {
    setBusy(label); setMsg('');
    try { await adopt(await fn()); } catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  }

  const generate = () => run(() => api.post<LibItem>('ai/resume', { request, base_id: baseId ? Number(baseId) : undefined }), 'Writing your resume, about a minute…');

  async function saveEdits() {
    if (!current) return current;
    const saved = await api.patch<LibItem>(`library/${current.id}`, { body: text });
    setCurrent(saved); load(); setFit(await measure(saved.body));
    return saved;
  }

  const refineIt = () => run(async () => {
    const saved = (await saveEdits()) as LibItem;                 // keep any hand edits before refining
    setRefine('');
    return api.post<LibItem>('ai/resume', { item_id: saved.id, feedback: refine });
  }, 'Revising…');

  async function download() {
    setBusy('Building PDF…');
    try {
      const { downloadPdf } = await import('../lib/resumePdf');
      await downloadPdf('resume', text, (current?.title || 'Resume').replace(/^Custom:\s*/, '').replace(/[^\w ]+/g, '').trim().slice(0, 50) || 'Resume');
    } finally { setBusy(''); }
  }

  async function open(item: LibItem) {
    setMsg(''); setCurrent(item); setText(item.body); setFit(null); setFit(await measure(item.body));
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Resume builder</h1>
        <p className="text-sm text-teal mt-1">Describe the resume you need. It writes one from your Library, and you can refine it and export the PDF. No job required.</p>
      </div>

      <div className="card p-5 space-y-3">
        <label className="label">What kind of resume do you need?</label>
        <textarea className="input" rows={3} placeholder="For example: a one page resume for a creative producer role in music and live events" value={request} onChange={(e) => setRequest(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => <button key={x} type="button" className="text-xs rounded-full border border-sky bg-beige px-2.5 py-1 hover:bg-sky/50 text-left" onClick={() => setRequest(x)}>{x}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-auto text-sm" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            <option value="">Start from: best fit automatically</option>
            {masters.map((m) => <option key={m.id} value={m.id}>Start from: {m.title.replace(/^Master:\s*/, '')}</option>)}
          </select>
          <button className="btn" disabled={!!busy || !request.trim()} onClick={generate}><Sparkles size={14} /> {busy || 'Generate resume'}</button>
        </div>
        {msg && <p className="text-sm text-red-700">{msg}</p>}
      </div>

      {current && (
        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{current.title}</span>
            {fit && <span className={`text-xs rounded px-2 py-0.5 ${fit.pages > 1 ? 'bg-sky text-navy' : 'bg-beige text-teal border border-sky'}`}>{fit.pages > 1 ? `Runs to ${fit.pages} pages` : `One page, ${fit.fs.toFixed(1)} pt`}</span>}
            <span className="text-xs text-teal ml-auto">Saved to your Library</span>
          </div>
          <textarea className="input font-mono text-[12px] leading-relaxed" rows={22} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" disabled={!!busy} onClick={download}><Download size={14} /> Download PDF</button>
            <button className="btn-ghost" disabled={!!busy || text === current.body} onClick={() => run(async () => (await saveEdits()) as LibItem, 'Saving…')}>Save edits</button>
            {fit && fit.pages > 1 && <button className="btn-ghost" disabled={!!busy} onClick={() => run(async () => { const s = (await saveEdits()) as LibItem; return api.post<LibItem>('ai/resume', { item_id: s.id, feedback: SHORTEN }); }, 'Shortening…')}>Shorten to fit one page</button>}
          </div>
          <div className="flex gap-2 pt-1">
            <input className="input" placeholder="Refine it: for example, lead with the events work, or make the summary shorter" value={refine} onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && refine.trim() && !busy) refineIt(); }} />
            <button className="btn-ghost whitespace-nowrap" disabled={!!busy || !refine.trim()} onClick={refineIt}>Revise</button>
          </div>
          <p className="text-xs text-teal">Each revision is saved as a new version, so nothing is lost. Your changes to the text are saved when you revise.</p>
        </div>
      )}

      {generated.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-center mb-3">Your generated resumes</h2>
          <div className="card divide-y divide-sky/60">
            {generated.map((g) => (
              <button key={g.id} className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-beige/60" onClick={() => open(g)}>
                <span className="font-medium truncate">{g.title.replace(/^Custom:\s*/, '')}</span>
                {(g as any).updated_at && <span className="ml-auto text-xs text-teal whitespace-nowrap">{format(new Date((g as any).updated_at), 'MMM d')}</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-teal text-center mt-2">They also appear under Library, Resume versions, and in the email attachment list. <Link to="/library" className="underline">Open Library</Link></p>
        </div>
      )}
    </div>
  );
}
