# Hast Rekha — Deployment Guide

Ship the palmist app to a real domain in ~30 minutes.

## What you have

```
palmist-app/
├── index.html              ← The frontend (rename palmist.html → index.html)
├── api/
│   └── read-palm.js        ← Vercel serverless function (the API proxy)
├── package.json            ← Tells Vercel this is a Node project
├── vercel.json             ← Vercel routing config
└── supabase-schema.sql     ← Tables for logging + Pro users
```

## Step 1 — Set up the repo (5 min)

```bash
mkdir palmist-app && cd palmist-app
mkdir api
# Move files in:
#   palmist.html → index.html
#   api-read-palm.js → api/read-palm.js
git init
git add .
git commit -m "Initial Hast Rekha palmistry app"
# Push to a new private GitHub repo (e.g. gourab-bec/palmist-app)
```

## Step 2 — Supabase schema (5 min)

Go to your Supabase project (the one you already use for getbriefed.to, or create a new one). 
Open SQL Editor → New Query → paste from `supabase-schema.sql` → Run.

This creates two tables: `palm_readings` (every reading logged) and `pro_users` (paid users).

## Step 3 — Deploy to Vercel (10 min)

1. Go to vercel.com → New Project → Import the GitHub repo.
2. Framework Preset: **Other** (it's just HTML + serverless function — no build step).
3. Add these Environment Variables:

   | Name | Value | Where to get it |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | `sk-ant-...` | console.anthropic.com → API Keys |
   | `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase → Settings → API |
   | `SUPABASE_SERVICE_KEY` | `eyJ...` (the **service_role** key, not anon) | Same place |
   | `ADMIN_PRO_TOKEN` | any long random string (your unlimited-access token) | Generate one: `openssl rand -hex 32` |

4. Deploy. You'll get `palmist-app.vercel.app`.

## Step 4 — Wire your domain (5 min)

In Vercel → Project → Settings → Domains → Add `palm.getbriefed.to`.
Vercel will give you a CNAME record to add at your DNS provider (wherever getbriefed.to is registered).

Done. Live at `palm.getbriefed.to`.

## Step 5 — Test it

Visit your domain, upload your own palm photos, see a reading appear in 30 seconds. 
Check Supabase → Table Editor → palm_readings — your test should show up.

To grant yourself unlimited (Pro) access while testing:
```js
// In your browser console on palm.getbriefed.to:
localStorage.setItem('palmist_pro_token', 'YOUR_ADMIN_PRO_TOKEN_FROM_ENV');
localStorage.setItem('palmist_pro_email', 'gourab.bec@gmail.com');
```

## Monetization — what to add next

The current app has the free-tier rate limit (5 readings per IP per hour) and a Pro tier hook. To start charging:

1. **Stripe Payment Link** — fastest path. Create a $9 one-time Payment Link in Stripe dashboard. Add a "Get Pro Access" button on the upgrade screen that opens it. On payment success, Stripe webhook → insert into `pro_users` table → email user the token.

2. **OTP flow** — match the getbriefed.to pattern. Email → 6-digit code via Resend → on verify, look up `pro_users` and store token in localStorage. Same Supabase backend you already have.

3. **PDF download** — Pro feature. After the reading, "Download as PDF" button calls a `/api/render-pdf` function (using puppeteer-core or a hosted service like Browserless). Sells naturally.

4. **Gift readings** — huge unlock for Mother's Day, Diwali, birthdays. Buyer pays $19, gets a beautiful link to send. Recipient gets a personalized reading page. Indian diaspora market loves this.

5. **Shareable link with preview card** — each reading gets a `/r/[uuid]` URL. The reading viewer is public (with a soft paywall for full version). Built-in viral loop.

## Costs

- Vercel Hobby: free until you hit 100GB bandwidth/month
- Supabase free tier: 500MB DB, 50K monthly active users
- Anthropic API: ~$0.05-0.10 per reading (Sonnet 4.5, two images, ~6K output tokens)
- Resend (for emails): 3,000 free emails/month

At $9/reading you have ~98% margin. At $19 gift readings, even better.

## Optimizations to consider

- **Image compression before upload.** A 4MB phone photo bloats the request. Use canvas downscale to ~800px wide before sending. Saves API cost and speed.
- **Streaming response.** Switch the API to streaming so the reading appears word-by-word like in Claude.ai. Higher perceived quality, lower bounce rate.
- **Hindi/Bengali version.** Same prompt, "Respond in Hindi/Bengali." Unlocks the entire Indian market immediately.
- **A/B test pricing.** $9 vs $19 vs $29. Indian diaspora users in the US pay much more than home market — segment.
