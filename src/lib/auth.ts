// Stateless HMAC session — single admin, credentials in env:
//   ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET
// Token = "<expiryMs>.<HMAC-SHA256(expiryMs)>" in an HttpOnly cookie.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'evchd_admin';

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

const sign = (exp: string) => createHmac('sha256', secret()).update(exp).digest('base64url');

export function makeToken(days = 7): string {
  const exp = String(Date.now() + days * 864e5);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(tok?: string): boolean {
  if (!tok) return false;
  const [exp, mac] = tok.split('.');
  if (!exp || !mac || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Constant-time credential check against env. */
export function checkCredentials(email: string, password: string): boolean {
  const wantEmail = process.env.ADMIN_EMAIL ?? '';
  const wantPass = process.env.ADMIN_PASSWORD ?? '';
  if (!wantEmail || !wantPass) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(wantPass);
  const passOk = a.length === b.length && timingSafeEqual(a, b);
  return email.trim().toLowerCase() === wantEmail.trim().toLowerCase() && passOk;
}
