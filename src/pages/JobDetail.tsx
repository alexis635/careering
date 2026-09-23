import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, ExternalLink, Mail, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Job, JobAction, JobContact, JobDoc, JobEmail, JobNote } from '../types';

const TABS = ['Overview', 'Contacts', 'Emails', 'Documents', 'Interview Prep', 'Notes Log', 'Next Actions'] as const;
type Tab = (typeof TABS)[number];

function Field({ label, value, onSave, type = 'text', wide = false }: { label: string; value: string | null; onSave: (v: string) => void; type?: string; wide?: boolean }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      <input className="input" type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onSave(v)} />
    </div>
  );
}

function TextBlock({ label, value, onSave, rows = 8, placeholder }: { label: string; value: string; onSave: (v: string) => void; rows?: number; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div>
      <label className="label">{label}</label>
      <textarea className="input font-mono text-[13px] leading-relaxed" rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [docs, setDocs] = useState<JobDoc[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [actions, setActions] = useState<JobAction[]>([]);
  const [newNote, setNewNote] = useState('');
  const [newAction, setNewAction] = useState('');
  const [newDoc, setNewDoc] = useState({ kind: 'resume', title: '', body: '' });
  const [openDoc, setOpenDoc] = useState<number | null>(null);
  const [contacts, setContacts] = useState<JobContact[]>([]);
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', notes: '' });
  const [emails, setEmails] = useState<JobEmail[]>([]);
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [mailMsg, setMailMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState('');
  const [instructions, setInstructions] = useState('');

  const loadKids = () => {
    api.get<JobDoc[]>(`jobs/${id}/documents`).then(setDocs);
    api.get<JobNote[]>(`jobs/${id}/notes`).then(setNotes);
    api.get<JobContact[]>(`jobs/${id}/contacts`).then(setContacts);
    api.get<JobEmail[]>(`jobs/${id}/emails`).then(setEmails);
    api.get<JobAction[]>(`jobs/${id}/actions`).then(setActions);
  };
  useEffect(() => { api.get<{ connected: boolean; email: string | null }>('gmail/status').then(setGmail).catch(() => setGmail({ connected: false, email: null })); }, []);
  useEffect(() => { api.get<Job>(`jobs/${id}`).then(setJob); loadKids(); }, [id]);

  if (!job) return null;
  function useInEmail(d: JobDoc) {
    const m = d.body.match(/^Subject:\s*(.+)\n+/i);
    setCompose({ to: contacts.find((c) => c.email)?.email ?? '', subject: m ? m[1].trim() : '', body: (m ? d.body.slice(m[0].length) : d.body).trim() });
    setMailMsg(''); setTab('Emails');
  }
  async function sendMail() {
    if (!confirm(`Send this email to ${compose.to} from ${gmail?.email}?`)) return;
    setBusy('send'); setMailMsg('');
    try {
      await api.post('gmail/send', { job_id: Number(id), ...compose });
      setCompose({ to: '', subject: '', body: '' }); setMailMsg('Sent.'); loadKids();
    } catch (e: any) { setMailMsg(e.message); } finally { setBusy(null); }
  }
  async function syncMail() {
    setBusy('sync'); setMailMsg('');
    try { const r = await api.post<{ added: number }>('gmail/sync', { job_id: Number(id) }); setMailMsg(r.added ? `${r.added} new repl${r.added === 1 ? 'y' : 'ies'}.` : 'No new replies.'); loadKids(); }
    catch (e: any) { setMailMsg(e.message); } finally { setBusy(null); }
  }
  async function ai(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setAiErr('');
    try {
      const out = await api.post<any>(`ai/${action}`, { job_id: Number(id), ...extra });
      if (['parse', 'match'].includes(action)) setJob(out); else { loadKids(); setTab('Documents'); setOpenDoc(out.id); }
    } catch (e: any) { setAiErr(e.message); } finally { setBusy(null); }
  }
  const save = async (patch: Partial<Job>) => setJob(await api.patch<Job>(`jobs/${id}`, patch));
  const logistics = job.type === 'logistics';

  return (
    <div className="max-w-4xl">
      <Link to={`/lanes/${job.lane_id}`} className="text-sm text-teal inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Back to lane</Link>
      <div className="flex items-start gap-3 mb-1">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{job.company || 'Untitled'}</h1>
          <p className="text-teal">{job.role_title}</p>
        </div>
        {job.source_link && <a className="btn-ghost" href={job.source_link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Posting</a>}
        <button className="btn-ghost" onClick={async () => { if (confirm('Delete this entry and everything in it?')) { await api.del(`jobs/${id}`); nav(`/lanes/${job.lane_id}`); } }}><Trash2 size={14} /></button>
      </div>

      <div className="flex gap-1 border-b border-sky my-5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-navy font-semibold' : 'border-transparent text-teal hover:text-navy'}`}>
            {t}
            {t === 'Contacts' && contacts.length > 0 && <span className="ml-1.5 text-xs text-teal">{contacts.length}</span>}
            {t === 'Documents' && docs.length > 0 && <span className="ml-1.5 text-xs text-teal">{docs.length}</span>}
            {t === 'Next Actions' && actions.some((a) => !a.done) && <span className="ml-1.5 text-xs text-teal">{actions.filter((a) => !a.done).length}</span>}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-5">
          <div className="card p-5 grid gap-4 sm:grid-cols-2">
            <Field label={logistics ? 'Topic' : 'Company'} value={job.company} onSave={(v) => save({ company: v })} />
            <Field label={logistics ? 'Detail' : 'Role title'} value={job.role_title} onSave={(v) => save({ role_title: v })} />
            <Field label="Source link" value={job.source_link} onSave={(v) => save({ source_link: v })} wide />
            {!logistics && <>
              <Field label="Salary range" value={job.salary_range} onSave={(v) => save({ salary_range: v })} />
              <Field label="Location" value={job.location} onSave={(v) => save({ location: v })} />
              <Field label="Remote type" value={job.remote_type} onSave={(v) => save({ remote_type: v })} />
              <Field label="Applied" type="date" value={job.applied_date?.slice(0, 10) ?? ''} onSave={(v) => save({ applied_date: v || null })} />
            </>}
            <Field label="Deadline" type="date" value={job.deadline?.slice(0, 10) ?? ''} onSave={(v) => save({ deadline: v || null })} />
            <Field label="Contact person" value={job.contact_person} onSave={(v) => save({ contact_person: v })} />
            <Field label="Contact notes" value={job.contact_notes} onSave={(v) => save({ contact_notes: v })} wide />
          </div>
          {!logistics && (
            <div className="card p-5 space-y-4">
              <TextBlock label="Job posting" value={job.posting_text} onSave={(v) => save({ posting_text: v })} rows={10} placeholder="Paste the full posting here. It powers matching and drafting." />
              <div className="flex flex-wrap gap-2 items-center">
                <button className="btn" disabled={!!busy} onClick={() => ai('parse')}><Sparkles size={14} /> {busy === 'parse' ? 'Reading…' : 'Parse posting'}</button>
                <button className="btn" disabled={!!busy} onClick={() => ai('match')}><Sparkles size={14} /> {busy === 'match' ? 'Comparing…' : 'Match check'}</button>
                {aiErr && <span className="text-sm text-red-700">{aiErr}</span>}
              </div>
              {job.posting_parsed && (
                <div className="rounded-lg bg-beige p-4 text-sm space-y-2">
                  {job.posting_parsed.summary && <p>{job.posting_parsed.summary}</p>}
                  {!!job.posting_parsed.requirements?.length && <div><span className="label">Requirements</span><ul className="list-disc pl-5">{job.posting_parsed.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
                  {!!job.posting_parsed.keywords?.length && <div className="flex flex-wrap gap-1.5">{job.posting_parsed.keywords.map((k) => <span key={k} className="bg-sky/70 rounded px-2 py-0.5 text-xs">{k}</span>)}</div>}
                </div>
              )}
              <TextBlock label="Match notes" value={job.match_notes} onSave={(v) => save({ match_notes: v })} rows={8} />
            </div>
          )}
        </div>
      )}

      {tab === 'Contacts' && (
        <div className="space-y-4">
          <form className="card p-4 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!newContact.name.trim() && !newContact.email.trim()) return;
            await api.post(`jobs/${id}/contacts`, newContact);
            setNewContact({ name: '', title: '', email: '', notes: '' }); loadKids();
          }}>
            <div><label className="label">Name</label><input className="input" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} /></div>
            <div><label className="label">Title</label><input className="input" value={newContact.title} onChange={(e) => setNewContact({ ...newContact, title: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} /></div>
            <div><label className="label">Where you found them</label><input className="input" placeholder="Apollo, LinkedIn, referral…" value={newContact.notes} onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })} /></div>
            <div className="sm:col-span-2"><button className="btn"><Plus size={14} /> Add contact</button></div>
          </form>
          {aiErr && <p className="text-sm text-red-700">{aiErr}</p>}
          {contacts.length === 0 && <p className="text-teal text-sm">No contacts yet. Add hiring managers or recruiters you find, then draft outreach to each.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="card p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-48">
                <div className="font-medium">{c.name || c.email}</div>
                <div className="text-sm text-teal">{c.title}{c.title && c.email ? ' · ' : ''}{c.email}</div>
                {c.notes && <div className="text-xs text-teal mt-0.5">{c.notes}</div>}
              </div>
              {!logistics && (
                <button className="btn" disabled={!!busy} onClick={() => ai('outreach', { instructions, contact_name: c.name, contact_title: c.title })}>
                  <Mail size={14} /> {busy === 'outreach' ? 'Writing…' : 'Draft outreach'}
                </button>
              )}
              <button className="text-teal hover:text-navy" onClick={async () => { await api.del(`jobs/${id}/contacts/${c.id}`); loadKids(); }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {tab === 'Emails' && (
        <div className="space-y-4">
          {gmail && !gmail.connected && (
            <div className="card p-5 flex items-center gap-4">
              <p className="text-sm flex-1">Connect alexisdgranville@gmail.com to send outreach from Careering. Only replies to emails sent from this app are ever read.</p>
              <button className="btn" onClick={async () => { const r = await api.get<{ url: string }>('gmail/connect'); window.location.href = r.url; }}>Connect Gmail</button>
            </div>
          )}
          {gmail?.connected && (
            <form className="card p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); sendMail(); }}>
              <div className="text-xs text-teal">Sending from {gmail.email}</div>
              <input className="input" type="email" required placeholder="To" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
              <input className="input" required placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
              <textarea className="input" rows={9} required placeholder="Write here, or open an outreach draft under Documents and click Use in email." value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
              <div className="flex items-center gap-3">
                <button className="btn" disabled={busy === 'send'}><Mail size={14} /> {busy === 'send' ? 'Sending…' : 'Send'}</button>
                {mailMsg && <span className="text-sm text-teal">{mailMsg}</span>}
              </div>
            </form>
          )}
          {gmail?.connected && (
            <div className="flex items-center gap-3">
              <button className="btn-ghost" disabled={busy === 'sync'} onClick={syncMail}>{busy === 'sync' ? 'Checking…' : 'Check for replies'}</button>
              {!compose.body && mailMsg && <span className="text-sm text-teal">{mailMsg}</span>}
            </div>
          )}
          {emails.length === 0 && gmail?.connected && <p className="text-sm text-teal">Nothing sent for this job yet.</p>}
          {emails.map((m) => (
            <div key={m.id} className={`card p-4 ${m.direction === 'received' ? 'ml-8 border-l-4 border-l-teal' : ''}`}>
              <div className="flex flex-wrap gap-x-3 text-xs text-teal mb-1">
                <span className="font-semibold uppercase">{m.direction === 'received' ? 'Reply' : 'Sent'}</span>
                <span>{m.direction === 'received' ? `from ${m.from_addr}` : `to ${m.to_addr}`}</span>
                <span className="ml-auto">{format(new Date(m.sent_at), 'MMM d, h:mm a')}</span>
              </div>
              <div className="font-medium text-sm">{m.subject}</div>
              <p className="whitespace-pre-wrap text-sm mt-1">{m.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'Documents' && (
        <div className="space-y-4">
          {!logistics && (
            <div className="card p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="label mb-0 mr-1">Draft with AI</span>
                <button className="btn" disabled={!!busy} onClick={() => ai('tailor', { instructions })}><Sparkles size={14} /> {busy === 'tailor' ? 'Writing…' : 'Tailored resume'}</button>
                <button className="btn" disabled={!!busy} onClick={() => ai('cover_letter', { instructions })}><Sparkles size={14} /> {busy === 'cover_letter' ? 'Writing…' : 'Cover letter'}</button>
                <button className="btn" disabled={!!busy} onClick={() => ai('outreach', { instructions, contact_name: job.contact_person })}><Sparkles size={14} /> {busy === 'outreach' ? 'Writing…' : 'Outreach email'}</button>
              </div>
              <input className="input" placeholder="Optional: extra instructions (e.g. emphasize event operations, keep it warmer)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              {aiErr && <p className="text-sm text-red-700">{aiErr}</p>}
            </div>
          )}
          <form className="card p-4 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (!newDoc.body.trim()) return;
            await api.post(`jobs/${id}/documents`, { ...newDoc, title: newDoc.title || newDoc.kind });
            setNewDoc({ ...newDoc, title: '', body: '' }); loadKids();
          }}>
            <div className="flex gap-3">
              <select className="input w-44" value={newDoc.kind} onChange={(e) => setNewDoc({ ...newDoc, kind: e.target.value })}>
                <option value="resume">Resume</option><option value="cover_letter">Cover letter</option><option value="outreach">Outreach</option><option value="other">Other</option>
              </select>
              <input className="input" placeholder="Title (optional)" value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} />
            </div>
            <textarea className="input" rows={5} placeholder="Draft text. Saving again under the same type creates a new version; older ones are kept." value={newDoc.body} onChange={(e) => setNewDoc({ ...newDoc, body: e.target.value })} />
            <button className="btn">Save as new version</button>
          </form>
          {docs.length === 0 && <p className="text-teal text-sm">No documents yet.</p>}
          {docs.map((d) => (
            <div key={d.id} className="card p-4">
              <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpenDoc(openDoc === d.id ? null : d.id)}>
                <span className="font-medium">{d.title}</span>
                <span className="text-xs bg-sky/60 rounded px-2 py-0.5">{d.kind.replace('_', ' ')} v{d.version}</span>
                <span className="text-xs text-teal ml-auto">{format(new Date(d.created_at), 'MMM d, h:mm a')}</span>
              </button>
              {openDoc === d.id && (
                <>
                  <pre className="whitespace-pre-wrap text-sm mt-3 font-sans">{d.body}</pre>
                  <div className="flex gap-2 mt-3">
                    {d.kind === 'outreach' && <button className="btn" onClick={() => useInEmail(d)}><Mail size={13} /> Use in email</button>}
                    <button className="btn-ghost" onClick={async () => { await api.del(`jobs/${id}/documents/${d.id}`); loadKids(); }}><Trash2 size={13} /> Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'Interview Prep' && (
        <div className="card p-5">
          <TextBlock label="Questions, talking points, logistics" value={job.interview_prep} onSave={(v) => save({ interview_prep: v })} rows={18} />
        </div>
      )}

      {tab === 'Notes Log' && (
        <div className="space-y-4">
          <form className="card p-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); if (!newNote.trim()) return; await api.post(`jobs/${id}/notes`, { body: newNote }); setNewNote(''); loadKids(); }}>
            <textarea className="input" rows={3} placeholder="Add a note…" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
            <button className="btn">Add note</button>
          </form>
          {notes.map((n) => (
            <div key={n.id} className="card p-4">
              <div className="text-xs text-teal mb-1">{format(new Date(n.created_at), 'MMM d, yyyy · h:mm a')}{n.kind !== 'note' && ` · ${n.kind}`}</div>
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'Next Actions' && (
        <div className="card p-5">
          <form className="flex gap-2 mb-4" onSubmit={async (e) => { e.preventDefault(); if (!newAction.trim()) return; await api.post(`jobs/${id}/actions`, { text: newAction }); setNewAction(''); loadKids(); }}>
            <input className="input" placeholder="Add a next action…" value={newAction} onChange={(e) => setNewAction(e.target.value)} />
            <button className="btn">Add</button>
          </form>
          <ul className="space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <input type="checkbox" checked={a.done} onChange={async (e) => { setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x))); await api.patch(`jobs/${id}/actions/${a.id}`, { done: e.target.checked }); }} />
                <span className={`flex-1 text-sm ${a.done ? 'line-through text-teal' : ''}`}>{a.text}</span>
                <button className="text-teal hover:text-navy" onClick={async () => { await api.del(`jobs/${id}/actions/${a.id}`); loadKids(); }}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
