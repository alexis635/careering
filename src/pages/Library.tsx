import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { LibItem } from '../types';

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
  const [kind, setKind] = useState<LibItem['kind']>('bullet');
  const [items, setItems] = useState<LibItem[]>([]);
  const [filter, setFilter] = useState('');

  const load = () => api.get<LibItem[]>(`library?kind=${kind}`).then(setItems);
  useEffect(() => { load(); }, [kind]);

  const cur = KINDS.find((k) => k.key === kind)!;
  const shown = items.filter((i) => !filter || (i.title + i.body + i.tags.join(' ')).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">Content Library</h1>
      <div className="flex gap-1 border-b border-sky mb-4 overflow-x-auto">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => setKind(k.key)} className={`px-3.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${kind === k.key ? 'border-navy font-semibold' : 'border-transparent text-teal hover:text-navy'}`}>{k.label}</button>
        ))}
      </div>
      <p className="text-sm text-teal mb-3">{cur.hint}</p>
      <div className="flex gap-2 mb-4">
        <input className="input" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
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
    </div>
  );
}
