// api/get-horoscope.js — return a daily horoscope to its owner (for on-site PDF download).
import { applyCors, sendError, httpError } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { sbSelect } from './_lib/supabase.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const owner = auth.sub;
    const sp = new URL(req.url, 'http://x').searchParams;
    const date = (req.query && req.query.date) || sp.get('date');

    let q = `owner=eq.${encodeURIComponent(owner)}&select=date,content&order=date.desc&limit=1`;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      q = `owner=eq.${encodeURIComponent(owner)}&date=eq.${date}&select=date,content&limit=1`;
    }
    const rows = await sbSelect('daily_horoscopes', q);
    const row = Array.isArray(rows) && rows[0];
    if (!row) throw httpError(404, 'No horoscope found yet. Your first one arrives at 6 AM.');
    return res.status(200).json({ date: row.date, content: row.content });
  } catch (err) {
    return sendError(res, err);
  }
}
