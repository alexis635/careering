import Anthropic from '@anthropic-ai/sdk';
import { HttpError, MODEL, loadJob, parseJson } from './ai.js';
import { deepNoDash } from '../src/lib/noDash.js';

export interface FoundPerson {
  name: string;
  title: string;
  kind: 'hr' | 'hiring_manager' | 'department_lead';
  email: string;
  source_url: string;
  why: string;
}
export interface PeopleResult {
  company: string;
  people: FoundPerson[];
  email_format: string;
  general_contact: string;
  notes: string;
}

const SYSTEM =
  'You research who to contact about a specific job, using web search on public pages only (company site, careers and team pages, press releases, news, conference bios, public LinkedIn snippets). ' +
  'Find (1) HR, recruiting, or talent acquisition people at the company, and (2) the likely hiring manager or department leader for the role. ' +
  'HARD RULES: never invent a person, title, or email. Only list a person if a page you actually found names them at THIS company, and put that page in source_url. ' +
  'Only fill "email" if that exact address is printed on a page you found; never guess or construct an address, leave it empty otherwise. ' +
  'If you find the company\'s general recruiting or careers email, or a stated email format (for example first.last@domain), report it in general_contact or email_format, and only if a source shows it. ' +
  'Prefer people who are current as of the source. If a source looks old, say so in "why". If you find nobody with confidence, return an empty people list and explain in notes. ' +
  'Respond with ONLY a JSON object: {"people":[{"name","title","kind":"hr"|"hiring_manager"|"department_lead","email","source_url","why"}],"email_format":"","general_contact":"","notes":""}. ' +
  '"why" is one short sentence on why this person fits and how current the source is. At most 8 people, best matches first. NEVER use em dashes or en dashes.';

export async function findPeople(body: { job_id?: number }): Promise<PeopleResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(400, 'ANTHROPIC_API_KEY is not set');
  const job = await loadJob(Number(body.job_id));
  if (!String(job.company || '').trim()) throw new HttpError(400, 'Add the company name to this job first');

  const known = String(job.contact_person || '').trim();
  const parsed = job.posting_parsed?.summary ? `Role summary: ${job.posting_parsed.summary}\n` : '';
  const prompt =
    `Company: ${job.company}\nRole: ${job.role_title}\nLocation: ${job.location}\n${parsed}` +
    (job.source_link ? `Posting link: ${job.source_link}\n` : '') +
    (known ? `A contact already named on the posting: ${known}\n` : '') +
    '\nFind the HR or recruiting contacts and the likely hiring manager or department head for this role.';

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await (client.messages as any).create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (!text.trim() || res.stop_reason === 'max_tokens') throw new HttpError(502, 'The search did not finish this time. Please try again.');
  const out = deepNoDash(parseJson<Partial<PeopleResult>>(text));

  // Keep only people with a real name and a source page, and drop any email that is not shaped like an address.
  const people = (out.people ?? [])
    .filter((p) => p && String(p.name || '').trim() && /^https?:\/\//.test(String(p.source_url || '')))
    .map((p) => ({
      name: String(p.name).trim(),
      title: String(p.title || '').trim(),
      kind: (['hr', 'hiring_manager', 'department_lead'].includes(p.kind) ? p.kind : 'hr') as FoundPerson['kind'],
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email || '').trim()) ? String(p.email).trim() : '',
      source_url: String(p.source_url).trim(),
      why: String(p.why || '').trim(),
    }))
    .slice(0, 8);

  return {
    company: job.company,
    people,
    email_format: String(out.email_format || '').trim(),
    general_contact: String(out.general_contact || '').trim(),
    notes: String(out.notes || '').trim(),
  };
}
