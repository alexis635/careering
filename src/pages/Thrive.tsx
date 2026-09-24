import { Link } from 'react-router-dom';

const PLANNED = [
  ['Schedule', 'Your week at work, in one view'],
  ['Projects and tasks', 'What you own, and what is due'],
  ['Role and responsibilities', 'What the job is, in writing'],
  ['Goals', 'What you are working toward this quarter and this year'],
  ['Handbooks and policies', 'Ask questions of your employer documents with AI, only the ones you choose'],
  ['Meeting and 1:1 notes', 'A record you can point back to'],
];

export default function Thrive() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Thrive</h1>
        <p className="text-teal mt-1">A home for the job you are in now.</p>
      </div>
      <div className="card p-6 space-y-4">
        <p className="text-sm text-center">Thrive is not built yet. When it is, it will hold everything about your current job in one place.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANNED.map(([t, d]) => (
            <div key={t} className="rounded-lg bg-beige p-3"><div className="font-semibold text-sm">{t}</div><div className="text-xs text-teal mt-0.5">{d}</div></div>
          ))}
        </div>
      </div>
      <div className="card p-5 text-center space-y-2">
        <p className="text-sm">One thing you can do today: keep track of what you accomplish at work, so you have the evidence when it is time to ask for more.</p>
        <Link to="/rise" className="btn inline-flex">Capture a win in Rise</Link>
      </div>
    </div>
  );
}
