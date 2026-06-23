// api/create-checkout.js — create a Stripe Checkout Session for either the $2 unlock
// or the daily-horoscope subscription. Authenticated; never trusts client-supplied prices.
import { applyCors, readBody, sendError, httpError, isUuid, baseUrl, isAdmin } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { stripe, lineItem } from './_lib/stripe.js';
import { sbSelect, sbUpdate } from './_lib/supabase.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const owner = auth.sub;
    const admin = isAdmin(owner);
    const { json } = await readBody(req, { maxBytes: 8 * 1024 });
    const kind = json.kind;
    const base = baseUrl();

    // Admins never pay (testing). Grant directly and skip Stripe entirely.
    if (admin) {
      if (kind === 'unlock' && isUuid(String(json.readingId || ''))) {
        await sbUpdate('readings', `id=eq.${encodeURIComponent(json.readingId)}&owner=eq.${encodeURIComponent(owner)}`, { unlocked: true });
      } else if (kind === 'subscription') {
        await sbUpdate('subscriptions', `owner=eq.${encodeURIComponent(owner)}`, { status: 'active', plan: json.plan === 'monthly' ? 'monthly' : 'yearly', updated_at: new Date().toISOString() });
      }
      return res.status(200).json({ url: `${base}/?admin_granted=1` });
    }
    const success = `${base}/?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancel = `${base}/?canceled=1`;
    const email = owner.startsWith('email:') ? owner.slice(6) : undefined;

    if (kind === 'unlock') {
      const readingId = String(json.readingId || '');
      if (!isUuid(readingId)) throw httpError(400, 'Invalid reading id.');
      const rows = await sbSelect('readings', `id=eq.${encodeURIComponent(readingId)}&select=owner,unlocked&limit=1`);
      const row = Array.isArray(rows) && rows[0];
      if (!row) throw httpError(404, 'Reading not found.');
      if (row.owner !== owner) throw httpError(403, 'Not your reading.');
      if (row.unlocked) return res.status(200).json({ url: `${base}/?paid=1&already=1` });

      const session = await stripe().checkout.sessions.create({
        mode: 'payment',
        line_items: [lineItem('unlock')],
        client_reference_id: owner,
        customer_email: email,
        metadata: { owner, kind: 'unlock', readingId },
        // receipt_email makes Stripe email the buyer a receipt directly.
        // (For phone-only accounts, Checkout collects the email and Stripe uses it.)
        payment_intent_data: { metadata: { owner, kind: 'unlock', readingId }, ...(email ? { receipt_email: email } : {}) },
        success_url: success,
        cancel_url: cancel,
      });
      return res.status(200).json({ url: session.url });
    }

    if (kind === 'subscription') {
      const plan = json.plan === 'monthly' ? 'monthly' : 'yearly';
      // Require a stored horoscope profile before subscribing.
      const subs = await sbSelect('subscriptions', `owner=eq.${encodeURIComponent(owner)}&select=owner,email,status&limit=1`);
      const sub = Array.isArray(subs) && subs[0];
      if (!sub) throw httpError(400, 'Please complete your horoscope details first.');
      if (sub.status === 'active') throw httpError(409, "You're already subscribed. 🎉");

      const session = await stripe().checkout.sessions.create({
        mode: 'subscription',
        line_items: [lineItem(plan)],
        client_reference_id: owner,
        customer_email: sub.email || email,
        metadata: { owner, kind: 'subscription', plan },
        subscription_data: { metadata: { owner, kind: 'subscription', plan } },
        success_url: success,
        cancel_url: cancel,
      });
      return res.status(200).json({ url: session.url });
    }

    throw httpError(400, 'Unknown checkout kind.');
  } catch (err) {
    return sendError(res, err);
  }
}
