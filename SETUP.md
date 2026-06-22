# Palmly v2 — Setup & Security Guide

This upgrade adds: mandatory sign-up (email **or** phone) with OTP, a teaser-gated palm
reading, a **$2** unlock that reveals the full report and enables a structured **PDF**
download, and a **Daily Horoscope** subscription (**$3.99/mo**, **$29.99/yr**) that emails
each subscriber a personalized reading at **6 AM their local time**, also downloadable as PDF.

Stack (matches your repo): **Vercel** serverless functions · **Supabase** (Postgres) ·
**Anthropic Claude** · **Stripe** · **Resend** (email) · **Twilio** (SMS).

> Heads-up: in chat you mentioned **Netlify**, but the repo is configured for **Vercel +
> Supabase**, so this build targets Vercel. If you truly want Netlify, only the platform
> glue changes (function signatures + cron config); all the logic in `api/_lib` is portable.

---

## File map

```
index.html                  ← front-end shell (static assets only — no inline scripts/CDNs)
src/app.jsx                 ← the React app source (edit here)
src/lib/markdown.js         ← XSS-safe markdown renderer (unit-tested)
app.js                      ← COMPILED bundle from src/app.jsx (committed; rebuilt on deploy)
build.mjs                   ← esbuild step (classic JSX → app.js)
utilities.css               ← small static utility classes (replaces Tailwind Play CDN)
vendor/                     ← self-hosted React, ReactDOM, jsPDF (pinned) → CSP 'self'
tests/                      ← node:test security suite (run: npm test)
.github/workflows/ci.yml    ← CI: build, tests, npm audit, CSP & secret guards
vercel.json                 ← functions, hourly cron, security headers + strict CSP
package.json                ← stripe dep, esbuild dev dep, build/test scripts, ESM
supabase-schema-v2.sql      ← new tables + RLS lockdown
.env.example                ← every env var you need
api/
  read-palm.js              ← generates full reading, stores it, returns ONLY a teaser
  get-report.js             ← returns full report to the owner IF unlocked (else 402)
  send-otp.js / verify-otp.js   ← email/SMS OTP sign-up
  create-checkout.js        ← Stripe Checkout ($2 unlock or subscription)
  verify-checkout.js        ← instant entitlement after redirect
  stripe-webhook.js         ← source of truth for entitlements
  horoscope-signup.js       ← stores profile; derives zodiac from DOB
  daily-horoscope.js        ← hourly cron; emails at local 6 AM
  get-horoscope.js          ← fetch a daily horoscope for on-site PDF download
  account-delete.js         ← user-initiated data erasure (privacy)
  _lib/                     ← shared, route-ignored helpers (auth, db, stripe, etc.)
```

## Deploy steps

1. **Merge files** into `gourab-bec/palmist-app` (replace `index.html`, `api/read-palm.js`,
   `vercel.json`, `package.json`; add the new `api/*` and `api/_lib/*`).
2. **Supabase** → SQL Editor → run `supabase-schema-v2.sql`.
3. **Resend** → verify your sending domain; create an API key. **Twilio** (only if you keep
   phone sign-up) → get SID/token and a sending number or Messaging Service.
4. **Stripe** → copy your secret key. Create a webhook endpoint pointing at
   `https://palmist.getbriefed.to/api/stripe-webhook`, subscribe to:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`. Copy its signing secret.
   (Prices can be left to the built-in inline $2 / $3.99 / $29.99, or set Price IDs.)
5. **Vercel** → add every variable from `.env.example` (generate secrets with
   `openssl rand -hex 32`). Set `CRON_SECRET` so the daily job is protected — Vercel Cron
   automatically sends it as a Bearer token.
6. **Deploy.** Vercel runs `npm install` then `vercel-build` (`node build.mjs`) automatically,
   which compiles `src/app.jsx` → `app.js`. (`app.js` is also committed, so it works even
   without a build step.) `utilities.css` and `vendor/*` are served as static files. The hourly
   cron in `vercel.json` drives the 6 AM-local emails (it checks each subscriber's timezone each hour).

### Editing the front-end later

The page no longer compiles JSX in the browser. Edit `src/app.jsx` (or `src/lib/*`), then:

```bash
npm install      # once
npm run build    # regenerates app.js
npm test         # run the security suite
```

Commit the updated `app.js`. CI will fail the build if `app.js` is out of date.

## Tests & CI

`npm test` runs a `node:test` suite (no network — deps are mocked) covering the security-
critical paths: JWT sign/verify incl. tamper/expiry/wrong-secret rejection; input validators;
DOB→zodiac (incl. cusp dates); the markdown renderer's XSS escaping; and handler behaviour —
`get-report` returns 401/403/402/200 correctly (locked reports never leak full text),
`verify-otp` rejects wrong/malformed codes and increments the attempt counter, and
`stripe-webhook` rejects invalid signatures. `.github/workflows/ci.yml` also runs
`npm audit`, asserts the CSP stays locked (`script-src 'self'`, no `unsafe-eval`/`unsafe-inline`),
and scans for committed secrets.

## Test checklist

- Reveal a reading → forced to sign up → OTP arrives → teaser shows, rest blurred/locked.
- Click unlock → Stripe test card `4242 4242 4242 4242` → redirected back → full report + PDF.
- Subscribe to Daily Horoscope (test card) → row in `subscriptions` flips to `active`.
- Temporarily set a subscriber's `timezone` to one where it's ~6 AM and hit
  `/api/daily-horoscope` with `Authorization: Bearer <CRON_SECRET>` → email arrives.

---

## Access model — admin testing + one-account-one-person

- **Admin allowlist (you).** Set `ADMIN_PRINCIPALS` in Vercel env to a comma-separated list of
  emails/phones (E.164), e.g. `email:gourab.bec@gmail.com,phone:+16128674133`. Those accounts
  **bypass all payment** (readings auto-unlock, daily horoscope auto-activates, no Stripe), are
  **exempt from rate limits**, and can run readings for **any person / any zodiac** (any name,
  age, and hands) — ideal for testing. Keep these real values **only in env**, never in the repo
  (the committed `.env.example` uses placeholders, and tests use a fake number).
- **Everyone else = one person per account.** The first reading binds the account to that
  person's **first name + age** (`users.bound_first_name`/`bound_age`). Any later reading or
  horoscope signup with a different person is rejected with a clear 403 — so a paying user can't
  generate readings for friends; each person signs up and pays for their own. (±1 year of age
  drift is tolerated so a birthday between a reading and a horoscope signup doesn't lock them out.)
- You still pay nothing as admin, but the OTP login step is unchanged (so phone admin login needs
  Twilio configured, or use the email admin entry).

## Security & privacy — what's implemented

- **Server-side gating.** Full reports never reach the browser until `unlocked = true`.
  The teaser is computed server-side; the full text is only released by `get-report` to the
  authenticated **owner**.
- **Auth.** OTP codes are random (CSPRNG), stored **hashed** (HMAC-SHA256), single-use,
  10-minute expiry, max-5 attempts, with **constant-time** comparison. Sessions are signed
  HS256 tokens (no third-party JWT lib). Every protected endpoint verifies the token and
  checks **resource ownership**.
- **Payments.** Prices are server-defined (never trusted from the client). Entitlements come
  from Stripe via **signature-verified** webhooks plus an ownership-checked redirect verify.
  All grants are **idempotent**.
- **Abuse limits.** Persistent, Supabase-backed rate limits on OTP send/verify and reading
  generation, per principal and per IP.
- **Data privacy.** Raw palm **images are never stored** — only derived text. PII lives in
  Supabase with **RLS enabled and no policies**, so only the server's service-role key can
  read it. Users can erase everything via `account-delete`. CORS is locked to your origin.
- **Headers / CSP.** HSTS, `nosniff`, `frame-ancestors 'none'`, Referrer-Policy,
  Permissions-Policy, and a strict Content-Security-Policy: **`script-src 'self'`** with **no
  `unsafe-eval` and no `unsafe-inline`** for scripts, and **no third-party script origins** —
  the in-browser Babel and Tailwind Play CDN were removed, JSX is pre-compiled, and React/
  ReactDOM/jsPDF are self-hosted. (`style-src` keeps `unsafe-inline` only for inline style
  attributes — style injection is far lower risk than script execution.)
- **Automated tests + CI.** A security test suite plus a CI pipeline that audits dependencies
  and guards the CSP and against committed secrets on every push/PR.
- **Input handling.** Strict validation on every field; request size caps; HTML is escaped
  before any markdown rendering (no XSS via report content).

## Honest security note (please read)

I've applied defense-in-depth and current best practices, but **no system is provably
"impossible to break into."** Anyone claiming otherwise is overselling. Your security depends
on operational hygiene that's now in your hands:

- Keep all secrets in Vercel env vars only; **rotate** them periodically and immediately if leaked.
- Confirm Supabase **RLS is on** for every table (the schema does this; verify in the dashboard)
  and that the **anon** key has no extra grants.
- Add monitoring/alerting (Vercel logs, Stripe Radar, Supabase logs) and consider a WAF / bot
  protection (e.g. Vercel's, or Cloudflare in front) for stronger DDoS/abuse resistance.
- Before launch, run an independent review or a pentest. I can help wire up automated security
  tests, but I can't certify invulnerability.
