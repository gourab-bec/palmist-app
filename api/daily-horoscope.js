// api/daily-horoscope.js — Vercel Cron target. Runs hourly; emails each active
// subscriber their personalized horoscope at 6 AM in THEIR local timezone.
// Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token automatically).
import { baseUrl } from './_lib/util.js';
import { sbSelect, sbInsert, sbUpdate } from './_lib/supabase.js';
import { claude } from './_lib/anthropic.js';
import { dailyHoroscopePrompt } from './_lib/prompts.js';
import { sendEmail } from './_lib/email.js';

export const config = { maxDuration: 300 };

const TARGET_HOUR = 6;
const MAX_PER_RUN = 200;

function localParts(tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'long' });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    return { hour: parseInt(get('hour'), 10) % 24, date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') };
  } catch { return null; }
}

function mdToEmailHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = esc(md)
    .replace(/^# (.*)$/gim, '<h2 style="color:#ffb23e;font-family:Georgia,serif">$1</h2>')
    .replace(/^## (.*)$/gim, '<h3 style="color:#6c3bf4">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .split(/\n\n+/).map((p) => (p.startsWith('<h') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`)).join('');
  return html;
}

export default async function handler(req, res) {
  // Auth: only Vercel Cron (or someone holding CRON_SECRET) may trigger this.
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers['authorization'] || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  let sent = 0, skipped = 0, failed = 0;

  try {
    // Active subscribers not yet sent for their local "today".
    const subs = await sbSelect('subscriptions',
      `status=eq.active&select=id,owner,email,full_name,dob,birth_time,birthplace,timezone,relationship,focus,zodiac,zodiac_element,life_path,chinese_zodiac,palm_signature,last_sent_date&limit=${MAX_PER_RUN}`);

    for (const s of (subs || [])) {
      const lp = localParts(s.timezone || 'UTC');
      if (!lp) { skipped++; continue; }
      if (lp.hour !== TARGET_HOUR) { skipped++; continue; }
      if (s.last_sent_date === lp.date) { skipped++; continue; } // already sent today (local)

      try {
        const astro = { sun: s.zodiac, sunEmoji: '', element: s.zodiac_element, lifePath: s.life_path, chinese: s.chinese_zodiac, birthTime: s.birth_time, birthplace: s.birthplace };
        const content = dailyHoroscopePrompt({
          name: s.full_name, astro, palmSignature: s.palm_signature,
          relationship: s.relationship, focus: s.focus, dateStr: lp.date, weekday: lp.weekday,
        });
        const text = await claude([{ type: 'text', text: content }], { maxTokens: 1600 });

        await sbInsert('daily_horoscopes', {
          subscription_id: s.id, owner: s.owner, date: lp.date, content: text, created_at: new Date().toISOString(),
        });

        const dlUrl = `${baseUrl()}/?horoscope=${lp.date}`;
        await sendEmail({
          to: s.email,
          subject: `🌅 ${s.full_name.split(' ')[0]}, your horoscope for ${lp.date}`,
          text: text + `\n\nDownload as PDF: ${dlUrl}`,
          html: `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:620px;margin:auto;color:#241653">
            <div style="background:#1b1145;color:#fff6ee;padding:20px 24px;border-radius:14px 14px 0 0">
              <span style="color:#ffb23e;font-weight:800;font-size:20px">Palmly</span>
              <span style="color:#cdbfe6"> · Daily Horoscope</span>
            </div>
            <div style="border:1px solid #eee;border-top:none;border-radius:0 0 14px 14px;padding:24px;line-height:1.7">
              ${mdToEmailHtml(text)}
              <p style="margin-top:24px"><a href="${dlUrl}" style="background:#6c3bf4;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700">Download as PDF</a></p>
              <p style="color:#999;font-size:12px;margin-top:18px">You're receiving this because you subscribed to Palmly Daily Horoscope. Reads for fun, not fortune.</p>
            </div></div>`,
        });

        await sbUpdate('subscriptions', `id=eq.${s.id}`, { last_sent_date: lp.date });
        sent++;
      } catch (e) {
        failed++; console.error('daily send failed for', s.id, e.message);
      }
    }

    return res.status(200).json({ ok: true, day: todayStr, sent, skipped, failed });
  } catch (err) {
    console.error('daily-horoscope error:', err.message);
    return res.status(500).json({ error: 'cron failed' });
  }
}
