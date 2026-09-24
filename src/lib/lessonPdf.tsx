import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { LessonPlan } from './lessonSpec';

Font.registerHyphenationCallback((word) => [word]);
const NAVY = '#2F4058', TEAL = '#567C8D', SKY = '#C8D9E6', BEIGE = '#F5EFEB';
const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 48, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 10, color: NAVY, lineHeight: 1.4 },
  title: { fontFamily: 'Times-Bold', fontSize: 22, textAlign: 'center', lineHeight: 1.2, marginBottom: 4 },
  meta: { textAlign: 'center', color: TEAL, marginBottom: 12 },
  h: { fontFamily: 'Times-Bold', fontSize: 13, marginTop: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: SKY, paddingBottom: 2 },
  b: { flexDirection: 'row', marginBottom: 2 }, dot: { width: 10 },
  card: { backgroundColor: BEIGE, borderRadius: 4, padding: 7, marginBottom: 6 },
  row: { flexDirection: 'row' }, cell: { flex: 1, borderWidth: 0.5, borderColor: SKY, padding: 3, fontSize: 8.5 },
  label: { fontFamily: 'Helvetica-Bold', color: TEAL },
  foot: { position: 'absolute', bottom: 22, left: 44, right: 44, textAlign: 'center', color: TEAL, fontSize: 8 },
});
const Bul = ({ items }: { items: string[] }) => <>{items.map((t, i) => <View key={i} style={s.b} wrap={false}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{t}</Text></View>)}</>;
const Sec = ({ t, children, show = true }: { t: string; children: any; show?: boolean }) => (show ? <View><Text style={s.h}>{t}</Text>{children}</View> : null);
const Field = ({ l, v }: { l: string; v: string }) => (v ? <Text style={{ marginBottom: 3 }}><Text style={s.label}>{l}  </Text>{v}</Text> : null);

export function LessonDoc({ plan, sub }: { plan: LessonPlan; sub?: boolean }) {
  const n = plan.sub_notes, d = plan.differentiation;
  const meta = [plan.subject, plan.grade && `Grade ${plan.grade}`, `${plan.minutes} minutes`, plan.unit].filter(Boolean).join('  ·  ');
  return (
    <Document title={`${plan.title}${sub ? ' (substitute plan)' : ''}`}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>{plan.title}</Text>
        <Text style={s.meta}>{sub ? 'Substitute plan  ·  ' : ''}{meta}</Text>
        {sub && n ? (
          <>
            <Sec t="What happens today">{<Text>{n.overview}</Text>}</Sec>
            <Sec t="Materials" show={plan.materials.length > 0}><Bul items={plan.materials} /></Sec>
            <Sec t="Minute by minute">{n.routine.split(/\n|\s(?=\d{1,2}\.\s)/).filter(Boolean).map((l, i) => <Text key={i} style={{ marginBottom: 4 }}>{l.trim()}</Text>)}</Sec>
            <Sec t="If students finish early"><Text>{n.if_done_early}</Text></Sec>
            <Sec t="Classroom management"><Text>{n.behavior}</Text></Sec>
            <Sec t="If something goes wrong"><Text>{n.emergency}</Text></Sec>
          </>
        ) : (
          <>
            <Sec t="Standards" show={plan.standards.length > 0}>{plan.standards.map((x, i) => <View key={i} style={s.b}><Text style={s.dot}>•</Text><Text style={{ flex: 1 }}>{x.code ? `${x.code}: ` : ''}{x.text}</Text></View>)}</Sec>
            <Sec t="Big idea" show={!!plan.big_idea}><Text>{plan.big_idea}</Text></Sec>
            <Sec t="Objectives"><Bul items={plan.objectives} /></Sec>
            <Sec t="Vocabulary" show={plan.vocabulary.length > 0}>{plan.vocabulary.map((v, i) => <Text key={i}><Text style={s.label}>{v.term}  </Text>{v.meaning}</Text>)}</Sec>
            <Sec t="Materials" show={plan.materials.length > 0}><Bul items={plan.materials} /></Sec>
            <Sec t="Before class" show={plan.prep.length > 0}><Bul items={plan.prep} /></Sec>
            <Sec t="Opening hook" show={!!plan.hook}><Text>{plan.hook}</Text></Sec>
            <Sec t="The lesson">
              {plan.segments.map((g, i) => (
                <View key={i} style={s.card} wrap={false}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{g.minutes} min  ·  {g.mode && !g.title.toLowerCase().startsWith(g.mode.toLowerCase()) ? `${g.mode}: ` : ''}{g.title}</Text>
                  <Field l="Teacher" v={g.teacher} /><Field l="Students" v={g.students} /><Field l="Watch for" v={g.tips} />
                </View>
              ))}
            </Sec>
            <Sec t="Differentiation" show={[d.support, d.extension, d.multilingual, d.accommodations].some((x) => x.length)}>
              {([['Support', d.support], ['Extension', d.extension], ['Multilingual learners', d.multilingual], ['Accommodations', d.accommodations]] as [string, string[]][]).filter(([, v]) => v.length).map(([l, v]) => <View key={l}><Text style={s.label}>{l}</Text><Bul items={v} /></View>)}
            </Sec>
            <Sec t="Assessment">
              {plan.assessment.formative.length > 0 && <><Text style={s.label}>Checks for understanding</Text><Bul items={plan.assessment.formative} /></>}
              <Field l="Exit ticket" v={plan.assessment.exit_ticket} />
              {plan.assessment.rubric.length > 0 && (
                <View style={{ marginTop: 4 }} wrap={false}>
                  <View style={s.row}>{['Criterion', 'Beginning', 'Developing', 'Proficient', 'Exceeding'].map((h) => <Text key={h} style={{ ...s.cell, ...s.label, backgroundColor: BEIGE }}>{h}</Text>)}</View>
                  {plan.assessment.rubric.map((r, i) => <View key={i} style={s.row}><Text style={{ ...s.cell, fontFamily: 'Helvetica-Bold' }}>{r.criterion}</Text>{r.levels.map((l, k) => <Text key={k} style={s.cell}>{l}</Text>)}</View>)}
                </View>
              )}
            </Sec>
            <Sec t="Closure" show={!!plan.closure}><Text>{plan.closure}</Text></Sec>
            <Sec t="Model example" show={!!plan.exemplar}><Text>{plan.exemplar}</Text></Sec>
            <Sec t="Homework" show={!!plan.homework}><Text>{plan.homework}</Text></Sec>
            <Sec t="Reflection" show={!!plan.reflection}><Text>{plan.reflection}</Text></Sec>
          </>
        )}
        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `${plan.title}  ·  ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
export const lessonPdfBlob = (plan: LessonPlan, sub = false) => pdf(<LessonDoc plan={plan} sub={sub} />).toBlob();
