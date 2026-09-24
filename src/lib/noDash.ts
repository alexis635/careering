/*
 Careering never uses em dashes or en dashes, anywhere: not in resumes, cover letters, emails, notes, or the AI's answers.
 Date ranges become "to" (Apr 2023 to May 2026); every other dash becomes a comma.
*/
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DASH = '[\\u2012\\u2013\\u2014\\u2015\\u2212]';

const RANGE_A = new RegExp(`(\\d)\\s*${DASH}\\s*(?=\\d|Present|Current|Now\\b|${MONTH}\\b)`, 'g');   // 2021 to Present, 2023 to May 2026
const RANGE_B = new RegExp(`\\b(${MONTH})\\s*${DASH}\\s*(?=\\d|${MONTH}\\b)`, 'g');                  // Jun to Aug 2019
const ANY = new RegExp(`\\s*${DASH}\\s*`, 'g');

export function noDash(s: string): string {
  if (!s) return s;
  return s
    .replace(RANGE_A, '$1 to ')
    .replace(RANGE_B, '$1 to ')
    .replace(/\s+--\s+/g, ', ')
    .replace(ANY, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/ ,/g, ',');
}

export function deepNoDash<T>(v: T): T {
  if (typeof v === 'string') return noDash(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => deepNoDash(x)) as unknown as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, deepNoDash(x)])) as T;
  return v;
}
