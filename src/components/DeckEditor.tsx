import { useEffect, useState } from 'react';
import { Download, Save, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import SlidePreview from './SlidePreview';
import { sanitizeSpec, type Slide } from '../lib/deckSpec';
import { downloadDeckPdf, downloadDeckPptx } from '../lib/deckExport';
import type { Deck } from '../types';

const NAMES: Record<string, string> = { title: 'Title', statement: 'Statement', bigNumber: 'Big number', list: 'List', twoColumn: 'Two columns', timeline: 'Timeline', closing: 'Closing' };
const lines = (v?: string[]) => (v ?? []).join('\n');
const unlines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default function DeckEditor({ deck, onSaved, onTrashed }: { deck: Deck; onSaved: (d: Deck) => void; onTrashed: () => void }) {
  const [spec, setSpec] = useState(deck.spec);
  const [i, setI] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(() => { setSpec(deck.spec); setI(0); setDirty(false); setMsg(''); }, [deck.id]);

  const slide = spec.slides[Math.min(i, spec.slides.length - 1)];
  const idx = spec.slides.indexOf(slide);
  const edit = (patch: Partial<Slide>) => { setSpec({ ...spec, slides: spec.slides.map((s, k) => (k === idx ? { ...s, ...patch } : s)) }); setDirty(true); };

  async function save() {
    setBusy('save'); setMsg('');
    try { const d = await api.patch<Deck>(`decks/${deck.id}`, { spec }); setSpec(d.spec); setDirty(false); onSaved(d); setMsg('Saved.'); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  }
  async function revise() {
    if (!feedback.trim()) return;
    if (dirty && !confirm('Your unsaved edits will not be part of the revision, which is saved as a new version. Continue?')) return;
    setBusy('revise'); setMsg('');
    try { const d = await api.post<Deck>('ai/deck', { job_id: deck.job_id, deck_id: deck.id, feedback }); setFeedback(''); onSaved(d); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  }
  async function exportAs(kind: 'pdf' | 'pptx' | 'google') {
    setBusy(kind); setMsg('');
    let tab: Window | null = null;
    try {
      const clean = sanitizeSpec(spec);
      if (kind === 'google') {
        const st = await api.get<{ drive?: boolean }>('gmail/status');
        if (!st.drive) {   // one time: Google asks for permission to create files this app makes in your Drive
          if (!confirm('One-time setup: Google will ask you to allow Careering to create decks in your Drive, then bring you back here. Continue?')) return;
          window.location.href = (await api.get<{ url: string }>('gmail/connect')).url; return;
        }
        tab = window.open('', '_blank');   // opened inside the click so the browser allows it
        const { deckPptxBase64 } = await import('../lib/deckPptx');
        const r = await api.post<{ url: string }>('gmail/slides', { title: deck.title, data: await deckPptxBase64(clean) });
        if (tab) tab.location.href = r.url; else window.location.href = r.url;
        setMsg('Opened in Google Slides. It is saved in your Drive.');
        return;
      }
      await (kind === 'pdf' ? downloadDeckPdf : downloadDeckPptx)(clean, deck.title);
    }
    catch (e: any) { tab?.close(); setMsg(e.message || 'Could not build the file'); } finally { setBusy(null); }
  }
  async function trash() {
    if (!confirm('Move this deck to Recently deleted? You can restore it any time.')) return;
    await api.del(`decks/${deck.id}`); onTrashed();
  }
  if (!slide) return <div className="card p-5 text-sm text-teal">This deck has no slides.</div>;

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-xs font-semibold text-teal">{label}</span>{children}</label>;
  const warnings = [...(spec.warnings ?? [])];

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
          <div className="font-semibold">Check these numbers before you use this deck</div>
          {warnings.map((w, k) => <div key={k}>{w}</div>)}
        </div>
      )}
      <div className="grid md:grid-cols-[1fr_260px] gap-4 items-start">
        <div className="space-y-3">
          <SlidePreview slide={slide} index={idx} total={spec.slides.length} deck={spec} />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {spec.slides.map((s, k) => (
              <button key={k} onClick={() => setI(k)} className={`shrink-0 w-28 rounded ${k === idx ? 'ring-2 ring-navy' : 'opacity-80 hover:opacity-100'}`} title={s.heading}>
                <SlidePreview slide={s} index={k} total={spec.slides.length} deck={spec} />
              </button>
            ))}
          </div>
        </div>
        <div className="card p-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-teal">Slide {idx + 1} of {spec.slides.length}, {NAMES[slide.layout]}</div>
          <F label="Heading"><input className="input" value={slide.heading} onChange={(e) => edit({ heading: e.target.value })} /></F>
          {(slide.layout === 'title' || slide.layout === 'closing' || slide.subheading !== undefined) && <F label="Subheading"><input className="input" value={slide.subheading ?? ''} onChange={(e) => edit({ subheading: e.target.value })} /></F>}
          {(slide.layout === 'statement' || slide.layout === 'closing' || slide.layout === 'bigNumber' || slide.body !== undefined) && <F label="Text"><textarea className="input" rows={4} value={slide.body ?? ''} onChange={(e) => edit({ body: e.target.value })} /></F>}
          {slide.layout === 'bigNumber' && slide.stat && (
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <F label="Number"><input className="input" value={slide.stat.value} onChange={(e) => edit({ stat: { ...slide.stat!, value: e.target.value } })} /></F>
              <F label="What it means"><input className="input" value={slide.stat.label} onChange={(e) => edit({ stat: { ...slide.stat!, label: e.target.value } })} /></F>
            </div>
          )}
          {slide.layout === 'list' && <F label="Points, one per line"><textarea className="input" rows={5} value={lines(slide.bullets)} onChange={(e) => edit({ bullets: unlines(e.target.value) })} /></F>}
          {slide.layout === 'twoColumn' && (['left', 'right'] as const).map((side) => slide[side] && (
            <div key={side} className="space-y-1.5">
              <F label={`${side === 'left' ? 'Left' : 'Right'} heading`}><input className="input" value={slide[side]!.heading} onChange={(e) => edit({ [side]: { ...slide[side]!, heading: e.target.value } })} /></F>
              <F label="Points, one per line"><textarea className="input" rows={3} value={lines(slide[side]!.bullets)} onChange={(e) => edit({ [side]: { ...slide[side]!, bullets: unlines(e.target.value) } })} /></F>
            </div>
          ))}
          {slide.layout === 'timeline' && (slide.steps ?? []).map((st, k) => (
            <div key={k} className="space-y-1.5">
              <F label={`Step ${k + 1}`}><input className="input" value={st.label} onChange={(e) => edit({ steps: slide.steps!.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} /></F>
              <textarea className="input" rows={2} value={st.detail} onChange={(e) => edit({ steps: slide.steps!.map((x, j) => (j === k ? { ...x, detail: e.target.value } : x)) })} />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <F label="Speaker notes (not on the slide, shown in Keynote and PowerPoint presenter view)"><textarea className="input" rows={5} value={slide.notes} onChange={(e) => edit({ notes: e.target.value })} /></F>
      </div>

      {spec.check_before_sharing?.length > 0 && (
        <div className="card p-4 text-sm">
          <div className="font-semibold mb-1">Before you share this</div>
          <ul className="list-disc pl-5 space-y-0.5">{spec.check_before_sharing.map((c, k) => <li key={k}>{c}</li>)}</ul>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={!dirty || !!busy} onClick={save}><Save size={14} /> {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => exportAs('pptx')}><Download size={14} /> {busy === 'pptx' ? 'Building…' : 'PowerPoint (opens in Keynote)'}</button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => exportAs('google')}><Download size={14} /> {busy === 'google' ? 'Building…' : 'Open in Google Slides'}</button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => exportAs('pdf')}><Download size={14} /> {busy === 'pdf' ? 'Building…' : 'PDF'}</button>
          <button className="btn-ghost ml-auto" title="Move to Recently deleted" onClick={trash}><Trash2 size={13} /></button>
          {msg && <span className="text-sm text-teal">{msg}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-56 text-sm" placeholder="Ask for changes, like: make it shorter, lead with the Spears result, warmer tone" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <button className="btn" disabled={!!busy || !feedback.trim()} onClick={revise}><Sparkles size={14} /> {busy === 'revise' ? 'Revising, about a minute…' : 'Revise as a new version'}</button>
        </div>
      </div>
    </div>
  );
}
