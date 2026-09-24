import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { LibItem } from '../types';
import VaultDocs from '../components/VaultDocs';
import Wins from '../components/Wins';
import RolesPay from '../components/RolesPay';

type Tab = LibItem['kind'] | 'docs' | 'wins' | 'roles';
const VAULT_TABS: { key: Tab; label: string }[] = [{ key: 'docs', label: 'Career documents' }, { key: 'wins', label: 'Wins' }, { key: 'roles', label: 'Roles and pay' }];
const isVault = (t: Tab) => t === 'docs' || t === 'wins' || t === 'roles';

const KINDS: { key: LibItem['kind']; label: string; hint: string }[] = [
  { key: 'bullet', label: 'Bullet bank', hint: 'One accomplishment per entry. Tag by skill or theme.' },
  { key: 'resume', label: 'Resume versions', hint: 'Full resume framings, e.g. Event Coordination or Strategy & Ops.' },
  { key: 'bio', label: 'Bios', hint: 'Short and long variants.' },
  { key: 'snippet', label: 'Outreach snippets', hint: 'Reusable openers, asks, and follow-ups.' },
];

function Item({ item, onChange, onDelete }: { item: LibItem; onChange: (p: Partial<LibItem>) => void; onDelete: () => void }) {
  const [body, setBody] = useState(item.body);
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState(item.tags.join(', '));
  return (
    <div className="card p-4 space-y-2">
      <div className="flex gap-2">
        {item.kind !== 'bullet' && (
          <input className="input font-medium" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== item.title && onChange({ title })} />
        )}
        <button className="text-teal hover:text-navy ml-auto" onClick={onDelete}><Trash2 size={15} /></button>
      </div>
      <textarea className="input" rows={item.kind === 'resume' ? 12 : 3} value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => body !== item.body && onChange({ body })} />
      <input className="input" placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)}
        onBlur={() => onChange({ tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })} />
    </div>
  );
}

export default function Library() {
  const [sp] = useSearchParams();
  const initial = sp.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && ['docs', 'wins', 'roles', 'bullet', 'resume', 'bio', 'snippet'].includes(initial) ? initial : 'bullet');
  const [exporting, setExporting] = useState('');
  const kind: LibItem['kind'] = isVault(tab) ? 'bullet' : (tab as LibItem['kind']);
  const [items, setItems] = useState<LibItem[]>([]);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = () => api.get<LibItem[]>(`library?kind=${kind}`).then(setItems);
  useEffect(() => { if (!isVault(tab)) load(); }, [tab]);

  async function exportEverything() {
    setExporting('Gathering your data…');
    try {
      const data = await api.get<{ exported_at: string; tables: Record<string, any[]>; files: { id: number; file_name: string }[] }>('export');
      const bytes: Record<number, Uint8Array> = {}, names: Record<number, string> = {};
      let n = 0;
      for (const f of data.files) {
        setExporting(`Adding your documents (${++n} of ${data.files.length})…`);
        const r = await fetch(`/api/vault/docs/${f.id}/file`, { credentials: 'same-origin' });
        if (r.ok) { bytes[f.id] = new Uint8Array(await r.arrayBuffer()); names[f.id] = f.file_name; }
      }
      setExporting('Packing the zip…');
      const { buildExportZip } = await import('../lib/exportZip');
      const zip = buildExportZip(data, bytes, names);
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a'); a.href = url; a.download = `careering-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      setExporting('');
    } catch (e: any) { setExporting(`Export failed: ${e.message}`); }
  }

  const cur = KINDS.find((k) => k.key === kind)!;
  const shown = items.filter((i) => (showArchived || !i.tags.includes('archived')) && (!filter || (i.title + i.body + i.tags.join(' ')).toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 text-center">Library</h1>
      <div className="text-center -mt-2 mb-3"><button className="text-xs text-teal underline inline-flex items-center gap-1" disabled={!!exporting && !exporting.startsWith('Export failed')} onClick={exportEverything}><Download size={12} /> {exporting || 'Export everything (a zip of all your data and files)'}</button></div>
      <div className="flex justify-center gap-1 border-b border-sky mb-4 overflow-x-auto overflow-y-hidden">
        {[...KINDS.map((k) => ({ key: k.key as Tab, label: k.label })), ...VAULT_TABS].map((k) => (
          <button key={k.key} onClick={() => setTab(k.key)} className={`px-2.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k.key ? 'border-navy font-semibold' : 'border-transparent text-teal hover:text-navy'}`}>{k.label}</button>
        ))}
      </div>
      {tab === 'docs' && <VaultDocs />}
      {tab === 'wins' && <Wins />}
      {tab === 'roles' && <RolesPay />}
      {!isVault(tab) && <>
      <p className="text-sm text-teal mb-3 text-center">{cur.hint}{kind === 'resume' && <> Need one for something specific? <Link to="/resume" className="underline">Build a custom resume</Link>.</>}</p>
      <div className="flex gap-2 mb-4">
        <input className="input" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="text-sm text-teal flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        <button className="btn whitespace-nowrap" onClick={async () => { await api.post('library', { kind, title: '', body: '' }); load(); }}><Plus size={16} /> Add</button>
      </div>
      <div className="space-y-3">
        {shown.map((i) => (
          <Item key={i.id} item={i}
            onChange={async (p) => { await api.patch(`library/${i.id}`, p); load(); }}
            onDelete={async () => { await api.del(`library/${i.id}`); load(); }} />
        ))}
        {shown.length === 0 && <p className="text-sm text-teal">Nothing here yet.</p>}
      </div>
      </>}
    </div>
  );
}
