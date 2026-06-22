// api/account-delete.js — privacy/GDPR: let a signed-in user erase their own data.
// Cancels any Stripe subscription, then deletes readings, horoscopes, subscription, user.
import { applyCors, sendError } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { sbSelect, sbDelete } from './_lib/supabase.js';
import { stripe } from './_lib/stripe.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const owner = auth.sub;
    const enc = encodeURIComponent(owner);

    // Cancel any active Stripe subscription first (best-effort).
    try {
      const subs = await sbSelect('subscriptions', `owner=eq.${enc}&select=stripe_subscription_id&limit=1`);
      const subId = Array.isArray(subs) && subs[0] && subs[0].stripe_subscription_id;
      if (subId && process.env.STRIPE_SECRET_KEY) await stripe().subscriptions.cancel(subId);
    } catch (e) { console.error('sub cancel on delete failed:', e.message); }

    await sbDelete('daily_horoscopes', `owner=eq.${enc}`);
    await sbDelete('readings', `owner=eq.${enc}`);
    await sbDelete('subscriptions', `owner=eq.${enc}`);
    await sbDelete('users', `principal=eq.${enc}`);

    return res.status(200).json({ ok: true, deleted: true });
  } catch (err) {
    return sendError(res, err);
  }
}
