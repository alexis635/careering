import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Send, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { AdvisorMsg, AdvisorSuggestion, Job, JobContact, JobDoc } from '../types';

const TONES = ['Warm and conversational', 'Direct and confident', 'Polished and formal', 'Short and to the point', 'Enthusiastic'];
const KIND_NAME: Record<AdvisorSuggestion['kind'], string> = { resume: 'Tailored resume', cover_letter: 'Cover letter', outreach: 'Outreach email', follow_up: 'Follow up email', thank_you: 'Thank you email', prep: 'Interview prep' };

interface Made { key: string; label: string; doc: JobDoc; kind: AdvisorSuggestion['kind']; contact?: JobContact }

/**
 * The role's career advisor. It already knows the posting, her record, her angle, the people, and every draft,
 * so she can talk the role through once and then generate the resume, letter, and emails from the same conversation.
 */
export default function AdvisorTab({ job, setJob, save, contacts, generate, openMade }: {
  job: Job;
  setJob: (j: Job) => void;
  save: (p: Partial<Job>) => Promise<void> | void;
  contacts: JobContact[];
  generate: (s: AdvisorSuggestion) => Promise<JobDoc>;
  openMade: (m: Made) => void;
}) {
  const chat: AdvisorMsg[] = job.advisor_chat ?? [];
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [made, setMade] = useState<Made[]>([]);
  const [notes, setNotes] = useState(job.advisor_notes ?? '');
  const [tone, setTone] = useState(job.advisor_tone ?? '');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setNotes(job.advisor_notes ?? ''), [job.advisor_notes]);
  useEffect(() => setTone(job.advisor_tone ?? ''), [job.advisor_tone]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat.length, busy]);

  async function send(text = msg) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr('');
    try { setJob(await api.post<Job>('ai/advisor-chat', { job_id: job.id, message: t })); setMsg(''); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function pickTone(t: string) {
    setTone(t);
    try { setJob(await api.post<Job>('ai/advisor-chat', { job_id: job.id, tone: t })); } catch (e: any) { setErr(e.message); }
  }
  async function run(s: AdvisorSuggestion, key: string) {
    setGen(key); setErr('');
    try {
      const doc = await generate(s);
      const contact = contacts.find((c) => c.id === s.contact_id);
      setMade((m) => [{ key, label: `${KIND_NAME[s.kind]}${contact ? ` for ${contact.name}` : ''}`, doc, kind: s.kind, contact }, ...m]);
    } catch (e: any) { setErr(e.message); } finally { setGen(null); }
  }

  const hasPosting = !!job.posting_text?.trim();
  const lastIdx = chat.length - 1;

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-navy">Your career advisor for this role</h3>
          <p className="text-xs text-teal mt-0.5">
            Talk through why you fit and what you have done. It already has the posting, your record, your angle, the people on this role, and every draft, and everything you settle here carries into the resume, letter, emails, and prep.
            {!hasPosting && ' Add the job posting on Overview so it can work from the real requirements.'}
          </p>
        </div>

        <div className="space-y-3 max-h-[28rem] overflow-y-auto rounded-xl bg-beige p-3">
          {chat.length === 0 && (
            <div className="text-sm text-teal space-y-2 p-1">
              <p>Start anywhere. For example:</p>
              <div className="flex flex-wrap gap-2">
                {['Here is why I think I am a good fit for this role.', 'What should I lead with for this job?', ...contacts.slice(0, 2).map((c) => `Who is ${c.name} and how should I approach them?`)].map((x) => (
                  <button key={x} className="btn-ghost text-xs text-left" disabled={busy} onClick={() => send(x)}>{x}</button>
                ))}
              </div>
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-navy text-white' : 'bg-white border border-sky/60'}`}>
                {m.text}
                {m.role === 'assistant' && m.angle && (
                  <div className="mt-2 rounded-lg bg-sky/50 p-2.5 text-[13px]">
                    <div className="label">A first draft of your angle</div>
                    {m.angle}
                    {job.angle?.trim() === m.angle.trim()
                      ? <div className="text-xs text-teal mt-1.5">Saved as your angle.</div>
                      : <button className="btn-ghost text-xs mt-2" onClick={() => save({ angle: m.angle })}>Use as my angle</button>}
                  </div>
                )}
                {m.role === 'assistant' && !!m.suggestions?.length && i === lastIdx && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {m.suggestions.map((s, k) => {
                      const key = `${i}-${k}`;
                      return (
                        <button key={key} className="btn text-xs" disabled={!!gen} onClick={() => run(s, key)}>
                          <Sparkles size={12} /> {gen === key ? 'Writing, about a minute…' : s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-sm text-teal px-1">Thinking…</div>}
          <div ref={end} />
        </div>

        {made.length > 0 && (
          <div className="space-y-1.5">
            {made.map((m) => (
              <div key={m.key} className="flex items-center gap-3 rounded-lg bg-sky/50 px-3 py-2 text-sm">
                <span>Saved: {m.label}</span>
                <button className="btn-ghost text-xs ml-auto" onClick={() => openMade(m)}>Open <ArrowRight size={12} /></button>
              </div>
            ))}
          </div>
        )}

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea className="input leading-relaxed" rows={2} value={msg} placeholder="Tell your advisor about your fit, your experience, or who you are writing to. Ask it to draft anything." onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn self-end" disabled={busy || !msg.trim()}><Send size={14} /> Send</button>
        </form>
        {err && <p className="text-sm text-red-700 whitespace-pre-wrap break-words">{err}</p>}

        {contacts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-teal">Ask about someone:</span>
            {contacts.map((c) => <button key={c.id} className="btn-ghost text-xs" disabled={busy} onClick={() => send(`Tell me about ${c.name}${c.title ? `, ${c.title}` : ''}: what they likely care about and how I should approach them.`)}>{c.name}</button>)}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-navy">What your advisor knows</h3>
          <p className="text-xs text-teal mt-0.5">Edit anything here. Drafts follow it.</p>
        </div>
        <div>
          <label className="label">Tone for this role</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {TONES.map((t) => <button key={t} type="button" className={`text-xs rounded-full px-3 py-1 border ${tone === t ? 'bg-navy text-white border-navy' : 'bg-white border-sky/70 text-navy hover:bg-sky/40'}`} onClick={() => pickTone(t)}>{t}</button>)}
          </div>
          <input className="input" value={tone} placeholder="Or describe it, such as warm but not gushy" onChange={(e) => setTone(e.target.value)} onBlur={() => tone !== (job.advisor_tone ?? '') && pickTone(tone)} />
        </div>
        <div>
          <label className="label">What you have told it about this role</label>
          <textarea className="input leading-relaxed" rows={5} value={notes} placeholder="As you talk, the key points you settle on are kept here." onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (job.advisor_notes ?? '') && save({ advisor_notes: notes })} />
        </div>
        <div className="text-xs text-teal space-y-1">
          <div>Your angle: {job.angle?.trim() ? <span className="text-navy">{job.angle.trim().slice(0, 220)}{job.angle.trim().length > 220 ? '…' : ''}</span> : 'not set yet'}</div>
          <div>People on this role: {contacts.length ? contacts.map((c) => `${c.name}${c.title ? ` (${c.title})` : ''}`).join(', ') : 'none yet. Add them under People so the advisor can write to them.'}</div>
        </div>
      </div>
    </div>
  );
}
