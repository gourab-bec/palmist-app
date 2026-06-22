// tests/unit.test.mjs — pure-logic security units (no network).
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { isEmail, isPhone, isUuid, isOtp, principal, normalizeEmail, normalizePhone, cleanText, constantTimeEqual, hmac, isAdmin } from '../api/_lib/util.js';
import { ageFromDob, firstName } from '../api/_lib/identity.js';
import { signSession, verifySession } from '../api/_lib/auth.js';
import { sunSign, lifePathNumber, chineseZodiac } from '../api/_lib/zodiac.js';
import { renderReportHtml } from '../src/lib/markdown.js';

test('validators', () => {
  assert.ok(isEmail('a@b.co'));
  assert.ok(!isEmail('nope'));
  assert.ok(!isEmail('a@b'));
  assert.ok(isPhone('+14155551234'));
  assert.ok(!isPhone('12'));
  assert.ok(isUuid('123e4567-e89b-12d3-a456-426614174000'));
  assert.ok(!isUuid('xx'));
  assert.ok(isOtp('012345'));
  assert.ok(!isOtp('12'));
});

test('normalization + principal', () => {
  assert.equal(normalizeEmail('  A@B.Com '), 'a@b.com');
  assert.equal(normalizePhone('(415) 555-1234'), '+4155551234');
  assert.equal(principal('email', 'A@B.com'), 'email:a@b.com');
  assert.equal(principal('phone', '+14155551234'), 'phone:+14155551234');
  assert.throws(() => principal('carrier-pigeon', 'x'));
});

test('cleanText strips control chars and clamps', () => {
  const dirty = 'hi  there\n\nworld';
  const out = cleanText(dirty, 100);
  assert.ok(![...out].some((c) => c.charCodeAt(0) < 32)); // no control chars remain
  assert.equal(out, 'hi there world');
  assert.equal(cleanText('abcdef', 3), 'abc');
});

test('constantTimeEqual + hmac', () => {
  assert.ok(constantTimeEqual('abc', 'abc'));
  assert.ok(!constantTimeEqual('abc', 'abd'));
  assert.ok(!constantTimeEqual('abc', 'abcd'));
  assert.equal(hmac('x', 'k1'), hmac('x', 'k1'));
  assert.notEqual(hmac('x', 'k1'), hmac('x', 'k2'));
});

test('session sign/verify round-trip', () => {
  const t = signSession('email:a@b.com', { channel: 'email' });
  const p = verifySession(t);
  assert.equal(p.sub, 'email:a@b.com');
  assert.equal(p.channel, 'email');
});

test('session rejects tampering', () => {
  const t = signSession('email:a@b.com');
  const parts = t.split('.');
  // flip a char in the payload, keep the old signature
  const badPayload = Buffer.from(JSON.stringify({ sub: 'email:attacker@evil.com', exp: 9999999999 })).toString('base64url');
  const forged = parts[0] + '.' + badPayload + '.' + parts[2];
  assert.equal(verifySession(forged), null);
  assert.equal(verifySession('garbage'), null);
  assert.equal(verifySession(''), null);
});

test('session rejects a token signed with a different secret', () => {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'email:a@b.com', exp: Math.floor(Date.now() / 1000) + 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', 'WRONG-SECRET').update(head + '.' + body).digest('base64url');
  assert.equal(verifySession(`${head}.${body}.${sig}`), null);
});

test('session rejects expired token', () => {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'email:a@b.com', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(head + '.' + body).digest('base64url');
  assert.equal(verifySession(`${head}.${body}.${sig}`), null);
});

test('zodiac derived from DOB incl. cusps', () => {
  assert.equal(sunSign('2000-01-19').name, 'Capricorn');
  assert.equal(sunSign('2000-01-20').name, 'Aquarius');
  assert.equal(sunSign('2000-12-21').name, 'Sagittarius');
  assert.equal(sunSign('2000-12-22').name, 'Capricorn');
  assert.equal(sunSign('2000-03-21').name, 'Aries');
  assert.equal(sunSign('2000-07-23').name, 'Leo');
  assert.equal(chineseZodiac('2000-05-05'), 'Dragon');
  assert.equal(typeof lifePathNumber('1990-01-01'), 'number');
});

test('markdown renderer escapes HTML (no XSS)', () => {
  const out = renderReportHtml('Hello <script>alert(1)</script> & <img src=x onerror=alert(2)>');
  assert.ok(!out.includes('<script'));        // no live script tag
  assert.ok(!out.includes('<img'));           // no live element at all
  assert.ok(out.includes('&lt;script&gt;'));  // it survives only as inert escaped text
  assert.ok(out.includes('&amp;'));
});

test('admin allowlist matches configured principals (and normalizes phone)', () => {
  assert.ok(isAdmin('email:admin@test.com'));
  assert.ok(isAdmin('phone:+15005550006'));
  assert.ok(!isAdmin('email:someone@else.com'));
  assert.ok(!isAdmin('phone:+19998887777'));
});

test('ageFromDob + firstName helpers', () => {
  assert.equal(firstName('  Gourab  Bec '), 'gourab');
  assert.equal(ageFromDob('1990-01-01') >= 30, true);
  assert.equal(ageFromDob('not-a-date'), null);
});

test('markdown renders our safe tags', () => {
  const out = renderReportHtml('# Title\n\n## Section\n\n- one\n- two');
  assert.ok(out.includes('<h1>Title</h1>'));
  assert.ok(out.includes('<h2>Section</h2>'));
  assert.ok(out.includes('<ul>') && out.includes('<li>one</li>'));
});
