import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { Compass, Lock, Search as SearchIcon, Sprout, TrendingUp, X } from 'lucide-react';
import { api } from './api';
import Hub from './pages/Hub';
import Home from './pages/Home';
import WorkspacePage from './pages/Workspace';
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
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-navy text-beige p-12 relative overflow-hidden">
        <span aria-hidden="true" className="absolute -right-10 -top-16 font-display text-[28rem] leading-none text-white/[0.04] select-none">C</span>
        <div className="flex items-center gap-2.5 relative"><span className="grid place-items-center w-9 h-9 rounded-lg bg-beige text-navy font-display font-bold text-xl">C</span><span className="font-display text-xl font-bold">Careering</span></div>
        <div className="relative">
          <h2 className="font-display text-5xl font-bold leading-[1.1]">Every move,<br />on purpose.</h2>
          <p className="mt-4 text-sky max-w-sm">Pursue the next role, thrive in the current one, keep your records safe, and rise on your own terms.</p>
        </div>
        <div className="text-xs text-sky/70 relative">Pursue &middot; Thrive &middot; Vault &middot; Rise</div>
      </div>
      <div className="grid place-items-center bg-beige px-6 py-12">
        <form
          className="w-full max-w-sm space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            try { await api.post('login', { password: pw }); onDone(); } catch (x: any) { setErr(x.message); }
          }}
        >
          <div className="lg:hidden flex items-center gap-2.5"><span className="grid place-items-center w-9 h-9 rounded-lg bg-navy text-beige font-display font-bold text-xl">C</span><span className="font-display text-xl font-bold">Careering</span></div>
          <div><h1 className="text-4xl font-bold">Welcome back</h1><p className="text-teal mt-1">Sign in to pick up where you left off.</p></div>
          <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input py-2.5" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button className="btn btn-lg w-full justify-center">Sign in</button>
        </form>
      </div>
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
const AREA_ICONS = { pursue: Compass, thrive: Sprout, vault: Lock, rise: TrendingUp } as const;
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
    <div className="min-h-screen flex flex-col">
      <header className="bg-navy sticky top-0 z-30 shadow-[0_1px_0_rgba(255,255,255,.06),0_8px_24px_-16px_rgba(0,0,0,.5)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-x-4 md:grid md:grid-cols-[1fr_auto_1fr]">
          <Link to="/" className="order-1 flex items-center gap-2.5 font-display text-xl font-bold text-white hover:text-sky transition-colors w-fit" title="Home"><span className="grid place-items-center w-8 h-8 rounded-lg bg-beige text-navy text-lg leading-none">C</span>Careering</Link>
          <nav className="hidden md:flex order-2 justify-center gap-0 h-full">
            {AREAS.map(([key, label, to]) => (
              <Link key={key} to={to} className={`relative px-4 py-4 text-sm font-medium transition-colors after:absolute after:left-3 after:right-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors ${area === key ? 'text-white after:bg-beige' : 'text-sky hover:text-white after:bg-transparent'}`}>{label}</Link>
            ))}
          </nav>
          <div className="order-3 ml-auto flex items-center justify-end gap-4 md:order-3">
            <button onClick={() => setSearchOpen((v) => !v)} aria-label="Search" title="Search (press /)" className={`rounded-lg p-1.5 ${searchOpen ? 'bg-white/15 text-white' : 'text-sky hover:text-white'}`}><SearchIcon size={18} /></button>
            <button className="text-sm text-sky hover:text-white whitespace-nowrap" onClick={async () => { await api.post('logout'); setAuthed(false); }}>Sign out</button>
          </div>
        </div>
        {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
      </header>
      {area === 'pursue' && (
        <div className="bg-white/80 backdrop-blur border-b border-sky/60 sticky top-14 z-20">
          <nav className="max-w-7xl mx-auto px-4 py-1.5 flex flex-nowrap overflow-x-auto md:justify-center gap-1">
            {PURSUE_LINKS.map(([to, label]) => <NavLink key={to} to={to} end={to === '/pursue'} className={sub}>{label}</NavLink>)}
          </nav>
        </div>
      )}
      <main className={`flex-1 ${/^\/thrive\/\d+/.test(pathname) ? 'w-full' : 'w-full max-w-7xl mx-auto px-4 py-6'}`}>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/pursue" element={<Home />} />
          <Route path="/thrive" element={<Thrive />} />
          <Route path="/thrive/:id" element={<WorkspacePage />} />
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
      <footer className="mt-12 mb-16 md:mb-0 border-t border-sky/60 bg-white/60">
        <div className="max-w-7xl mx-auto px-4 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-teal">
          <div className="flex items-center gap-2"><span className="grid place-items-center w-6 h-6 rounded-md bg-navy text-beige font-display text-sm font-bold">C</span><span className="font-display font-semibold text-navy">Careering</span></div>
          <nav className="flex gap-5">{AREAS.map(([k, label, to]) => <Link key={k} to={to} className="hover:text-navy">{label}</Link>)}</nav>
        </div>
      </footer>
      <nav aria-label="Areas" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-navy border-t border-white/10 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {AREAS.map(([key, label, to]) => {
          const Icon = AREA_ICONS[key];
          return (
            <Link key={key} to={to} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${area === key ? 'text-white' : 'text-sky/70'}`}>
              <Icon size={20} aria-hidden="true" />{label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
