import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { exportEverything } from '../lib/exportRun';

const TILES = [
  { to: '/pursue', word: 'Pursue', cls: 'bg-navy text-white' },
  { to: '/thrive', word: 'Thrive', cls: 'bg-teal text-white' },
  { to: '/vault', word: 'Vault', cls: 'bg-sky text-navy' },
  { to: '/rise', word: 'Rise', cls: 'bg-white text-navy border border-sky' },
];

export default function Hub() {
  const [status, setStatus] = useState('');
  const failed = status.startsWith('Export failed');
  return (
    <div className="min-h-[calc(100vh-9rem)] flex flex-col items-center justify-center gap-8">
      <nav aria-label="Careering" className="grid grid-cols-2 grid-rows-2 gap-4 aspect-square w-[min(88vw,58vh,540px)]">
        {TILES.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={`${t.cls} rounded-2xl flex items-center justify-center font-display font-bold text-3xl sm:text-4xl shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-teal/40`}
          >
            {t.word}
          </Link>
        ))}
      </nav>
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
