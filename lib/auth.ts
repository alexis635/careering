import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'careering_session';
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || '');

export async function issueSession(): Promise<string> {
  const token = await new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(key());
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

export function clearSession(): string {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`;
}

export async function isAuthed(cookieHeader: string | undefined): Promise<boolean> {
  if (!process.env.SESSION_SECRET) return false;
  const m = cookieHeader?.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return false;
  try {
    await jwtVerify(m[1], key());
    return true;
  } catch {
    return false;
  }
}
