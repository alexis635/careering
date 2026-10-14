// Puts the entries inside each resume section in order, newest first, so the order never depends on the AI.
// An entry is a "### Title | Dates" line plus everything under it until the next entry or section.
// Newest = latest end date ("Present" beats everything), then latest start date. A year with no month
// counts as the end of that year when it is an end date and the start of it when it is a start date.
// Entries with no readable dates (for example a degree with no year) keep their place.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const PRESENT = 9999 * 12;

/** [start, end] as month numbers (year * 12 + month), or null when the line has no year. */
export function dateRange(right: string): [number, number] | null {
  const s = right.toLowerCase();
  const points: { v: number; hasMonth: boolean }[] = [];
  const re = /(?:\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\b((?:19|20)\d{2})\b|\b(present|current|now|ongoing)\b/g;
  for (let m: RegExpExecArray | null; (m = re.exec(s)); ) {
    if (m[3]) points.push({ v: PRESENT, hasMonth: true });
    else points.push({ v: Number(m[2]) * 12 + (m[1] ? MONTHS.indexOf(m[1]) : -1), hasMonth: !!m[1] });
  }
  if (!points.length) return null;
  const first = points[0], last = points[points.length - 1];
  const start = first.hasMonth ? first.v : first.v + 1;    // a bare start year counts as January
  const end = last.hasMonth ? last.v : last.v + 12;        // a bare end year counts as December
  return [start, end];
}

export function orderResume(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim().startsWith('## ')) { out.push(lines[i++]); continue; }
    out.push(lines[i++]);   // the section heading
    // lines before the first entry stay put
    while (i < lines.length && !/^\s*##\s/.test(lines[i]) && !/^\s*###\s/.test(lines[i])) out.push(lines[i++]);
    const entries: { lines: string[]; range: [number, number] | null; idx: number }[] = [];
    while (i < lines.length && /^\s*###\s/.test(lines[i])) {
      const head = lines[i];
      const block = [lines[i++]];
      while (i < lines.length && !/^\s*#{2,3}\s/.test(lines[i])) block.push(lines[i++]);
      const right = head.includes('|') ? head.slice(head.indexOf('|') + 1) : '';
      entries.push({ lines: block, range: dateRange(right), idx: entries.length });
    }
    const dated = entries.filter((e) => e.range).sort((a, b) => b.range![1] - a.range![1] || b.range![0] - a.range![0] || a.idx - b.idx);
    let k = 0;
    for (const e of entries) out.push(...(e.range ? dated[k++] : e).lines);
  }
  return out.join('\n');
}
