import type { DeckSpec } from './deckSpec';
import { layoutSlide } from './deckLayout';

const inch = (px: number) => px / 96;   // the 1280 px canvas is 13.333 in wide
const hex = (c?: string) => (c ? c.replace('#', '') : undefined);

/** An editable PowerPoint file (opens in Keynote and PowerPoint) with speaker notes. Fonts are Georgia and Arial so they exist on any computer. */
export async function buildPptx(spec: DeckSpec) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = spec.title;
  spec.slides.forEach((s, i) => {
    const { bg, ops } = layoutSlide(s, i, spec.slides.length, spec);
    const slide = pptx.addSlide();
    slide.background = { color: hex(bg)! };
    for (const op of ops) {
      const pos = { x: inch(op.x), y: inch(op.y), w: inch(op.w), h: inch(op.h) };
      if (op.t === 'rect') slide.addShape(op.r ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { ...pos, fill: op.fill ? { color: hex(op.fill)! } : { type: 'none' }, line: op.stroke ? { color: hex(op.stroke)!, width: (op.sw ?? 1) * 0.75 } : { type: 'none' }, ...(op.r ? { rectRadius: Math.min(inch(op.r), 0.25) } : {}) } as any);
      else if (op.t === 'ellipse') slide.addShape(pptx.ShapeType.ellipse, { ...pos, fill: op.fill ? { color: hex(op.fill)! } : { type: 'none' }, line: op.stroke ? { color: hex(op.stroke)!, width: (op.sw ?? 1) * 0.75 } : { type: 'none' } } as any);
      else slide.addText(op.text, { ...pos, fontFace: op.serif ? 'Georgia' : 'Arial', fontSize: Math.round(op.size * 0.75), bold: !!(op.bold || op.serif), color: hex(op.color)!, align: op.align ?? 'left', valign: op.valign ?? 'top', margin: 0, lineSpacingMultiple: 1.05, fit: 'none' } as any);
    }
    if (s.notes) slide.addNotes(s.notes);
  });
  return pptx;
}

export async function deckPptxBlob(spec: DeckSpec): Promise<Blob> {
  const pptx = await buildPptx(spec);
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

export async function deckPptxBase64(spec: DeckSpec): Promise<string> {
  const pptx = await buildPptx(spec);
  return (await pptx.write({ outputType: 'base64' })) as string;
}
