import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

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

const s = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 20, paddingHorizontal: 38, fontFamily: 'Helvetica', fontSize: 8.8, color: '#1f2937', lineHeight: 1.24 },
  name: { fontFamily: 'Times-Bold', fontSize: 22, lineHeight: 1.1, color: NAVY, marginBottom: 2 },
  headline: { fontSize: 11, color: TEAL, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  contact: { fontSize: 9, color: '#4b5563', marginBottom: 6 },
  sub: { fontSize: 9, color: TEAL, marginBottom: 1 },
  section: { fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 1.2, color: TEAL, marginTop: 7, paddingBottom: 1.5, borderBottomWidth: 0.75, borderBottomColor: '#C8D9E6', marginBottom: 3 },
  entry: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  entryLeft: { fontFamily: 'Helvetica-Bold', color: NAVY, flexShrink: 1, paddingRight: 8 },
  entryRight: { color: TEAL },
  bullet: { flexDirection: 'row', marginTop: 1, paddingLeft: 6 },
  dot: { width: 9 },
  bulletText: { flex: 1 },
  para: { marginTop: 2 },
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

export function ResumeDoc({ text }: { text: string }) {
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

export async function resumeBlob(text: string): Promise<Blob> {
  return pdf(<ResumeDoc text={text} />).toBlob();
}

export async function downloadResumePdf(text: string, filename: string) {
  const blob = await resumeBlob(text);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
