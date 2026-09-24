import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { api } from './api';
import Hub from './pages/Hub';
import Home from './pages/Home';
import Thrive from './pages/Thrive';
import Vault from './pages/Vault';
import Rise from './pages/Rise';
import Lanes from './pages/Lanes';
import LaneView from './pages/LaneView';
import JobDetail from './pages/JobDetail';
import Library from './pages/Library';
import Search from './pages/Search';
import Mail from './pages/Mail';
import Weekly from './pages/Weekly';
import Timeline from './pages/Timeline';
import ResumeBuilder from './pages/Resume';
import CaseBuilder from './pages/Case';
import ArchivePage from './pages/Archive';

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="min-h-screen grid place-items-center bg-navy px-4">
      <form
        className="card p-8 w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try { await api.post('login', { password: pw }); onDone(); } catch (x: any) { setErr(x.message); }
        }}
      >
        <h1 className="text-3xl font-bold">Careering</h1>
        <input className="input" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn w-full justify-center">Sign in</button>
      </form>
    </div>
  );
}

function SearchBar({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const onJob = useMatch('/jobs/:id');
  const [term, setTerm] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="bg-navy border-t border-white/10">
      <form
        className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (term.trim()) { nav(`/search?q=${encodeURIComponent(term.trim())}${onJob ? `&job=${onJob.params.id}` : ''}`); onClose(); } }}
      >
        <SearchIcon size={16} className="text-sky shrink-0" aria-hidden="true" />
        <input
          ref={ref}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={onJob ? 'Search or ask, this job first' : 'Search or ask anything'}
          className="flex-1 rounded-lg bg-white/10 text-white placeholder:text-sky/70 px-3 py-2 text-sm focus:outline-none focus:bg-white/20"
        />
        <button type="button" onClick={onClose} aria-label="Close search" className="text-sky hover:text-white"><X size={18} /></button>
      </form>
    </div>
  );
}

// Which of the four areas a page belongs to. Everything that is job search (jobs, lanes, mail, resumes, the library) is Pursue.
const AREAS = [['pursue', 'Pursue', '/pursue'], ['thrive', 'Thrive', '/thrive'], ['vault', 'Vault', '/vault'], ['rise', 'Rise', '/rise']] as const;
function areaOf(path: string) {
  if (path === '/') return 'hub';
  if (path.startsWith('/thrive')) return 'thrive';
  if (path.startsWith('/vault')) return 'vault';
  if (path.startsWith('/rise') || path.startsWith('/case')) return 'rise';
  return 'pursue';
}
const PURSUE_LINKS = [['/pursue', 'Overview'], ['/lanes', 'Lanes'], ['/timeline', 'Timeline'], ['/weekly', 'Week'], ['/mail', 'Mail'], ['/resume', 'Resume'], ['/library', 'Library']] as const;

export default function App() {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { setSearchOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const check = () => api.get<{ authed: boolean }>('me').then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
  useEffect(() => { check(); }, []);

  if (authed === null) return null;
  if (!authed) return <Login onDone={check} />;

  const area = areaOf(pathname);
  const sub = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${isActive ? 'bg-navy text-white' : 'text-teal hover:text-navy hover:bg-sky/40'}`;

  return (
    <div className="min-h-screen">
      <header className="bg-navy">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:grid md:grid-cols-[1fr_auto_1fr] md:h-14 md:py-0">
          <Link to="/" className="order-1 font-display text-xl font-bold text-white hover:text-sky transition-colors w-fit" title="Home">Careering</Link>
          <nav className="order-3 w-full justify-center flex gap-1 md:order-2 md:w-auto">
            {AREAS.map(([key, label, to]) => (
              <Link key={key} to={to} className={`px-3 py-1.5 rounded-lg text-sm ${area === key ? 'bg-white/15 text-white' : 'text-sky hover:text-white'}`}>{label}</Link>
            ))}
          </nav>
          <div className="order-2 ml-auto flex items-center justify-end gap-4 md:order-3">
            <button onClick={() => setSearchOpen((v) => !v)} aria-label="Search" title="Search (press /)" className={`rounded-lg p-1.5 ${searchOpen ? 'bg-white/15 text-white' : 'text-sky hover:text-white'}`}><SearchIcon size={18} /></button>
            <button className="text-sm text-sky hover:text-white whitespace-nowrap" onClick={async () => { await api.post('logout'); setAuthed(false); }}>Sign out</button>
          </div>
        </div>
        {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
      </header>
      {area === 'pursue' && (
        <div className="bg-white/70 border-b border-sky/70">
          <nav className="max-w-7xl mx-auto px-4 py-1.5 flex flex-wrap justify-center gap-1">
            {PURSUE_LINKS.map(([to, label]) => <NavLink key={to} to={to} end={to === '/pursue'} className={sub}>{label}</NavLink>)}
          </nav>
        </div>
      )}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/pursue" element={<Home />} />
          <Route path="/thrive" element={<Thrive />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/rise" element={<Rise />} />
          <Route path="/lanes" element={<Lanes />} />
          <Route path="/lanes/:id" element={<LaneView />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/library" element={<Library />} />
          <Route path="/search" element={<Search />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/resume" element={<ResumeBuilder />} />
          <Route path="/case" element={<CaseBuilder />} />
          <Route path="/weekly" element={<Weekly />} />
          <Route path="/mail" element={<Mail />} />
          <Route path="/archive" element={<ArchivePage />} />
        </Routes>
      </main>
    </div>
  );
}
