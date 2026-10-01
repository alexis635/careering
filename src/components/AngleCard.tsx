import { useEffect, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { AngleFocus, AngleMsg, Job, Story, Win } from '../types';

interface RoleRow { id: number; employer: string; title: string; start_date: string | null; end_date: string | null }
const yr = (d: string | null) => (d ? d.slice(0, 4) : '');

/** Her own reason she fits this job, the experience to lead with, and a chat to sharpen both. Every draft for the job is built around this. */
export default function AngleCard({ job, save, setJob }: { job: Job; save: (p: Partial<Job>) => Promise<void> | void; setJob: (j: Job) => void }) {
  const [angle, setAngle] = useState(job.angle ?? '');
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [wins, setWins] = useState<Win[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const focus: AngleFocus = job.angle_focus ?? {};
  const chat: AngleMsg[] = job.angle_chat ?? [];

  useEffect(() => setAngle(job.angle ?? ''), [job.angle]);
  useEffect(() => {
    api.get<RoleRow[]>('roles').then(setRoles).catch(() => {});
    api.get<Win[]>('wins').then(setWins).catch(() => {});
    api.get<Story[]>('stories').then(setStories).catch(() => {});
  }, []);

  const pickedRole = (id: number) => focus.roles?.find((r) => r.id === id);
  function toggleRole(id: number) {
    const cur = focus.roles ?? [];
    save({ angle_focus: { ...focus, roles: pickedRole(id) ? cur.filter((r) => r.id !== id) : [...cur, { id, note: '' }] } });
  }
  function noteRole(id: number, note: string) {
    save({ angle_focus: { ...focus, roles: (focus.roles ?? []).map((r) => (r.id === id ? { ...r, note } : r)) } });
  }
  function toggleWin(id: number) {
    const cur = focus.wins ?? [];
    save({ angle_focus: { ...focus, wins: cur.includes(id) ? cur.filter((w) => w !== id) : [...cur, id] } });
  }
  async function send() {
    const text = msg.trim();
    if (!text) return;
    setBusy(true); setErr('');
    try { setJob(await api.post<Job>('ai/angle-chat', { job_id: job.id, message: text })); setMsg(''); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function keep(text: string) {
    const body = text.trim();
    if (!body) return;
    const title = prompt('Give this story a short title', body.replace(/\s+/g, ' ').slice(0, 50));
    if (title === null) return;
    try {
      const s = await api.post<Story>('stories', { title, body, job_id: job.id });
      setStories((xs) => [s, ...xs]); setSaved('Saved to your story bank.'); setTimeout(() => setSaved(''), 3000);
    } catch (e: any) { setErr(e.message); }
  }
  function useStory(id: string) {
    const s = stories.find((x) => String(x.id) === id);
    if (!s) return;
    const next = angle.trim() ? `${angle.trim()}\n\n${s.body}` : s.body;
    setAngle(next); save({ angle: next });
  }
  const lastIdea = [...chat].reverse().find((m) => m.role === 'assistant' && m.angle)?.angle;

  return (
    <div className="card p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-navy">Your angle</h3>
        <p className="text-xs text-teal mt-0.5">Why you fit this one, in your words. The resume, cover letter, emails, and interview prep are all built around it instead of the AI guessing.</p>
      </div>

      <div>
        <label className="label">Why I fit</label>
        <textarea className="input leading-relaxed" rows={4} value={angle} placeholder="For example: I ran a program like this at X, so I already know the part of the job they find hardest." onChange={(e) => setAngle(e.target.value)} onBlur={() => angle !== (job.angle ?? '') && save({ angle })} />
        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          {stories.length > 0 && (
            <select className="input w-auto text-sm" value="" onChange={(e) => useStory(e.target.value)}>
              <option value="">Add from my story bank…</option>
              {stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          {angle.trim() && <button className="text-xs text-teal underline" onClick={() => keep(angle)}>Save this to my story bank</button>}
          {saved && <span className="text-xs text-teal">{saved}</span>}
        </div>
      </div>

      <div>
        <label className="label">Experience to lead with</label>
        {roles.length === 0 && <p className="text-xs text-teal">Add your roles under Library, Roles and pay, and they will show up here.</p>}
        <div className="space-y-1.5">
          {roles.map((r) => {
            const on = pickedRole(r.id);
            return (
              <div key={r.id} className={`rounded-xl border px-3 py-2 ${on ? 'border-teal bg-beige' : 'border-sky/60 bg-white'}`}>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!on} onChange={() => toggleRole(r.id)} />
                  <span className="font-medium">{r.title || 'Role'}</span>
                  <span className="text-teal">{r.employer}{r.start_date ? `, ${yr(r.start_date)} to ${r.end_date ? yr(r.end_date) : 'now'}` : ''}</span>
                </label>
                {on && <NoteInput value={on.note} onSave={(v) => noteRole(r.id, v)} />}
              </div>
            );
          })}
        </div>
      </div>

      {wins.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none label mb-0 flex items-center justify-between">
            <span>Specific wins to include{focus.wins?.length ? ` (${focus.wins.length})` : ''}</span>
            <span className="text-xs text-teal font-normal group-open:hidden">Show</span><span className="text-xs text-teal font-normal hidden group-open:inline">Hide</span>
          </summary>
          <div className="mt-2 space-y-1 max-h-64 overflow-auto">
            {wins.map((w) => (
              <label key={w.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input className="mt-1" type="checkbox" checked={!!focus.wins?.includes(w.id)} onChange={() => toggleWin(w.id)} />
                <span>{w.title} <span className="text-teal">{[w.employer, w.role].filter(Boolean).join(', ')}</span></span>
              </label>
            ))}
          </div>
        </details>
      )}

      <div className="space-y-3">
        <label className="label">Talk it through</label>
        {chat.length > 0 && (
          <div className="space-y-2">
            {chat.map((m, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'bg-sky/50 ml-8' : 'bg-beige mr-8'}`}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.role === 'user' && m.text.length > 60 && <button className="text-xs text-teal underline mt-1" onClick={() => keep(m.text)}>Save to my story bank</button>}
                {m.role === 'assistant' && !!m.unsupported?.length && (
                  <ul className="list-disc pl-5 mt-2 text-teal">{m.unsupported.map((u, j) => <li key={j}>{u}</li>)}</ul>
                )}
              </div>
            ))}
          </div>
        )}
        {lastIdea && lastIdea.trim() !== angle.trim() && (
          <div className="rounded-xl border border-teal p-3 text-sm space-y-2">
            <p className="label mb-0">Suggested wording of your angle</p>
            <p className="whitespace-pre-wrap">{lastIdea}</p>
            <button className="btn" onClick={() => { setAngle(lastIdea); save({ angle: lastIdea }); }}>Use this as my angle</button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea className="input flex-1" rows={2} value={msg} placeholder="Tell it why this fits, or what you want pulled from your experience." onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
          <button className="btn self-end" disabled={busy || !msg.trim()} onClick={send}><Send size={14} /> {busy ? 'Thinking…' : 'Send'}</button>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        {chat.length > 0 && <button className="text-xs text-teal underline" onClick={() => confirm('Clear this conversation? Your angle above stays.') && save({ angle_chat: [] })}>Clear conversation</button>}
      </div>

      {job.angle_check?.trim() && (
        <div className="rounded-xl bg-beige p-4 text-sm space-y-1">
          <p className="label mb-0 flex items-center gap-1.5"><Sparkles size={13} /> How your angle holds up</p>
          <p className="leading-relaxed whitespace-pre-wrap">{job.angle_check}</p>
          <p className="text-xs text-teal">Shown next to the honest fit rating, it never changes it.</p>
        </div>
      )}
    </div>
  );
}

function NoteInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return <input className="input mt-2" value={v} placeholder="What to pull from this role, and what to leave out" onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />;
}
