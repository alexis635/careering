import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import DeckEditor from './DeckEditor';
import type { Deck } from '../types';

interface Angle { title: string; why: string }

/** The Interview deck tab on a job: pick an angle, build the deck from logged Wins, edit, export. */
export default function JobDeck({ jobId, decks, reload }: { jobId: number; decks: Deck[]; reload: () => void }) {
  const [angles, setAngles] = useState<Angle[] | null>(null);
  const [angle, setAngle] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const shown = decks.find((d) => d.id === sel) ?? decks[0];

  useEffect(() => { setAngles(null); setAngle(''); }, [jobId]);

  async function suggest() {
    setBusy('angles'); setErr('');
    try { setAngles((await api.post<{ angles: Angle[] }>('ai/deck-angles', { job_id: jobId })).angles); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function build() {
    if (!angle.trim()) return;
    setBusy('build'); setErr('');
    try { const d = await api.post<Deck>('ai/deck', { job_id: jobId, angle, minutes }); setSel(d.id); setAngle(''); setAngles(null); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Interview deck</h2>
          <p className="text-sm text-teal">A short deck for this role, built only from the Wins you have logged. Every number is checked against them.</p>
        </div>
        {!angles && (
          <div className="text-center">
            <button className="btn" disabled={!!busy} onClick={suggest}><Sparkles size={14} /> {busy === 'angles' ? 'Thinking…' : 'Suggest angles for this role'}</button>
          </div>
        )}
        {angles && (
          <div className="grid sm:grid-cols-3 gap-2">
            {angles.map((a) => (
              <button key={a.title} onClick={() => setAngle(a.title)} className={`text-left rounded-lg border p-3 text-sm ${angle === a.title ? 'border-navy bg-sky/40' : 'border-sky hover:bg-beige'}`}>
                <div className="font-semibold">{a.title}</div><div className="text-teal mt-1">{a.why}</div>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <input className="input flex-1 min-w-56" placeholder="Or write your own angle, like: how I would grow their partnerships in 90 days" value={angle} onChange={(e) => setAngle(e.target.value)} />
          <select className="input w-auto" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[5, 10, 15, 20].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
          <button className="btn" disabled={!!busy || !angle.trim()} onClick={build}><Sparkles size={14} /> {busy === 'build' ? 'Building, about a minute…' : 'Build deck'}</button>
        </div>
        {err && <div className="text-sm text-red-700 text-center">{err}</div>}
      </div>

      {shown && (
        <>
          {decks.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-teal">Version</span>
              <select className="input w-auto text-xs" value={shown.id} onChange={(e) => setSel(Number(e.target.value))}>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.title}, {format(new Date(d.created_at), 'MMM d, h:mm a')}</option>)}
              </select>
            </div>
          )}
          <DeckEditor deck={shown} onSaved={(d) => { setSel(d.id); reload(); }} onTrashed={() => { setSel(null); reload(); }} />
        </>
      )}
    </div>
  );
}
