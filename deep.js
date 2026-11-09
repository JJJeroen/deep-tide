// ---------- the deep (M7): a second, loosely coupled layer below the sunlit sim ----------
// The world continues below the sunlit column (y 0..WH): the deep runs from DEEP_TOP down to the abyssal floor.
// Links with the sunlit sim, all one-way: marine snow settling out of it (S.sinkFlux) feeds the deep, the lanternfish
// migrate with its night (S.night), and the sperm whale breathes at the surface. Nothing here writes S, so the sunlit
// balance (tune.js) is untouched. No DOM: like sim.js, this can run headless.
//
// Food web: snow -> lanternfish -> giant squid and anglerfish; giant squid -> sperm whale (a visitor from the surface).
// Whatever dies, and the snow nobody eats, settles on the floor for the scavengers (hagfish, crabs). Now and then a whale
// dies at depth: its body sinks and becomes a whale fall, a feast the scavengers swarm for minutes; the bones stay.

const DEEP_TOP = WH, FLOOR_Y = 2330, DEEP_BOTTOM = 2400;
const floorY = x => FLOOR_Y + Math.sin(x * 0.004) * 14 + Math.sin(x * 0.013 + 1) * 5;
// metres at a world y: 0-60 m down the sunlit column, then compressed: 200 m at y 1000, 1000 m at 1500, 4000 m at the floor
const DEPTH_STOPS = [[0, 0], [WH, 60], [1000, 200], [1500, 1000], [FLOOR_Y, 4000]];
function depthAt(y) {
  for (let i = 1; i < DEPTH_STOPS.length; i++) {
    const [y0, m0] = DEPTH_STOPS[i - 1], [y1, m1] = DEPTH_STOPS[i];
    if (y <= y1) return m0 + (m1 - m0) * Math.max(0, (y - y0) / (y1 - y0));
  }
  return 4000;
}
function yAtDepth(m) {
  for (let i = 1; i < DEPTH_STOPS.length; i++) {
    const [y0, m0] = DEPTH_STOPS[i - 1], [y1, m1] = DEPTH_STOPS[i];
    if (m <= m1) return y0 + (y1 - y0) * (m - m0) / (m1 - m0);
  }
  return FLOOR_Y;
}

// Species of the deep. zone: [top, bottom] world y they keep to. floor: lives on the seabed.
// meta energy/s, max energy, rep/repCost/breed like the sunlit species; arrive: {below, every, n} immigration from the
// wider deep (the deep is vast: a local population that runs low is topped up while there is food).
const DEEP_SP = {
  lantern: { name: 'Lanternfish', one: 'Lanternfish', size: 4, speed: 34, max: 60, meta: 0.9, rep: 45, repCost: 22, breed: 18, cap: 90, life: [150, 260],
             start: 40, day: [1250, 1650], night: [930, 1150], arrive: { below: 12, every: 20, n: 3 } },
  squid: { name: 'Giant squid', one: 'Giant squid', size: 18, speed: 46, max: 400, meta: 1.2, rep: 330, repCost: 160, breed: 200, cap: 4, life: [600, 900],
           start: 2, zone: [1450, 2100], vision: 140, gain: 40, arrive: { below: 2, every: 60, n: 1 } },
  angler: { name: 'Anglerfish', one: 'Anglerfish', size: 10, speed: 6, max: 300, meta: 0.25, rep: 250, repCost: 120, breed: 240, cap: 6, life: [1200, 2000],
            start: 3, zone: [1450, 1850], lure: 110, gain: 45, arrive: { below: 2, every: 120, n: 1 } },
  hagfish: { name: 'Hagfish', one: 'Hagfish', size: 6, speed: 22, max: 80, meta: 0.28, rep: 60, repCost: 28, breed: 30, cap: 60, life: [400, 700],
             start: 14, floor: true, arrive: { below: 6, every: 40, n: 2 } },
  crab: { name: 'Deep-sea crabs', one: 'Deep-sea crab', size: 7, speed: 10, max: 80, meta: 0.25, rep: 60, repCost: 28, breed: 40, cap: 30, life: [500, 900],
          start: 10, floor: true, arrive: { below: 5, every: 50, n: 2 } },
};
const DEEP_KINDS = Object.keys(DEEP_SP);
const SNOW_E = 5;          // energy per unit of marine snow
const WHALE = { first: 50, every: [150, 230], fallP: 0.3, speed: 60, huntFor: 40 };

const D = { agents: [], snow: 0, floor: 0, falls: [], bones: [], whale: null, nextWhale: 0, counts: {}, arriveT: {}, t: 0, visits: 0 };
// M9: the deep draws from its own stream of the run's seed (sim.js makeRng), so it never shifts the sunlit sim's random numbers
let drand = makeRng('/deep');
const drnd = (a, b) => a + drand() * (b - a);

function makeDeep(k, x, y) {
  const s = DEEP_SP[k];
  return { k, x, y, vx: 0, vy: 0, e: s.max * drnd(0.5, 0.8), age: 0, maxAge: drnd(s.life[0], s.life[1]), cool: drnd(0, s.breed),
           ph: drand() * 6.283, ang: drand() * 6.283, dead: false };
}
function homeY(a) {
  const s = DEEP_SP[a.k];
  if (s.floor) return floorY(a.x) - 6;
  if (s.day) { // lanternfish: each to its own depth inside the band, which rises at night
    const f = a.ph / 6.283, n = typeof S !== 'undefined' ? S.night : 0;
    return s.day[0] + f * (s.day[1] - s.day[0]) + (s.night[0] + f * (s.night[1] - s.night[0]) - s.day[0] - f * (s.day[1] - s.day[0])) * n;
  }
  return s.zone[0] + (a.ph / 6.283) * (s.zone[1] - s.zone[0]);
}
function resetDeep(seed = SEED) {
  drand = makeRng(seed + '/deep');
  D.agents = []; D.falls = []; D.bones = []; D.whale = null; D.nextWhale = WHALE.first; D.t = 0; D.visits = 0;
  D.snow = 400; D.floor = 800; D.arriveT = {};
  for (const k of DEEP_KINDS) for (let i = 0; i < DEEP_SP[k].start; i++) {
    const a = makeDeep(k, drnd(60, WW - 60), 0); a.y = homeY(a) + drnd(-40, 40); a.age = drnd(0, 0.6) * a.maxAge; D.agents.push(a);
  }
  countDeep();
}
function countDeep() { const c = {}; for (const k of DEEP_KINDS) c[k] = 0; for (const a of D.agents) if (!a.dead) c[a.k]++; D.counts = c; return c; }
function nearestDeep(x, y, r, k, self) {
  let best = null, bd = r * r;
  for (const o of D.agents) { if (o.dead || o === self || o.k !== k) continue; const d = (o.x - x) ** 2 + (o.y - y) ** 2; if (d < bd) { bd = d; best = o; } }
  return best;
}
function deepDies(a) { a.dead = true; D.floor += DEEP_SP[a.k].max * 0.5; } // the body settles on the floor

function stepDeep(dt) {
  D.t += dt;
  // marine snow: what settles out of the sunlit layer, plus a trickle from the wider ocean; uneaten snow reaches the floor
  const fromAbove = typeof S !== 'undefined' ? S.sinkFlux : 7; // headless without the sunlit sim: a typical flux
  D.snow += (fromAbove + 2) * dt;
  const toFloor = D.snow * Math.min(1, dt / 120); D.snow -= toFloor; D.floor += toFloor;
  D.floor *= 1 - 0.002 * dt; // and slowly into the sediment
  const c = D.counts, snowRich = D.snow / (D.snow + 300), floorRich = D.floor / (D.floor + 600);

  for (const a of D.agents) {
    if (a.dead) continue;
    const s = DEEP_SP[a.k];
    a.age += dt; a.cool -= dt; a.e -= s.meta * dt;
    if (a.e <= 0 || a.age > a.maxAge) { deepDies(a); continue; }
    let tx = Math.cos(a.ang), ty = 0, sp = s.speed * 0.5;
    a.ang += (drand() - 0.5) * 2 * dt;
    if (a.k === 'lantern') {
      const take = Math.min(D.snow, 0.6 * snowRich * dt); D.snow -= take; a.e = Math.min(s.max, a.e + take * SNOW_E);
      const sq = nearestDeep(a.x, a.y, 70, 'squid', a);
      if (sq) { tx = a.x - sq.x; ty = a.y - sq.y; sp = s.speed * 1.4; }
      else {
        const an = nearestDeep(a.x, a.y, DEEP_SP.angler.lure, 'angler', a); // the lure draws them in
        if (an) { tx = an.x + 10 - a.x; ty = an.y - 12 - a.y; sp = s.speed * 0.6; }
      }
    } else if (a.k === 'squid') {
      const wh = D.whale && D.whale.phase !== 'dead' && (D.whale.x - a.x) ** 2 + (D.whale.y - a.y) ** 2 < 220 * 220 ? D.whale : null;
      const prey = !wh && a.e < s.max * 0.85 ? nearestDeep(a.x, a.y, s.vision, 'lantern', a) : null;
      if (wh) { tx = a.x - wh.x; ty = a.y - wh.y; sp = s.speed * 1.3; }
      else if (prey) {
        tx = prey.x - a.x; ty = prey.y - a.y; sp = s.speed;
        if (tx * tx + ty * ty < 16 * 16 && drand() < 2.5 * dt) { prey.dead = true; D.floor += 4; a.e = Math.min(s.max, a.e + s.gain); }
      }
    } else if (a.k === 'angler') {
      sp = s.speed;
      const prey = nearestDeep(a.x + 10, a.y - 12, 14, 'lantern', a);
      if (prey && a.e < s.max * 0.9 && drand() < 2 * dt) { prey.dead = true; a.e = Math.min(s.max, a.e + s.gain); }
    } else { // scavengers on the floor: a whale fall draws them from anywhere along the seabed
      let fall = null, fd = 1e9;
      for (const f of D.falls) { const d = Math.abs(f.x - a.x); if (f.mass > 0 && d < fd) { fd = d; fall = f; } }
      if (fall) {
        tx = fall.x - a.x; sp = s.speed * 1.2;
        if (fd < 45) { const take = Math.min(fall.mass, 5 * dt); fall.mass -= take; a.e = Math.min(s.max, a.e + take); sp = 3; }
      } else { const take = Math.min(D.floor, 0.9 * floorRich * dt); D.floor -= take; a.e = Math.min(s.max, a.e + take); }
    }
    // keep to the home depth, steer, move
    ty += Math.max(-1, Math.min(1, (homeY(a) - a.y) / 120)) * (s.floor ? 3 : 1);
    const m = Math.hypot(tx, ty) || 1;
    a.vx += (tx / m * sp - a.vx) * Math.min(1, 2 * dt); a.vy += (ty / m * sp - a.vy) * Math.min(1, 2 * dt);
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (a.x < 20) { a.x = 20; a.ang = 0; } else if (a.x > WW - 20) { a.x = WW - 20; a.ang = Math.PI; }
    a.y = Math.max(DEEP_TOP - (a.k === 'lantern' ? 260 : 0), Math.min(floorY(a.x) - 3, a.y));
    // breeding
    if (a.e >= s.rep && a.cool <= 0 && c[a.k] < s.cap) {
      a.e -= s.repCost; a.cool = s.breed; c[a.k]++;
      const k = makeDeep(a.k, a.x + drnd(-10, 10), a.y + drnd(-10, 10)); k.e = s.repCost * 0.8; D.agents.push(k);
    }
  }
  stepWhale(dt);
  for (const f of D.falls) { f.age += dt; f.mass -= Math.min(f.mass, 1.5 * dt); } // bacteria work on it too
  for (let i = D.falls.length - 1; i >= 0; i--) if (D.falls[i].mass <= 0) { D.bones.push({ x: D.falls[i].x, dir: D.falls[i].dir, age: 0 }); D.falls.splice(i, 1); }
  for (const b of D.bones) b.age += dt;
  while (D.bones.length && D.bones[0].age > 900) D.bones.shift();
  D.agents = D.agents.filter(a => !a.dead);
  countDeep();
  // immigration from the wider deep while there is food for them
  for (const k of DEEP_KINDS) {
    const r = DEEP_SP[k].arrive;
    if (D.counts[k] >= r.below) { D.arriveT[k] = 0; continue; }
    D.arriveT[k] = (D.arriveT[k] || 0) + dt;
    if (D.arriveT[k] < r.every) continue;
    D.arriveT[k] = 0;
    const x = drand() < 0.5 ? 40 : WW - 40;
    for (let i = 0; i < r.n; i++) { const a = makeDeep(k, x, 0); a.y = homeY(a) + drnd(-30, 30); D.agents.push(a); }
  }
}

// The sperm whale: breathes at the surface, dives to hunt giant squid, comes back up and leaves. Sometimes one dies at
// depth and sinks to the floor: a whale fall.
function stepWhale(dt) {
  if (!D.whale) {
    D.nextWhale -= dt;
    if (D.nextWhale > 0) return;
    D.nextWhale = drnd(WHALE.every[0], WHALE.every[1]); D.visits++;
    const fromLeft = drand() < 0.5;
    D.whale = { x: fromLeft ? -200 : WW + 200, y: 22, vx: 0, vy: 0, dir: fromLeft ? 1 : -1, phase: 'surface', pt: 0,
                dies: drand() < WHALE.fallP, target: null };
    if (typeof log === 'function') log('A sperm whale is at the surface, breathing before a dive. Scroll down to follow it.', 'good');
    return;
  }
  const w = D.whale; w.pt += dt;
  let tx = w.dir, ty = 0, sp = WHALE.speed;
  if (w.phase === 'surface') { ty = (22 - w.y) / 40; sp = 40; if (w.pt > 14 && w.x > 200 && w.x < WW - 200) { w.phase = 'dive'; w.pt = 0; } }
  else if (w.phase === 'dive') { ty = 1; tx = w.dir * 0.25; if (w.y > 1650) { w.phase = 'hunt'; w.pt = 0; } }
  else if (w.phase === 'hunt') {
    const prey = nearestDeep(w.x, w.y, 600, 'squid', null);
    if (prey) {
      tx = prey.x - w.x; ty = prey.y - w.y; sp = WHALE.speed * 1.1; w.dir = tx < 0 ? -1 : 1;
      if (tx * tx + ty * ty < 40 * 40) { prey.dead = true; D.floor += 20; w.ate = (w.ate || 0) + 1; }
    } else { ty = Math.sin(w.pt * 0.5) * 0.3; if (w.x < 150 || w.x > WW - 150) w.dir = -w.dir; }
    if (w.dies && w.pt > 12) { w.phase = 'dead'; w.pt = 0; if (typeof log === 'function') log('A sperm whale has died down here. Its body sinks to the abyss: a whale fall feeds the deep for a long time.', 'warn'); }
    else if (w.pt > WHALE.huntFor || (w.ate && w.pt > 10)) { w.phase = 'ascend'; w.pt = 0; }
  }
  else if (w.phase === 'ascend') { ty = -1; tx = w.dir * 0.3; if (w.y < 40) { w.phase = 'leave'; w.pt = 0; } }
  else if (w.phase === 'leave') { ty = (22 - w.y) / 40; sp = 50; if (w.x < -260 || w.x > WW + 260) { D.whale = null; return; } }
  else if (w.phase === 'dead') { // sinking, slowly turning belly-up
    w.vx *= 1 - Math.min(1, dt); w.vy = 28; w.y += w.vy * dt; w.x += w.vx * dt;
    if (w.y >= floorY(w.x) - 18) { D.falls.push({ x: w.x, mass: 2400, age: 0, dir: w.dir }); D.whale = null;
      if (typeof log === 'function') log('The whale has reached the floor. Hagfish and crabs are coming from all over the seabed.', 'good'); }
    return;
  }
  const m = Math.hypot(tx, ty) || 1;
  w.vx += (tx / m * sp - w.vx) * Math.min(1, 0.8 * dt); w.vy += (ty / m * sp - w.vy) * Math.min(1, 0.8 * dt);
  w.x += w.vx * dt; w.y += w.vy * dt;
  w.y = Math.max(16, Math.min(floorY(w.x) - 40, w.y));
}
