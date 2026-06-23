// api/my-account.js — after a returning user signs in, fetch what they already have
// (latest reading + subscription) so we can show it without re-uploading a photo.
import { applyCors, sendError } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { sbSelect } from './_lib/supabase.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const enc = encodeURIComponent(auth.sub);

    const reads = await sbSelect('readings', `owner=eq.${enc}&select=id,unlocked,teaser,subject_name&order=created_at.desc&limit=1`);
    const r = Array.isArray(reads) && reads[0];

    const subs = await sbSelect('subscriptions', `owner=eq.${enc}&select=status&limit=1`);
    const subscribed = Array.isArray(subs) && subs[0] && subs[0].status === 'active';

    return res.status(200).json({
      reading: r ? { readingId: r.id, unlocked: !!r.unlocked, teaser: r.teaser, name: r.subject_name } : null,
      subscribed: !!subscribed,
    });
  } catch (err) {
    return sendError(res, err);
  }
}
