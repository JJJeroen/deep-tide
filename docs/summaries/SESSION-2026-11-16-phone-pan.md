# Session Handoff - 2026-11-16

**Project:** deep-tide
**Status:** Owner's picks from the 2026-11-15 blind review are built and live (ad301c8). Blind review round 1 of this work had no P0/P1, so it stopped there; the P2/P3 list below waits on the owner.

## Decisions Made
- Owner: phone scale = "do the real fix" (pan mode), dead zone look = my proposal, and the batch (framing, reef tint, label contrast, notices off the boats).
- Pan mode only on screens <= 760 px wide held upright (render.js fitScale). Tablets and desktop windows keep the whole width, as the brief says. The code reviewer raised this as a design question.
- The scale is fitted once per window size and per mode (fitKey). Mid-game, the column may shift but never zooms. On phones, a growing run HUD lies over the sky (titleFit).
- Short landscape screens keep the old fit: clearing the toolbar there would shrink everything by about 28% (844x390: 0.405 -> 0.293).
- Touch: nets and paint wait 90 ms and one-shot tools act on release, so two-finger pans never fire a tool. A quick net tap still nets once.

## Work Completed
- render.js: pan mode (cam.x/tx, camMaxX, clampCamX), fitScale with FRAME_Y = 820 clearing the toolbar, a pan track, panAt for audio, darker dead zone with rot flecks (own seeded RNG), touch delay.
- ui.js: two-finger pan (touches, pan2), one-finger drag in both axes in pan mode, Shift+wheel, arrow keys, toolTap on release for touch, foldMore on new game, log just under the waterline, pan hints.
- scene.js: reef depth tint 0.34, bloom/murk dimming, dead-zone grey 0.85, ruler with a dark rim and kept on screen in pan mode.
- tools/smoke.js: 68 checks. tools/shots.js: 11-panned-phone. docs/review-brief.md: pan + notices decided on purpose; shot 10 described honestly.
- A fresh code review (Opus) found 4 bugs, all fixed:
  - My newGame edit had commented out the reset of the log, boats and silt.
  - The refit was stuck behind an open More on rotation or a new game.
  - On small phones the hint is taller than counted.
  - Quick net taps did nothing.

## Open Questions (owner): blind review round 1, P2/P3, with my answer
- [ ] P2 Dead zone: it is darker now, but over a bloom it mixes to dark olive, not grey, and has no top edge. The label still does part of the work. The reef under it reads. **Lean:** one more pass (neutral grey, a visible upper boundary).
- [ ] P2 Boats give almost no light at night (the brief names boats as a night light). **Lean:** yes, deck lights spilling onto the surface. New work.
- [ ] P2 Phone shows no Biodiversity/Water % (hidden on <= 760 px since before this work), yet the run's score uses them. **Lean:** fix, one compact line in the strip or the HUD.
- [ ] P3 The hint never changes in 03/05/10: **artifact** of the shots (the script calls the sim with Watch picked). In play the hint follows the tool.
- [ ] P3 Something red below the desktop toolbar: real. It is the top of the deep (giant squid), visible in the ~12 px strip under the toolbar. It was visible before this work too. **Lean:** leave, or darken that strip.
- [ ] P3 Deep ruler label under the title panel at 1000 m (the reviewer says "300 m"; it is 200/500 m). Minor.
- [ ] P3 The drop-off slope is mostly below the toolbar (bed goes to y 972, FRAME_Y is 820). Showing it costs scale. Owner's call.
- [ ] P3 Taste: net looks like a diagram, scored numbers small on desktop, lanternfish/anglerfish colours close, mantas look like eagle rays.
- [ ] My own (written before reading the reviewer): the phone toolbar is still ~25% of the screen (hint of 2-4 lines plus 3-4 rows). This is the biggest remaining lever on phone scale. The depth button sits over the reef's right end.

## Next Steps
1. Owner picks from the list above; a new piece of work restarts review rounds at 1.

## Files Modified
- render.js, ui.js, scene.js, audio.js: see Work Completed
- tools/smoke.js, tools/shots.js, docs/review-brief.md
