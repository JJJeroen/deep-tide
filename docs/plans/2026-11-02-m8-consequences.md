# M8 - consequences and stewardship (plan, 2026-11-02)

Owner, 2 Nov: playtest (Learn + full run) "worked fine" = the M6/M8 gate is passed. Build all four M8 parts, and close the
6 Oct questions as leaned: accept score variance, keep ballast as a trap, a missed quota sends a company trawler, rescue stays off.

## Ground rules (every piece)
- Sim first, headless (sim.js / deep.js stay DOM-free), then render, coach hint, sound if it fits, smoke-test check.
- An untouched ocean must not change: `node tune.js 1800 60 idle` and `cold` head-to-head with a `git archive HEAD` copy
  (60 runs, shark zero% is noisy, see SESSION-2026-11-02). New mechanics only act when a player (or bot) triggers them.
- Each harm gets a `tune.js` scenario (harm at 600 s, then hands off) reporting low point and recovery time, like `trawl`.
- Bots: `node tune.js 0 12 anthro bot=all` after each piece; update RUN.STEWARD if the steward moves.
- One commit per piece, pushed live once smoke test + checks pass (owner's standing OK for Deep Tide).

## 1. Company trawler (run only, small)
A minute that ends short: head office sends its own trawler the next minute, at the depth band holding the most catch value
(same rule as the bots' `trawlBand`). Its catch is the company's (does not count toward the quota), but protected animals it
takes still count as the player's bycatch: it is the player's fleet name on the hull. Bankruptcy after 3 short minutes stays.
Effect: missing the quota now harms the ocean too, so "fish nothing" is no longer free. Steward reference will drop (re-measure).

## 2. Bottom-trawl damage
A trawl whose band reaches the floor (y + band > WH - 60) scars the seabed along its path: `S.scar`, a 1-D array over x
(40 px cells), 0..1. Scars heal slowly (~8 min to half). Effects: the reef refuge shelters less where scarred
(catch reduction x (1 - scar)); upwelling from scarred floor is reduced (bottom life that recycles nutrients is gone).
Render: flattened, grey seabed strip and broken coral along the scar; fades as it heals. Hint: "That trawl dragged the floor."

## 3. Ghost nets
Each trawl has a chance (25%) to lose part of its net; a net click in the run has a small chance (5%). A ghost net is a sim
object `{x, y, w, age}` drifting with the current and sinking slowly; it entangles any non-plankton animal that touches it
(per-second chance, highest for turtles/sharks/mantas, the big slow ones), and breaks down after ~4 min (fishing for nothing).
Kills count as harm (S.harm) but never as catch. Retrieval comes with part 4.
Render: a pale, torn mesh with floats, animals caught in it. Hint on first ghost-net death.

## 4. Protected areas + bycatch excluders (+ ghost-net retrieval)
- **Protected area**: a new tool. Drag across the water to mark a vertical strip (x range, min 200 px, max one third of WW;
  one at a time, dragging again moves it). Nets and trawls do nothing inside it; the trawler lifts its net across it.
  In the run it costs nothing directly; it just leaves fish out of reach (spill-over to the rest is the payoff).
- **Excluder**: a toggle on the Trawler tool (shown next to it). With it on, protected species escape the trawl net (90%)
  and the haul of everything else is 15% lower. Off by default: the player has to choose to give up catch.
- **Retrieve**: Watch-click a ghost net to haul it up. It costs only the click; finding the nets is the effort.
Bots: add `reserve` (MPA over the reef + measured fishing) and `excluder` (measured with excluders) to BOT_LIB.

## 5. Runoff + oxygen squeeze (largest)
Split the Pollute tool into two kinds through a selector like Stock's (toolbar stays the same width):
- **Plastic** (the current pollution grid, unchanged balance): toxic, lasting, diffuses.
- **Runoff** (new grid `S.nutr`, same 40 px cells): fertiliser. Plankton grows faster on it (local bloom), the bloom dies and
  decays, decay uses oxygen: `S.oxy` grid, 1 = normal. Warm water holds less oxygen, so the squeeze is worse when hot.
  Animals in low oxygen (< 0.4) lose energy and swim away from it; plankton is unaffected; jellies tolerate it (they win in
  dead zones, as in real coastal dead zones). Oxygen recovers by mixing from the surface.
- Run: "Dump waste" becomes the plastic contract as now; a new farm-runoff contract pays a little per second too, so the
  player picks a poison. waterQuality() counts both (plastic as now, plus mean oxygen deficit).
Hints: bloom, dead zone (low oxygen), jellies taking over.
Built 2026-11-07 (see SESSION-2026-11-07-m8-part-5.md). Deviations: oxygen is a deficit grid `S.odef` (0 = healthy) so an
untouched ocean skips the whole system; eaten bloom plankton rots too (else grazing hid the effect); the bloom ignores night
(else the harm hinged on the time of day); rot sinks slowly so the dead zone forms under the bloom, not on the floor.

## Order and sessions
1 → 2 → 3 → 4 → 5, one commit each. Parts 1-3 fit one session; 4 and 5 are a session each (UI work, new grid + tuning).
Handoff after each session in docs/summaries.

## Open (not blocking, flagged for the owner)
- Score shape: parts 1, 3 and 5 add new ways to lose points; the steward reference and the verdict lines get re-measured at the end.
  Done 2026-11-08 (docs/summaries/SESSION-2026-11-08-m8-score-shape.md): weights unchanged, steward stays 36, verdict lines rewritten (fouled water and bycatch get their own lines), runoff pay 0.6 (provisional).
- Phone toolbar: part 4 adds one button (Protected area) and one toggle. If the bar overflows on 390 px, group the harm tools.
