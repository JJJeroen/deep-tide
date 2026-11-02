# Session Handoff - 2026-11-02

**Project:** deep-tide
**Status:** Loose ends from 1 Nov closed: browser smoke test in the repo, last wall pinning fixed (balance re-checked). M8 still waits on the owner's playtest.

## Work Completed
- `tools/smoke.js` (+ `tools/package.json`, playwright-core only, `node_modules/` ignored): 26 checks, see the file header.
  Run: `cd tools && npm install` once, then `node tools/smoke.js [--shots dir]`. Exit 1 on any failed check or console error.
  6/6 runs green. Gotcha found while writing it: a trawler still sweeping y 400 nets invaders released nearby within 300 ms,
  so the invader check releases at y 150.
- Wall pinning (sim.js `updMobile`, flee branch): measured first (scratch `wall.js`/`why.js`, 6 x 900 s, sampled 2/s).
  Time spent within 40 px of a side wall was already ~uniform (3.5-6.7% vs 5% expected), the M6 changes had removed most of it.
  What remained were stuck episodes > 15 s: hunters 0.66 and sharks 1.56 per agent-hour, all one scene: a hunter fleeing a shark
  straight into the side wall, the shark holding it there (shark catch on hunters is low when hunters are few, so the standoff lasts).
  Fix: an escape that points into a wall (within 40 px, all four walls) turns along it. Stuck episodes: 0 for hunters, grazers and sharks (turtles: only real chases, see below).
- Balance: the wall trap had been a shark food source (shark->hunter kills 125 -> 90 per run, sharks at zero 0.8% -> 2.0% idle).
  Compensated with shark meta 1.0 -> 0.75, chosen on 60-run batches (30-run batches misled: see below).

## Balance table (30 runs x 1800 s, zero% per species; grazer hunter jelly turtle shark manta)
| variant | idle | cold |
|---|---|---|
| old code | 0.4 1.2 0.5 0.1 0.8 0.0 | 1.0 1.5 0.6 0.1 0.8 0.0 |
| wall escape only | 0.9 1.1 0.3 0.0 2.0 0.0 | 1.5 1.2 0.5 0.1 1.0 0.0 |
| + shark catch k 150 | 0.7 1.5 0.4 0.1 1.5 0.0 | 1.0 1.6 0.3 0.1 1.6 0.0 |
| + shark meta 0.9 | 1.0 1.0 0.2 0.1 1.4 0.0 | 1.2 1.0 0.6 0.0 1.4 0.0 |
| + shark meta 0.85 | 0.6 1.0 0.4 0.0 1.0 0.0 | 1.2 1.2 0.3 0.1 0.9 0.0 |
| + k 170 and meta 0.9 | 0.9 1.0 0.4 0.1 **2.4** 0.0 | 0.9 1.7 0.4 0.0 1.0 0.0 |

The last row failing between two passing neighbours shows the noise: shark zero% moves ~±0.7 between 30-run batches.

## Decided on 60 runs x 1800 s, idle (same columns)
| variant | zero% | grazer/hunter/shark means | shark->hunter kills |
|---|---|---|---|
| old code | 0.7 1.3 0.2 0.1 1.2 0.0 | 40.2 / 9.4 / 3.7 | 126 |
| escape + meta 0.85 | 0.9 1.0 0.5 0.0 **2.0** 0.0 (FAIL) | 37.8 / 9.9 / 3.2 | 93 |
| escape + meta 0.8 | 0.9 0.9 0.4 0.0 1.5 0.0 | 37.2 / 10.0 / 3.3 | 95 |
| **escape + meta 0.75 (shipped)** | 0.8 1.4 0.4 0.1 0.9 0.0 | 38.0 / 9.9 / 3.3 | 96 |
| escape + meta 0.7 | 1.0 1.5 0.5 0.2 1.3 0.0 | 38.7 / 9.6 / 3.3 | 94 |
- Shipped, cold, 60 runs: 1.2 1.2 0.5 0.1 1.1 0.0, PASS (old code cold 30 runs: 1.0 1.5 0.6 0.1 0.8 0.0).
- Bots (`node tune.js 0 12 anthro bot=all`): steward 39.7 (was 41.4), measured 74.3 (71.3), careful 58.8 (63.3), plunder -87.2 (-81.4);
  order unchanged, all within the 12-run noise. The end screen's "around 40" still holds.
- Visible difference: about 3.3 sharks on average instead of 3.7, and a cornered hunter now bolts along the wall.
- Wall pinning on the shipped code: no hunter/grazer/shark episodes > 15 s; turtles 0.28 per turtle-hour, all chasing a jelly
  along the wall (a real chase, also seen in the old code).
- Lesson: shark zero% moves +-0.7 between 30-run batches (mean ~3 animals); decide shark tuning on 60 runs, head-to-head with the old code.

## Open Questions
- [ ] Owner playtest (Learn + one full run, sound on) is still the gate for M8.
- [ ] 6 Oct questions unchanged: score variance (lean accept), ballast (lean keep as trap), missed quota (lean company trawler), rescue (lean off).

## Next Steps
1. Owner plays; collect what drags/confuses and whether the sound helps.
2. Then M8 consequences (bottom-trawl damage, ghost nets, plastic vs runoff, oxygen squeeze, MPAs, excluders).
3. Before any sim change: `node tune.js 1800 60 idle` and `cold` against a `git archive HEAD` copy; after any UI change: `node tools/smoke.js`.

## Files Modified
- sim.js: flee branch of updMobile (cornered escape), shark meta 0.75
- tools/smoke.js, tools/package.json, tools/package-lock.json, .gitignore (new)
