import Anthropic from '@anthropic-ai/sdk';
import { q } from './db.js';

export const MODEL = process.env.CAREERING_MODEL || 'claude-sonnet-5';

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(400, 'ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const GROUNDING =
  'You help with a job search. Use ONLY facts found in the candidate material provided. ' +
  'Never invent employers, titles, dates, metrics, degrees, or skills. If the material does not support a requirement, say so plainly instead of stretching. ' +
  'Write in a natural, direct voice. Avoid filler and buzzwords.';

export async function ask(system: string, user: string, maxTokens = 2500): Promise<string> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: `${GROUNDING}\n\n${system}`,
    messages: [{ role: 'user', content: user }],
  });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
}

export function parseJson<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new HttpError(502, 'AI returned an unreadable response, try again');
  try { return JSON.parse(m[0]) as T; } catch { throw new HttpError(502, 'AI returned an unreadable response, try again'); }
}

export async function loadJob(id: number) {
  const job = (await q(`SELECT * FROM jobs WHERE id=$1`, [id]))[0];
  if (!job) throw new HttpError(404, 'Job not found');
  return job;
}

/** Library contents formatted for prompts, with ids so the model can point at a resume version. */
export async function libraryContext() {
  const items = await q<any>(`SELECT id, kind, title, body, tags FROM library_items ORDER BY kind, id`);
  const by = (k: string) => items.filter((i) => i.kind === k);
  const fmt = (i: any) => `[#${i.id}]${i.title ? ` ${i.title}` : ''}${i.tags?.length ? ` (tags: ${i.tags.join(', ')})` : ''}\n${i.body}`;
  const section = (label: string, list: any[]) => (list.length ? `## ${label}\n${list.map(fmt).join('\n\n')}` : `## ${label}\n(none yet)`);
  return {
    empty: items.length === 0,
    resumes: by('resume'),
    text: [section('RESUME VERSIONS', by('resume')), section('BULLET BANK', by('bullet')), section('BIOS', by('bio')), section('OUTREACH SNIPPETS', by('snippet'))].join('\n\n'),
  };
}

export function postingOrThrow(job: any) {
  if (!job.posting_text?.trim()) throw new HttpError(400, 'Paste the job posting on the Overview tab first');
  return job.posting_text.slice(0, 20000);
}

export async function saveDoc(jobId: number, kind: string, title: string, body: string) {
  const v = await q(`SELECT coalesce(max(version),0)+1 AS v FROM job_documents WHERE job_id=$1 AND kind=$2`, [jobId, kind]);
  return (
    await q(
      `INSERT INTO job_documents (job_id, kind, title, body, version, source) VALUES ($1,$2,$3,$4,$5,'ai') RETURNING *`,
      [jobId, kind, title, body, v[0].v],
    )
  )[0];
}
