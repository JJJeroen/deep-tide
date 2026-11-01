// ---------- rendering + input ----------
const view = document.getElementById('view'), ctx = view.getContext('2d');
const COL = SPECIES.map(sp => sp.color);
let scale = 1, ox = 0, oy = 0, tool = 'watch', paused = false, speedMul = 1; // speedMul = simulated seconds per real second
const ptr = { x: 0, y: 0, down: false, inside: false };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  view.width = innerWidth * dpr; view.height = innerHeight * dpr;
  scale = Math.min(innerWidth / WW, innerHeight / WH);
  ox = (innerWidth - WW * scale) / 2; oy = (innerHeight - WH * scale) / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

function toWorld(e) { return { x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale }; }

const glowCache = {};
function glow(color) {
  if (glowCache[color]) return glowCache[color];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color + 'cc'); gr.addColorStop(0.4, color + '33'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return glowCache[color] = c;
}

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, WH);
  g.addColorStop(0, '#0d5d82'); g.addColorStop(0.35, '#073a57'); g.addColorStop(1, '#010a12');
  ctx.fillStyle = g; ctx.fillRect(0, 0, WW, WH);
  // slow light shafts; fouled water swallows them
  const lk = 0.10 * (1 - Math.min(0.85, S.avgPoll * 6));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = ((i * 290 + t * 6 * (1 + i % 3 * 0.3)) % (WW + 400)) - 200, w = 90 + i * 22;
    const lg = ctx.createLinearGradient(0, 0, 0, WH * 0.7);
    lg.addColorStop(0, `rgba(150,220,255,${lk})`); lg.addColorStop(1, 'rgba(150,220,255,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 2.2 - 180, WH * 0.7); ctx.lineTo(x - 140, WH * 0.7); ctx.fill();
  }
  ctx.restore();
  // seabed
  ctx.fillStyle = '#04101a'; ctx.beginPath(); ctx.moveTo(0, WH);
  for (let x = 0; x <= WW; x += 40) ctx.lineTo(x, WH - 14 - Math.sin(x * 0.011) * 8 - Math.sin(x * 0.031) * 4);
  ctx.lineTo(WW, WH); ctx.fill();
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
  if (sp.shape === 'jelly') { // upright, never rotated, with a soft bloom behind it
    const cyc = t * spr.beat + a.phase / TAU;
    const frame = spr.frames[Math.floor((((cyc % 1) + 1) % 1) * spr.frames.length)];
    ctx.globalAlpha = 0.78 * (1 - 0.3 * dep);
    ctx.drawImage(glow(sp.color), a.x - 26 * RS, a.y - 26 * RS, 52 * RS, 52 * RS);
    ctx.globalAlpha = 1 - 0.24 * dep;
    ctx.drawImage(frame, a.x + spr.x0 * RS, a.y + spr.y0 * RS, spr.w * RS, spr.h * RS);
    ctx.globalAlpha = 1;
    return;
  }
  const set = spr.tints[Math.min(spr.tints.length - 1, Math.floor(dep * spr.tints.length))];
  const left = a.vx < 0;
  // pitch is clamped near horizontal; the belly-down flip keeps left-swimmers upright
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(a.vy, Math.abs(a.vx) || 1e-6)));
  const spd = Math.min(1.6, Math.hypot(a.vx, a.vy) / sp.speed);
  const cyc = t * spr.beat * (0.7 + 0.55 * spd) + a.phase / TAU;
  const frame = set[Math.floor((((cyc % 1) + 1) % 1) * set.length)];
  const k = (1 - 0.08 * dep) * RS;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate((left ? Math.PI : 0) + pitch);
  if (left) ctx.scale(1, -1);
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
    const tr = S.trawlers.find(tr => e.x >= tr.x - 40 && e.x <= tr.x + 15 && Math.abs(e.y - tr.y) <= tr.band + 1);
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

// The trawler: a hull at the surface (seen from below), warps down to the otter boards that hold the net mouth open,
// and a cone net whose codend swells with what it takes. The net mouth is exactly the band the sim sweeps (tr.x, tr.y +- band).
function drawTrawlers(t) {
  for (const tr of S.trawlers) {
    const mouth = tr.x, bx = tr.x + 230, len = 250, top = tr.y - tr.band, bot = tr.y + tr.band, cy = tr.y;
    // warps
    ctx.strokeStyle = 'rgba(16,24,30,.85)'; ctx.lineWidth = 1.6;
    for (const y of [top, bot]) { ctx.beginPath(); ctx.moveTo(bx - 72, 10); ctx.quadraticCurveTo(bx - 70, y * 0.55, mouth + 5, y); ctx.stroke(); }
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
    // hull seen from below, with prop wash behind it
    ctx.fillStyle = '#060c11';
    ctx.beginPath(); ctx.moveTo(bx - 84, 0); ctx.lineTo(bx + 76, 0); ctx.quadraticCurveTo(bx + 66, 13, bx + 34, 18); ctx.lineTo(bx - 74, 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(220,240,248,.35)';
    for (let k = 0; k < 18; k++) { const u = ((k * 37 + t * 60) % 140); ctx.beginPath(); ctx.arc(bx - 84 - u, 8 + ((k * 13) % 14), 1 + (k % 3) * 0.6, 0, 6.283); ctx.fill(); }
    // in the scored run, what this pass is worth
    if (S.game.on && tr.catch) {
      const fs = Math.max(15, 12 / scale);
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(240,214,140,.95)'; ctx.fillText('+' + Math.round((tr.value || 0) * 2) / 2, ex - cr * 0.6, cy - cr - 8);
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
  if (tool === 'watch' && ptr.inside && ptr.mouse) { const a = pickAnimal(ptr.x, ptr.y, 36); inspect = a ? { a, until: now + 250 } : (inspect && now < inspect.until ? inspect : null); }
  if (!inspect) return;
  const a = inspect.a;
  if (a.dead || now > inspect.until || tool !== 'watch') { inspect = null; return; }
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
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = sp.color; ctx.beginPath(); ctx.arc(bx + 12, by + 15, 4, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#d6eef5'; ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(line1, bx + 21, by + 19);
  ctx.fillStyle = '#9fc0cc'; ctx.font = '12px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(line2, bx + 10, by + 35);
  if (line3) { ctx.fillStyle = RUN_PROTECTED[a.t] ? '#ff8aa2' : '#e8cf8c'; ctx.fillText(line3, bx + 10, by + 51); }
}

function drawCursor() {
  if (!ptr.inside) return;
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
  if (!paused) {
    stepCatch(real * speedMul);
    acc += real * speedMul;
    let n = 0;
    while (acc >= dt && n++ < 8) {
      acc -= dt;
      if (ptr.down && ptr.inside) {
        if (tool === 'net') netAt(ptr.x, ptr.y, 50);
        else if (tool === 'pollute') dumpAt(ptr.x, ptr.y, dt);
      }
      step(dt);
      if (S.game.over) { paused = true; ptr.down = false; showEnd(); break; }
    }
    if (acc > dt) acc = 0;
  }
  ctx.fillStyle = '#02070d'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
  ctx.beginPath(); ctx.rect(0, 0, WW, WH); ctx.clip();
  collectCatch();
  drawBackground(S.t);
  drawPollution(S.t);
  for (const a of S.agents) drawAgent(a, S.t);
  drawEffects(); drawTrawlers(S.t); drawLifts(S.t); drawTags(); drawCursor();
  ctx.restore();
  drawInspect(now);
  updateUI();
  requestAnimationFrame(frame);
}
