import { useEffect, useState } from 'react';

/** The company's icon, or its first letter when there is no website on file yet or the icon fails to load. */
export default function CompanyLogo({ domain, name, size = 'lg' }: { domain?: string | null; name: string; size?: 'lg' | 'sm' }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [domain]);
  const lg = size === 'lg';
  const box = lg
    ? 'grid place-items-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white shrink-0 overflow-hidden shadow-md'
    : 'grid place-items-center w-8 h-8 rounded-lg bg-white border border-sky/60 shrink-0 overflow-hidden';
  if (domain && !bad) return <div className={box}><img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`} alt="" loading="lazy" className={lg ? 'w-10 h-10 sm:w-12 sm:h-12 object-contain' : 'w-5 h-5 object-contain'} onError={() => setBad(true)} /></div>;
  return <div className={`${box} font-display font-bold text-navy ${lg ? 'text-3xl' : 'text-sm bg-beige'}`}>{(name || '?').trim().charAt(0).toUpperCase()}</div>;
}
