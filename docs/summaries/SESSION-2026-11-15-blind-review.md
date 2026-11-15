# Session Handoff - 2026-11-15

**Project:** deep-tide
**Status:** First blind design review run on 8 fixed screenshots; findings wait on the owner. No game code changed.

## Decisions Made
- The design-review skill (claude-config 1fb16c3) now has a blind review step for anything visual; Deep Tide is its first test: the owner chose option A (extend design-review) after reading Noniv/abyssal-garden's prompt.txt.
- Screenshots come from `tools/shots.js` (pinned seed `review-1`, seeded Math.random, virtual clock driven by the script); the game is untouched.
- Repeatability: byte comparison fails on ~17 px of rounded-corner anti-aliasing (delta 1) in the toolbar; the scene itself is identical. Compare with the skill's `scripts/pngdiff.js` instead.

## Work Completed
- `tools/shots.js`: 8 shots (menu, day, trawler, night, bloom/dead zone, deep 1000 m, end screen, phone), ~17 s.
- `docs/review-brief.md`: DRAFT brief, not yet confirmed by the owner.
- Blind review round 1 (Opus, new agent, saw only the brief + shots). Its findings, with my answer:

| # | Level | Finding | Answer |
|---|---|---|---|
| 1 | P1 | Log warnings unreadable over sky and murky water (red on green, overlapping lines, 05, 07) | Agree (I had it as P2). Fix. |
| 2 | P1 | Phone: ocean squeezed to ~45% between a black top block and a 4-row toolbar; ruler labels cut off (08) | Agree; phone toolbar grouping was already an open owner question. Owner's call, lean fix. |
| 3 | P2 | Jellyfish glow like neon in daylight, so the bloom looks lovely, not harmful (02, 05) | Missed it myself. Owner's call (look decision), lean agree. |
| 4 | P2 | Reef ignores night and the dead zone (04, 05) | Night: agree, render gap. Dead zone: reef health is sim state, so a design question. Owner's call. |
| 5 | P2 | Log contradicts itself ("calm" above "bloom taking over") and covers animals (04, 05) | Agree; fold into #1. |
| 6 | P2 | Deep reads as faint dashes; panel ignores where you are (06) | Partly agree (darkness is decided, the emptiness isn't). Owner's call. |
| 7-11 | P3 | Dark side bands; hard-edged light shafts; cramped end-screen labels; Excluder off looks disabled (it is an off toggle); empty seabed on the right | Seabed: disagree, the drop-off on the right is the design, add it to "Decided on purpose". Rest: owner's call. |

My own findings, written before reading the reviewer's: log (1, 5), phone (2), end-screen labels (9), deep (6), "The water is calm" on the waterline; plus one the reviewer did not raise: the grazers are ~10 px specks at 1600 px wide (ties to "fish still not beautiful").

## Open Questions
- [ ] Owner: confirm or correct `docs/review-brief.md`, especially "Decided on purpose" (candidates: the drop-off, the side bands, the daytime jellyfish glow).
- [ ] Owner: which findings to fix, and in what order.

## Next Steps
1. Owner confirms the brief; add the turned-down findings to "Decided on purpose".
2. Fix the picked findings (log readability first), rerun `node tools/shots.js`, compare with `pngdiff.js`, review round 2 with a new agent (at most 3 rounds).

## Files Modified
- tools/shots.js (new): fixed screenshots for the review
- docs/review-brief.md (new): draft brief

---

## Later the same day: owner decisions, fixes, rounds 2 and 3

**Owner:** the drop-off and the jellyfish glow are intended (now in the brief, which is confirmed); fix the findings.

**Fixed and live** (5d6991f..f1510aa, pushed; sim.js/deep.js untouched, smoke 59/59):
- Log lines on their own dark backing, warnings semibold; max 4 messages. Round-1 "7 stacked lines" and "calm + bloom" were an artifact of `tools/shots.js` (real `setTimeout` under the virtual clock); the tool now runs timers on the virtual clock.
- Phone: species panel folds to a two-column legend with names (tap opens the full panel over the water); ocean starts ~103 px down instead of ~209; Hints/Sound/Pause/Reset/Menu behind More; locked controls hidden; depth button only when the camera can reach the deep.
- Reef darkens at night and dulls under a settled dead zone (render only; measured headless: deficit at the reef 0.23 at 90 s, ~0.5 at 3-5 min).
- Lanternfish photophores draw a fish; in the deep the panel leads with the deep species.
- Soft light shafts, faded ocean ends, Excluder as a checkbox switch, end-card labels on one line, Pollute/Stock joined with their dropdowns, sparkline track.
- Shots 09 (run, phone) and 10 (dead zone on reef) added.

**Round 3 (last allowed) still has two P1s; both are owner decisions:**
1. Phone portrait: the whole 3000 m column fits the width, so animals are 3-5 px. Real fix = sunlit column at a readable scale with sideways pan (a camera/input change), or ask players to rotate.
2. The dead zone does not read as harm on the reef: the haze is lighter than the water (reads as mist) and floats at 25-45 m; the reef's dulling is too subtle. Note: my brief line "has sunk onto the reef" overstates it (deficit at the reef ~0.5, the visible core is mid-water).

**Open P2/P3 for the owner** (rounds 2+3, my lean in brackets):
- Framing: the reef and the deep floor sit under the toolbar; reserve toolbar space in the scale (lean fix).
- Reef keeps full colour at depth and in murk by day (lean fix, render only).
- Light shafts still read as bars after softening (lean one more try: angle, taper, vary).
- Secondary text: panel/hint text (#7fa6b5 on the panel) computes to ~6.5:1 and passes; depth labels (~3:1) and the dead-zone caption are low (lean fix).
- Notices now cover the surface boats (side effect of the opaque log backing; lean move them just below the waterline).
- Taste: jellyfish size/dominance by day, night animals still lit (moonlight is in the code on purpose), species accents too small to see, end screen as a ledger (fold details), net looks technical, plankton at night like stars, mantas at night like litter, toolbar bright behind the menu.

**Next:** owner picks from the lists above; new review rounds start again at 1 for a new piece of work.
