// M9 part 4: the end-screen timelapse. During a scored run, every TL.EVERY sim seconds one small frame of the sunlit water is
// drawn (the same drawFrame the screen uses, into a canvas of its own, camera fixed on the whole sunlit layer, no lamp, no
// labels) and kept as a JPEG blob, with the species counts of that moment. The end screen plays them back at 30 fps with the
// clock and a population line per species under the picture. Re-simulating would take as long as the run (tune.js: ~11 s in
// node), so frames are recorded, not replayed.
// Memory is bounded: a run is RUN.DUR / EVERY + 1 frames (301), about 20-30 KB each as JPEG, and recording stops at TL.MAX.
// Only reads the sim. Loaded after render.js (drawFrame, ctx, ox/oy/scale) and before ui.js.
const TL = {
  W: 480, H: 289,              // 1600 x 964 world units (sky + sunlit water) at 0.3, about the shape of the water
  STRIP: 50,                   // px under the picture for the population lines (the clock is HTML, so it stays readable on a phone)
  EVERY: 2, MAX: 400, FPS: 30, QUALITY: 0.72,
  frames: [], next: 0, gen: 0, cv: null, g: null,
  play: null,
};

function tlReset() { TL.frames = []; TL.next = 0; TL.gen++; tlStop(); }

// called once per screen frame (render.js frame()) and once more as the run ends; cheap unless a frame is due
function tlStep(force) {
  try { tlRecord(force); }
  catch (e) { TL.MAX = 0; console.warn('timelapse recording stopped:', e); } // optional extra: never let it stop the game loop or the end screen
}
function tlRecord(force) {
  if (mode !== 'run' || TL.frames.length >= TL.MAX) return;
  if (S.t < TL.next && !force) return;
  if (force && TL.frames.length && S.t - TL.frames[TL.frames.length - 1].t < 0.5) return; // the end frame only if it adds something
  while (TL.next <= S.t) TL.next += TL.EVERY;
  if (!TL.cv) { TL.cv = document.createElement('canvas'); TL.cv.width = TL.W; TL.cv.height = TL.H; TL.g = TL.cv.getContext('2d'); }
  if (!TL.g) return;
  const sv = { ctx, ox, oy, scale, photo, shooting };
  // the same transform every time, so nothing the player does to the view (pan, zoom, follow) reaches the frames
  const s = Math.min(TL.W / WW, TL.H / (SKY + WH));
  ctx = TL.g; ox = (TL.W - WW * s) / 2; oy = SKY * s; scale = s; photo = photo || {}; shooting = true; rec = true;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'low';
  try { drawFrame(performance.now()); }
  finally { ({ ctx, ox, oy, scale, photo, shooting } = sv); rec = false; }
  const fr = { t: S.t, c: Array.from(S.counts), blob: null, ready: null }, gen = TL.gen;
  TL.frames.push(fr);
  // fr.ready settles when the JPEG is encoded (or failed): the end screen can open a moment after the last frame was taken
  fr.ready = new Promise(done => {
    try { TL.cv.toBlob(b => { if (gen === TL.gen) fr.blob = b; done(); }, 'image/jpeg', TL.QUALITY); } catch (e) { done(); } // a frame without a picture is skipped on playback
  });
}

// ---- playback (the end screen calls tlMount after it has put the canvas in the card)
function tlImage(blob) {
  return new Promise((ok, no) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(); }; im.src = u; });
}
function tlDecode(blob) {
  if (typeof createImageBitmap !== 'function') return tlImage(blob);
  return createImageBitmap(blob).catch(() => tlImage(blob));
}
// the lines for the whole run, once: dim for what is still to come, bright for what has passed (drawn up to the playhead)
function tlStrips() {
  const F = TL.frames, n = F.length, W = TL.W, H = TL.STRIP - 8, mk = a => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.globalAlpha = a; g.lineWidth = 2; g.lineJoin = 'round'; return [c, g]; };
  const dim = mk(0.3), bright = mk(1), end = F[n - 1].t || 1;
  for (const sp of SPECIES) {
    if (sp.plant) continue; // animals only: plankton would just be a wall of noise
    let mx = 0; for (const f of F) mx = Math.max(mx, f.c[sp.i]);
    if (mx <= 0) continue; // never there (an invader that was not released)
    for (const [, g] of [dim, bright]) {
      g.strokeStyle = COL[sp.i]; g.beginPath();
      F.forEach((f, i) => { const x = f.t / end * (W - 2) + 1, y = H - 3 - f.c[sp.i] / mx * (H - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
  }
  return { dim: dim[0], bright: bright[0], end };
}
function tlDraw(cv, strips, i, bmp, clock) {
  const g = cv.getContext('2d'), F = TL.frames, f = F[i], W = TL.W, y0 = TL.H, sh = strips.bright.height;
  if (bmp) g.drawImage(bmp, 0, 0, W, TL.H);
  g.fillStyle = '#041420'; g.fillRect(0, y0, W, TL.STRIP);
  const x = f.t / strips.end * (W - 2) + 1, ly = y0 + (TL.STRIP - sh) / 2;
  g.drawImage(strips.dim, 0, ly);
  if (x > 1) g.drawImage(strips.bright, 0, 0, x, sh, 0, ly, x, sh);
  g.fillStyle = 'rgba(234,247,255,.7)'; g.fillRect(Math.round(x), ly, 1, sh);
  if (clock) clock.textContent = fmtClock(f.t);
}
function tlStop() { // also lets go of the old end screen's button, which would otherwise keep the last run's frames alive
  if (TL.play) { TL.play.stop = true; if (TL.play.btn) TL.play.btn.onclick = null; TL.play = null; }
}
// plays the recorded frames on `cv` (width TL.W, height TL.H + TL.STRIP), then rests on the last one. btn: Replay / Play.
function tlMount(cv, btn, clock, autoplay) {
  tlStop();
  const F = TL.frames, n = F.length;
  if (n < 2) return false;
  const strips = tlStrips(), P = TL.play = { stop: false, last: -1, busy: false, t0: 0, btn };
  const show = async i => { // one frame at a time; the newest request wins
    if (P.busy) return; P.busy = true;
    try {
      if (!F[i].blob && F[i].ready) await F[i].ready; // the last frame may still be encoding when the end screen opens
      let j = i; while (j > 0 && !F[j].blob) j--; // a frame whose picture is not ready (or failed) keeps the one before
      const bmp = F[j].blob ? await tlDecode(F[j].blob) : null;
      try { if (!P.stop) tlDraw(cv, strips, i, bmp, clock); }
      finally { if (bmp && bmp.close) bmp.close(); }
    } catch (e) { /* skip this frame */ } finally { P.last = i; P.busy = false; } // last is set even on failure, so playback always reaches its end
  };
  const total = (n - 1) / TL.FPS * 1000;
  const tick = now => {
    if (P.stop || !document.body.contains(cv)) return;
    const k = Math.min(n - 1, Math.floor((now - P.t0) / 1000 * TL.FPS));
    if (k !== P.last) show(k);
    if (now - P.t0 < total || P.last !== n - 1) requestAnimationFrame(tick);
    else { btn.textContent = 'Replay'; btn.disabled = false; }
  };
  const start = () => { P.t0 = performance.now(); P.last = -1; btn.disabled = true; btn.textContent = 'Playing'; requestAnimationFrame(tick); };
  btn.onclick = start;
  if (autoplay) start(); else { btn.textContent = 'Play'; show(n - 1); }
  return true;
}
