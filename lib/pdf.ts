// Resume PDFs on the server, the same smart-fit one page layout as the Download PDF button.
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ResumeDoc, fitResume } from '../src/lib/resumePdf.js';

export async function resumePdf(text: string): Promise<{ bytes: Buffer; pages: number }> {
  const fit = await fitResume(async (layout) => new Uint8Array(await renderToBuffer(React.createElement(ResumeDoc, { text, layout }) as any)));
  return { bytes: Buffer.from(fit.bytes), pages: fit.pages };
}
