import type { Slide, DeckSpec } from './deckSpec';

/*
 Every slide is described ONCE here, as drawing instructions on a 1280 by 720 canvas.
 The on-screen preview, the PDF, and the PowerPoint file all draw from this same list, so they always match.
*/
export const W = 1280, H = 720;
export const C = { navy: '#2F4058', teal: '#567C8D', tealDk: '#3D5F70', sky: '#C8D9E6', beige: '#F5EFEB', white: '#FFFFFF', cream: '#F5EFEB' };

export type Op =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; r?: number }
  | { t: 'ellipse'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; color: string; bold?: boolean; serif?: boolean; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom' };

export interface Laid { bg: string; ops: Op[] }

const est = (text: string, size: number, w: number, lh = 1.28) => Math.max(1, Math.ceil((text.length * size * 0.53) / w)) * size * lh;

function heading(text: string, size: number, x: number, y: number, w: number, color: string): { op: Op; h: number } {
  const h = Math.max(1, Math.ceil((text.length * size * 0.5) / w)) * size * 1.15;
  return { op: { t: 'text', x, y, w, h: h + 8, text, size, color, bold: true, serif: true }, h };
}

function bullets(items: string[], x: number, y: number, w: number, size: number, color: string, dot: string, gap: number): { ops: Op[]; end: number } {
  const ops: Op[] = [];
  let cy = y;
  for (const it of items) {
    const h = est(it, size, w - 40);
    ops.push({ t: 'ellipse', x, y: cy + size * 0.42, w: size * 0.36, h: size * 0.36, fill: dot });
    ops.push({ t: 'text', x: x + 36, y: cy, w: w - 40, h: h + 6, text: it, size, color });
    cy += h + gap;
  }
  return { ops, end: cy };
}

export function layoutSlide(s: Slide, i: number, n: number, deck: Pick<DeckSpec, 'subtitle'>): Laid {
  const dark = s.layout === 'title' || s.layout === 'closing';
  const ops: Op[] = [];
  const num = (color: string): Op => ({ t: 'text', x: 1100, y: 664, w: 100, h: 26, text: `${i + 1} / ${n}`, size: 16, color, align: 'right' });

  if (s.layout === 'title') {
    const size = s.heading.length > 34 ? 54 : 66;
    const hd = heading(s.heading, size, 90, 270, 1040, C.cream);
    ops.push({ t: 'rect', x: 90, y: 236, w: 100, h: 7, fill: C.teal });
    ops.push(hd.op);
    const sub = s.subheading || deck.subtitle;
    if (sub) ops.push({ t: 'text', x: 90, y: 270 + hd.h + 34, w: 1040, h: est(sub, 28, 1040) + 8, text: sub, size: 28, color: C.sky });
    return { bg: C.navy, ops };
  }

  if (s.layout === 'closing') {
    const hd = heading(s.heading, s.heading.length > 44 ? 46 : 56, 90, 190, 1040, C.cream);
    ops.push({ t: 'rect', x: 90, y: 160, w: 100, h: 7, fill: C.teal });
    ops.push(hd.op);
    if (s.body) ops.push({ t: 'text', x: 90, y: 190 + hd.h + 36, w: 1000, h: est(s.body, 28, 1000) + 8, text: s.body, size: 28, color: C.sky });
    ops.push(num(C.sky));
    return { bg: C.navy, ops };
  }

  if (s.layout === 'statement') {
    const size = s.heading.length > 70 ? 42 : s.heading.length > 44 ? 50 : 58;
    const hd = heading(s.heading, size, 140, 170, 1040, C.navy);
    const bodyH = s.body ? est(s.body, 28, 980) : 0;
    ops.push({ t: 'rect', x: 90, y: 176, w: 10, h: hd.h + (s.body ? bodyH + 44 : 0), fill: C.teal });
    ops.push(hd.op);
    if (s.body) ops.push({ t: 'text', x: 140, y: 170 + hd.h + 34, w: 980, h: bodyH + 8, text: s.body, size: 28, color: C.tealDk });
    ops.push(num(C.tealDk));
    return { bg: C.beige, ops };
  }

  // the remaining layouts share a title block at the top
  const top = heading(s.heading, s.heading.length > 50 ? 38 : 44, 90, 60, s.layout === 'timeline' ? 860 : 1100, C.navy);
  const accentY = 60 + top.h + 16;
  ops.push(top.op);
  ops.push({ t: 'rect', x: 90, y: accentY, w: 100, h: 6, fill: C.teal });
  const bodyTop = accentY + 44;

  if (s.layout === 'bigNumber') {
    const v = s.stat?.value ?? '';
    const size = v.length <= 4 ? 200 : v.length <= 6 ? 160 : v.length <= 8 ? 120 : 92;
    ops.push({ t: 'text', x: 90, y: bodyTop + 10, w: 660, h: size * 1.3, text: v, size, color: C.navy, bold: true, serif: true });
    ops.push({ t: 'text', x: 90, y: bodyTop + 10 + size * 1.22, w: 560, h: est(s.stat?.label ?? '', 32, 560) + 8, text: s.stat?.label ?? '', size: 32, color: C.tealDk });
    ops.push({ t: 'rect', x: 690, y: bodyTop + 20, w: 4, h: 300, fill: C.sky });
    if (s.body) ops.push({ t: 'text', x: 740, y: bodyTop + 50, w: 450, h: est(s.body, 28, 450) + 8, text: s.body, size: 28, color: C.navy });
  }

  if (s.layout === 'list') {
    const b = bullets(s.bullets ?? [], 90, bodyTop, 1080, (s.bullets ?? []).length > 4 ? 28 : 32, C.navy, C.teal, 26);
    ops.push(...b.ops);
  }

  if (s.layout === 'twoColumn') {
    const colY = bodyTop - 4, colH = H - colY - 70;
    for (const [k, col] of [['l', s.left], ['r', s.right]] as const) {
      const x = k === 'l' ? 90 : 660;
      ops.push({ t: 'rect', x, y: colY, w: 530, h: colH, fill: C.white, stroke: C.sky, sw: 2, r: 16 });
      ops.push({ t: 'text', x: x + 30, y: colY + 24, w: 470, h: est(col?.heading ?? '', 26, 470) + 6, text: col?.heading ?? '', size: 26, color: C.tealDk, bold: true });
      ops.push({ t: 'rect', x: x + 30, y: colY + 24 + est(col?.heading ?? '', 26, 470) + 8, w: 60, h: 4, fill: C.teal });
      const b = bullets(col?.bullets ?? [], x + 30, colY + 96, 470, 23, C.navy, C.teal, 16);
      ops.push(...b.ops);
    }
  }

  if (s.layout === 'timeline') {
    ops.push({ t: 'rect', x: 970, y: 78, w: 220, h: 38, stroke: C.teal, sw: 2, r: 19 });
    ops.push({ t: 'text', x: 970, y: 78, w: 220, h: 38, text: 'Proposed approach', size: 17, color: C.tealDk, bold: true, align: 'center', valign: 'middle' });
    const steps = s.steps ?? [];
    const cy = bodyTop + 70;
    ops.push({ t: 'rect', x: 150, y: cy + 20, w: 980, h: 4, fill: C.sky });
    steps.forEach((st, k) => {
      const cx = 240 + k * 400;
      ops.push({ t: 'ellipse', x: cx - 24, y: cy, w: 48, h: 48, fill: C.teal });
      ops.push({ t: 'text', x: cx - 24, y: cy, w: 48, h: 48, text: String(k + 1), size: 24, color: C.white, bold: true, align: 'center', valign: 'middle' });
      ops.push({ t: 'text', x: cx - 185, y: cy + 74, w: 370, h: est(st.label, 30, 370, 1.15) + 6, text: st.label, size: 30, color: C.navy, bold: true, serif: true, align: 'center' });
      ops.push({ t: 'text', x: cx - 185, y: cy + 74 + est(st.label, 30, 370, 1.15) + 18, w: 370, h: est(st.detail, 23, 370) + 8, text: st.detail, size: 23, color: C.navy, align: 'center' });
    });
  }

  ops.push(num(C.tealDk));
  return { bg: C.beige, ops };
}
