import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, ArrowLeft, Archive, Trash2, RotateCcw, Pencil } from 'lucide-react';
import { api } from '../api';
import FitBadge from '../components/FitBadge';
import { LANE_COLORS, OUTCOMES, STAGES, type Job, type Lane, type Stage } from '../types';

export default function LaneView() {
  const { id } = useParams();
  const [lane, setLane] = useState<Lane | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [adding, setAdding] = useState(false);
  const nav = useNavigate();
  const [form, setForm] = useState({ company: '', role_title: '', type: 'application', source_link: '' });
  const [progress, setProgress] = useState('');
  const [importErr, setImportErr] = useState('');
  const [newId, setNewId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [hideClosed, setHideClosed] = useState(false);
  const [sortFit, setSortFit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', start_date: '', target_date: '', notes: '', color: '', status: 'active' });

  const load = () => {
    api.get<Lane>(`lanes/${id}`).then(setLane);
    api.get<Job[]>(`jobs?lane_id=${id}`).then(setJobs);
  };
  useEffect(load, [id]);

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    const link = form.source_link.trim();
    if (!link && !form.company.trim() && !form.role_title.trim()) return;
    setImportErr(''); setNewId(null);
    const job = await api.post<Job>('jobs', { ...form, source_link: link, lane_id: Number(id) });
    if (form.type === 'application' && link) {
      // Link in, everything else out: read the posting, fill in the details, then rate the fit.
      setNewId(job.id);
      try {
        setProgress('Reading the posting…');
        await api.post(`ai/import`, { job_id: job.id });
        setProgress('Checking how well it fits…');
        await api.post(`ai/match`, { job_id: job.id }).catch(() => {});   // fit rating is a bonus; do not block on it
        nav(`/jobs/${job.id}`);
        return;
      } catch (err: any) { setImportErr(err.message); setProgress(''); load(); return; }
    }
    setForm({ company: '', role_title: '', type: form.type, source_link: '' }); setAdding(false); load();
  }

  function openEdit() {
    if (!lane) return;
    setDraft({ name: lane.name, start_date: (lane.start_date ?? '').slice(0, 10), target_date: (lane.target_date ?? '').slice(0, 10), notes: lane.notes ?? '', color: lane.color, status: lane.status });
    setEditing((v) => !v);
  }
  async function saveLane(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setLane(await api.patch<Lane>(`lanes/${id}`, { ...draft, start_date: draft.start_date || null, target_date: draft.target_date || null }));
    setEditing(false);
  }
  async function archiveLane() {
    await api.post(`lanes/${id}/archive`); nav('/lanes');
  }
  async function deleteLane() {
    const n = jobs.length;
    if (!confirm(`Move "${lane?.name}" to the Trash?\n\n${n ? `Its ${n} job${n === 1 ? '' : 's'} and everything inside ${n === 1 ? 'it' : 'them'} stay saved. ` : ''}You can restore it anytime from Archive & Trash.`)) return;
    await api.del(`lanes/${id}`); nav('/lanes');
  }
  async function restoreLane() {
    await api.post(`lanes/${id}/restore`); load();
  }

  async function move(job: Job, stage: Stage, outcome?: string) {
    const patch: any = { stage, closed_outcome: stage === 'Closed' ? outcome ?? job.closed_outcome ?? 'Lost' : null };
    if (stage === 'Applied' && !job.applied_date) patch.applied_date = new Date().toISOString().slice(0, 10);
    setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, ...patch } : j)));
    await api.patch(`jobs/${job.id}`, patch);
  }

  if (!lane) return null;
  const stages = hideClosed ? STAGES.filter((s) => s !== 'Closed') : STAGES;

  return (
    <div>
      <Link to="/lanes" className="text-sm text-teal inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> All lanes</Link>
      <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
        <span className="w-3 h-8 rounded" style={{ background: lane.color }} />
        <h1 className="text-3xl font-bold mr-2">{lane.name}</h1>
        <label className="text-sm flex items-center gap-2 text-teal">
          <input type="checkbox" checked={sortFit} onChange={(e) => setSortFit(e.target.checked)} /> Best fit first
        </label>
        <label className="text-sm flex items-center gap-2 text-teal">
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Hide closed
        </label>
        <button className="btn" onClick={() => setAdding((v) => !v)}><Plus size={16} /> Add</button>
        <button className="btn-ghost" onClick={openEdit} title="Rename, set the timeline, notes"><Pencil size={14} /> Edit</button>
        <button className="btn-ghost" onClick={archiveLane} title="Hide this lane but keep everything"><Archive size={14} /> Archive</button>
        <button className="btn-ghost" onClick={deleteLane} title="Move to Trash (restorable)"><Trash2 size={14} /> Delete</button>
      </div>
      {editing && (
        <form onSubmit={saveLane} className="card p-4 mb-5 max-w-3xl mx-auto space-y-3">
          <div>
            <label className="label">Lane name</label>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Timeline starts</label><input className="input" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></div>
            <div><label className="label">Target date (timeline ends)</label><input className="input" type="date" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="active">Active</option><option value="paused">Paused</option><option value="achieved">Achieved</option>
              </select></div>
          </div>
          <div>
            <label className="label">Lane notes (strategy, timing)</label>
            <textarea className="input" rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex gap-2">{LANE_COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setDraft({ ...draft, color: c })} className={`w-7 h-7 rounded-full border-2 ${draft.color === c ? 'border-navy' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
            ))}</div>
          </div>
          <div className="flex gap-2"><button className="btn">Save</button><button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button></div>
        </form>
      )}
      {lane.notes && !editing && <p className="text-sm text-teal text-center max-w-3xl mx-auto mb-4 whitespace-pre-wrap">{lane.notes}</p>}
      {(lane.archived_at || lane.deleted_at) && (
        <div className="card p-3 mb-5 max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-3 text-sm">
          <span>{lane.deleted_at ? 'This lane is in the Trash.' : 'This lane is archived.'} Everything in it is still saved.</span>
          <button className="btn" onClick={restoreLane}><RotateCcw size={14} /> Restore</button>
        </div>
      )}

      {adding && (
        <form onSubmit={addJob} className="card p-4 mb-5 max-w-3xl mx-auto space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="application">Application</option>
                <option value="logistics">Logistics</option>
              </select>
            </div>
            <div className="flex-1 min-w-64">
              <label className="label">{form.type === 'logistics' ? 'Link (optional)' : 'Job posting link'}</label>
              <input className="input" placeholder="Paste the link and everything else fills in" value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} autoFocus />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-44">
              <label className="label">{form.type === 'logistics' ? 'Topic' : 'Company (only if no link)'}</label>
              <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="flex-1 min-w-44">
              <label className="label">{form.type === 'logistics' ? 'Detail' : 'Role (only if no link)'}</label>
              <input className="input" value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} />
            </div>
            <button className="btn" disabled={!!progress}>{progress || (form.source_link.trim() && form.type === 'application' ? 'Add and import' : 'Save')}</button>
          </div>
          {importErr && (
            <p className="text-sm text-red-700">{importErr}{newId && <> The job was still added. <Link className="underline" to={`/jobs/${newId}`}>Open it</Link> and paste the posting text.</>}</p>
          )}
        </form>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 xl:justify-center">
        {stages.map((stage) => {
          const rank = { strong: 0, moderate: 1, weak: 2 } as Record<string, number>;
          let col = jobs.filter((j) => j.stage === stage);
          if (sortFit) col = [...col].sort((a, b) => (rank[a.fit ?? ''] ?? 3) - (rank[b.fit ?? ''] ?? 3));
          return (
            <div
              key={stage}
              className="w-64 shrink-0 rounded-xl bg-sky/40 p-2.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const j = jobs.find((x) => x.id === dragId);
                if (j && j.stage !== stage) move(j, stage);
                setDragId(null);
              }}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wide">{stage}</span>
                <span className="text-xs text-teal">{col.length}</span>
              </div>
              <div className="space-y-2 min-h-8">
                {col.map((j) => (
                  <div key={j.id} draggable onDragStart={() => setDragId(j.id)} className="card p-3 cursor-grab active:cursor-grabbing" style={{ borderLeft: `4px solid ${lane.color}` }}>
                    <Link to={`/jobs/${j.id}`} className="block">
                      <div className="font-medium leading-snug">{j.company || 'Untitled'}</div>
                      <div className="text-sm text-teal leading-snug">{j.role_title}</div>
                    </Link>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <FitBadge fit={j.fit} />
                      {j.type === 'logistics' && <span className="text-[10px] uppercase bg-beige rounded px-1.5 py-0.5">logistics</span>}
                      {stage === 'Closed' ? (
                        <select className="text-xs bg-beige rounded px-1 py-0.5" value={j.closed_outcome ?? 'Lost'} onChange={(e) => move(j, 'Closed', e.target.value)}>
                          {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : null}
                      <select className="text-xs bg-beige rounded px-1 py-0.5 ml-auto" value={j.stage} onChange={(e) => move(j, e.target.value as Stage)}>
                        {STAGES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
