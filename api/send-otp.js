// api/send-otp.js — issue a one-time verification code to email or phone.
import { applyCors, readBody, sendError, httpError, isEmail, isPhone, principal, hmac, randomCode, rateLimit, clientIp } from './_lib/util.js';
import { sbInsert } from './_lib/supabase.js';
import { sendEmail, otpEmail } from './_lib/email.js';
import { sendSms, otpSms } from './_lib/sms.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { json } = await readBody(req, { maxBytes: 8 * 1024 });
    const channel = json.channel === 'phone' ? 'phone' : 'email';
    const identifier = String(json.identifier || '');

    if (channel === 'email' && !isEmail(identifier)) throw httpError(400, 'Enter a valid email address.');
    if (channel === 'phone' && !isPhone(identifier)) throw httpError(400, 'Enter a valid phone number with country code.');

    const p = principal(channel, identifier);
    const ip = clientIp(req);

    // Abuse limits: per principal and per IP.
    const a = await rateLimit({ key: `otp_send:${p}`, max: 5, windowSec: 15 * 60 });
    if (!a.allowed) throw httpError(429, 'Too many code requests. Please wait a few minutes.', { retryAfter: a.retryAfter });
    const b = await rateLimit({ key: `otp_send_ip:${ip}`, max: 20, windowSec: 60 * 60 });
    if (!b.allowed) throw httpError(429, 'Too many requests from this network. Please try later.');

    const code = randomCode();
    await sbInsert('otp_codes', {
      identifier: p,
      code_hash: hmac(code),
      attempts: 0,
      consumed: false,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    if (channel === 'email') { const m = otpEmail(code); await sendEmail({ to: identifier.trim(), ...m }); }
    else { await sendSms({ to: identifier.replace(/[\s()-]/g, ''), body: otpSms(code) }); }

    // Generic response — never reveal whether the identifier already exists.
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}
