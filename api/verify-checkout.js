// api/verify-checkout.js — called right after the Stripe redirect so the user gets
// instant access without waiting for the webhook. Cross-checks ownership, then grants.
import { applyCors, sendError, httpError } from './_lib/util.js';
import { requireAuth } from './_lib/auth.js';
import { stripe } from './_lib/stripe.js';
import { grantFromSession, ownsActiveSub } from './_lib/entitlement.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = requireAuth(req);
    const sessionId = String((req.query && req.query.session_id) || new URL(req.url, 'http://x').searchParams.get('session_id') || '');
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw httpError(400, 'Invalid session id.');

    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const owner = (session.metadata && session.metadata.owner) || session.client_reference_id;
    // Authorization: the session must belong to the signed-in user.
    if (!owner || owner !== auth.sub) throw httpError(403, 'This payment does not belong to your account.');

    const result = await grantFromSession(session);
    const subscribed = await ownsActiveSub(auth.sub).catch(() => false);
    return res.status(200).json({ ...result, subscribed });
  } catch (err) {
    return sendError(res, err);
  }
}
