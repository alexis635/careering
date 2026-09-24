import { api } from '../api';

/** Build and download the full export zip: all data as plain files, plus every uploaded document. */
export async function exportEverything(status: (s: string) => void) {
  status('Gathering your data…');
  const data = await api.get<{ exported_at: string; tables: Record<string, any[]>; files: { id: number; file_name: string }[] }>('export');
  const bytes: Record<number, Uint8Array> = {}, names: Record<number, string> = {};
  let n = 0;
  for (const f of data.files) {
    status(`Adding your documents (${++n} of ${data.files.length})…`);
    const r = await fetch(`/api/vault/docs/${f.id}/file`, { credentials: 'same-origin' });
    if (r.ok) { bytes[f.id] = new Uint8Array(await r.arrayBuffer()); names[f.id] = f.file_name; }
  }
  status('Packing the zip…');
  const { buildExportZip } = await import('./exportZip');
  const zip = buildExportZip(data, bytes, names);
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url; a.download = `careering-export-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  status('');
}
