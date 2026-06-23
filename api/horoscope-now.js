// api/horoscope-now.js — generate/view today's horoscope ON DEMAND (no waiting for
// the 6 AM email). Active subscribers (and admins) only. Optionally emails it too.
import { applyCors, readBody, sendError, httpError, isAdmin, rateLimit, baseUrl } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { sbSelect } from './_lib/supabase.js';
import { sendEmail } from './_lib/email.js';
import { localParts, getOrCreateDailyHoroscope, horoscopeEmailHtml, SUB_FIELDS } from './_lib/horoscope.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const owner = auth.sub;
    const { json } = await readBody(req, { maxBytes: 8 * 1024 });

    const subs = await sbSelect('subscriptions', `owner=eq.${encodeURIComponent(owner)}&select=${SUB_FIELDS}&limit=1`);
    const sub = Array.isArray(subs) && subs[0];
    if (!sub) throw httpError(400, 'You don\'t have a daily horoscope yet. Set it up first.');

    const admin = isAdmin(owner);
    if (sub.status !== 'active' && !admin) {
      return res.status(402).json({ error: 'Subscribe to access your daily horoscope.', upgrade: true });
    }

    const lp = localParts(sub.timezone || 'UTC');
    if (!lp) throw httpError(400, 'Invalid timezone on your profile.');

    if (!admin) {
      const rl = await rateLimit({ key: `horo_now:${owner}`, max: 10, windowSec: 60 * 60 });
      if (!rl.allowed) throw httpError(429, 'Please wait a bit before generating again.');
    }

    const content = await getOrCreateDailyHoroscope(sub, lp);

    if (json.sendEmail) {
      const dlUrl = `${baseUrl()}/?horoscope=${lp.date}`;
      await sendEmail({
        to: sub.email,
        subject: `🌅 Your Palmly horoscope for ${lp.date}`,
        text: content + `\n\nDownload as PDF: ${dlUrl}`,
        html: horoscopeEmailHtml(content, dlUrl),
      });
    }

    return res.status(200).json({ date: lp.date, content, emailed: !!json.sendEmail });
  } catch (err) {
    return sendError(res, err);
  }
}
