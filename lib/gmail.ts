import { createHmac, timingSafeEqual } from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './ai.js';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];

export function redirectUri(host: string) {
  const local = host.startsWith('localhost') || host.startsWith('127.');
  return `${local ? 'http' : 'https'}://${host}/api/gmail/callback`;
}

function cfg() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new HttpError(400, 'Google credentials are not set');
  return { id, secret };
}

const sign = (v: string) => createHmac('sha256', process.env.SESSION_SECRET || '').update(v).digest('hex');
export function makeState() { const n = Date.now().toString(36); return `${n}.${sign(n)}`; }
export function checkState(s: string) {
  const [n, sig] = (s || '').split('.');
  if (!n || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(n));
  return a.length === b.length && timingSafeEqual(a, b) && Date.now() - parseInt(n, 36) < 10 * 60_000;
}

export function authUrl(host: string) {
  const { id } = cfg();
  const p = new URLSearchParams({
    client_id: id, redirect_uri: redirectUri(host), response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', state: makeState(), login_hint: 'alexisdgranville@gmail.com',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(params: Record<string, string>) {
  const { id, secret } = cfg();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new HttpError(502, `Google: ${data.error_description || data.error}`);
  return data;
}

export async function handleCallback(code: string, host: string) {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(host) });
  if (!t.refresh_token) throw new HttpError(400, 'Google did not return a refresh token. Remove Careering from your Google account permissions and reconnect.');
  const info: any = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
  await q(`INSERT INTO settings (key, value) VALUES ('gmail', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [
    JSON.stringify({ refresh_token: t.refresh_token, email: info.emailAddress || '' }),
  ]);
}

export async function gmailStatus() {
  const r = (await q<any>(`SELECT value FROM settings WHERE key='gmail'`))[0];
  return { connected: !!r, email: r?.value?.email ?? null };
}

async function accessToken(): Promise<string> {
  const r = (await q<any>(`SELECT value FROM settings WHERE key='gmail'`))[0];
  if (!r) throw new HttpError(400, 'Gmail is not connected');
  return (await tokenCall({ grant_type: 'refresh_token', refresh_token: r.value.refresh_token })).access_token;
}

async function gmail(path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data: any = await res.json();
  if (!res.ok) throw new HttpError(502, `Gmail: ${data.error?.message || res.statusText}`);
  return data;
}

const b64url = (s: string) => Buffer.from(s).toString('base64url');
const encHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

export async function sendEmail(jobId: number, to: string, subject: string, body: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'Recipient email looks invalid');
  const { email } = await gmailStatus();
  const raw = [`To: ${to}`, `Subject: ${encHeader(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', body].join('\r\n');
  const sent = await gmail('messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(raw) }) });
  return (
    await q(
      `INSERT INTO job_emails (job_id, gmail_thread_id, gmail_message_id, direction, from_addr, to_addr, subject, body)
       VALUES ($1,$2,$3,'sent',$4,$5,$6,$7) RETURNING *`,
      [jobId, sent.threadId, sent.id, email || '', to, subject, body],
    )
  )[0];
}

function header(msg: any, name: string) {
  return msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name)?.value ?? '';
}
function plainBody(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const p of part.parts || []) { const t = plainBody(p); if (t) return t; }
  return '';
}

/** Only reads threads this app created (thread ids stored on sent job_emails). Nothing else in the inbox is fetched. */
export async function syncReplies(jobId: number) {
  const threads = await q<any>(`SELECT DISTINCT gmail_thread_id FROM job_emails WHERE job_id=$1 AND direction='sent' AND gmail_thread_id IS NOT NULL`, [jobId]);
  const me = ((await gmailStatus()).email || '').toLowerCase();
  let added = 0;
  for (const { gmail_thread_id } of threads) {
    const t = await gmail(`threads/${gmail_thread_id}?format=full`);
    for (const m of t.messages || []) {
      const from = header(m, 'from');
      if (me && from.toLowerCase().includes(me)) continue;
      const body = plainBody(m.payload).split(/\r?\nOn .* wrote:/)[0].trim() || m.snippet || '';
      const ins = await q(
        `INSERT INTO job_emails (job_id, gmail_thread_id, gmail_message_id, direction, from_addr, to_addr, subject, body, sent_at)
         VALUES ($1,$2,$3,'received',$4,$5,$6,$7,to_timestamp($8::double precision / 1000)) ON CONFLICT (gmail_message_id) DO NOTHING RETURNING id`,
        [jobId, gmail_thread_id, m.id, from, header(m, 'to'), header(m, 'subject'), body, Number(m.internalDate)],
      );
      added += ins.length;
    }
  }
  return { added };
}
