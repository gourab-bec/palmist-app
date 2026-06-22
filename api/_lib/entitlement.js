// api/_lib/entitlement.js — idempotent entitlement grants, shared by the webhook
// and the post-redirect verify endpoint so both paths converge on the same state.
import { sbSelect, sbUpdate } from './supabase.js';
import { stripe } from './stripe.js';

// Apply entitlement from a completed/paid Checkout Session.
export async function grantFromSession(session) {
  const meta = session.metadata || {};
  const owner = meta.owner || session.client_reference_id;
  if (!owner) return { kind: null };

  if (meta.kind === 'unlock') {
    const readingId = meta.readingId;
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    if (readingId && paid) {
      // Only unlock the owner's own reading (defense in depth).
      await sbUpdate('readings',
        `id=eq.${encodeURIComponent(readingId)}&owner=eq.${encodeURIComponent(owner)}`,
        { unlocked: true, stripe_session_id: session.id });
    }
    return { kind: 'unlock', readingId, owner };
  }

  if (meta.kind === 'subscription') {
    const plan = meta.plan === 'monthly' ? 'monthly' : 'yearly';
    let currentPeriodEnd = null, subId = session.subscription || null, custId = session.customer || null;
    if (subId) {
      try {
        const s = await stripe().subscriptions.retrieve(subId);
        currentPeriodEnd = s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null;
      } catch (e) { console.error('sub retrieve failed:', e.message); }
    }
    await sbUpdate('subscriptions', `owner=eq.${encodeURIComponent(owner)}`, {
      status: 'active', plan,
      stripe_customer_id: custId, stripe_subscription_id: subId,
      current_period_end: currentPeriodEnd, updated_at: new Date().toISOString(),
    });
    return { kind: 'subscription', owner };
  }
  return { kind: null };
}

// Reflect subscription lifecycle changes (renewals, cancellations, failures).
export async function syncSubscription(sub) {
  const statusMap = { active: 'active', trialing: 'active', past_due: 'past_due', unpaid: 'past_due', canceled: 'canceled', incomplete_expired: 'canceled' };
  const status = statusMap[sub.status] || 'past_due';
  await sbUpdate('subscriptions', `stripe_subscription_id=eq.${encodeURIComponent(sub.id)}`, {
    status,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
}

export async function ownsActiveSub(owner) {
  const subs = await sbSelect('subscriptions', `owner=eq.${encodeURIComponent(owner)}&status=eq.active&select=id&limit=1`);
  return Array.isArray(subs) && subs.length > 0;
}
