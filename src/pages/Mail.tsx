import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Paperclip, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { MailItem } from '../types';

const BOXES = [
  { key: 'all', label: 'All mail' },
  { key: 'sent', label: 'Sent' },
  { key: 'received', label: 'Replies' },
  { key: 'drafts', label: 'Drafts' },
] as const;

const BADGE: Record<string, string> = {
  sent: 'bg-sky text-navy',
  received: 'bg-navy text-white',
  draft: 'bg-beige text-teal border border-sky',
};
const NAME: Record<string, string> = { sent: 'Sent', received: 'Reply', draft: 'Draft' };

export default function Mail() {
  const [box, setBox] = useState<(typeof BOXES)[number]['key']>('all');
  const [items, setItems] = useState<MailItem[] | null>(null);
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<MailItem[]>(`mail?box=${box}`).then(setItems).catch((e) => setMsg(e.message));
  useEffect(() => { setItems(null); load(); }, [box]);
  useEffect(() => { api.get<{ connected: boolean; email: string | null }>('gmail/status').then(setGmail).catch(() => {}); }, []);

  async function check() {
    setBusy(true); setMsg('');
    try {
      const r = await api.post<{ added: number; jobs: number }>('gmail/sync-all');
      setMsg(r.added ? `${r.added} new repl${r.added === 1 ? 'y' : 'ies'} found.` : r.jobs ? 'No new replies.' : 'Nothing sent yet, so there is nothing to check.');
      load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold text-center">Mail</h1>
      <p className="text-sm text-teal text-center mt-1 mb-5">Everything Careering has sent, plus the replies to it, across all your jobs.</p>

      <div className="flex flex-col items-center gap-3 mb-5">
        <div className="flex justify-center gap-1 border-b border-sky w-full">
          {BOXES.map((b) => (
            <button key={b.key} onClick={() => setBox(b.key)} className={`px-4 py-2 text-sm border-b-2 -mb-px ${box === b.key ? 'border-navy font-semibold' : 'border-transparent text-teal hover:text-navy'}`}>{b.label}</button>
          ))}
        </div>
        {gmail?.connected && <button className="btn-ghost" disabled={busy} onClick={check}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Checking…' : 'Check for replies'}</button>}
        {gmail && !gmail.connected && <p className="text-sm text-teal">Gmail is not connected yet. Open any job, go to its Emails tab, and click Connect Gmail.</p>}
        {msg && <p className="text-sm text-teal">{msg}</p>}
      </div>

      {items && items.length === 0 && <p className="text-center text-teal text-sm">{box === 'drafts' ? 'No outreach drafts yet.' : 'No mail yet.'}</p>}
      <div className="space-y-2">
        {items?.map((m) => (
          <Link key={`${m.direction}${m.id}`} to={`/jobs/${m.job_id}?tab=${m.direction === 'draft' ? 'Documents' : 'Emails'}`} className="card p-3.5 block hover:shadow-md transition-shadow">
            <div className="flex flex-wrap items-center gap-2 text-xs text-teal mb-0.5">
              <span className={`uppercase tracking-wide font-medium rounded px-1.5 py-0.5 ${BADGE[m.direction]}`}>{NAME[m.direction]}</span>
              <span className="font-medium text-navy">{m.label}</span>
              {m.direction !== 'draft' && <span>{m.direction === 'received' ? `from ${m.from_addr}` : `to ${m.to_addr}`}</span>}
              <span className="ml-auto">{format(new Date(m.sent_at), 'MMM d, h:mm a')}</span>
            </div>
            <div className="font-medium text-sm">{m.subject || '(no subject)'}</div>
            <div className="text-sm text-navy/70 line-clamp-2">{m.snippet}</div>
            {!!m.attachments?.length && <div className="mt-1.5 flex flex-wrap gap-1.5">{m.attachments.map((n) => <span key={n} className="inline-flex items-center gap-1 rounded bg-beige px-2 py-0.5 text-xs text-teal"><Paperclip size={11} /> {n}</span>)}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
