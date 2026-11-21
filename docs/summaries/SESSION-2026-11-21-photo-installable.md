# Session Handoff - 2026-11-21

**Project:** deep-tide
**Status:** M9 parts 2 (photo mode) and 6 (installable, offline) are built, reviewed and live (32e3b5b, 05b353b). The owner's
open lists from 16 Nov (blind-review P2/P3, campaign questions a-f, M8 questions) are unchanged and still wait on the owner.

## Decisions Made
- Started on M9 2 + 6 because they were already approved ("carry on with M9", 9 Nov) and need no owner calls; the review list
  and the campaign do.
- Photo picture = the world as framed on the screen (drag / wheel / camera keys; the deep works too), not always the whole
  width. Drawn at 2 px per world unit = about the sprites' (ss 3 / RS 1.3) and the reef's (2) own resolution; capped at 12 MP
  (render.js PHOTO_SCALE, PHOTO_MAX_PX, photoRect).
- renderPhoto re-runs the normal draw pass (drawFrame) into its own canvas under a bigger transform, instead of a separate
  world-space renderer: everything sized in screen pixels (line widths, deepVisible) stays right. `ctx` is now a `let`;
  the screen context is `viewCtx`.
- Panels hide with `visibility: hidden`, so measureChrome keeps measuring them and the fit never changes. Portrait phones:
  topReserve 0 while in photo mode (render.js end of measureChrome), so the column starts at the top.
- No "a tap leaves" (plan said so): a short framing drag would end it. Done / Esc / F.
- The deep's lamp freezes in photo mode (deepview.js stepLamp), so what you lit stays lit and the pointer moving to Save
  doesn't drag it into the picture. Protected-area preview off in photo mode.
- iPhone/iPad: navigator.share with the PNG first (Save Image -> Photos), download on NotAllowedError (ui.js IOS, savePhoto).
- sw.js network first, not cache first: cache first needs a cache-name bump on every push or players keep old files.
  Activate deletes only `deep-tide*` caches (all JJJeroen Pages repos share the jjjeroen.github.io origin).
- Photo button is `.opt` (behind More on phones). Desktop 761-850 px wide (iPad portrait): the toolbar now wraps to a third
  row (~40 px more over the bottom); scale unchanged there (width-limited). Accepted.

## Work Completed
- index.html: Photo button, #photoBar (Save picture / Done), body.photo CSS; head: description, theme-color, manifest,
  apple-touch-icon.
- render.js: drawFrame, renderPhoto/photoRect/shooting, `photo` gates on ruler, cursor, value tags, inspect, pan track,
  dead-zone label, PROTECTED label, trawler catch labels, edge fade (picture only), mpaPreview; resize uses viewCtx.
- ui.js: enterPhoto/leavePhoto/savePhoto/downloadPhoto, photo branch in pointerdown, drag in photo mode, keys (F, Esc, only
  camera keys in photo mode), service-worker registration on load (not on file://).
- New: manifest.webmanifest, sw.js, icons/ (4 PNGs), tools/icons.js (regenerates them).
- tools/smoke.js: 79 -> 108 checks: photo mode (desktop, phone, iPhone share stub) and installable over a local http
  server (worker installs and controls, Page.getInstallabilityErrors, icon sizes, `/__probe` counter proves network first,
  offline last copy + ?seed link plays). Mutation-tested: no worker / display "browser" / cache-first worker / lamp not frozen
  / preview not gated each fail the matching check.
- Fresh Opus code review: found the origin-wide cache deletion, the lamp + preview following the pointer into the picture,
  iOS standalone downloads, edge fade in wide pictures, resize on ctx, null getContext, early SW registration. All fixed.
- Live check after the push (https://jjjeroen.github.io/deep-tide/): scope /deep-tide/, 17 files cached under /deep-tide/,
  page controlled after reload, installability errors only "in-incognito" (the test browser), photo mode OK, no errors.

## Open Questions
- [ ] Not tried on a real phone: iPhone share sheet -> Save Image, Android download, install to home screen, offline play.
  Worth a two-minute owner test (open the live page, Add to Home Screen / Install, airplane mode, open it).
- [ ] Photo of the end screen's final ocean: F and the Photo button are blocked while the end card is up. Could add a Photo
  button to the end card (or fold it into part 4's timelapse). Owner's call.
- [ ] An in-game Install button (beforeinstallprompt) - not built; browsers offer install themselves.
- [ ] Nit left: F (like every key) does nothing while the Warmth slider has focus.
- [ ] Carried over, unchanged: blind-review P2/P3 list (SESSION-2026-11-16-phone-toolbar.md), campaign a-f
  (docs/plans/2026-11-09-m9-memory-release.md part 5), M8 questions (runoff pay 0.6 provisional, scoring ghost-net kills,
  head office vs protected area).

## Next Steps
1. M9 part 3: follow one animal (plan part 3: zoom + x-centre camera transform through toWorld/picking/cursor; sim fields
   a.id, a.meal only - seeded fingerprint must not change).
2. M9 part 4: timelapse from recorded thumbnails on the end screen (could carry the end-screen photo).
3. Part 5 campaign after the owner answers a-f.

## Files Modified
- render.js (top: viewCtx/ctx/photo; measureChrome end; mpaPreview; frame/drawFrame/renderPhoto at the end)
- deepview.js (stepLamp freeze), ui.js (photo block after hintsBtn; pointer handlers; keydown; SW registration at the end)
- index.html (head links; Photo button; #photoBar; photo CSS before </style>)
- manifest.webmanifest, sw.js, icons/*, tools/icons.js (new); tools/smoke.js (photoMode, installable)
- docs/plans/2026-11-09-m9-memory-release.md (parts 2 and 6 "as built")
