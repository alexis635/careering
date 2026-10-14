import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Check, Loader2, Mail, Paperclip, RotateCcw, Send, Sparkles, Undo2 } from 'lucide-react';
import { api } from '../api';
import type { OutreachDraft, OutreachRun } from '../types';

const SEAT: Record<OutreachDraft['recipient'], string> = { hiring_manager: 'Hiring manager', hr: 'HR / recruiting', other: 'Contact' };
const STATUS: Record<OutreachDraft['status'], { label: string; cls: string }> = {
  drafted: { label: 'Needs your review', cls: 'bg-beige text-navy border border-sky' },
  approved: { label: 'Approved, waiting for Noelle', cls: 'bg-sky text-navy' },
  sending: { label: 'Sending…', cls: 'bg-sky text-navy' },
  sent: { label: 'Sent', cls: 'bg-navy text-white' },
  failed: { label: 'Send failed', cls: 'bg-red-100 text-red-800' },
  skipped: { label: 'Skipped', cls: 'bg-white text-teal border border-sky' },
};
const who = (by: string | null) => (by === 'noelle' ? 'Noelle' : by?.startsWith('alexis (') ? 'you, outside Careering' : 'you');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One staged email. Nothing here sends without an approval first, and any edit after approval sends it back to review. */
export function DraftCard({ draft, onChange }: { draft: OutreachDraft; onChange: (d: OutreachDraft) => void }) {
  const [f, setF] = useState({ to_email: draft.to_email, subject: draft.subject, body: draft.body });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [direction, setDirection] = useState('');
  const [showRewrite, setShowRewrite] = useState(false);
  const [open, setOpen] = useState(draft.status !== 'sent' && draft.status !== 'skipped');
  useEffect(() => setF({ to_email: draft.to_email, subject: draft.subject, body: draft.body }), [draft.id, draft.updated_at]);
  const dirty = f.to_email !== draft.to_email || f.subject !== draft.subject || f.body !== draft.body;
  const editable = ['drafted', 'approved', 'failed'].includes(draft.status);

  async function act(name: string, fn: () => Promise<OutreachDraft>) {
    setBusy(name); setErr('');
    try { onChange(await fn()); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  }
  const save = () => api.patch<OutreachDraft>(`outreach/${draft.id}`, f);
  const approve = () => act('approve', async () => { if (dirty) await save(); return api.post<OutreachDraft>(`outreach/${draft.id}/approve`); });
  const sendNow = () => {
    if (!confirm(`Send this email to ${draft.to_name || draft.to_email} <${draft.to_email}> now?`)) return;
    act('send', () => api.post<OutreachDraft>(`outreach/${draft.id}/send`));
  };
  const st = STATUS[draft.status];

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs rounded-full bg-sky/50 px-2 py-0.5 text-navy font-medium">{SEAT[draft.recipient]}</span>
        <span className="font-medium">{draft.to_name || 'Unknown name'}</span>
        {draft.to_title && <span className="text-sm text-teal truncate max-w-xs">{draft.to_title}</span>}
        <span className={`ml-auto text-xs rounded-full px-2.5 py-0.5 font-semibold ${st.cls}`}>{st.label}</span>
        {(draft.status === 'sent' || draft.status === 'skipped') && (
          <button className="text-xs text-teal underline" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
        )}
      </div>

      {draft.status === 'sent' && (
        <p className="text-sm text-teal">
          Sent {draft.sent_at ? format(new Date(draft.sent_at), 'MMM d, h:mm a') : ''} by {who(draft.sent_by)} to {draft.to_email}.
          {draft.replied && <span className="ml-2 rounded-full bg-navy text-white px-2 py-0.5 text-xs">Replied</span>}
        </p>
      )}
      {draft.status === 'approved' && !draft.approval_valid && <p className="text-sm text-red-700">Changed after approval. Approve it again.</p>}
      {draft.status === 'failed' && draft.error && <p className="text-sm text-red-700">{draft.error}{/gmail|google|token|connected|grant/i.test(draft.error) && <> <button className="underline font-medium" onClick={async () => { const r = await api.get<{ url: string }>('gmail/connect'); window.location.href = r.url; }}>Reconnect Gmail</button>, then try again.</>}</p>}

      {open && (
        <>
          {draft.tailored && <p className="text-xs text-teal"><span className="font-semibold">Tailored:</span> {draft.tailored}</p>}
          <div className="grid gap-2">
            <input className="input" type="email" placeholder="Their email (needed before you approve)" value={f.to_email} disabled={!editable}
              onChange={(e) => setF({ ...f, to_email: e.target.value })} />
            {!EMAIL_RE.test(f.to_email) && editable && <p className="text-xs text-red-700 -mt-1">No email yet. Find it under People (Find email uses Hunter) or paste it here.</p>}
            <input className="input" placeholder="Subject" value={f.subject} disabled={!editable} onChange={(e) => setF({ ...f, subject: e.target.value })} />
            <textarea className="input leading-relaxed" rows={Math.min(16, Math.max(8, f.body.split('\n').length + 2))} value={f.body} disabled={!editable}
              onChange={(e) => setF({ ...f, body: e.target.value })} />
          </div>
          {!!draft.attachment_names?.length && <div className="flex flex-wrap gap-1.5">{draft.attachment_names.map((n) => <span key={n} className="inline-flex items-center gap-1 rounded bg-beige px-2 py-0.5 text-xs text-teal"><Paperclip size={11} /> {n}</span>)}</div>}
          {dirty && draft.status === 'approved' && <p className="text-xs text-teal">Saving an edit takes this back to review, so you approve exactly what goes out.</p>}

          {showRewrite && editable && (
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1 min-w-48 text-sm" placeholder="Optional direction: warmer, shorter, mention the events work…" value={direction} onChange={(e) => setDirection(e.target.value)} />
              <button className="btn" disabled={!!busy} onClick={() => act('redraft', () => api.post<OutreachDraft>(`outreach/${draft.id}/redraft`, { instructions: direction })).then(() => { setShowRewrite(false); setDirection(''); })}>
                <Sparkles size={14} /> {busy === 'redraft' ? 'Rewriting…' : 'Rewrite'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {draft.status === 'drafted' && (
              <button className="btn" disabled={!!busy || !EMAIL_RE.test(f.to_email)} onClick={approve} title="Noelle sends approved emails on her next check">
                <Check size={14} /> {busy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
            )}
            {(draft.status === 'approved' || draft.status === 'failed') && !dirty && draft.approval_valid && (
              <button className="btn" disabled={!!busy} onClick={sendNow}><Send size={14} /> {busy === 'send' ? 'Sending…' : draft.status === 'failed' ? 'Try sending again' : 'Send now'}</button>
            )}
            {editable && dirty && (
              <button className="btn-ghost" disabled={!!busy} onClick={() => act('save', save)}>{busy === 'save' ? 'Saving…' : 'Save edits'}</button>
            )}
            {editable && dirty && <button className="btn-ghost" onClick={() => setF({ to_email: draft.to_email, subject: draft.subject, body: draft.body })}>Discard edits</button>}
            {editable && !showRewrite && <button className="btn-ghost" disabled={!!busy} onClick={() => setShowRewrite(true)}><Sparkles size={14} /> Rewrite</button>}
            {(draft.status === 'approved' || draft.status === 'failed') && (
              <button className="btn-ghost" disabled={!!busy} onClick={() => act('unapprove', () => api.post<OutreachDraft>(`outreach/${draft.id}/unapprove`))}><Undo2 size={14} /> Take back</button>
            )}
            <span className="flex-1" />
            {editable && (
              <>
                <button className="text-xs text-teal underline" disabled={!!busy} onClick={() => { if (confirm('Mark this as sent? Use this if you sent it yourself, outside Careering.')) act('mark', () => api.post<OutreachDraft>(`outreach/${draft.id}/mark-sent`)); }}>I sent it myself</button>
                <button className="text-xs text-teal underline" disabled={!!busy} onClick={() => act('skip', () => api.post<OutreachDraft>(`outreach/${draft.id}/skip`))}>Skip</button>
              </>
            )}
            {draft.status === 'skipped' && <button className="btn-ghost" onClick={() => act('restore', () => api.post<OutreachDraft>(`outreach/${draft.id}/restore`))}><RotateCcw size={14} /> Bring back</button>}
          </div>
        </>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}

/** Banner for a job's drafting run: working, needs hand research, or stopped. */
export function RunNote({ run, onPeople }: { run: OutreachRun | null; onPeople?: () => void }) {
  if (!run) return null;
  if (run.status === 'running') return (
    <div className="rounded-lg bg-sky/40 p-3 text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Finding the hiring manager and HR contact and writing both emails. This takes a minute or two.</div>
  );
  if (!run.note) return null;
  const tone = run.status === 'ready' ? 'bg-beige text-navy' : 'bg-red-50 text-red-800 border border-red-200';
  return (
    <div className={`rounded-lg p-3 text-sm ${tone}`}>
      {run.status === 'needs_research' && <div className="font-semibold mb-0.5">Needs research</div>}
      {run.note}
      {run.status === 'needs_research' && onPeople && <button className="ml-2 underline" onClick={onPeople}>Go to People</button>}
    </div>
  );
}

/** The Outreach tab on a job. */
export function JobOutreach({ jobId, stage, onPeople }: { jobId: number; stage: string; onPeople: () => void }) {
  const [data, setData] = useState<{ run: OutreachRun | null; drafts: OutreachDraft[] } | null>(null);
  const [err, setErr] = useState('');
  const timer = useRef<number | null>(null);
  const load = () => api.get<{ run: OutreachRun | null; drafts: OutreachDraft[] }>(`jobs/${jobId}/outreach`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [jobId]);
  useEffect(() => {   // keep checking while the drafts are being written
    if (data?.run?.status === 'running') timer.current = window.setTimeout(load, 5000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [data]);
  async function start() {
    setErr('');
    try { setData(await api.post(`jobs/${jobId}/outreach/start`)); } catch (e: any) { setErr(e.message); }
  }
  if (!data) return null;
  const { run, drafts } = data;
  const seats = new Set(drafts.filter((d) => d.status !== 'skipped' && d.recipient !== 'other').map((d) => d.recipient));
  const missing = seats.size < 2 && run?.status !== 'running';
  const applied = stage !== 'Saved';

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-56">
          <div className="font-medium flex items-center gap-2"><Mail size={16} /> After you apply</div>
          <div className="text-xs text-teal">Two personal emails per job: one to the hiring manager, one to HR. You review and approve each one; Noelle sends only what you approved, and every send is tracked here.</div>
        </div>
        {!run && <button className="btn" disabled={!applied} title={applied ? '' : 'Starts automatically when you move this job to Applied'} onClick={start}><Sparkles size={14} /> Start outreach</button>}
        {run && missing && <button className="btn-ghost" onClick={start}><Sparkles size={14} /> Draft missing</button>}
      </div>
      {!run && !applied && <p className="text-sm text-teal text-center">This starts on its own when you move the job to Applied.</p>}
      <RunNote run={run} onPeople={onPeople} />
      {err && <p className="text-sm text-red-700">{err}</p>}
      {drafts.map((d) => <DraftCard key={d.id} draft={d} onChange={(nd) => setData((x) => x && { ...x, drafts: x.drafts.map((y) => (y.id === nd.id ? nd : y)) })} />)}
    </div>
  );
}
