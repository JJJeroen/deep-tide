// ---------- the scene (M4, "the look") ----------
// Sky and fleet above the waterline, a reef shelf that falls away into a drop-off, light shafts and caustics,
// marine snow, a day/night cycle, and a darkness layer that every light source cuts into: glowing jellyfish and
// plankton, a trawler's deck lights. (A Watch lamp was tried and dropped: the reef is never dark enough to need it;
// it belongs to the deep layer, M7.)
// Render only. Everything here reads S and never writes it, so the sim (and tune.js) are untouched by it.

const SKY = 64;             // world px of sky above the waterline (y = 0); the sim world stays 0..WH below it
const DAY_LEN = 240;        // sim seconds per full day and night
const DEPTH_M = 60;         // depth ruler: the sim column is the top 60 m of a reef wall; the drop-off leads deeper

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// seeded random, so the reef, the clouds and the stars look the same on every load
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- time of day: 0 = day, 1 = night. A run starts in the morning.
function dayPhase(t) { return ((t / DAY_LEN + 0.08) % 1 + 1) % 1; }
function nightAt(t) {
  const p = dayPhase(t);
  return p < 0.6 ? 0 : p < 0.7 ? smooth(0.6, 0.7, p) : p < 0.9 ? 1 : 1 - smooth(0.9, 1, p);
}

// ---- the mood of the water, shared by every layer
const MOOD = { n: 0, warm: 0, pol: 0, cols: null };
function updateMood(t) {
  MOOD.n = nightAt(t);
  MOOD.warm = smooth(0.5, 0.8, S.temp);
  MOOD.pol = clamp01(S.avgPoll * 5);
  const { n, warm, pol } = MOOD;
  let top = mixHex('#0e6890', '#1d8577', warm * 0.55), mid = mixHex('#063c5a', '#0d4f4b', warm * 0.45), deep = '#02121e';
  top = mixHex(top, '#5a5026', pol * 0.5); mid = mixHex(mid, '#302d1b', pol * 0.45);
  top = mixHex(top, '#05182a', n * 0.7); mid = mixHex(mid, '#030d18', n * 0.6); deep = mixHex(deep, '#01070c', n * 0.5);
  MOOD.cols = { top, mid, deep };
}

function drawWater() {
  const c = MOOD.cols, g = ctx.createLinearGradient(0, 0, 0, WH);
  g.addColorStop(0, c.top); g.addColorStop(0.36, c.mid); g.addColorStop(1, c.deep);
  ctx.fillStyle = g; ctx.fillRect(0, -4, WW, WH + 4); // up past the wave troughs, so no gap shows under the sky
}

// ---- light from above: slow shafts, and caustics dancing just under the surface. Night and fouled water swallow both.
function drawSunlight(t) {
  const k = (1 - MOOD.n) * (1 - 0.85 * MOOD.pol);
  if (k < 0.02) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // the shafts share one vertical gradient and go out as a single fill; the caustics as a single stroke
  const lg = ctx.createLinearGradient(0, 0, 0, WH * 0.72);
  lg.addColorStop(0, `rgba(160,225,255,${0.11 * k})`); lg.addColorStop(1, 'rgba(160,225,255,0)');
  ctx.fillStyle = lg; ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = ((i * 290 + t * 6 * (1 + i % 3 * 0.3)) % (WW + 400)) - 200, w = 90 + i * 22;
    ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 2.2 - 180, WH * 0.72); ctx.lineTo(x - 140, WH * 0.72); ctx.closePath();
  }
  ctx.fill();
  // caustics: two crossing sets of wavy lines that fade out with depth
  const cg = ctx.createLinearGradient(0, 0, 0, 150);
  cg.addColorStop(0, `rgba(210,248,255,${0.075 * k})`); cg.addColorStop(1, 'rgba(210,248,255,0)');
  ctx.strokeStyle = cg; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let s = 0; s < 2; s++) for (let i = 0; i < 26; i++) for (let y = 0; y <= 150; y += 10) {
    const x = i * 64 + (s ? 1 : -1) * y * 0.6 + Math.sin(y * 0.06 + t * (s ? 1.1 : 0.8) + i * 1.7) * 10;
    y ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ---- seabed: a reef shelf on the left that slopes away into a drop-off on the right.
// The shelf rises a little above the band wandering animals keep out of (soft wall at WH - 70) so it clears the toolbar;
// it is drawn behind the animals, so one that swims down there passes in front of the coral rather than into it.
const BED = [];
for (let x = 0; x <= WW; x += 10) BED.push(772 + 200 * smooth(0.3, 0.58, x / WW) + Math.sin(x * 0.013) * 7 + Math.sin(x * 0.047) * 3);
const bedY = x => BED[Math.max(0, Math.min(BED.length - 1, Math.round(x / 10)))];
const RIDGE = []; // a far ridge beyond the drop-off, faint, for depth
for (let x = 0; x <= WW; x += 20) RIDGE.push(872 + Math.sin(x * 0.006 + 1) * 14 + Math.sin(x * 0.021) * 6);

// coral health (render only): heat bleaches the reef, and a reef that stays bleached dies and is overgrown by algae.
// It bleaches within tens of seconds and dies over minutes, but recovers far more slowly than either.
const REEF = { bleach: 0, dead: 0, dull: 0, key: '' };
const REEF_X = 900, REEF_Y0 = 640, REEF_H = WH - REEF_Y0;
const reefCanvas = document.createElement('canvas'), rg = reefCanvas.getContext('2d');
const CORAL = ['#e0786c', '#d99c4c', '#9a6bc0', '#5aa99b', '#e3bd62', '#c75c78', '#e88a5a'];
const reefItems = (() => {
  const r = seeded(7), out = [];
  for (let i = 0; i < 58; i++) {
    const x = 10 + r() * (REEF_X - 160) * Math.pow(r(), 0.35);
    out.push({ x, kind: r(), col: CORAL[(r() * CORAL.length) | 0], s: r(), size: 0.7 + r() * 0.6, seed: (r() * 1e9) | 0 });
  }
  return out.sort((a, b) => a.size - b.size); // small ones behind
})();
function coralCol(it) {
  // each colony has its own heat tolerance, so bleaching comes in patches instead of all at once
  const b = smooth(it.s * 0.6, it.s * 0.6 + 0.4, REEF.bleach), d = smooth(it.s * 0.5, it.s * 0.5 + 0.5, REEF.dead);
  let c = mixHex(it.col, '#f1ece2', b * 0.92);
  c = mixHex(c, '#6d6a4c', d * 0.85);
  c = mixHex(c, '#4c4532', REEF.dull * 0.5);
  return mixHex(c, '#0b3a50', 0.22); // seen through 50 m of water
}
function branch(g, x, y, a, len, d, r) {
  const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
  g.lineWidth = Math.max(1, d * 1.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
  if (d > 1) { branch(g, x2, y2, a - 0.4 - r() * 0.3, len * 0.74, d - 1, r); branch(g, x2, y2, a + 0.4 + r() * 0.3, len * 0.74, d - 1, r); }
  else { g.beginPath(); g.arc(x2, y2, 1.7, 0, TAU); g.fill(); }
}
function buildReef() {
  const s = 2;
  if (reefCanvas.width !== REEF_X * s) { reefCanvas.width = REEF_X * s; reefCanvas.height = REEF_H * s; }
  rg.setTransform(s, 0, 0, s, 0, -REEF_Y0 * s); rg.clearRect(0, REEF_Y0, REEF_X, REEF_H); rg.lineCap = 'round';
  // the rock the reef grows on
  const rr = seeded(3);
  for (let i = 0; i < 16; i++) {
    const x = rr() * (REEF_X - 80), y = bedY(x) + 4, w = 18 + rr() * 38, h = 10 + rr() * 20;
    rg.fillStyle = mixHex('#123241', '#0a1e28', rr()); rg.beginPath(); rg.ellipse(x, y, w, h, 0, Math.PI, TAU); rg.fill();
  }
  for (const it of reefItems) {
    const r = seeded(it.seed), x = it.x, y = bedY(x) + 3, col = coralCol(it), k = it.kind, z = it.size;
    rg.fillStyle = col; rg.strokeStyle = col; rg.globalAlpha = 1;
    if (k < 0.3) branch(rg, x, y, -Math.PI / 2 + (r() - 0.5) * 0.5, (12 + r() * 12) * z, 4, r);      // staghorn
    else if (k < 0.45) {                                                                               // table coral
      const w = (20 + r() * 18) * z, h = (16 + r() * 10) * z;
      rg.lineWidth = 3 * z; rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x, y - h); rg.stroke();
      rg.beginPath(); rg.ellipse(x, y - h, w, 4.5 * z, 0, 0, TAU); rg.fill();
      rg.fillStyle = mixHex(col, '#ffffff', 0.18); rg.beginPath(); rg.ellipse(x, y - h - 1.5 * z, w * 0.92, 2.2 * z, 0, Math.PI, TAU); rg.fill();
    } else if (k < 0.62) {                                                                             // sea fan
      const h = (28 + r() * 30) * z, w = (20 + r() * 20) * z;
      rg.globalAlpha = 0.85; rg.lineWidth = 0.9;
      for (let j = 0; j < 16; j++) { const a = Math.PI + (j / 15) * Math.PI; rg.beginPath(); rg.moveTo(x, y); rg.quadraticCurveTo(x + Math.cos(a) * w * 0.4, y - h * 0.5, x + Math.cos(a) * w, y + Math.sin(a) * h); rg.stroke(); }
      rg.globalAlpha = 0.22; rg.beginPath(); rg.ellipse(x, y - h * 0.55, w * 0.95, h * 0.55, 0, 0, TAU); rg.fill();
    } else if (k < 0.8) {                                                                              // brain coral
      const w = (10 + r() * 12) * z;
      rg.beginPath(); rg.ellipse(x, y, w, w * 0.72, 0, Math.PI, TAU); rg.fill();
      rg.strokeStyle = mixHex(col, '#1e140e', 0.35); rg.lineWidth = 0.9;
      for (let j = 1; j < 4; j++) { rg.beginPath(); rg.ellipse(x, y, w * j / 4, w * 0.72 * j / 4, 0, Math.PI, TAU); rg.stroke(); }
    } else {                                                                                           // tube sponges
      const n = 2 + ((r() * 3) | 0);
      for (let j = 0; j < n; j++) {
        const tx = x + (j - n / 2) * 6 * z, th = (14 + r() * 22) * z, tw = 3.2 * z;
        rg.fillStyle = col; rg.beginPath(); rg.moveTo(tx - tw, y); rg.lineTo(tx - tw * 1.2, y - th); rg.lineTo(tx + tw * 1.2, y - th); rg.lineTo(tx + tw, y); rg.fill();
        rg.fillStyle = 'rgba(4,14,20,.55)'; rg.beginPath(); rg.ellipse(tx, y - th, tw * 1.1, 1.6 * z, 0, 0, TAU); rg.fill();
      }
    }
    // dead coral grows a fuzz of algae
    const d = smooth(it.s * 0.5, it.s * 0.5 + 0.5, REEF.dead);
    if (d > 0.15) {
      rg.globalAlpha = d * 0.7; rg.fillStyle = '#56603a';
      for (let j = 0; j < 8; j++) rg.fillRect(x + (r() - 0.5) * 30 * z, y - r() * 30 * z, 2.5, 1.5);
    }
    rg.globalAlpha = 1;
  }
}
function stepReef(dt) {
  if (dt <= 0) return;
  const target = smooth(0.56, 0.72, S.temp);
  REEF.bleach += (target - REEF.bleach) * Math.min(1, dt / (target > REEF.bleach ? 25 : 120));
  if (REEF.bleach > 0.75) REEF.dead = Math.min(1, REEF.dead + dt / 240);
  else REEF.dead = Math.max(0, REEF.dead - dt / 900);
  // pollution settling on the reef leaves a brown film (mean of the pollution cells over the shelf)
  let sum = 0, n = 0;
  for (let gy = Math.floor(700 / GC); gy < GROWS; gy++) for (let gx = 0; gx < Math.ceil(REEF_X / GC); gx++) { sum += S.poll[gy * GCOLS + gx]; n++; }
  const dull = clamp01(sum / n * 4);
  REEF.dull += (dull - REEF.dull) * Math.min(1, dt / 20);
}
function resetScene() { REEF.bleach = 0; REEF.dead = 0; REEF.dull = 0; REEF.key = ''; SHIP.leaving = false; SHIP.x = SHIP.home; SHIP.a = 0; PLUMES.length = 0; }

// swaying sea whips in front of the reef, drawn per frame so they move with the current
const WHIPS = (() => { const r = seeded(19); return Array.from({ length: 16 }, () => ({ x: 20 + r() * 640, h: 26 + r() * 40, ph: r() * TAU, s: r(), col: CORAL[(r() * CORAL.length) | 0] })); })();

function drawSeabed(t) {
  const c = MOOD.cols;
  // far ridge beyond the drop-off
  ctx.fillStyle = mixHex(c.deep, c.mid, 0.35);
  ctx.beginPath(); ctx.moveTo(0, WH); for (let i = 0; i < RIDGE.length; i++) ctx.lineTo(i * 20, RIDGE[i]); ctx.lineTo(WW, WH); ctx.fill();
  // the shelf and slope
  const gg = ctx.createLinearGradient(0, 760, 0, WH);
  gg.addColorStop(0, mixHex('#2c4a50', c.deep, 0.35)); gg.addColorStop(0.5, '#0a1a22'); gg.addColorStop(1, '#03090d');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(0, WH + 2);
  for (let i = 0; i < BED.length; i++) ctx.lineTo(i * 10, BED[i]);
  ctx.lineTo(WW, WH + 2); ctx.fill();
  // a lit lip along the top of the shelf
  ctx.strokeStyle = `rgba(150,200,200,${0.12 * (1 - MOOD.n)})`; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 60; i++) i ? ctx.lineTo(i * 10, BED[i] + 1) : ctx.moveTo(0, BED[0] + 1);
  ctx.stroke();
  // corals: rebuilt only when their health visibly changed
  const key = Math.round(REEF.bleach * 24) + '|' + Math.round(REEF.dead * 16) + '|' + Math.round(REEF.dull * 10);
  if (key !== REEF.key) { REEF.key = key; buildReef(); }
  ctx.drawImage(reefCanvas, 0, REEF_Y0, REEF_X, REEF_H);
  ctx.lineCap = 'round'; ctx.lineWidth = 1.6;
  for (const w of WHIPS) {
    const by = bedY(w.x) + 2, sw = Math.sin(t * 0.8 + w.ph) * 9, top = by - w.h;
    ctx.strokeStyle = coralCol(w);
    ctx.beginPath(); ctx.moveTo(w.x, by); ctx.quadraticCurveTo(w.x + sw * 0.3, (by + top) / 2, w.x + sw, top); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ---- marine snow: organic flakes sinking from the sunlit layer; the richer the plankton, the more of it
const SNOW = Array.from({ length: 190 }, () => ({ x: Math.random() * WW, y: Math.random() * WH, v: 5 + Math.random() * 9, s: 0.8 + Math.random() * 1.3, ph: Math.random() * TAU }));
function drawSnow(t) {
  const n = Math.round(SNOW.length * Math.max(0.25, Math.min(1, (S.counts[PLANKTON] || 0) / 500)));
  ctx.fillStyle = 'rgba(214,228,232,.4)';
  for (let i = 0; i < n; i++) {
    const s = SNOW[i], y = (s.y + t * s.v) % WH, x = s.x + Math.sin(t * 0.3 + s.ph) * 6;
    if (y > bedY(x)) continue;
    ctx.fillRect(x, y, s.s, s.s);
  }
}

// ---- darkness: a small canvas, thicker with depth and at night, with a soft hole cut by every light source.
// Scaled up with smoothing, so the light falls off softly.
const DW = 160, DH = 90, DS = DW / WW, darkCanvas = document.createElement('canvas');
darkCanvas.width = DW; darkCanvas.height = DH;
const dg = darkCanvas.getContext('2d');
const HOLE = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
})();
const DARK_DAY = [[0, 0], [0.3, 0.05], [0.55, 0.16], [0.8, 0.3], [1, 0.42]];      // share of the column, alpha
const DARK_NIGHT = [[0, 0.34], [0.3, 0.4], [0.55, 0.48], [0.8, 0.56], [1, 0.64]]; // moonlight still reaches down
function drawDark(lights) {
  dg.globalCompositeOperation = 'source-over'; dg.globalAlpha = 1; dg.clearRect(0, 0, DW, DH);
  const g = dg.createLinearGradient(0, 0, 0, DH), n = MOOD.n;
  DARK_DAY.forEach(([y, a0], i) => g.addColorStop(y, `rgba(1,6,12,${(a0 + (DARK_NIGHT[i][1] - a0) * n).toFixed(3)})`));
  dg.fillStyle = g; dg.fillRect(0, 0, DW, DH);
  dg.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    dg.globalAlpha = L.s;
    dg.drawImage(HOLE, (L.x - L.r) * DS, (L.y - L.r) * DS, 2 * L.r * DS, 2 * L.r * DS);
  }
  dg.globalAlpha = 1; dg.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(darkCanvas, 0, 0, WW, WH);
}

// ---- glows on top of the darkness: jellyfish, and at night the plankton
function sceneLights() {
  const L = [], n = MOOD.n;
  for (const a of S.agents) {
    if (a.dead) continue;
    if (a.t === IDX.jelly) L.push({ x: a.x, y: a.y, r: 46, s: 0.45 });
  }
  if (n > 0.1) for (const tr of S.trawlers.concat(SAILING)) L.push({ x: tr.x + 230, y: 24, r: 150, s: 0.6 * n });
  return L;
}
function drawGlows(t) {
  const n = MOOD.n;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const a of S.agents) {
    if (a.dead || a.t !== IDX.jelly) continue;
    const dep = clamp01((a.y - 200) / 600);
    ctx.globalAlpha = 0.3 + 0.45 * Math.max(dep, n);
    ctx.drawImage(glow(SPECIES[a.t].color), a.x - 30 * RS, a.y - 30 * RS, 60 * RS, 60 * RS);
  }
  // dinoflagellates: at night some of the plankton sparkles, brighter where it is stirred up by animals swimming
  if (n > 0.15) {
    ctx.fillStyle = '#7ff0d8';
    for (const a of S.agents) {
      if (a.dead || a.t !== PLANKTON || a.phase > 2.2) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * 2.3 + a.phase * 9);
      ctx.globalAlpha = n * 0.45 * tw; ctx.fillRect(a.x - 1, a.y - 1, 2.2, 2.2);
    }
  }
  ctx.restore();
}

// ---- sky and fleet
const CLOUDS = (() => { const r = seeded(5); return Array.from({ length: 7 }, () => ({ x: r() * WW, y: -SKY + 8 + r() * 26, w: 60 + r() * 110, v: 2 + r() * 3 })); })();
const STARS = (() => { const r = seeded(11); return Array.from({ length: 80 }, () => ({ x: r() * WW, y: -SKY + r() * (SKY - 8), a: 0.3 + r() * 0.7 })); })();
const surfY = (x, t) => Math.sin(x * 0.02 + t * 1.4) * 1.5 + Math.sin(x * 0.007 - t * 0.6) * 1.1;

function drawSky(t) {
  const { n, warm, pol } = MOOD, p = dayPhase(t);
  let hi = mixHex('#5f9fc0', '#a99f86', warm * 0.35 + pol * 0.35), lo = mixHex('#cfe4e8', '#e4d0a8', warm * 0.45 + pol * 0.3);
  const dusk = Math.min(n, 1 - n) * 2; // 1 at the middle of dusk and dawn
  lo = mixHex(lo, '#e8946a', dusk * 0.6); hi = mixHex(hi, '#5a4a78', dusk * 0.4);
  hi = mixHex(hi, '#020814', n * 0.95); lo = mixHex(lo, '#0c1d31', n * 0.92);
  const g = ctx.createLinearGradient(0, -SKY, 0, 0); g.addColorStop(0, hi); g.addColorStop(1, lo);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -SKY); ctx.lineTo(WW, -SKY);
  for (let x = WW; x >= 0; x -= 20) ctx.lineTo(x, surfY(x, t));
  ctx.closePath(); ctx.fill();
  if (n > 0.05) for (const s of STARS) { ctx.fillStyle = `rgba(230,240,255,${(s.a * n * 0.8).toFixed(3)})`; ctx.fillRect(s.x, s.y, 1.6, 1.6); }
  // sun by day, moon by night, each crossing the sky
  if (p < 0.68) {
    const f = p / 0.68, sx = 80 + f * (WW - 160), sy = -10 - Math.sin(f * Math.PI) * (SKY - 26);
    ctx.drawImage(glow(dusk > 0.1 ? '#ffc890' : '#fff4d8'), sx - 40, sy - 40, 80, 80);
    ctx.fillStyle = dusk > 0.1 ? '#ffd9a8' : '#fffaf0'; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, TAU); ctx.fill();
  }
  if (p > 0.62) {
    const f = (p - 0.62) / 0.38, mx = 80 + f * (WW - 160), my = -12 - Math.sin(f * Math.PI) * (SKY - 28);
    ctx.globalAlpha = smooth(0.62, 0.7, p) * (1 - smooth(0.96, 1, p));
    ctx.fillStyle = '#eef0e2'; ctx.beginPath(); ctx.arc(mx, my, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(mx + 3, my - 2, 5.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // clouds; a warmer and fouler world is hazier
  ctx.fillStyle = mixHex(mixHex('#f4f8fa', '#c9b89a', pol * 0.6), '#1a2638', n * 0.85);
  for (const c of CLOUDS) {
    const x = ((c.x + t * c.v) % (WW + 300)) - 150;
    ctx.globalAlpha = 0.35 + 0.25 * warm;
    ctx.beginPath(); ctx.ellipse(x, c.y, c.w * 0.5, 6, 0, 0, TAU); ctx.ellipse(x + c.w * 0.18, c.y - 4, c.w * 0.26, 6, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (pol > 0.05) { // smog along the horizon
    const sg = ctx.createLinearGradient(0, -24, 0, 0);
    sg.addColorStop(0, 'rgba(120,100,70,0)'); sg.addColorStop(1, `rgba(120,100,70,${0.5 * pol})`);
    ctx.fillStyle = sg; ctx.fillRect(0, -24, WW, 24);
  }
  drawHorizon(t, lo);
  // the waterline
  ctx.strokeStyle = `rgba(225,245,250,${0.5 - 0.3 * n})`; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let x = 0; x <= WW; x += 20) x ? ctx.lineTo(x, surfY(x, t)) : ctx.moveTo(0, surfY(0, t));
  ctx.stroke();
  if (pol > 0.15) { // oil sheen
    const og = ctx.createLinearGradient(0, 0, WW, 0);
    ['#7a5cff', '#3fd6a0', '#f0c050', '#ff6fa0', '#5fb0ff', '#c0f060'].forEach((c, i, arr) => og.addColorStop(i / (arr.length - 1), rgbaH(c, (0.45 * pol).toFixed(3))));
    ctx.fillStyle = og; ctx.fillRect(0, 1, WW, 3);
  }
}

// distant boats on the horizon, and in the scored run the cargo ship that waits in port for its ballast decision
const SHIP = { home: 1180, x: 1180, leaving: false, a: 0 };
const PLUMES = [];
function ballastShip(x, y) { SHIP.leaving = true; PLUMES.push({ x, y, t: 0 }); soundHorn(); }
function stepFleet(dt) {
  const g = S.game, inPort = g.on && !g.over && S.t - g.ballastAt >= RUN.BALLAST_EVERY;
  if (SHIP.leaving) { SHIP.x += 40 * dt; if (SHIP.x > WW + 140) { SHIP.leaving = false; SHIP.x = SHIP.home; SHIP.a = 0; } }
  else SHIP.a += ((inPort ? 1 : 0) - SHIP.a) * Math.min(1, dt / 3);
  for (const p of PLUMES) p.t += dt;
  while (PLUMES.length && PLUMES[0].t > 6) PLUMES.shift();
}
function drawHorizon(t, haze) {
  const n = MOOD.n;
  drawFarBoats(ctx, t, n, haze);
  if (SHIP.a > 0.01 || SHIP.leaving) { // container ship waiting in port for its ballast decision
    const x = SHIP.x;
    ctx.save(); ctx.globalAlpha = SHIP.leaving ? 1 : SHIP.a;
    ctx.translate(x, surfY(x, t) + 0.5); ctx.scale(0.85, 0.85);
    drawContainerShip(ctx, t, n, haze, SHIP.leaving);
    ctx.restore();
  }
}
// ballast water: a murky stream that pours down from the surface where the ship flushed its tanks
function drawPlumes(t) {
  for (const p of PLUMES) {
    const f = Math.min(1, p.t / 1.5), fade = 1 - smooth(3, 6, p.t), bot = p.y * f;
    const g = ctx.createLinearGradient(0, 0, 0, bot + 30);
    g.addColorStop(0, `rgba(96,92,52,${0.55 * fade})`); g.addColorStop(1, 'rgba(96,92,52,0)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(p.x - 10, 0); ctx.quadraticCurveTo(p.x - 30 + Math.sin(t * 2) * 6, bot * 0.6, p.x - 40, bot + 30);
    ctx.lineTo(p.x + 40, bot + 30); ctx.quadraticCurveTo(p.x + 30 + Math.sin(t * 2.3) * 6, bot * 0.6, p.x + 10, 0); ctx.fill();
  }
}

// trawler above the waterline: hull, wheelhouse, the A-frame at the stern that tows the warps, a mast with lights
function drawTrawlerDecks(t) {
  const n = MOOD.n;
  for (const tr of S.trawlers.concat(SAILING)) {
    const bx = tr.x + 230, by = surfY(bx, t);
    // the warps above the waterline, from the gantry block down (render.js draws the same curves under water)
    ctx.save(); ctx.beginPath(); ctx.rect(0, -SKY, WW, SKY); ctx.clip();
    ctx.strokeStyle = 'rgba(16,24,30,.85)'; ctx.lineWidth = 1.6;
    for (const y of [tr.y - tr.band, tr.y + tr.band]) { ctx.beginPath(); ctx.moveTo(bx + WARP_FROM.x, WARP_FROM.y); ctx.quadraticCurveTo(bx + WARP_FROM.x, y * 0.55, tr.x + 5, y); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(t * 0.9 + tr.y) * 0.02);
    drawTrawlerTop(ctx, t, n, tr.speed > 0);
    ctx.restore();
  }
}

// ---- depth ruler down the left edge
function drawRuler() {
  const fs = Math.max(11, 9.5 / scale);
  ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (let m = 10; m <= 40; m += 10) { // 50 m would sit on the reef shelf
    const y = m / DEPTH_M * WH;
    ctx.fillStyle = 'rgba(214,234,240,.32)'; ctx.fillRect(0, y, 12, 1.5);
    ctx.fillStyle = 'rgba(214,234,240,.5)'; ctx.fillText(m + ' m', 16, y);
  }
  ctx.textBaseline = 'alphabetic';
}
