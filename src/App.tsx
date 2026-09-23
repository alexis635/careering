import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Lanes from './pages/Lanes';
import LaneView from './pages/LaneView';
import JobDetail from './pages/JobDetail';
import Library from './pages/Library';

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
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <span className="font-display text-xl font-bold text-white">Careering</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={link}>Lanes</NavLink>
            <NavLink to="/library" className={link}>Library</NavLink>
          </nav>
          <button className="ml-auto text-sm text-sky hover:text-white" onClick={async () => { await api.post('logout'); setAuthed(false); }}>
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Lanes />} />
          <Route path="/lanes/:id" element={<LaneView />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/library" element={<Library />} />
        </Routes>
      </main>
    </div>
  );
}
