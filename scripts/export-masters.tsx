// Usage: npm run export-masters -- "<output folder>" "<file name prefix>"
// Renders every non-archived "Master:" resume in the Library to a smart-fit one page PDF.
import { mkdirSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { ResumeDoc, fitResume } from '../src/lib/resumePdf';

const [outDir, prefix = 'Resume'] = process.argv.slice(2);
if (!outDir) { console.error('Give an output folder'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`SELECT title, body FROM library_items WHERE kind='resume' AND title LIKE 'Master:%' AND NOT ('archived' = ANY(tags)) ORDER BY id`;
for (const r of rows) {
  const name = `${prefix} - ${r.title.replace(/^Master:\s*/, '')}`.replace(/[\/:*?"<>|]/g, '');
  const fit = await fitResume(async (layout) => new Uint8Array(await renderToBuffer(React.createElement(ResumeDoc, { text: r.body, layout }) as any)));
  writeFileSync(`${outDir}/${name}.pdf`, fit.bytes);
  console.log(`${name}.pdf  pages ${fit.pages}  font ${fit.layout.fs.toFixed(1)}pt`);
}
