// api/read-palm.js — authenticated. Generates the FULL reading server-side, stores it,
// and returns ONLY a teaser. The full text never reaches the browser until the reading
// is unlocked ($2). This replaces the old streaming endpoint.
import { applyCors, readBody, sendError, httpError, cleanText, rateLimit, clientIp, isAdmin } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { enforceIdentity } from './_lib/identity.js';
import { claude, imageBlock } from './_lib/anthropic.js';
import { palmTeaserPrompt } from './_lib/prompts.js';
import { sbInsert, sbSelect } from './_lib/supabase.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const owner = auth.sub;

    const { json } = await readBody(req, { maxBytes: 8 * 1024 * 1024 });
    const name = cleanText(json.name, 80);
    const gender = cleanText(json.gender, 20);
    const age = parseInt(json.age, 10);
    const rightHand = json.rightHand || null;
    const leftHand = json.leftHand || null;

    if (!name) throw httpError(400, 'Name is required.');
    if (!Number.isInteger(age) || age < 1 || age > 120) throw httpError(400, 'Enter a valid age.');
    if (!rightHand && !leftHand) throw httpError(400, 'At least one palm photo is required.');

    const admin = isAdmin(owner);

    // One account = one person (admins are exempt and may read for anyone).
    if (!admin) await enforceIdentity({ owner, name, age });

    const ip = clientIp(req);
    if (!admin) {
      const rl = await rateLimit({ key: `read:${owner}`, max: 10, windowSec: 60 * 60 });
      if (!rl.allowed) throw httpError(429, 'You have reached the hourly reading limit. Please try again later.', { retryAfter: rl.retryAfter });
      await rateLimit({ key: `read_ip:${ip}`, max: 30, windowSec: 60 * 60 });
    }

    const handsProvided = rightHand && leftHand ? 'Both right and left hands' : rightHand ? 'Right hand only' : 'Left hand only';
    const content = [{ type: 'text', text: palmTeaserPrompt({ name, gender, age, handsProvided }) }];
    if (rightHand) content.push(...imageBlock(rightHand, '↑ RIGHT hand.'));
    if (leftHand) content.push(...imageBlock(leftHand, '↑ LEFT hand.'));
    if (content.length === 1) throw httpError(400, 'Palm photo must be a JPEG, PNG, or WebP image.');

    // PHASE 1: generate only the short teaser — fast. The full report is built
    // afterwards by /api/generate-full (kept warm in the DB for instant unlock).
    const teaser = await claude(content, { maxTokens: 1400 });

    // Store the reading. NOTE: raw palm images are never persisted (privacy) — only text.
    // full_report stays null until generate-full runs. Admins auto-unlock.
    const row = await sbInsert('readings', {
      owner, subject_name: name, subject_gender: gender, subject_age: age,
      teaser, full_report: null, unlocked: admin, created_at: new Date().toISOString(),
    }, { returning: true });

    // Analytics log (fire-and-forget; keeps the original table populated).
    sbInsert('palm_readings', {
      subject_name: name, subject_gender: gender, subject_age: age,
      requester_email: owner.startsWith('email:') ? owner.slice(6) : null,
      requester_ip: ip, is_pro: false, reading_length: full.length, created_at: new Date().toISOString(),
    }).catch((e) => console.error('analytics log failed:', e.message));

    // Is this user an active daily-horoscope subscriber?
    let subscribed = false;
    try {
      const subs = await sbSelect('subscriptions', `owner=eq.${encodeURIComponent(owner)}&status=eq.active&select=id&limit=1`);
      subscribed = Array.isArray(subs) && subs.length > 0;
    } catch {}

    return res.status(200).json({ readingId: row.id, teaser, entitled: admin, subscribed });
  } catch (err) {
    return sendError(res, err);
  }
}
