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
let COLD_SLOW = 0.9; // plankton growth lost per unit of warmth below 0.5 (cold slows it; heat is handled separately)
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
  // typical do-nothing result (node tune.js 0 10 anthro bot=steward: score 41 +-5.5, biodiversity 92%), shown on the end screen.
  // Re-run and update it whenever the constants above or the species table change.
  STEWARD: { score: 41, bio: 0.92 },
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
    sun: { y: 260, pull: 1.1 }, recolonize: { after: 120, natural: 15, n: 6, needs: { plankton: 150 }, rescue: { below: 12, every: 30 } } },
  { id: 'hunter', name: 'Hunters', color: '#ff8a4c', shape: 'fish', size: 11,
    speed: 74, turn: 3, vision: 130, meta: 1.6, max: 240, rep: 200, repCost: 95, pol: 4, cap: 60, life: [260, 400],
    start: 7, startY: [150, 720], stock: 3, satiate: 0.85, chase: 0.5, crowd: { k: 12, tax: 0.1 },
    eats: [{ prey: 'grazer', gain: 65, reach: 10, catch: { min: 0.15, k: 250 } }, { prey: 'jelly', gain: 14, reach: 10, below: 0.35, catch: { min: 0, k: 300 } }],
    flee: { from: ['shark'], radius: 60, burst: 1.0, cost: 2 },
    recolonize: { after: 240, natural: 15, n: 3, needs: { grazer: 25 }, rescue: { below: 4, every: 45 } } },
  { id: 'jelly', name: 'Jellyfish', color: '#c79bff', shape: 'jelly', size: 9,
    speed: 16, turn: 1.5, vision: 30, meta: 0.25, max: 100, rep: 85, repCost: 42, pol: 0, cap: 200, life: [200, 320],
    start: 10, startY: [100, 720], stock: 5, filter: true, move: 'drift',
    eats: [{ prey: 'plankton', gain: 22, reach: 30 }],
    sun: { y: 260, pull: 0.6 }, crowd: { k: 30, tax: 0.04 },
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
    speed: 78, turn: 2.5, vision: 190, meta: 1.0, max: 400, rep: 330, repCost: 165, breed: 60, pol: 3, cap: 12, life: [700, 1100],
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
  game: { on: false },
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

function updPlankton(a, dt) {
  a.age += dt;
  a.x += (Math.random() - 0.5) * 8 * dt;
  a.y += (Math.random() - 0.45) * 6 * dt;
  if (a.x < 5) a.x = 5; else if (a.x > WW - 5) a.x = WW - 5;
  if (a.y < 3) a.y = 3; else if (a.y > WH - 3) a.y = WH - 3;
  if (a.age > a.maxAge || Math.random() < pollAt(a.x, a.y) * 0.3 * dt) a.dead = true;
}

function eat(pred, prey, gain) {
  prey.dead = true;
  pred.e = Math.min(SPECIES[pred.t].max, pred.e + gain);
  S.effects.push({ x: prey.x, y: prey.y, t: 0, kind: prey.t === PLANKTON ? 0 : 1 });
}

function updMobile(a, dt) {
  const s = SPECIES[a.t];
  const tf = 0.7 + 0.6 * S.temp; // warmer water = faster metabolism
  a.e -= (s.meta * tf + pollAt(a.x, a.y) * s.pol) * dt;
  if (s.crowd && S.counts[a.t] > s.crowd.k) a.e -= (S.counts[a.t] - s.crowd.k) * s.crowd.tax * dt;
  a.age += dt; a.cool -= dt;
  if (a.e <= 0 || a.age > a.maxAge) { a.dead = true; return; }

  let dx = 0, dy = 0, mul = 0.5, wander = true;
  const thr = s.flee ? nearest(a.x, a.y, s.flee.radius, s.flee.mask, a) : null;
  if (thr) {
    dx = a.x - thr.x; dy = a.y - thr.y; mul = s.flee.burst; a.e -= s.flee.cost * dt; wander = false;
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
      const prey = nearest(a.x, a.y, s.vision, d.mask, a);
      if (!prey) continue;
      dx = prey.x - a.x; dy = prey.y - a.y; mul = 1; wander = false;
      if (s.chase) a.e -= s.chase * dt;
      if (dx * dx + dy * dy < d.reach * d.reach) {
        // rare prey scatters and hides, which keeps predators from driving it to zero
        // p is the chance per strike; a predator strikes CATCH_RATE times per second while prey is in reach,
        // so the per-step chance is 1-(1-p)^(CATCH_RATE*dt) and the outcome doesn't depend on the step size
        const p = d.catch ? Math.min(1, d.catch.min + S.counts[d.p] / d.catch.k) : 1;
        if (Math.random() < 1 - Math.pow(1 - p, CATCH_RATE * dt)) eat(a, prey, d.gain);
      }
      break;
    }
  }

  if (wander) { a.ang += (Math.random() - 0.5) * 4 * dt; dx = Math.cos(a.ang); dy = Math.sin(a.ang); }
  // some species drift back toward the sunlit layer where the plankton lives
  if (s.sun) dy += Math.max(-1, Math.min(1, (s.sun.y - a.y) / 220)) * s.sun.pull;
  const m = Math.hypot(dx, dy) || 1;
  dx /= m; dy /= m;
  // same-species spacing: cruising animals of one kind keep about a body length apart instead of stacking into one
  // shape. Only while wandering: a chase or an escape is never bent off its line by this (it is a look, not a tactic).
  if (wander) {
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
  S.plankAcc += (0.12 * pk * Math.max(0, 1 - pk / PK_CAP) * heat + 2.5 * heat) * dt;
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
    if (a.dead || a.t === PLANKTON) continue;
    if (Math.hypot(a.x - x, a.y - y) < r) { a.dead = true; n++; harvest(a); }
  }
  return n;
}
// an animal taken by a net or trawler: marks the harm, and in the scored run lands it on deck as catch (or protected bycatch)
function harvest(a) {
  S.harm[a.t] = S.t; S.effects.push({ x: a.x, y: a.y, t: 0, kind: 2, sp: a.t }); // sp: the renderer hauls the right animal up
  const g = S.game;
  if (!g.on || g.over || a.t === PLANKTON) return;
  g.caught[a.t]++;
  if (RUN_PROTECTED[a.t]) g.bycatch++; else { g.haul += RUN_VAL[a.t]; g.fish += RUN_VAL[a.t]; }
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

function startTrawl(y) { S.trawlers.push({ x: -80, y, band: 90, speed: 380 }); }

function stepTools(dt) {
  for (const tr of S.trawlers) {
    const nx = tr.x + tr.speed * dt;
    for (const a of S.agents) {
      if (a.dead || a.x < tr.x - 10 || a.x > nx + 10 || Math.abs(a.y - tr.y) > tr.band) continue;
      // bycatch: everything in the net dies, plankton too (at a lower rate)
      if (a.t !== PLANKTON || Math.random() < 0.5) { a.dead = true; harvest(a); }
    }
    tr.x = nx;
  }
  S.trawlers = S.trawlers.filter(t => t.x < WW + 120);
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
  S.game = { on: true, over: false, minute: 0, haul: 0, mins: [], streak: 0, bankrupt: false, caught: zeros(), bycatch: 0,
    fish: 0, dumped: 0, ballast: 0, ballastAt: -1e9, everZero: zeros(), result: null };
  S.temp = RUN.TEMP_START;
  log('The fleet needs ' + demandAt(0) + ' in catch this minute, and more every minute after.', 'warn');
}
function stepGame() {
  const g = S.game;
  if (!g.on || g.over) return;
  S.temp = RUN.TEMP_START + (RUN.TEMP_END - RUN.TEMP_START) * Math.min(1, S.t / RUN.DUR);
  for (const s of NATIVE) if (S.counts[s.i] === 0) g.everZero[s.i] = 1;
  if (S.t >= (g.minute + 1) * RUN.MINUTE - 1e-6) closeMinute(g);
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
  if (!g.bankrupt && g.streak >= RUN.BANKRUPT_AFTER) { g.bankrupt = true; log('Three short minutes in a row. The fleet is bankrupt; the bank takes its cut.', 'warn'); }
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
    fish: g.fish, dumped: g.dumped, ballast: g.ballast, bycatch: g.bycatch, bankrupt: g.bankrupt, verdict: verdict(quota, lost.length, bio) };
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
