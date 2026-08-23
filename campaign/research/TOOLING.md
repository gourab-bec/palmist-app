# Tooling Matrix — scored, decided, locked
**Decided:** 2026-08-19 · **Lock:** no stack churn after Phase 2. Changing a row below requires an Orchestrator sign-off note in QA_LOG.md.

Scoring 1–5, higher is better. Weighted columns: performance and a11y are doubled,
because they are the two Definition-of-Done items that can actually fail the launch.

## Framework

| Option | Cost | Ship speed | Perf ×2 | A11y ×2 | Security | SEO control | Campaign features | Lock-in | CA realism | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|
| **Astro (static + islands)** | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | **54** |
| Next.js App Router (edge) | 3 | 4 | 3 | 4 | 4 | 5 | 5 | 3 | 4 | 43 |
| 11ty | 5 | 4 | 5 | 4 | 5 | 5 | 2 | 5 | 4 | 48 |
| SvelteKit | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 43 |
| Remix / RR7 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 3 | 3 | 38 |

**Winner: Astro.** The decisive argument is not benchmark trivia, it is the failure
mode. A council-race site is ~15 mostly-static documents that must survive an
election-night traffic spike and be readable with JavaScript disabled. Astro ships
zero JS by default and makes shipping JS a deliberate act (`client:*`), which means
the ≤90 KB budget is enforced by the framework's grain instead of by willpower.
Next.js would hit the same numbers only if we fought it the whole way, and every
React island is a chance for a hydration bug to eat the volunteer form on iOS Safari.

Rejected outright as the craft vehicle: WordPress + page builder, Wix, Squarespace,
Campaign Partner / PoliEngine templates. Not snobbery — they cannot hold a 90 KB JS
budget or a token system, and the entire thesis of §2 is that the quality *is* the
argument. If the treasurer later needs a no-code editor, the answer is a Git-backed
CMS over the existing MDX/JSON, not a rebuild.

## Hosting

| Option | Cost | Robustness | Perf | Ops burden | Verdict |
|---|---|---|---|---|---|
| **Cloudflare Pages + Workers + R2 + D1** | 5 | 5 | 5 | 5 | **Winner** |
| Netlify | 4 | 4 | 4 | 5 | Fine; weaker WAF story |
| Vercel | 3 | 4 | 4 | 4 | Only if Next had won |
| Fly.io / Railway | 3 | 4 | 3 | 3 | App tier only, not needed |
| Anything AWS-shaped | 1 | 4 | 4 | 1 | A city council race does not need EKS |

**Winner: Cloudflare Pages.** Static assets served from Anycast edge with no origin
to melt is the correct answer to pre-mortem story P-07 (down on Election Day).
Unlimited bandwidth on the free tier, WAF and rate limiting included, Turnstile free,
Workers for the one dynamic surface (the bot) and the two form endpoints.

**Portability note:** the build output is plain static HTML/CSS/JS. If the campaign
already has a host, `campaign/site/dist` drops onto Netlify, Pages, S3+CloudFront,
or a $5 VPS unchanged. The Worker endpoints are the only Cloudflare-specific code
and they are isolated in `campaign/site/functions/` behind a documented HTTP
contract, so porting them to any serverless runtime is a rewrite of ~150 lines.
We are not locked in; we are defaulted in.

## Data, forms, money

- **Volunteer leads:** Cloudflare D1 (SQLite at the edge). Schema in ARCHITECTURE.md. Turnstile + honeypot + rate limit in front.
- **Bot logs:** D1, question text only, no IP stored with the utterance, 90-day retention.
- **Donate:** processor redirect — Anedot / WinRed / whatever the treasurer already uses. **We store zero card data and host zero payment form.** The donate page is a redirect with the disclaimer, not an integration. This is deliberate: PCI scope of zero is a security posture, not a shortcut.
- **Transactional mail:** Cloudflare Email Routing → campaign inbox; Resend if templated mail is ever needed.
- **SMS:** not built. A 10DLC-compliant provider is only worth wiring once the campaign has written consent language. The volunteer form captures an *unchecked* SMS opt-in so the consent exists when they are ready.

## Analytics

**Cloudflare Web Analytics** (cookieless, no consent banner needed for it) as the
default, with an optional self-hosted Umami if the campaign wants event funnels.
Event dictionary in ANALYTICS.md. No GA4. If the campaign insists on GA4 later, it
loads only behind the consent gate that already exists in `ConsentBanner.astro`.

## Bot

**Anthropic Claude API via a Worker**, retrieval-only over `content/facts.json` and
the content markdown. Model pinned in one constant. Falls back to a fully static
12-question FAQ if the key is absent or the API errors — the fallback is the default
state of the panel, not an error screen, so a dead API degrades invisibly.

## Testing

Vitest (unit) · Playwright (e2e, visual, keyboard) · `@axe-core/playwright` (a11y) ·
a bespoke byte-budget test (cheaper and more deterministic than Lighthouse CI in
this sandbox; Lighthouse config is committed for the campaign's own CI) ·
`npm audit` + a secret scan · a 50-question bot eval harness that runs without
network access against the retrieval layer.
