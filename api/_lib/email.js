// api/_lib/email.js — transactional email via Resend.
import { httpError } from './util.js';

const FROM = () => process.env.RESEND_FROM || 'Palmly <noreply@getbriefed.to>';

export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) throw httpError(500, 'Email is not configured.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('Resend error:', res.status, t.slice(0, 300));
    throw httpError(502, 'Could not send email. Please try again.');
  }
  return res.json();
}

export function otpEmail(code) {
  return {
    subject: `Your Palmly code: ${code}`,
    text: `Your Palmly verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`,
    html: `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#1b1145;color:#fff6ee;padding:32px;border-radius:16px;max-width:440px;margin:auto">
      <h1 style="margin:0 0 8px;color:#ffb23e">Palmly ✋</h1>
      <p style="color:#cdbfe6">Your verification code:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#4ee6c4;margin:12px 0">${code}</div>
      <p style="color:#cdbfe6;font-size:13px">Expires in 10 minutes. If you didn't request this, you can safely ignore it.</p>
    </div>`,
  };
}
