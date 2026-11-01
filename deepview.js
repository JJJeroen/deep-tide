// ---------- drawing the deep (M7): water, the slope and the abyssal floor, its animals, the whale, whale falls ----------
// Render only: reads D (deep.js) and S, never writes them. Most of the deep is dark: animals show by their own light or in
// the Watch lamp (a small ROV that only comes down here, where it is needed).

const deepVisible = () => cam.y + innerHeight / scale > DEEP_TOP - 40;

// ---- water, the continental slope behind, the floor with a vent
const SLOPE = (() => { const r = seeded(31), pts = []; for (let y = DEEP_TOP - 130; y <= FLOOR_Y + 40; y += 30) pts.push([520 - (y - DEEP_TOP) * 0.22 + (r() - 0.5) * 40, y]); return pts; })();
const NODULES = (() => { const r = seeded(37); return Array.from({ length: 60 }, () => ({ x: r() * WW, r: 1.5 + r() * 3 })); })();
const CUKES = (() => { const r = seeded(41); return Array.from({ length: 9 }, () => ({ x: 80 + r() * 1300, l: 10 + r() * 8, ph: r() * 6.283 })); })();
const STARS_B = (() => { const r = seeded(43); return Array.from({ length: 14 }, () => ({ x: 60 + r() * 1480, a: r() * 6.283 })); })();
const VENT = { x: 1390 };
function drawDeepWater(t) {
  if (!deepVisible()) return;
  const g = ctx.createLinearGradient(0, DEEP_TOP, 0, DEEP_BOTTOM);
  g.addColorStop(0, MOOD.cols.deep); g.addColorStop(0.18, '#020b14'); g.addColorStop(1, '#010306');
  ctx.fillStyle = g; ctx.fillRect(0, DEEP_TOP, WW, DEEP_BOTTOM - DEEP_TOP + 600);
  // the slope the reef shelf stands on, falling away behind the open water
  ctx.fillStyle = '#04111a'; ctx.beginPath(); ctx.moveTo(0, DEEP_TOP - 130);
  for (const [x, y] of SLOPE) ctx.lineTo(x, y);
  ctx.lineTo(0, FLOOR_Y + 40); ctx.closePath(); ctx.fill();
  // the abyssal plain: soft sediment, manganese nodules, sea cucumbers, brittle stars
  const fg = ctx.createLinearGradient(0, FLOOR_Y - 20, 0, DEEP_BOTTOM);
  fg.addColorStop(0, '#2a2620'); fg.addColorStop(1, '#0b0a08');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(0, DEEP_BOTTOM + 600);
  for (let x = 0; x <= WW; x += 20) ctx.lineTo(x, floorY(x));
  ctx.lineTo(WW, DEEP_BOTTOM + 600); ctx.fill();
  ctx.fillStyle = '#16130f'; for (const n of NODULES) { ctx.beginPath(); ctx.ellipse(n.x, floorY(n.x) + 3, n.r * 1.4, n.r, 0, Math.PI, 6.283); ctx.fill(); }
  for (const c of CUKES) { // sea cucumbers: translucent pink, inching along
    const x = c.x + Math.sin(t * 0.05 + c.ph) * 20, y = floorY(x) - 2;
    ctx.fillStyle = 'rgba(214,130,150,.55)'; ctx.beginPath(); ctx.ellipse(x, y, c.l, 3.2, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(240,170,185,.5)'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let k = -2; k <= 2; k++) { ctx.moveTo(x + k * c.l * 0.35, y - 3); ctx.lineTo(x + k * c.l * 0.35 + 1, y - 6); } ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,170,140,.5)'; ctx.lineWidth = 1;
  for (const s of STARS_B) { const y = floorY(s.x) - 1; ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = s.a + k * 1.2566 + Math.sin(t * 0.3 + k) * 0.1; ctx.moveTo(s.x, y); ctx.quadraticCurveTo(s.x + Math.cos(a) * 5, y + Math.sin(a) * 2 - 1, s.x + Math.cos(a) * 9, y + Math.sin(a) * 3); } ctx.stroke(); }
  // a black smoker: a chimney of minerals, shimmering black plumes, tube worms around its foot
  const vx = VENT.x, vy = floorY(vx);
  ctx.fillStyle = '#0d0f10'; ctx.beginPath(); ctx.moveTo(vx - 22, vy); ctx.lineTo(vx - 9, vy - 70); ctx.lineTo(vx - 4, vy - 82); ctx.lineTo(vx + 5, vy - 80); ctx.lineTo(vx + 9, vy - 66); ctx.lineTo(vx + 20, vy); ctx.fill();
  for (let i = 0; i < 16; i++) { const k = (t * 0.22 + i / 16) % 1; ctx.fillStyle = `rgba(18,20,22,${(0.55 * (1 - k)).toFixed(3)})`; ctx.beginPath(); ctx.arc(vx + Math.sin(i * 3 + t * 0.7) * 10 * k, vy - 84 - k * 170, 6 + k * 24, 0, 6.283); ctx.fill(); }
  for (let i = 0; i < 12; i++) {
    const x = vx - 46 + i * 8 + (i % 2) * 3, h = 16 + ((i * 7) % 11), sw = Math.sin(t * 1.3 + i) * 1.5;
    ctx.strokeStyle = '#d8d2c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, floorY(x)); ctx.lineTo(x + sw, floorY(x) - h); ctx.stroke();
    ctx.fillStyle = '#c4303a'; ctx.beginPath(); ctx.ellipse(x + sw, floorY(x) - h - 2, 2.2, 3, 0, 0, 6.283); ctx.fill();
  }
}

// ---- marine snow in the deep: the deep's whole food supply, falling
const DSNOW = Array.from({ length: 150 }, () => ({ x: Math.random() * WW, y: Math.random(), v: 6 + Math.random() * 8, s: 0.8 + Math.random() * 1.2, ph: Math.random() * 6.283 }));
function drawDeepSnow(t) {
  if (!deepVisible()) return;
  const n = Math.round(DSNOW.length * Math.max(0.2, Math.min(1, D.snow / 250))), H = FLOOR_Y - DEEP_TOP;
  ctx.fillStyle = 'rgba(214,228,232,.45)';
  for (let i = 0; i < n; i++) { const s = DSNOW[i], y = DEEP_TOP + (s.y * H + t * s.v) % H, x = s.x + Math.sin(t * 0.3 + s.ph) * 6; ctx.fillRect(x, y, s.s, s.s); }
}

// ---- the animals
function faceOf(a) { if (a.face === undefined) a.face = a.vx < 0 ? -1 : 1; if (a.vx * a.face < -3) a.face = -a.face; return a.face; }
function drawLantern(a) {
  const f = faceOf(a);
  ctx.save(); ctx.translate(a.x, a.y); ctx.scale(f, 1);
  ctx.fillStyle = '#1b2a34'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11, -3.4 + Math.sin(D.t * 9 + a.ph) * 1); ctx.lineTo(-11, 3.4 + Math.sin(D.t * 9 + a.ph) * 1); ctx.fill();
  ctx.fillStyle = '#c9d6dc'; ctx.beginPath(); ctx.arc(5, -0.8, 1.4, 0, 6.283); ctx.fill(); // big eye
  ctx.restore();
}
function drawAngler(a, t) {
  const f = faceOf(a), bob = Math.sin(t * 0.8 + a.ph) * 2;
  ctx.save(); ctx.translate(a.x, a.y + bob); ctx.scale(f, 1);
  ctx.fillStyle = '#16161b'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-24, -8); ctx.lineTo(-22, 0); ctx.lineTo(-24, 8); ctx.fill(); // tail
  ctx.fillStyle = '#0a0a0d'; ctx.beginPath(); ctx.moveTo(4, 2); ctx.quadraticCurveTo(15, 1, 17, 6); ctx.quadraticCurveTo(10, 12, 2, 8); ctx.fill(); // gaping mouth
  ctx.strokeStyle = '#e4e0d6'; ctx.lineWidth = 0.9; ctx.beginPath();
  for (let k = 0; k < 6; k++) { const x = 5 + k * 2; ctx.moveTo(x, 2.5 + k * 0.4); ctx.lineTo(x + 0.6, 6 + k * 0.3); } ctx.stroke(); // needle teeth
  ctx.fillStyle = '#9fb0b8'; ctx.beginPath(); ctx.arc(6, -4, 1.6, 0, 6.283); ctx.fill();
  ctx.strokeStyle = '#2c2c33'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(2, -11); ctx.quadraticCurveTo(10, -26, 18, -14 + Math.sin(t * 1.4 + a.ph) * 2); ctx.stroke(); // the rod
  ctx.restore();
}
const lurePos = (a, t) => ({ x: a.x + faceOf(a) * 18, y: a.y + Math.sin(t * 0.8 + a.ph) * 2 - 14 + Math.sin(t * 1.4 + a.ph) * 2 });
function drawSquid(a, t) {
  const sp = Math.hypot(a.vx, a.vy), ang = sp > 2 ? Math.atan2(a.vy, a.vx) : (a.face || 1) > 0 ? 0 : Math.PI;
  faceOf(a);
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang + Math.PI); // squid swim mantle first: the arms trail behind the motion
  ctx.strokeStyle = '#7a2a26'; ctx.lineCap = 'round';
  for (let k = 0; k < 10; k++) { // eight arms and two long feeding tentacles
    const long = k >= 8, len = long ? 64 : 34, off = (k - 4.5) * 1.6, ph = t * 2 + k * 0.7 + a.ph;
    ctx.lineWidth = long ? 1.2 : 2;
    ctx.beginPath(); ctx.moveTo(-6, off * 0.6);
    ctx.bezierCurveTo(-6 - len * 0.35, off + Math.sin(ph) * 4, -6 - len * 0.7, off * 1.3 + Math.sin(ph + 1) * 6, -6 - len, off * 1.5 + Math.sin(ph + 2) * 8);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, -8, 0, 8); g.addColorStop(0, '#a03c32'); g.addColorStop(1, '#5c1d1a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-6, -7); ctx.quadraticCurveTo(30, -9, 48, 0); ctx.quadraticCurveTo(30, 9, -6, 7); ctx.closePath(); ctx.fill(); // mantle
  ctx.beginPath(); ctx.moveTo(38, 0); ctx.lineTo(50, -9); ctx.lineTo(52, 0); ctx.lineTo(50, 9); ctx.closePath(); ctx.fill(); // fins
  ctx.fillStyle = '#e9e2cf'; ctx.beginPath(); ctx.arc(-2, -2, 3.2, 0, 6.283); ctx.fill(); // the largest eye in the animal kingdom
  ctx.fillStyle = '#101014'; ctx.beginPath(); ctx.arc(-2.3, -2, 1.8, 0, 6.283); ctx.fill();
  ctx.restore(); ctx.lineCap = 'butt';
}
function drawHagfish(a, t) {
  const f = faceOf(a);
  ctx.strokeStyle = '#b7898a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
  for (let k = 0; k <= 8; k++) { const x = a.x - f * k * 2.4, y = a.y + Math.sin(t * 7 - k * 0.9 + a.ph) * 1.6 * (k / 8); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke(); ctx.lineCap = 'butt';
}
function drawCrab(a, t) {
  const walk = Math.hypot(a.vx, a.vy) > 1 ? t * 10 : 0;
  ctx.strokeStyle = '#c4562e'; ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const x0 = a.x + s * 3, y0 = a.y - 3, kx = a.x + s * (7 + k * 1.5), ky = a.y - 9 + k, fx = a.x + s * (11 + k * 2.5), fy = a.y + 1 + Math.sin(walk + k + s) * 1.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
  }
  ctx.fillStyle = '#d0603a'; ctx.beginPath(); ctx.ellipse(a.x, a.y - 4, 5, 3.6, 0, 0, 6.283); ctx.fill();
}
function whaleBody() { // the outline, nose to the right, used for the living whale and for the carcass on the floor
  ctx.beginPath(); ctx.moveTo(-152, -2);
  ctx.quadraticCurveTo(-110, -14, -60, -18); ctx.lineTo(-40, -24); ctx.lineTo(-28, -19);           // hump
  ctx.quadraticCurveTo(10, -26, 40, -28); ctx.lineTo(96, -28); ctx.quadraticCurveTo(108, -26, 110, -12); // the square head
  ctx.lineTo(110, 8); ctx.quadraticCurveTo(104, 18, 84, 18); ctx.quadraticCurveTo(10, 24, -60, 14); ctx.quadraticCurveTo(-120, 8, -152, 2); ctx.closePath();
}
function drawSkeleton(x, y, dir, a) { // spine, ribs and skull; it stays long after the flesh is gone
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.globalAlpha = a;
  ctx.strokeStyle = '#ded6c4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-150, 0); ctx.quadraticCurveTo(-20, -12, 70, -6); ctx.stroke();
  for (let i = -8; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 12, -8 + Math.abs(i) * 0.3); ctx.quadraticCurveTo(i * 12 + 6, -28, i * 12 + 12, -2); ctx.stroke(); }
  ctx.fillStyle = '#ded6c4'; ctx.beginPath(); ctx.moveTo(70, -12); ctx.lineTo(112, -14); ctx.lineTo(112, 2); ctx.lineTo(70, 2); ctx.closePath(); ctx.fill(); // skull
  ctx.fillRect(66, 2, 46, 3); // the long lower jaw
  ctx.restore();
}
// the sperm whale: a huge square head, a narrow lower jaw, a wrinkled body, a low hump, broad flukes
function drawSpermWhale(w, t) {
  const dead = w.phase === 'dead', f = w.dir;
  const pitch = dead ? 0.15 : Math.max(-0.9, Math.min(0.9, Math.atan2(w.vy, Math.abs(w.vx) + 1)));
  ctx.save(); ctx.translate(w.x, w.y); ctx.scale(f, 1); ctx.rotate(pitch); if (dead) ctx.scale(1, -1); // belly up as it sinks
  const body = dead ? '#7b7c80' : '#4a4b52', fl = Math.sin(t * (dead ? 0 : 1.6)) * 14;
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-150, 0); ctx.quadraticCurveTo(-170, -4 + fl * 0.4, -186, -14 + fl); ctx.lineTo(-178, 0 + fl * 0.5); ctx.lineTo(-186, 14 + fl); ctx.quadraticCurveTo(-170, 4 + fl * 0.4, -150, 0); ctx.fill(); // flukes
  whaleBody(); ctx.fill();
  ctx.fillStyle = dead ? '#a5a6a9' : '#5d5e66'; ctx.beginPath(); ctx.moveTo(84, 18); ctx.quadraticCurveTo(60, 23, 30, 19); ctx.lineTo(32, 16); ctx.lineTo(84, 14); ctx.fill(); // lower jaw
  ctx.strokeStyle = 'rgba(20,20,26,.45)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let k = 0; k < 9; k++) { const x = -120 + k * 18; ctx.moveTo(x, -12 + (k % 2) * 3); ctx.quadraticCurveTo(x + 6, 0, x + 2, 12); } ctx.stroke(); // wrinkles
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(52, 18, 14, 4, 0.5, 0, 6.283); ctx.fill(); // flipper
  ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.arc(64, 4, 2, 0, 6.283); ctx.fill(); // small eye
  ctx.restore();
  if (w.phase === 'surface' && (t % 5) < 1.2) { // the blow: angled forward and to the left, as a sperm whale's is
    const k = (t % 5) / 1.2, bx = w.x + f * 100, by = w.y - 30;
    ctx.fillStyle = `rgba(235,242,245,${(0.55 * (1 - k)).toFixed(3)})`;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(bx + f * (6 + i * 4) * k - i * 2, by - i * 6 * k - 10 * k, 4 + i * 2 * k, 0, 6.283); ctx.fill(); }
  }
}
function drawFallsAndBones(t) {
  for (const b of D.bones) { // the skeleton stays for a long time, crusted with bacterial mats and red bone worms
    const y = floorY(b.x) - 6;
    drawSkeleton(b.x, y, b.dir || 1, 0.75);
    ctx.fillStyle = 'rgba(196,60,64,.65)'; for (let i = 0; i < 26; i++) ctx.fillRect(b.x - 120 + i * 9, y - 3 - (i % 3) * 4, 1.5, 3);
    ctx.fillStyle = 'rgba(240,236,220,.35)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(b.x - 110 + i * 40, y + 2, 16, 3, 0, 0, 6.283); ctx.fill(); }
  }
  for (const f of D.falls) { // the whale on its side; as the scavengers strip it the skeleton shows through
    const k = Math.max(0, f.mass / 2400), x = f.x, y = floorY(x) - 20;
    drawSkeleton(x, y + 12, f.dir, 0.8);
    ctx.save(); ctx.translate(x, y); ctx.scale(f.dir, 1);
    ctx.globalAlpha = 0.2 + 0.8 * k; ctx.fillStyle = '#76777b'; whaleBody(); ctx.fill();
    ctx.globalAlpha = 0.85 * Math.min(1, (1 - k) * 2.5); ctx.fillStyle = '#a3534e'; // torn flesh where they have eaten
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(-130 + i * 26 + (i % 2) * 6, -6 + (i % 3) * 5, 10 + (1 - k) * 6, 5 + (1 - k) * 3, 0.3, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#f0ecdc'; // bacterial mats
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(-120 + i * 34, 16, 12, 3, 0, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
}
function drawDeep(t) {
  if (!deepVisible()) { if (D.whale && D.whale.y < DEEP_TOP + 100) drawSpermWhale(D.whale, t); return; }
  drawFallsAndBones(t);
  for (const a of D.agents) {
    if (a.k === 'lantern') drawLantern(a); else if (a.k === 'angler') drawAngler(a, t); else if (a.k === 'squid') drawSquid(a, t);
    else if (a.k === 'hagfish') drawHagfish(a, t); else drawCrab(a, t);
  }
  if (D.whale) drawSpermWhale(D.whale, t);
}

// ---- darkness of the deep, with the light sources cutting into it, and the glows drawn over it
const DDW = 160, DDH = Math.ceil((DEEP_BOTTOM - DEEP_TOP) * DDW / WW), deepDark = document.createElement('canvas');
deepDark.width = DDW; deepDark.height = DDH;
const ddg = deepDark.getContext('2d'), DDS = DDW / WW;
function drawDeepDark(t) {
  if (!deepVisible()) return;
  ddg.globalCompositeOperation = 'source-over'; ddg.globalAlpha = 1; ddg.clearRect(0, 0, DDW, DDH);
  const g = ddg.createLinearGradient(0, 0, 0, DDH), top = 0.42 + (0.64 - 0.42) * MOOD.n;
  g.addColorStop(0, `rgba(1,6,12,${top.toFixed(3)})`); g.addColorStop(0.2, 'rgba(1,5,10,.86)'); g.addColorStop(0.45, 'rgba(0,3,6,.92)'); g.addColorStop(1, 'rgba(0,2,4,.93)');
  ddg.fillStyle = g; ddg.fillRect(0, 0, DDW, DDH);
  ddg.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, s) => { ddg.globalAlpha = s; ddg.drawImage(HOLE, (x - r) * DDS, (y - r - DEEP_TOP) * DDS, 2 * r * DDS, 2 * r * DDS); };
  if (LAMP.k > 0.02) hole(LAMP.x, LAMP.y, 230, 0.97 * LAMP.k);
  hole(VENT.x, floorY(VENT.x) - 30, 150, 0.55);
  for (const a of D.agents) if (a.k === 'angler') { const p = lurePos(a, t); hole(p.x, p.y, 55, 0.6); }
  ddg.globalAlpha = 1; ddg.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(deepDark, 0, DEEP_TOP, WW, DDH / DDS);
  ctx.fillStyle = 'rgba(0,2,4,.93)'; ctx.fillRect(0, DEEP_TOP + DDH / DDS, WW, 600); // below the floor line
}
function drawDeepGlows(t) {
  if (!deepVisible()) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.6; ctx.drawImage(glow('#ff8a4c'), VENT.x - 70, floorY(VENT.x) - 110, 140, 140); // the vent's heat
  for (const a of D.agents) {
    if (a.k === 'lantern') { // rows of photophores along the belly, blinking now and then
      const f = a.face || 1, on = Math.sin(t * 0.7 + a.ph * 5) > -0.85 ? 1 : 0.2;
      ctx.globalAlpha = 0.9 * on; ctx.fillStyle = '#8fe8ff';
      for (let k = -2; k <= 2; k++) ctx.fillRect(a.x + k * 2.6 * f - 0.6, a.y + 1.6, 1.3, 1.3);
      ctx.globalAlpha = 0.35 * on; ctx.drawImage(glow('#5fd0ff'), a.x - 8, a.y - 6, 16, 14);
    } else if (a.k === 'angler') {
      const p = lurePos(a, t), pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + a.ph);
      ctx.globalAlpha = pulse; ctx.drawImage(glow('#9fffe0'), p.x - 22, p.y - 22, 44, 44);
      ctx.fillStyle = '#eafff8'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 6.283); ctx.fill();
    }
  }
  ctx.restore();
}

// ---- the Watch lamp, only in the deep: a small ROV on a tether, lighting what you point at
const LAMP = { x: WW / 2, y: 1400, k: 0 };
function lampTarget() {
  if (tool !== 'watch') return null;
  if (inspect && !inspect.a.dead && inspect.a.y > DEEP_TOP + 40) return inspect.a;
  if (ptr.inside && ptr.mouse && ptr.y > DEEP_TOP + 40) return ptr;
  return null;
}
function stepLamp(rdt) {
  const tg = lampTarget();
  LAMP.k += ((tg ? 1 : 0) - LAMP.k) * Math.min(1, rdt * 4);
  if (tg) {
    if (LAMP.k < 0.05) { LAMP.x = tg.x; LAMP.y = tg.y; }
    LAMP.x += (tg.x - LAMP.x) * Math.min(1, rdt * 6); LAMP.y += (tg.y - LAMP.y) * Math.min(1, rdt * 6);
  }
}
function drawLamp(t) {
  if (LAMP.k < 0.02) return;
  const x = LAMP.x, y = LAMP.y, rx = x, ry = y - 80 + Math.sin(t * 1.7) * 1.5;
  ctx.save(); ctx.globalAlpha = LAMP.k;
  ctx.globalCompositeOperation = 'lighter';
  const bg = ctx.createLinearGradient(0, ry, 0, y + 50);
  bg.addColorStop(0, 'rgba(255,240,200,.18)'); bg.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(rx - 6, ry + 4); ctx.lineTo(rx + 6, ry + 4); ctx.lineTo(x + 60, y + 50); ctx.lineTo(x - 60, y + 50); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(230,200,90,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx + 4, ry - 8); ctx.quadraticCurveTo(rx + 40, ry - 300, rx + 20, ry - 900); ctx.stroke(); // tether to the ship
  ctx.translate(rx, ry);
  ctx.fillStyle = '#e8b836'; ctx.fillRect(-14, -8, 28, 11);
  ctx.fillStyle = '#23292d'; ctx.fillRect(-16, 3, 32, 4); ctx.fillRect(-18, -5, 4, 8); ctx.fillRect(14, -5, 4, 8); ctx.fillRect(-5, -11, 10, 3);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glow('#fff2c8'), -18, -3, 16, 16); ctx.drawImage(glow('#fff2c8'), 2, -3, 16, 16);
  ctx.restore();
}

// ---- pointing at deep animals (Watch)
function pickDeep(x, y, r) {
  let best = null, bd = r * r;
  for (const a of D.agents) { const d = (a.x - x) ** 2 + (a.y - y) ** 2; if (d < bd) { bd = d; best = a; } }
  if (D.whale) { const w = D.whale, d = (w.x - x) ** 2 + (w.y - y) ** 2; if (d < (r + 90) ** 2 && d < bd + 8000) best = w; }
  return best;
}
function deepLabel(a) {
  const m = Math.round(depthAt(a.y) / 10) * 10 + ' m deep';
  if (!a.k) return ['Sperm whale', a.phase === 'dead' ? 'dead, sinking · ' + m : a.phase === 'hunt' ? 'hunting giant squid · ' + m : a.phase === 'surface' ? 'breathing at the surface' : 'diving · ' + m];
  const s = DEEP_SP[a.k], e = a.e / s.max;
  return [s.one, (e < 0.3 ? 'starving' : e < 0.6 ? 'hungry' : 'well fed') + ' · ' + m];
}
