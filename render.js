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
  // slow light shafts
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = ((i * 290 + t * 6 * (1 + i % 3 * 0.3)) % (WW + 400)) - 200, w = 90 + i * 22;
    const lg = ctx.createLinearGradient(0, 0, 0, WH * 0.7);
    lg.addColorStop(0, 'rgba(150,220,255,0.10)'); lg.addColorStop(1, 'rgba(150,220,255,0)');
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
function drawPollution() {
  const d = pollImg.data; let any = false;
  for (let i = 0; i < S.poll.length; i++) {
    const v = S.poll[i], o = i * 4;
    d[o] = 78; d[o + 1] = 52; d[o + 2] = 18; d[o + 3] = v > 0.02 ? Math.min(190, v * 205) : 0;
    if (d[o + 3]) any = true;
  }
  if (!any) return;
  pollCtx.putImageData(pollImg, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(pollCanvas, 0, 0, GCOLS * GC, GROWS * GC);
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
    if (e.kind === 0) continue;
    ctx.strokeStyle = e.kind === 2 ? `rgba(255,255,255,${0.6 * (1 - k)})` : `rgba(255,120,80,${0.7 * (1 - k)})`;
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(e.x, e.y, 3 + k * 14, 0, 6.283); ctx.stroke();
  }
}

function drawTrawlers() {
  for (const tr of S.trawlers) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(tr.x - 16, tr.y - 10, 32, 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tr.x - 16, tr.y - tr.band); ctx.lineTo(tr.x - 16, tr.y + tr.band);
    for (let i = -3; i <= 3; i++) { ctx.moveTo(tr.x - 16, tr.y + i * tr.band / 3); ctx.lineTo(tr.x - 150, tr.y + i * tr.band / 3 * 0.8); }
    ctx.stroke();
  }
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
  drawBackground(S.t);
  drawPollution();
  for (const a of S.agents) drawAgent(a, S.t);
  drawEffects(); drawTrawlers(); drawCursor();
  ctx.restore();
  updateUI();
  requestAnimationFrame(frame);
}
