// Resume and cover letter PDFs on the server, the same smart-fit layouts as the Download PDF button.
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { LetterDoc, ResumeDoc, fitResume } from '../src/lib/resumePdf.js';

export async function documentPdf(kind: 'resume' | 'letter', text: string): Promise<{ bytes: Buffer; pages: number }> {
  const Doc: any = kind === 'letter' ? LetterDoc : ResumeDoc;
  const fit = await fitResume(async (layout) => new Uint8Array(await renderToBuffer(React.createElement(Doc, { text, layout }) as any)),
    kind === 'letter' ? { fsMin: 10, fsMax: 12.5, gMax: 2.2 } : {});
  return { bytes: Buffer.from(fit.bytes), pages: fit.pages };
}
