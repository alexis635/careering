import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

/*
 Form editor for the resume text format (see lib/resumePdf.tsx). It reads the text into pieces
 (header, sections, entries, bullets), lets you edit each piece, and writes the same text back,
 so the PDF, the AI, and the Library all keep working from one source.
*/

type Node =
  | { k: 'entry'; left: string; right: string; sub: string; bullets: string[] }
  | { k: 'para'; text: string }
  | { k: 'bullets'; items: string[] };
interface Section { title: string; nodes: Node[] }
interface Model { name: string; headline: string; contact: string; sections: Section[] }

export function parseModel(src: string): Model {
  const lines = src.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const m: Model = { name: '', headline: '', contact: '', sections: [] };
  let i = 0;
  while (i < lines.length && !lines[i]) i++;
  if (i < lines.length && !/^(#|-)/.test(lines[i])) m.name = lines[i++].replace(/^\*+|\*+$/g, '');
  for (let k = 0; k < 2; k++) {
    while (i < lines.length && !lines[i]) i++;
    if (i < lines.length && !/^(#|-|>)/.test(lines[i]) && (k === 1 || lines[i].includes('@') || (lines[i + 1] ?? '').includes('@') || (lines[i + 2] ?? '').includes('@'))) {
      if (lines[i].includes('@')) m.contact = lines[i++]; else m.headline = lines[i++];
    }
  }
  let sec: Section | null = null;
  const cur = () => sec ?? (sec = { title: '', nodes: [] }, m.sections.push(sec), sec);
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (l.startsWith('## ')) { sec = { title: l.slice(3), nodes: [] }; m.sections.push(sec); }
    else if (l.startsWith('### ')) { const [a, ...b] = l.slice(4).split('|'); cur().nodes.push({ k: 'entry', left: a.trim(), right: b.join('|').trim(), sub: '', bullets: [] }); }
    else if (l.startsWith('> ')) {
      const last = cur().nodes[cur().nodes.length - 1];
      if (last?.k === 'entry' && !last.sub && !last.bullets.length) last.sub = l.slice(2); else cur().nodes.push({ k: 'para', text: l });
    } else if (/^[-•*]\s+/.test(l)) {
      const text = l.replace(/^[-•*]\s+/, '');
      const last = cur().nodes[cur().nodes.length - 1];
      if (last?.k === 'entry') last.bullets.push(text);
      else if (last?.k === 'bullets') last.items.push(text);
      else cur().nodes.push({ k: 'bullets', items: [text] });
    } else cur().nodes.push({ k: 'para', text: l });
  }
  return m;
}

export function writeModel(m: Model): string {
  const out: string[] = [];
  if (m.name.trim()) out.push(m.name.trim());
  if (m.headline.trim()) out.push(m.headline.trim());
  if (m.contact.trim()) out.push(m.contact.trim());
  for (const s of m.sections) {
    out.push('', `## ${s.title.trim() || 'Section'}`);
    for (const n of s.nodes) {
      if (n.k === 'para') { if (n.text.trim()) out.push(n.text.trim()); }
      else if (n.k === 'bullets') n.items.filter((b) => b.trim()).forEach((b) => out.push(`- ${b.trim()}`));
      else {
        const left = n.left.trim() || 'Role, Company';
        out.push(`### ${n.right.trim() ? `${left} | ${n.right.trim()}` : left}`);
        if (n.sub.trim()) out.push(`> ${n.sub.trim()}`);
        n.bullets.filter((b) => b.trim()).forEach((b) => out.push(`- ${b.trim()}`));
      }
    }
  }
  return out.join('\n').trim() + '\n';
}

const move = <T,>(xs: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c;
};

function Grow({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea className="input resize-none leading-snug" rows={Math.max(1, Math.ceil(value.length / 88))} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export default function ResumeEditor({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const [raw, setRaw] = useState(false);
  // The form keeps its own copy so blank new bullets and entries survive; it re-reads the text only when it changes from outside.
  const [model, setModel] = useState<Model>(() => parseModel(text));
  const written = useRef(writeModel(parseModel(text)));
  if (text !== written.current && writeModel(model) !== text) { const m = parseModel(text); written.current = writeModel(m); setModel(m); }
  const commit = (m: Model) => { const t = writeModel(m); written.current = t; setModel(m); onChange(t); };
  const setSec = (si: number, fn: (s: Section) => Section) => commit({ ...model, sections: model.sections.map((s, i) => (i === si ? fn(s) : s)) });
  const setNode = (si: number, ni: number, fn: (n: Node) => Node) => setSec(si, (s) => ({ ...s, nodes: s.nodes.map((n, i) => (i === ni ? fn(n) : n)) }));
  const newEntry = (): Node => ({ k: 'entry', left: '', right: '', sub: '', bullets: [''] });

  function addExperience() {
    const at = model.sections.findIndex((s) => /experience|employment|work/i.test(s.title));
    if (at === -1) { commit({ ...model, sections: [...model.sections, { title: 'Experience', nodes: [newEntry()] }] }); return; }
    const s = model.sections[at];
    const first = s.nodes.findIndex((n) => n.k === 'entry');
    // newest first: a new role goes at the top of the existing roles
    setSec(at, (x) => ({ ...x, nodes: first === -1 ? [...x.nodes, newEntry()] : [...x.nodes.slice(0, first), newEntry(), ...x.nodes.slice(first)] }));
  }

  if (raw) {
    return (
      <div className="space-y-2">
        <textarea className="input font-mono text-[12px] leading-relaxed" rows={22} value={text} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="text-xs text-teal underline" onClick={() => setRaw(false)}>Back to the form</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={addExperience}><Plus size={14} /> Add experience</button>
        <button type="button" className="btn-ghost" onClick={() => commit({ ...model, sections: [...model.sections, { title: 'New section', nodes: [{ k: 'bullets', items: [''] }] }] })}><Plus size={14} /> Add section</button>
        <button type="button" className="text-xs text-teal underline ml-auto" onClick={() => setRaw(true)}>Edit as plain text</button>
      </div>

      <div className="rounded-xl border border-sky/60 bg-beige/50 p-3 grid gap-2 sm:grid-cols-2">
        <div><label className="label">Name</label><input className="input" value={model.name} onChange={(e) => commit({ ...model, name: e.target.value })} /></div>
        <div><label className="label">Headline</label><input className="input" value={model.headline} onChange={(e) => commit({ ...model, headline: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">Contact line</label><input className="input" value={model.contact} onChange={(e) => commit({ ...model, contact: e.target.value })} /></div>
      </div>

      {model.sections.map((s, si) => (
        <div key={si} className="rounded-xl border border-sky/60 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input className="input font-semibold uppercase tracking-wide" value={s.title} onChange={(e) => setSec(si, (x) => ({ ...x, title: e.target.value }))} />
            <button type="button" title="Move section up" className="text-teal hover:text-navy" onClick={() => commit({ ...model, sections: move(model.sections, si, -1) })}><ArrowUp size={15} /></button>
            <button type="button" title="Move section down" className="text-teal hover:text-navy" onClick={() => commit({ ...model, sections: move(model.sections, si, 1) })}><ArrowDown size={15} /></button>
            <button type="button" title="Remove section" className="text-teal hover:text-navy" onClick={() => { if (confirm(`Remove the ${s.title || 'this'} section from this resume?`)) commit({ ...model, sections: model.sections.filter((_, i) => i !== si) }); }}><Trash2 size={15} /></button>
          </div>

          {s.nodes.map((n, ni) => (
            <div key={ni} className="rounded-lg bg-white border border-sky/50 p-3 space-y-2">
              {n.k === 'para' && (
                <div className="flex gap-2">
                  <Grow value={n.text} onChange={(v) => setNode(si, ni, () => ({ k: 'para', text: v }))} />
                  <button type="button" className="text-teal hover:text-navy self-start pt-2" onClick={() => setSec(si, (x) => ({ ...x, nodes: x.nodes.filter((_, i) => i !== ni) }))}><Trash2 size={14} /></button>
                </div>
              )}
              {n.k === 'bullets' && <BulletList items={n.items} onChange={(items) => setNode(si, ni, () => ({ k: 'bullets', items }))} />}
              {n.k === 'entry' && (
                <>
                  <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                    <div><label className="label">Role, company</label><input className="input" placeholder="Program Manager, Acme" value={n.left} onChange={(e) => setNode(si, ni, (x) => ({ ...(x as typeof n), left: e.target.value }))} /></div>
                    <div><label className="label">Dates</label><input className="input" placeholder="2021 to 2024" value={n.right} onChange={(e) => setNode(si, ni, (x) => ({ ...(x as typeof n), right: e.target.value }))} /></div>
                    <div className="flex items-end gap-1.5 pb-2.5 text-teal">
                      <button type="button" title="Move up" className="hover:text-navy" onClick={() => setSec(si, (x) => ({ ...x, nodes: move(x.nodes, ni, -1) }))}><ArrowUp size={15} /></button>
                      <button type="button" title="Move down" className="hover:text-navy" onClick={() => setSec(si, (x) => ({ ...x, nodes: move(x.nodes, ni, 1) }))}><ArrowDown size={15} /></button>
                      <button type="button" title="Remove this entry" className="hover:text-navy" onClick={() => { if (confirm(`Remove ${n.left || 'this entry'} from this resume?`)) setSec(si, (x) => ({ ...x, nodes: x.nodes.filter((_, i) => i !== ni) })); }}><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <input className="input" placeholder="Small line under it (organization, location). Optional" value={n.sub} onChange={(e) => setNode(si, ni, (x) => ({ ...(x as typeof n), sub: e.target.value }))} />
                  <BulletList items={n.bullets} onChange={(bullets) => setNode(si, ni, (x) => ({ ...(x as typeof n), bullets }))} />
                </>
              )}
            </div>
          ))}
          <button type="button" className="btn-ghost text-xs" onClick={() => setSec(si, (x) => ({ ...x, nodes: [...x.nodes, newEntry()] }))}><Plus size={13} /> Add an entry to this section</button>
        </div>
      ))}
    </div>
  );
}

function BulletList({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((b, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="pt-2 text-teal">•</span>
          <Grow value={b} placeholder="What you did and the result" onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
          <button type="button" title="Remove bullet" className="text-teal hover:text-navy pt-2" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <button type="button" className="text-xs text-teal underline" onClick={() => onChange([...items, ''])}>+ Add a bullet</button>
    </div>
  );
}
