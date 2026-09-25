import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { exportEverything } from '../lib/exportRun';

// Tonal tiles: navy through sky. The big letter behind each word is one step lighter than its tile.
const TILES = [
  { to: '/pursue', word: 'Pursue', blurb: 'Find, apply to, and track every opportunity.', letter: 'P', bg: '#2F4058', mono: '#3B4E68', ink: '#F5EFEB' },
  { to: '/thrive', word: 'Thrive', blurb: 'Do your best work in the role you have now.', letter: 'T', bg: '#43607A', mono: '#4E6C86', ink: '#F5EFEB' },
  { to: '/vault', word: 'Vault', blurb: 'Keep your records and credentials safe.', letter: 'V', bg: '#567C8D', mono: '#628898', ink: '#F5EFEB' },
  { to: '/rise', word: 'Rise', blurb: 'Turn your wins into raises and promotions.', letter: 'R', bg: '#8FB0C7', mono: '#9ABBD0', ink: '#2F4058' },
];

export default function Hub() {
  const [status, setStatus] = useState('');
  const failed = status.startsWith('Export failed');
  return (
    <div className="min-h-[calc(100vh-16rem)] flex flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.05]">Every move, on purpose.</h1>
        <p className="text-teal text-lg mt-3">Four places to run your whole career.</p>
      </div>
      <nav
        aria-label="Careering"
        className="grid grid-cols-2 grid-rows-2 gap-2 aspect-square"
        style={{ ['--w' as any]: 'min(88vw, 58vh, 540px)', width: 'var(--w)' }}
      >
        {TILES.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group relative overflow-hidden rounded transition duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-teal/40"
            style={{ background: t.bg }}
          >
            <span
              aria-hidden="true"
              className="absolute font-display leading-none select-none transition-transform duration-300 group-hover:-translate-x-1 group-hover:translate-y-1"
              style={{ color: t.mono, fontSize: 'calc(var(--w) * 0.38)', right: '-2%', top: '-6%' }}
            >
              {t.letter}
            </span>
            <span className="absolute font-display" style={{ color: t.ink, fontSize: 'calc(var(--w) * 0.078)', left: '6%', bottom: '5%' }}>{t.word}</span>
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl w-full">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="card card-hover p-4 text-center">
            <div className="font-display font-semibold text-lg">{t.word}</div>
            <p className="text-sm text-teal mt-1 leading-snug">{t.blurb}</p>
          </Link>
        ))}
      </div>
      <button
        className="text-xs text-teal underline inline-flex items-center gap-1 disabled:no-underline"
        disabled={!!status && !failed}
        onClick={async () => { try { await exportEverything(setStatus); } catch (e: any) { setStatus(`Export failed: ${e.message}`); } }}
      >
        <Download size={12} /> {status || 'Export everything (a zip of all your data and files)'}
      </button>
    </div>
  );
}
