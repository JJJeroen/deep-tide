// M9 part 5: "Generations", the shifting-baselines campaign (plan docs/plans/2026-11-09-m9-memory-release.md part 5; the sim
// side is in sim.js after runScore). Up to GEN.SEASONS Anthropocene runs on one ocean: each season opens on the ocean the last
// one left, after it was left alone for GEN.HEAL sim seconds, and the log still says "The water is calm." During a season the
// page is simply in run mode (mode 'run', every run rule and test applies); CAMP says which campaign it is part of.
// Saved in this browser only (localStorage, one key, about 110-200 KB): after a season ends (the ocean as it ended, so a reload
// mid-heal heals again from there) and after the heal (the next season's start). A season left halfway starts over: nothing is
// saved during play. Storage may be missing, blocked or full: every access is wrapped; a write that is refused leaves the
// last save as it was (a whole earlier checkpoint), and without any storage the campaign goes on in this page but cannot
// resume. The timelapse frames are never stored; only two small pictures (season 1's start, the last end).
// Loaded after ui.js (CAMP, campBetween, newGame, showEnd, endEl, menuEl, fmtClock). ui.js declares CAMP and calls in here
// only through guards, so the other modes work even if this file did not load.
const CAMP_KEY = 'deep-tide.generations', CAMP_V = 1; // bump CAMP_V (or GEN.V in sim.js) when the saved shape changes: an older save is then ignored
// CAMP (ui.js): { rec, saved, between: null | 'end' | 'heal' | 'ready' | 'final', heal, end, nowUrl, showReady }

// ---- storage
function campValid(r) {
  if (!r || r.v !== CAMP_V || typeof r.seed !== 'string' || !Number.isInteger(r.season) || r.season < 1 || r.season > GEN.SEASONS) return false;
  if (!['play', 'heal', 'done'].includes(r.phase) || !Array.isArray(r.seasons) || r.seasons.length !== r.season - (r.phase === 'play' ? 1 : 0)) return false;
  if (r.season > 1 && !r.first) return false;
  if (r.phase === 'done') return !!r.last;
  if (r.phase === 'play' && r.season === 1) return true; // season 1 starts from its seed
  return !!(r.ocean && r.ocean.v === GEN.V && r.ocean.agents && r.deep && r.deep.agents);
}
let campOld = false; // a save was there but cannot be read (an older format, or damaged): the menu says so until a new one is saved
function campText() { try { return localStorage.getItem(CAMP_KEY); } catch (e) { return null; } }
function campParse(txt) {
  if (!txt) return null;
  try { const r = JSON.parse(txt, jsonUnpack); if (campValid(r)) return r; } catch (e) { /* damaged */ }
  campOld = true;
  return null;
}
const campRead = () => campParse(campText()); // a fresh copy each time: the caller may change it
let campPeekMemo = { txt: null, val: null };
function campPeek() { // what the menu needs (phase, season, seasons played), parsed again only when the save changed
  const txt = campText();
  if (txt !== campPeekMemo.txt) { const r = campParse(txt); campPeekMemo = { txt, val: r && { phase: r.phase, season: r.season, played: r.seasons.length } }; }
  return campPeekMemo.val;
}
// true when kept. False: no storage, blocked, or full (setItem is all or nothing, so the last save stays as it was: an earlier
// checkpoint of this campaign). Full: it tries once more without the pictures, which the campaign can do without.
// A campaign that is over (rec.closed) is never written again: a picture still being encoded must not bring its save back
function campWrite(rec) {
  if (rec.closed) return false;
  rec.saved = Date.now();
  const put = r => { try { localStorage.setItem(CAMP_KEY, JSON.stringify(r, jsonPack)); return true; } catch (e) { return false; } };
  if (put(rec)) return true;
  return !!((rec.first && rec.first.pic) || rec.lastPic) && put({ ...rec, first: rec.first && { ...rec.first, pic: null }, lastPic: null });
}
function campClear() { try { localStorage.removeItem(CAMP_KEY); } catch (e) { /* nothing to clear */ } }

// ---- starting and leaving
function campStart() { // the menu's Generations button: continue the saved campaign, or start one
  const r = campRead();
  if (!r) return campNew();
  CAMP = { rec: r, saved: true, showReady: r.phase === 'play' && r.season > 1 }; // a later season opens on its ready card: time passed
  try {
    if (r.phase === 'done') { menuEl.hidden = true; campFinal(); }
    else newGame('run', CAMP);
  } catch (e) { // a save that looked right but does not load (damaged, or a format change without a new version number)
    console.warn('Generations: the saved campaign could not be loaded; starting a new one.', e);
    campStopHeal(); CAMP = null; campClear(); campNew(); campOld = true;
  }
}
function campNew() {
  const rec = { v: CAMP_V, seed: URL_SEED || freshSeed(), season: 1, phase: 'play', seasons: [], first: null, ocean: null, deep: null };
  CAMP = { rec, saved: campWrite(rec) };
  if (CAMP.saved) campOld = false; else campClear(); // (an older campaign that could not be overwritten must not come back instead)
  newGame('run', CAMP);
}
// called by newGame for a campaign game, right after resetWorld/resetDeep(seed): put the saved ocean in
function campSetup(seed) {
  const c = CAMP, r = c.rec;
  campStopHeal(); campFreeUrl(); c.between = null; c.end = null;
  if (r.ocean) {
    loadOcean(r.ocean); loadDeep(r.deep);
    if (r.phase === 'play' && !c.showReady) { beginSeason(seed); seedDeep(seed); }
  }
  if (r.phase === 'play' && r.season === 1) r.first = { ...oceanSummary(), pic: null }; // the first ocean (its picture is taken from the timelapse)
}
// after newGame for a campaign continued from its save: mid-heal, show the heal; at a later season's start, its ready card
function campAfterSetup() {
  const c = CAMP; if (!c) return;
  if (c.rec.phase === 'heal') { paused = true; hudEl.hidden = true; c.end = oceanSummary(); campHealStart(); campHealShow(); }
  else if (c.showReady) { c.showReady = false; paused = true; hudEl.hidden = true; c.end = c.rec.seasons[c.rec.seasons.length - 1]; campReady(); }
}
function campLeave() { campStopHeal(); campFreeUrl(); CAMP = null; } // another game: the campaign stays saved
const campLabel = () => 'Generations · season ' + CAMP.rec.season + ' of ' + GEN.SEASONS;

// ---- pictures (the timelapse's frames: TL.frames[i].blob, encoded asynchronously, .ready when done)
function campFramePic(f) { return f ? Promise.resolve(f.ready).then(() => f.blob || null) : Promise.resolve(null); }
function blobToDataURL(b) {
  return new Promise(ok => { try { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(b); } catch (e) { ok(null); } });
}
function campFreeUrl() { if (CAMP && CAMP.nowUrl) { URL.revokeObjectURL(CAMP.nowUrl); CAMP.nowUrl = null; } }
function campSetImg(id, src) { const im = document.getElementById(id); if (!im) return; if (src) { im.src = src; im.parentElement.hidden = false; } }

// ---- the end of a season: called by showEnd before it builds the card
function campSeasonEnd(r) {
  const c = CAMP, rec = c.rec, k = rec.season, last = k >= GEN.SEASONS, end = c.end = oceanSummary();
  rec.seasons.push({ score: r.score, bio: r.bio, water: r.water, lost: r.lost.slice(), present: end.present, counts: end.counts });
  if (last) { rec.phase = 'done'; rec.ocean = rec.deep = null; rec.last = end; }
  else { rec.phase = 'heal'; rec.ocean = oceanState(); rec.deep = deepState(); }
  c.between = 'end'; c.endSeason = k;
  c.saved = campWrite(rec);
  if (!last) campHealStart(); // the worker heals while the card is read
  // pictures: season 1's first frame is kept with the save; this season's last frame is shown (and kept after the last season)
  const F = TL.frames, mine = rec;
  if (k === 1) campFramePic(F[0]).then(b => b && blobToDataURL(b)).then(u => {
    if (!u || !CAMP || CAMP.rec !== mine) return;
    mine.first.pic = u; campSetImg('cmpFirst', u);
    if (mine.phase !== 'heal') CAMP.saved = campWrite(mine); // the heal's save takes it along (one write less), unless the heal is done already
  });
  campFramePic(F[F.length - 1]).then(b => {
    if (!b || !CAMP || CAMP.rec !== mine) return;
    campFreeUrl(); CAMP.nowUrl = URL.createObjectURL(b); campSetImg('cmpNow', CAMP.nowUrl);
    if (last) blobToDataURL(b).then(u => { if (u && CAMP && CAMP.rec === mine) { mine.lastPic = u; CAMP.saved = campWrite(mine); } });
  });
}
const campPct = v => Math.round(v * 100) + '%';
// first ocean vs another: two pictures and the counts side by side
function campCompare(first, now, nowCap, firstPic, nowPic) {
  const rows = SPECIES.filter(sp => !sp.invasive || first.counts[sp.i] || now.counts[sp.i]).map(sp =>
    `<tr><td><span class="dot" style="background:${sp.color}"></span>${sp.name}</td><td>${first.counts[sp.i]}</td><td class="${now.counts[sp.i] < first.counts[sp.i] / 2 || (sp.invasive && now.counts[sp.i]) ? 'neg' : ''}">${now.counts[sp.i] || (sp.invasive ? 0 : '<b class="neg">gone</b>')}</td></tr>`).join('');
  return `<div class="cmp"><figure ${firstPic ? '' : 'hidden'}><img id="cmpFirst" alt="The first ocean" ${firstPic ? `src="${firstPic}"` : ''}><figcaption>Season 1, the first morning</figcaption></figure>
      <figure ${nowPic ? '' : 'hidden'}><img id="cmpNow" alt="${nowCap}" ${nowPic ? `src="${nowPic}"` : ''}><figcaption>${nowCap}</figcaption></figure></div>
    <table class="cmpt"><tr><th></th><th>First ocean</th><th>Now</th></tr>${rows}
      <tr><td>Species present</td><td>${first.present} of ${NATIVE.length}</td><td>${now.present} of ${NATIVE.length}</td></tr>
      <tr><td>Biodiversity</td><td>${campPct(first.bio)}</td><td>${campPct(now.bio)}</td></tr>
      <tr><td>Water quality</td><td>${campPct(first.water)}</td><td>${campPct(now.water)}</td></tr></table>`;
}
const campAvg = rec => Math.round(rec.seasons.reduce((a, s) => a + s.score, 0) / rec.seasons.length);
const savedLine = () => CAMP.saved ? 'Saved in this browser.' : 'This browser would not keep the latest save: closing the page would lose it.';
// the parts of the run's end card that differ in a campaign (ui.js showEnd puts them in)
function campCardParts() {
  const rec = CAMP.rec, k = CAMP.endSeason, last = k >= GEN.SEASONS, avg = campAvg(rec);
  return {
    title: `${fmtClock(RUN.DUR)}. Season ${k} of ${GEN.SEASONS} is over.`,
    steward: k === 1,
    middle: `<h3>Your first ocean, and this one</h3>${campCompare(rec.first, CAMP.end, 'Season ' + k + ', the end', rec.first.pic, null)}
      ${k > 1 ? `<p>Seasons so far: ${rec.seasons.map(s => s.score).join(', ')}. Campaign score so far: <b style="color:var(--text)">${avg}</b> (their average).</p>` : ''}`,
    seedline: `Campaign ocean <b>${rec.seed}</b> · season ${k} of ${GEN.SEASONS}. ${savedLine()}`,
    actions: last ? `<button id="campOn" class="on">How it ended</button><button id="campMenu">Menu</button>`
      : `<button id="campOn" class="on">Leave the ocean alone</button><button id="campMenu">Menu</button><button id="campQuit">Abandon the campaign</button>`,
    wire() { document.getElementById('campOn').onclick = last ? () => campFinal() : () => campHealShow(); campWireCommon(); },
  };
}
function campWireCommon() {
  const m = document.getElementById('campMenu'); if (m) m.onclick = () => campToMenu();
  const q = document.getElementById('campQuit'); if (q) q.onclick = () => campConfirmQuit(q.parentElement);
}
// the card's Menu: like the toolbar's (the card comes back with Back); the campaign stays saved
function campToMenu() {
  pausedBeforeMenu = true; paused = true; ptr.down = false;
  endEl.hidden = true; menuEl.hidden = false; document.getElementById('menuBack').hidden = false; campMenu();
}
// abandoning asks first, in place: the row of buttons becomes the question
function campConfirmQuit(row) {
  const keep = row.innerHTML;
  row.innerHTML = '<span class="ask">Abandon it? The saved ocean is deleted.</span><button id="campQuitYes" class="warnb">Yes, abandon it</button><button id="campQuitNo">Keep it</button>';
  document.getElementById('campQuitYes').onclick = () => campAbandon();
  document.getElementById('campQuitNo').onclick = () => { row.innerHTML = keep; if (CAMP && CAMP.between === 'end') campCardParts().wire(); else campWireReady(); };
}
function campAbandon() {
  const rec = CAMP ? CAMP.rec : campRead();
  if (rec) rec.closed = true;
  campStopHeal(); campClear();
  if (rec && rec.seasons.length) { CAMP = CAMP || { rec, saved: false }; campFinal(true); }
  else { campLeave(); endEl.hidden = true; campShowMenu(); }
}
function campShowMenu() { menuEl.hidden = false; document.getElementById('menuBack').hidden = true; endEl.classList.remove('light'); campMenu(); }

// ---- the heal: GEN.HEAL sim seconds of an ocean left alone, in heal.js (or here, when there are no workers: file:// pages)
let campGen = 0;
function campHealStart() {
  const rec = CAMP.rec, steps = healSteps();
  const H = CAMP.heal = { id: ++campGen, seed: rec.seed + '.h' + rec.season, steps, snaps: [], done: null, worker: null, local: false, i: 0, disp: 0, lastShow: 0, shown: false, lastMsg: performance.now(), lastTick: 0 };
  try {
    const w = H.worker = new Worker('heal.js');
    const fail = H.fail = () => { if (CAMP && CAMP.heal === H && !H.done && !H.local) { w.terminate(); H.worker = null; H.local = true; H.snaps = []; H.disp = 0; } };
    w.onmessage = e => {
      if (!CAMP || CAMP.heal !== H) return;
      const d = e.data; H.lastMsg = performance.now();
      if (d.kind === 'snap') H.snaps.push(d);
      else if (d.kind === 'done') { H.done = d; w.terminate(); H.worker = null; campHealed(); }
      else fail();
    };
    w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); fail(); };
    w.postMessage({ ocean: rec.ocean, deep: rec.deep, seed: H.seed, steps, every: Math.max(1, Math.round(steps / 12)) });
  } catch (e) { H.worker = null; H.local = true; } // no worker here: the page steps it itself once the heal card is up
}
function campStopHeal() { const H = CAMP && CAMP.heal; if (H) { if (H.worker) H.worker.terminate(); H.worker = null; H.stop = true; CAMP.heal = null; } }
// the heal is done (maybe while the end card is still being read): the next season's start is saved straight away
function campHealed() {
  const c = CAMP, H = c.heal, rec = c.rec;
  rec.phase = 'play'; rec.season++; rec.ocean = H.done.ocean; rec.deep = H.done.deep;
  c.saved = campWrite(rec);
}
// the heal card: the ocean moves on behind it, a bar and a clock show the time left alone. Snapshots come from the worker
// (12 over the heal) and are shown at most 4 a second, so a heal that finished early still plays out in about 3 s
function campHealShow() {
  const c = CAMP, H = c.heal; if (!H) return;
  c.between = 'heal'; H.shown = true;
  endFollow(true); hudEl.hidden = true; paused = true;
  logEl.innerHTML = ''; logShown = S.events.length; // the season's lines go; the heal's own stay out (the cards say what happened)
  endEl.classList.add('light'); document.getElementById('tagline').textContent = 'Generations · between seasons';
  document.getElementById('endCard').innerHTML = `<h2>The fleet stays in port</h2>
    <p>No nets, no waste, no head office. The ocean is left alone for a while.</p>
    <div class="healbar" aria-hidden="true"><i id="healFill"></i></div>
    <p class="healclock">Left alone <b id="healClock">0:00</b> of ${fmtClock(GEN.HEAL)}</p>
    <div class="actions"><button id="campMenu">Menu</button></div>`;
  endEl.hidden = false; campWireCommon();
  requestAnimationFrame(t => campHealTick(H, t));
}
function campHealTick(H, now) {
  if (H.stop || !CAMP || CAMP.heal !== H) return;
  // a worker that has said nothing for 15 s (killed, stuck) is replaced by the page's own stepping; time with the tab hidden
  // (no frames) does not count, since the browser may hold the worker back then
  if (H.lastTick && now - H.lastTick > 1000) H.lastMsg += now - H.lastTick;
  H.lastTick = now;
  if (H.worker && !H.done && now - H.lastMsg > 15000 && H.fail) H.fail();
  let frac;
  if (H.local && !H.done) {
    if (H.i === 0) { loadOcean(CAMP.rec.ocean); loadDeep(CAMP.rec.deep); startHeal(H.seed); seedDeep(H.seed); }
    const t0 = performance.now();
    while (H.i < H.steps && performance.now() - t0 < 24) { step(1 / 30); stepDeep(1 / 30); H.i++; }
    frac = H.i / H.steps;
    if (H.i >= H.steps) { H.done = { ocean: oceanState(), deep: deepState() }; campHealed(); H.disp = H.snaps.length; H.final = true; }
  } else {
    if (now - H.lastShow >= 250 && H.disp < H.snaps.length) { const s = H.snaps[H.disp++]; loadOcean(s.ocean); loadDeep(s.deep); H.lastShow = now; H.frac = s.frac; }
    else if (H.done && H.disp >= H.snaps.length && now - H.lastShow >= 250) { loadOcean(H.done.ocean); loadDeep(H.done.deep); H.final = true; H.frac = 1; }
    frac = H.frac || 0;
  }
  logShown = S.events.length;
  const fill = document.getElementById('healFill'), clock = document.getElementById('healClock');
  if (fill) fill.style.width = (frac * 100).toFixed(1) + '%';
  if (clock) clock.textContent = fmtClock(frac * GEN.HEAL);
  if (H.final) { H.snaps = []; campReady(); return; }
  requestAnimationFrame(t => campHealTick(H, t));
}
// the healed ocean is on screen: what changed while it was left alone, and the next season's button
function campReady() {
  const c = CAMP, rec = c.rec, k = rec.season, now = oceanSummary(), was = c.end;
  c.between = 'ready'; c.heal = null;
  const back = NATIVE.filter(s => !was.counts[s.i] && now.counts[s.i]).map(s => s.name), still = NATIVE.filter(s => !now.counts[s.i]).map(s => s.name);
  const moved = SPECIES.filter(s => !s.plant && (was.counts[s.i] || now.counts[s.i])).map(s => `${s.name} ${was.counts[s.i]} → ${now.counts[s.i]}`).join(' · ');
  endEl.classList.add('light'); document.getElementById('tagline').textContent = campLabel();
  document.getElementById('endCard').innerHTML = `<h2>Season ${k} of ${GEN.SEASONS}</h2>
    <p class="verdict">A new generation takes over the fleet. To them, this is how the ocean has always looked.</p>
    <p>While it was left alone (${fmtClock(GEN.HEAL)}): ${back.length ? campList(back) + ' came back. ' : ''}${still.length ? campList(still) + (still.length > 1 ? ' are' : ' is') + ' still gone. ' : ''}<span class="moved">${moved}.</span></p>
    <div class="actions"><button id="campGo" class="on">Start season ${k}</button><button id="campMenu">Menu</button><button id="campQuit">Abandon the campaign</button></div>
    <p class="seedline">Campaign ocean <b>${rec.seed}</b>. ${savedLine()}</p>`;
  endEl.hidden = false; menuEl.hidden = true;
  campWireReady();
}
function campWireReady() { const g = document.getElementById('campGo'); if (g) g.onclick = () => { endEl.classList.remove('light'); newGame('run', CAMP); }; campWireCommon(); }
const campLc = s => s.charAt(0).toLowerCase() + s.slice(1);
function campList(names) {
  const n = names.map((s, i) => i ? campLc(s) : s);
  return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}

// ---- the final screen: the campaign score, the first ocean against the last, in words and pictures. The save goes now.
function campWords(first, last) {
  const gone = NATIVE.filter(s => first.counts[s.i] && !last.counts[s.i]).map(s => s.name), out = [];
  out.push(gone.length ? `${campList(gone)} ${gone.length > 1 ? 'are' : 'is'} gone. The first fleet found ${first.present} of ${NATIVE.length} native species; the last one left ${last.present}.`
    : `Every species the first fleet found is still here.`);
  if (last.counts[INVADER]) out.push('Invaders live here now.');
  const db = last.bio - first.bio;
  out.push(Math.abs(db) < 0.02 ? `Biodiversity held at ${campPct(last.bio)}.` : `Biodiversity ${db < 0 ? 'fell' : 'rose'} from ${campPct(first.bio)} to ${campPct(last.bio)}.`);
  const dw = last.water - first.water;
  out.push(Math.abs(dw) < 0.02 ? 'The water is as clean as the first fleet found it.' : `Water quality went from ${campPct(first.water)} to ${campPct(last.water)}.`);
  return out;
}
function campFinal(early) {
  const c = CAMP, rec = c.rec, n = rec.seasons.length, last = rec.last || c.end || { ...rec.seasons[n - 1] };
  rec.closed = true; campStopHeal(); campClear(); // the campaign is over: nothing left to continue
  c.between = 'final';
  const lastPic = c.nowUrl || rec.lastPic || null;
  endEl.classList.remove('light');
  document.getElementById('endCard').innerHTML = `<h2>${early ? 'The campaign ends after ' + n + ' season' + (n > 1 ? 's' : '') : GEN.SEASONS + ' seasons on one ocean'}</h2>
    ${campWords(rec.first, last).map(s => `<p class="verdict">${s}</p>`).join('')}
    <div class="bigscore">${campAvg(rec)}</div><p style="margin-top:0">campaign score: the average of ${n === 1 ? 'one season' : 'the ' + n + ' seasons'}</p>
    <table>${rec.seasons.map((s, i) => `<tr><td>Season ${i + 1}</td><td>${s.score} points · ${s.present} of ${NATIVE.length} species, biodiversity ${campPct(s.bio)}, water ${campPct(s.water)}</td></tr>`).join('')}</table>
    <h3>The first ocean and the last</h3>${campCompare(rec.first, last, 'Season ' + n + ', the end', rec.first.pic, lastPic)}
    <p>Every season began with the same words: <i>The water is calm.</i></p>
    <p class="seedline">Campaign ocean <b>${rec.seed}</b>. The save is cleared.</p>
    <div class="actions"><button id="campNew" class="on">New campaign</button><button id="campMenu2">Menu</button></div>`;
  endEl.hidden = false; menuEl.hidden = true; hudEl.hidden = true; paused = true; logEl.innerHTML = '';
  document.getElementById('tagline').textContent = 'Generations · the campaign is over';
  document.getElementById('campNew').onclick = () => { campLeave(); campNew(); };
  document.getElementById('campMenu2').onclick = () => { campLeave(); endEl.hidden = true; if (!mode) paused = false; campShowMenu(); }; // (no game yet: the ocean behind the menu runs, as on a fresh load)
}

// ---- the menu: Generations continues a saved campaign, and offers to abandon it
function campMenu() {
  const r = campPeek(), sub = document.getElementById('genSub'), box = document.getElementById('genSaved');
  if (!sub || !box) return;
  const live = CAMP && !['final'].includes(CAMP.between) ? CAMP.rec : null, s = live || r;
  let txt = 'Five seasons on one ocean. Each new fleet inherits the water the last one left, and calls it normal.';
  if (live && !CAMP.between) txt = `In season ${s.season} of ${GEN.SEASONS} now (Back carries on; this starts the season over).`;
  else if (s && s.phase === 'play') txt = s.season === 1 ? 'Continue: season 1 of ' + GEN.SEASONS + ' starts over.' : `Continue: season ${s.season} of ${GEN.SEASONS}. The ocean season ${s.season - 1} left has had time to heal.`;
  else if (s && s.phase === 'heal') txt = `Continue: season ${s.season} of ${GEN.SEASONS} is over, and the ocean is left alone for a while.`;
  else if (s && s.phase === 'done') txt = 'Your campaign is over. See how it ended.';
  else if (campOld) txt += ' (A campaign saved by an older version could not be continued.)';
  sub.textContent = txt;
  box.hidden = !(s && s.phase !== 'done');
  box.innerHTML = '<button id="genQuit">Abandon the campaign</button>';
  document.getElementById('genQuit').onclick = () => {
    box.innerHTML = '<span class="ask">Abandon it? The saved ocean is deleted.</span><button id="genQuitYes" class="warnb">Yes, abandon it</button><button id="genQuitNo">Keep it</button>';
    document.getElementById('genQuitNo').onclick = () => campMenu();
    document.getElementById('genQuitYes').onclick = () => {
      const rec = live || campRead(); if (rec) rec.closed = true; campClear();
      if (CAMP) campStopHeal();
      if (rec && rec.seasons.length) { if (!CAMP || CAMP.rec !== rec) { campLeave(); CAMP = { rec, saved: false }; } menuEl.hidden = true; campFinal(true); }
      else { campLeave(); document.getElementById('menuBack').hidden = true; campMenu(); } // (Back would carry on a season of no campaign)
    };
  };
}
// the menu's Generations button picks up a campaign this page is already in (between seasons, or mid-season), else the saved one
function campMenuPick() {
  if (CAMP && CAMP.between && CAMP.between !== 'final') { menuEl.hidden = true; endEl.hidden = false; return; } // back to the card
  if (CAMP && !CAMP.between) { newGame('run', CAMP); return; } // mid-season: that season over, as Reset does (storage may not have it)
  campLeave(); campStart();
}
campMenu();
