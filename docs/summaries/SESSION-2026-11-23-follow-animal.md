# Session Handoff - 2026-11-23

**Project:** deep-tide
**Status:** M9 part 3 (follow one animal) built, reviewed in a fresh Opus context, live. Owner's open lists unchanged.

## Decisions Made
- Built exactly plan part 3 (docs/plans/2026-11-09-m9-memory-release.md): Watch-tap a sunlit animal -> camera eases in, a card shows name, mood, age, energy, last meal; ends on tap on empty water, Esc, picking a tool, a drag, the wheel, camera keys, the card's x button; new game / end screen / resize end it at once.
- Zoom is a view transform, not a second camera: stepFollow (render.js) resets scale/ox/oy to the fitted view (baseScale, cam.*) every frame and blends toward a zoomed view centred on the animal (smoothstep). So toWorld, picking, label sizes keep working. Zoom 2x, up to 3x on phones (target about 1.5 px per world unit).
- Sim fields only (sim.js): a.id, a.mealT/a.mealAt (numbers, no allocation per meal), a.fate (FATE codes; predator species index when eaten). Verified: a 400 s run with trawl/net/ghost/invader actions is byte-identical against HEAD's sim.js.
- Netted animals are followed up on their lift to the boat; trawled/eaten/other deaths hold the camera. After death the camera lets go 4 s later (sim time, so not while paused).
- Ruler and pan track are hidden while zoomed; log placement uses baseScale; deepVisible and audio now use the view as drawn (oy/scale), since cam.y + innerHeight/scale is wrong when zoomed.
- Follow works for sunlit animals only; the deep's animals keep the old hover/tap label.
- Photo mode keeps the zoomed view (a photo of the animal you follow).
- sw.js is network first: no cache bump needed.

## Work Completed
- render.js: FOLLOW state, startFollow/endFollow/stepFollow, ring around the animal, liftPos, moodOf; ui.js: card, pointer/key/tool hooks; index.html: #follow card + CSS; sim.js fields; deepview.js, audio.js view fix.
- Fresh Opus review found 5 real issues, all fixed: tune.js instrumentation hook broke (now matches the new line; `node tune.js 2 1` runs), coach card hid the follow card in Learn mode (card stacks above it), deepVisible/audio used the unzoomed camera, "Starved" for oxygen/pollution deaths (FATE.SUFFOCATED/POISONED added), 4 s timer ran while paused.
- tools/smoke.js 108 -> 131 checks (followMode: real mouse/touch events at coordinates, desktop and phone, all ways to let go, netted/eaten deaths, photo mode while following, Learn coach overlap). The old "phone: tapping an animal shows its label" check became "follows it".
- Screenshots (desktop 1600x900, phone 390x844) viewed: card, ring, zoom OK.

## Open Questions
- [ ] Not tried by the owner on a real phone (tap to follow, card size, zoom level 1.5 on 390 wide).
- [ ] Animals near the left/right world edge cannot be centred (view clamps to the world); on desktop they can sit behind the title/species panels.
- [ ] Follow for deep-layer animals and the whale not built (plan said "an animal"; sunlit only).
- [ ] Carried over: P2/P3 review list, campaign a-f, M8 questions, real-phone install/photo test.

## Next Steps
1. M9 part 4: timelapse on the end screen (recorded thumbnails every 2 s); could carry the end-screen photo.
2. Part 5 campaign after the owner answers a-f.

## Files Modified
render.js, ui.js, index.html, sim.js, deepview.js, audio.js, tune.js, tools/smoke.js, docs/plans/2026-11-09-m9-memory-release.md (part 3 as built), docs/summaries/SESSION-2026-11-23-follow-animal.md
