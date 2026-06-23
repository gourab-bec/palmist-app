// api/_lib/horoscope.js — shared daily-horoscope helpers used by both the cron
// (scheduled 6 AM local delivery) and the on-demand endpoint.
import { sbSelect, sbInsert } from './supabase.js';
import { claude } from './anthropic.js';
import { dailyHoroscopePrompt } from './prompts.js';

// Local hour/date/weekday for a timezone, computed from "now".
export function localParts(tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'long' });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    return { hour: parseInt(get('hour'), 10) % 24, date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') };
  } catch { return null; }
}

// Idempotent: return today's horoscope for this subscriber, generating + storing it
// once if it doesn't exist yet. Safe against races on the (owner,date) unique key.
export async function getOrCreateDailyHoroscope(sub, lp) {
  const enc = encodeURIComponent(sub.owner);
  const existing = await sbSelect('daily_horoscopes', `owner=eq.${enc}&date=eq.${lp.date}&select=content&limit=1`);
  if (Array.isArray(existing) && existing[0] && existing[0].content) return existing[0].content;

  const astro = { sun: sub.zodiac, sunEmoji: '', element: sub.zodiac_element, lifePath: sub.life_path, chinese: sub.chinese_zodiac, birthTime: sub.birth_time, birthplace: sub.birthplace };
  const content = await claude([{ type: 'text', text: dailyHoroscopePrompt({
    name: sub.full_name, astro, palmSignature: sub.palm_signature,
    relationship: sub.relationship, focus: sub.focus, dateStr: lp.date, weekday: lp.weekday,
  }) }], { maxTokens: 1600 });

  try {
    await sbInsert('daily_horoscopes', { subscription_id: sub.id || null, owner: sub.owner, date: lp.date, content, created_at: new Date().toISOString() });
  } catch (e) {
    // Likely a unique-key race — re-read and use whatever landed.
    const again = await sbSelect('daily_horoscopes', `owner=eq.${enc}&date=eq.${lp.date}&select=content&limit=1`);
    if (Array.isArray(again) && again[0] && again[0].content) return again[0].content;
    throw e;
  }
  return content;
}

// Compact markdown -> email HTML (shared by cron + on-demand email).
export function horoscopeEmailHtml(md, dlUrl) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = esc(md)
    .replace(/^# (.*)$/gim, '<h2 style="color:#ffb23e;font-family:Georgia,serif">$1</h2>')
    .replace(/^## (.*)$/gim, '<h3 style="color:#6c3bf4">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .split(/\n\n+/).map((p) => (p.startsWith('<h') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`)).join('');
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:620px;margin:auto;color:#241653">
    <div style="background:#1b1145;color:#fff6ee;padding:20px 24px;border-radius:14px 14px 0 0">
      <span style="color:#ffb23e;font-weight:800;font-size:20px">Palmly</span><span style="color:#cdbfe6"> · Daily Horoscope</span>
    </div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 14px 14px;padding:24px;line-height:1.7">
      ${body}
      ${dlUrl ? `<p style="margin-top:24px"><a href="${dlUrl}" style="background:#6c3bf4;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700">Download as PDF</a></p>` : ''}
      <p style="color:#999;font-size:12px;margin-top:18px">You're receiving this because you subscribed to Palmly Daily Horoscope. Reads for fun, not fortune.</p>
    </div></div>`;
}

export const SUB_FIELDS = 'id,owner,email,full_name,dob,birth_time,birthplace,timezone,relationship,focus,zodiac,zodiac_element,life_path,chinese_zodiac,palm_signature,status,last_sent_date';
