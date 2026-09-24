import { HttpError } from './ai.js';
import { noDash } from '../src/lib/noDash.js';

/** The six stages the app understands underneath. A lane can rename them and hide some, but the stored stage is always one of these. */
export const CANON = ['Saved', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Closed'] as const;
export const OUTCOMES = ['Won', 'Lost', 'Withdrawn'] as const;

export interface StagesConfig { stages: { key: string; label: string }[]; outcomes: Record<string, string> }

const label = (v: unknown, fallback: string) => {
  const t = noDash(String(v ?? '')).replace(/\s+/g, ' ').trim().slice(0, 30);
  return t || fallback;
};

/** Validate what the browser sent. Returns null when it is just the defaults, so ordinary lanes store nothing. */
export function cleanStagesConfig(input: any): StagesConfig | null {
  if (!input) return null;
  const given: any[] = Array.isArray(input.stages) ? input.stages : [];
  const stages = CANON.filter((k) => given.some((s) => s?.key === k)).map((k) => ({ key: k as string, label: label(given.find((s) => s.key === k)?.label, k) }));
  if (!stages.some((s) => s.key === 'Saved') || !stages.some((s) => s.key === 'Closed')) throw new HttpError(400, 'A lane needs at least its first and last stages');
  const outcomes: Record<string, string> = {};
  for (const o of OUTCOMES) outcomes[o] = label(input.outcomes?.[o], o);
  const isDefault = stages.length === CANON.length && stages.every((s) => s.label === s.key) && OUTCOMES.every((o) => outcomes[o] === o);
  return isDefault ? null : { stages, outcomes };
}

/** What this lane calls a stage (falls back to the standard name). */
export const stageLabel = (cfg: StagesConfig | null | undefined, key: string) => cfg?.stages?.find((s) => s.key === key)?.label ?? key;
