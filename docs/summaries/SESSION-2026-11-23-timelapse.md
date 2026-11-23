# Session Handoff - 2026-11-23 (2)

**Project:** deep-tide
**Status:** M9 part 4 (end-screen timelapse) built, reviewed in a fresh Opus context, live. Smoke 131 -> 152 checks, all pass.

## Decisions Made
- Built exactly plan part 4 (docs/plans/2026-11-09-m9-memory-release.md): record during a scored run, play back on the end screen. Nothing else (no scrubbing, no photo on the end screen, no sandbox/Learn recording: only the scored run has an end screen).
- New file timelapse.js (loaded after render.js; added to sw.js CORE so it works offline). It reuses render.js drawFrame into an offscreen canvas with the same trick as photo mode: ctx/ox/oy/scale swapped for the call and restored in `finally`; `photo`+`shooting` set so labels, ruler, cursor, ring stay out; new flag `rec` (render.js) skips the lamp and makes deepVisible() false so the deep layer is not drawn.
- Frame: 480 x 289 (plan said 270; 289 is the real shape of sky + sunlit water, 1600 x 964, at 0.3), fixed camera, every 2 sim seconds, JPEG quality 0.72. A full run = 301 frames, about 2.7 MB measured. Cap TL.MAX 400.
- Recorded from frame() after the sim steps, and once more (forced) right before the end screen, so the last frame is 10:00. Paused / photo mode = no sim time passes = nothing recorded.
- Playback: 30 fps (about 10 s), time-based, decodes one JPEG at a time (createImageBitmap; never all 301 in memory). Under the picture: population lines of the animals (plankton left out), each scaled to its own peak, bright up to the playhead; the clock and caption are HTML (readable on phones). Autoplays once, then Replay. prefers-reduced-motion: no autoplay, shows the last frame, Play button.
- Settings: imageSmoothingQuality 'low' for the recording canvas (review measured ~30% cheaper).

## Work Completed
- timelapse.js, render.js (rec flag, tlStep calls), deepview.js (deepVisible), ui.js (end card markup + mount, tlReset in newGame), index.html (script + CSS), sw.js.
- Simulation unchanged: sim.js/deep.js not touched; a 400 s fixed-seed run gives an identical fingerprint with the recorder on and off (smoke check; also checked 2 plain + 2 recorded runs identical).
- Fresh Opus review: nothing serious; 7 findings fixed: recorder exception could freeze the game or skip the end screen (now try/catch, recording switches itself off); last frame still encoding when the end screen opens (reduced motion showed 9:58 under a 10:00 clock; frames carry a `ready` promise); playback never ending if a decode fails; old run's frames kept alive by the Replay button after a new game; clock text too small on phones (moved to HTML); caption said animals but drew plankton; Image fallback leak.
- tools/smoke.js: new `timelapse` section, 21 checks (see file), including mutation-style ones: a throwing recorder, reduced motion, phone width.

## Open Questions
- [ ] NOT measured on a real phone. Headless (software rendering) the recording draw costs about 5 ms per frame at 1x (25% of a normal frame, once per 2 sim seconds, i.e. every 0.5 s real at 4x). Reviewer's guess: share may be higher on a GPU phone. If the owner sees a stutter every couple of seconds at 4x: record on a frame with no sim step, or every 4 s at 4x.
- [ ] JPEG encoding (toBlob) is asynchronous but may run on the main thread in some browsers; not verified on Safari/iOS.
- [ ] Owner has not seen it on a real phone/desktop. The caption and button wording are mine.
- [ ] Carried over: follow-animal and phone items, P2/P3 review list, campaign questions a-f, M8 questions.

## Next Steps
1. Owner tries it on a phone (timelapse smoothness, size of the picture on the end card).
2. Part 5 campaign after the owner answers a-f (the plan already says the comparison screen would reuse this recorder: first-ocean picture vs this season's end).
3. Part 7 (daily ocean) if wanted.

## Files Modified
timelapse.js (new), render.js, deepview.js, ui.js, index.html, sw.js, tools/smoke.js, docs/plans/2026-11-09-m9-memory-release.md (part 4 as built), docs/summaries/SESSION-2026-11-23-timelapse.md
