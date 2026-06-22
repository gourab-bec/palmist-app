// api/_lib/sms.js — SMS via Twilio REST API (no SDK; uses fetch + basic auth).
import { httpError } from './util.js';

export async function sendSms({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM; // a Twilio number, or a Messaging Service SID (MG...)
  if (!sid || !token || !from) throw httpError(500, 'SMS is not configured.');

  const params = new URLSearchParams();
  params.append('To', to);
  if (from.startsWith('MG')) params.append('MessagingServiceSid', from);
  else params.append('From', from);
  params.append('Body', body);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('Twilio error:', res.status, t.slice(0, 300));
    throw httpError(502, 'Could not send SMS. Please try again.');
  }
  return res.json();
}

export const otpSms = (code) => `Palmly: your verification code is ${code}. Expires in 10 minutes.`;
