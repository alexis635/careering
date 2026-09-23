import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

/*
 Resume text format (what the AI writes and what you can edit):
   Line 1            Name
   Line 2            contact line (email · phone · city · link)
   ## SECTION        section heading
   ### Left | Right  entry line, right side is right-aligned (e.g. "Role, Company | 2021 to 2024")
   - bullet          bullet point
   anything else     paragraph text
*/

const NAVY = '#2F4058';
const TEAL = '#567C8D';

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 9.5, color: '#1f2937', lineHeight: 1.35 },
  name: { fontFamily: 'Times-Bold', fontSize: 24, lineHeight: 1.15, color: NAVY, marginBottom: 4 },
  contact: { fontSize: 9, color: TEAL, marginBottom: 6 },
  section: { fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 1.2, color: TEAL, marginTop: 10, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: '#C8D9E6', marginBottom: 5 },
  entry: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  entryLeft: { fontFamily: 'Helvetica-Bold', color: NAVY, flexShrink: 1, paddingRight: 8 },
  entryRight: { color: TEAL },
  bullet: { flexDirection: 'row', marginTop: 1.5, paddingLeft: 6 },
  dot: { width: 9 },
  bulletText: { flex: 1 },
  para: { marginTop: 2 },
});

type Block =
  | { t: 'name'; text: string } | { t: 'contact'; text: string } | { t: 'section'; text: string }
  | { t: 'entry'; left: string; right: string } | { t: 'bullet'; text: string } | { t: 'para'; text: string };

export function parseResume(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length && !lines[i]) i++;
  if (i < lines.length && !/^(#|-)/.test(lines[i])) out.push({ t: 'name', text: lines[i++].replace(/^\*+|\*+$/g, '') });
  if (i < lines.length && lines[i] && !/^(#|-)/.test(lines[i])) out.push({ t: 'contact', text: lines[i++] });
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (l.startsWith('### ')) { const [a, ...b] = l.slice(4).split('|'); out.push({ t: 'entry', left: a.trim(), right: b.join('|').trim() }); }
    else if (l.startsWith('## ')) out.push({ t: 'section', text: l.slice(3).toUpperCase() });
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
            case 'contact': return <Text key={i} style={s.contact}>{b.text}</Text>;
            case 'section': return <Text key={i} style={s.section}>{b.text}</Text>;
            case 'entry': return (
              <View key={i} style={s.entry} wrap={false}>
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
