import type { Job } from '../types';

const STYLE: Record<string, string> = {
  strong: 'bg-navy text-white',
  moderate: 'bg-sky text-navy',
  weak: 'bg-beige text-teal border border-sky',
};

export default function FitBadge({ fit }: { fit: Job['fit'] }) {
  if (!fit) return null;
  return <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 font-medium ${STYLE[fit]}`}>{fit} fit</span>;
}
