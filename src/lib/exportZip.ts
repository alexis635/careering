import { strToU8, zipSync } from 'fflate';
import { noDash } from './noDash';

const safe = (s: string) => s.replace(/[^\w .,&()'-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled';

/** Pack the full export (plain data plus the uploaded files) into one zip. Pure, so it can be tested outside the browser. */
export function buildExportZip(data: { exported_at: string; tables: Record<string, any[]> }, fileBytes: Record<number, Uint8Array>, fileNames: Record<number, string>, workFiles: { id: number; name: string; bytes: Uint8Array }[] = []): Uint8Array {
  const out: Record<string, Uint8Array> = {};
  for (const [name, rows] of Object.entries(data.tables)) out[`data/${name}.json`] = strToU8(JSON.stringify(rows, null, 2));

  // readable copies of the things you would want to read without a computer program
  const lib: any[] = data.tables.library_items ?? [];
  for (const r of lib.filter((x) => x.kind === 'resume')) out[`resumes/${safe(r.title)} (${r.id}).txt`] = strToU8(r.body);
  out['bullet bank.txt'] = strToU8(lib.filter((x) => x.kind === 'bullet').map((b) => `- ${b.body}   [${(b.tags ?? []).join(', ')}]`).join('\n\n'));
  const facts = lib.find((x) => x.title === 'Career facts (source of truth)');
  if (facts) out['career facts.txt'] = strToU8(facts.body);
  out['wins.txt'] = strToU8((data.tables.wins ?? []).filter((w) => !w.deleted_at).map((w) => `${w.title}\n${[w.happened_on, w.employer, w.role].filter(Boolean).join(' | ')}\n${w.description}\nResult: ${w.impact}${w.proof_url ? `\nProof: ${w.proof_url}` : ''}`).join('\n\n----\n\n'));
  for (const c of (data.tables.career_cases ?? []).filter((x) => !x.deleted_at)) out[`cases/${safe(c.title)} (${c.id}).txt`] = strToU8(c.body);
  for (const d of (data.tables.job_documents ?? [])) out[`job documents/${safe(d.title)} (${d.id}).txt`] = strToU8(d.body);
  for (const [id, bytes] of Object.entries(fileBytes)) out[`uploaded documents/${id} ${safe(fileNames[Number(id)] ?? 'file')}`] = bytes;

  for (const f of workFiles) out[`job files/${f.id} ${safe(f.name)}`] = f.bytes;

  out['README.txt'] = strToU8(noDash([
    'Careering export',
    `Created ${data.exported_at}`,
    '',
    'data/            every table as plain JSON (lanes, jobs, notes, emails, wins, roles and pay, and more). Items you deleted are included, marked with a deleted_at date.',
    'resumes/         every resume version as text',
    'cases/           your saved promotion, raise, and review cases',
    'job documents/   every cover letter, email draft, and interview prep sheet',
    'uploaded documents/  the files you uploaded to Career documents (transcript, degree, and so on)',
    'job files/       handbooks and training certificates saved in your Thrive workspaces',
    'wins.txt, bullet bank.txt, career facts.txt   readable copies',
    '',
    'Not included on purpose: your Gmail connection, which is a secret key and stays in the app.',
  ].join('\n')));
  return zipSync(out, { level: 6 });
}
