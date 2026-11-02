// ---------- rendering + input ----------
const view = document.getElementById('view'), ctx = view.getContext('2d');
const COL = SPECIES.map(sp => sp.color);
let scale = 1, ox = 0, oy = 0, tool = 'watch', paused = false, speedMul = 1; // speedMul = simulated seconds per real second
const ptr = { x: 0, y: 0, down: false, inside: false };
const drag = { on: false, sy: 0, cy: 0 }; // dragging with the Watch tool scrolls the camera

// Camera: the world is a tall column (sky, the sunlit sim, the deep down to the abyssal floor). cam.y is the world y at the
// top of the view; scrolled to the top, the view is exactly the sunlit scene. oy stays the screen position of world y = 0
// (the surface) and moves with the camera, so everything that maps screen <-> world keeps working.
const cam = { y: -SKY, target: -SKY };
// Screen space the panels take: on a portrait phone the column starts below the species panel (as the sea did before),
// and the camera always scrolls far enough that the abyssal floor clears the toolbar.
let topReserve = 0, barH = 0;
function measureChrome() {
  const bar = document.getElementById('bar'), st = document.getElementById('stats'), db = document.getElementById('depthBtn');
  barH = bar ? bar.offsetHeight + 12 : 0; // read everything first, then write, so no extra layout is forced
  topReserve = innerWidth <= 760 && innerHeight > innerWidth && st ? Math.round(st.getBoundingClientRect().bottom) + 6 : 0;
  const bottom = (barH + 6) + 'px'; if (db && db.style.bottom !== bottom) db.style.bottom = bottom; // just above the toolbar
}
const camMax = () => Math.max(-SKY, DEEP_BOTTOM - (innerHeight - barH - 10 - topReserve) / scale);
const clampCam = y => Math.max(-SKY, Math.min(camMax(), y));
function placeCam() { oy = topReserve - cam.y * scale; }
function resize() {
  const dpr = window.devicePixelRatio || 1;
  view.width = innerWidth * dpr; view.height = innerHeight * dpr;
  scale = Math.min(innerWidth / WW, innerHeight / (WH + SKY));
  ox = (innerWidth - WW * scale) / 2;
  measureChrome();
  cam.y = clampCam(cam.y); cam.target = clampCam(cam.target); placeCam();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

// clicks in the sky band land on the surface
function toWorld(e) { return { x: (e.clientX - ox) / scale, y: Math.max(0, (e.clientY - oy) / scale) }; }

const glowCache = {};
function glow(color) {
  if (glowCache[color]) return glowCache[color];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color + 'cc'); gr.addColorStop(0.4, color + '33'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return glowCache[color] = c;
}

// pollution is painted into a tiny one-pixel-per-cell canvas and scaled up with smoothing: soft clouds, no block seams
const pollCanvas = document.createElement('canvas'); pollCanvas.width = GCOLS; pollCanvas.height = GROWS;
const pollCtx = pollCanvas.getContext('2d'), pollImg = pollCtx.createImageData(GCOLS, GROWS);
// debris that shows wherever the water is fouled: plastic flecks and scraps drifting with the current
const FLECKS = Array.from({ length: 160 }, () => ({
  x: Math.random() * WW, y: Math.random() * WH, vx: 3 + Math.random() * 6, ph: Math.random() * 6.283,
  w: 1.5 + Math.random() * 3, c: ['#ddd6c4', '#8fb8cf', '#c98f5a', '#ddd6c4', '#b7c9a0'][(Math.random() * 5) | 0] }));
function drawPollution(t) {
  const d = pollImg.data; let any = false;
  for (let i = 0; i < S.poll.length; i++) {
    const v = S.poll[i], o = i * 4, k = Math.min(1, v / 0.5);
    // light pollution reads as murky olive water, heavy pollution as dark brown sludge
    d[o] = 96 - 44 * k; d[o + 1] = 88 - 52 * k; d[o + 2] = 40 - 26 * k; d[o + 3] = v > 0.02 ? Math.min(215, 30 + v * 420) : 0;
    if (d[o + 3]) any = true;
  }
  if (!any) return;
  pollCtx.putImageData(pollImg, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(pollCanvas, 0, 0, GCOLS * GC, GROWS * GC);
  for (const f of FLECKS) {
    const x = ((f.x + t * f.vx) % WW + WW) % WW, y = f.y + Math.sin(t * 0.4 + f.ph) * 6, v = pollAt(x, y);
    if (v < 0.06) continue;
    ctx.globalAlpha = Math.min(0.85, v * 2.5);
    ctx.fillStyle = f.c; ctx.fillRect(x, y, f.w, f.w * 0.5);
  }
  ctx.globalAlpha = 1;
}


// Fish hold a near-horizontal pitch: rotating straight into a vertical dive made them look like arrows.
const MAX_PITCH = 0.45;
// Animals are drawn larger than their sim size so a player can tell a hunter from a grazer at a glance.
// Draw scale only: reach, vision and every other sim distance are unchanged.
const RS = 1.3;

function drawAgent(a, t) {
  const sp = SPECIES[a.t];
  if (sp.plant) { ctx.fillStyle = 'rgba(143,227,160,0.65)'; ctx.fillRect(a.x - 1, a.y - 1, 2.2, 2.2); return; }
  const spr = SPRITES[a.t];
  if (!spr) return;
  // depth: slightly smaller toward the seabed and tinted by the water around them, so the column has volume
  const dep = Math.min(1, Math.max(0, (a.y - 70) / (WH - 140)));
  if (sp.shape === 'jelly') { // upright, never rotated; its glow is drawn over the darkness (scene.js drawGlows)
    const cyc = t * spr.beat + a.phase / TAU;
    const frame = spr.frames[Math.floor((((cyc % 1) + 1) % 1) * spr.frames.length)];
    ctx.globalAlpha = 1 - 0.24 * dep;
    ctx.drawImage(frame, a.x + spr.x0 * RS, a.y + spr.y0 * RS, spr.w * RS, spr.h * RS);
    ctx.globalAlpha = 1;
    return;
  }
  const set = spr.tints[Math.min(spr.tints.length - 1, Math.floor(dep * spr.tints.length))];
  // Facing changes only once the animal really swims the other way, so one moving straight up or down doesn't flicker
  // left/right; and the turn is shown: the body narrows to its head-on profile and widens again the other way round.
  if (a.face === undefined || t < a.ft) { a.face = a.vx < 0 ? -1 : 1; a.fx = a.face; a.ft = t; }
  if (a.vx * a.face < -0.12 * sp.speed) a.face = -a.face;
  a.fx += (a.face - a.fx) * Math.min(1, (t - a.ft) * 7); a.ft = t;
  const sx = a.fx < 0 ? Math.min(-0.12, a.fx) : Math.max(0.12, a.fx);
  // pitch is clamped near horizontal; mirroring before the rotation keeps left-swimmers belly-down and nose-first
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(a.vy, Math.abs(a.vx) || 1e-6)));
  const spd = Math.min(1.6, Math.hypot(a.vx, a.vy) / sp.speed);
  const cyc = t * spr.beat * (0.7 + 0.55 * spd) + a.phase / TAU;
  const frame = set[Math.floor((((cyc % 1) + 1) % 1) * set.length)];
  const k = (1 - 0.08 * dep) * RS;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.scale(sx, 1);
  ctx.rotate(pitch);
  ctx.drawImage(frame, spr.x0 * k, spr.y0 * k, spr.w * k, spr.h * k);
  ctx.restore();
}

function drawEffects() {
  for (const e of S.effects) {
    const k = e.t / 0.5;
    if (e.kind !== 1) continue; // 0 = plankton eaten (too small to mark); 2 = caught, drawn as a haul instead
    ctx.strokeStyle = `rgba(255,120,80,${0.7 * (1 - k)})`;
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(e.x, e.y, 3 + k * 14, 0, 6.283); ctx.stroke();
  }
}

// ---------- catch: what the nets take is shown going up, not just disappearing
// Animals taken by the hand net are hauled up on a line to the surface; animals taken by a trawler go into its codend.
// In the scored run each haul also shows what it is worth. Pure presentation: reads S.effects (kind 2, with sp).
const LIFTS = [], TAGS = [];
const fmtVal = v => '+' + (v % 1 ? (v > 1 ? Math.floor(v) : '') + '½' : v);
function collectCatch() {
  for (const e of S.effects) {
    if (e.kind !== 2 || e.seen) continue;
    e.seen = true;
    if (e.sp === undefined || e.sp === PLANKTON) continue;
    // e.t is the sim time since the catch (it includes the catching step), and the trawler moved on since then:
    // stepTools kills in [x - 10, x + speed*dt + 10] around the position x it had at that step, i.e. tr.x - speed * e.t
    const tr = S.trawlers.find(tr => { const tx = tr.x - tr.speed * e.t; return e.x >= tx - 15 && e.x <= tx + tr.speed / 30 + 15 && Math.abs(e.y - tr.y) <= tr.band + 1; });
    if (typeof coachCatch === 'function') coachCatch(e.sp, !!tr);
    if (tr) {
      tr.catch = (tr.catch || 0) + 1; (tr.bySp = tr.bySp || {})[e.sp] = (tr.bySp[e.sp] || 0) + 1;
      if (RUN_PROTECTED[e.sp]) tr.prot = (tr.prot || 0) + 1; else tr.value = (tr.value || 0) + RUN_VAL[e.sp];
      continue;
    }
    LIFTS.push({ sp: e.sp, x: e.x, y: e.y, t: 0, ph: Math.random() * 6.283 });
    if (!S.game.on) continue;
    // one net sweep takes several animals at once: add them up in one rising label instead of stacking labels
    const bad = RUN_PROTECTED[e.sp], near = TAGS.find(g => g.t < 0.35 && g.bad === bad && Math.abs(g.x - e.x) < 70 && Math.abs(g.y - e.y) < 70);
    if (near) { near.n++; near.v += RUN_VAL[e.sp]; near.text = bad ? near.n + ' protected' : fmtVal(near.v); }
    else TAGS.push({ x: e.x, y: e.y, t: 0, n: 1, v: RUN_VAL[e.sp], bad, text: bad ? 'protected' : fmtVal(RUN_VAL[e.sp]) });
  }
}
function stepCatch(dt) {
  for (const l of LIFTS) l.t += dt;
  for (const g of TAGS) g.t += dt;
  while (LIFTS.length && LIFTS[0].t > 1.4) LIFTS.shift();
  while (TAGS.length && TAGS[0].t > 1.3) TAGS.shift();
}
function drawLifts(t) {
  for (const l of LIFTS) {
    const p = Math.min(1, l.t / 1.2), y = l.y * (1 - p * p), x = l.x + Math.sin(t * 3 + l.ph) * 3 * (1 - p);
    ctx.strokeStyle = `rgba(230,240,245,${0.35 * (1 - p)})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, 0); ctx.stroke();
    const spr = SPRITES[l.sp];
    if (spr && p < 1) {
      const fr = spr.tints[Math.min(1, spr.tints.length - 1)][0], k = RS * 0.9;
      ctx.save(); ctx.translate(x, y); ctx.rotate(SPECIES[l.sp].shape === 'jelly' ? 0 : -1.2 + Math.sin(t * 8 + l.ph) * 0.25);
      ctx.drawImage(fr, spr.x0 * k, spr.y0 * k, spr.w * k, spr.h * k);
      ctx.restore();
      // the mesh around it
      ctx.strokeStyle = 'rgba(230,240,245,.35)'; ctx.beginPath(); ctx.arc(x, y, SPECIES[l.sp].size * RS * 1.2, 0, 6.283); ctx.stroke();
    }
    if (p >= 1) { const k = (l.t - 1.2) / 0.2; ctx.strokeStyle = `rgba(230,245,250,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(x, 3, 6 + k * 16, 2 + k * 3, 0, 0, 6.283); ctx.stroke(); }
  }
}
function drawTags() {
  const fs = Math.max(15, 12 / scale);
  ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center';
  for (const g of TAGS) {
    const k = g.t / 1.3;
    ctx.fillStyle = g.bad ? `rgba(255,107,138,${1 - k})` : `rgba(240,214,140,${1 - k})`;
    ctx.fillText(g.text, g.x, g.y - 14 - k * 34);
  }
  ctx.textAlign = 'left';
}

// The sim drops a trawler once it is past the right edge (tr.x >= WW + 120), but its net trails 250 px behind and would
// vanish mid-screen with the catch in it. Dropped trawlers keep sailing here, render-only, until the codend is off-screen.
const SAILING = [];
let seenTrawlers = [];
function stepSailing(dt) {
  for (const tr of seenTrawlers) if (!S.trawlers.includes(tr) && !SAILING.includes(tr) && tr.x >= WW) SAILING.push(tr);
  seenTrawlers = S.trawlers.slice();
  for (const tr of SAILING) tr.x += tr.speed * dt;
  for (let i = SAILING.length - 1; i >= 0; i--) if (SAILING[i].x - 320 > WW) SAILING.splice(i, 1);
}

// silt kicked up where a trawl net drags the floor: render-only puffs that rise, spread and settle out over a few seconds
const SILT = [];
function stepSilt(dt) {
  for (const tr of S.trawlers) {
    const mx = tr.x, by = mx > 0 && mx < WW ? bedAt(mx) : 1e9;
    if (tr.y + tr.band > by) for (let k = 0; k < 2; k++) SILT.push({ x: mx - Math.random() * 30, y: by - Math.random() * 6, vx: (Math.random() - 0.7) * 10, vy: -4 - Math.random() * 8, r: 6 + Math.random() * 8, t: 0, life: 4 + Math.random() * 4 });
  }
  for (const p of SILT) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 1 - 0.4 * dt; p.r += 5 * dt; }
  while (SILT.length && SILT[0].t > SILT[0].life) SILT.shift();
  if (SILT.length > 600) SILT.splice(0, SILT.length - 600);
}
function drawSilt() {
  for (const p of SILT) {
    const k = p.t / p.life, a = 0.28 * (1 - k) * Math.min(1, p.t * 3);
    ctx.fillStyle = `rgba(112,104,82,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
  }
}

// The trawler: a hull at the surface (seen from below), warps down to the otter boards that hold the net mouth open,
// and a cone net whose codend swells with what it takes. The net mouth is exactly the band the sim sweeps (tr.x, tr.y +- band).
function drawTrawlers(t) {
  for (const tr of S.trawlers.concat(SAILING)) {
    const mouth = tr.x, bx = tr.x + 230, len = 250, top = tr.y - tr.band, bot = tr.y + tr.band, cy = tr.y;
    // warps
    ctx.strokeStyle = 'rgba(16,24,30,.85)'; ctx.lineWidth = 1.6;
    for (const y of [top, bot]) { ctx.beginPath(); ctx.moveTo(bx + WARP_FROM.x, WARP_FROM.y); ctx.quadraticCurveTo(bx + WARP_FROM.x, y * 0.55, mouth + 5, y); ctx.stroke(); } // from the gantry block
    // net: hoops narrowing toward the codend, and the long lines between them
    const ex = mouth - len, fill = Math.min(1, (tr.catch || 0) / 40), cr = 10 + fill * 28;
    ctx.strokeStyle = 'rgba(225,232,236,.42)'; ctx.lineWidth = 1;
    for (let j = 0; j <= 6; j++) { const f = j / 6, x = mouth - f * len, r = tr.band * (1 - f * 0.86); ctx.beginPath(); ctx.ellipse(x, cy, 3 + 9 * (1 - f), r, 0, 0, 6.283); ctx.stroke(); }
    for (let j = -4; j <= 4; j++) {
      ctx.beginPath(); ctx.moveTo(mouth, cy + j * tr.band / 4);
      ctx.quadraticCurveTo(mouth - len * 0.5, cy + j * tr.band / 4 * 0.5 + Math.sin(t * 3 + j) * 2, ex, cy + j * 2.5); ctx.stroke();
    }
    // otter boards
    ctx.fillStyle = '#1b1915'; for (const y of [top, bot]) ctx.fillRect(mouth - 4, y - 10, 10, 20);
    // codend with the catch glinting inside
    ctx.fillStyle = 'rgba(22,48,58,.94)'; ctx.beginPath(); ctx.ellipse(ex - cr * 0.6, cy, cr, cr * 0.72, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(190,235,240,.8)';
    for (let k = 0; k < Math.min(30, tr.catch || 0); k++) { const a = k * 2.39, rr = ((k * 7) % 10) / 10 * cr * 0.8; ctx.fillRect(ex - cr * 0.6 + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, 3, 1.2); }
    // hull below the waterline (boats.js), with prop wash behind it
    ctx.save(); ctx.translate(bx, 0); drawTrawlerBelow(ctx, t, MOOD.n); ctx.restore();
    ctx.fillStyle = 'rgba(220,240,248,.35)';
    for (let k = 0; k < 18; k++) { const u = ((k * 37 + t * 60) % 140); ctx.beginPath(); ctx.arc(bx - 84 - u, 8 + ((k * 13) % 14), 1 + (k % 3) * 0.6, 0, 6.283); ctx.fill(); }
    // in the scored run, what this pass is worth
    // (head office's trawler: its catch is not the player's, so it carries a name instead of a value)
    if (S.game.on && (tr.catch || tr.company)) {
      const fs = Math.max(15, 12 / scale);
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = tr.company ? 'rgba(200,210,218,.95)' : 'rgba(240,214,140,.95)';
      ctx.fillText(tr.company ? 'Head office' : '+' + Math.round((tr.value || 0) * 2) / 2, ex - cr * 0.6, cy - cr - 8);
      if (tr.prot) { ctx.fillStyle = 'rgba(255,107,138,.95)'; ctx.fillText(tr.prot + ' protected', ex - cr * 0.6, cy - cr - 8 - fs * 1.15); }
      ctx.textAlign = 'left';
    }
  }
}

// ---------- point at an animal (Watch tool): what is it, how is it doing
const SINGULAR = { grazer: 'Grazer', hunter: 'Hunter', jelly: 'Jellyfish', invader: 'Invader', turtle: 'Sea turtle', shark: 'Shark', manta: 'Manta ray' };
let inspect = null; // { a, until } : a held label (tap on touch screens); a mouse hover refreshes it every frame
function pickAnimal(x, y, r) {
  let best = null, bd = r * r;
  for (const a of S.agents) {
    if (a.dead || a.t === PLANKTON) continue;
    const d = (a.x - x) ** 2 + (a.y - y) ** 2;
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
function drawInspect(now) {
  if (tool === 'watch' && ptr.inside && ptr.mouse && !drag.on) { const a = pickAnimal(ptr.x, ptr.y, 36) || pickDeep(ptr.x, ptr.y, 36); inspect = a ? { a, until: now + 250 } : (inspect && now < inspect.until ? inspect : null); }
  if (!inspect) return;
  const a = inspect.a;
  const whale = a.pt !== undefined, deepOne = whale || a.k !== undefined; // the whale (only it has a phase timer `pt`), or an animal of the deep
  if (a.dead || now > inspect.until || tool !== 'watch' || (whale && D.whale !== a)) { inspect = null; return; }
  if (deepOne) { drawDeepInspect(a); return; }
  if (typeof coachSaw === 'function') coachSaw(a.t);
  const sp = SPECIES[a.t], sx = ox + a.x * scale, sy = oy + a.y * scale, r = Math.max(9, sp.size * RS * 1.7 * scale);
  const e = a.e / sp.max, mood = e < 0.3 ? 'starving' : e < 0.6 ? 'hungry' : 'well fed';
  const line1 = SINGULAR[sp.id] || sp.name, line2 = mood + ' · ' + fmtClock(a.age) + ' old';
  const line3 = S.game.on ? (RUN_PROTECTED[a.t] ? 'protected: catching it costs points' : sp.invasive ? 'invasive · worth ' + RUN_VAL[a.t] : 'worth ' + (RUN_VAL[a.t] === 0.5 ? '½' : RUN_VAL[a.t])) : '';
  ctx.strokeStyle = 'rgba(234,247,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.stroke();
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  const w1 = ctx.measureText(line1).width;
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
  const w = Math.max(w1, ctx.measureText(line2).width, line3 ? ctx.measureText(line3).width : 0) + 20, h = line3 ? 58 : 42;
  let bx = sx + r + 8, by = sy - h / 2;
  if (bx + w > innerWidth - 8) bx = sx - r - 8 - w;
  by = Math.max(8, Math.min(innerHeight - h - 8, by));
  ctx.fillStyle = 'rgba(6,22,36,.9)'; ctx.strokeStyle = 'rgba(140,210,230,.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 8); else ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = sp.color; ctx.beginPath(); ctx.arc(bx + 12, by + 15, 4, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#d6eef5'; ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(line1, bx + 21, by + 19);
  ctx.fillStyle = '#9fc0cc'; ctx.font = '12px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(line2, bx + 10, by + 35);
  if (line3) { ctx.fillStyle = RUN_PROTECTED[a.t] ? '#ff8aa2' : '#e8cf8c'; ctx.fillText(line3, bx + 10, by + 51); }
}

// the label for an animal of the deep (or the whale): name, how it is doing, how deep
function drawDeepInspect(a) {
  const [line1, line2] = deepLabel(a), sx = ox + a.x * scale, sy = oy + a.y * scale, r = Math.max(9, (a.k ? DEEP_SP[a.k].size * 2.2 : 90) * scale);
  ctx.strokeStyle = 'rgba(234,247,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.stroke();
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'; const w1 = ctx.measureText(line1).width;
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif'; const w = Math.max(w1, ctx.measureText(line2).width) + 20, h = 42;
  let bx = sx + r + 8, by = Math.max(8, Math.min(innerHeight - h - 8, sy - h / 2));
  if (bx + w > innerWidth - 8) bx = sx - r - 8 - w;
  ctx.fillStyle = 'rgba(6,22,36,.9)'; ctx.strokeStyle = 'rgba(140,210,230,.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 8); else ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d6eef5'; ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(line1, bx + 10, by + 19);
  ctx.fillStyle = '#9fc0cc'; ctx.font = '12px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(line2, bx + 10, by + 35);
}

function drawCursor() {
  if (!ptr.inside || (tool !== 'watch' && ptr.y > WH)) return; // the tools only reach the sunlit water
  ctx.lineWidth = 1.5;
  if (tool === 'net') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 50, 0, 6.283); ctx.stroke(); }
  else if (tool === 'pollute') { ctx.strokeStyle = 'rgba(190,130,50,.8)'; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 80, 0, 6.283); ctx.stroke(); }
  else if (tool === 'trawl') { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(0, ptr.y - 90); ctx.lineTo(WW, ptr.y - 90); ctx.moveTo(0, ptr.y + 90); ctx.lineTo(WW, ptr.y + 90); ctx.stroke(); ctx.setLineDash([]); }
  else if (tool === 'invader' || tool === 'stock') { ctx.strokeStyle = tool === 'invader' ? COL[INVADER] : COL[+document.getElementById('stockSel').value]; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 14, 0, 6.283); ctx.stroke(); }
}

let lastNow = 0, acc = 0;
function frame(now) {
  const dt = 1 / 30;
  // advance by real elapsed time, not once per screen refresh, so the pace is the same on 60 Hz and 144 Hz displays
  const real = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
  lastNow = now;
  cam.y += (cam.target - cam.y) * Math.min(1, real * 8); cam.y = clampCam(cam.y); placeCam();
  if (ptr.cx !== undefined) { const p = toWorld({ clientX: ptr.cx, clientY: ptr.cy }); ptr.x = p.x; ptr.y = p.y; } // the world moved under a still pointer
  stepLamp(real);
  if (!paused) {
    stepCatch(real * speedMul); stepSailing(real * speedMul); stepSilt(real * speedMul);
    acc += real * speedMul;
    let n = 0, stepped = 0;
    while (acc >= dt && n++ < 8) {
      acc -= dt;
      if (ptr.down && ptr.inside && ptr.y <= WH && !drag.on) {
        if (tool === 'net') netAt(ptr.x, ptr.y, 50);
        else if (tool === 'pollute') dumpAt(ptr.x, ptr.y, dt);
      }
      step(dt); stepDeep(dt);
      if (S.game.over) { paused = true; ptr.down = false; showEnd(); break; }
      stepped += dt;
    }
    stepReefFilm(stepped); stepFleet(stepped); // scene time follows the sim time actually stepped (capped at 8 steps)
    if (acc > dt) acc = 0;
  }
  ctx.fillStyle = '#02070d'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
  ctx.beginPath(); ctx.rect(0, -SKY, WW, SKY + DEEP_BOTTOM + 600); ctx.clip();
  collectCatch();
  updateMood(S.t);
  // under water, back to front; then the darkness and what glows through it; then the sky and the fleet on top
  drawWater(); drawDeepWater(S.t); drawSunlight(S.t); drawSeabed(S.t); drawPollution(S.t); drawPlumes(S.t);
  for (const a of S.agents) drawAgent(a, S.t);
  drawDeep(S.t);
  drawSnow(S.t); drawDeepSnow(S.t); drawSilt(); drawTrawlers(S.t);
  drawDark(sceneLights()); drawDeepDark(S.t); drawGlows(S.t); drawDeepGlows(S.t); drawLamp(S.t);
  drawEffects(); drawLifts(S.t);
  drawSky(S.t); drawTrawlerDecks(S.t);
  drawTags(); // after the sky: value tags can reach above the waterline
  drawRuler(); drawCursor();
  ctx.restore();
  drawInspect(now);
  updateUI();
  audioTick(now);
  requestAnimationFrame(frame);
}
