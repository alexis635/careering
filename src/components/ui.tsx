import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Shared page hero, empty state, and loading placeholders so every area feels like one site.
export function PageHero({ icon: Icon, title, blurb, children }: { icon: LucideIcon; title: string; blurb: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-navy text-beige px-6 py-10 sm:px-10 sm:py-12 text-center">
      <span aria-hidden="true" className="absolute -right-4 -top-16 font-display text-[18rem] leading-none text-white/[0.04] select-none">{title[0]}</span>
      <span className="relative mx-auto grid place-items-center w-11 h-11 rounded-xl bg-white/10 text-sky"><Icon size={22} aria-hidden="true" /></span>
      <h1 className="relative text-5xl sm:text-6xl font-extrabold mt-3 leading-[1.05]">{title}</h1>
      <p className="relative text-sky text-lg mt-3 max-w-xl mx-auto">{blurb}</p>
      {children && <div className="relative mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center">
      <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-sky/40 text-teal"><Icon size={22} aria-hidden="true" /></span>
      <h3 className="font-display text-xl font-semibold mt-3">{title}</h3>
      {children && <p className="text-sm text-teal mt-1 max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-sky/50 ${className}`} aria-hidden="true" />;
}

export function CardSkeletons({ n = 3, className = 'h-24' }: { n?: number; className?: string }) {
  return <div className="space-y-3" role="status" aria-label="Loading">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className={className} />)}</div>;
}
