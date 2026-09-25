import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { api } from '../api';
import type { Lane } from '../types';

interface ArchiveData {
  archivedLanes: (Lane & { job_count: number })[];
  trashedLanes: (Lane & { job_count: number })[];
  trashedJobs: { id: number; company: string; role_title: string; stage: string; deleted_at: string; lane_name: string; color: string }[];
}

function Section({ title, hint, children, empty }: { title: string; hint: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-center">{title}</h2>
      <p className="text-sm text-teal text-center mb-3">{hint}</p>
      {empty ? <p className="text-sm text-teal text-center">Nothing here.</p> : <div className="card divide-y divide-sky/60">{children}</div>}
    </section>
  );
}

export default function ArchivePage() {
  const [data, setData] = useState<ArchiveData | null>(null);
  const load = () => api.get<ArchiveData>('archive').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return null;

  const laneRow = (l: Lane & { job_count: number }, when: string | null | undefined) => (
    <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <span className="w-2 h-6 rounded" style={{ background: l.color }} />
      <Link to={`/lanes/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
      <span className="text-teal">{l.job_count} {l.job_count === 1 ? 'job' : 'jobs'}</span>
      {when && <span className="text-xs text-teal">since {format(new Date(when), 'MMM d, yyyy')}</span>}
      <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`lanes/${l.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <Link to="/lanes" className="text-sm text-teal inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Lanes</Link>
        <h1 className="text-4xl sm:text-5xl font-bold text-center">Archive & Trash</h1>
        <p className="text-sm text-teal text-center mt-1">Nothing is ever permanently deleted. Everything here can be restored with all its jobs, documents, notes, and emails.</p>
      </div>

      <Section title="Archived lanes" hint="Hidden from your lanes and home page, but still searchable." empty={!data.archivedLanes.length}>
        {data.archivedLanes.map((l) => laneRow(l, l.archived_at))}
      </Section>

      <Section title="Trashed lanes" hint="Deleted lanes, with every job inside them kept safe." empty={!data.trashedLanes.length}>
        {data.trashedLanes.map((l) => laneRow(l, l.deleted_at))}
      </Section>

      <Section title="Trashed jobs" hint="Jobs deleted on their own." empty={!data.trashedJobs.length}>
        {data.trashedJobs.map((j) => (
          <div key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ background: j.color }} />
            <span className="font-medium">{j.company || 'Untitled'}</span><span className="text-teal">{j.role_title}</span>
            <span className="text-xs text-teal">{j.lane_name}, deleted {format(new Date(j.deleted_at), 'MMM d, yyyy')}</span>
            <button className="btn-ghost ml-auto" onClick={async () => { await api.post(`jobs/${j.id}/restore`); load(); }}><RotateCcw size={13} /> Restore</button>
          </div>
        ))}
      </Section>
    </div>
  );
}
