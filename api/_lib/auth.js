// api/_lib/auth.js
// Stateless session tokens (HS256 JWT) signed with SESSION_SECRET, using only Node's
// crypto — no third-party JWT dependency (smaller attack surface). Tokens carry the
// canonical principal (e.g. "email:you@x.com" / "phone:+1..."), are short-lived, and
// are verified on every protected endpoint.

import crypto from 'node:crypto';
import { httpError } from './util.js';

const SECRET = () => process.env.SESSION_SECRET || '';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const b64urlJson = (obj) => b64url(JSON.stringify(obj));

export function signSession(principal, extra = {}) {
  if (!SECRET()) throw httpError(500, 'Auth not configured.');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: principal, iat: now, exp: now + TTL_SECONDS, ...extra };
  const head = b64urlJson(header);
  const body = b64urlJson(payload);
  const sig = crypto.createHmac('sha256', SECRET()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET()).update(`${head}.${body}`).digest('base64url');
  // constant-time signature comparison
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// Pull and verify the bearer token; throw 401 if missing/invalid.
export function requireAuth(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const payload = m && verifySession(m[1]);
  if (!payload) throw httpError(401, 'Please sign in to continue.');
  return payload; // { sub, iat, exp, ... }
}
