// tests/handlers.test.mjs — endpoint-level security behaviour with mocked deps.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { installFetch, jsonResponse, makeRes, makeReqJSON, makeReqStream, sha256hex } from './_mock.mjs';
import { signSession } from '../api/_lib/auth.js';
import { enforceIdentity } from '../api/_lib/identity.js';

const OWNER = 'email:owner@x.com';
const token = signSession(OWNER, { channel: 'email' });
const ADMIN = 'email:admin@test.com';
const adminToken = signSession(ADMIN, { channel: 'email' });
const RID = '123e4567-e89b-12d3-a456-426614174000';

/* ----------------------------- get-report authz/paywall ----------------------------- */
test('get-report: 401 without a session', async () => {
  installFetch([]);
  const { default: h } = await import('../api/get-report.js');
  const res = makeRes();
  await h(makeReqJSON({ method: 'GET', query: { readingId: RID } }), res);
  assert.equal(res.statusCode, 401);
});

test('get-report: 403 when the reading belongs to someone else', async () => {
  installFetch([{ test: (u) => u.includes('/rest/v1/readings'), respond: () => jsonResponse([{ owner: 'email:someone@else.com', teaser: 't', full_report: 'F', unlocked: true }]) }]);
  const { default: h } = await import('../api/get-report.js');
  const res = makeRes();
  await h(makeReqJSON({ method: 'GET', headers: { authorization: 'Bearer ' + token }, query: { readingId: RID } }), res);
  assert.equal(res.statusCode, 403);
});

test('get-report: 402 when owned but locked (no full text leaks)', async () => {
  installFetch([{ test: (u) => u.includes('/rest/v1/readings'), respond: () => jsonResponse([{ owner: OWNER, teaser: 'teaser only', full_report: 'SECRET FULL', unlocked: false }]) }]);
  const { default: h } = await import('../api/get-report.js');
  const res = makeRes();
  await h(makeReqJSON({ method: 'GET', headers: { authorization: 'Bearer ' + token }, query: { readingId: RID } }), res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.entitled, false);
  assert.ok(!JSON.stringify(res.body).includes('SECRET FULL')); // full text must NOT be returned
});

test('get-report: 200 with full text when owned + unlocked', async () => {
  installFetch([{ test: (u) => u.includes('/rest/v1/readings'), respond: () => jsonResponse([{ owner: OWNER, teaser: 't', full_report: 'THE FULL READING', unlocked: true }]) }]);
  const { default: h } = await import('../api/get-report.js');
  const res = makeRes();
  await h(makeReqJSON({ method: 'GET', headers: { authorization: 'Bearer ' + token }, query: { readingId: RID } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.full, 'THE FULL READING');
});

test('get-report: 400 on a non-uuid id (input validation)', async () => {
  installFetch([]);
  const { default: h } = await import('../api/get-report.js');
  const res = makeRes();
  await h(makeReqJSON({ method: 'GET', headers: { authorization: 'Bearer ' + token }, query: { readingId: 'not-a-uuid' } }), res);
  assert.equal(res.statusCode, 400);
});

test('get-report: ADMIN bypasses the paywall (locked report returned in full)', async () => {
  installFetch([{ test: (u) => u.includes('/rest/v1/readings'), respond: () => jsonResponse([{ owner: ADMIN, teaser: 't', full_report: 'ADMIN FULL', unlocked: false }]) }]);
  const { default: h } = await import('../api/get-report.js');
  const res = makeRes();
  await h(makeReqJSON({ method: 'GET', headers: { authorization: 'Bearer ' + adminToken }, query: { readingId: RID } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.full, 'ADMIN FULL');
});

/* --------------------------------- identity binding --------------------------------- */
test('enforceIdentity: binds on first use, then rejects a different person', async () => {
  // First use: users row has no binding yet -> should bind (PATCH) and not throw.
  let calls = installFetch([
    { test: (u, o) => u.includes('/rest/v1/users') && (o.method || 'GET') === 'GET', respond: () => jsonResponse([{ bound_first_name: null, bound_age: null }]) },
    { test: (u, o) => u.includes('/rest/v1/users') && o.method === 'PATCH', respond: () => jsonResponse(null) },
  ]);
  await enforceIdentity({ owner: OWNER, name: 'Gourab Bec', age: 35 });
  assert.ok(calls.some((c) => c.url.includes('/rest/v1/users') && c.method === 'PATCH'));

  // Now bound to Gourab/35 -> a different person must be rejected.
  installFetch([{ test: (u) => u.includes('/rest/v1/users'), respond: () => jsonResponse([{ bound_first_name: 'gourab', bound_age: 35 }]) }]);
  await assert.rejects(() => enforceIdentity({ owner: OWNER, name: 'Alice Smith', age: 22 }), (e) => e.status === 403);

  // Same person (±1 year birthday drift) is allowed.
  await enforceIdentity({ owner: OWNER, name: 'Gourab', age: 36 });
});

test('enforceIdentity: admin is exempt (no DB binding, any person allowed)', async () => {
  installFetch([]); // no DB routes; admin path must not hit the DB
  const r = await enforceIdentity({ owner: ADMIN, name: 'Anyone At All', age: 99 });
  assert.equal(r.admin, true);
});

/* --------------------------------- verify-otp --------------------------------- */
function otpRoutes(codeHash, { attempts = 0 } = {}) {
  return [
    // rate limiter
    { test: (u) => u.includes('/rest/v1/rate_events'), respond: (u, o) => (o.method === 'POST' ? jsonResponse(null) : jsonResponse([])) },
    // latest OTP row
    { test: (u, o) => u.includes('/rest/v1/otp_codes') && (o.method || 'GET') === 'GET', respond: () => jsonResponse([{ id: 'otp1', code_hash: codeHash, attempts, expires_at: new Date(Date.now() + 60000).toISOString() }]) },
    // attempts increment / consume
    { test: (u, o) => u.includes('/rest/v1/otp_codes') && o.method === 'PATCH', respond: () => jsonResponse(null) },
    // upsert user
    { test: (u) => u.includes('/rest/v1/users'), respond: () => jsonResponse(null) },
  ];
}

test('verify-otp: wrong code is rejected (brute-force resistance)', async () => {
  const calls = installFetch(otpRoutes(sha256hex('654321', process.env.OTP_SECRET)));
  const { default: h } = await import('../api/verify-otp.js');
  const res = makeRes();
  await h(makeReqJSON({ headers: { 'content-type': 'application/json' }, body: { channel: 'email', identifier: 'a@b.com', code: '000000' } }), res);
  assert.equal(res.statusCode, 400);
  // the attempt counter must be incremented on a wrong guess
  assert.ok(calls.some((c) => c.url.includes('/rest/v1/otp_codes') && c.method === 'PATCH'));
});

test('verify-otp: correct code returns a session token', async () => {
  installFetch(otpRoutes(sha256hex('123456', process.env.OTP_SECRET)));
  const { default: h } = await import('../api/verify-otp.js');
  const res = makeRes();
  await h(makeReqJSON({ headers: { 'content-type': 'application/json' }, body: { channel: 'email', identifier: 'a@b.com', code: '123456' } }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.split('.').length === 3);
  assert.equal(res.body.identifier, 'a@b.com');
});

test('verify-otp: malformed code is rejected before any DB hit', async () => {
  installFetch([]);
  const { default: h } = await import('../api/verify-otp.js');
  const res = makeRes();
  await h(makeReqJSON({ body: { channel: 'email', identifier: 'a@b.com', code: 'abc' } }), res);
  assert.equal(res.statusCode, 400);
});

/* --------------------------------- stripe webhook --------------------------------- */
test('stripe-webhook: rejects an invalid signature (no forged entitlements)', async () => {
  installFetch([]);
  const { default: h } = await import('../api/stripe-webhook.js');
  const res = makeRes();
  const req = makeReqStream({ headers: { 'stripe-signature': 't=1,v1=deadbeef' }, buffer: Buffer.from('{"type":"checkout.session.completed"}') });
  await h(req, res);
  assert.equal(res.statusCode, 400);
});
