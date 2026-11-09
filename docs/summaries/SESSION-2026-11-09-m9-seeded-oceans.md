# Session Handoff - 2026-11-09 (M9.1 seeded oceans)

**Project:** deep-tide
**Status:** M9 part 1 (seeded oceans) built, verified and pushed live. Next: parts 2 + 6 (photo mode, installable).

## Work Completed
- docs/plans/2026-11-09-m9-memory-release.md: M9 plan, 7 parts, with questions for the owner on the campaign (part 5).
- sim.js: `makeRng(seed)` (sfc32 seeded via FNV-1a + splitmix32), `rand`, `SEED`, `seedWorld()`, `freshSeed()`; all 19 sim
  Math.random calls now use `rand()`; `resetWorld(seed = freshSeed())`.
- deep.js: its own stream `drand` (seed + '/deep'), `resetDeep(seed = SEED)`; 8 calls swapped.
- ui.js: `?seed=` (cleaned to a-z 0-9 -, at most 24 chars) or a fresh seed per game; the end screen says "This was ocean X" with a
  `?seed=X` link. index.html: `.seedline` style.
- tune.js: `seed=S` (run 0 = S, run i = S-i, cleaned like the page's seed), bots share seeds (paired), bots' own stream
  (seed + '/bot'), results carry their seed, idle results kept in run order, each bot's lowest/highest run printed with its seed.
- tools/smoke.js: 11 new checks (54 total, all pass): same seed gives the same ocean; another seed gives another; page == headless node;
  no sim/deep path calls Math.random (every tool, with a throwing Math.random); fresh seeds; ?seed= cleaned and used; a page
  left running on real frames matches node step for step (mutation-tested: a per-frame rand() in render.js makes it fail);
  end screen names the ocean.

## Verification done
- Untouched ocean unchanged: `tune.js 1800 60 idle` and `cold`, old (git archive HEAD) vs new: all species within noise, both pass M1.
  idle grazer 38.3 vs 37.7, hunter zero% 1.1 vs 1.2, shark zero% 1.2 vs 1.2; cold shark zero% 1.3 vs 0.9 (known +-0.7 noise).
- Single runs reproduce their slot in a batch (seed=rev1-2 alone = run 2 of seed=rev1).
- Fresh-context Opus review: nothing serious; its test-gap findings are fixed (above). Kept as notes: different browsers may drift
  apart from the same seed (Math.pow/exp/sin last bits; same start, not bit-identical later); EXCLUDER.on and POLL_KIND carry
  over between games (a replay would have to record them).

- Bots, `node tune.js 0 40 anthro bot=all seed=m91` (all bots on the same 40 oceans) vs the 8 Nov 80-run pool: all within batch
  noise, order kept. careful 57.8 (61.1), reserve 57.5 (57.8), measured 48.0 (50.8), ballast1 42.5 (47.7), light 42.5 (47.0),
  excluder 39.7 (36.1), steward 35.2 (35.8), farmer 33.6 (38.3), grazers 32.3 (29.6), dumper 22.4 (16.4), industry 1.3 (2.0),
  tidy -0.2 (-2.7), greedy -0.8 (-5.7), plunder -73.6 (-72.4). RUN.STEWARD stays 36. Largest move ballast1 -5.2, about 1 SE.
  Shared seeds make bot-vs-bot gaps sharper, not the absolute level: a batch of hard oceans now moves every bot together.

## Open Questions
- [ ] Campaign (plan part 5, a-f): length, healing between seasons, new mode or the run, demand/warming carry-over, scoring, saving.
- [ ] Daily ocean (part 7): wanted?
- [ ] Still open from 8 Nov: runoff pay 0.6, scoring ghost-net kills, phone toolbar grouping, head office vs the protected area.

## Next Steps
1. M9 parts 2 + 6 in one session: photo mode (camera button + F, 2x PNG), installable (manifest, icons, service worker).
2. Then part 3 (follow one animal: needs a zoom + x-centre camera transform) and part 4 (timelapse from recorded thumbnails).
3. Part 5 (campaign) once the owner has answered a-f.

## Files Modified
- sim.js (M9 block before `rnd`, `resetWorld`), deep.js (`drand`, `resetDeep`), ui.js (`URL_SEED`, `newGame`, `showEnd` seedline),
  index.html (`.seedline`), tune.js (seed arg, seeds in results, lowest/highest), tools/smoke.js (`seeds()` + end-screen check),
  docs/plans/2026-11-09-m9-memory-release.md (new)
