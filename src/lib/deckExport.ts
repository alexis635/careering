import type { DeckSpec } from './deckSpec';

const safeName = (s: string) => s.replace(/[^\w .&'()-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Deck';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadDeckPdf(spec: DeckSpec, title: string) {
  const { deckPdfBlob } = await import('./deckPdf');
  save(await deckPdfBlob(spec), `${safeName(title)}.pdf`);
}
export async function downloadDeckPptx(spec: DeckSpec, title: string) {
  const { deckPptxBlob } = await import('./deckPptx');
  save(await deckPptxBlob(spec), `${safeName(title)}.pptx`);
}
/** The deck as an email attachment (a PDF). */
export async function deckPdfAttachment(spec: DeckSpec, title: string) {
  const { deckPdfBlob } = await import('./deckPdf');
  const bytes = new Uint8Array(await (await deckPdfBlob(spec)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: `${safeName(title)}.pdf`, mime: 'application/pdf', data: btoa(bin) };
}
