# The Six Human Tasks
Everything else on this project is automatable. These six are not, because they
require money, a signature, a legal decision, or a credential no agent should hold.

Status legend: ☐ not started · ☑ done · ⚠ blocked

---

## ☐ 1. Domains — Namecheap → Cloudflare

### 1a. What to buy

| Domain | Why | Priority |
|---|---|---|
| `sureshformountainhouse.com` | **Primary.** Matches how residents actually search: first name + place. Long, but it is the one that goes on the yard sign's small print and in Search Console. | Buy |
| `sureshformh.com` | Short. This is the one for QR codes, Instagram bio, and anywhere a human types it by hand. 301 → primary. | Buy |
| `electsuresh4mh.com` | **Reclaim.** This was the 2024 campaign domain and it no longer resolves — it lapsed. Whatever backlinks 2024 earned still point here, and right now anyone can take a name with his brand on it. 301 → primary. | Buy |
| `vuyyuruformountainhouse.com` | Defensive only. Cheap insurance against a typo-squat. 301 → primary. | Optional |

**Register for at least 3 years, not 1.** The 2024 domain lapsing is exactly the
failure this prevents, and a domain that expires in October 2026 expires two weeks
before the election. Turn on **auto-renew** and **registrar lock** on every one.

**Turn on Namecheap's free domain privacy (WhoisGuard)** for all of them. FPPC
requires the disclaimer on the site; it does not require his home address in a
public WHOIS record.

### 1b. Point them at Cloudflare

For each domain, in this order:

1. **Cloudflare** → *Add a site* → type the domain → choose the **Free** plan.
2. Cloudflare scans existing DNS (there will be none) and then shows you
   **two nameservers**, something like `xxx.ns.cloudflare.com`. Copy both.
3. **Namecheap** → *Domain List* → *Manage* → **Nameservers** → change
   `Namecheap BasicDNS` to **Custom DNS** → paste both → save (the green check).
4. Back in Cloudflare, click *Check nameservers*. Usually minutes; the official
   window is up to 48 hours. The domain shows **Active** when it has switched.

Do the primary domain first and let it go Active before you do the others. If
something is wrong with the process you want to find out on one domain, not four.

### 1c. Settings to set once each domain is Active

- **SSL/TLS → Overview → Full (strict)**. Not Flexible. Flexible allows an
  unencrypted hop and will get flagged in the security review.
- **SSL/TLS → Edge Certificates → Always Use HTTPS: On**.
- **Automatic HTTPS Rewrites: On**.
- **DNSSEC: enable** (Cloudflare gives you a DS record to paste back into
  Namecheap under *Advanced DNS*).
- **HSTS: leave OFF for now.** Turn it on only after the real site has served
  HTTPS cleanly for a few days. HSTS is hard to undo — if you enable it with a
  max-age and something is broken, browsers will refuse to load the site over
  HTTP for that entire duration. This is why the master prompt says "once HTTPS
  is proven."

### 1d. Connect the site (after the build exists)

Cloudflare → **Workers & Pages** → *Create* → *Pages* → connect the GitHub repo.
Build command and output directory come from the repo's own config. Then
**Custom domains** → add both the apex (`sureshformountainhouse.com`) and `www`.
Cloudflare creates the DNS records itself; do not hand-create them first.

For each secondary domain: **Rules → Redirect Rules** → single redirect,
match *hostname equals `sureshformh.com`*, then **301** to
`https://sureshformountainhouse.com` preserving path and query.

### 1e. Optional but worth it: a real campaign email address

Cloudflare **Email Routing** (free) forwards `suresh@sureshformountainhouse.com`
to the existing Gmail. Cloudflare adds the MX records for you. A campaign address
on the campaign domain reads more seriously than a gmail.com on a yard sign, and
it survives a volunteer change later.

---

## ☐ 2. Committee name — treasurer

The site currently renders an interim disclaimer from `content/campaign.config.json`:

> Paid for by the campaign to elect Suresh Vuyyuru for Mountain House City Council 2026.

**This is a placeholder and a launch blocker.** Get the exact registered committee
name from the treasurer, set `committee_name` and flip `committee_name_confirmed`
to `true`. It then renders in the footer of every page, on every generated share
image, and in the bot's first message.

Ask the treasurer for the name **as filed**, character for character. Not the
name they call it in conversation.

---

## ☐ 3. Donate processor URL

Whatever the treasurer already uses — Anedot, WinRed, ActBlue. Set `donate_url`
in the config and the donate page becomes a redirect.

**The site hosts no payment form and stores no card data, deliberately.** That
keeps PCI scope at zero. If anyone proposes embedding a card field directly,
that is a different and much more expensive conversation.

---

## ☐ 4. Search Console

The hour DNS goes live: add the property at
[search.google.com/search-console](https://search.google.com/search-console),
verify by DNS TXT record (Cloudflare → DNS → add TXT), submit the sitemap.

Do this on day one even though the site is new. Domain age is the one ranking
signal that cannot be manufactured, so the clock should start immediately. Add
Bing Webmaster Tools at the same time; it is ten extra minutes and it feeds
several answer engines.

---

## ☐ 5. Endorsement permissions

`content/endorsements/` is empty by design and `/endorsements` renders an honest
empty state.

To publish one, you need **written** permission — email is fine — saying the
campaign may publish their name, title, and quote. Save it in that folder, add
the matching entry to `endorsements.json`, and the test suite verifies the two
match before the site will build.

An empty endorsement wall is not a weakness. A wall of names who never agreed is
a story in the Tracy Press.

---

## ☐ 6. Newsroom email, launch day

Draft is ready to adapt in `docs/OUTREACH-KIT.md` once written. Send to Tracy
Press and Mountain House Matters the day the site ships.

Also human-sent, and higher value than most of the technical SEO work:

- **Ballotpedia Candidate Connection.** Ballotpedia already ranks first for his
  name. Filling in their questionnaire is the single highest-leverage off-site
  action available.
- League of Women Voters / Vote411 questionnaire.
- **Do not** create a Google Business Profile unless a real campaign address
  exists. Inventing one gets the profile suspended and is a lie besides.

### ⚠ One thing to decide, not to do

The master prompt suggests a link from `mhsrclub.org` saying "our founder is
running for City Council." **Check MHSRC's nonprofit status before anyone adds
that link.** If MHSRC is a 501(c)(3), endorsing or promoting a candidate is a
problem for the club's tax status, not just an awkward look. That is a question
for whoever handles MHSRC's filings, and the answer might be no.
