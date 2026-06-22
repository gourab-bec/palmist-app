// api/get-report.js — return the FULL reading only to its owner, and only if unlocked.
import { applyCors, sendError, httpError, isUuid, isAdmin } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { sbSelect } from './_lib/supabase.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const readingId = String((req.query && req.query.readingId) || new URL(req.url, 'http://x').searchParams.get('readingId') || '');
    if (!isUuid(readingId)) throw httpError(400, 'Invalid reading id.');

    const rows = await sbSelect('readings',
      `id=eq.${encodeURIComponent(readingId)}&select=owner,teaser,full_report,unlocked&limit=1`);
    const row = Array.isArray(rows) && rows[0];
    if (!row) throw httpError(404, 'Reading not found.');

    // Authorization: must be the owner.
    if (row.owner !== auth.sub) throw httpError(403, 'Not your reading.');

    if (!row.unlocked && !isAdmin(auth.sub)) {
      // 402 Payment Required — front-end shows the paywall.
      return res.status(402).json({ error: 'Locked', teaser: row.teaser, entitled: false });
    }
    return res.status(200).json({ full: row.full_report, teaser: row.teaser, entitled: true });
  } catch (err) {
    return sendError(res, err);
  }
}
