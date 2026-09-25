import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import Wins from '../components/Wins';
import RolesPay from '../components/RolesPay';
import DecksList from '../components/DecksList';

const TABS = [['wins', 'Wins'], ['roles', 'Roles and pay'], ['decks', 'Decks'], ['case', 'Build my case']] as const;
type Tab = (typeof TABS)[number][0];

export default function Rise() {
  const [sp] = useSearchParams();
  const t = sp.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(t && TABS.some(([k]) => k === t) ? t : 'wins');
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-4">
        <h1 className="text-5xl font-bold">Rise</h1>
        <p className="text-teal mt-1">The evidence and the history of your growth.</p>
      </div>
      <div className="flex justify-center gap-1 border-b border-sky mb-5 overflow-x-auto overflow-y-hidden">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-navy font-semibold' : 'border-transparent text-teal hover:text-navy'}`}>{label}</button>
        ))}
      </div>
      {tab === 'wins' && <Wins />}
      {tab === 'roles' && <RolesPay />}
      {tab === 'decks' && <DecksList />}
      {tab === 'case' && (
        <div className="card p-6 text-center space-y-3 max-w-xl mx-auto">
          <p className="text-sm">Turn your logged wins into a case for a promotion, a raise, or a performance review. It uses only the wins you choose, in your own voice, and never invents a number.</p>
          <Link to="/case" className="btn inline-flex"><Sparkles size={14} /> Build my case</Link>
        </div>
      )}
    </div>
  );
}
