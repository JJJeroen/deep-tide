# Session Handoff - 2026-11-16 (later)

**Project:** deep-tide
**Status:** The owner's four picks from the phone-pan review are built and live: grey dead zone with edges, boat lights at night, Biodiversity/Water on phones, a smaller phone toolbar. Blind review round 1 had no P0/P1, so it stopped; the P2/P3 list below waits on the owner.

## Decisions Made
- Owner: "1 2 3 agreed, and shrink the phone toolbar" (dead zone pass, boat deck lights, phone Biodiversity/Water, smaller phone toolbar).
- Phone toolbar (<= 760 px wide, index.html): a line for the picked tool, then two rows of tools. The line holds the tool's setting (Excluder / what to pour / what to stock) and its hint cut to one line. The hint opens in full the first time each tool is picked in a game; it folds at the first touch on the water or after 9 s, and a tap toggles it (ui.js showHint). Short names on phones: Invader, Protect. Warmth moved behind More on phones. Desktop toolbar unchanged.
- The fit uses the toolbar with the hint folded (render.js measureChrome). Both top panels are now measured once per fit, folded and at the surface (the strip used to be re-measured every 6 frames). A panel that grows later lies over the sky; the pan track follows the panels' live bottom.
- Dead zone (render.js drawDeadZone): it drains the colour out of the water ('saturation' blend), so it reads grey over blue, green or night, then darkens. A soft swaying edge marks its top, and a fainter one its floor when that sits above the seabed.
- Boat lights (boats.js waterLight, scene.js): brighter deck floods, light on the waterline, a warm cone into the water under a working trawler, and lights that carry on the far boats and the container ship.
- Biodiversity / Water show under the phone species strip. In a run on a phone they wrap to two lines (the strip is narrow there).

## Work Completed
- Phone scale, sandbox / run (Segoe UI): 390x844 0.601 / 0.545 -> 0.656 / 0.581; 360x740 0.405 / 0.428 -> 0.481 / 0.464; 412x915 0.722 / 0.626 -> 0.736 / 0.679. Narrow landscape (740x360): toolbar 3 lines -> 2. Desktop, tablet and 844x390 unchanged.
- A fresh code review (Opus) found 3 bugs, all fixed and covered by new smoke checks:
  - The toolbar was marked with `data-tool`, so `[data-tool=X]` lookups found the bar itself. Skip ballast in a run wiped the toolbar; Pollute and then a new game threw an error. Now `data-picked`.
  - A fit in the deep froze the deep's shorter strip.
  - A fit with the species panel open kept the previous layout's height.
- Blind review fixes: the pan track hidden under a grown run panel; notices left-aligned on phones; the dead zone not reading as a layer at 90 s (floor edge, darker).
- tools/smoke.js: 79 checks. tools/shots.js: shots 12 (trawler at night) and 13 (phone, Pollute picked), and an `ONLY=05,10` filter. docs/review-brief.md: phone toolbar under "Decided on purpose", shots 12-13.
- Smoke test flakes fixed: the deep's tip card covered the strip in a new check; the stock-tap check now counts the stocking, not the total.

## Open Questions (owner): blind review round 1, with my answer
- [ ] P2 Animals too small on desktop; accents don't show; sharks look like hunters (02-04). Not this work. **Owner's call** (desktop animal scale).
- [ ] P2 Light reads as pattern: parallel shafts, line caustics (a "mesh" on the phone), surface not much brighter. Raised before. **Owner's call**; lean: one pass (soft caustic patches, varied shafts, steeper falloff).
- [ ] P2 Reef small, dim, base under the desktop toolbar. The shelf clears the toolbar by design; the rock below it does not. **Owner's call** (more light on the reef by day).
- [ ] P2 Trawl net looks like a diagram and is empty. The catch swells the codend as it fills; in 03/12 the trawl has only just started. Look: **owner's call**.
- [ ] P2 Small, low-contrast text on desktop (estimated by the reviewer). Measured earlier: dim text ~6.5:1, passes AA. Size: **owner's call**.
- [ ] P2 End screen reads as a spreadsheet. Raised before. **Owner's call**; lean: verdict + score first, the table behind "details".
- [ ] P3 Toolbar says Watch while the trawler works (03, 12): **artifact** of the shots (the script starts the trawl directly).
- [ ] P3 "The deep" button sits over the reef's right end (phone) and over the species panel (narrow landscape, as before). Open.
- [ ] P3 Deep: 500 m label behind the title panel, lanternfish read as UI marks, squid under the toolbar. Not this work.
- [ ] P3 End screen copy: "0 of 130 demanded" vs the HUD's per-minute quota; the steward comparison reads as if doing nothing beats being a steward. Not this work.
- My own, written before the review: the run's Biodiversity/Water wraps to two lines (~20 px of scale); the dead-zone edge could read as a drawn line; the trawler's cone is subtle; far boats' light on the water is small.
- Not verified on a real phone: the GPU cost of the 'saturation' blend (CPU frame time unchanged headless).

## Next Steps
1. Owner picks from the list above; a new piece of work restarts review rounds at 1.

## Files Modified
- index.html: phone toolbar CSS (.pair contents, order, #hint one line, .lg/.sh), #bio on phones, Warmth .opt, notices centred on portrait phones
- ui.js: showHint/hintSeen, data-picked, short labels, fitKey cleared at load
- render.js: measureChrome (fit with the hint folded, strip measured folded/at the surface, panelsNow), drawDeadZone/drawDeadTop/strokeDeadTop, pan track position
- scene.js: trawler light cone, bigger darkness holes, container ship light on the water
- boats.js: waterLight, brighter floods, far-boat lights
- coach.js: Learn step 4 names the invader tool without its label
- tools/smoke.js, tools/shots.js, docs/review-brief.md
