import type { Slide, DeckSpec } from '../lib/deckSpec';
import { W, H, layoutSlide, type Op } from '../lib/deckLayout';

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const cq = (px: number) => `${(px / W) * 100}cqw`;

function draw(op: Op, k: number) {
  const box = { position: 'absolute' as const, left: pct(op.x, W), top: pct(op.y, H), width: pct(op.w, W), height: pct(op.h, H) };
  if (op.t === 'rect') return <div key={k} style={{ ...box, background: op.fill, border: op.stroke ? `${cq(op.sw ?? 1)} solid ${op.stroke}` : undefined, borderRadius: op.r ? cq(op.r) : undefined, boxSizing: 'border-box' }} />;
  if (op.t === 'ellipse') return <div key={k} style={{ ...box, background: op.fill, border: op.stroke ? `${cq(op.sw ?? 1)} solid ${op.stroke}` : undefined, borderRadius: '50%', boxSizing: 'border-box' }} />;
  return (
    <div key={k} style={{ ...box, display: 'flex', alignItems: op.valign === 'middle' ? 'center' : op.valign === 'bottom' ? 'flex-end' : 'flex-start' }}>
      <div style={{ width: '100%', fontSize: cq(op.size), color: op.color, textAlign: op.align ?? 'left', fontWeight: op.bold || op.serif ? 700 : 400, fontFamily: op.serif ? '"Playfair Display", Georgia, serif' : 'Inter, Arial, sans-serif', lineHeight: op.serif ? 1.12 : 1.28 }}>{op.text}</div>
    </div>
  );
}

/** A 16:9 slide drawn in the browser from the same layout the PDF and PowerPoint use. */
export default function SlidePreview({ slide, index, total, deck }: { slide: Slide; index: number; total: number; deck: Pick<DeckSpec, 'subtitle'> }) {
  const { bg, ops } = layoutSlide(slide, index, total, deck);
  return (
    <div style={{ containerType: 'inline-size', width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: bg, overflow: 'hidden', borderRadius: 6, border: '1px solid #C8D9E6' }}>{ops.map(draw)}</div>
    </div>
  );
}
