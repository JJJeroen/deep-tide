# Session Handoff - 2026-11-23 (3): Generations (M9 part 5)

**Project:** deep-tide
**Status:** M9 part 5, the shifting-baselines campaign "Generations", built to the plan plus the owner's answers a-f
(recorded in docs/plans/2026-11-09-m9-memory-release.md part 5), reviewed in a fresh Opus context, live (see Work Completed).

## Decisions Made
- Owner's answers a-f recorded in the plan first (commit 05a64db). Built only what part 5 plus those answers define.
- **Heal time 300 sim s (5 min), not 600.** Measured with the new tune.js `campaign` scenario, 40 five-season campaigns per bot
  on the same oceans (seed gen40), season starts 2-5 (160 per bot):

  | heal | bot | species at start (of 7) | biodiversity at start | sharks missing | turtles missing | campaign score |
  |---|---|---|---|---|---|---|
  | 600 s | steward | 6.9-7.0 | 93-95% | 3 | 0 | 35.1 |
  | 600 s | measured | 6.8-6.9 | 93% | 20 | 0 | 51.2 |
  | 600 s | greedy | 6.4-6.7 | 91-92% | 64 | 0 | -11.9 |
  | 300 s | steward | 6.8-7.0 | 93-94% | 10 | 0 | 35.4 |
  | 300 s | measured | 6.5-6.6 | 90-91% | 44 | 23 | 49.0 |
  | 300 s | greedy | 5.5-5.7 | 82-85% | 131 | 86 | -10.2 |

  The first ocean (season 1 start) is 7 species, 91%. At 600 s even greedy's ocean healed almost fully (1-2 points under the
  steward's), so the generations barely differed. At 300 s the steward still hands on an ocean as rich as it got, a careful
  player about as rich as the first, and greedy's sharks and turtles mostly stay gone. Greedy's season scores fall over the
  campaign (-4, -11, -9, -8, -18). The heal also costs half as much.
- **The heal runs in a Web Worker** (heal.js), started the moment a season ends, so it is done while the end card is read
  (measured 1.7-2.1 s in headless Chromium for 300 s; in the browser a step costs 0.18 ms, about 4x less than in node's vm).
  The heal card then plays its 12 snapshots back at 4 a second with a bar and a clock ("Left alone 2:30 of 5:00"), so the
  player sees time pass. No worker (file://) or a failed / silent one (15 s watchdog): the page steps it itself.
- A season is simply run mode (`mode === 'run'`) plus `CAMP`; every run rule, hint, HUD and test applies unchanged.
- Seeds: season k `<campaign>.s<k>`, the heal after it `<campaign>.h<k>`. Season 1 = resetWorld(`.s1`) + startRun: an
  ordinary Anthropocene run (smoke-checked). `?seed=` names the campaign.
- At the heal: no game (no demand, no head office), trawlers still out are gone, the protected area is lifted, warmth back to
  TEMP_START; ghost nets still drifting keep fishing until they rot (they are part of the ocean). At a season start: the
  clock back to 0 (times such as S.harm kept relative), a fresh log that says "The water is calm.", the protected area lifted.
  The deep carries over too (the plan said S and D).
- Saves: at a season's end and after the heal; nothing during play, so a reload mid-season starts that season over (same seed,
  same ocean; Reset does the same on purpose). Continuing a later season opens on its ready card ("While it was left alone:
  ...") so a heal that finished in the background still shows that time passed.
- Storage: one key `deep-tide.generations`, versioned (record v 1, ocean GEN.V 1; an older or unreadable save is ignored and
  the menu says so), 110-200 KB measured (agents as key list + rows; -0, NaN and the infinities survive JSON). Only two small
  pictures (season 1's first timelapse frame ~14 KB, the last season's end); never the timelapse. A refused write keeps the
  previous save (setItem is all or nothing; every save is a whole checkpoint) and retries once without the pictures; the card
  then says the latest was not kept. No storage at all: the campaign plays on, it just cannot resume.
- Abandon asks in place (no window.confirm). After at least one season it shows the final screen for the seasons played;
  the save goes. The final screen (after season 5 too) clears the save when shown.
- Small wording/layout calls (mine): menu text "Five seasons on one ocean. Each new fleet inherits the water the last one
  left, and calls it normal."; heal card "The fleet stays in port / No nets, no waste, no head office..."; ready card "A new
  generation takes over the fleet. To them, this is how the ocean has always looked."; final line "Every season began with the
  same words: The water is calm."; the steward paragraph only on season 1's card (later cards show the scores so far); the menu
  is now a 2 x 2 grid; the file is generations.js (not campaign.js: content blockers).

## Work Completed
- 05a64db docs(plan): the owner's answers. 5ece473 feat(generations). Then the review fixes (see below) and this handoff.
- sim.js: GEN, oceanState/loadOcean, packRows, jsonPack/jsonUnpack, startHeal, beginSeason, oceanSummary (headless, shared
  with tune.js). deep.js: deepState/loadDeep/seedDeep. heal.js (worker), generations.js (page), ui.js hooks (CAMP declared there,
  calls guarded: with generations.js blocked every other mode still works, checked), index.html (menu button, CSS), sw.js
  CORE + generations.js, heal.js (network first, no cache rename needed). tune.js `campaign` scenario.
- Determinism (smoke): saved/loaded through JSON at the season's end and after the full heal = never saved (headless, with
  arrivals on the boundary step); the page's own path (localStorage, newGame, read back as after a reload) = never saved;
  the worker heal = the page's heal, also end to end over http; season 1 = an Anthropocene run on that seed.
- Anthropocene run unchanged: a scripted 10-minute all-tools run with b0113aa's sim (read from git) vs now, same result
  (smoke, node); tune.js anthro old vs new output identical. Found on the way: node 22 and Chromium 156 drift apart after
  ~40 s even untouched (pre-existing, not this change), so that check compares within one engine; tune.js header corrected.
- Fresh Opus review: no P0/P1; 9 findings, all fixed: Generations from the menu mid-season with blocked storage started a
  new campaign; a refused picture write deleted a good save; a save passing validation but failing to load wedged
  Generations; a missing generations.js broke every mode; no watchdog/exit on the heal card; stale counts after an arrival
  on a boundary step (tune.js vs page could drift ~1 in 1000 boundaries; startHeal/seedDeep now recount); a background
  heal + reload skipped "time passed"; extra main-thread JSON (menu parses a memo, season 1's picture rides on the heal's
  write); the "older version" note never cleared. Plus the review's test gap (worker path end to end over http). Its new
  checks then caught one more bug of mine: on resume the ready card was built but its overlay stayed hidden (fixed).
- tools/smoke.js: 152 -> 215 checks, all pass; new section `generations` (+ worker checks in the http section) and an
  `--only <sections>` option. A separate walkthrough over http (the live setup, real worker) at 390 x 844 (touch) and
  1440 x 900 (mouse): menu, season 1, end card + comparison, heal card mid-way, ready card, season 2, reload and continue,
  abandon from the menu, five seasons to the final screen; no errors, no sideways scroll; screenshots viewed.

## Open Questions
- [ ] NOT tried on a real phone: worker heal time (headless desktop ~2 s; a phone maybe 5-10 s, in the background), card
      layout, storage in iOS Safari / the installed app (Safari may evict localStorage of sites not visited for 7 days, and
      private mode has none: the campaign then plays but cannot resume).
- [ ] The first ocean is not the untouched balance: it starts with 3 turtles, 3 mantas, 10 jellyfish, and left alone the
      ocean grows to ~10, ~15, ~23. So a steward's later oceans show *more* of those than the first one. Recommendation: keep
      (honest, and changing the start would change the Anthropocene run, which must stay as it is); say if it reads wrong.
- [ ] Mid-season reload starts the season over (no saves during play). Recommendation: keep; a 10-minute season is short.
- [ ] Heal 300 s is my call from the numbers above (owner said start at 600 and tune). Recommendation: try a campaign.
- [ ] The tune.js batches above ran before the boundary recount fix; it changes about 1 boundary in 1000, so the numbers stand.
- [ ] Node vs browser V8 drift (pre-existing): tune.js runs are the same oceans as the page, not bit for bit the same runs.
- [ ] Carried over: earlier phone/follow/timelapse items, the P2/P3 review lists, M8 questions, part 7 (daily ocean).

## Next Steps
1. Owner plays a Generations campaign (desktop and phone): heal feel, wording, whether greedy's decline is visible enough.
2. If the owner wants more or less carry-over: GEN.HEAL in sim.js (measure with `node tune.js 0 40 campaign bot=steward,greedy heal=N`).
3. Part 7 (daily ocean) if wanted.

## Files Modified
sim.js, deep.js, ui.js, index.html, sw.js, tune.js, tools/smoke.js, generations.js (new), heal.js (new),
docs/plans/2026-11-09-m9-memory-release.md, docs/summaries/SESSION-2026-11-23-generations.md
