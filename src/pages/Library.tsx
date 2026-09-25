import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { LibItem } from '../types';

const KINDS: { key: LibItem['kind']; label: string; hint: string }[] = [
  { key: 'bullet', label: 'Bullet bank', hint: 'One accomplishment per entry. Tag by skill or theme.' },
  { key: 'resume', label: 'Resume versions', hint: 'Full resume framings, e.g. Event Coordination or Strategy & Ops.' },
  { key: 'bio', label: 'Bios', hint: 'Short and long variants.' },
  { key: 'snippet', label: 'Outreach snippets', hint: 'Reusable openers, asks, and follow-ups.' },
];
// these tabs used to live here; old links and bookmarks still land in the right place
const MOVED: Record<string, string> = { docs: '/vault', wins: '/rise', roles: '/rise?tab=roles' };

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
  const asked = sp.get('tab') ?? '';
  const [kind, setKind] = useState<LibItem['kind']>(KINDS.some((k) => k.key === asked) ? (asked as LibItem['kind']) : 'bullet');
  const [items, setItems] = useState<LibItem[]>([]);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [gone, setGone] = useState<LibItem[]>([]);
  const [showGone, setShowGone] = useState(false);

  const load = () => {
    api.get<LibItem[]>(`library?kind=${kind}`).then(setItems);
    api.get<LibItem[]>(`library?kind=${kind}&deleted=1`).then(setGone).catch(() => {});
  };
  useEffect(() => { if (!MOVED[asked]) load(); }, [kind]);

  if (MOVED[asked]) return <Navigate to={MOVED[asked]} replace />;

  const cur = KINDS.find((k) => k.key === kind)!;
  const shown = items.filter((i) => (showArchived || !i.tags.includes('archived')) && (!filter || (i.title + i.body + i.tags.join(' ')).toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold mb-4 text-center">Library</h1>
      <div className="flex justify-center gap-1 border-b border-sky mb-4 overflow-x-auto overflow-y-hidden">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => setKind(k.key)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${kind === k.key ? 'border-navy font-semibold' : 'border-transparent text-teal hover:text-navy'}`}>{k.label}</button>
        ))}
      </div>
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
      {gone.length > 0 && (
        <div className="text-center mt-8">
          <button className="text-sm text-teal underline" onClick={() => setShowGone((v) => !v)}>{showGone ? 'Hide' : 'Show'} recently deleted ({gone.length})</button>
          {showGone && (
            <div className="card divide-y divide-sky/60 mt-2 text-left">
              {gone.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="truncate">{g.title || g.body.slice(0, 90)}</span>
                  <button className="btn-ghost ml-auto shrink-0" onClick={async () => { await api.post(`library/${g.id}/restore`); load(); }}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
