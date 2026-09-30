import { HttpError } from './ai.js';

const BLOCKED = /^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i;

function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

/** Many job boards embed the posting as JSON-LD; that is the cleanest source when present. */
function fromJsonLd(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const list = Array.isArray(data) ? data : data['@graph'] ?? [data];
      const jp = list.find((x: any) => x?.['@type'] === 'JobPosting' || (Array.isArray(x?.['@type']) && x['@type'].includes('JobPosting')));
      if (jp?.description) {
        const org = jp.hiringOrganization?.name ? `Company: ${jp.hiringOrganization.name}\n` : '';
        const loc = jp.jobLocation?.address ? `Location: ${[jp.jobLocation.address.addressLocality, jp.jobLocation.address.addressRegion].filter(Boolean).join(', ')}\n` : '';
        return `${jp.title ?? ''}\n${org}${loc}\n${htmlToText(String(jp.description))}`.trim();
      }
    } catch { /* keep looking */ }
  }
  return null;
}

/** Bot-check and error pages come back "successfully" but are not postings. */
function looksBlocked(text: string) {
  return text.length < 6000 && /just a moment|verify you are (a )?human|are you a robot|captcha|access denied|attention required|enable javascript and cookies|request blocked|403 forbidden|unusual traffic/i.test(text);
}

/** Greenhouse postings, including company career pages that embed a Greenhouse board with ?gh_jid=. Uses Greenhouse's public job API. */
async function fromGreenhouse(url: URL, html?: string): Promise<string | null> {
  let board = '';
  let jobId = url.searchParams.get('gh_jid') ?? '';
  const direct = url.hostname.endsWith('greenhouse.io') ? url.pathname.match(/^\/([\w-]+)\/jobs\/(\d+)/) : null;
  if (direct) { board = direct[1]; jobId = direct[2]; }
  if (!jobId || !/^\d+$/.test(jobId)) return null;
  if (!board && html) board = html.match(/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([\w-]+)/i)?.[1] ?? '';
  if (!board) return null;
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const d: any = await r.json();
    if (!d?.content) return null;
    const body = htmlToText(String(d.content).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    return `${d.title ?? ''}\n${d.location?.name ? `Location: ${d.location.name}\n` : ''}\n${body}`.trim();
  } catch { return null; }
}

/** A careers page that embeds a Lever or Greenhouse board lists many jobs and is not one posting. Say which roles are open so the right link can be added. */
async function openRoles(html: string): Promise<string | null> {
  try {
    const lever = html.match(/(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([\w-]+)/i)?.[1];
    if (lever) {
      const r = await fetch(`https://api.lever.co/v0/postings/${lever}?mode=json`, { signal: AbortSignal.timeout(15000) });
      const list: any[] = r.ok ? await r.json() : [];
      if (list.length) return list.slice(0, 12).map((x) => `${x.text}${x.categories?.location ? ` (${x.categories.location})` : ''}: ${x.hostedUrl}`).join('\n');
    }
    const gh = html.match(/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([\w-]+)/i)?.[1];
    if (gh) {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${gh}/jobs`, { signal: AbortSignal.timeout(15000) });
      const list: any[] = r.ok ? (await r.json()).jobs ?? [] : [];
      if (list.length) return list.slice(0, 12).map((x) => `${x.title}${x.location?.name ? ` (${x.location.name})` : ''}: ${x.absolute_url}`).join('\n');
    }
  } catch { /* fall back to the generic message */ }
  return null;
}

export async function fetchPosting(link: string): Promise<string> {
  let url: URL;
  try { url = new URL(link); } catch { throw new HttpError(400, 'Add the posting link on the Overview tab first'); }
  if (!/^https?:$/.test(url.protocol) || BLOCKED.test(url.hostname)) throw new HttpError(400, 'That link cannot be fetched');
  // 0. Direct Greenhouse links need no page fetch at all.
  const gh = await fromGreenhouse(url);
  if (gh && gh.length >= 500) return gh.slice(0, 20000);
  // 1. Read the page directly.
  let text = '';
  let failure = 'Could not reach that page.';
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml' } });
    if (res.ok) {
      const html = (await res.text()).slice(0, 2_000_000);
      text = fromJsonLd(html) ?? (await fromGreenhouse(url, html)) ?? htmlToText(html);
      if (looksBlocked(text)) { text = ''; failure = 'That site shows a robot check, so it cannot be read automatically.'; }
      else if (/lever\.co|greenhouse\.io/i.test(html) && !url.searchParams.get('gh_jid') && !/lever\.co|greenhouse\.io/i.test(url.hostname)) {
        const roles = await openRoles(html);
        if (roles) throw new HttpError(422, `That link is a careers page, not one job. Open roles right now:\n${roles}\nAdd the link for the one you want.`);
      }
      if (text.length < 500) failure = 'That page needs a login or loads its content with scripts, so it could not be read.';
    } else failure = `That site refused the request (${res.status}).`;
  } catch (e) { if (e instanceof HttpError) throw e; /* otherwise fall through to the fallback */ }

  // 2. Optional fallback for blocked or script-rendered pages. Off unless POSTING_READER=jina:
  //    it sends the (public) job URL to r.jina.ai, which returns the page as text.
  if (text.length < 500 && process.env.POSTING_READER === 'jina') {
    try {
      const r = await fetch(`https://r.jina.ai/${url.toString()}`, { signal: AbortSignal.timeout(25000), headers: { Accept: 'text/plain' } });
      if (r.ok) { const t = (await r.text()).trim(); if (!looksBlocked(t)) text = t; else failure = 'That site shows a robot check, so it cannot be read automatically.'; }
    } catch { /* keep the original failure message */ }
  }
  if (text.length < 500 && /(^|\.)indeed\.com$/i.test(url.hostname)) {
    throw new HttpError(422, 'Indeed blocks automatic reading. Open the job on Indeed, copy its description, and paste it under Full posting, then click Analyze. If the job has an "Apply on company site" link, that link usually works here.');
  }
  if (text.length < 500) throw new HttpError(422, `${failure} Paste the posting text instead.`);
  return text.slice(0, 20000);
}
