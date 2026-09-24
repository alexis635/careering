import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useMatch, useNavigate } from 'react-router-dom';
import { api } from './api';
import Home from './pages/Home';
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

function HeaderSearch() {
  const nav = useNavigate();
  const onJob = useMatch('/jobs/:id');
  const [term, setTerm] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (term.trim()) nav(`/search?q=${encodeURIComponent(term.trim())}${onJob ? `&job=${onJob.params.id}` : ''}`); }}>
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={onJob ? 'Search or ask (this job first)…' : 'Search or ask anything…'}
        className="w-56 md:w-72 rounded-lg bg-white/10 text-white placeholder:text-sky/70 px-3 py-1.5 text-sm focus:outline-none focus:bg-white/20" />
    </form>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const check = () => api.get<{ authed: boolean }>('me').then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
  useEffect(() => { check(); }, []);

  if (authed === null) return null;
  if (!authed) return <Login onDone={check} />;

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm ${isActive ? 'bg-white/15 text-white' : 'text-sky hover:text-white'}`;

  return (
    <div className="min-h-screen">
      <header className="bg-navy">
        <div className="max-w-7xl mx-auto px-4 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Link to="/" className="font-display text-xl font-bold text-white hover:text-sky transition-colors w-fit" title="Home">Careering</Link>
          <nav className="flex flex-wrap justify-center gap-1">
            <NavLink to="/lanes" end className={link}>Lanes</NavLink>
            <NavLink to="/timeline" className={link}>Timeline</NavLink>
            <NavLink to="/weekly" className={link}>Week</NavLink>
            <NavLink to="/mail" className={link}>Mail</NavLink>
            <NavLink to="/resume" className={link}>Resume</NavLink>
            <NavLink to="/library" className={link}>Library</NavLink>
          </nav>
          <div className="flex items-center justify-end gap-4">
          <HeaderSearch />
          <button className="text-sm text-sky hover:text-white" onClick={async () => { await api.post('logout'); setAuthed(false); }}>
            Sign out
          </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
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
