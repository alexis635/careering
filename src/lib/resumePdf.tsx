import { Document, Font, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

// Never split words across lines (no "engage-ment").
Font.registerHyphenationCallback((word) => [word]);

/*
 Resume text format (what the AI writes and what you can edit):
   Line 1            Name
   Line 2            optional headline (any line without an @)
   Line 3            contact line (contains an @)
   > text            small line under an entry (organization, location)
   ## SECTION        section heading
   ### Left | Right  entry line, right side is right-aligned (e.g. "Role, Company | 2021 to 2024")
   - bullet          bullet point
   anything else     paragraph text
*/

const NAVY = '#2F4058';
const TEAL = '#567C8D';

export interface Layout { fs: number; g: number }   // fs = body font size (pt), g = spacing multiplier

const mk = ({ fs, g }: Layout) => StyleSheet.create({
  page: { paddingTop: 22 + 8 * (g - 1), paddingBottom: 18 + 8 * (g - 1), paddingHorizontal: 38, fontFamily: 'Helvetica', fontSize: fs, color: '#1f2937', lineHeight: Math.min(1.22 + 0.03 * (g - 1), 1.34) },
  name: { fontFamily: 'Times-Bold', fontSize: fs * 2.5, lineHeight: 1.1, color: NAVY, marginBottom: 2 * g },
  headline: { fontSize: fs * 1.25, color: TEAL, fontFamily: 'Helvetica-Bold', marginBottom: 2 * g },
  contact: { fontSize: fs, color: '#4b5563', marginBottom: 6 * g },
  sub: { fontSize: fs, color: TEAL, marginBottom: 1 * g },
  section: { fontFamily: 'Helvetica-Bold', fontSize: fs, letterSpacing: 1.2, color: TEAL, marginTop: 7 * g, paddingBottom: 1.5 * g, borderBottomWidth: 0.75, borderBottomColor: '#C8D9E6', marginBottom: 3 * g },
  entry: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 * g },
  entryLeft: { fontFamily: 'Helvetica-Bold', color: NAVY, flexShrink: 1, paddingRight: 8 },
  entryRight: { color: TEAL },
  bullet: { flexDirection: 'row', marginTop: 1 * g, paddingLeft: 6 },
  dot: { width: 9 },
  bulletText: { flex: 1 },
  para: { marginTop: 2 * g },
});

type Block =
  | { t: 'name'; text: string } | { t: 'headline'; text: string } | { t: 'sub'; text: string } | { t: 'contact'; text: string } | { t: 'section'; text: string }
  | { t: 'entry'; left: string; right: string } | { t: 'bullet'; text: string } | { t: 'para'; text: string };

export function parseResume(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length && !lines[i]) i++;
  if (i < lines.length && !/^(#|-)/.test(lines[i])) out.push({ t: 'name', text: lines[i++].replace(/^\*+|\*+$/g, '') });
  for (let k = 0; k < 2; k++) {
    while (i < lines.length && !lines[i]) i++;
    if (i < lines.length && !/^(#|-|>)/.test(lines[i]) && (k === 1 || lines[i].includes('@') || (lines[i + 1] ?? '').includes('@') || (lines[i + 2] ?? '').includes('@')))
      out.push({ t: lines[i].includes('@') ? 'contact' : 'headline', text: lines[i++] });
  }
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (l.startsWith('### ')) { const [a, ...b] = l.slice(4).split('|'); out.push({ t: 'entry', left: a.trim(), right: b.join('|').trim() }); }
    else if (l.startsWith('## ')) out.push({ t: 'section', text: l.slice(3).toUpperCase() });
    else if (l.startsWith('> ')) out.push({ t: 'sub', text: l.slice(2) });
    else if (/^[-•*]\s+/.test(l)) out.push({ t: 'bullet', text: l.replace(/^[-•*]\s+/, '') });
    else out.push({ t: 'para', text: l });
  }
  return out;
}

export function ResumeDoc({ text, layout = { fs: 8.8, g: 1 } }: { text: string; layout?: Layout }) {
  const s = mk(layout);
  const blocks = parseResume(text);
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {blocks.map((b, i) => {
          switch (b.t) {
            case 'name': return <Text key={i} style={s.name}>{b.text}</Text>;
            case 'headline': return <Text key={i} style={s.headline}>{b.text}</Text>;
            case 'sub': return <Text key={i} style={s.sub}>{b.text}</Text>;
            case 'contact': return <Text key={i} style={s.contact}>{b.text}</Text>;
            case 'section': return <Text key={i} style={s.section} minPresenceAhead={40}>{b.text}</Text>;
            case 'entry': return (
              <View key={i} style={s.entry} wrap={false} minPresenceAhead={48}>
                <Text style={s.entryLeft}>{b.left}</Text>
                {b.right ? <Text style={s.entryRight}>{b.right}</Text> : null}
              </View>
            );
            case 'bullet': return (
              <View key={i} style={s.bullet} wrap={false}>
                <Text style={s.dot}>•</Text>
                <Text style={s.bulletText}>{b.text}</Text>
              </View>
            );
            default: return <Text key={i} style={s.para}>{b.text}</Text>;
          }
        })}
      </Page>
    </Document>
  );
}

export type RenderFn = (layout: Layout) => Promise<Uint8Array>;

/** Number of pages in a rendered PDF (react-pdf writes an uncompressed page tree). */
export function pageCount(bytes: Uint8Array): number {
  const txt = new TextDecoder('latin1').decode(bytes);
  const counts = [...txt.matchAll(/\/Count (\d+)/g)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : 1;
}

/**
 * Smart fit: find the largest text size that keeps the resume on one page, then spread any
 * leftover space into breathing room, so there is never a big empty gap at the bottom.
 * If the content cannot fit one page even at the smallest size, it falls back to a clean two-page layout.
 */
export async function fitResume(render: RenderFn): Promise<{ bytes: Uint8Array; layout: Layout; pages: number }> {
  const FS_MIN = 8, FS_MAX = 10.5, G_MAX = 2.6;
  const attempt = async (layout: Layout) => { const bytes = await render(layout); return { bytes, layout, pages: pageCount(bytes) }; };

  // phase 1: biggest font that fits on one page at normal spacing
  let lo = FS_MIN, hi = FS_MAX;
  let best = await attempt({ fs: lo, g: 1 });
  if (best.pages > 1) return best;                    // too long for one page: accept two clean pages
  const top = await attempt({ fs: hi, g: 1 });
  if (top.pages === 1) best = top;
  else {
    for (let n = 0; n < 5; n++) {
      const mid = (lo + hi) / 2;
      const r = await attempt({ fs: mid, g: 1 });
      if (r.pages === 1) { best = r; lo = mid; } else hi = mid;
    }
  }
  // phase 2: use leftover room to add spacing, up to a tasteful cap
  let glo = 1, ghi = G_MAX;
  const gtop = await attempt({ fs: best.layout.fs, g: ghi });
  if (gtop.pages === 1) return gtop;
  for (let n = 0; n < 5; n++) {
    const mid = (glo + ghi) / 2;
    const r = await attempt({ fs: best.layout.fs, g: mid });
    if (r.pages === 1) { best = r; glo = mid; } else ghi = mid;
  }
  return best;
}

export async function resumeBlob(text: string): Promise<Blob> {
  const { bytes } = await fitResume(async (layout) => new Uint8Array(await (await pdf(<ResumeDoc text={text} layout={layout} />).toBlob()).arrayBuffer()));
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export async function downloadResumePdf(text: string, filename: string) {
  const blob = await resumeBlob(text);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
