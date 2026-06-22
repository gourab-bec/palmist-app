// api/verify-otp.js — verify the code, create/lookup the user, issue a session token.
import { applyCors, readBody, sendError, httpError, isEmail, isPhone, isOtp, principal, normalizeEmail, normalizePhone, hmac, constantTimeEqual, rateLimit, clientIp } from './_lib/util.js';
import { sbSelect, sbUpdate, sbUpsert } from './_lib/supabase.js';
import { signSession } from './_lib/auth.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { json } = await readBody(req, { maxBytes: 8 * 1024 });
    const channel = json.channel === 'phone' ? 'phone' : 'email';
    const identifier = String(json.identifier || '');
    const code = String(json.code || '');

    if (channel === 'email' && !isEmail(identifier)) throw httpError(400, 'Invalid email.');
    if (channel === 'phone' && !isPhone(identifier)) throw httpError(400, 'Invalid phone.');
    if (!isOtp(code)) throw httpError(400, 'Enter the 6-digit code.');

    const p = principal(channel, identifier);
    const ip = clientIp(req);

    // Throttle verification attempts (defense against code brute force).
    const rl = await rateLimit({ key: `otp_verify:${p}`, max: 10, windowSec: 15 * 60 });
    if (!rl.allowed) throw httpError(429, 'Too many attempts. Please request a new code.');
    const rlIp = await rateLimit({ key: `otp_verify_ip:${ip}`, max: 50, windowSec: 60 * 60 });
    if (!rlIp.allowed) throw httpError(429, 'Too many attempts from this network.');

    const rows = await sbSelect('otp_codes',
      `identifier=eq.${encodeURIComponent(p)}&consumed=eq.false&order=created_at.desc&limit=1&select=id,code_hash,attempts,expires_at`);
    const row = Array.isArray(rows) && rows[0];
    if (!row) throw httpError(400, 'No active code. Please request a new one.');
    if (new Date(row.expires_at).getTime() < Date.now()) throw httpError(400, 'Code expired. Please request a new one.');
    if (row.attempts >= 5) { await sbUpdate('otp_codes', `id=eq.${row.id}`, { consumed: true }); throw httpError(400, 'Too many wrong attempts. Request a new code.'); }

    const ok = constantTimeEqual(row.code_hash, hmac(code));
    if (!ok) {
      await sbUpdate('otp_codes', `id=eq.${row.id}`, { attempts: row.attempts + 1 });
      throw httpError(400, 'Incorrect code. Please try again.');
    }

    // Success — single-use consume + upsert the user.
    await sbUpdate('otp_codes', `id=eq.${row.id}`, { consumed: true });
    const display = channel === 'email' ? normalizeEmail(identifier) : normalizePhone(identifier);
    await sbUpsert('users', {
      principal: p, channel, identifier: display, last_login: new Date().toISOString(),
    }, 'principal', { returning: false });

    const token = signSession(p, { channel });
    return res.status(200).json({ token, identifier: display });
  } catch (err) {
    return sendError(res, err);
  }
}
