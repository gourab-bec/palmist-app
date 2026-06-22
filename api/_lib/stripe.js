// api/_lib/stripe.js — official Stripe SDK (audited; correct webhook signature verify).
import Stripe from 'stripe';
import { httpError } from './util.js';

let _stripe = null;
export function stripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw httpError(500, 'Payments are not configured.');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return _stripe;
}

// Inline prices (no dashboard setup needed). Optional env price IDs override.
export const PRICES = {
  unlock: { env: 'STRIPE_PRICE_UNLOCK', amount: 200, name: 'Palmly — Full palm reading + PDF' },
  monthly: { env: 'STRIPE_PRICE_MONTHLY', amount: 399, name: 'Palmly Daily Horoscope (Monthly)', interval: 'month' },
  yearly: { env: 'STRIPE_PRICE_YEARLY', amount: 2999, name: 'Palmly Daily Horoscope (Yearly)', interval: 'year' },
};

export function lineItem(kind) {
  const p = PRICES[kind];
  if (!p) throw httpError(400, 'Unknown product.');
  const priceId = process.env[p.env];
  if (priceId) return { price: priceId, quantity: 1 };
  const price_data = { currency: 'usd', unit_amount: p.amount, product_data: { name: p.name } };
  if (p.interval) price_data.recurring = { interval: p.interval };
  return { price_data, quantity: 1 };
}
