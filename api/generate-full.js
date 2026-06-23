// api/generate-full.js — PHASE 2: build the complete reading and store it.
// Called in the background right after the teaser shows, and again (awaited) before
// checkout to guarantee the full text is in the DB before the user leaves the page.
// Idempotent: if the full report already exists, it returns immediately.
import { applyCors, readBody, sendError, httpError, isUuid, rateLimit, isAdmin } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { claude, imageBlock } from './_lib/anthropic.js';
import { palmReadingPrompt } from './_lib/prompts.js';
import { sbSelect, sbUpdate } from './_lib/supabase.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const owner = auth.sub;
    const { json } = await readBody(req, { maxBytes: 8 * 1024 * 1024 });
    const readingId = String(json.readingId || '');
    if (!isUuid(readingId)) throw httpError(400, 'Invalid reading id.');

    const rows = await sbSelect('readings',
      `id=eq.${encodeURIComponent(readingId)}&select=owner,full_report,subject_name,subject_gender,subject_age&limit=1`);
    const row = Array.isArray(rows) && rows[0];
    if (!row) throw httpError(404, 'Reading not found.');
    if (row.owner !== owner) throw httpError(403, 'Not your reading.');

    // Already built — nothing to do (fast path for paid/returning users).
    if (row.full_report) return res.status(200).json({ ready: true });

    if (!isAdmin(owner)) {
      await rateLimit({ key: `full:${owner}`, max: 20, windowSec: 60 * 60 });
    }

    const rightHand = json.rightHand || null;
    const leftHand = json.leftHand || null;
    if (!rightHand && !leftHand) {
      // We never store images, so we can't rebuild without them.
      throw httpError(409, 'Full reading is still being prepared. Please re-run your reading.');
    }

    const handsProvided = rightHand && leftHand ? 'Both right and left hands' : rightHand ? 'Right hand only' : 'Left hand only';
    const content = [{ type: 'text', text: palmReadingPrompt({
      name: row.subject_name, gender: row.subject_gender, age: row.subject_age, handsProvided,
    }) }];
    if (rightHand) content.push(...imageBlock(rightHand, '↑ RIGHT hand.'));
    if (leftHand) content.push(...imageBlock(leftHand, '↑ LEFT hand.'));
    if (content.length === 1) throw httpError(400, 'Palm photo must be a JPEG, PNG, or WebP image.');

    const full = await claude(content, { maxTokens: 8000 });
    await sbUpdate('readings', `id=eq.${encodeURIComponent(readingId)}&owner=eq.${encodeURIComponent(owner)}`, { full_report: full });

    return res.status(200).json({ ready: true });
  } catch (err) {
    return sendError(res, err);
  }
}
