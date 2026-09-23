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

export async function fetchPosting(link: string): Promise<string> {
  let url: URL;
  try { url = new URL(link); } catch { throw new HttpError(400, 'Add the posting link on the Overview tab first'); }
  if (!/^https?:$/.test(url.protocol) || BLOCKED.test(url.hostname)) throw new HttpError(400, 'That link cannot be fetched');
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml' } });
  } catch { throw new HttpError(422, 'Could not reach that page. Paste the posting text instead.'); }
  if (!res.ok) throw new HttpError(422, `That site refused the request (${res.status}). Paste the posting text instead.`);
  const html = (await res.text()).slice(0, 2_000_000);
  const text = fromJsonLd(html) ?? htmlToText(html);
  if (text.length < 500) throw new HttpError(422, 'That page needs a login or loads its content with scripts, so it could not be read. Paste the posting text instead.');
  return text.slice(0, 20000);
}
