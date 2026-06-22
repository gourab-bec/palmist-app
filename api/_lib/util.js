// api/_lib/util.js
// Shared utilities: CORS, secure body parsing, validation, hashing, rate limiting.
// Files under api/_lib are ignored by Vercel's file-based routing (underscore prefix).

import crypto from 'node:crypto';

/* --------------------------------- CORS --------------------------------- */
// Same-origin by default. We only allow the configured public origin — never "*".
export function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGIN || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const origin = (req.headers.origin || '').replace(/\/$/, '');
  if (allowed && origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

/* ---------------------------- body parsing ------------------------------ */
// Reads the raw request stream with a hard size cap. Returns { raw, json }.
export function readBody(req, { maxBytes = 1 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve({ raw: JSON.stringify(req.body), json: req.body });
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(httpError(413, 'Request too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let json = {};
      if (raw) { try { json = JSON.parse(raw); } catch { reject(httpError(400, 'Invalid request body.')); return; } }
      resolve({ raw, json });
    });
    req.on('error', reject);
  });
}

/* ------------------------------ errors ---------------------------------- */
export function httpError(status, message, extra = {}) {
  const e = new Error(message); e.status = status; e.extra = extra; return e;
}
export function sendError(res, err) {
  const status = err && err.status ? err.status : 500;
  const body = { error: status === 500 ? 'Something went wrong. Please try again.' : err.message };
  if (err && err.extra) Object.assign(body, err.extra);
  if (status >= 500) console.error('Server error:', err);
  res.status(status).json(body);
}

/* ---------------------------- validation -------------------------------- */
export const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) && s.length <= 254;
export const normalizeEmail = (s) => String(s).trim().toLowerCase();

// E.164-ish: + and 8–15 digits.
export const isPhone = (s) => typeof s === 'string' && /^\+?[1-9]\d{7,14}$/.test(String(s).replace(/[\s()-]/g, ''));
export const normalizePhone = (s) => {
  const d = String(s).replace(/[\s()-]/g, '');
  return d.startsWith('+') ? d : '+' + d;
};

export const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isOtp = (s) => typeof s === 'string' && /^\d{6}$/.test(s);

// Normalize a sign-in identifier into a canonical principal string.
export function principal(channel, identifier) {
  if (channel === 'email') return 'email:' + normalizeEmail(identifier);
  if (channel === 'phone') return 'phone:' + normalizePhone(identifier);
  throw httpError(400, 'Invalid channel.');
}

/* ------------------------------ admin allowlist -------------------------- */
// ADMIN_PRINCIPALS: comma-separated emails/phones (with or without an
// "email:"/"phone:" prefix). Admins bypass all payment requirements and the
// one-person-per-account binding (for testing). Configure in env — do NOT
// hardcode personal contact details in the public repo.
export function adminPrincipals() {
  return String(process.env.ADMIN_PRINCIPALS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((e) => {
      const v = e.replace(/^email:/i, '').replace(/^phone:/i, '');
      return v.includes('@') ? 'email:' + normalizeEmail(v) : 'phone:' + normalizePhone(v);
    });
}
export function isAdmin(p) {
  return adminPrincipals().includes(p);
}

// Strip control chars / clamp length for free-text fields stored in the DB.
export function cleanText(s, max = 200) {
  if (s == null) return '';
  // Strip ASCII control characters, collapse whitespace, clamp length.
  return String(s).replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* ------------------------------ crypto ---------------------------------- */
export function hmac(value, secret = process.env.OTP_SECRET || process.env.SESSION_SECRET || '') {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}
export function constantTimeEqual(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
export function randomCode() {
  // Cryptographically strong 6-digit code, 000000–999999.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/* ----------------------------- rate limit -------------------------------- */
// Persistent, abuse-resistant counter backed by Supabase (works across cold starts
// and across all serverless instances). Falls back to allow if DB unset.
import { sbInsert, sbSelect } from './supabase.js';
export async function rateLimit({ key, max, windowSec }) {
  if (!process.env.SUPABASE_URL) return { allowed: true };
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  try {
    const rows = await sbSelect('rate_events', `bucket=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(since)}&select=id`);
    if (Array.isArray(rows) && rows.length >= max) {
      return { allowed: false, retryAfter: windowSec };
    }
    await sbInsert('rate_events', { bucket: key, created_at: new Date().toISOString() });
    return { allowed: true, remaining: max - ((rows && rows.length) || 0) - 1 };
  } catch (e) {
    console.error('rateLimit error (failing open):', e.message);
    return { allowed: true };
  }
}

export function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}

export function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || 'https://palmist.getbriefed.to').replace(/\/$/, '');
}
