# Session Handoff - 2026-11-08 (M8 score-shape pass)

**Project:** deep-tide
**Status:** M8 wrap-up done: score weights checked against 80 runs per bot (unchanged), verdict lines rewritten for M8's harms, runoff pay lowered to 0.6 (provisional). Next: owner playtest + the open questions, then M9.

## Decisions Made
- **RUN.RUNOFF_PAY 1.0 → 0.6** (sim.js `RUN`, provisional; the owner said "decide later" and this was the offered default). At 1.0 a runoff top-up scored about the same as not topping up (farmer 49 vs measured 55). At 0.6: farmer 38.3 vs measured 50.8 (80 runs each; farmer sd ~40, so the gap is ~12 ± 5). Plastic stays the worst top-up (dumper 16.4). One line to undo.
- **Score weights (RUN.PTS) unchanged.** The order still says what the game means: careful netting with no bycatch beats doing nothing; doing nothing beats greed; every harm costs more than it pays (table below).
- **RUN.STEWARD stays { score: 36, bio: 0.90 }.** New batches 37.0 and 34.5; four 40-run batches pooled 35.9. Runoff can't touch a steward run (the steward never pours anything, and the seeded check in the M8.5 session showed an untouched ocean is identical).
- **verdict() rewritten** (sim.js `VERDICT`, `verdict({ quota, lost, bio, water, bycatch })`). Checked first to last:
  1. fed (quota ≥ 90%), no species lost, biodiversity ≥ 85%, water ≥ 90% → "The fleet was fed and the ocean held. That is rarer than it sounds." (water check is new: the dumper and farmer earned this line in 8 of 80 runs before.)
  2. fed, water < 70% → "The fleet was fed. The water is what it cost." (new)
  3. fed, protected bycatch ≥ 10 → "The fleet was fed. Turtles and sharks came up in the nets with the catch." (new)
  4. fed, 2+ species gone → "Every quota met. Some of what lived here will not be back."
  5. fed → "The fleet was fed. The ocean paid for it."
  6. quota < 35%, none lost, water ≥ 70% → "The water is still full of life. The harbour is quiet."
  7. quota < 35%, one species lost → "The harbour is quiet, and the sea still lost a species." (new: the steward used to get "Some fish, some losses" in 11 of 40 runs with no fish caught)
  8. 2+ species gone → "Short on fish, and short on species. Nobody won this one."
  9. otherwise → "Some fish, some losses. Most real oceans look like this."
- Review (opus, fresh context) fixes: quiet harbour with fouled water got "Some fish, some losses" (now "The harbour is quiet, but the water is fouled."); "ocean held" now also needs bycatch < 10; comments corrected. Kept on purpose: the water and bycatch lines come before "2+ species gone", so dumper/industry/greedy hear about the harm they chose, not the species count (shown on the end screen anyway).
- tune.js's anthro report now prints how often each bot got each verdict (first 6 words), so the next score pass can check the lines without a script.

## Measurements
`node tune.js 0 40 anthro bot=all`, twice (the second batch after the verdict rewrite; scores don't depend on the verdict). Pooled score, 80 runs each:

| bot | pooled | batch 1 | batch 2 | most common verdict (batch 2) |
|---|---|---|---|---|
| careful | 61.1 | 60.6 | 61.6 | Every quota met. Some... (31) |
| reserve | 57.8 | 60.8 | 54.8 | Some fish, some losses (24) |
| measured | 50.8 | 50.3 | 51.4 | Some fish, some losses (22) |
| ballast1 | 47.7 | 46.5 | 48.9 | Some fish, some losses (24) |
| light | 47.0 | 45.2 | 48.7 | Short on fish... (24) |
| farmer | 38.3 | 34.3 | 42.4 | Short on fish... (15), ocean paid (14) |
| excluder | 36.1 | 30.5 | 41.8 | Every quota met. Some... (29) |
| steward | 35.8 | 37.0 | 34.5 | Water still full of life (22), harbour quiet + lost a species (16) |
| grazers | 29.6 | 34.2 | 24.9 | Short on fish... (26) |
| dumper | 16.4 | 17.9 | 14.9 | The water is what it cost (39) |
| industry | 2.0 | 1.8 | 2.3 | The water is what it cost (40) |
| tidy | -2.7 | -4.3 | -1.1 | Turtles and sharks... (37) |
| greedy | -5.7 | -4.8 | -6.6 | Turtles and sharks... (37) |
| plunder | -72.4 | -72.1 | -72.8 | Short on fish... (40) |

Batches swing a lot (excluder 30.5 vs 41.8, reserve 60.8 vs 54.8): sd is 13-42 per bot, so a single 40-run batch has a standard error of 2-7 points.

- Smoke test: 43/43.

## Work Completed
- sim.js: RUNOFF_PAY 0.6 + comment; RUN.STEWARD comment; VERDICT + verdict() rewrite; runScore passes water and bycatch.
- tune.js: verdict counts per bot in the anthro report.

## Open Questions
- [ ] **Runoff pay**: keep 0.6 (a clear loss, like the plan's "pays a little") or back to 1.0 (a gamble about as good as not topping up)?
- [ ] **Ghost-net kills are not scored**, so hauling up lost nets earns nothing (tidy -2.7 vs greedy -5.7, within noise). The 2 Nov note kept them unscored "until part 4 gives the player a counter-move"; part 4 added retrieval but never decided. Option: count protected animals killed by the player's own lost nets as bycatch (head office's kills stay off the score, per the owner's 2 Nov call). Small effect (greedy's lost nets kill ~6 animals a run, some protected).
- [ ] Phone toolbar: the plastic/runoff selector wraps onto the row below Pollute; fold into "group the harm tools".
- [ ] Still open from M8.4: head office respecting the protected area.

## Next Steps
1. Owner playtest of runoff and the new end-screen lines (play a run greedily, one with dumping, one doing nothing).
2. Answer the open questions above.
3. M9 from the 2026-11-01 roadmap: seeded RNG (sim.js has none yet: 18 `Math.random` calls; the M8.5 seeded check swapped one in from the test script), shifting-baselines campaign, follow cam, photo mode.

## Files Modified
- sim.js: `RUN.RUNOFF_PAY`, `RUN.STEWARD` comment, `VERDICT`, `verdict()`, the `verdict:` field in `runScore()`
- tune.js: `reportAnthro` verdict line
