// ---------- rendering + input ----------
// ctx is where every draw function paints: the screen, or for one frame the photo's own canvas (renderPhoto)
const view = document.getElementById('view'), viewCtx = view.getContext('2d');
let ctx = viewCtx;
const COL = SPECIES.map(sp => sp.color);
let scale = 1, ox = 0, oy = 0, tool = 'watch', paused = false, speedMul = 1; // speedMul = simulated seconds per real second
let photo = null; // photo mode (ui.js enterPhoto): { wasPaused }; the scene is drawn without labels, ruler or cursor
const ptr = { x: 0, y: 0, down: false, inside: false };
const drag = { on: false, sx: 0, sy: 0, cx: 0, cy: 0 }; // dragging with the Watch tool moves the camera

// Camera: the world is a tall column (sky, the sunlit sim, the deep down to the abyssal floor). cam.y is the world y at the
// top of the view; scrolled to the top, the view is exactly the sunlit scene. oy stays the screen position of world y = 0
// (the surface) and moves with the camera, so everything that maps screen <-> world keeps working.
// On a narrow screen (a phone held upright) the whole width would leave the animals a few pixels long, so the sunlit scene
// fills the height instead and the camera pans sideways: panMode, cam.x is the world x at the left of the view, ox follows it.
const cam = { x: 0, tx: 0, y: -SKY, target: -SKY };
let panMode = false;
const FOLLOW = { a: null, p: 0, fx: 0, fy: 0, deadFor: 0, lift: null, Z: 2, cardH: 0 }; // follow one animal (below)
let baseScale = 1; // the fitted scale: `scale` is this, times the follow zoom (stepFollow)
// Screen space the panels take: on a portrait phone the column starts below the species panel (as the sea did before),
// and the camera always scrolls far enough that the abyssal floor clears the toolbar.
// On a portrait phone the species panel is folded to a strip (index.html); opened, it lies over the water and the
// column stays where the strip put it.
let topReserve = 0, barH = 0, stripBottom = 0, titleFit = 0, fitKey = '', panelsNow = 0;
function measureChrome() {
  const bar = document.getElementById('bar'), st = document.getElementById('stats'), db = document.getElementById('depthBtn');
  const tt = document.getElementById('title'), hint = document.getElementById('hint'), portrait = innerWidth <= 760 && innerHeight > innerWidth && st && tt;
  barH = bar ? bar.offsetHeight + 12 : 0; // read everything first, then write, so no extra layout is forced
  const titleR = portrait ? tt.getBoundingClientRect() : null, more = innerWidth <= 760 && bar && bar.classList.contains('more'), hintH = hint ? hint.offsetHeight : 0;
  // the species strip takes the width the title leaves; set before the strip is measured, since its width sets its height
  // (a run's wider title panel narrows it, and the Biodiversity / Water line wraps)
  const mw = portrait ? Math.max(150, Math.round(innerWidth - titleR.right - 20)) + 'px' : ''; // clear of the title
  if (st && st.style.maxWidth !== mw) st.style.maxWidth = mw;
  // both top panels are measured when the scale is fitted: a warning that grows the run's panel later, or an invader's row
  // in the strip, lies over the sky instead of pushing the reef under the toolbar
  const refit = !more && !fitKey;
  if (portrait && (refit || !titleFit)) titleFit = titleR.bottom;
  if (portrait && (refit || !stripBottom)) { // measured folded and at the surface: open, or in the deep, it is another height
    const cls = ['open', 'deepview'].filter(c => st.classList.contains(c));
    st.classList.remove(...cls); stripBottom = st.getBoundingClientRect().bottom; st.classList.add(...cls);
  }
  topReserve = portrait ? Math.round(Math.max(titleFit, stripBottom)) + 6 : 0;
  // where the panels end now (a run's panel grows with its warnings): the pan track stays visible below them
  panelsNow = portrait ? Math.round(Math.max(titleR.bottom, st.classList.contains('open') ? 0 : st.getBoundingClientRect().bottom)) + 6 : 0;
  const bottom = (barH + 6) + 'px'; if (db && db.style.bottom !== bottom) db.style.bottom = bottom; // just above the toolbar
  // The scale is fitted once per window size and per mode (resize, ui.js newGame clear fitKey), to the toolbar as it
  // stands with More folded: on a narrow screen with the hint folded to its one line (it opens over the water for a while,
  // ui.js showHint), elsewhere with the hint at least one line tall (it changes with the tool; a new mode starts on Watch).
  // Unfolding More, picking a tool or a warning growing the run's panel never zooms the ocean mid-game (the column only
  // shifts, as it always did).
  if (refit) {
    fitKey = 'fit';
    let fitBar = barH + Math.max(0, 17 - hintH);
    if (innerWidth <= 760 && hint && hint.classList.contains('full')) { hint.classList.remove('full'); fitBar = bar.offsetHeight + 12; hint.classList.add('full'); }
    else if (innerWidth <= 760) fitBar = barH;
    fitScale(topReserve, fitBar);
  }
  // photo mode: the panels are hidden, so the column starts at the top of the screen; the fit above still counts them, so
  // coming back from a photo never rescales the ocean (it only shifts back down)
  if (photo) topReserve = 0;
}
// world y that clears the toolbar with the camera at the top: the reef shelf and a band of rock under it
const FRAME_Y = 820;
let fitW0 = 0; // the window width the last fit used
function fitScale(top, bar) {
  scale = baseScale; // a zoomed view (follow) is not what is being fitted
  const fitW = innerWidth / WW, fitAll = Math.max(0.05, (innerHeight - top) / (SKY + WH));
  const fitH = Math.max(0.05, (innerHeight - top - bar) / (SKY + FRAME_Y)); // the reef shelf clear of the toolbar
  const was = panMode, mid = was ? cam.x + fitW0 / scale / 2 : 0;
  // a phone held upright, where the whole width would draw the ocean at well under two thirds of the height's size
  // (tablets and desktop windows keep the whole width, as the brief has it)
  panMode = innerWidth <= 760 && fitW < fitH * 0.6;
  // on a short screen (a phone on its side) clearing the toolbar would shrink everything by a quarter: there it may cover
  // the seabed, as it always did
  scale = panMode ? fitH : Math.min(fitW, fitH >= fitAll * 0.85 ? fitH : fitAll);
  // keep the middle of the view where it was; coming into pan mode, start at the reef on the left
  if (panMode) cam.x = cam.tx = clampCamX(was ? mid - innerWidth / scale / 2 : 0);
  fitW0 = innerWidth;
  // the Watch hint mentions dragging only in pan mode; it changes the toolbar's height, so fit once more
  if (was !== panMode && typeof setTool === 'function') { setTool(tool); fitKey = ''; }
  baseScale = scale; ox = panMode ? -cam.x * scale : (innerWidth - WW * scale) / 2;
  cam.y = clampCam(cam.y); cam.target = clampCam(cam.target); placeCam();
}
const camMax = () => Math.max(-SKY, DEEP_BOTTOM - (innerHeight - barH - 10 - topReserve) / scale);
const clampCam = y => Math.max(-SKY, Math.min(camMax(), y));
const camMaxX = () => panMode ? Math.max(0, WW - innerWidth / scale) : 0;
const clampCamX = x => Math.max(0, Math.min(camMaxX(), x));
function placeCam() { oy = topReserve - cam.y * scale; if (panMode) ox = -cam.x * scale; }
// stereo position of a world x as the player sees it: left of the view -1, right +1
const panAt = x => Math.max(-1, Math.min(1, (ox + x * scale) / innerWidth * 2 - 1));
function resize() {
  if (typeof endFollow === 'function') endFollow(true); // the fit below is of the whole view
  const dpr = window.devicePixelRatio || 1;
  view.width = innerWidth * dpr; view.height = innerHeight * dpr;
  // always refits on a new window size, with the More drawer folded (it holds the fit back while open)
  const bar = document.getElementById('bar'); if (bar) bar.classList.remove('more');
  const mb = document.getElementById('moreBtn'); if (mb) mb.setAttribute('aria-expanded', 'false');
  fitKey = ''; measureChrome();
  viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

// runoff: fertilised water turns pea green; water short of oxygen goes a dead, bruised grey (same one-pixel-per-cell trick)
const runCanvas = document.createElement('canvas'); runCanvas.width = GCOLS; runCanvas.height = GROWS;
const runCtx = runCanvas.getContext('2d'), runImg = runCtx.createImageData(GCOLS, GROWS);
const runBloom = new Float32Array(GCOLS * GROWS);
// under the animals: fertilised water and the bloom itself (counted per cell) go pea green
function drawRunoff() {
  if (!S.wqOn) return;
  runBloom.fill(0);
  for (const a of S.agents) if (a.bloom && !a.dead) runBloom[pollIdx(a.x, a.y)]++;
  const d = runImg.data;
  for (let i = 0; i < S.nutr.length; i++) {
    const o = i * 4, g = Math.min(1, S.nutr[i] * 3 + runBloom[i] / 6);
    d[o] = 104; d[o + 1] = 168; d[o + 2] = 56; d[o + 3] = g * 130;
  }
  paintGrid();
}
// Water short of oxygen, over the darkness: the colour drains out of it, whatever the water's tint (blue, a green bloom,
// night), and it goes a heavy dark grey with a defined top, the layer a diver sees, with flecks of rot sinking through it.
// Labelled.
const rotRnd = seeded(73), ROTFLECKS = Array.from({ length: 220 }, () => ({ x: rotRnd() * WW, y: rotRnd() * WH, v: 4 + rotRnd() * 7, ph: rotRnd() * 6.283, w: 1 + rotRnd() * 1.8 })); // own sequence: leaves Math.random to the rest
const DZ = new Float32Array(GCOLS * GROWS); // how dead each cell looks, 0..1
let rotLast = 0;
function drawDeadZone() {
  if (!S.wqOn || S.avgHyp <= 0) return;
  const d = runImg.data, sat = oxySat(), ok = Math.min(OXY.ok, sat);
  let wx = 0, wy = 0, w = 0;
  for (let i = 0; i < S.odef.length; i++) {
    const o = i * 4, ox = sat - S.odef[i], h = Math.max(0, Math.min(1, (ok - ox) / (ok - 0.1))), m = h * h * (3 - 2 * h);
    DZ[i] = m; d[o] = 34; d[o + 1] = 35; d[o + 2] = 37; d[o + 3] = m * 255;
    if (ox < OXY.low) { wx += (i % GCOLS + 0.5) * GC; wy += ((i / GCOLS | 0) + 0.5) * GC; w++; }
  }
  runCtx.putImageData(runImg, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.92; ctx.drawImage(runCanvas, 0, 0, GCOLS * GC, GROWS * GC); // grey, not olive
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = DZ_DARK; ctx.drawImage(runCanvas, 0, 0, GCOLS * GC, GROWS * GC);  // and dark
  ctx.restore();
  drawDeadTop();
  // rot sinking through it: pale flecks, only where the water is dead
  const dt = Math.min(0.1, Math.max(0, S.t - rotLast)); rotLast = S.t;
  ctx.fillStyle = 'rgb(196,188,166)';
  for (const f of ROTFLECKS) {
    f.y += f.v * dt; f.x += Math.sin(S.t * 0.4 + f.ph) * 2 * dt; if (f.y > WH) { f.y = 0; f.x = rotRnd() * WW; }
    const a = DZ[Math.min(GROWS - 1, f.y / GC | 0) * GCOLS + Math.min(GCOLS - 1, Math.max(0, f.x / GC | 0))];
    if (a < 0.15) continue;
    ctx.globalAlpha = a * 0.55; ctx.fillRect(f.x, f.y, f.w, f.w);
  }
  ctx.globalAlpha = 1;
  if (w >= 6 && !photo) {
    const fs = Math.max(13, 12 / scale);
    ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 / scale; ctx.strokeStyle = 'rgba(2,7,13,.7)'; ctx.strokeText('dead zone · no oxygen', wx / w, wy / w);
    ctx.fillStyle = 'rgba(240,234,226,.95)'; ctx.fillText('dead zone · no oxygen', wx / w, wy / w); ctx.textAlign = 'left';
  }
}
const DZ_DARK = 0.66;
// the edges of the dead water: in each column, where it turns dead going down (DZ crosses one half between two cells),
// and where it ends again above the seabed, the floor of the layer (fainter); a pale line that sways a little over a soft
// band. No top edge where the dead water reaches the surface, no floor where it reaches the seabed.
function drawDeadTop() {
  const tops = [], floors = []; let drawn = 0;
  const cross = (c, r) => { const m0 = DZ[(r - 1) * GCOLS + c], m = DZ[r * GCOLS + c]; return (r - 0.5 + (0.5 - m0) / (m - m0)) * GC; };
  const flush = (pts, k) => { if (pts.length) { strokeDeadTop(pts, k); drawn += pts.length; } pts.length = 0; };
  for (let c = 0; c <= GCOLS; c++) {
    let top = null, floor = null;
    if (c < GCOLS && DZ[c] < 0.5) {
      let r = 1; while (r < GROWS && DZ[r * GCOLS + c] < 0.5) r++;
      if (r < GROWS) {
        top = cross(c, r);
        while (r < GROWS && DZ[r * GCOLS + c] >= 0.5) r++;
        const x = (c + 0.5) * GC;
        if (r < GROWS) { const y = cross(c, r); if (y < bedAt(x) - 12) floor = y; }
      }
    }
    if (top !== null) tops.push([(c + 0.5) * GC, top]); else flush(tops, 1);
    if (floor !== null) floors.push([(c + 0.5) * GC, floor]); else flush(floors, 0.55);
  }
  return drawn; // columns with an edge (the smoke test reads it)
}
function strokeDeadTop(pts, k) {
  // a layer, not a drawn line: soft, swaying, and stronger in some places than others
  const t = S.t, Y = (x, y) => y + Math.sin(x * 0.011 + t * 0.45) * 2.5, A = x => 0.55 + 0.45 * Math.sin(x * 0.017 + t * 0.2 + Math.sin(x * 0.005) * 2);
  const ends = [[pts[0][0] - GC / 2, pts[0][1]], ...pts, [pts[pts.length - 1][0] + GC / 2, pts[pts.length - 1][1]]];
  const seg = i => { const [xa, ya] = ends[i - 1], [x, y] = ends[i], [xb, yb] = ends[i + 1]; ctx.quadraticCurveTo(x, Y(x, y), (x + xb) / 2, Y((x + xb) / 2, (y + yb) / 2)); };
  const from = i => { const [xa, ya] = ends[i - 1], [x, y] = ends[i]; ctx.moveTo((xa + x) / 2, Y((xa + x) / 2, (ya + y) / 2)); };
  ctx.save(); ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(150,150,146,${(0.06 * k).toFixed(3)})`; ctx.lineWidth = 22; // a soft band, one stroke so it does not bead
  ctx.beginPath(); from(1); for (let i = 1; i < ends.length - 1; i++) seg(i); ctx.stroke();
  ctx.lineWidth = Math.max(1.6, 1.2 / scale);
  for (let i = 1; i < ends.length - 1; i++) {
    ctx.strokeStyle = `rgba(205,203,195,${(0.27 * k * A(ends[i][0])).toFixed(3)})`;
    ctx.beginPath(); from(i); seg(i); ctx.stroke();
  }
  ctx.restore();
}
function paintGrid() {
  runCtx.putImageData(runImg, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(runCanvas, 0, 0, GCOLS * GC, GROWS * GC);
}

// Fish hold a near-horizontal pitch: rotating straight into a vertical dive made them look like arrows.
const MAX_PITCH = 0.45;
// Animals are drawn larger than their sim size so a player can tell a hunter from a grazer at a glance.
// Draw scale only: reach, vision and every other sim distance are unchanged.
const RS = 1.3;

function drawAgent(a, t) {
  const sp = SPECIES[a.t];
  if (sp.plant) { ctx.fillStyle = a.bloom ? 'rgba(196,222,92,0.7)' : 'rgba(143,227,160,0.65)'; ctx.fillRect(a.x - 1, a.y - 1, 2.2, 2.2); return; } // bloom algae: yellower
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
    if (typeof coachCatch === 'function') coachCatch(e.sp, !!tr, !!(tr && tr.company));
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
// where a hauled animal is (the camera of Follow rides up with it)
function liftPos(l, t) { const p = Math.min(1, l.t / 1.2); return { x: l.x + Math.sin(t * 3 + l.ph) * 3 * (1 - p), y: l.y * (1 - p * p) }; }
function drawLifts(t) {
  for (const l of LIFTS) {
    const p = Math.min(1, l.t / 1.2), { x, y } = liftPos(l, t);
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
    if (tr.y + tr.band > by && !inMpa(mx)) for (let k = 0; k < 2; k++) SILT.push({ x: mx - Math.random() * 30, y: by - Math.random() * 6, vx: (Math.random() - 0.7) * 10, vy: -4 - Math.random() * 8, r: 6 + Math.random() * 8, t: 0, life: 4 + Math.random() * 4 });
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

// ghost nets (sim.js S.ghosts): a torn, pale piece of mesh with a few floats, swaying as it drifts, with what it caught
// hanging in it. Each net gets its own ragged outline and holes (render-only, kept per net object).
const GHOST_SHAPE = new WeakMap();
function ghostShape(gn) {
  let sh = GHOST_SHAPE.get(gn);
  if (!sh) {
    const r = seeded((gn.x * 7919 + gn.y * 104729) | 0);
    sh = { rim: Array.from({ length: 14 }, (_, i) => ({ a: i / 14 * 6.283, k: 0.62 + r() * 0.45 })), holes: Array.from({ length: 60 }, () => r() < 0.28), floats: Array.from({ length: 4 }, () => -0.8 + r() * 1.6) };
    GHOST_SHAPE.set(gn, sh);
  }
  return sh;
}
function drawGhosts(t) {
  for (const gn of S.ghosts) drawGhost(gn, t, gn.x, gn.y);
  // hauled-up nets rise on a line to the surface and are gone
  for (const h of HAULED) {
    const p = Math.min(1, h.t / 1.6), y = h.gn.y * (1 - p * p * (3 - 2 * p));
    ctx.strokeStyle = `rgba(230,240,245,${0.4 * (1 - p)})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(h.gn.x, y - GHOST.h * 0.7); ctx.lineTo(h.gn.x, 0); ctx.stroke();
    ctx.globalAlpha = 1 - p * p; drawGhost(h.gn, t, h.gn.x, y, 0.55); ctx.globalAlpha = 1;
  }
}
const HAULED = []; // { gn, t }: nets the player hauled up (ui.js haulGhost), drawn rising for 1.6 s
function stepHauled(dt) { for (const h of HAULED) h.t += dt; while (HAULED.length && HAULED[0].t > 1.6) HAULED.shift(); }
function drawGhost(gn, t, gx, gy, squeeze = 1) {
  {
    const sh = ghostShape(gn), fray = Math.max(0, 1 - gn.age / GHOST.life), a = 0.25 + 0.5 * fray, W = GHOST.w * (0.6 + 0.4 * squeeze), H = GHOST.h * squeeze;
    ctx.save(); ctx.translate(gx, gy);
    const pt = (p, i) => ({ x: Math.cos(p.a) * W * p.k + Math.sin(t * 0.7 + i) * 2.5, y: Math.sin(p.a) * H * p.k + Math.cos(t * 0.6 + i * 1.3) * 2 });
    const rim = sh.rim.map(pt);
    ctx.beginPath(); rim.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgba(200,210,205,${0.06 * a})`; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = `rgba(215,222,215,${0.55 * a})`; ctx.lineWidth = 0.8;
    let h = 0;
    for (let x = -W; x <= W; x += 9) { if (sh.holes[h++ % 60]) continue; ctx.beginPath(); ctx.moveTo(x, -H); ctx.quadraticCurveTo(x + Math.sin(t + x) * 3, 0, x - 4, H); ctx.stroke(); }
    for (let y = -H; y <= H; y += 8) { if (sh.holes[h++ % 60]) continue; ctx.beginPath(); ctx.moveTo(-W, y); ctx.quadraticCurveTo(0, y + Math.sin(t * 0.8 + y) * 3, W, y + 3); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = `rgba(225,230,222,${0.7 * a})`; ctx.lineWidth = 1.3; // the torn rope edge, with loose ends
    ctx.beginPath(); rim.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    for (let i = 0; i < 3; i++) { const p = rim[i * 4 + 2]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x * 1.3, p.y * 1.3 + 8, p.x * 1.45 + Math.sin(t + i) * 4, p.y * 1.4 + 16); ctx.stroke(); }
    for (const f of sh.floats) { ctx.fillStyle = `rgba(232,128,62,${0.85 * a})`; ctx.beginPath(); ctx.arc(f * W * 0.7, -H * 0.72 + Math.sin(t + f * 5) * 1.5, 3.2, 0, 6.283); ctx.fill(); }
    for (const c of gn.held) { // the catch nobody will haul up
      const spr = SPRITES[c.t]; if (!spr) continue;
      const fr = spr.tints[Math.min(2, spr.tints.length - 1)][0], k = RS * 0.85;
      ctx.save(); ctx.translate(Math.max(-W * 0.7, Math.min(W * 0.7, c.dx)), Math.max(-H * 0.6, Math.min(H * 0.6, c.dy))); ctx.rotate(c.ang + 0.6); ctx.globalAlpha = 0.45 + 0.4 * fray;
      ctx.drawImage(fr, spr.x0 * k, spr.y0 * k, spr.w * k, spr.h * k); ctx.restore();
    }
    ctx.restore();
  }
}

// ---------- protected area (sim.js S.mpa): a faint strip from the surface to the floor, its edges marked by lines of
// light, and yellow marker buoys at the surface (drawMpaBuoys, after the sky). The Protected-area tool previews its strip.
function mpaPreview() {
  if (tool !== 'reserve' || !ptr.inside || ptr.y > WH || photo) return null;
  return ptr.mpa ? mpaRange(ptr.mpa.x0, ptr.mpa.x1) : mpaRange(ptr.x, ptr.x);
}
function drawMpaStrip(m, a, t) {
  const g = ctx.createLinearGradient(0, 0, 0, WH);
  g.addColorStop(0, `rgba(120,230,210,${0.08 * a})`); g.addColorStop(1, `rgba(120,230,210,${0.02 * a})`);
  ctx.fillStyle = g; ctx.fillRect(m.x0, 0, m.x1 - m.x0, WH);
  ctx.strokeStyle = `rgba(150,240,220,${0.35 * a})`; ctx.lineWidth = 1.5; ctx.setLineDash([3, 9]); ctx.lineDashOffset = -t * 6;
  for (const x of [m.x0, m.x1]) { if (x <= 0 || x >= WW) continue; ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, Math.min(WH, bedAt(x))); ctx.stroke(); }
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}
function drawMpa(t) {
  if (S.mpa) drawMpaStrip(S.mpa, 1, t);
  const pv = mpaPreview();
  if (pv && !(S.mpa && !ptr.mpa && inMpa(ptr.x))) drawMpaStrip(pv, ptr.mpa ? 1.4 : 0.6, t);
}
function drawMpaBuoys(t) {
  const m = S.mpa; if (!m) return;
  const fs = Math.max(13, 11 / scale);
  for (const x of [m.x0, m.x1]) {
    const bx = Math.max(14, Math.min(WW - 14, x)), by = surfY(bx, t), tilt = Math.sin(t * 1.3 + bx) * 0.08;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(tilt);
    ctx.fillStyle = '#e8c547'; ctx.fillRect(-3, -26, 6, 30); // spar
    ctx.fillStyle = '#d9b02e'; ctx.beginPath(); ctx.ellipse(0, 2, 9, 5, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#e8c547'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-6, -36); ctx.lineTo(6, -26); ctx.moveTo(6, -36); ctx.lineTo(-6, -26); ctx.stroke(); // the yellow X of a special mark
    ctx.restore();
  }
  if (photo) return;
  ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'left'; // at the edge: the log is centred above the water
  ctx.fillStyle = 'rgba(170,245,228,.8)'; ctx.fillText('PROTECTED', m.x0 + 14, 30);
}

// The trawler: a hull at the surface (seen from below), warps down to the otter boards that hold the net mouth open,
// and a cone net whose codend swells with what it takes. The net mouth is exactly the band the sim sweeps (tr.x, tr.y +- band).
// over a protected area the skipper hauls the net up to just under the hull (the sim takes nothing there). It rises over the
// first 50 px inside the strip and is back down at its far edge, so the drawn net is never raised where the sim still fishes.
function netShape(tr) {
  const m = S.mpa, lift = m ? smoothstep(m.x0, m.x0 + 50, tr.x) * (1 - smoothstep(m.x1 - 50, m.x1, tr.x)) : 0;
  const band = tr.band * (1 - 0.7 * lift);
  return { cy: tr.y + (band + 30 - tr.y) * lift, band };
}
function drawTrawlers(t) {
  for (const tr of S.trawlers.concat(SAILING)) {
    const ns = netShape(tr), mouth = tr.x, bx = tr.x + 230, len = 250, cy = ns.cy, top = cy - ns.band, bot = cy + ns.band;
    // warps
    ctx.strokeStyle = 'rgba(16,24,30,.85)'; ctx.lineWidth = 1.6;
    for (const y of [top, bot]) { ctx.beginPath(); ctx.moveTo(bx + WARP_FROM.x, WARP_FROM.y); ctx.quadraticCurveTo(bx + WARP_FROM.x, y * 0.55, mouth + 5, y); ctx.stroke(); } // from the gantry block
    // net: hoops narrowing toward the codend, and the long lines between them
    const ex = mouth - len, fill = Math.min(1, (tr.catch || 0) / 40), cr = 10 + fill * 28;
    ctx.strokeStyle = 'rgba(225,232,236,.42)'; ctx.lineWidth = 1;
    for (let j = 0; j <= 6; j++) { const f = j / 6, x = mouth - f * len, r = ns.band * (1 - f * 0.86); ctx.beginPath(); ctx.ellipse(x, cy, 3 + 9 * (1 - f), r, 0, 0, 6.283); ctx.stroke(); }
    for (let j = -4; j <= 4; j++) {
      ctx.beginPath(); ctx.moveTo(mouth, cy + j * ns.band / 4);
      ctx.quadraticCurveTo(mouth - len * 0.5, cy + j * ns.band / 4 * 0.5 + Math.sin(t * 3 + j) * 2, ex, cy + j * 2.5); ctx.stroke();
    }
    // excluder: a slanted grid of bars across the net, with the escape opening above it
    if (tr.excl) {
      const gx = mouth - len * 0.45, r = ns.band * (1 - 0.45 * 0.86);
      ctx.strokeStyle = 'rgba(232,200,96,.8)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(gx + r * 0.35, cy - r); ctx.lineTo(gx - r * 0.35, cy + r); ctx.stroke();
      ctx.lineWidth = 1;
      for (let k = -3; k <= 3; k++) { const f = k / 4; ctx.beginPath(); ctx.moveTo(gx - f * r * 0.35 - 8, cy + f * r); ctx.lineTo(gx - f * r * 0.35 + 8, cy + f * r); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(232,200,96,.45)'; ctx.beginPath(); ctx.ellipse(gx + r * 0.3, cy - r * 0.95, 12, 4, 0, 0, 6.283); ctx.stroke();
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
    if (S.game.on && (tr.catch || tr.company) && !photo) {
      const fs = Math.max(15, 12 / scale);
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = tr.company ? 'rgba(200,210,218,.95)' : 'rgba(240,214,140,.95)';
      ctx.fillText(tr.company ? 'Head office' : '+' + Math.round((tr.value || 0) * 2) / 2, ex - cr * 0.6, cy - cr - 8);
      if (tr.prot) { ctx.fillStyle = 'rgba(255,107,138,.95)'; ctx.fillText(tr.prot + ' protected', ex - cr * 0.6, cy - cr - 8 - fs * 1.15); }
      if (tr.escProt) { ctx.fillStyle = 'rgba(232,200,96,.95)'; ctx.fillText(tr.escProt + ' let out', ex - cr * 0.6, cy - cr - 8 - fs * 1.15 * (tr.prot ? 2 : 1)); }
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
function moodOf(a) {
  const sp = SPECIES[a.t], e = a.e / sp.max, low = S.wqOn && oxyAt(a.x, a.y) < OXY.low;
  return low && sp.hypoxia !== false ? 'gasping: no oxygen here' : (e < 0.3 ? 'starving' : e < 0.6 ? 'hungry' : 'well fed') + (low ? ', fine without oxygen' : '');
}
function drawInspect(now) {
  if (FOLLOW.a) { inspect = null; return; } // the card of Follow says it all
  if (tool === 'watch' && ptr.inside && ptr.mouse && !drag.on && !ghostAt(ptr.x, ptr.y, 10)) { const a = pickAnimal(ptr.x, ptr.y, 36) || pickDeep(ptr.x, ptr.y, 36); inspect = a ? { a, until: now + 250 } : (inspect && now < inspect.until ? inspect : null); }
  if (!inspect) return;
  const a = inspect.a;
  const whale = a.pt !== undefined, deepOne = whale || a.k !== undefined; // the whale (only it has a phase timer `pt`), or an animal of the deep
  if (a.dead || now > inspect.until || tool !== 'watch' || (whale && D.whale !== a)) { inspect = null; return; }
  if (deepOne) { drawDeepInspect(a); return; }
  if (typeof coachSaw === 'function') coachSaw(a.t);
  const sp = SPECIES[a.t], sx = ox + a.x * scale, sy = oy + a.y * scale, r = Math.max(9, sp.size * RS * 1.7 * scale);
  const mood = moodOf(a);
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
  if (tool === 'watch' && ptr.mouse && !drag.on) {
    const gn = ghostAt(ptr.x, ptr.y, 10);
    if (gn) {
      ctx.strokeStyle = 'rgba(234,247,255,.8)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(gn.x, gn.y, GHOST.w + 10, GHOST.h + 10, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      const fs = Math.max(14, 12 / scale);
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(234,247,255,.95)';
      ctx.fillText('Lost net · click to haul it up', gn.x, gn.y - GHOST.h - 18); ctx.textAlign = 'left';
    }
  }
  if (tool === 'net') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 50, 0, 6.283); ctx.stroke(); }
  else if (tool === 'pollute') { ctx.strokeStyle = POLL_KIND === 'runoff' ? 'rgba(170,210,80,.85)' : 'rgba(190,130,50,.8)'; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 80, 0, 6.283); ctx.stroke(); }
  else if (tool === 'trawl') { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(0, ptr.y - 90); ctx.lineTo(WW, ptr.y - 90); ctx.moveTo(0, ptr.y + 90); ctx.lineTo(WW, ptr.y + 90); ctx.stroke(); ctx.setLineDash([]); }
  else if (tool === 'invader' || tool === 'stock') { ctx.strokeStyle = tool === 'invader' ? COL[INVADER] : COL[+document.getElementById('stockSel').value]; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 14, 0, 6.283); ctx.stroke(); }
}

// pan mode: where the view is along the world, a thin track at the top of the water that brightens while the view moves
let panSeenAt = -1e9, panLastX = 0;
function drawPanTrack(now) {
  if (!panMode) return;
  if (Math.abs(cam.x - panLastX) > 0.5) { panSeenAt = now; panLastX = cam.x; }
  const x0 = 16, w = innerWidth - 32, y = Math.max(topReserve, panelsNow) + 6, k = Math.max(0, Math.min(1, 1 - (now - panSeenAt - 600) / 900));
  ctx.fillStyle = 'rgba(2,7,13,.35)'; rrect(x0 - 1, y - 1, w + 2, 5, 2.5);
  ctx.fillStyle = `rgba(234,247,255,${0.45 + 0.45 * k})`; rrect(x0 + cam.x / WW * w, y, innerWidth / scale / WW * w, 3, 1.5);
}
function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); }

// ---------- M9 follow one animal (Watch tool: tap an animal)
// The camera eases in (zoom about 2x, more on a phone, where a grazer is a few pixels) and keeps the animal in the middle of
// the free part of the screen. Render only: `scale`, `ox` and `oy` are the view as it is now, so toWorld, picking and
// everything drawn in screen pixels keep working; baseScale / cam.* stay the unzoomed view and the camera eases back to
// them when it ends. A tap on empty water, Esc, a tool, a drag, the wheel or the camera keys end it; if the animal dies the
// card says how (sim.js a.fate) and the camera stays (a netted one is followed up to the boat) for a few seconds.
const zoomed = () => FOLLOW.p > 0.02;
function startFollow(a) {
  const F = FOLLOW;
  if (F.p < 0.05 || !F.a) { F.fx = a.x; F.fy = a.y; }
  F.a = a; F.deadFor = 0; F.lift = null; F.Z = Math.max(2, Math.min(3, 1.5 / baseScale));
  inspect = null; ptr.pick = null;
  if (typeof coachSaw === 'function') coachSaw(a.t);
  if (typeof updateFollowCard === 'function') updateFollowCard();
}
function endFollow(now) {
  const F = FOLLOW;
  F.a = null; F.lift = null;
  if (now && F.p) { F.p = 0; scale = baseScale; ox = panMode ? -cam.x * scale : (innerWidth - WW * scale) / 2; placeCam(); }
  if (typeof updateFollowCard === 'function') updateFollowCard();
}
function stepFollow(real) {
  const F = FOLLOW, a = F.a;
  scale = baseScale; ox = panMode ? -cam.x * scale : (innerWidth - WW * scale) / 2; oy = topReserve - cam.y * scale; // the unzoomed view
  if (a) {
    if (!a.dead && !S.agents.includes(a)) endFollow(); // gone without a death (a new game)
    else {
      let tx = a.x, ty = a.y;
      if (a.dead) {
        if (!paused) F.deadFor += real * speedMul; // not while paused (a photo of what just happened)
        if (a.fate === FATE.NET && !F.lift) F.lift = LIFTS.find(l => l.sp === a.t && l.x === a.x && l.y === a.y) || null;
        if (F.lift) { const q = liftPos(F.lift, S.t); tx = q.x; ty = q.y; }
        if (F.deadFor > 4) endFollow();
      }
      const k = Math.min(1, real * 5); F.fx += (tx - F.fx) * k; F.fy += (ty - F.fy) * k;
    }
  }
  const to = F.a ? 1 : 0;
  F.p += (to - F.p) * Math.min(1, real * 4); if (Math.abs(to - F.p) < 0.004) F.p = to;
  if (!F.p) return;
  const q = F.p * F.p * (3 - 2 * F.p), s = baseScale * (1 + (F.Z - 1) * q);
  const top = topReserve, bot = innerHeight - barH - F.cardH; // the free part of the screen: under the panels, over the card and toolbar
  let fox = innerWidth / 2 - F.fx * s; fox = Math.max(innerWidth - WW * s, Math.min(0, fox));
  let foy = (top + bot) / 2 - F.fy * s; foy = Math.max(bot - (WH + 80) * s, Math.min(top + SKY * s, foy)); // the sky above the surface may show, the seabed ends it
  ox += (fox - ox) * q; oy += (foy - oy) * q; scale = s;
}
// a soft ring around the animal followed
function drawFollowRing(t) {
  const a = FOLLOW.a; if (!a || a.dead || !zoomed()) return;
  const r = SPECIES[a.t].size * RS * 1.5 + 3 + Math.sin(t * 4) * 1.2;
  ctx.strokeStyle = 'rgba(234,247,255,.55)'; ctx.lineWidth = 1.5 / scale; ctx.setLineDash([6 / scale, 7 / scale]);
  ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
}

let lastNow = 0, acc = 0;
function frame(now) {
  const dt = 1 / 30;
  // advance by real elapsed time, not once per screen refresh, so the pace is the same on 60 Hz and 144 Hz displays
  const real = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
  lastNow = now;
  const ease = Math.min(1, real * 8);
  cam.y += (cam.target - cam.y) * ease; cam.y = clampCam(cam.y);
  cam.x += (cam.tx - cam.x) * ease; cam.x = clampCamX(cam.x); placeCam(); stepFollow(real);
  if (ptr.cx !== undefined) { const p = toWorld({ clientX: ptr.cx, clientY: ptr.cy }); ptr.x = p.x; ptr.y = p.y; } // the world moved under a still pointer
  stepLamp(real);
  if (!paused) {
    stepCatch(real * speedMul); stepSailing(real * speedMul); stepSilt(real * speedMul); stepHauled(real * speedMul);
    acc += real * speedMul;
    let n = 0, stepped = 0;
    while (acc >= dt && n++ < 8) {
      acc -= dt;
      // on touch, nets and paint wait a moment: a second finger may be on its way (a two-finger pan, ui.js)
      if (ptr.down && ptr.inside && ptr.y <= WH && !drag.on && !(ptr.touch && now - ptr.t0 < 90)) {
        if (tool === 'net') netAt(ptr.x, ptr.y, 50);
        else if (tool === 'pollute') dumpAt(ptr.x, ptr.y, dt);
        ptr.stroked = true;
      }
      step(dt); stepDeep(dt);
      if (S.game.over) { paused = true; ptr.down = false; showEnd(); break; }
      stepped += dt;
    }
    stepReefFilm(stepped); stepFleet(stepped); // scene time follows the sim time actually stepped (capped at 8 steps)
    if (acc > dt) acc = 0;
  }
  drawFrame(now);
  updateUI();
  audioTick(now);
  requestAnimationFrame(frame);
}
// one frame of the scene into ctx, in screen coordinates (renderPhoto draws the same frame into a bigger canvas)
function drawFrame(now) {
  ctx.fillStyle = '#02070d'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
  ctx.beginPath(); ctx.rect(0, -SKY, WW, SKY + DEEP_BOTTOM + 600); ctx.clip();
  collectCatch();
  updateMood(S.t);
  // under water, back to front; then the darkness and what glows through it; then the sky and the fleet on top
  drawWater(); drawDeepWater(S.t); drawSunlight(S.t); drawSeabed(S.t); drawPollution(S.t); drawRunoff(); drawPlumes(S.t); drawMpa(S.t);
  for (const a of S.agents) drawAgent(a, S.t);
  drawGhosts(S.t);
  drawDeep(S.t);
  drawSnow(S.t); drawDeepSnow(S.t); drawSilt(); drawTrawlers(S.t);
  drawDark(sceneLights()); drawDeadZone(); drawDeepDark(S.t); drawGlows(S.t); drawDeepGlows(S.t); drawLamp(S.t);
  if (!photo) drawFollowRing(S.t);
  drawEffects(); drawLifts(S.t);
  drawSky(S.t); drawTrawlerDecks(S.t); drawMpaBuoys(S.t);
  if (!photo) drawTags(); // after the sky: value tags can reach above the waterline
  if (!shooting) drawEdges(); // the fade into the dark beside the world; the picture is cut at the world's edges instead
  if (!photo && !zoomed()) drawRuler();
  if (!photo) drawCursor();
  ctx.restore();
  if (!photo) { if (!zoomed()) drawPanTrack(now); drawInspect(now); }
}

// M9 photo: the world as the screen shows it now (no panels, labels or cursor: photo mode), drawn again at 2 px per world
// unit into a canvas of its own. 2 is about the sprites' own resolution (sprites.js ss 3 / RS 1.3) and the reef's (2), so
// a bigger picture would only blur; capped at PHOTO_MAX_PX for phones. Only what is world is kept: no dark bands beside it.
const PHOTO_SCALE = 2, PHOTO_MAX_PX = 12e6;
let shooting = false; // true while renderPhoto draws
function photoRect() {
  const x0 = Math.max(0, ox), x1 = Math.min(innerWidth, ox + WW * scale);
  const y0 = Math.max(0, oy - SKY * scale), y1 = Math.min(innerHeight, oy + (DEEP_BOTTOM + 600) * scale);
  const m = Math.min(PHOTO_SCALE / scale, Math.sqrt(PHOTO_MAX_PX / ((x1 - x0) * (y1 - y0)))); // picture px per screen px
  return { x0, y0, m, w: Math.round((x1 - x0) * m), h: Math.round((y1 - y0) * m) };
}
// The draw functions only read the sim (while paused nothing moves), so drawing a second frame now is safe.
// null when the browser will not give a canvas that big (a phone short of memory)
function renderPhoto() {
  const r = photoRect(), c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const g = c.getContext('2d'); if (!g) return null;
  g.setTransform(r.m, 0, 0, r.m, -r.x0 * r.m, -r.y0 * r.m);
  const was = photo; photo = photo || {}; ctx = g; shooting = true;
  try { drawFrame(performance.now()); } finally { ctx = viewCtx; photo = was; shooting = false; }
  return c;
}
