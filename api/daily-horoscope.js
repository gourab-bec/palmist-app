// api/daily-horoscope.js — Vercel Cron target. Runs hourly; emails each active
// subscriber their personalized horoscope at 6 AM in THEIR local timezone.
// Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token automatically).
import { baseUrl } from './_lib/util.js';
import { sbSelect, sbUpdate } from './_lib/supabase.js';
import { sendEmail } from './_lib/email.js';
import { localParts, getOrCreateDailyHoroscope, horoscopeEmailHtml, SUB_FIELDS } from './_lib/horoscope.js';

export const config = { maxDuration: 300 };

const TARGET_HOUR = 6;
const MAX_PER_RUN = 200;

export default async function handler(req, res) {
  // Auth: only Vercel Cron (or someone holding CRON_SECRET) may trigger this.
  const secret = process.env.CRON_SECRET || '';
  if (!secret || (req.headers['authorization'] || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let sent = 0, skipped = 0, failed = 0;
  try {
    const subs = await sbSelect('subscriptions', `status=eq.active&select=${SUB_FIELDS}&limit=${MAX_PER_RUN}`);
    for (const s of (subs || [])) {
      const lp = localParts(s.timezone || 'UTC');
      if (!lp) { skipped++; continue; }
      if (lp.hour !== TARGET_HOUR) { skipped++; continue; }
      if (s.last_sent_date === lp.date) { skipped++; continue; } // already sent today (local)

      try {
        const content = await getOrCreateDailyHoroscope(s, lp);
        const dlUrl = `${baseUrl()}/?horoscope=${lp.date}`;
        await sendEmail({
          to: s.email,
          subject: `🌅 ${String(s.full_name || 'Your').split(' ')[0]}, your horoscope for ${lp.date}`,
          text: content + `\n\nDownload as PDF: ${dlUrl}`,
          html: horoscopeEmailHtml(content, dlUrl),
        });
        await sbUpdate('subscriptions', `id=eq.${s.id}`, { last_sent_date: lp.date });
        sent++;
      } catch (e) { failed++; console.error('daily send failed for', s.id, e.message); }
    }
    return res.status(200).json({ ok: true, sent, skipped, failed });
  } catch (err) {
    console.error('daily-horoscope error:', err.message);
    return res.status(500).json({ error: 'cron failed' });
  }
}
