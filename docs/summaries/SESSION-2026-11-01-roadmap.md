# Session Handoff - 2026-11-01

**Project:** deep-tide
**Status:** No code changes. Proposed roadmap M3-M9 + art direction; waiting on the owner to approve the direction.

## Work Completed
- Fresh clone at ~/projects/deep-tide (WSL), main @ 68c64a6, loads with zero console errors (desktop + phone, headless Chromium).
- Bot baseline, `node tune.js 0 12 anthro bot=all`: steward 40.0±5.8, measured 80.8±9.2, ballast1 74.1±12.3,
  careful 66.5±21.8, grazers 59.4±25.4, light 51.3±26.1, dumper 50.2±24.4, greedy 5.4±28.3, industry 4.2±6.9, plunder -67.3±13.1.
  Steward reference (41) on the end screen still matches.
- Roadmap + live look sketch (reuses SHAPE_DRAW verbatim): https://claude.ai/artifact/EutzLnp14MVaV1ihZynVwj

## Proposed roadmap
- M3 quick wins (render only): per-species sparklines (drawChart is right-aligned + per-species normalised = scribble early),
  trawler as boat + cone net, netted fish lift to surface, tap-to-name + 1.3x draw scale, readable pollution, end-screen log, phone log overlap.
- M4 the look (render only): sky + fleet, darkness layer with light sources, reef shelf -> slope -> abyss, bleaching with warmth,
  marine snow, caustics, night, Watch = ROV lamp, depth ruler.
- M5 sound: one voice per species in a generative chord.
- M6 alive (sim): shoaling, day/night + vertical migration, nutrient loop, refuges. Gate: owner plays a full run first.
- M7 deep layer (big bet): recommend a coupled second layer, keep the 1600x900 sim as-is.
- M8 consequences/stewardship: bottom-trawl damage, ghost nets, plastic vs runoff, oxygen squeeze, MPAs, excluders.
- M9 memory/release: seeded RNG, shifting-baselines campaign, follow cam, photo mode, GitHub Pages.

## Open Questions
- [ ] Does the art direction land?
- [ ] Deep world shape: coupled layer (recommended) vs one tall world.
- [ ] Keep single file (~150 KB after M4/M5)?
- [ ] 6 Oct questions still open (ballast cap, missed quota, rescue immigration).

## Decisions (owner, 1 Nov, second exchange)
- Direction approved, but "the fish are still not beautiful": fish beauty pass is now the first item of M4
  (whole-body bend, real per-species palettes, depth colour absorption), prototyped on its own page first.
- Deep world = separate layer coupled to the current sim.
- Single file is not a requirement; Claude's call: split at start of M3 into plain classic scripts
  (index.html, sim.js, render.js, ui.js; later audio.js, deep.js), no modules/build; tune.js reads sim.js.

## 6 Oct questions re-checked (sim block unchanged since 6 Oct; tune.js 1800 20 idle|cold|hot rescue=off)
- Closed: steward ref (40.0±5.8), cold water (pass, worst 1.5%), grazer blinks (0.4%).
- Open: full playtest (owner), score variance (lean accept), ballast (lean keep as trap), missed quota (lean company trawler),
  rescue (lean off; idle passes, worst jelly 1.6%), hot water collapse + BUG: "too warm" warning only fires >0.8
  but at 0.75 hunters are absent 92%, sharks 83%, grazers 57%; phone portrait (plan: M3 + deep layer).
- 2% acceptance bar is noisy: a 10-run idle batch failed, a 20-run batch passed.

## Built and pushed live (1 Nov, same session) — https://jjjeroen.github.io/deep-tide/
Owner authorised pushing straight to main (= GitHub Pages). Branch look-m3 fast-forwarded into main each time.
- 5aad3c9 split: index.html + sim.js / sprites.js / render.js / ui.js (sim.js md5-identical to the old SIM block); tune.js reads sim.js
- c97a932 fish beauty: natural palettes (fusilier, amberjack, lionfish invader, blacktip, green turtle, reef manta), body wave, 4 depth tints, RS=1.3
- e76dfb4 M3: trawler boat + cone net + codend, net hauls rise to surface with value tags, Watch label (hover/tap), readable pollution + debris,
  per-species sparklines, end-screen ghosts + cleared log, phone log placement, hot warning from 0.7
- 447f1c1 coach.js: Learn to play (5 steps) + Hints switch (H), consequence-style tips
- c487b9a fixes from a fresh-context Opus review: trawl net kept sailing after sim drops it, sprite bounds (lionfish/turtle clipping),
  trawl catch attribution at 4x, roundRect fallback (old Safari), ptr.mouse on tap
- tune.js after sim edits: idle 20x30min PASS; steward 38.1±7.3, measured 75.9±13.6 (noise vs 40.0/80.8)

## Second request, same day: "ga door met de rest van M4" + mantas flipping left/right at the left wall
- Cause (measured, scratchpad m4/flip2.js): facing = sign(vx) with no hysteresis, and a wall trap: a wanderer whose heading
  points into a side wall is pushed back by the soft wall, never turns, and slides up/down along it (mantas 16% of the time
  at the wall, 127 facing flips per minute). Also found: left-swimmers were pitched the wrong way (nose up when diving).
- Fix, render (render.js drawAgent): facing hysteresis (turns only when vx < -0.12*speed the other way), animated turn
  (body narrows through head-on), scale-then-rotate so pitch is right for both directions.
- Fix, sim (sim.js updMobile): same-species spacing while wandering; wanderers of size >= WALL_TURN_SIZE (turtle, shark,
  manta) reflect their heading at side walls; drifting jellies too. Result: manta flips 127 -> 4/min, at wall 16% -> 1%.
- Balance finding: giving the wall turn to ALL species (or the top wall too) let hunters hunt better and boom-bust
  (idle 30 runs: hunters at zero 2.4% vs 1.2%, grazer mean 36 vs 44). Hunters losing time at walls is part of the M1
  balance, so small fish keep it. Final: idle-equivalent variant 30 runs PASS (hunter 1.1%), cold 30 runs PASS (hunter 1.8%),
  bots steward 39.9, measured 80.4, plunder -76 (sd 16; ref 40.0 / 80.8 / -67).
- M4 built in scene.js (render only, never writes S): SKY band of 64 world px above y=0 (oy stays the screen y of the surface),
  day/night (DAY_LEN 240 s sim, starts in the morning), water mood (warmth greens it, pollution browns it), shafts + caustics,
  reef shelf on the left sloping into a drop-off (drawn behind animals, above the toolbar), coral bleaching from S.temp
  (bleach ~25 s, die after ~4 min bleached, recover over ~15 min; per-colony tolerance so it is patchy), pollution film,
  sea whips, marine snow scaled by plankton, darkness layer with holes (lamp, jellies, trawler deck lights), Watch = ROV lamp
  (hover with mouse, tap on touch), glowing jellies + night plankton sparkle, sky (sun/moon cross it, stars, clouds, smog,
  oil sheen), horizon boats, cargo ship waiting in port in the scored run (leaves after a ballast flush, with a plume),
  trawler decks above water with warps from the A-frame, depth ruler 10-40 m (column = top 60 m of a reef wall).
- Hints: bleaching (consequence) and night (lamp).
- Perf: headless software rendering 60 fps old and new with idle CPU (the 30 fps seen first was CPU contention from tune.js).

## Third request, same day: "ga door met M5 sound" — audio.js (Web Audio, render only, reads S)
- Chord: one voice per native species in an open D major 9 (plankton D2 root ... shark C#4), gain = sqrt(count / (0.6*peak)),
  so a lost species leaves a hole in the chord; invaders add a G#3 sawtooth (tritone against the root).
- Water low-pass over the music: 3200 Hz clean -> ~500 Hz polluted, darker at night; warmth adds pitch wobble (up to 30 cents);
  more reverb at night. Brown-noise sea swell. Bells from D major pentatonic, spaced by biodiversity (fewer species, sparser).
- Events: trawler engine drone panned with the boat, net-haul splash, ballast horn, low gong when a species hits zero.
- Sound button + M key (localStorage deeptide.sound, default on); context created only in a user gesture (pointerup/touchend
  needed for touch: a touch pointerdown is not a user activation); suspended when the tab is hidden; ducked while paused/menu.
- Verified headless with an AnalyserNode (scratchpad pw/m5.js): voices drop to 0 when species die, filter 3200 -> 504 with pollution,
  engine on with a trawler, peaks <= 0.7 pre-compressor, no context before a gesture, no console warnings. Not listened to by a human yet.

## Fourth request: owner: "looks and sounds good"; explain the sound; boats look too simple
- Sound guide: "What you're hearing" (collapsible) in the menu, a one-time 'sound' hint once audio is running (coach.js),
  tooltip on the Sound button.
- boats.js: side views drawn per frame, facing right, origin on the waterline. Stern trawler (raked bow, forecastle,
  white sheer stripe + red boot-top, rust streaks, registration, bridge with raked windows and mullions, funnel with a band
  and exhaust, mast + turning radar, net drum, orange stern gantry whose block is WARP_FROM, rails, bow wave + wake, nav
  lights/floods/lit windows at night); hull below the waterline with rudder and a turning propeller; container ship
  (aft accommodation with window rows and bridge wings, funnel, ten bays of shaded ribbed boxes, lashing bridges, foremast);
  horizon boats with mast and outrigger booms, mixed toward the haze. Fresh Opus review: lights ignored the ship's fade-in
  alpha -> fixed (multiply, foam saves/restores).

## Fifth exchange: owner: the lamp isn't needed ("even in the dark parts you can still see everything"); horizon boats still crude
- Watch lamp + ROV removed (scene.js/render.js); the darkness layer stays (jellies, plankton, deck lights). A lamp belongs to the deep layer (M7).
- Horizon boats: drawTrawlerTop now takes { haze, hz, hull, band }; FAR_BOATS draws two distant trawlers (red, green) at 0.3/0.24 scale, hazed.

## Next
1. Owner plays Learn + one full Anthropocene run, with sound on; note what drags or confuses and whether the sound helps or grates (still the M6 gate).
3. Known, left for M6: hunters and grazers still get pinned at side walls sometimes (now less visible thanks to the hysteresis);
   fixing that for them needs a hunter re-tune (see balance finding above).
Browser test scripts live in the session scratchpad only (shoot.js, m3.js, m4.js, learn.js, fixes.js, phone.js, perf.js) — consider adding a tools/ smoke test.
