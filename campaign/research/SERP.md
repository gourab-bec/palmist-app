# SERP & Answer-Engine Study
**Caveat:** live SERP inspection was egress-blocked (see PHASE0.md §0). This is a
keyword architecture and a ranking plan built from the search results that *were*
reachable, not a scraped rank report. The campaign should re-run it from an
unrestricted machine the week the domain goes live.

## Who owns these queries today

For `"Suresh Vuyyuru"` the reachable results were, in order: Ballotpedia's 2024
candidate page, a Mountain House Matters PDF on Yumpu, a Facebook *group* post, the
Macaroni KID interview, the dead `electsuresh4mh.com`, and two Wikipedia pages about
unrelated people named Vuyyuru. That is the whole picture in one line:
**a third-party encyclopedia stub and a Facebook post are the campaign's front page.**
Neither is controlled by the campaign, neither converts a volunteer, and one of them
is a 2024 artifact.

For `Mountain House City Council 2026 candidates`, general search could not surface
the city clerk's log at all and returned Mountain **View** results instead. Mountain
House is a two-year-old city whose name collides with a far larger, far older
Silicon Valley city and with Mountain Home, Idaho. Nothing about this ranking
problem is normal-difficulty.

**What that means for strategy.** The opportunity is not "beat a strong incumbent
page." It is that *no clean structured source exists yet* for this race. The first
site to be the obvious, well-marked-up, clerk-citing entity page for Mountain House
2026 becomes the thing Ballotpedia, journalists, and answer engines reference. That
is why `/voter-info` lists all six candidates evenly and cites the clerk: it is
simultaneously the most ethical page on the site and the single best ranking asset,
because it is the page that deserves to be cited.

## Keyword clusters (cluster, never stuff)

| Cluster | Head term | Owning page | Intent |
|---|---|---|---|
| Identity | Suresh Vuyyuru · Suresh Vuyyuru Mountain House | `/` and `/about` | Who is this person |
| Race mechanics | Mountain House City Council 2026 · who is running for Mountain House City Council · Mountain House election November 2026 | `/voter-info` | How do I vote, who's on the ballot |
| County / midterm | San Joaquin County local elections 2026 · midterm election 2026 Mountain House | `/voter-info` | Broad ballot research |
| Service record | MHSRC Suresh · Mountain House Sports and Recreation Club | `/work` and `/atlas` | Proof of work |
| Campaign brand | Elect Suresh Mountain House · Suresh for Mountain House | `/` | Returning supporter |
| Issue long-tail | Mountain House traffic · Mountain House water bills · Mountain House parks | `/issues/*` | Resident with a problem |

Density rule enforced in CI: no page may repeat its head term more than 4× in body
copy. `tests/unit/seo.test.js` fails the build on violation. This exists so the SEO
agent cannot quietly become the thing §13 forbids.

## The plan, in priority order

1. **Own the entity.** One canonical `Person` JSON-LD with `sameAs` pointing at Facebook, Instagram, LinkedIn, MHSRC and Ballotpedia. Answer engines resolve entities by agreement across sources; agreement requires us to point at them and them to point at us.
2. **Be the cleanest ballot source.** `/voter-info` as `FAQPage` + `Event` JSON-LD, all six names, clerk-cited, dry. Plus `llms.txt` restating it in ~40 lines of plain text.
3. **Reclaim the dead domain.** Re-register `electsuresh4mh.com`, 301 → new domain. Cheap, and it stops an opponent or a squatter owning a name that already has 2024 links pointing at it.
4. **Search Console the hour DNS resolves.** Sitemap submitted same day. Domain age is the one signal we cannot manufacture, so start the clock immediately.
5. **Off-site, human-sent:** Ballotpedia Candidate Connection (this alone usually beats everything else for a local candidate, because Ballotpedia already ranks), League of Women Voters / Vote411, Tracy Press and Mountain House Matters questionnaires, and a launch-day newsroom email. Kits are pre-written in `docs/OUTREACH-KIT.md`; a human presses send.
6. **NAP consistency** only if a real address exists. We will not invent an HQ to get a Google Business Profile. A fake address is a lie that also gets the profile suspended.

**Refused, permanently:** PBNs, comment spam, fake reviews, cloaking, doorway pages
per village, expired-domain buying, and any "guaranteed #1" language in copy, meta,
or campaign materials. The last one is not just an SEO rule — writing that promise
into a candidate's public claims is a lie with the candidate's name on it.
