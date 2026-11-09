# M9 - memory and release (plan, 2026-11-09)

From the 1 Nov roadmap: seeded oceans, the shifting-baselines campaign, follow one animal, photo mode and a timelapse, and
release (GitHub Pages has been live since 1 Nov; what's left is making it installable). The owner said "carry on with M9" on
9 Nov. The open M8 questions (runoff pay, scoring ghost-net kills, phone toolbar, head office vs the protected area) are still
open and don't block anything here.

## Ground rules (as in M8)
- sim.js and deep.js stay DOM-free and headless. Render-only parts must not change the sim.
- An untouched ocean must not change. Since part 1 this has a much stronger check than statistics: a field-only or render-only
  change must leave the seeded fingerprint identical (same seed, same steps, same state; `tools/smoke.js` "seed" checks,
  or the det script in the part 1 handoff). Use the 60-run head-to-head only for changes that really move the dynamics.
- One commit per part, pushed live once the smoke test and checks pass (the owner's standing OK for Deep Tide).

## 1. Seeded oceans (built 2026-11-09)
Every random number in the sim now comes from one seeded generator (sfc32, seeded from a string through FNV-1a + splitmix32).
A seed plus the player's actions, each on the step it happened, fix a whole run. The sim already stepped at a fixed 1/30 s,
and nothing outside the player's own actions writes sim state between steps (checked), so no replay plumbing was needed for this.
- `resetWorld(seed)` seeds the sim; `resetDeep(seed)` gives the deep layer its own stream (seed + '/deep'). The deep never writes
  S, so with its own stream the sunlit sim is the same with or without it, and tune.js (no deep) matches the page.
- The page: `?seed=...` (cleaned to a-z 0-9 '-', at most 24 characters, because it is printed) makes every game on the page
  use that ocean; otherwise every game gets six fresh base-36 characters. The end screen says "This was ocean k3x9q2" with a
  link to play it again or send it.
- Render and sound keep Math.random: they run per frame, and the frame rate must not change the ocean.
- tune.js: `seed=S` makes run 0 use S and run i use S.i; without it a fresh batch seed is printed in the header. In anthro every
  bot plays the same seeds, so bots are compared on the same oceans. Bots pick net spots from their own stream (seed + '/bot').
What this does not give yet: replays. A replay needs the player's actions recorded with their step numbers. That is small now,
but nothing needs it until the timelapse or a "watch your run back" feature does (see part 4: re-simulating is too slow anyway).
A replay would also have to record two settings that carry over between games: EXCLUDER.on and POLL_KIND.
Limits (from the review): exact only within one JavaScript engine. Math.pow/exp/sin may differ in the last bit between Chrome,
Safari and Firefox, so a link sent to another browser starts the same ocean but can drift apart later in the run. Fine for
sharing an ocean; it would matter for verifying someone else's replay or score.

## 2. Photo mode (render, small)
Pause, hide every panel, save a PNG. A camera button next to Pause/Speed (the toolbar is already full on a phone), key F.
In photo mode the canvas is the whole screen; "Save picture" renders one frame into an offscreen canvas at 2x the world size
(3200 x 1800, or the deep view at the same scale) and downloads it (canvas.toBlob, an `<a download>`). Esc, a tap or F leaves.
Smoke check: entering photo mode hides the panels and pauses; the saved blob is a PNG with the expected size.

## 3. Follow one animal (render, plus two sim fields)
Watch-click (tap) an animal: the camera eases in (zoom about 2x) and follows it; a card shows its name, age, energy and last
meal ("ate a grazer 12 s ago"). Clicking empty water, Esc or picking a tool ends it. If it is netted or trawled, the camera
follows it up to the surface and the card says so; if something eats it, the card names the predator.
Sim: `a.id` (a running number) and `a.meal = { t, at }` set in eat(). Fields only: the seeded fingerprint must not change.
Render: today the world is fitted to the screen with ox/oy/scale and the camera only scrolls in y (cam.y). Following needs a
zoom factor and an x centre too; everything that converts screen to world (toWorld, picking, the net and trawl cursor) must go
through the same transform. That is most of the work. Phone first: there a grazer is about 5 px tall, so zoom is the point.

## 4. Timelapse on the end screen (render)
"Replay the ten minutes in ten seconds." Measured 9 Nov: one run is 18,000 steps and takes about 11 s in node with a bot, so
re-simulating a run from its seed and recorded actions would take about as long as the timelapse itself on a desktop, and much
longer on a phone. Record during the run instead: every 2 s, draw one small frame (480 x 270, fixed camera on the sunlit layer,
no lamp) into an offscreen canvas and keep it as a JPEG blob: about 300 frames, roughly 5 MB. The end screen plays them back at
30 fps with the clock and the population sparklines under it. Recording costs one extra small render every 2 s.

## 5. Shifting baselines campaign (big bet: needs the owner's calls first)
The idea (roadmap): each season starts from the ocean the last one left behind, and the start message still says "The water
is calm." The end screen puts your first ocean next to this one. Daniel Pauly's shifting baselines: every generation takes the
ocean it grew up with as normal.
Plumbing: save the sim at the end of a season (S and D without transient effects: agents, grids, reef, scars, ghost nets, the
nutrient pools) to localStorage, about 150 KB of JSON; load it at the start of the next. Season k of a campaign uses seed
`<campaign seed>.s<k>`, so a campaign is reproducible like a run.
Questions for the owner:
- a. Length: a fixed number of seasons (say 5) with a final screen, or endless until you reset?
- b. Between seasons: does the ocean get some untouched time to heal (say 10 sim minutes, fast-forwarded), or does the next
  season open on the exact end state? (5 Oct decision: the ocean heals slowly when left alone.)
- c. A new mode on the menu ("Generations"), or does the Anthropocene run become season 1 of it?
- d. Does demand keep rising from season to season, and does the warming carry on from where it ended?
- e. Scoring: a score per season, one campaign score, or both? The comparison screen: species counts first ocean vs now, plus
  two pictures (the season 1 start and this season's end, taken with the part 4 recorder).
- f. Saved in this browser only (no accounts), with an "abandon the campaign" button. OK?

## 6. Installable (release, small)
manifest.webmanifest (name, short name, icons 192/512 + maskable, drawn from the favicon; theme and background colours;
display standalone; orientation any, since phone portrait already works) and a small service worker that caches the static
files so it plays offline (cache-first, one cache name per release, so a push replaces the old files). GitHub Pages serves the
game under /deep-tide/, so every path stays relative. Check: Lighthouse installability, and the smoke test still passes with
the worker registered.

## 7. Daily ocean (optional, cheap after part 1; owner's call)
The menu offers "Today's ocean": seed = today's date (UTC, YYYY-MM-DD), so friends can play the same ocean and compare scores.
No server, so no leaderboard.

## Order and sessions
1 (done) -> 2 photo -> 6 installable -> 3 follow -> 4 timelapse -> 5 campaign (after the owner's answers) -> 7 if wanted.
2 and 6 fit one session; 3, 4 and 5 are a session each. Handoff after each session in docs/summaries.
