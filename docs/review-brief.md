# Review brief: Deep Tide

For the blind design review (design-review skill, section 6). The reviewer sees this file and the screenshots, nothing else.

> DRAFT, 2026-11-15: written from the project notes, not yet confirmed by the owner. Check "Decided on purpose" first.

## What it is and who it is for

Deep Tide is a browser game: a small ocean that runs without you. A side-on view of a reef wall: the sunlit top 60 m with plankton, small fish (grazers), hunters, jellyfish, sea turtles, sharks and manta rays, and below it a deep layer down to the midnight zone (lanternfish, anglerfish, giant squid, scavengers, a sperm whale). Left alone, the ocean keeps going and slowly heals. The player meddles: hand nets, a trawler, plastic and farm runoff, invasive species, warmer water; or helps: stocking, protected areas, bycatch excluders. Three modes: Learn to play, Sandbox, and the Anthropocene run (ten minutes, a fishing fleet with a rising quota, warming water, a score at the end).

It is for curious players, teens and adults, on a desktop or a phone. The point is to watch something beautiful run, then see what your meddling does to it. The harm should be felt by looking, not explained in a lecture.

## What it should feel like

- Light is the material. Sunlit shallows with light shafts and caustics, getting darker with depth. At night and in the deep, light comes from living things (glowing jellyfish, plankton, anglerfish lures) and from boats.
- Calm and alive: closer to a nature documentary than to a cartoon. Animals in natural colours.
- Harm looks like harm: murky green water in a bloom, a grey dead zone, silt and rubble where a trawl went over the reef, nets drifting.
- References: none chosen yet.

## Decided on purpose (do not report these as defects)

- A side-on 2D view. The deep layer is below the sunlit column and the player scrolls down to it.
- The deep and the night are meant to be very dark. Light comes from animals and boats only.
- Each animal keeps one bright accent in the colour of its dot in the "Life in the water" panel; the rest of it is in natural colours.
- The panels sit on top of the ocean: title top left, species panel top right, toolbar at the bottom.

## Shots

`node tools/shots.js <dir>` (in the repo; `cd tools && npm install` once). Fixed ocean seed and clock: the same command gives the same pictures. The UI uses the system font; set `FONTCONFIG_FILE` to show it as on the owner's PC (Segoe UI).

| Shot | What it shows |
|---|---|
| 01-menu-desktop | The mode picker, with the ocean running behind it |
| 02-reef-day-desktop | Sandbox, daytime, 20 s in, nothing touched |
| 03-trawler-desktop | The player's trawler dragging its net through the water column |
| 04-night-glows-desktop | Sandbox at night |
| 05-bloom-dead-zone-desktop | Farm runoff 90 s later: an algal bloom and a dead zone, the log reporting it |
| 06-deep-desktop | Scrolled down to 1000 m, the midnight zone |
| 07-end-screen-desktop | The end of an Anthropocene run in which the player did nothing |
| 08-reef-day-phone | Sandbox on a phone (390 x 844), daytime |
