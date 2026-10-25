# Session - 2026-10-23

**Project:** deep-sea-ecosystem (Deep Tide)
**Status:** Sprite rendering pass done (visual only). Simulation, scoring and tuning harness untouched.

## What changed

`drawAgent` no longer draws paths per frame. Animals are pre-rendered once at 4x into animation frames
(`SHAPE_DRAW`, `SPRITE_BOUNDS`, `SPRITE_FRAMES`) and drawn as a single image each frame.

- **Fish** (grazer/hunter/invader): dorsal-to-belly gradient, dark outline, forked caudal fin that beats on a
  phase cycle, dorsal + anal + pectoral fins, gill line, mouth, flank stripe on grazers, short swept spines on invaders.
- **Shark**: pointed snout, countershading (dark back, pale belly), crescent tail, attached dorsal and pectoral
  fins, three gill slits, mouth line.
- **Turtle**: green shell with scutes and rim highlight, sand-coloured head/flippers, four tapered flippers that flap.
- **Manta**: broad wings with rounded tips and a concave trailing edge, radial sheen so the body reads at 30 px,
  cephalic horns, long whip tail, small eyes.
- **Eyes**: dark pupil with a thin pale rim and a glint (the old white sclera read as a cartoon eye).
- **Pitch clamp** (`MAX_PITCH`, 0.45 rad): fish hold a near-horizontal attitude instead of pointing straight down
  when they chase or flee vertically. Belly-down flip when swimming left is preserved.
- **Depth cue**: animals shrink ~8% and fade ~24% toward the seabed.

Sprites are built once at load (~3 MB of RGBA across ~50 small canvases) and shared by both modes; the jellyfish and
plankton keep their procedural rendering.

## Notes

- Tuning harness (`tune.js`) only consumes the sim block, so none of this affects balance numbers.
- Verified: both script blocks parse; page loads with no JS errors; sandbox and run modes render correctly.

## Still open (from the 2026-10-06 handoff)

- Shoaling for grazers would do more for "it feels alive" than any further sprite work.
- Manta tail is thin at 1x; could be lightened.
- Everything else in the 2026-10-06 open questions list still stands (score variance, ballast trap, mobile portrait).
