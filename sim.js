// Deep Tide simulation: pure state, no DOM. Loaded by index.html and, headless, by tune.js.
// ==SIM-START==
// The SIM-START/SIM-END markers are kept so this text can be diffed against the pre-split index.html block.
const WW = 1600, WH = 900;
const GC = 40, GCOLS = Math.ceil(WW / GC), GROWS = Math.ceil(WH / GC);
const HC = 50, HCOLS = Math.ceil(WW / HC), HROWS = Math.ceil(WH / HC);
let PK_CAP = 900;
// Rescue immigration: while a native species is down to a handful of individuals (but not yet gone), the wider ocean sends
// it one arrival at a time (see stepRecolonize). Off = populations must sustain themselves; recolonization after a species
// has died out (`natural` / `after`) still happens either way. Owner decision pending: drop it, or keep it and make it visible.
let RESCUE_ENABLED = false; // M1 tuning passes without it (see tune.js rescue=on|off)
let COLD_SLOW = 0.7; // plankton growth lost per unit of warmth below 0.5 (cold slows it; heat is handled separately)
// ---- M6, "alive". Every part can be switched off for head-to-head tuning: TUNE_PATCH='ALIVE.shoal = false' node tune.js ...
//   dvm:       day and night. The plankton rises to the surface at night and sinks into the mid-water by day, the largest
//              daily migration on Earth; grazers follow their food. Hunters hunt by sight, so they see less in deep or dark water.
//   shoal:     grazers school: cohesion, alignment, spacing (loose while foraging, tight while fleeing).
//   refuge:    the reef shelf in the bottom-left corner lowers the catch chance for fish inside it; threatened grazers head
//              for it. A reef killed by heat (S.reef.dead) stops sheltering anything.
//   nutrients: carcasses and leftovers sink as detritus, settle on the seabed and well up again to feed the plankton.
//              What nets and trawlers take leaves the system, so heavy fishing slowly starves the plankton.
const ALIVE = { dvm: true, shoal: true, refuge: true, nutrients: true };
const DAY_LEN = 240;                            // sim seconds per day and night; a run starts in the morning
const REFUGE = { x1: 640, y0: 690 };            // the reef shelf (scene.js draws it in the same place)
let NUT_U0 = 7.0;                                 // upwelling flux of an untouched ocean (measured with tune.js), see stepNutrients
const NUT_SINK = 40, NUT_RISE = 90;
let NUT_FLOOR = 0.88;                           // plankton growth with no upwelling at all, relative to an untouched ocean             // seconds: detritus settles, the seabed wells back up
const dayPhase = t => ((t / DAY_LEN + 0.08) % 1 + 1) % 1;
const smoothstep = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function nightAt(t) {
  const p = dayPhase(t);
  return p < 0.6 ? 0 : p < 0.7 ? smoothstep(0.6, 0.7, p) : p < 0.9 ? 1 : 1 - smoothstep(0.9, 1, p);
}
let LIGHT_DEPTH = 600;                          // px over which sunlight falls to 1/e
const lightAt = y => (1 - 0.8 * S.night) * Math.exp(-y / LIGHT_DEPTH); // sunlight (or moonlight) left at depth y
const inRefuge = (x, y) => x < REFUGE.x1 && y > REFUGE.y0;
// the sea floor of the sunlit layer: the reef shelf on the left (~772 px), sloping off past the bottom edge from x ~ 900
// (scene.js draws it from here). A trawl whose net reaches it drags the bottom.
const bedAt = x => 772 + 200 * smoothstep(0.3, 0.58, x / WW) + Math.sin(x * 0.013) * 7 + Math.sin(x * 0.047) * 3;
// ---- M8 bottom-trawl damage: a trawl net dragged over the floor scars it (S.scar, one value per GC-wide column, 0..1).
// Scarred reef shelters nothing (the refuge's catch cut scales with 1 - scar) and draws no fleeing fish (the dive for cover
// scales with 1 - scar where they would hide). Scarred floor recycles less: the bottom life that turns detritus back into
// nutrients is gone, so a share SCAR.nut x (mean scar over the floor) of what wells up is lost for good. Scars heal slowly
// (half-life SCAR.half s). An untouched floor has scar 0 everywhere, so none of this changes an untouched ocean.
const SCAR = { on: true, hit: 0.6, reach: 40, half: 480, nut: 0.6, cover: 1 }; // hit: scar added by one full-contact pass; reach: px of net below the bed for full contact
// ---- M8 ghost nets: a trawl pass loses part of its net with chance GHOST.lose. The lost net drifts with the current and sinks
// to the floor, and keeps fishing: any animal that swims into it is entangled (chance per second, higher for the big slow ones).
// It frays and stops fishing over GHOST.life s. Its kills are harm (S.harm) but never catch; the run counts them for the end screen.
const GHOST = { on: true, lose: 0.25, life: 240, rate: 0.12, bigRate: 0.45, big: 14, w: 46, h: 26 };
const scarAt = x => S.scar[Math.min(GCOLS - 1, Math.max(0, (x / GC) | 0))];
// ---- M8 stewardship tools (part 4). None of them acts until the player (or a bot) uses it.
//   Protected area (S.mpa = {x0, x1} or null): one vertical strip, MPA.min..MPA.max px wide. Nets and trawls take nothing in it,
//     and a trawl lifts its net over it (no scars). Head office's trawler respects it too: a closure is the law, not a favour.
//   Excluder (EXCLUDER.on, the player's setting, read when a trawl starts): a grid in the net that lets big animals out.
//     Protected animals in the band escape with chance EXCLUDER.prot, everything else (plankton aside) with EXCLUDER.leak,
//     rolled once per animal per pass. Head office never fits one.
//   Retrieval: hauling up a ghost net (retrieveGhost) removes it before it fishes on.
const MPA = { min: 200, max: Math.round(WW / 3) };
const EXCLUDER = { on: false, prot: 0.9, leak: 0.15 };
const inMpa = x => !!S.mpa && x >= S.mpa.x0 && x <= S.mpa.x1;
// the strip a drag from x0 to x1 (any order) marks: MPA.min..MPA.max wide (a long drag keeps the end it started from), inside the water
function mpaRange(x0, x1) {
  let a = Math.min(x0, x1), b = Math.max(x0, x1);
  if (b - a < MPA.min) { const c = (a + b) / 2; a = c - MPA.min / 2; b = c + MPA.min / 2; }
  if (b - a > MPA.max) { if (x1 < x0) a = b - MPA.max; else b = a + MPA.max; }
  if (a < 0) { b -= a; a = 0; } if (b > WW) { a -= b - WW; b = WW; }
  return { x0: Math.round(a), x1: Math.round(b) };
}
// one protected area at a time: marking a new one replaces it; null clears it
function setMpa(x0, x1) {
  S.mpa = x0 === null ? null : mpaRange(x0, x1);
  return S.mpa;
}
// the ghost net under (x, y), within its outline plus `pad` px (generous on touch screens), or null
function ghostAt(x, y, pad) {
  let best = null, bd = 1;
  for (const gn of S.ghosts) {
    const ex = (x - gn.x) / (GHOST.w + pad), ey = (y - gn.y) / (GHOST.h + pad), d = ex * ex + ey * ey;
    if (d <= bd) { bd = d; best = gn; }
  }
  return best;
}
function retrieveGhost(gn) {
  const i = S.ghosts.indexOf(gn);
  if (i < 0) return false;
  S.ghosts.splice(i, 1);
  const g = S.game;
  if (g.on && !g.over) g.ghostsHauled++;
  return true;
}
const massOf = s => Math.pow(s.size || 1, 1.5) / 4;  // biomass a carcass returns as detritus
let WALL_TURN_SIZE = 14; // wanderers this size and up (turtles, sharks, mantas) turn away from side walls
let CATCH_RATE = 3;  // strikes per second a predator makes at prey within its reach (see `catch` below)

// ---- "Anthropocene run": the one scored scenario. Deliberately narrow: constants here, logic in startRun/stepGame/runScore.
// Quota is in catch value per minute: demand in minute m (0-based) = Q_BASE + Q_STEP * m, judged at the end of each minute
// (no carry-over). Catch = animals killed by Net/Trawler, weighted by VALUE; protected species count as bycatch, worth 0.
// Score (rounded) = PTS.quota * mean over minutes of min(1, haul/demand)
//                 + PTS.bio * clamp((biodiversity - BIO_FLOOR) / (1 - BIO_FLOOR))   (biodiversity() at the end)
//                 + PTS.water * waterQuality()                                       (at the end)
//                 - PTS.lost per native species absent at the end
//                 - PTS.bycatch per protected animal caught
//                 - PTS.bankrupt once, if BANKRUPT_AFTER minutes in a row are missed
// A short minute also sends head office's own trawler through the richest band at the start of the next one (startTrawl
// with company = true): its catch is the company's, not quota, and the protected animals it kills are not scored as the
// player's bycatch (owner, 2 Nov: the player pays through the ocean, not for a boat they didn't steer); the end screen lists them.
// A bankrupt fleet has no boats left, so it stops then (a run that never fishes sees at most BANKRUPT_AFTER - 1 of them).
const RUN = {
  DUR: 600, MINUTE: 60,                 // sim seconds; speed-up still works because the clock is sim time
  TEMP_START: 0.5, TEMP_END: 0.66,      // warmth drifts up on its own: climate pressure the player can't touch
  Q_BASE: 4, Q_STEP: 2,                 // per-minute demand
  BANKRUPT_AFTER: 3,
  VALUE: { grazer: 1, hunter: 4, jelly: 0.5, invader: 2 }, // anything else (plankton aside) is protected bycatch
  PROTECTED: ['turtle', 'shark', 'manta'],
  DUMP_PAY: 1.0,                        // quota credit per second of dumping waste (industry contract)
  BALLAST_PAY: 4, BALLAST_EVERY: 60,    // skipping ballast treatment pays once per ship; one ship a minute
  BIO_FLOOR: 0.6,
  PTS: { quota: 40, bio: 40, water: 20, lost: 10, bycatch: 1, bankrupt: 10 },
  // typical do-nothing result, shown on the end screen (node tune.js 0 40 anthro bot=steward). M2: 41 +-5.5, bio 92%; after M6: 40.6 +-5.8;
  // M8 company trawler (two trips before the fleet goes bankrupt): 37.6 +-9.4, bio 91%; with bottom-trawl scars a second 40-run batch
  // gave 34.6 +-12.8, bio 90% (head office's band reaches the reef only ~1% of the time, so mostly noise): pooled 36, 90%.
  // Re-run and update it whenever the constants above or the species table change.
  STEWARD: { score: 36, bio: 0.90 },
};

// ---- Species table. Order = id. To add a species, add a row (and a draw shape in the renderer if it needs a new one).
// Fields: speed/turn/vision (px/s, steering rate, px), meta (energy/s), max/rep/repCost (energy), breed (s between births, default 6),
// cap (hard safety limit only: numbers are meant to be set by food and `crowd`, well below it),
// life [min,max] seconds, pol (energy/s lost per unit pollution), start (initial count), startY [min,max], stock (added per click).
// eats: ordered diet. prey = species id, gain = energy, reach = px to catch, below = only when energy < below*max,
//       catch = {min,k}: chance per strike min(1, min + preyCount/k) (CATCH_RATE strikes/s), so scarce prey is harder to catch.
//       Without `catch` prey in reach is always caught.
// flee: {from:[ids], radius, burst, cost}. filter: eats whatever drifts into reach instead of chasing. move:'drift' = jelly-style bobbing.
// sun: {y,pull} pulls toward a preferred depth. crowd: {k,tax} extra upkeep of tax*(count-k) energy/s per individual while the
//   species is over k individuals: the density-dependent brake that keeps long-lived species off their cap.
// satiate: stop hunting above this fraction of max energy.
// recolonize: {after, natural, n, needs:{id:minCount}, rescue:{below,every}}: `after` = seconds to return after a player-caused loss (n arrivals),
//   `natural` = quick silent return after a chance extinction, rescue = one arrival every `every` s while below `below` individuals
//   (rescue only when RESCUE_ENABLED).
const SPECIES = [
  { id: 'plankton', name: 'Plankton', color: '#8fe3a0', plant: true, start: 500, stock: 40 },
  { id: 'grazer', name: 'Grazers', color: '#5fd4d0', shape: 'fish', size: 5,
    speed: 42, turn: 4, vision: 70, meta: 2.6, max: 100, rep: 75, repCost: 38, pol: 5, cap: 260, life: [140, 220],
    start: 45, startY: [120, 630], stock: 5,
    eats: [{ prey: 'plankton', gain: 9, reach: 7 }],
    flee: { from: ['hunter', 'invader'], radius: 95, burst: 1.3, cost: 2 },
    sun: { y: 260, pull: 1.1, day: 320, night: 140 }, school: { r: 50, coh: 0.8, ali: 0.6, sep: 0.8, forage: 0.3 },
    recolonize: { after: 120, natural: 15, n: 6, needs: { plankton: 150 }, rescue: { below: 12, every: 30 } } },
  { id: 'hunter', name: 'Hunters', color: '#ff8a4c', shape: 'fish', size: 11,
    speed: 74, turn: 3, vision: 160, meta: 1.5, max: 240, rep: 200, repCost: 95, pol: 4, cap: 60, life: [260, 400],
    start: 7, startY: [150, 720], stock: 3, satiate: 0.85, chase: 0.5, crowd: { k: 12, tax: 0.1 }, sight: 0.6,
    eats: [{ prey: 'grazer', gain: 65, reach: 10, catch: { min: 0.15, k: 250 } }, { prey: 'jelly', gain: 14, reach: 10, below: 0.35, catch: { min: 0, k: 300 } }],
    flee: { from: ['shark'], radius: 60, burst: 1.0, cost: 2 },
    recolonize: { after: 240, natural: 15, n: 3, needs: { grazer: 25 }, rescue: { below: 4, every: 45 } } },
  { id: 'jelly', name: 'Jellyfish', color: '#c79bff', shape: 'jelly', size: 9,
    speed: 16, turn: 1.5, vision: 30, meta: 0.25, max: 100, rep: 85, repCost: 42, pol: 0, cap: 200, life: [200, 320],
    start: 10, startY: [100, 720], stock: 5, filter: true, move: 'drift',
    eats: [{ prey: 'plankton', gain: 22, reach: 30 }],
    sun: { y: 260, pull: 0.6, spread: 150 }, crowd: { k: 16, tax: 0.04 },
    bloom: { at: 45, clear: 30, msg: 'A jellyfish bloom is taking over.' },
    recolonize: { after: 180, natural: 20, n: 4, needs: { plankton: 150 }, rescue: { below: 3, every: 60 } } },
  { id: 'invader', name: 'Invaders', color: '#ff3d7f', shape: 'fish', size: 9, spines: true, invasive: true,
    speed: 84, turn: 3.5, vision: 150, meta: 2.4, max: 150, rep: 90, repCost: 45, pol: 0, cap: 80, life: [300, 500],
    start: 0, stock: 3, satiate: 0.85, chase: 1.5,
    eats: [{ prey: 'grazer', gain: 40, reach: 10 }, { prey: 'jelly', gain: 14, reach: 10 }] },
  { id: 'turtle', name: 'Sea turtles', color: '#d9b24c', shape: 'turtle', size: 14,
    speed: 24, turn: 2, vision: 90, meta: 0.6, max: 200, rep: 160, repCost: 80, breed: 60, pol: 6, cap: 16, life: [500, 800],
    start: 3, startY: [100, 600], stock: 2, satiate: 0.8, chase: 0.5, sun: { y: 300, pull: 0.7 }, crowd: { k: 6, tax: 0.1 },
    eats: [{ prey: 'jelly', gain: 30, reach: 12, catch: { min: 0, k: 300 } }, { prey: 'plankton', gain: 1.5, reach: 14, below: 0.7 }],
    recolonize: { after: 300, natural: 30, n: 2, needs: { jelly: 8 }, rescue: { below: 2, every: 120 } } },
  { id: 'shark', name: 'Sharks', color: '#9fb6cf', shape: 'shark', size: 17,
    speed: 78, turn: 2.5, vision: 190, meta: 0.75, max: 400, rep: 330, repCost: 165, breed: 60, pol: 3, cap: 12, life: [700, 1100],
    start: 2, startY: [200, 750], stock: 2, satiate: 0.8, chase: 1.5, crowd: { k: 3, tax: 0.5 },
    eats: [{ prey: 'hunter', gain: 140, reach: 12, catch: { min: 0, k: 200 } }],
    recolonize: { after: 400, natural: 30, n: 2, needs: { hunter: 4 }, rescue: { below: 2, every: 150 } } },
  { id: 'manta', name: 'Manta rays', color: '#5a7be6', shape: 'manta', size: 16,
    speed: 40, turn: 1.5, vision: 30, meta: 0.8, max: 200, rep: 150, repCost: 75, breed: 40, pol: 4, cap: 30, life: [500, 800],
    start: 3, startY: [150, 600], stock: 2, filter: true, sun: { y: 300, pull: 0.8 }, crowd: { k: 6, tax: 0.3 },
    eats: [{ prey: 'plankton', gain: 8, reach: 34 }],
    recolonize: { after: 300, natural: 60, n: 2, needs: { plankton: 200 }, rescue: { below: 2, every: 120 } } },
];

const IDX = {};
SPECIES.forEach((s, i) => { s.i = i; IDX[s.id] = i; });
const N = SPECIES.length;
const BIT = SPECIES.map((_, i) => 1 << i);
for (const s of SPECIES) {
  for (const d of s.eats || []) { d.p = IDX[d.prey]; d.mask = BIT[d.p]; }
  if (s.flee) s.flee.mask = s.flee.from.reduce((m, id) => m | BIT[IDX[id]], 0);
}
const [PLANKTON, GRAZER, HUNTER, JELLY, INVADER] = [0, 1, 2, 3, 4];
const NATIVE = SPECIES.filter(s => !s.invasive);
const RUN_VAL = SPECIES.map(s => RUN.VALUE[s.id] || 0);
const RUN_PROTECTED = SPECIES.map(s => RUN.PROTECTED.includes(s.id));

const zeros = () => new Array(N).fill(0);
const S = {
  t: 0, temp: 0.5, agents: [], newborns: [], poll: new Float32Array(GCOLS * GROWS), avgPoll: 0,
  trawlers: [], hist: [], hacc: 0, plankAcc: 0, counts: zeros(), events: [],
  hash: [], flags: {}, peak: zeros(), effects: [], heal: zeros(), rescue: zeros(), harm: zeros(), zero: zeros(), harmed: zeros(),
  game: { on: false }, ghosts: [], mpa: null, night: 0, reef: { bleach: 0, dead: 0 }, scar: new Float32Array(GCOLS), detritus: 0, seabed: 0, upwell: 0, sinkFlux: 0,
};
for (let i = 0; i < HCOLS * HROWS; i++) S.hash.push([]);

const rnd = (a, b) => a + Math.random() * (b - a);

function makeAgent(t, x, y) {
  const s = SPECIES[t];
  return {
    t, x, y, vx: 0, vy: 0, ang: Math.random() * 6.283, dead: false, age: 0, cool: rnd(0, 6), phase: Math.random() * 6.283,
    e: s.plant ? 0 : (s.max * rnd(0.45, 0.7)),
    maxAge: s.plant ? rnd(40, 90) : rnd(s.life[0], s.life[1]),
  };
}

function resetWorld() {
  S.t = 0; S.agents = []; S.newborns = []; S.poll.fill(0); S.avgPoll = 0; S.trawlers = []; S.hist = []; S.hacc = 0; S.events = [];
  S.flags = { stockHint: false }; S.peak = zeros(); S.effects = []; S.plankAcc = 0; S.heal = zeros(); S.rescue = zeros(); S.harm = zeros().map(() => -1e9); S.zero = zeros(); S.harmed = zeros();
  S.game = { on: false };
  // start at the steady state of an untouched ocean: no transient while the nutrient pools fill up
  S.night = nightAt(0); S.reef = { bleach: 0, dead: 0 }; S.scar.fill(0); S.scarMean = 0; S.ghosts = []; S.mpa = null; S.detritus = NUT_U0 * NUT_SINK; S.seabed = NUT_U0 * NUT_RISE; S.upwell = NUT_U0;
  for (const s of SPECIES) {
    for (let i = 0; i < (s.start || 0); i++) {
      const a = s.plant ? spawnPlankton() : makeAgent(s.i, rnd(100, WW - 100), rnd(s.startY[0], s.startY[1]));
      a.age = rnd(0, 0.6) * a.maxAge; // stagger the founders so they don't all die of old age together
      S.agents.push(a);
    }
  }
  countAll();
  log('The water is calm.', 'good');
}

function spawnPlankton() {
  // sunlight is strongest near the surface, so plankton cluster there
  const a = makeAgent(PLANKTON, rnd(10, WW - 10), WH * Math.pow(Math.random(), 1.7));
  a.maxAge = rnd(40, 90);
  return a;
}

function pollIdx(x, y) {
  const cx = Math.min(GCOLS - 1, Math.max(0, (x / GC) | 0)), cy = Math.min(GROWS - 1, Math.max(0, (y / GC) | 0));
  return cy * GCOLS + cx;
}
const pollAt = (x, y) => S.poll[pollIdx(x, y)];

function buildHash() {
  for (const b of S.hash) b.length = 0;
  for (const a of S.agents) {
    if (a.dead) continue;
    const cx = Math.min(HCOLS - 1, Math.max(0, (a.x / HC) | 0)), cy = Math.min(HROWS - 1, Math.max(0, (a.y / HC) | 0));
    S.hash[cy * HCOLS + cx].push(a);
  }
}

function nearest(x, y, r, mask, self) {
  let best = null, bd = r * r;
  const x0 = Math.max(0, ((x - r) / HC) | 0), x1 = Math.min(HCOLS - 1, ((x + r) / HC) | 0);
  const y0 = Math.max(0, ((y - r) / HC) | 0), y1 = Math.min(HROWS - 1, ((y + r) / HC) | 0);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const b = S.hash[cy * HCOLS + cx];
    for (let i = 0; i < b.length; i++) {
      const o = b[i];
      if (o.dead || o === self || !(BIT[o.t] & mask)) continue;
      const dx = o.x - x, dy = o.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = o; }
    }
  }
  return best;
}

function countAll() {
  const c = zeros();
  for (const a of S.agents) if (!a.dead) c[a.t]++;
  S.counts = c;
  return c;
}

// The daily migration: the zooplankton half of the plankton sinks into the mid-water by day and rises to the surface at
// night, each particle to its own depth (from a.phase) so the layer stays spread. Grazers follow their food up and down; hunters, who hunt by sight,
// see less in the dark. New plankton still grows near the surface (spawnPlankton).
let PK_DAY = [100, 420], PK_NIGHT = [15, 220], PK_SWIM = 9, PK_MIGRANT = 0.5; // depth ranges (px), swimming speed (px/s), share that migrates
function updPlankton(a, dt) {
  a.age += dt;
  a.x += (Math.random() - 0.5) * 8 * dt;
  a.y += (Math.random() - 0.45) * 6 * dt;
  if (ALIVE.dvm && a.phase < 6.283 * PK_MIGRANT) { // the zooplankton share swims; the phytoplankton stays where it grows
    const f = a.phase / 6.283 / PK_MIGRANT, ty = PK_DAY[0] + f * (PK_DAY[1] - PK_DAY[0]) + (PK_NIGHT[0] + f * (PK_NIGHT[1] - PK_NIGHT[0]) - PK_DAY[0] - f * (PK_DAY[1] - PK_DAY[0])) * S.night;
    a.y += Math.max(-PK_SWIM, Math.min(PK_SWIM, (ty - a.y) * 0.2)) * dt;
  }
  if (a.x < 5) a.x = 5; else if (a.x > WW - 5) a.x = WW - 5;
  if (a.y < 3) a.y = 3; else if (a.y > WH - 3) a.y = WH - 3;
  if (a.age > a.maxAge || Math.random() < pollAt(a.x, a.y) * 0.3 * dt) a.dead = true;
}

function eat(pred, prey, gain) {
  prey.dead = true;
  if (prey.t !== PLANKTON) S.detritus += massOf(SPECIES[prey.t]) * 0.4; // scraps and waste from a meal sink too
  pred.e = Math.min(SPECIES[pred.t].max, pred.e + gain);
  S.effects.push({ x: prey.x, y: prey.y, t: 0, kind: prey.t === PLANKTON ? 0 : 1 });
}

function updMobile(a, dt) {
  const s = SPECIES[a.t];
  const tf = 0.7 + 0.6 * S.temp; // warmer water = faster metabolism
  a.e -= (s.meta * tf + pollAt(a.x, a.y) * s.pol) * dt;
  if (s.crowd && S.counts[a.t] > s.crowd.k) a.e -= (S.counts[a.t] - s.crowd.k) * s.crowd.tax * dt;
  a.age += dt; a.cool -= dt;
  if (a.e <= 0 || a.age > a.maxAge) { a.dead = true; S.detritus += massOf(s); return; } // the carcass sinks

  let dx = 0, dy = 0, mul = 0.5, wander = true;
  const thr = s.flee ? nearest(a.x, a.y, s.flee.radius, s.flee.mask, a) : null;
  if (thr) {
    dx = a.x - thr.x; dy = a.y - thr.y; mul = s.flee.burst; a.e -= s.flee.cost * dt; wander = false;
    if (ALIVE.refuge && s.school && S.reef.dead < 0.9 && a.x < REFUGE.x1 + 260 && a.y > REFUGE.y0 - 260) { // close to a living reef: dive for cover
      const m0 = Math.hypot(dx, dy) || 1, rx = Math.min(REFUGE.x1 - 60, a.x) - a.x, ry = Math.max(REFUGE.y0 + 60, a.y) - a.y, rm = Math.hypot(rx, ry) || 1;
      const pull = 0.8 * (1 - SCAR.cover * scarAt(a.x + rx)); // scarred coral hides nothing, so it draws no one
      dx = dx / m0 + rx / rm * pull; dy = dy / m0 + ry / rm * pull;
    }
    // cornered: an escape that points into a wall turns along it instead, so the animal bolts sideways rather than
    // pressing itself against the edge. Without this a shark could hold a hunter on a side wall for 15 s and more
    // (the last of the wall pinning); sharks lost those easy kills, which shark meta 0.75 (was 1.0) gives back.
    if ((a.x < 40 && dx < 0) || (a.x > WW - 40 && dx > 0)) { dy += (dy < 0 ? -1 : 1) * Math.abs(dx); dx = 0; }
    if ((a.y < 40 && dy < 0) || (a.y > WH - 40 && dy > 0)) { dx += (dx < 0 ? -1 : 1) * Math.abs(dy); dy = 0; }
  } else if (s.filter) {
    const d = s.eats[0], f = nearest(a.x, a.y, d.reach, d.mask, a);
    if (f) eat(a, f, d.gain);
    if (s.move === 'drift') { // slow pulsing drift
      dy = Math.sin(S.t * 0.6 + a.phase) * 0.8; dx = Math.cos(a.ang) * 0.5;
      a.ang += (Math.random() - 0.5) * 1.5 * dt; mul = 0.5; wander = false;
      if ((a.x < 90 && dx < 0) || (a.x > WW - 90 && dx > 0)) a.ang = Math.PI - a.ang; // drift away from the side walls
    }
  } else if (a.e < s.max * (s.satiate || 1.01)) {
    for (const d of s.eats) {
      if (d.below && a.e >= s.max * d.below) continue;
      // hunters that hunt by sight see less in deep or dark water
      const vis = ALIVE.dvm && s.sight ? s.vision * (s.sight + (1 - s.sight) * lightAt(a.y)) : s.vision;
      const prey = nearest(a.x, a.y, vis, d.mask, a);
      if (!prey) continue;
      dx = prey.x - a.x; dy = prey.y - a.y; mul = 1; wander = false;
      if (s.chase) a.e -= s.chase * dt;
      if (dx * dx + dy * dy < d.reach * d.reach) {
        // rare prey scatters and hides, which keeps predators from driving it to zero
        // p is the chance per strike; a predator strikes CATCH_RATE times per second while prey is in reach,
        // so the per-step chance is 1-(1-p)^(CATCH_RATE*dt) and the outcome doesn't depend on the step size
        let p = d.catch ? Math.min(1, d.catch.min + S.counts[d.p] / d.catch.k) : 1;
        if (ALIVE.refuge && SPECIES[prey.t].school && inRefuge(prey.x, prey.y)) p *= 1 - 0.65 * (1 - S.reef.dead) * (1 - scarAt(prey.x)); // small fish hide in the reef; a dead or trawled one hides nothing
        if (Math.random() < 1 - Math.pow(1 - p, CATCH_RATE * dt)) eat(a, prey, d.gain);
      }
      break;
    }
  }

  if (wander) { a.ang += (Math.random() - 0.5) * 4 * dt; dx = Math.cos(a.ang); dy = Math.sin(a.ang); }
  // some species drift back toward the sunlit layer where the plankton lives
  // with day and night, migrants follow the light: deep by day, near the surface at night
  // (grazers follow the migrating plankton: their preferred depth moves with it). `spread` gives each animal its own depth
  // around the species' one, so a species doesn't line up in a single band.
  if (s.sun) {
    let sunY = ALIVE.dvm && s.sun.night !== undefined ? s.sun.day + (s.sun.night - s.sun.day) * S.night : s.sun.y;
    if (s.sun.spread) sunY += (a.phase / 6.283 - 0.5) * s.sun.spread;
    dy += Math.max(-1, Math.min(1, (sunY - a.y) / 220)) * s.sun.pull;
  }
  const m = Math.hypot(dx, dy) || 1;
  dx /= m; dy /= m;
  // same-species spacing: cruising animals of one kind keep about a body length apart instead of stacking into one
  // shape. Only while wandering: a chase or an escape is never bent off its line by this (it is a look, not a tactic).
  if (ALIVE.shoal && s.school) {
    // a school: steer toward the neighbours' centre, match their heading, keep a body length apart.
    // While fleeing there is no pull to the centre: the school bursts and turns together.
    const sc = s.school, r2 = sc.r * sc.r, sepR = s.size * 2.4, w = thr ? 1.2 : wander ? 1 : sc.forage;
    let n = 0, cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0;
    const x0 = Math.max(0, ((a.x - sc.r) / HC) | 0), x1 = Math.min(HCOLS - 1, ((a.x + sc.r) / HC) | 0);
    const y0 = Math.max(0, ((a.y - sc.r) / HC) | 0), y1 = Math.min(HROWS - 1, ((a.y + sc.r) / HC) | 0);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (const o of S.hash[gy * HCOLS + gx]) {
      if (o === a || o.dead || o.t !== a.t) continue;
      const ex = o.x - a.x, ey = o.y - a.y, d2 = ex * ex + ey * ey;
      if (d2 > r2) continue;
      n++; cx += ex; cy += ey; ax += o.vx; ay += o.vy;
      if (d2 < sepR * sepR) { const d = Math.sqrt(d2) || 1; sx -= ex / d * (1 - d / sepR); sy -= ey / d * (1 - d / sepR); }
    }
    if (n) {
      if (!thr) { const cm = Math.hypot(cx, cy) || 1; dx += cx / cm * sc.coh * w; dy += cy / cm * sc.coh * w; }
      dx += ax / n / s.speed * sc.ali * w; dy += ay / n / s.speed * sc.ali * w;
      dx += sx * sc.sep; dy += sy * sc.sep;
    }
  } else if (wander) {
    const sepR = s.size * 2.4, nb = nearest(a.x, a.y, sepR, BIT[a.t], a);
    if (nb) { const ex = a.x - nb.x, ey = a.y - nb.y, d = Math.hypot(ex, ey) || 1, w = (1 - d / sepR) * 1.2; dx += ex / d * w; dy += ey / d * w; }
  }
  // soft walls steer wanderers only: a hunter or forager chasing something must be free to reach the edge.
  // Big animals also turn their heading away from a side wall; otherwise heading and push cancel out and they slide
  // up and down along it, pinned there for minutes. Small fish keep the old behaviour on purpose: hunters losing time
  // at the walls is part of the M1 balance (with the turn for all species, hunters were at zero 2.4% vs 1.2%).
  if (wander) {
    const turn = s.size >= WALL_TURN_SIZE;
    if (a.x < 90) { dx += 1.2; if (turn && Math.cos(a.ang) < 0) a.ang = Math.PI - a.ang; }
    else if (a.x > WW - 90) { dx -= 1.2; if (turn && Math.cos(a.ang) > 0) a.ang = Math.PI - a.ang; }
    if (a.y < 40) dy += 1.2; else if (a.y > WH - 70) dy -= 1.2;
  }
  const m2 = Math.hypot(dx, dy) || 1;
  const sp = s.speed * mul;
  a.vx += (dx / m2 * sp - a.vx) * Math.min(1, s.turn * dt);
  a.vy += (dy / m2 * sp - a.vy) * Math.min(1, s.turn * dt);
  a.x += a.vx * dt; a.y += a.vy * dt;
  if (a.x < 4) { a.x = 4; a.vx = Math.abs(a.vx); } else if (a.x > WW - 4) { a.x = WW - 4; a.vx = -Math.abs(a.vx); }
  if (a.y < 4) { a.y = 4; a.vy = Math.abs(a.vy); } else if (a.y > WH - 4) { a.y = WH - 4; a.vy = -Math.abs(a.vy); }

  if (a.e >= s.rep && a.cool <= 0 && S.counts[a.t] < s.cap) {
    a.e -= s.repCost; a.cool = s.breed || 6;
    const k = makeAgent(a.t, a.x + rnd(-8, 8), a.y + rnd(-8, 8));
    k.e = s.repCost * 0.8;
    S.newborns.push(k);
    S.counts[a.t]++;
  }
}

function step(dt) {
  S.t += dt;
  S.night = nightAt(S.t);
  stepReef(dt); stepNutrients(dt); stepScar(dt);
  buildHash();
  const c = S.counts;
  for (const a of S.agents) {
    if (a.dead) continue;
    if (a.t === PLANKTON) updPlankton(a, dt); else updMobile(a, dt);
  }
  // plankton growth: logistic + a small trickle carried in by currents. Pollution suppresses it, and so does any water
  // away from temperate: heat stresses it hard, cold just slows it (COLD_SLOW = growth lost per unit of temp below 0.5).
  const pk = c[PLANKTON];
  const heat = S.temp > 0.5 ? Math.max(0.05, 1 - 2.4 * (S.temp - 0.5)) : 1 - COLD_SLOW * (0.5 - S.temp);
  // upwelled nutrients feed it: an untouched ocean sits at 1, a fished-out one runs down toward NUT_FLOOR
  const nut = ALIVE.nutrients ? Math.max(NUT_FLOOR, Math.min(1.25, NUT_FLOOR + (1 - NUT_FLOOR) * S.upwell / NUT_U0)) : 1;
  S.plankAcc += (0.12 * pk * Math.max(0, 1 - pk / PK_CAP) * heat * nut + 2.5 * heat) * dt;
  while (S.plankAcc >= 1) {
    S.plankAcc -= 1;
    const k = spawnPlankton();
    if (Math.random() >= pollAt(k.x, k.y)) S.agents.push(k);
  }
  for (const k of S.newborns) S.agents.push(k);
  S.newborns.length = 0;
  stepTools(dt);
  stepPollution(dt);
  S.agents = S.agents.filter(a => !a.dead);
  countAll();
  stepRecolonize(dt);
  stepGame();
  for (const e of S.effects) e.t += dt;
  S.effects = S.effects.filter(e => e.t < 0.5);
  S.hacc += dt;
  if (S.hacc >= 1) { S.hacc -= 1; sample(); }
}

// Coral health: heat bleaches the reef within tens of seconds; a reef that stays bleached dies over minutes and recovers
// far more slowly than it died. Read by the refuge and drawn by scene.js.
function stepReef(dt) {
  const r = S.reef, target = smoothstep(0.56, 0.72, S.temp);
  r.bleach += (target - r.bleach) * Math.min(1, dt / (target > r.bleach ? 25 : 120));
  if (r.bleach > 0.75) r.dead = Math.min(1, r.dead + dt / 240); else r.dead = Math.max(0, r.dead - dt / 900);
}
function stepScar(dt) {
  const k = Math.min(1, dt * Math.LN2 / SCAR.half);
  let sum = 0;
  for (let c = 0; c < GCOLS; c++) if (S.scar[c] > 0) { S.scar[c] = S.scar[c] < 1e-3 ? 0 : S.scar[c] * (1 - k); sum += S.scar[c]; }
  S.scarMean = sum / GCOLS;
}
// Nutrients: detritus settles on the seabed (NUT_SINK s), the seabed wells up again (NUT_RISE s). S.upwell is that flux.
function stepNutrients(dt) {
  if (dt <= 0) return;
  const sink = S.detritus * Math.min(1, dt / NUT_SINK), rise = S.seabed * Math.min(1, dt / NUT_RISE);
  S.detritus -= sink; S.seabed += sink - rise; S.upwell = rise * (1 - SCAR.nut * (S.scarMean || 0)) / dt; // scarred floor: the rest is lost
  S.sinkFlux = sink / dt; // what settles out of the sunlit layer: deep.js feeds the deep with it (read only)
}

// Immigration from the wider ocean, only while the water is healthy (clean, not overheated) and the species' food is plentiful.
// - Rescue: a species down to a few individuals gets a trickle of arrivals, so pure bad luck can't empty it.
// - Recolonization: a species that has died out comes back. If the player caused the loss (killed it recently, fouled or heated
//   the water, or released invaders) that takes a long time (`after`) and is announced. A natural loss is a quick blip (`natural`).
function stepRecolonize(dt) {
  const healthy = S.avgPoll < 0.03 && S.temp < 0.7;
  const invaded = S.counts[INVADER] > 0;
  for (const s of NATIVE) {
    if (!s.recolonize || s.plant) continue;
    const i = s.i, r = s.recolonize, n = S.counts[i];
    if (n > 0) S.zero[i] = 0;
    else if (!S.zero[i]) { // the moment it hit zero: whose fault was it?
      S.zero[i] = 1;
      S.harmed[i] = (S.t - S.harm[i] < 150 || !healthy || invaded) ? 1 : 0;
      if (S.harmed[i]) {
        log(s.name + ' have been wiped out.', 'warn');
        if (!S.flags.stockHint && !S.game.on) { S.flags.stockHint = true; S.flags.stockPulse = true; log('Stock them back now, or give the water time to heal: if it stays clean and cool they\'ll drift back in. Rebuild bottom-up.', 'good'); }
      }
    }
    const fed = Object.keys(r.needs).every(id => S.counts[IDX[id]] >= r.needs[id]);
    if (!healthy || !fed) { S.heal[i] = Math.max(0, S.heal[i] - dt); S.rescue[i] = Math.max(0, S.rescue[i] - dt); continue; }
    if (n === 0) {
      S.rescue[i] = 0; S.heal[i] += dt;
      if (S.heal[i] >= (S.harmed[i] ? r.after : r.natural)) {
        S.heal[i] = 0; arrive(i, S.harmed[i] ? r.n : 2);
        if (S.harmed[i]) log(s.name + ' have returned from the open ocean.', 'good');
      }
    } else if (RESCUE_ENABLED && r.rescue && n < r.rescue.below) {
      S.heal[i] = 0; S.rescue[i] += dt;
      if (S.rescue[i] >= r.rescue.every) { S.rescue[i] = 0; arrive(i, 1); }
    } else { S.heal[i] = 0; S.rescue[i] = 0; }
  }
}
function arrive(i, n) {
  const x = Math.random() < 0.5 ? 40 : WW - 40;
  for (let k = 0; k < n; k++) {
    const a = makeAgent(i, x + rnd(-15, 15), rnd(120, WH * 0.7));
    a.e = SPECIES[i].max * 0.9; // arrivals are fit, not starving
    S.agents.push(a);
  }
}

function stepPollution(dt) {
  const g = S.poll, n = S.pollB || (S.pollB = new Float32Array(g.length)), k = Math.min(0.5, 0.8 * dt), decay = 1 - 0.004 * dt;
  let sum = 0;
  for (let y = 0; y < GROWS; y++) for (let x = 0; x < GCOLS; x++) {
    const i = y * GCOLS + x, v = g[i];
    const l = x > 0 ? g[i - 1] : v, r = x < GCOLS - 1 ? g[i + 1] : v, u = y > 0 ? g[i - GCOLS] : v, d = y < GROWS - 1 ? g[i + GCOLS] : v;
    n[i] = (v + k * ((l + r + u + d) / 4 - v)) * decay;
    sum += n[i];
  }
  S.pollB = g; S.poll = n; S.avgPoll = sum / n.length; // swap buffers instead of allocating
}

function addPollution(x, y, r, amt) {
  const g = S.poll;
  for (let cy = Math.max(0, ((y - r) / GC) | 0); cy <= Math.min(GROWS - 1, ((y + r) / GC) | 0); cy++)
    for (let cx = Math.max(0, ((x - r) / GC) | 0); cx <= Math.min(GCOLS - 1, ((x + r) / GC) | 0); cx++) {
      const d = Math.hypot((cx + 0.5) * GC - x, (cy + 0.5) * GC - y);
      if (d < r) g[cy * GCOLS + cx] = Math.min(1, g[cy * GCOLS + cx] + amt * (1 - d / r));
    }
}

function netAt(x, y, r) {
  let n = 0;
  for (const a of S.agents) {
    if (a.dead || a.t === PLANKTON || inMpa(a.x)) continue;
    if (Math.hypot(a.x - x, a.y - y) < r) { a.dead = true; n++; harvest(a); }
  }
  return n;
}
// an animal taken by a net or trawler: marks the harm, and in the scored run lands it on deck as catch (or protected bycatch)
// (company = head office's trawler: neither its catch nor its bycatch is the player's, it is only counted for the end screen)
function harvest(a, company) {
  S.harm[a.t] = S.t; S.effects.push({ x: a.x, y: a.y, t: 0, kind: 2, sp: a.t }); // sp: the renderer hauls the right animal up
  const g = S.game;
  if (!g.on || g.over || a.t === PLANKTON) return;
  if (company) { if (RUN_PROTECTED[a.t]) g.companyProt++; else g.company += RUN_VAL[a.t]; }
  else if (RUN_PROTECTED[a.t]) g.bycatch++;
  else { g.haul += RUN_VAL[a.t]; g.fish += RUN_VAL[a.t]; }
}
// dumping waste: pollution everywhere, and in the scored run an industry contract that pays toward the quota
function dumpAt(x, y, dt) {
  addPollution(x, y, 80, 0.08);
  const g = S.game;
  if (g.on && !g.over) { g.haul += RUN.DUMP_PAY * dt; g.dumped += RUN.DUMP_PAY * dt; }
}
// releasing invaders. In the scored run this is a ship skipping ballast-water treatment: it pays once, and a ship only
// comes in every BALLAST_EVERY seconds. Returns false (nothing released) while no ship is in port.
function releaseInvaders(x, y) {
  const g = S.game;
  if (g.on && !g.over) {
    if (S.t - g.ballastAt < RUN.BALLAST_EVERY) return false;
    g.ballastAt = S.t; g.haul += RUN.BALLAST_PAY; g.ballast += RUN.BALLAST_PAY;
  }
  spawnMany(INVADER, x, y, 3);
  return true;
}

function startTrawl(y, company) {
  const excl = !company && EXCLUDER.on;
  S.trawlers.push({ x: -80, y, band: 90, speed: 380, company: !!company, scarred: new Uint8Array(GCOLS), excl, spared: excl ? new Set() : null, escProt: 0, escOther: 0 });
}
// the depth whose trawl band (+-90 px) holds the most catch value outside the protected area: where a skipper would set the net
function richestBand() {
  let by = 450, bv = -1;
  for (let y = 90; y <= WH - 90; y += 60) { let v = 0; for (const a of S.agents) if (!a.dead && Math.abs(a.y - y) <= 90 && !inMpa(a.x)) v += RUN_VAL[a.t]; if (v > bv) { bv = v; by = y; } }
  return by;
}

function stepTools(dt) {
  for (const tr of S.trawlers) {
    const nx = tr.x + tr.speed * dt;
    for (const a of S.agents) {
      if (a.dead || a.x < tr.x - 10 || a.x > nx + 10 || Math.abs(a.y - tr.y) > tr.band || inMpa(a.x)) continue;
      // an excluder grid: each animal gets one chance per pass to slip out (protected ones nearly always do)
      if (tr.excl && a.t !== PLANKTON) {
        if (tr.spared.has(a)) continue;
        if (Math.random() < (RUN_PROTECTED[a.t] ? EXCLUDER.prot : EXCLUDER.leak)) { tr.spared.add(a); if (RUN_PROTECTED[a.t]) tr.escProt++; else tr.escOther++; continue; }
      }
      // bycatch: everything in the net dies, plankton too (at a lower rate)
      if (a.t !== PLANKTON || Math.random() < 0.5) { a.dead = true; harvest(a, tr.company); }
    }
    // the net mouth dragging over the floor scars each column once per pass, harder the deeper it digs (lifted over a protected area)
    if (SCAR.on) for (let c = Math.max(0, (tr.x / GC) | 0); c <= Math.min(GCOLS - 1, (nx / GC) | 0); c++) {
      if (tr.scarred[c] || inMpa((c + 0.5) * GC)) continue;
      const contact = (tr.y + tr.band - bedAt((c + 0.5) * GC)) / SCAR.reach;
      if (contact > 0) { tr.scarred[c] = 1; S.scar[c] = Math.min(1, S.scar[c] + SCAR.hit * Math.min(1, contact)); tr.bottom = true; if (!tr.company && S.scar[c] > 0.3) S.flags.scarTip = true; }
    }
    tr.x = nx;
  }
  for (const tr of S.trawlers) if (tr.x >= WW + 120 && GHOST.on && Math.random() < GHOST.lose) loseNet(rnd(150, WW - 150), tr.y);
  S.trawlers = S.trawlers.filter(t => t.x < WW + 120);
  stepGhosts(dt);
}
function loseNet(x, y) {
  S.ghosts.push({ x, y, age: 0, vx: rnd(-6, 6), kills: 0, held: [] });
  if (!S.flags.ghostLog) { S.flags.ghostLog = true; log('Part of a trawl net tore loose. It will keep fishing on its own.', 'warn'); }
}
function stepGhosts(dt) {
  for (const gn of S.ghosts) {
    gn.age += dt;
    gn.x = Math.max(GHOST.w, Math.min(WW - GHOST.w, gn.x + gn.vx * dt));
    const floor = Math.min(WH - 6, bedAt(gn.x) - 8);
    gn.y = Math.min(floor, gn.y + 1.5 * dt); // sinks slowly, then lies on the bottom (over the shelf it rests on the reef, never inside it)
    const fray = 1 - gn.age / GHOST.life;
    if (fray <= 0) continue;
    const x0 = Math.max(0, ((gn.x - GHOST.w) / HC) | 0), x1 = Math.min(HCOLS - 1, ((gn.x + GHOST.w) / HC) | 0);
    const y0 = Math.max(0, ((gn.y - GHOST.h) / HC) | 0), y1 = Math.min(HROWS - 1, ((gn.y + GHOST.h) / HC) | 0);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const a of S.hash[cy * HCOLS + cx]) {
      if (a.dead || a.t === PLANKTON) continue;
      const ex = (a.x - gn.x) / GHOST.w, ey = (a.y - gn.y) / GHOST.h;
      if (ex * ex + ey * ey > 1) continue;
      const rate = (SPECIES[a.t].size >= GHOST.big ? GHOST.bigRate : GHOST.rate) * fray;
      if (Math.random() < 1 - Math.exp(-rate * dt)) entangle(gn, a);
    }
  }
  S.ghosts = S.ghosts.filter(gn => gn.age < GHOST.life);
}
function entangle(gn, a) {
  a.dead = true; S.harm[a.t] = S.t; S.detritus += massOf(SPECIES[a.t]);
  gn.kills++; if (gn.held.length < 6) gn.held.push({ t: a.t, dx: a.x - gn.x, dy: a.y - gn.y, ang: a.ang });
  S.effects.push({ x: a.x, y: a.y, t: 0, kind: 1 });
  const g = S.game;
  if (g.on && !g.over) { g.ghostKills++; if (RUN_PROTECTED[a.t]) g.ghostProt++; }
}

function spawnMany(t, x, y, n) {
  const cap = SPECIES[t].plant ? PK_CAP : SPECIES[t].cap;
  n = Math.max(0, Math.min(n, cap - S.counts[t])); // the ocean can only hold so many
  S.counts[t] += n;
  for (let i = 0; i < n; i++) {
    const a = t === PLANKTON ? spawnPlankton() : makeAgent(t, x + rnd(-30, 30), y + rnd(-30, 30));
    if (t === PLANKTON) { a.x = Math.max(5, Math.min(WW - 5, x + rnd(-50, 50))); a.y = Math.max(3, Math.min(WH - 3, y + rnd(-50, 50))); }
    S.agents.push(a);
  }
}

function log(msg, kind) { S.events.push({ msg, kind: kind || '', t: S.t }); }

function sample() {
  const c = S.counts;
  S.hist.push(c.slice());
  if (S.hist.length > 300) S.hist.shift();
  for (let i = 0; i < N; i++) S.peak[i] = Math.max(S.peak[i], c[i]);
  // narrate the notable moments
  const prev = S.hist.length > 1 ? S.hist[S.hist.length - 2] : null;
  for (const s of SPECIES) {
    if (s.plant) continue;
    if (s.invasive && prev && prev[s.i] > 0 && c[s.i] === 0) log(s.name + ' have been wiped out.', 'good');
    if (s.bloom) {
      const f = 'bloom' + s.i;
      if (!S.flags[f] && c[s.i] >= s.bloom.at) { S.flags[f] = true; log(s.bloom.msg, 'warn'); }
      if (c[s.i] < s.bloom.clear) S.flags[f] = false;
    }
  }
  if (S.peak[PLANKTON] > 200 && c[PLANKTON] < 15 && !S.flags.plank) { S.flags.plank = true; log('The plankton has collapsed. Everything above it is starving.', 'warn'); }
  if (c[PLANKTON] > 120) S.flags.plank = false;
  if (!S.flags.dead && S.avgPoll > 0.12) { S.flags.dead = true; log('A dead zone is spreading.', 'warn'); }
  if (S.avgPoll < 0.05) S.flags.dead = false;
  // warn from 0.7: that is where stepRecolonize stops counting the water as healthy, and by 0.75 most predators collapse
  if (!S.flags.hot && S.temp >= 0.7) { S.flags.hot = true; log('The water is too warm. The plankton is struggling, and nothing that dies out will come back until it cools.', 'warn'); }
  if (S.temp < 0.65) S.flags.hot = false;
}

function biodiversity() {
  // Shannon evenness over the native species (invaders don't add diversity)
  const c = NATIVE.map(s => Math.log(1 + S.counts[s.i])), tot = c.reduce((a, b) => a + b, 0); // log: plankton's numbers shouldn't drown out the rest
  if (tot === 0) return 0;
  let h = 0;
  for (const n of c) if (n > 0) { const p = n / tot; h -= p * Math.log(p); }
  return h / Math.log(c.length);
}
function waterQuality() { return 1 - Math.min(1, S.avgPoll / 0.2); }

// ---- Anthropocene run (pure state; the UI only reads S.game)
const demandAt = m => RUN.Q_BASE + RUN.Q_STEP * m;
function startRun() { // call right after resetWorld()
  S.game = { on: true, over: false, minute: 0, haul: 0, mins: [], streak: 0, bankrupt: false, bycatch: 0,
    company: 0, companyProt: 0, companyTrips: 0, sendCompany: false, ghostKills: 0, ghostProt: 0, ghostsHauled: 0, fish: 0, dumped: 0, ballast: 0, ballastAt: -1e9, everZero: zeros(), result: null };
  S.temp = RUN.TEMP_START;
  log('The fleet needs ' + demandAt(0) + ' in catch this minute, and more every minute after.', 'warn');
}
function stepGame() {
  const g = S.game;
  if (!g.on || g.over) return;
  S.temp = RUN.TEMP_START + (RUN.TEMP_END - RUN.TEMP_START) * Math.min(1, S.t / RUN.DUR);
  for (const s of NATIVE) if (S.counts[s.i] === 0) g.everZero[s.i] = 1;
  if (S.t >= (g.minute + 1) * RUN.MINUTE - 1e-6) closeMinute(g);
  if (g.sendCompany && S.t < RUN.DUR - 1e-6) { g.sendCompany = false; g.companyTrips++; startTrawl(richestBand(), true); }
  if (S.t >= RUN.DUR - 1e-6) { g.over = true; g.result = runScore(); }
}
function closeMinute(g) {
  const demand = demandAt(g.minute), ok = g.haul >= demand - 1e-9, last = g.minute + 1 >= RUN.DUR / RUN.MINUTE;
  g.mins.push({ demand, haul: g.haul, ok });
  g.streak = ok ? 0 : g.streak + 1;
  if (!last) {
    if (ok) log('Minute ' + (g.minute + 1) + ': quota met. Next minute the fleet wants ' + demandAt(g.minute + 1) + '.', 'good');
    else log('Minute ' + (g.minute + 1) + ': short by ' + Math.ceil(demand - g.haul) + '. Next minute the fleet wants ' + demandAt(g.minute + 1) + '.', 'warn');
  }
  if (!g.bankrupt && g.streak >= RUN.BANKRUPT_AFTER) { g.bankrupt = true; log('Three short minutes in a row. The fleet is bankrupt; the bank takes its cut, and its boats.', 'warn'); }
  else if (!ok && !last && !g.bankrupt) { g.sendCompany = true; log('Head office sends its own trawler to make up the shortfall. It fishes where the fish are.', 'warn'); }
  g.haul = 0; g.minute++;
}
function runScore() {
  const g = S.game, P = RUN.PTS;
  const quota = g.mins.length ? g.mins.reduce((a, m) => a + Math.min(1, m.haul / m.demand), 0) / g.mins.length : 0;
  const bio = biodiversity(), water = waterQuality();
  const bioN = Math.max(0, Math.min(1, (bio - RUN.BIO_FLOOR) / (1 - RUN.BIO_FLOOR)));
  const lost = NATIVE.filter(s => S.counts[s.i] === 0).map(s => s.name);
  const recovered = NATIVE.filter(s => g.everZero[s.i] && S.counts[s.i] > 0).map(s => s.name);
  const parts = [
    { label: 'Quota delivered (' + Math.round(quota * 100) + '% on average)', pts: P.quota * quota },
    { label: 'Biodiversity at the end (' + Math.round(bio * 100) + '%)', pts: P.bio * bioN },
    { label: 'Water quality at the end (' + Math.round(water * 100) + '%)', pts: P.water * water },
    { label: 'Species gone at the end (' + lost.length + ')', pts: -P.lost * lost.length },
    { label: 'Protected animals caught (' + g.bycatch + ')', pts: -P.bycatch * g.bycatch },
    { label: 'Fleet bankrupt', pts: g.bankrupt ? -P.bankrupt : 0 },
  ].map(p => ({ label: p.label, pts: Math.round(p.pts) }));
  const score = parts.reduce((a, p) => a + p.pts, 0);
  const met = g.mins.filter(m => m.ok).length, delivered = g.fish + g.dumped + g.ballast;
  const quotaTotal = g.mins.reduce((a, m) => a + m.demand, 0);
  return { score, parts, quota, bio, water, lost, recovered, met, minutes: g.mins.length, delivered, quotaTotal,
    fish: g.fish, company: g.company, companyProt: g.companyProt, companyTrips: g.companyTrips, ghostKills: g.ghostKills, ghostProt: g.ghostProt, ghostsHauled: g.ghostsHauled, mpa: !!S.mpa, dumped: g.dumped, ballast: g.ballast, bycatch: g.bycatch, bankrupt: g.bankrupt, verdict: verdict(quota, lost.length, bio) };
}
function verdict(quota, lost, bio) {
  if (quota >= 0.9 && lost === 0 && bio >= 0.85) return 'The fleet was fed and the ocean held. That is rarer than it sounds.';
  if (quota >= 0.9 && lost >= 2) return 'Every quota met. Some of what lived here will not be back.';
  if (quota >= 0.9) return 'The fleet was fed. The ocean paid for it.';
  if (quota < 0.35 && lost === 0) return 'The water is still full of life. The harbour is quiet.';
  if (lost >= 2) return 'Short on fish, and short on species. Nobody won this one.';
  return 'Some fish, some losses. Most real oceans look like this.';
}
// ==SIM-END==
