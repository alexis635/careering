import { HttpError, ask, loadJob } from './ai.js';
import { q } from './db.js';

// Job boards and applicant systems: a link to one of these says nothing about the company's own website.
const BOARDS = /(linkedin|indeed|glassdoor|ziprecruiter|paylocity|workday|myworkdayjobs|greenhouse|lever|ashbyhq|icims|smartrecruiters|taleo|jobvite|bamboohr|breezy|applytojob|governmentjobs|edjoin|schoolspring|handshake|wellfound|monster|simplyhired|google|bit\.ly)\./i;
const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

const clean = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#\s]/)[0];

/** Finds the company's own website once, saves it on the job, and reuses it after that. The icon itself is loaded by the browser. */
export async function resolveLogo(jobId: number) {
  const job = await loadJob(jobId);
  if (job.company_domain || !job.company?.trim() || job.type === 'logistics') return job;
  let domain = '';
  try {
    const host = clean(new URL(job.source_link).hostname);
    if (host && !BOARDS.test(host + '.')) domain = host.split('.').slice(-2).join('.');
  } catch { /* no usable link */ }
  if (!domain) {
    const out = await ask(
      'Reply with ONLY the main website domain of the named company (for example stripe.com), no words, no URL path. If you are not confident which company it is, reply with UNKNOWN.',
      `Company: ${job.company}\nRole: ${job.role_title}\nLocation: ${job.location || ''}`, 6000);
    const d = clean(out);
    if (DOMAIN.test(d)) domain = d;
  }
  if (!domain) throw new HttpError(404, 'Could not work out the company website');
  // only keep it if the icon service actually knows this site
  const ok = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`).then((r) => r.ok).catch(() => false);
  if (!ok) throw new HttpError(404, 'No icon found for that website');
  return (await q(`UPDATE jobs SET company_domain=$2 WHERE id=$1 RETURNING *`, [jobId, domain]))[0];
}
