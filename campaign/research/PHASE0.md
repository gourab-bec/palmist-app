# Phase 0 — Research Log
**Run date:** 2026-08-19 · **Agent:** Research · **Status:** complete with one documented limitation

## 0. Network limitation (read this before trusting any citation)

This build ran inside a sandboxed execution environment whose egress proxy blocks
direct HTTP fetches to almost every public host. Confirmed blocked during Phase 0:

| Host | Result |
|---|---|
| `www.mountainhouseca.gov` | `EGRESS_BLOCKED` |
| `ballotpedia.org` | `EGRESS_BLOCKED` |
| `mountainhouse.macaronikid.com` | `EGRESS_BLOCKED` |
| `www.mhsrclub.org` | `EGRESS_BLOCKED` |
| `www.fppc.ca.gov` | `EGRESS_BLOCKED` |
| `electsuresh4mh.com` | `ENOTFOUND` — DNS does not resolve (see finding F-1) |

A web **search** index was reachable and was used for corroboration. Full-text
retrieval of primary documents was not.

**Consequence, stated plainly:** no claim in this repository is marked
`confidence: "verified"` on the strength of this session alone. Everything
sourced from the master prompt's seed pack is marked `confidence: "seed"`;
anything a search result independently echoed is marked `confidence: "corroborated"`.
The site's fact renderer refuses to print any claim whose `allowed_on_site` is
false, and `npm run verify:facts` fails the build if a claim reaches the UI
without a source. A human with unrestricted network access must run
`campaign/scripts/verify-sources.md` before launch. That task is item 7 in LAUNCH.md.

This is the honest version. The alternative — writing plausible citation URLs next
to claims nobody actually opened — is exactly the failure mode §3.2 and pre-mortem
story P-02 exist to prevent.

## 1. Findings

**F-1 · The 2024 campaign domain is dead.** `electsuresh4mh.com` does not resolve
in DNS. The master prompt lists it as `prior_site` and as a live 2024 contact.
Treat it as expired. Implication: the campaign has *no* incumbent web entity to
inherit — no backlinks, no Search Console history, no domain age. Every ranking
signal starts at zero on the new domain, which makes the technical-SEO work in §13
load-bearing rather than decorative. It also means the old domain is squattable;
LAUNCH.md item 4 tells the campaign to re-register it and 301 it to the new site.

**F-2 · Search corroborates the service spine, not the specifics.** Independent
search results echo: Suresh Vuyyuru as a 2024 Mountain House City Council
candidate; "dad, husband, farmer and Software Engineer"; MHSRC founded 2020 with
him as the "visionary behind" it; volleyball / badminton / ping pong tournaments
and cultural performances; the March 5, 2024 incorporation election that chose a
mayor and four council members. None of the *numbers* (vote totals, event counts,
dates beyond 2020/2024) were corroborated. They are not on the site.

**F-3 · MHSRC's legal entity is probably "Mountain House Sports Club Inc"**
(Tracy, CA — a nonprofit EIN appears in search results under that name). The site
must not assert the legal name, the 501(c) subsection, or nonprofit status until
the campaign confirms which entity is which. Nonprofit status matters beyond
pedantry: if MHSRC is a 501(c)(3), the §13 idea of a link from mhsrclub.org
saying "our founder is running for City Council" is a political-activity problem
for *them*, not for us. Flagged as a human-decision blocker, not an engineering task.

**F-4 · The 2026 field is six candidates for two seats — seed-only.** The clerk's
candidate log could not be opened. `/voter-info` therefore renders all six names
from the seed pack *and* renders a visible "verify against the clerk's log"
banner with the live link, and the six names carry
`confidence: "seed"`. If the campaign confirms the log, flip one flag in
`content/voter-info.json` and the banner disappears.

**F-5 · There is no evidence he served on the Parks & Recreation Commission.**
The seed pack says "recommended as an applicant." The site says
"applied to serve," never "served." This is the single most tempting overclaim in
the fact pack and the one most likely to be screenshotted by an opponent.

## 2. What Phase 0 could not collect (handed to the campaign)

Full bio · education · employer (if he wants it public) · farming details ·
2022 and 2024 vote totals · every MHSRC event with dates · Rotary role and the
exact award name · school volunteer roles · 2026 committee name and treasurer ·
donate processor URL · 40–80 community photos with rights and captions ·
minor-consent forms · endorsement letters · high-res portrait · yard-sign photo ·
Ballotpedia Candidate Connection submission · Google Business Profile decision.

`content/facts.json` carries a stub with `allowed_on_site: false` for each of
these, so the moment the campaign supplies one, it is a data edit — not a
redesign. `npm run facts:todo` prints the outstanding list.
