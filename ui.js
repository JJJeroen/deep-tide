// ---------- UI ----------
const rowsEl = document.getElementById('rows');
for (const sp of SPECIES) {
  const r = document.createElement('div'); r.className = 'row'; r.id = 'row' + sp.i;
  r.innerHTML = `<span class="dot" style="background:${sp.color}"></span><span class="nm">${sp.name}</span><canvas class="spark" width="120" height="28"></canvas><span class="n">0</span>`;
  if (sp.invasive) r.style.display = 'none';
  rowsEl.appendChild(r);
}
const stockSel = document.getElementById('stockSel');
stockSel.innerHTML = '';
for (const sp of NATIVE) { const o = document.createElement('option'); o.value = sp.i; o.textContent = sp.name; stockSel.appendChild(o); }
stockSel.value = GRAZER;
const logEl = document.getElementById('log');
let logShown = 0, uiTick = 0;

const HINTS = {
  watch: 'Just watch. Sit with it for a minute before you touch anything. Point at an animal to see how it is doing.',
  net: 'Hold and drag to net fish. Plankton slips through.',
  trawl: 'Click a depth. A trawler sweeps the whole width and takes everything in its path.',
  pollute: 'Hold and paint. Pollution spreads and fades slowly.',
  invader: 'Click to release a few invaders. Nothing here has ever met them.',
  stock: 'Click to add the selected species. Rebuild from the bottom: plankton, then grazers, then what eats them.',
};
// the scored run: same tools, but now each one has a price and a payoff
const HINTS_RUN = {
  watch: 'The fleet needs catch every minute. Grazers pay 1, hunters 4, jellyfish half. Turtles, sharks and mantas are protected. Point at an animal to see it.',
  net: 'Hold and drag to net. Picky, slow, and you choose what comes up. Protected animals in the net still die.',
  trawl: 'Click a depth. Fast, a full hold in seconds, and everything in the band dies: bycatch, young fish, the lot.',
  pollute: 'Hold to dump waste: a disposal contract pays ' + RUN.DUMP_PAY + ' toward the quota per second. The water remembers.',
  invader: 'Click to let a ship skip ballast treatment: +' + RUN.BALLAST_PAY + ' toward the quota, one ship a minute. What rides in the ballast stays.',
  stock: 'Locked in this run. Nobody is coming to restock it.',
};

let mode = null; // null (menu, ambient sandbox behind it) | 'learn' | 'sandbox' | 'run' ('learn' is the sandbox with coach.js steps)
const menuEl = document.getElementById('menu'), endEl = document.getElementById('end'), hudEl = document.getElementById('hud');
const tempEl = document.getElementById('temp');
const fmtClock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function newGame(m) {
  mode = m; paused = false; speedMul = 1; acc = 0; ptr.down = false;
  resetScene();
  document.getElementById('pause').textContent = 'Pause'; document.getElementById('pause').classList.remove('on');
  document.getElementById('speed').textContent = '1×';
  resetWorld(); resetDeep(); cam.target = -SKY; logShown = 0; logEl.innerHTML = ''; LIFTS.length = 0; TAGS.length = 0; SAILING.length = 0; seenTrawlers = []; inspect = null;
  for (const b of document.querySelectorAll('#bar [data-tool]')) b.classList.remove('pulse');
  const run = m === 'run';
  if (run) startRun(); else S.temp = 0.5;
  tempEl.value = Math.round(S.temp * 100); tempEl.disabled = run;
  tempEl.parentElement.title = run ? 'The water warms on its own in this run' : '';
  document.querySelector('[data-tool=stock]').disabled = run; stockSel.disabled = run;
  document.querySelector('[data-tool=stock]').title = run ? 'Locked in the Anthropocene run' : '';
  document.querySelector('[data-tool=pollute]').textContent = run ? 'Dump waste' : 'Pollute';
  document.querySelector('[data-tool=invader]').textContent = run ? 'Skip ballast' : 'Release invader';
  document.getElementById('tagline').textContent = run ? 'Anthropocene run' : m === 'learn' ? 'Learn to play' : 'A small ocean that runs without you.';
  document.getElementById('hudDur').textContent = '/ ' + fmtClock(RUN.DUR);
  hudEl.hidden = !run; menuEl.hidden = true; endEl.hidden = true;
  setTool('watch');
  coachReset(m);
}

function updateHud() {
  const g = S.game;
  if (!g.on) return;
  const t = Math.min(S.t, RUN.DUR), mins = RUN.DUR / RUN.MINUTE, m = Math.min(g.minute, mins - 1), demand = demandAt(m);
  const haul = g.over && g.mins.length ? g.mins[g.mins.length - 1].haul : g.haul; // after 10:00, keep showing the last minute
  document.getElementById('hudClock').textContent = fmtClock(t);
  document.getElementById('hudMin').textContent = 'Minute ' + (m + 1) + '/' + mins;
  document.getElementById('hudHaul').textContent = Math.floor(haul);
  document.getElementById('hudDemand').textContent = demand;
  const bar = document.getElementById('hudBar');
  bar.firstElementChild.style.width = Math.min(100, haul / demand * 100) + '%';
  bar.classList.toggle('met', haul >= demand);
  const met = g.mins.filter(x => x.ok).length, missed = g.mins.length - met;
  let sub = 'Met ' + met + ' · short ' + missed + (g.bycatch ? ' · protected caught ' + g.bycatch : '') + '<br>Warmth ' + Math.round(S.temp * 100) + '% and rising';
  if (g.bankrupt) sub += '<br><span class="warn">The fleet is bankrupt.</span>';
  else if (g.streak > 0) sub += '<br><span class="warn">' + g.streak + ' short in a row. ' + RUN.BANKRUPT_AFTER + ' and the fleet goes under.</span>';
  document.getElementById('hudSub').innerHTML = sub;
  tempEl.value = Math.round(S.temp * 100);
  const wait = RUN.BALLAST_EVERY - (S.t - g.ballastAt);
  document.querySelector('[data-tool=invader]').textContent = wait > 0 && !g.over ? 'Skip ballast (' + Math.ceil(wait) + 's)' : 'Skip ballast';
}

function showEnd() {
  const r = S.game.result;
  if (!r || !endEl.hidden) return;
  const pct = v => Math.round(v * 100) + '%', list = a => a.length ? a.join(', ') : 'none';
  logEl.innerHTML = ''; // the run's messages would pile up behind the card
  // species gone at the end, shown as faded silhouettes
  const ghost = name => {
    const sp = NATIVE.find(s => s.name === name), spr = sp && SPRITES[sp.i];
    if (!spr) return name;
    const c = document.createElement('canvas'), f = spr.frames[0];
    c.width = f.width; c.height = f.height; c.getContext('2d').drawImage(f, 0, 0);
    return `<span class="ghost"><img src="${c.toDataURL()}" alt="">${name}</span>`;
  };
  const lost = r.lost.length ? r.lost.map(ghost).join(' ') : 'none';
  const st = RUN.STEWARD;
  document.getElementById('endCard').innerHTML = `
    <h2>${fmtClock(RUN.DUR)}. The season is over.</h2>
    <p class="verdict">${r.verdict}</p>
    <div class="bigscore">${r.score}</div><p style="margin-top:0">points</p>
    <table>
      <tr><td>Catch delivered</td><td>${Math.round(r.delivered)} of ${r.quotaTotal} demanded · quota met ${r.met} of ${r.minutes} minutes</td></tr>
      <tr><td>Where it came from</td><td>fish ${Math.round(r.fish)} · waste contracts ${Math.round(r.dumped)} · ballast ${Math.round(r.ballast)}</td></tr>
      <tr><td>Biodiversity</td><td>${pct(r.bio)}</td></tr>
      <tr><td>Water quality</td><td>${pct(r.water)}</td></tr>
      <tr><td>Gone at the end</td><td>${lost}</td></tr>
      <tr><td>Lost, then came back</td><td>${list(r.recovered)}</td></tr>
      <tr><td>Protected animals caught</td><td>${r.bycatch}</td></tr>
    </table>
    <h3>How the score adds up</h3>
    <table>${r.parts.filter(p => p.pts || p.label.startsWith('Quota') || p.label.startsWith('Bio') || p.label.startsWith('Water'))
      .map(p => `<tr><td>${p.label}</td><td class="${p.pts < 0 ? 'neg' : ''}">${p.pts > 0 ? '+' : ''}${p.pts}</td></tr>`).join('')}</table>
    <p><b style="color:var(--text)">What would the steward have done?</b> Left the nets dry. That typically ends around
      <b style="color:var(--text)">${st.score}</b> points: biodiversity ${pct(st.bio)}, no quota delivered, the fleet bankrupt.</p>
    <div class="actions"><button id="again" class="on">Play again</button><button id="toSandbox">Sandbox</button></div>`;
  endEl.hidden = false;
  document.getElementById('again').onclick = () => newGame('run');
  document.getElementById('toSandbox').onclick = () => newGame('sandbox');
}

function updateUI() {
  if ((uiTick++ % 6) === 0) {
    if (mode === 'run') updateHud();
    document.querySelector('[data-tool=stock]').classList.toggle('pulse', S.flags.stockPulse && tool !== 'stock' && mode !== 'run');
    for (const sp of SPECIES) {
      const row = document.getElementById('row' + sp.i);
      row.querySelector('.n').textContent = S.counts[sp.i];
      row.classList.toggle('extinct', S.counts[sp.i] === 0 && S.peak[sp.i] > 0 && (sp.plant || sp.invasive || !sp.recolonize || S.harmed[sp.i] === 1));
      if (sp.invasive) row.style.display = S.peak[sp.i] > 0 ? '' : 'none';
    }
    document.getElementById('bioN').textContent = Math.round(biodiversity() * 100) + '%';
    document.getElementById('waterN').textContent = Math.round(waterQuality() * 100) + '%';
    const dc = D.counts; // the deep, in one line
    document.getElementById('deepN').innerHTML = `${dc.lantern} lanternfish · ${dc.angler} anglerfish · ${dc.squid} giant squid · ${dc.hagfish + dc.crab} scavengers` + (D.whale ? ' · <b>a sperm whale</b>' : '') + (D.falls.length ? ' · <b>a whale fall</b>' : '');
    measureChrome(); updateDepthBtn();
    drawSparks();
    coachTick();
    // narrow screens: the log sits under the title panel (whose height changes with the run HUD) instead of over it
    logEl.style.top = innerWidth <= 760 ? Math.round(titleEl.getBoundingClientRect().bottom + 8) + 'px' : '';
  }
  while (logShown < S.events.length) {
    const e = S.events[logShown++], d = document.createElement('div');
    d.textContent = e.msg; d.className = e.kind; logEl.appendChild(d);
    while (logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1600); }, 11000);
  }
}

// one small trend line per species row: the last 300 s, drawn from the left so it grows from t = 0,
// scaled to that species' own peak; time spent at zero shows as a red line along the bottom
const titleEl = document.getElementById('title');
function drawSparks() {
  const h = S.hist;
  for (const sp of SPECIES) {
    const cv = document.querySelector('#row' + sp.i + ' .spark'), g = cv.getContext('2d'), W = cv.width, H = cv.height, t = sp.i;
    g.clearRect(0, 0, W, H);
    if (h.length < 2) continue;
    const mx = Math.max(1, S.peak[t]), X = i => i / 299 * W, Y = v => H - 3 - (v / mx) * (H - 6);
    g.lineWidth = 2.5; g.lineJoin = 'round'; g.strokeStyle = COL[t]; g.beginPath();
    h.forEach((s, i) => i ? g.lineTo(X(i), Y(s[t])) : g.moveTo(X(i), Y(s[t])));
    g.stroke();
    if (S.peak[t] > 0) {
      g.strokeStyle = '#ff6b8a'; g.lineWidth = 3;
      h.forEach((s, i) => { if (s[t] === 0 && i) { g.beginPath(); g.moveTo(X(i - 1), H - 1.5); g.lineTo(X(i), H - 1.5); g.stroke(); } });
    }
  }
}

function setTool(t) {
  if (t === 'stock' && mode === 'run') return; // locked in the scored run
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  document.getElementById('hint').textContent = (mode === 'run' ? HINTS_RUN : HINTS)[t];
}
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.getElementById('stockSel').addEventListener('change', () => setTool('stock'));
tempEl.addEventListener('input', e => { if (mode !== 'run') S.temp = e.target.value / 100; });
document.getElementById('pause').addEventListener('click', e => { if (S.game.over) return; paused = !paused; e.target.textContent = paused ? 'Resume' : 'Pause'; e.target.classList.toggle('on', paused); });
document.getElementById('speed').addEventListener('click', e => { speedMul = speedMul === 1 ? 2 : speedMul === 2 ? 4 : speedMul === 4 ? 0.5 : 1; e.target.textContent = speedMul + '×'; });
document.getElementById('reset').addEventListener('click', () => newGame(mode || 'sandbox')); // in the run: start the run over
let pausedBeforeMenu = false;
document.getElementById('menuBtn').addEventListener('click', () => {
  if (!menuEl.hidden) return;
  pausedBeforeMenu = paused; paused = true; ptr.down = false; // the run holds still while the menu is up
  endEl.hidden = true; menuEl.hidden = false; document.getElementById('menuBack').hidden = !mode;
});
document.querySelector('#menuBack button').addEventListener('click', () => {
  menuEl.hidden = true;
  if (S.game.over) endEl.hidden = false; else paused = pausedBeforeMenu;
});
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => newGame(b.dataset.mode)));
document.getElementById('hintsBtn').addEventListener('click', () => setHints(!hintsOn));
setHints(hintsOn);
document.getElementById('soundBtn').addEventListener('click', () => setSound(!SOUND.on, true));
setSound(SOUND.on);
// first visit: point new players at the tutorial
if (!store.get('deeptide.learned')) document.querySelector('[data-mode=learn]').classList.add('first');

view.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !e.isPrimary) return;
  const p = toWorld(e); ptr.x = p.x; ptr.y = p.y; ptr.cx = e.clientX; ptr.cy = e.clientY; ptr.down = true; ptr.inside = true; ptr.mouse = e.pointerType === 'mouse';
  view.setPointerCapture(e.pointerId);
  drag.sy = e.clientY; drag.cy = cam.y; drag.on = false;
  if (tool !== 'watch' && p.y > WH) { // the tools only reach the sunlit water
    ptr.down = false;
    if (!S.flags.deepTools) { S.flags.deepTools = true; log('Your tools only reach the sunlit water. The deep is for watching.'); }
    return;
  }
  if (tool === 'watch') { const r = e.pointerType === 'mouse' ? 36 : 60, a = pickAnimal(p.x, p.y, r) || pickDeep(p.x, p.y, r); inspect = a ? { a, until: performance.now() + 4000 } : null; }
  else if (tool === 'trawl') startTrawl(p.y);
  else if (tool === 'invader') {
    if (!releaseInvaders(p.x, p.y)) log('No ship in port yet. The next one is in ' + Math.ceil(RUN.BALLAST_EVERY - (S.t - S.game.ballastAt)) + ' s.');
    else if (mode === 'run') {
      ballastShip(p.x, p.y);
      log('A ship flushed its ballast untreated: +' + RUN.BALLAST_PAY + ' toward the quota. Something that doesn\'t belong here came with it.', 'warn');
    }
    else log('Something that doesn\'t belong here has been released.', 'warn');
  }
  else if (tool === 'stock') { S.flags.stockPulse = false; const t = +document.getElementById('stockSel').value; spawnMany(t, p.x, p.y, SPECIES[t].stock); }
});
view.addEventListener('pointermove', e => {
  const p = toWorld(e); ptr.x = p.x; ptr.y = p.y; ptr.cx = e.clientX; ptr.cy = e.clientY; ptr.inside = true; ptr.mouse = e.pointerType === 'mouse';
  // dragging with Watch scrolls the column (a tap still picks an animal)
  if (ptr.down && tool === 'watch' && (drag.on || Math.abs(e.clientY - drag.sy) > 8)) {
    drag.on = true; inspect = null;
    cam.target = cam.y = clampCam(drag.cy - (e.clientY - drag.sy) / scale);
  }
});
view.addEventListener('wheel', e => { e.preventDefault(); cam.target = clampCam(cam.target + e.deltaY * (e.deltaMode === 1 ? 40 : 1) / scale); }, { passive: false });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) view.addEventListener(ev, () => { ptr.down = false; drag.on = false; });
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointerleave', () => { ptr.inside = false; });
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(SELECT|INPUT)$/.test(e.target.tagName) || (e.key === ' ' && e.target.tagName === 'BUTTON')) return;
  if (!menuEl.hidden || !endEl.hidden) return; // the mode picker / end screen is up
  const k = { w: 'watch', n: 'net', t: 'trawl', p: 'pollute', i: 'invader', s: 'stock' }[e.key.toLowerCase()];
  if (k) setTool(k); else if (e.key === ' ') { e.preventDefault(); document.getElementById('pause').click(); }
  else if (e.key.toLowerCase() === 'h') setHints(!hintsOn);
  else if (e.key.toLowerCase() === 'm' && !e.repeat) setSound(!SOUND.on, true);
  else if (CAM_KEYS[e.key] !== undefined) { e.preventDefault(); cam.target = clampCam(CAM_KEYS[e.key] === 'top' ? -SKY : CAM_KEYS[e.key] === 'bottom' ? camMax() : cam.target + CAM_KEYS[e.key] * innerHeight / scale); }
});
const CAM_KEYS = { ArrowDown: 0.25, ArrowUp: -0.25, PageDown: 0.85, PageUp: -0.85, Home: 'top', End: 'bottom' };
// the depth button: dive to the deep, or come back up
const depthBtn = document.getElementById('depthBtn');
depthBtn.addEventListener('click', () => { cam.target = cam.y > 300 ? -SKY : clampCam(yAtDepth(1000) - innerHeight / scale * 0.4); });
function updateDepthBtn() {
  const fits = camMax() <= -SKY + 1; depthBtn.hidden = fits || !menuEl.hidden;
  const deep = cam.y > 300; depthBtn.textContent = deep ? 'Surface ↑' : 'The deep ↓'; depthBtn.classList.toggle('pulse', !deep && !!D.whale && D.whale.phase !== 'surface' && D.whale.phase !== 'leave');
}

resetWorld(); resetDeep(); setTool('watch'); requestAnimationFrame(frame); // the ocean runs behind the mode picker until a mode is chosen
