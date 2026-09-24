import { noDash } from './noDash.js';

/** The seven slide layouts a deck can use. Preview, PDF, and PowerPoint all draw exactly these. */
export const LAYOUTS = ['title', 'statement', 'bigNumber', 'list', 'twoColumn', 'timeline', 'closing'] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface Column { heading: string; bullets: string[] }
export interface Slide {
  layout: Layout;
  heading: string;
  subheading?: string;
  body?: string;
  bullets?: string[];
  stat?: { value: string; label: string };
  left?: Column;
  right?: Column;
  steps?: { label: string; detail: string }[];
  notes: string;
  source_win_ids?: number[];
}
export interface DeckSpec { title: string; subtitle: string; slides: Slide[]; check_before_sharing: string[]; warnings?: string[] }

/** Trim to a length without ever cutting mid-word: back up to the last sentence end, or the last space. */
const clip = (s: unknown, n: number) => {
  const t = noDash(String(s ?? '')).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > n * 0.45) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:]$/, '');
};
const list = (v: unknown, max: number, n: number) => (Array.isArray(v) ? v.map((x) => clip(x, n)).filter(Boolean).slice(0, max) : []);
const col = (v: any): Column | undefined => (v && typeof v === 'object' ? { heading: clip(v.heading, 60), bullets: list(v.bullets, 5, 110) } : undefined);

/** Make whatever the AI or the editor produced safe to draw: known layouts only, capped lengths, no dashes. */
export function sanitizeSpec(raw: any): DeckSpec {
  const slides: Slide[] = (Array.isArray(raw?.slides) ? raw.slides : []).slice(0, 14).map((s: any): Slide => {
    const layout = (LAYOUTS as readonly string[]).includes(s?.layout) ? (s.layout as Layout) : 'list';
    const out: Slide = { layout, heading: clip(s?.heading, 90), notes: clip(s?.notes, 900) };
    if (s?.subheading) out.subheading = clip(s.subheading, 120);
    if (s?.body) out.body = clip(s.body, 380);
    if (Array.isArray(s?.bullets)) out.bullets = list(s.bullets, 6, 130);
    if (s?.stat) {
      let value = clip(s.stat.value, 24), label = clip(s.stat.label, 110);
      const m = value.match(/^(\$?\d[\d,.]*(?:[kKmM]\+?|\+|%|x)?)\s+(.+)$/);
      if (value.length > 8 && m) { value = m[1]; label = clip(`${m[2]} ${label}`, 110); }   // "30% increase" becomes the figure "30%" plus the words
      out.stat = { value: value.slice(0, 10), label };
    }
    if (s?.left) out.left = col(s.left);
    if (s?.right) out.right = col(s.right);
    if (Array.isArray(s?.steps)) out.steps = s.steps.slice(0, 4).map((t: any) => ({ label: clip(t?.label, 40), detail: clip(t?.detail, 150) })).filter((t: any) => t.label);
    if (Array.isArray(s?.source_win_ids)) out.source_win_ids = s.source_win_ids.map(Number).filter((n: number) => Number.isFinite(n)).slice(0, 6);
    return out;
  }).filter((s: Slide) => s.heading || s.layout === 'title');
  if (slides.length && slides[0].layout !== 'title') slides[0].layout = 'title';
  return {
    title: clip(raw?.title, 90) || slides[0]?.heading || 'Untitled deck',
    subtitle: clip(raw?.subtitle, 140),
    slides,
    check_before_sharing: list(raw?.check_before_sharing, 12, 200),
    warnings: Array.isArray(raw?.warnings) ? list(raw.warnings, 12, 200) : undefined,
  };
}

/** All the words on a slide, used for the number audit. */
export function slideText(s: Slide): string {
  return [s.heading, s.subheading, s.body, ...(s.bullets ?? []), s.stat?.value, s.stat?.label, s.left?.heading, ...(s.left?.bullets ?? []), s.right?.heading, ...(s.right?.bullets ?? []), ...(s.steps ?? []).flatMap((t) => [t.label, t.detail])].filter(Boolean).join(' ');
}
