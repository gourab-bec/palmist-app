// api/horoscope-signup.js — store the subscriber's profile BEFORE checkout.
// Zodiac is derived from the date of birth here (never taken as input).
// Raw palm images are distilled to a text "palm signature" and then discarded.
import { applyCors, readBody, sendError, httpError, isEmail, normalizeEmail, cleanText, rateLimit, isAdmin } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { enforceIdentity, ageFromDob } from './_lib/identity.js';
import { astroProfile } from './_lib/zodiac.js';
import { claude, imageBlock } from './_lib/anthropic.js';
import { palmSignaturePrompt } from './_lib/prompts.js';
import { sbSelect, sbInsert, sbUpdate } from './_lib/supabase.js';

const RELATIONSHIPS = ['Single', 'Dating', 'Married', "It's complicated"];
const FOCI = ['Overall', 'Love', 'Career', 'Money', 'Health'];

function validTimezone(tz) {
  try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
function validDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(dob + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  const y = +dob.slice(0, 4);
  return y >= 1900 && d.getTime() <= Date.now();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const owner = auth.sub;

    const rl = await rateLimit({ key: `horo_signup:${owner}`, max: 10, windowSec: 60 * 60 });
    if (!rl.allowed) throw httpError(429, 'Too many updates. Please try again later.');

    const { json } = await readBody(req, { maxBytes: 8 * 1024 * 1024 });
    const fullName = cleanText(json.fullName, 80);
    const email = normalizeEmail(json.email || (owner.startsWith('email:') ? owner.slice(6) : ''));
    const dob = String(json.dob || '');
    const birthTime = cleanText(json.birthTime, 8);
    const birthplace = cleanText(json.birthplace, 120);
    const timezone = String(json.timezone || 'UTC');
    const relationship = RELATIONSHIPS.includes(json.relationship) ? json.relationship : 'Single';
    const focus = FOCI.includes(json.focus) ? json.focus : 'Overall';

    if (!fullName) throw httpError(400, 'Full name is required.');
    if (!isEmail(email)) throw httpError(400, 'A valid delivery email is required.');
    if (!validDob(dob)) throw httpError(400, 'Enter a valid date of birth.');
    if (!birthplace) throw httpError(400, 'Birthplace is required.');
    if (!validTimezone(timezone)) throw httpError(400, 'Invalid timezone.');

    const admin = isAdmin(owner);
    // One account = one person (admins exempt).
    if (!admin) await enforceIdentity({ owner, name: fullName, age: ageFromDob(dob) });

    const astro = astroProfile({ dob, birthTime, birthplace }); // zodiac derived server-side

    // Distill palm photos to a durable text signature; never persist the images.
    let palmSignature = null;
    const content = [{ type: 'text', text: palmSignaturePrompt({ name: fullName }) }];
    if (json.rightHand) content.push(...imageBlock(json.rightHand, '↑ RIGHT hand.'));
    if (json.leftHand) content.push(...imageBlock(json.leftHand, '↑ LEFT hand.'));
    if (content.length > 1) {
      try { palmSignature = await claude(content, { maxTokens: 700 }); } catch (e) { console.error('palm signature failed:', e.message); }
    }

    const profile = {
      email, full_name: fullName, dob, birth_time: birthTime || null, birthplace,
      timezone, relationship, focus,
      zodiac: astro.sun, zodiac_element: astro.element, life_path: astro.lifePath, chinese_zodiac: astro.chinese,
      updated_at: new Date().toISOString(),
    };
    // Only set palm_signature if we successfully produced one (don't wipe an existing one).
    if (palmSignature) profile.palm_signature = palmSignature;

    const existing = await sbSelect('subscriptions', `owner=eq.${encodeURIComponent(owner)}&select=owner,status&limit=1`);
    if (Array.isArray(existing) && existing[0]) {
      // Update profile WITHOUT touching status (never downgrade an active subscriber),
      // unless this is an admin testing account, which we activate directly.
      await sbUpdate('subscriptions', `owner=eq.${encodeURIComponent(owner)}`, admin ? { ...profile, status: 'active' } : profile);
    } else {
      await sbInsert('subscriptions', { owner, status: admin ? 'active' : 'pending', ...profile });
    }

    // Admins are auto-subscribed (payment bypassed) so the client can skip Stripe.
    return res.status(200).json({ ok: true, zodiac: astro.sun, element: astro.element, active: admin });
  } catch (err) {
    return sendError(res, err);
  }
}
