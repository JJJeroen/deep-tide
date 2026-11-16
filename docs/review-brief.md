# Review brief: Deep Tide

For the blind design review (design-review skill, section 6). The reviewer sees this file and the screenshots, nothing else.

Confirmed by the owner 2026-11-15.

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
- The seabed: a reef shelf on the left that falls away into a drop-off on the right. The bare slope is the drop-off, not missing content.
- Jellyfish glow, by day too, and a jellyfish bloom is allowed to look beautiful.
- On a phone held upright the sunlit scene fills the height between the panels and the toolbar, and the view shows part of the width at a time: the player drags sideways to look along the ocean (two fingers while a tool is picked). The thin bar at the top of the water shows which part is in view. On a desktop the whole width shows.
- Messages from the ocean appear as small notices just under the waterline, centred.
- On a phone the toolbar is one line for the picked tool, then two rows of tools with short names (Invader, Protect). That line holds the tool's setting (the Excluder for the Trawler, what to pour for Pollute, what to stock) and its hint cut to one line; the hint opens in full the first time a tool is picked in a game and when the player taps it. Warmth, hints, sound, pause, reset and the menu are behind More.

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
| 09-run-phone | An Anthropocene run on a phone, 2.5 minutes in, at night |
| 10-dead-zone-on-reef-desktop | Farm runoff 4 minutes later: the dead zone fills the lower water and reaches the reef |
| 11-panned-phone | Sandbox on a phone, the view dragged to the right, over the drop-off |
| 12-trawler-night-desktop | Sandbox at night, the player's trawler at work |
| 13-pollute-phone | Sandbox on a phone, just after picking Pollute: its hint open, what to pour beside it |
