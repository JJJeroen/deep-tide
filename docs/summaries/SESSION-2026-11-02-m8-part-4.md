# Session Handoff - 2026-11-02 (M8 part 4)

**Project:** deep-tide
**Status:** M8.4 (protected area, trawl excluder, ghost-net retrieval) is live on main; M8.5 (runoff + oxygen) is next, its own session.

## Decisions Made
- **Protected area** (sim.js `MPA`, `mpaRange`, `setMpa`, `inMpa`): one strip, 200 px to WW/3 wide. Drag to mark, click inside to lift it, click elsewhere for a 200 px strip. Nets and trawls take nothing inside; trawls don't scar there; `richestBand` ignores animals inside.
  - **Head office's trawler respects it too** (my call: a closure is law). Say if you want head office to ignore it.
  - **Lost nets still fish inside it** (on purpose: ghost nets obey no rules; the 'mpa' hint says so).
- **Excluder** (sim.js `EXCLUDER`): a toggle next to Trawler (key E), off by default, and kept across games in a session. It is read when a trawl starts, and head office never fits one. Protected animals escape at 90%; other animals (plankton aside) escape at 15%. Each animal is rolled once per pass.
- **Retrieval**: with Watch, click or tap a lost net to haul it up (on release, so a drag-scroll doesn't trigger it). A mouse hover shows "Lost net · click to haul it up". The end screen counts hauled nets.
- **Bots** (deviation from the plan): `excluder` = greedy + excluder, because the measured bot never trawls, so an excluder would change nothing for it. Also added `tidy` (greedy + hauls every lost net).

## Measurements
- Untouched ocean, 60 runs each against `git archive` of 6f63804: idle and cold are within noise (idle shark zero% 1.6 vs 1.9; cold 1.0 vs 1.2).
- `trawlmpa` vs `trawl` (30 runs; reef third protected from t = 0):

  | Species | Recovery, no reserve | Recovery, reserve | Wiped-out runs, no reserve | Wiped-out runs, reserve |
  |---|---|---|---|---|
  | Hunters | 399 s | 220 s | 30/30 | 26/30 |
  | Turtles | 562 s | 330 s | 30/30 | 18/30 |
  | Sharks | 856 s | 438 s | 30/30 | 28/30 |
  | Mantas | 526 s | 65 s | 30/30 | 0/30 |

  The spill-over payoff works.
- `bottommpa` vs `bottom`: no clear difference. The trawl at y 790 still drags the shelf right of x 533, so this is mostly noise.
- Bots (12 runs each):

  | Bot | Score |
  |---|---|
  | steward | 37.2 (RUN.STEWARD stays 36) |
  | measured | 58.6 |
  | reserve | 62.3 (within noise) |
  | greedy | -16.3 |
  | excluder | 36.8 (bycatch 38 → 6.6) |
  | tidy | -12.5 (ghost kills 7 → 0) |

## Work Completed
- sim.js: MPA, EXCLUDER, ghostAt, retrieveGhost, trawl spared-set, game.ghostsHauled, result.mpa/ghostsHauled
- ui.js: Protected-area tool (A), excluder toggle (E), placeMpa, haulGhost, pointerId check on pointerup, end-screen rows
- render.js: drawMpa strip + preview, drawMpaBuoys (yellow special marks), netShape (net lifts over the strip), excluder grid, hauled nets rising, hover cue
- scene.js: deck warps follow netShape. coach.js: 'mpa' and 'excl' tips, excluder note in trawl summary, ghost tip mentions hauling
- index.html: 2 buttons, toggle style, tighter phone toolbar
- tune.js: bots reserve/excluder/tidy, scenarios trawlmpa/bottommpa, ghost-kills column. tools/smoke.js: 6 new checks (37 total)
- Fresh-context review (opus): no blocking bugs; untouched-ocean RNG path unchanged. Fixed: multi-touch pointerup, net drawn lifted where the sim still fished, E key repeat, click slop in screen px, unused field.

## Open Questions
- [ ] Phone toolbar is 4 rows at 390 px (no overflow). Group the harm tools if it feels too tall.
- [ ] Head office respecting the protected area: confirm.
- [ ] Score shape: re-measure the steward and verdicts after part 5 (unchanged).

## Next Steps
1. **M8.5** (own session): Plastic/Runoff split, `S.nutr` + `S.oxy` grids, blooms, dead zones, jelly tolerance, runoff contract (plan section 5).
