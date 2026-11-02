# Session Handoff - 2026-11-02 (M8 parts 1-3)

**Project:** deep-tide
**Status:** M8 parts 1-3 (company trawler, bottom-trawl scars, ghost nets) are live on main; parts 4 (protected areas + excluders + net retrieval) and 5 (runoff + oxygen) are next, one session each.

## Decisions Made
- Owner's playtest "worked fine", so the M8 gate is passed. All four M8 parts are in scope. The 6 Oct items were closed as leaned: accept score variance, keep ballast as a trap, a missed quota sends a company trawler, rescue stays off (plan: docs/plans/2026-11-02-m8-consequences.md).
- **Head office's trawler kills are not the player's bycatch** (owner's choice: "animals die, no points"). They show only on the end screen ("not on your score; the ocean paid"). This deviates from the plan text in part 1.
- **Ghost nets**: only trawlers lose nets (25% per pass). Hand nets don't lose gear (the plan said 5%). Ghost kills are not scored and show on the end screen ("Lost nets"). This keeps the score shape stable until part 4 gives the player a counter-move (retrieval).
- RUN.STEWARD stays `{ score: 36, bio: 0.90 }` (sim.js, comment has the history).

## Work Completed
- **M8.1** (5333242): a short minute sends head office's trawler next minute, at `richestBand()` (also the bots' `trawlBand`). It stops after bankruptcy and never comes on the last minute. Grey "Head office" label. End-screen row.
- **M8.2** (9380674): `bedAt(x)` is the shared seabed line (scene.js BED uses it). Trawls whose band reaches the bed scar `S.scar` (40 px cells, 0..1, half-life 480 s, once per column per pass). Scars weaken the reef refuge (catch cut x (1 - scar)). Render: silt plume, grey coral, rubble, furrows. `bottom` scenario in tune.js. Two bottom trawls devastate either way; scars slow predator recovery (hunters 216 vs 131 s, sharks 233 vs 181 s). Bots' richestBand reaches the shelf ~1% of the time.
- **M8.3** (8125097): `GHOST` config + `S.ghosts`, `loseNet()`, `stepGhosts()`, `entangle()` in sim.js; `drawGhosts()` in render.js; 'ghost' coach hint; `ghost` scenario in tune.js.
  - Measured (30 x 1800 s, nets that fish vs inert): shark zero% 3.4 vs 0.7, all of the gap in the 20 min after the drop; shark recovery 133 vs 90 s; other species within noise.
- **Bots after M8.3** (`node tune.js 0 12 anthro bot=all`): steward 39.3, light 47.5, measured 54.6, careful 57.0, ballast1 46.8, grazers 23.5, dumper 18.5, industry 2.3, greedy -18.8, plunder -74.3.
- **Smoke test**: 29 checks (adds bottom scar, ghost net, head office's trawler).

## Open Questions
- [ ] A fresh-context code review of 11d149f..8125097 was started at the end of this session; act on its findings first (see the git log for a fix commit if one landed).
- [ ] Score shape (plan "Open"): re-measure the steward and the verdict lines after part 5.
- [ ] Phone toolbar: part 4 adds a button and a toggle. Check 390 px.

## Next Steps
1. **M8.4** (own session): add the Protected-area tool (a drag strip with min 200 px and max WW/3; nets and trawls do nothing inside it). Add the excluder toggle on the trawler (protected species escape 90%, haul -15%). Add Watch-click retrieval of ghost nets. Add bots `reserve` and `excluder` to BOT_LIB in tune.js. Add smoke checks.
2. **M8.5** (own session): split Pollute into Plastic and Runoff. Runoff brings the `S.nutr` and `S.oxy` grids, blooms, dead zones and jelly tolerance, plus a runoff contract. waterQuality() counts both.
3. Ground rules for every piece: idle/cold 60-run head-to-head vs a `git archive HEAD` copy before any sim change, a tune.js scenario per harm, bots after, smoke test, one commit per piece pushed live.

## Files Modified
- sim.js: company trawler (startTrawl company flag, richestBand, harvest, closeMinute/stepGame); bedAt/SCAR/scarAt/stepScar; GHOST/loseNet/stepGhosts/entangle; game counters company*, ghost*
- scene.js: bedAt seabed, scarred coral, drawScars
- render.js: Head office label, SILT plume, drawGhosts
- ui.js: end-screen rows (Lost nets, Head office's trawlers), steward text, SILT reset
- coach.js: short-minute tip + Learn step 3 mention head office; 'scar' and 'ghost' hints
- tune.js: richestBand bot band, company trips column, `bottom` and `ghost` scenarios
- tools/smoke.js: 3 new checks (29 total)
