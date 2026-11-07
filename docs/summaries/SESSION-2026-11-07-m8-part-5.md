# Session Handoff - 2026-11-07 (M8 part 5)

**Project:** deep-tide
**Status:** M8.5 (farm runoff, algal bloom, oxygen dead zones) is built, measured and smoke-tested; that completes M8. Open: owner playtest + the score-shape re-check.

## Decisions Made
- **Pollute has two kinds** (sim.js `POLL_KIND`, ui.js `setPollKind`): a `<select id="pollSel">` next to Pollute (plastic / runoff; in the run: Dump with waste / farm runoff). Pressing P while Pollute is already selected switches the kind. The kind lasts for the session, like the excluder.
- **Oxygen is a deficit grid** `S.odef` (0 = as much as the water holds), not the plan's `S.oxy` grid, so an untouched ocean never runs `stepRunoff` (`S.wqOn` false). Checked with a seeded-RNG old-vs-new run (scratchpad `same.js`: 9/9 runs identical at warmth 0.5/0.2/0.75, 900 s each). Stronger than the 60-run statistical check.
- **Chain** (sim.js `RUNOFF`, `BLOOM`, `ROT`, `OXY`, `stepRunoff`): fertiliser diffuses and flushes out (0.4%/s) → bloom plankton grows in fertilised cells by daylight depth (`a.bloom`, short life 25-50 s, cap PK_CAP x 1.8) → a dead bloom speck adds rot, an eaten one adds 0.7 of that → rot burns oxygen (faster when warm) and sinks one cell per 25 s → oxygen mixes back from the surface (slow at depth). Warm water holds less (`oxySat` = 1 - 0.6 x (warmth - 0.5)).
- Three fixes the first measurements forced (all in comments at the spot):
  - Eaten bloom rots too. Otherwise grazers ate ~85% of the bloom, rot stayed tiny and patchy, and the dead zone formed only where the grazers weren't.
  - The bloom ignores night. Otherwise a spill just before dusk made no dead zone and one at dawn a big one (peak hypoxic cells 0 vs 97).
  - Rot sinks slowly. At 4 s per cell the whole dead zone sat in the bottom two rows, under the toolbar and partly inside the reef rock.
- **Animals** below oxygen 0.4 lose 6% of max energy per second at zero oxygen and steer up the oxygen gradient (and upward). Plankton doesn't care. Jellies tolerate it (`hypoxia: false`).
- **Water quality** = 1 - (plastic/0.2 + avgHyp x `HYP_W` 2.5), where avgHyp is the mean shortfall below oxygen 0.8. HYP_W is set so a 10 s runoff sweep bottoms out where a 10 s plastic sweep does (48%).
- **Recolonisation** also waits while > 3% of the water is a dead zone.
- **Run**: `RUN.RUNOFF_PAY` 1.0 per second (same as waste). End screen: farm runoff in "Where it came from", dead-zone peak next to water quality.
- **Look**: fertilised and blooming water goes pea green under the animals (bloom specks drawn yellower). The dead zone is a pale haze drawn *over* the darkness layer (dark-on-dark didn't show), labelled "dead zone · no oxygen" at its centre. A dead zone also muffles the sound and murks the light (MOOD.pol).
- Plastic's old log line 'A dead zone is spreading.' is now 'The water is thick with waste.' "Dead zone" now means oxygen only.

## Measurements
- `node tune.js 1000 30 runoff` (sweep at t = 600, warmth 0.5): dead zone in 30/30 runs, peak 9.8% of cells, ~80 s above 1%; water low 46%, back above 95% ~330 s after the harm. Wiped out: grazers 5/30, hunters 10/30, sharks 6/30. Plastic, for comparison (`pollute`, 20 runs): water low 48%, hunters 12/20, sharks 14/20. Runoff is a sharp pulse; plastic lingers and kills more.
- `runoffhot` (warmth 0.66): dead zone peak 29% of cells, ~160 s; grazers wiped 14/30, hunters 26/30, sharks 28/30. The warm squeeze works (the warm ocean is fragile already: hunters' pre-mean is 3.1).
- Bots, 12 runs each (`bot=all`): steward 35.3 (RUN.STEWARD stays 36, bio 90%), greedy 4.4, plunder -73.0, excluder 33.5, tidy -8.8, reserve 56.8, industry -0.2.
- 40 runs each: **measured 55.0 (sd 19.3), farmer 49.1 (sd 39.0), dumper 20.0 (sd 27.7)** (farmer re-run after the review fixes; the others never touch runoff). Farmer = measured + runoff top-ups late in short minutes. 12-run batches are very noisy: measured read 38.5 at 12 runs.

## Work Completed
- sim.js: POLL_KIND, RUNOFF/BLOOM/ROT/OXY, oxySat/oxyAt, addField/addRunoff, stepRunoff, diffuse, hypoxia in updMobile, rot in eat/updPlankton, bloomN in countAll, dumpAt(kind), RUNOFF_PAY, g.runoff/hypPeak, waterQuality, log lines, recolonise check
- ui.js: pollSel, setPollKind, P toggle, run labels, runoff hints, end-screen rows. index.html: the select, sound help line
- render.js: drawRunoff, drawDeadZone, bloom speck colour, runoff cursor, "gasping" / "fine without oxygen" on the animal label. scene.js: MOOD.green, dead zone in MOOD.pol
- coach.js: tips runoff, algae, deadzone, jellyzone
- tune.js: scenarios runoff/runoffhot (harm.temp), water line in pollute/runoff harm reports, farmer bot, runoff + dead-zone columns. tools/smoke.js: 6 new checks (43 total, all pass)
- Fresh-context review (opus): nothing blocking; untouched path confirmed clean. Fixed: a 1e-3 cut-off deleted ~6% of sinking rot; very warm water (> 0.83) counted as oxygen-short everywhere once runoff existed (shortfall now measured against min(0.8, saturation)); smoke test left a 50% dead zone for the later checks; P key repeat flipped the kind; switch-off could strand rot from live bloom plankton; selects keep focus after a pick (now blurred); water line printed for non-water scenarios. Not changed: the pollution tip's "above 85% clean" wording (still right for plastic); the kind carrying over between games (on purpose).

## Open Questions
- [ ] **Runoff vs not polluting**: farmer ≈ measured on average (49.1 vs 55.0), with a much wider spread. The bloom feeds the grazers, which offsets the water penalty. Plastic is a clear loss (20.0). The plan said runoff "pays a little"; it pays the same as waste (1.0/s). Keep it, or lower RUNOFF_PAY (e.g. 0.6) so runoff is a clear loss too?
- [ ] Phone toolbar: still 4 rows, no overflow, but the kind selector wraps onto the row below Pollute. Fold into the "group the harm tools" question from M8.4.
- [ ] Still open from M8.4: head office respecting the protected area; the 4-row phone toolbar.
- [ ] Score shape: M8 is complete, so re-check the verdict lines against the bots (steward 35-36, measured 55, greedy 4, plunder -73).

## Next Steps
1. Owner playtest of runoff in the sandbox and the run (pick runoff, paint, wait ~1-2 min for the dead zone).
2. Answer the open questions above; then the score-shape pass (RUN.PTS, verdict()) as the M8 wrap-up.
3. After M8: M9 from the 2026-11-01 roadmap.

## Files Modified
- sim.js, ui.js, render.js, scene.js, coach.js, index.html, tune.js, tools/smoke.js, docs/plans/2026-11-02-m8-consequences.md (built note under section 5)
