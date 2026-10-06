# Session Handoff - 2026-10-06

**Project:** deep-sea-ecosystem (Deep Tide)
**Status:** M0, M1 and M2 built and committed; waiting on the owner to play a full Anthropocene run and answer the open questions below.

## Work Completed
- Brutalcritic review of the sandbox, roadmap M0-M4 (critic verdict: a pretty toy, not yet a game; ecosystem was propped up by rescue immigration).
- M0 (`c90102c4`): bug fixes (invader wipeout colour, extinct flicker, Reset resets speed/pause, dead options, stale comment) + `tune.js` headless harness.
- M1 (`18537083`): honest ecosystem. `RESCUE_ENABLED=false`, per-second catch hazard (`CATCH_RATE`), cold-water cost (`COLD_SLOW`), crowd taxes replace cap-pinning for sharks/mantas. `node tune.js 1800 10 idle rescue=off` passes (zero <2%, arrivals <10% of births).
- M2 (`323112ea`): mode picker (Sandbox / Anthropocene run), 10-min scored run with rising quota, constants in `RUN` at top of the sim block, end screen, `anthro` bot scenario in `tune.js`.

## Open Questions (revisit)
- [ ] **Feel:** nobody has played a full 10-minute run at real speed. Only 14 headless smoke checks passed (mode picker, HUD, Stock lock, end screen, no JS errors).
- [ ] **Score variance:** sd 10-34 between runs, mostly from whether hunters/sharks survive. Acceptable for a scored mode, or reduce?
- [ ] **Ballast cap:** unlimited "Skip ballast" is ruinous (industry bot scores ~2). Cap it, or leave it as a trap?
- [ ] **Missed quota:** currently costs points only. Alternative: head office sends its own trawler.
- [ ] **Steward reference (41):** hardcoded; must be re-run after any tuning.
- [ ] **Rescue immigration:** off by default (critic + M1 agent recommend dropping). Alternative: keep it as a *visible* safety net (fish arriving from the edge + log line). One-line flag.
- [ ] **Cold water, rescue off:** sits on the 2% line (hunters 2.6%, turtles 2.1% in one batch; an earlier batch passed).
- [ ] **Hot water (0.75):** collapses most species; it did before M1 too. Intended pressure or a bug?
- [ ] **Phone portrait:** world scales to ~0.24 (grazer ~1 px); event log overlaps HUD. Decide: world shape follows screen (general, changes balance) vs forced landscape + rotate prompt (narrow). Not tested on a real device.
- [ ] **Grazers** now briefly die out for ~15 s in ~0.8% of time because hunters got more effective.

## Next Steps
1. Owner plays a full Anthropocene run; note where it drags or confuses.
2. Answer the questions above (esp. score variance, ballast, rescue).
3. M3: phone test on a real device first, then fix what breaks.
4. M4: sound (ambient drone, death cue, "returned" cue), only after M2 feels right.

**Do not build (critic's list):** seabed zone, more species, scripting/event engine, save/load/achievements, more rescue special cases, splitting the file into modules.

## Files Modified
- projects/deep-sea-ecosystem/index.html — sim retune (M1), scored mode + UI (M2)
- projects/deep-sea-ecosystem/tune.js — harness: parallel workers, `rescue=on|off`, `TUNE_PATCH`, `TUNE_TRACE`, scenarios `cold|hot|pollute|trawl|invade|net|anthro`
