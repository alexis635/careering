import { Document, Font, Page, Text, View, pdf } from '@react-pdf/renderer';
import type { DeckSpec } from './deckSpec';
import { W, H, layoutSlide, type Op } from './deckLayout';

// never split a word across two lines
Font.registerHyphenationCallback((word) => [word]);

const K = 0.75;   // 1280 px canvas onto a 960 pt page

const draw = (op: Op, key: number) => {
  const box = { position: 'absolute' as const, left: op.x * K, top: op.y * K, width: op.w * K, height: op.h * K };
  if (op.t === 'rect') return <View key={key} style={{ ...box, backgroundColor: op.fill, borderColor: op.stroke, borderWidth: op.stroke ? (op.sw ?? 1) * K : 0, borderRadius: (op.r ?? 0) * K }} />;
  if (op.t === 'ellipse') return <View key={key} style={{ ...box, backgroundColor: op.fill, borderColor: op.stroke, borderWidth: op.stroke ? (op.sw ?? 1) * K : 0, borderRadius: 9999 }} />;
  const family = op.serif ? 'Times-Bold' : op.bold ? 'Helvetica-Bold' : 'Helvetica';
  const justify = op.valign === 'middle' ? 'center' : op.valign === 'bottom' ? 'flex-end' : 'flex-start';
  return (
    <View key={key} style={{ ...box, justifyContent: justify }}>
      <Text style={{ fontFamily: family, fontSize: op.size * K, color: op.color, textAlign: op.align ?? 'left', lineHeight: op.serif ? 1.12 : 1.28 }}>{op.text}</Text>
    </View>
  );
};

export function DeckDoc({ spec }: { spec: DeckSpec }) {
  return (
    <Document title={spec.title}>
      {spec.slides.map((s, i) => {
        const { bg, ops } = layoutSlide(s, i, spec.slides.length, spec);
        return <Page key={i} size={[W * K, H * K]} style={{ backgroundColor: bg }}>{ops.map(draw)}</Page>;
      })}
    </Document>
  );
}

export async function deckPdfBlob(spec: DeckSpec): Promise<Blob> {
  return pdf(<DeckDoc spec={spec} />).toBlob();
}
