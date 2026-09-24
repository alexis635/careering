import { createHmac, timingSafeEqual } from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './ai.js';
import { noDash } from '../src/lib/noDash.js';

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

export interface Attachment { name: string; mime: string; data: string }   // data is base64
const OK_MIME = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain|image\/(png|jpeg))$/;
const wrap76 = (b64: string) => b64.replace(/(.{76})/g, '$1\r\n');

export function buildMime(to: string, subject: string, body: string, attachments: Attachment[]): string {
  const boundary = `careering_${Date.now().toString(36)}`;
  const lines = [`To: ${to}`, `Subject: ${encHeader(subject)}`, 'MIME-Version: 1.0'];
  if (attachments.length) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(body).toString('base64')));
    for (const a of attachments) {
      const fname = a.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
      lines.push(`--${boundary}`, `Content-Type: ${a.mime}; name="${fname}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${fname}"`, '', wrap76(a.data));
    }
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8', '', body);
  }
  return lines.join('\r\n');
}

export async function sendEmail(jobId: number, to: string, subject: string, body: string, attachments: Attachment[] = []) {
  subject = noDash(subject); body = noDash(body);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'Recipient email looks invalid');
  if (attachments.length > 5) throw new HttpError(400, 'Attach at most 5 files');
  if (attachments.reduce((n, a) => n + a.data.length, 0) > 4_000_000) throw new HttpError(400, 'Attachments are too large (about 3 MB total)');
  for (const a of attachments) if (!OK_MIME.test(a.mime)) throw new HttpError(400, `${a.name}: only PDF, Word, text, PNG, or JPG files can be attached`);
  const { email } = await gmailStatus();
  const raw = buildMime(to, subject, body, attachments);
  const sent = await gmail('messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(raw) }) });
  return (
    await q(
      `INSERT INTO job_emails (job_id, gmail_thread_id, gmail_message_id, direction, from_addr, to_addr, subject, body, attachments)
       VALUES ($1,$2,$3,'sent',$4,$5,$6,$7,$8) RETURNING *`,
      [jobId, sent.threadId, sent.id, email || '', to, subject, body, JSON.stringify(attachments.map((a) => a.name))],
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

/** Check every job that has an app-started thread. Still never reads anything outside those threads. */
export async function syncAll() {
  const jobs = await q<any>(`SELECT DISTINCT e.job_id FROM job_emails e JOIN jobs j ON j.id = e.job_id WHERE j.deleted_at IS NULL AND e.direction='sent' AND e.gmail_thread_id IS NOT NULL`);
  let added = 0;
  for (const { job_id } of jobs) added += (await syncReplies(job_id)).added;
  return { added, jobs: jobs.length };
}

/** Send a plain note to the connected address itself (used for the weekly summary). Not attached to any job. */
export async function sendToSelf(subject: string, body: string) {
  const { email } = await gmailStatus();
  if (!email) throw new HttpError(400, 'Gmail is not connected');
  const raw = buildMime(email, noDash(subject), noDash(body), []);
  await gmail('messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(raw) }) });
  return { sentTo: email };
}
