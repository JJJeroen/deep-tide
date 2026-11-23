#!/usr/bin/env node
// Browser smoke test for Deep Tide: loads index.html in headless Chromium and drives it the way a player would
// (mode picker, tool keys, clicks on the water, scrolling into the deep, a phone viewport), then checks game state.
//   cd tools && npm install          (once: playwright-core only, it does not download a browser)
//   node tools/smoke.js [--shots <dir>] [--only generations,phone]   (--only: run just those sections, for working on one)
// Browser: $CHROME_PATH, else the newest Playwright Chromium in ~/.cache/ms-playwright (npx playwright install chromium).
// Exit code 0 = all checks passed. Frame times are printed for information only (headless timing is too noisy to gate on).
const fs = require('fs'), path = require('path'), os = require('os');
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.error('playwright-core missing: run `npm install` in tools/'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..'), URL = 'file://' + path.join(ROOT, 'index.html');
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
const oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? process.argv[oi + 1].split(',') : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]) : [];
  for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
    const p = path.join(base, d, sub); if (fs.existsSync(p)) return p;
  }
  return undefined; // let playwright-core look for itself
}

const results = []; let errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  (' + detail + ')' : '')); };
const shot = (p, name) => SHOTS ? p.screenshot({ path: path.join(SHOTS, name + '.png') }) : null;
const wait = (p, ms) => p.waitForTimeout(ms);
// world coordinates -> page pixels (ox/oy/scale are render.js globals)
const toPage = (p, x, y) => p.evaluate(([x, y]) => ({ x: ox + x * scale, y: oy + y * scale }), [x, y]);
const count = (p, expr) => p.evaluate(expr);

async function openPage(b, w, h, phone) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 3 : 1, isMobile: !!phone, hasTouch: !!phone });
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(URL);
  return p;
}
function errorCheck(name) { check(name + ': no page or console errors', !errors.length, errors.slice(0, 3).join(' | ')); errors = []; }

async function desktop(b) {
  console.log('desktop 1600x900');
  const p = await openPage(b, 1600, 900);
  await wait(p, 500);
  check('mode picker is shown', await p.isVisible('#menu'));
  await shot(p, '0-menu');
  check('desktop: the reef shelf clears the toolbar, the whole width shows', await count(p, () => !panMode && oy + FRAME_Y * scale <= innerHeight - barH + 1),
    await count(p, () => 'shelf ' + Math.round(oy + FRAME_Y * scale) + ' / bar ' + Math.round(innerHeight - barH)));

  // sandbox: the sim runs and every tool does something
  await p.click('[data-mode=sandbox]');
  await p.evaluate(() => setHints(false));
  const t0 = await count(p, () => S.t); await wait(p, 1000);
  check('sandbox: the simulation advances', (await count(p, () => S.t)) > t0 + 0.5);
  check('desktop: tools keep their full names, the hint shows in full, Warmth stays in the bar', await count(p, () =>
    document.querySelector('[data-tool=invader]').innerText === 'Release invader' && document.querySelector('[data-tool=reserve]').innerText === 'Protected area'
    && getComputedStyle(hintEl).whiteSpace !== 'nowrap' && !!document.getElementById('temp').offsetParent && !!pollSel.offsetParent && !!document.getElementById('exclBtn').offsetParent));
  check('sandbox: native species are present', await count(p, () => NATIVE.every(sp => S.counts[sp.i] > 0)), await count(p, () => NATIVE.map(sp => sp.id + ' ' + S.counts[sp.i]).join(', ')));

  await p.keyboard.press('t'); const tr = await toPage(p, 800, 400); await p.mouse.click(tr.x, tr.y); await wait(p, 300);
  check('trawl tool sends out a trawler', await count(p, () => S.trawlers.length > 0));
  const bt = await toPage(p, 800, 790); await p.mouse.click(bt.x, bt.y); await wait(p, 2500);
  await p.evaluate(() => { loseNet(1000, 300); S.ghosts[0].held.push({ t: GRAZER, dx: 5, dy: 3, ang: 1 }); }); await wait(p, 400);
  check('a lost net drifts and is drawn', await count(p, () => S.ghosts.length >= 1 && S.ghosts[0].age > 0));
  check('a net lost inside the reef rests on top of it', await count(p, () => { loseNet(300, 820); step(1 / 30); const g = S.ghosts[S.ghosts.length - 1]; return g.y <= bedAt(g.x) - 8 + 1e-6; }));
  check('a trawl set near the floor scars the reef', await count(p, () => S.scar[2] > 0.3), 'scar ' + (await count(p, () => S.scar[2])).toFixed(2));

  // count what the net takes (netAt is a global function declaration, so render.js picks up the wrapper)
  await p.evaluate(() => { window.__netted = 0; const real = netAt; netAt = (x, y, r) => { const n = real(x, y, r); window.__netted += n; return n; }; });
  await p.keyboard.press('n');
  for (let k = 0; k < 6 && !(await count(p, () => window.__netted)); k++) {
    const g = await count(p, () => { const a = S.agents.find(a => !a.dead && a.t === GRAZER); return { x: a.x, y: a.y }; });
    const q = await toPage(p, g.x, g.y); await p.mouse.move(q.x, q.y); await p.mouse.down(); await wait(p, 200); await p.mouse.up(); await wait(p, 100);
  }
  check('net tool catches animals', await count(p, () => window.__netted > 0), 'caught ' + await count(p, () => window.__netted));

  await p.keyboard.press('p'); const po = await toPage(p, 600, 300);
  await p.mouse.move(po.x, po.y); await p.mouse.down(); await p.mouse.move(po.x + 120, po.y, { steps: 6 }); await wait(p, 300); await p.mouse.up();
  check('pollute tool fouls the water', await count(p, () => pollAt(600, 300) > 0 || pollAt(660, 300) > 0));
  // M8.5: P again switches to runoff; runoff feeds a bloom whose rot leaves a dead zone; jellies don't mind it
  await p.keyboard.press('p');
  check('runoff: P again switches the kind', await count(p, () => POLL_KIND === 'runoff' && pollSel.value === 'runoff' && /fertiliser/.test(document.getElementById('hint').textContent)));
  const ro = await toPage(p, 900, 250);
  await p.mouse.move(ro.x, ro.y); await p.mouse.down(); await p.mouse.move(ro.x + 120, ro.y, { steps: 6 }); await wait(p, 300); await p.mouse.up();
  check('runoff tool fertilises the water (not plastic)', await count(p, () => S.wqOn && S.nutr[pollIdx(900, 250)] + S.nutr[pollIdx(960, 250)] > 0.05 && pollAt(960, 250) < 0.01)); // (plastic from the check above diffuses everywhere a little)
  check('runoff: bloom, then a dead zone', await count(p, () => {
    for (let x = 0; x <= 1600; x += 40) for (const y of [220, 420]) for (let k = 0; k < 8; k++) addRunoff(x, y, RUNOFF.r, RUNOFF.amt);
    let bloom = 0; for (let i = 0; i < 30 * 150; i++) { step(1 / 30); bloom = Math.max(bloom, S.bloomN); }
    return bloom > 100 && S.hypFrac > 0.01 && waterQuality() < 0.9;
  }), await count(p, () => 'dead zone ' + (S.hypFrac * 100).toFixed(1) + '%, water ' + Math.round(waterQuality() * 100) + '%'));
  await wait(p, 300); // drawn for a few frames: drained to grey, with its top edge (page errors are counted below)
  check('runoff: the dead zone is drawn with a top edge', await count(p, () => DZ.some(v => v >= 0.5) && drawDeadTop() > 0));
  check('runoff: a grazer in the dead zone gasps, a jelly does not', await count(p, () => {
    let i = 0; for (let k = 1; k < S.odef.length; k++) if (S.odef[k] > S.odef[i]) i = k;
    const x = (i % GCOLS + 0.5) * GC, y = ((i / GCOLS | 0) + 0.5) * GC;
    // the same animal on the same spot with the oxygen cost on and off; neighbours hidden, so nothing is eaten or fled from
    const hash = S.hash; S.hash = hash.map(() => []);
    const e = (t, cost) => { const c0 = OXY.cost; OXY.cost = cost; const a = makeAgent(t, x, y); a.e = 50; updMobile(a, 1); OXY.cost = c0; return a.e; };
    const r = S.odef[i] > 0.7 && e(GRAZER, 0) - e(GRAZER, OXY.cost) > 1 && e(JELLY, 0) === e(JELLY, OXY.cost);
    S.hash = hash; return r;
  }));
  await p.evaluate(() => { S.nutr.fill(0); S.rot.fill(0); S.odef.fill(0); S.wqOn = false; S.avgHyp = 0; S.hypFrac = 0; }); // the later checks need a living ocean
  await p.keyboard.press('p'); // back to plastic for the rest of the test

  // released well above the trawl band (y 400): the trawler still sweeping there would net them within 300 ms
  await p.keyboard.press('i'); const iv = await toPage(p, 1200, 150); await p.mouse.click(iv.x, iv.y); await wait(p, 300);
  check('invader tool releases invaders', await count(p, () => S.counts[INVADER] > 0));
  // M8.4: protected area (drag), excluder (toggle), hauling up a lost net (Watch click)
  await p.keyboard.press('a'); const m0 = await toPage(p, 900, 300), m1 = await toPage(p, 1250, 300);
  await p.mouse.move(m0.x, m0.y); await p.mouse.down(); await p.mouse.move(m1.x, m1.y, { steps: 8 }); await p.mouse.up(); await wait(p, 100);
  check('protected area: a drag marks the strip', await count(p, () => S.mpa && S.mpa.x0 === 900 && S.mpa.x1 === 1250), JSON.stringify(await count(p, () => S.mpa)));
  check('protected area: nets and trawls take nothing inside it', await count(p, () => {
    // record everything the gear takes (harvest is a global function declaration, so the wrapper is what stepTools calls)
    S.trawlers.length = 0; spawnMany(GRAZER, 1075, 450, 10);
    const taken = [], real = harvest; harvest = (a, c) => { taken.push(a.x); return real(a, c); };
    const netted = netAt(1075, 450, 50); startTrawl(450); for (let i = 0; i < 30 * 6; i++) step(1 / 30);
    harvest = real;
    return netted === 0 && taken.length > 0 && taken.every(x => !inMpa(x)); // the trawl fished either side of the strip, never in it
  }));
  const mc = await toPage(p, 1075, 600); await p.mouse.click(mc.x, mc.y); await wait(p, 100);
  check('protected area: a click inside lifts it', await count(p, () => S.mpa === null));
  await p.keyboard.press('e');
  check('excluder: E switches it on', await count(p, () => EXCLUDER.on && document.getElementById('exclBtn').getAttribute('aria-pressed') === 'true'));
  check('excluder: most protected animals in the band get out', await count(p, () => {
    S.trawlers.length = 0; for (const a of S.agents) if (a.t === IDX.turtle) a.dead = true; S.agents = S.agents.filter(a => !a.dead); countAll();
    spawnMany(IDX.turtle, 800, 450, 12); const turtles = S.agents.filter(a => a.t === IDX.turtle);
    for (const a of turtles) { a.y = 450; a.x = 300 + Math.random() * 1000; }
    startTrawl(450); const tr = S.trawlers[0]; for (let i = 0; i < 30 * 6; i++) step(1 / 30);
    return tr.excl && turtles.filter(a => !a.dead).length >= 7;
  }), await count(p, () => S.agents.filter(a => a.t === IDX.turtle).length + ' turtles alive'));
  await p.keyboard.press('e');
  await p.keyboard.press('w'); await p.evaluate(() => { S.ghosts.length = 0; loseNet(1300, 200); S.ghosts[0].vx = 0; });
  const gp = await count(p, () => ({ x: ox + S.ghosts[0].x * scale, y: oy + S.ghosts[0].y * scale }));
  await p.mouse.click(gp.x, gp.y); await wait(p, 300);
  check('ghost net: a Watch click hauls it up', await count(p, () => S.ghosts.length === 0 && HAULED.length === 1));
  await shot(p, '1-sandbox-tools');

  // the deep: the depth button dives, End reaches the floor, Home comes back up
  await p.keyboard.press('w'); await p.mouse.move(5, 5);
  await p.click('#depthBtn'); await wait(p, 1500);
  check('depth button scrolls into the deep', await count(p, () => cam.y > 300), 'cam.y ' + Math.round(await count(p, () => cam.y)));
  check('the deep is populated', await count(p, () => D.agents.length > 0));
  await p.keyboard.press('End'); await wait(p, 1500);
  check('End reaches the sea floor', await count(p, () => cam.y > camMax() - 20));
  await shot(p, '2-floor');
  await p.keyboard.press('n'); await p.mouse.click(800, 450); await wait(p, 200); // mid-screen, which is deep water now
  check('tools refuse below the sunlit water', await count(p, () => S.flags.deepTools === true));
  await p.keyboard.press('w'); await p.keyboard.press('Home'); await wait(p, 1500);
  check('Home returns to the surface', await count(p, () => cam.y < 0));

  // frame times at the top and in the deep (information only)
  const ft = [];
  for (const deep of [false, true]) {
    if (deep) { await p.evaluate(() => { cam.target = yAtDepth(1200) - 200; }); await wait(p, 1500); }
    ft.push(await p.evaluate(async () => { const ts = []; let last = performance.now();
      await new Promise(res => { let n = 0; const f = now => { ts.push(now - last); last = now; if (++n < 90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      ts.sort((a, b) => a - b); return ts[45].toFixed(1); }));
  }
  console.log('  info frame time median: top ' + ft[0] + ' ms, deep ' + ft[1] + ' ms');
  errorCheck('sandbox');

  // sound starts after the first gesture and M toggles it
  check('sound: audio context exists after a gesture', await count(p, () => !!SOUND.ac));
  const on = await count(p, () => SOUND.on); await p.keyboard.press('m'); await wait(p, 200);
  check('sound: M toggles it', (await count(p, () => SOUND.on)) === !on);
  await p.keyboard.press('m');

  // learn mode: the coach appears on step 1 (entered with Pollute picked: a new game must reset the whole toolbar)
  await p.keyboard.press('p'); await wait(p, 100);
  await p.click('#menuBtn'); await p.click('[data-mode=learn]'); await wait(p, 600);
  check('a new game with Pollute picked resets the toolbar whole', await count(p, () =>
    document.querySelectorAll('#bar button[data-tool]').length === 7 && document.querySelector('[data-tool=pollute]').textContent === 'Pollute' && tool === 'watch'));
  check('learn mode: the coach shows step 1', await count(p, () => !document.getElementById('coach').hidden && C.L.step === 0), await count(p, () => 'step ' + C.L.step));
  await shot(p, '3-learn');
  errorCheck('learn');

  // scored run: HUD up, ballast ship, then fast-forward to the end screen (entered with Stock picked)
  await p.keyboard.press('s'); await wait(p, 100);
  await p.click('#menuBtn'); await p.click('[data-mode=run]'); await wait(p, 500);
  check('run: HUD shows', await p.isVisible('#hud'));
  check('run: stock tool is locked', await p.isDisabled('[data-tool=stock]'));
  check('run: pollute reads Dump, with waste and farm runoff', await count(p, () => document.querySelector('[data-tool=pollute]').textContent === 'Dump' && pollSel.options[1].textContent === 'farm runoff'));
  await p.keyboard.press('i'); await wait(p, 400); // the HUD relabels Skip ballast with its countdown
  check('run: picking Skip ballast leaves the toolbar whole', await count(p, () =>
    document.querySelectorAll('#bar button[data-tool]').length === 7 && /^Skip ballast/.test(document.querySelector('[data-tool=invader]').textContent)));
  await p.keyboard.press('w');
  check('run: a new game starts with clean, fully oxygenated water', await count(p, () => !S.wqOn && S.avgHyp === 0 && waterQuality() === 1));
  await p.evaluate(() => { setHints(true); for (let i = 0; i < 30 * 61; i++) step(1 / 30); }); // a first minute with no catch
  check('run: a short minute sends head office\'s trawler', await count(p, () => S.trawlers.some(t => t.company) && S.game.companyTrips === 1));
  await p.waitForFunction(() => !S.trawlers.some(t => t.company), null, { timeout: 15000 }).catch(() => {}); await wait(p, 500);
  check('run: head office\'s pass raises none of the player\'s trawl tips', await count(p, () => !['trawl', 'prot', 'scar'].some(id => C.shown.has(id))),
    await count(p, () => [...C.shown].join(',')));
  await p.evaluate(() => setHints(false));
  await p.evaluate(() => { for (let i = 0; i < 30 * 536; i++) step(1 / 30); }); // sim to just before the end, then let the page finish it
  await p.waitForFunction(() => !document.getElementById('end').hidden, null, { timeout: 15000 }).catch(() => {});
  check('run: end screen appears after 10:00', await p.isVisible('#end'));
  check('run: end screen has a verdict', await count(p, () => document.getElementById('endCard').innerText.trim().length > 40));
  check('run: end screen names the ocean and links to it', await count(p, () => /^[0-9a-z]{6}$/.test(SEED) && document.getElementById('endCard').innerText.includes('ocean ' + SEED + '.') && !!document.querySelector(`#endCard a[href="?seed=${SEED}"]`)));
  await shot(p, '4-end');
  errorCheck('run');
  await p.close();
}

// M9 seeded oceans: the same seed starts the same ocean, in the page and headless (tune.js loads sim.js the same way)
const FP = `(() => { let h = 0, d = 0; for (const a of S.agents) h = (h * 31 + Math.round(a.x * 1000) + Math.round(a.y * 7)) % 1e15;
  for (const a of D.agents) d = (d * 31 + Math.round(a.x * 1000)) % 1e15; return JSON.stringify({ n: S.agents.length, c: S.counts, h, dn: D.agents.length, d }); })()`;
const SEEDED = (seed, n = 900) => `(() => { resetWorld(${JSON.stringify(seed)}); resetDeep(); S.temp = 0.5; for (let i = 0; i < ${n}; i++) { step(1 / 30); stepDeep(1 / 30); } return ${FP}; })()`;
function simContext(math = Math) {
  const vm = require('vm'), ctx = vm.createContext({ Math: math, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sim.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'deep.js'), 'utf8'), ctx);
  return { ctx, run: code => vm.runInContext(code, ctx) };
}
const headless = (seed, n) => simContext().run(SEEDED(seed, n));
// every tool path, headless, with a Math whose random() throws: nothing in sim.js or deep.js may still call it
function noMathRandom() {
  const math = Object.create(Math, { random: { value: () => { throw new Error('Math.random called by the sim'); } } });
  const { run } = simContext(math);
  try {
    run(`resetWorld('tools'); resetDeep(); startRun();
      const act = { 30: () => startTrawl(450), 90: () => { EXCLUDER.on = true; startTrawl(790); }, 150: () => loseNet(700, 300), 180: () => releaseInvaders(800, 300),
        210: () => spawnMany(INVADER, 400, 300, 3), 240: () => setMpa(0, 400), 300: () => { for (const g of S.ghosts.slice()) retrieveGhost(g); } };
      for (let k = 0; k < 30 * 330; k++) {
        if (act[k / 30]) act[k / 30]();
        if (k % 30 === 0) netAt(1000, 300, 50);
        if (k >= 30 * 100 && k < 30 * 110) dumpAt(800, 220, 1 / 30, 'runoff');
        if (k >= 30 * 120 && k < 30 * 125) dumpAt(500, 400, 1 / 30, 'plastic');
        step(1 / 30); stepDeep(1 / 30);
      }`);
    return '';
  } catch (e) { return e.message; }
}
async function seeds(b) {
  console.log('seeded oceans');
  const p = await openPage(b, 1280, 720);
  await p.click('[data-mode=sandbox]'); await wait(p, 300);
  const a = await p.evaluate(SEEDED('smoke-1')), a2 = await p.evaluate(SEEDED('smoke-1')), c = await p.evaluate(SEEDED('smoke-2'));
  check('seed: the same seed gives the same ocean after 30 s (sunlit and deep)', a === a2);
  check('seed: another seed gives another ocean', a !== c);
  check('seed: the page and headless node agree on the same seed', a === headless('smoke-1'), a.slice(0, 60));
  const leak = noMathRandom();
  check('seed: no sim or deep code path calls Math.random (every tool, headless, 5.5 min)', !leak, leak);
  const twoFresh = await p.evaluate(() => { newGame('run'); const s1 = SEED; newGame('run'); return s1 !== SEED && /^[0-9a-z]{6}$/.test(SEED); });
  check('seed: without ?seed= every new game gets a fresh six-character seed', twoFresh);
  errorCheck('seed');
  await p.close();
  // ?seed= in the URL: cleaned to a-z 0-9 '-', and every game on the page starts from it
  const q = await b.newPage({ viewport: { width: 1280, height: 720 } });
  q.on('pageerror', e => errors.push(String(e)));
  await q.goto(URL + '?seed=Reef-7%3Cb%3E'); await q.click('[data-mode=run]'); await wait(q, 200);
  check('seed: ?seed= is cleaned and used', (await count(q, () => SEED)) === 'reef-7b', await count(q, () => SEED));
  const same = await q.evaluate(`(() => { newGame('run'); const f1 = ${FP}; newGame('run'); return f1 === ${FP}; })()`);
  check('seed: with ?seed= every new game starts the same ocean', same);
  // real frames: the page runs on its own for a few seconds, so anything drawing on the sim's stream per frame would show
  await q.evaluate(() => newGame('sandbox')); await wait(q, 3000);
  const live = await q.evaluate(`(() => { paused = true; return { n: Math.round(S.t * 30), f: ${FP} }; })()`);
  const ref = simContext(); ref.run(`resetWorld('reef-7b'); resetDeep(); S.temp = 0.5;`);
  check('seed: a page left running on real frames matches headless node step for step', live.n > 30 && live.f === ref.run(`(() => { for (let i = 0; i < ${live.n}; i++) { step(1 / 30); stepDeep(1 / 30); } return ${FP}; })()`), live.n + ' steps');
  errorCheck('seed url');
  await q.close();
}

// M9 follow one animal: a tap on an animal zooms the camera onto it, a card says how it is doing, a tap elsewhere / Esc / a tool
// / a drag / the wheel lets go; when it dies the card says how
const pickInView = (p) => p.evaluate(() => {
  const at = a => ({ x: ox + a.x * scale, y: oy + a.y * scale });
  const ok = a => { const q = at(a); return !a.dead && a.t !== PLANKTON && a.x > WW * 0.35 && a.x < WW * 0.65 && a.y > 60 && a.y < WH - 120 && q.x > 120 && q.x < innerWidth - 120 && q.y > topReserve + 80 && q.y < innerHeight - barH - 120; };
  const a = S.agents.filter(ok).sort((u, v) => SPECIES[v.t].size - SPECIES[u.t].size)[0]; // the biggest: nothing else within reach
  return { id: a.id, ...at(a) };
});
async function followMode(b) {
  console.log('follow one animal');
  const p = await openPage(b, 1600, 900);
  await p.goto(URL + '?seed=follow-1'); await p.click('[data-mode=run]'); await p.evaluate(() => setHints(false)); await wait(p, 1500);
  const base = await count(p, () => ({ s: baseScale, ox, oy }));
  let q = await pickInView(p);
  await p.mouse.move(q.x, q.y); await p.mouse.down(); await p.mouse.up(); await wait(p, 1600);
  const st = await count(p, () => { const a = FOLLOW.a; return { id: a && a.id, p: FOLLOW.p, s: scale, ax: ox + a.x * scale, ay: oy + a.y * scale, W: innerWidth, H: innerHeight, card: !document.getElementById('follow').hidden, cardTop: document.getElementById('follow').getBoundingClientRect().top, barTop: document.getElementById('bar').getBoundingClientRect().top, ins: !!inspect }; });
  await shot(p, 'f1-desktop-following');
  check('follow: a click on an animal follows exactly that animal and zooms in', st.id === q.id && st.p === 1 && st.s > base.s * 1.9, `scale ${base.s.toFixed(2)} -> ${st.s.toFixed(2)}`);
  check('follow: the animal sits in the middle of the free part of the screen', Math.abs(st.ax - st.W / 2) < 60 && st.ay > 150 && st.ay < st.cardTop, `at ${Math.round(st.ax)},${Math.round(st.ay)}`);
  check('follow: the card shows above the toolbar and replaces the hover label', st.card && st.cardTop < st.barTop && !st.ins);
  // picking goes through the same transform: a click on the animal where it is drawn finds it (and the transform round-trips)
  const rt = await count(p, () => { const a = FOLLOW.a, w = toWorld({ clientX: ox + a.x * scale, clientY: oy + a.y * scale }); return Math.hypot(w.x - a.x, w.y - a.y); });
  check('follow: screen -> world agrees with the zoomed view', rt < 0.01, rt.toFixed(4));
  // the sim fields: id and last meal
  const fields = await count(p, () => ({ ids: new Set(S.agents.map(a => a.id)).size === S.agents.length, meals: S.agents.filter(a => a.mealAt !== undefined).length }));
  check('follow: every agent has its own id and meals are recorded', fields.ids && fields.meals > 0, fields.meals + ' fed');
  // a hunter's or grazer's meal line reads like a sentence
  const meal = await count(p, () => document.querySelector('#follow .fm').textContent);
  check('follow: the card has a last-meal line', /^(Last meal: (a|an|plankton)|Has not eaten)/.test(meal), meal);
  // let go: empty water, Esc, a tool key, the wheel and a drag each end it
  const goes = async (name, act) => {
    await p.mouse.move(q.x, q.y); await p.mouse.down(); await p.mouse.up(); await wait(p, 300); // (re)follow something
    const had = await count(p, () => !!FOLLOW.a); await act(); await wait(p, 1400);
    check('follow: ' + name + ' lets go and the view comes back', had && await count(p, () => !FOLLOW.a && FOLLOW.p === 0 && scale === baseScale && document.getElementById('follow').hidden && !document.body.classList.contains('following')));
  };
  q = await pickInView(p);
  await goes('Esc', () => p.keyboard.press('Escape'));
  q = await pickInView(p);
  await goes('a tool key', () => p.keyboard.press('n')); await p.keyboard.press('w');
  q = await pickInView(p);
  await goes('the wheel', () => p.mouse.wheel(0, 120));
  await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 300); q = await pickInView(p);
  await goes('a drag', async () => { await p.mouse.move(700, 500); await p.mouse.down(); await p.mouse.move(700, 420, { steps: 5 }); await p.mouse.up(); });
  await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 300); q = await pickInView(p);
  await goes('a click on empty water', async () => { const e = await count(p, () => { const a = FOLLOW.a; return { x: innerWidth / 2 + (a.x > WW / 2 ? -250 : 250), y: oy + 30 * scale }; }); await p.mouse.click(e.x, e.y); });
  // the end of a followed animal: netted (the camera rides up with it), eaten (names the predator)
  await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 300); q = await pickInView(p);
  await p.mouse.move(q.x, q.y); await p.mouse.down(); await p.mouse.up(); await wait(p, 1200);
  await p.evaluate(() => { tool = 'watch'; const a = FOLLOW.a; netAt(a.x, a.y, 4); }); await wait(p, 500);
  const net = await count(p, () => ({ txt: document.querySelector('#follow .fd').textContent, vis: !document.querySelector('#follow .fd').hidden, lift: !!FOLLOW.lift, still: !!FOLLOW.a }));
  check('follow: a netted animal is followed up and the card says so', net.vis && /net/.test(net.txt) && net.lift && net.still, JSON.stringify(net));
  await wait(p, 4500);
  check('follow: a few seconds after it died the camera lets go', await count(p, () => !FOLLOW.a));
  await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 300);
  const eaten = await p.evaluate(() => {
    const prey = S.agents.find(a => !a.dead && a.t === GRAZER && a.y > 60 && a.y < WH - 120), pred = S.agents.find(a => !a.dead && SPECIES[a.t].size >= 14);
    startFollow(prey); eat(pred, prey, 0); updateFollowCard();
    return { txt: document.querySelector('#follow .fd').textContent, fate: prey.fate === pred.t, meal: pred.mealT === prey.t };
  });
  check('follow: an eaten animal names its predator', eaten.fate && eaten.meal && /^Eaten by an? /.test(eaten.txt), eaten.txt);
  await p.evaluate(() => endFollow(true));
  // photo mode keeps the zoomed view: what you follow is what the picture shows
  await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 200); q = await pickInView(p);
  await p.mouse.move(q.x, q.y); await p.mouse.down(); await p.mouse.up(); await wait(p, 1500);
  await p.keyboard.press('f'); await wait(p, 300);
  const ph = await count(p, () => ({ on: !!photo, card: getComputedStyle(document.getElementById('follow')).visibility, r: photoRect(), s: scale }));
  const pic = await savePicture(p);
  check('follow: photo mode takes the zoomed view (card hidden, picture drawn)', ph.on && ph.card === 'hidden' && pic.size && pic.size.w === ph.r.w && ph.s > base.s * 1.9, `${pic.size && pic.size.w}x${pic.size && pic.size.h}`);
  await p.keyboard.press('f'); await wait(p, 300);
  check('follow: leaving photo mode brings the card back', await count(p, () => !photo && !!FOLLOW.a && !document.getElementById('follow').hidden));
  // Learn mode: the coach card sits above the toolbar too; the follow card stacks over it instead of hiding behind it
  await p.goto(URL + '?seed=follow-1'); await p.evaluate(() => setHints(true)); await p.click('[data-mode=learn]'); await wait(p, 1500);
  await p.evaluate(() => { startFollow(S.agents.find(a => !a.dead && a.t !== PLANKTON && a.y > 60 && a.y < WH - 120)); }); await wait(p, 600);
  const ov = await count(p, () => { const c = document.getElementById('coach').getBoundingClientRect(), f = document.getElementById('follow').getBoundingClientRect(); return { coach: !document.getElementById('coach').hidden, hit: !(f.bottom <= c.top || f.top >= c.bottom || f.right <= c.left || f.left >= c.right) }; });
  check('follow: with the Learn coach card up the two cards do not overlap', ov.coach && !ov.hit, JSON.stringify(ov));
  errorCheck('follow');
  await p.close();
  // phone: a real tap, the card fits the width and clears the toolbar, no sideways scroll
  const m = await openPage(b, 390, 844, true);
  await m.goto(URL + '?seed=follow-1'); await m.tap('[data-mode=sandbox]'); await wait(m, 1500);
  const base2 = await count(m, () => baseScale);
  q = await m.evaluate(() => {
    const at = a => ({ x: ox + a.x * scale, y: oy + a.y * scale });
    const a = S.agents.filter(a => { const q = at(a); return !a.dead && a.t !== PLANKTON && a.y > 60 && a.y < WH - 120 && q.x > 60 && q.x < innerWidth - 60 && q.y > topReserve + 80 && q.y < innerHeight - barH - 120; }).sort((u, v) => SPECIES[v.t].size - SPECIES[u.t].size)[0];
    return { id: a.id, ...at(a) }; });
  await m.touchscreen.tap(q.x, q.y); await wait(m, 1600);
  const ms = await count(m, () => { const a = FOLLOW.a, c = document.getElementById('follow').getBoundingClientRect(), bar = document.getElementById('bar').getBoundingClientRect(); return { id: a && a.id, s: scale, p: FOLLOW.p, ax: ox + a.x * scale, ay: oy + a.y * scale, cl: c.left, cr: c.right, cb: c.bottom, bt: bar.top, W: innerWidth, sw: document.documentElement.scrollWidth, top: topReserve }; });
  await shot(m, 'f2-phone-following');
  check('follow phone: a tap follows it and zooms in (a grazer was a few pixels)', ms.id === q.id && ms.p === 1 && ms.s > base2 * 2, `scale ${base2.toFixed(2)} -> ${ms.s.toFixed(2)}`);
  check('follow phone: the animal is in view above the card, the card fits and clears the toolbar, no sideways scroll', ms.ax > 0 && ms.ax < ms.W && ms.ay > ms.top && ms.cl >= 0 && ms.cr <= ms.W && ms.cb <= ms.bt + 1 && ms.sw <= ms.W + 1, JSON.stringify(ms));
  await m.tap('#followStop'); await wait(m, 1400);
  check('follow phone: the card\'s close button lets go', await count(m, () => !FOLLOW.a && FOLLOW.p === 0 && scale === baseScale));
  errorCheck('follow phone');
  await m.close();
}

// M9 photo mode: the ocean holds still, the panels step aside, the tools do nothing, and Save picture writes a PNG of the
// world as framed, at 2 px per world unit, without the labels, ruler or cursor
const pngSize = buf => buf.length > 24 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null;
async function savePicture(p) {
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#photoSave')]);
  const f = await d.path(), buf = fs.readFileSync(f);
  return { name: d.suggestedFilename(), size: pngSize(buf), bytes: buf.length };
}
async function photoMode(b) {
  console.log('photo mode');
  const p = await openPage(b, 1600, 900);
  await wait(p, 300); await p.keyboard.press('f'); await wait(p, 100);
  check('photo: F does nothing on the mode picker', await count(p, () => !photo && !document.body.classList.contains('photo')));
  await p.goto(URL + '?seed=photo-1'); await p.click('[data-mode=run]'); await p.evaluate(() => setHints(false)); await wait(p, 1200);
  await p.keyboard.press('t'); // the Trawler picked before the photo
  await p.keyboard.press('f'); await wait(p, 200);
  check('photo: F pauses, every panel steps aside, the photo bar shows', await count(p, () => !!photo && paused && document.body.classList.contains('photo') && !photoBar.hidden
    && [...document.querySelectorAll('.panel')].every(el => getComputedStyle(el).visibility === 'hidden')));
  // nothing acts: a click on the water (the Trawler is picked), Space (Pause), a tool key; a drag frames the view
  const t0 = await count(p, () => S.t), w = await toPage(p, 800, 400);
  await p.mouse.click(w.x, w.y); await p.keyboard.press(' '); await p.keyboard.press('n'); await wait(p, 300);
  check('photo: a click, Space and the tool keys do nothing, and the ocean holds still', await count(p, () => !S.trawlers.length && paused && tool === 'trawl') && (await count(p, () => S.t)) === t0);
  const y0 = await count(p, () => cam.target);
  await p.mouse.move(w.x, w.y); await p.mouse.down(); await p.mouse.move(w.x, w.y - 120, { steps: 6 }); await p.mouse.up(); await wait(p, 200);
  check('photo: a drag frames the view', (await count(p, () => cam.target)) > y0 + 60 && (await count(p, () => !S.trawlers.length)), await count(p, () => 'cam ' + Math.round(cam.target)));
  await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 100);
  // the picture: 2 px per world unit (the whole width shows at 1600 px), no labels, ruler, tags, cursor or pan track
  const spied = await p.evaluate(() => {
    const names = ['drawRuler', 'drawCursor', 'drawTags', 'drawInspect', 'drawPanTrack', 'drawEdges'], was = names.map(n => window[n]), hit = [];
    names.forEach((n, i) => { window[n] = (...a) => { hit.push(n); return was[i](...a); }; });
    try { renderPhoto(); } finally { names.forEach((n, i) => { window[n] = was[i]; }); }
    return hit;
  });
  check('photo: the picture leaves out the ruler, cursor, value tags, labels, pan track and the edge fade', !spied.length, spied.join(', '));
  const pic = await savePicture(p), rect = await count(p, () => photoRect());
  check('photo: Save picture downloads a PNG of the framed world at 2 px per world unit', pic.size && pic.size.w === 3200 && pic.size.w === rect.w && pic.size.h === rect.h && pic.bytes > 100000,
    `${pic.name} ${pic.size && pic.size.w + 'x' + pic.size.h}, ${Math.round(pic.bytes / 1024)} KB`);
  check('photo: the file is named after the ocean and the time', /^deep-tide-photo-1-\d+m\d\ds\.png$/.test(pic.name), pic.name);
  await p.keyboard.press('Escape'); await wait(p, 600);
  check('photo: Esc leaves; the game goes on with the panels and the tool it had', await count(p, () => !photo && !paused && photoBar.hidden && tool === 'trawl'
    && getComputedStyle(document.getElementById('bar')).visibility === 'visible') && (await count(p, () => S.t)) > t0 + 0.2);
  await p.keyboard.press(' '); await p.click('#photoBtn'); await wait(p, 100); await p.click('#photoDone'); await wait(p, 100);
  check('photo: paused before, still paused after (the Photo button and Done)', await count(p, () => !photo && paused && document.getElementById('pause').textContent === 'Resume'));
  // what follows the pointer holds still: the deep's lamp stays where it was aimed, the protected-area preview goes
  await p.keyboard.press('w'); await p.evaluate(() => { cam.y = cam.target = 1200; }); await wait(p, 100);
  const deepAt = await toPage(p, 800, 1500); await p.mouse.move(deepAt.x, deepAt.y); await wait(p, 900);
  await p.keyboard.press('f'); await wait(p, 100);
  const lamp0 = await count(p, () => [LAMP.x, LAMP.y, LAMP.k].map(v => v.toFixed(3)).join(' '));
  await p.mouse.move(deepAt.x - 300, deepAt.y + 100, { steps: 5 }); await wait(p, 300); await p.mouse.move(800, 880, { steps: 5 }); await wait(p, 500);
  check('photo: the deep\'s lamp holds still where it was aimed', lamp0 === await count(p, () => [LAMP.x, LAMP.y, LAMP.k].map(v => v.toFixed(3)).join(' ')) && +lamp0.split(' ')[2] > 0.9, lamp0);
  await p.keyboard.press('Escape'); await p.keyboard.press('a'); await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 100);
  const wat = await toPage(p, 800, 400); await p.mouse.move(wat.x, wat.y); await wait(p, 100);
  const pv = [await count(p, () => !!mpaPreview())]; await p.keyboard.press('f'); await wait(p, 100); pv.push(await count(p, () => !!mpaPreview()));
  await p.keyboard.press('Escape'); await wait(p, 100);
  check('photo: no protected-area preview under the pointer', pv[0] && !pv[1], 'before ' + pv[0] + ', in photo mode ' + pv[1]);
  errorCheck('photo');
  await p.close();
  // phone: Photo sits behind More; the ocean starts at the top of the screen while the panels are away, and the fit never changes
  const q = await openPage(b, 390, 844, true);
  await q.tap('[data-mode=sandbox]'); await q.evaluate(() => setHints(false)); await wait(q, 800);
  const before = await count(q, () => ({ scale, top: topReserve }));
  await q.tap('#moreBtn'); await wait(q, 100); await q.tap('#photoBtn'); await wait(q, 200);
  check('phone photo: the ocean starts at the top of the screen, at the same scale; the bar keeps one line', await count(q, () =>
    !!photo && topReserve === 0 && Math.abs(oy - SKY * scale) < 1 && document.getElementById('photoSave').offsetHeight < 44) && (await count(q, () => scale)) === before.scale,
    await count(q, () => 'top ' + topReserve + ', sky at ' + Math.round(oy - SKY * scale) + ', save ' + document.getElementById('photoSave').offsetHeight + ' px'));
  const qpic = await savePicture(q), qrect = await count(q, () => photoRect());
  check('phone photo: the picture is what the screen shows, at 2 px per world unit', qpic.size && qpic.size.w === qrect.w && qpic.size.h === qrect.h && Math.abs(qrect.m * (await count(q, () => scale)) - 2) < 0.01,
    qpic.size && qpic.size.w + 'x' + qpic.size.h);
  await q.tap('#photoDone'); await wait(q, 200);
  check('phone photo: Done puts the panels back where they were, the More drawer folded', await count(q, () => ({ scale, top: topReserve, more: document.getElementById('bar').classList.contains('more') }))
    .then(a => a.scale === before.scale && a.top === before.top && !a.more));
  errorCheck('phone photo');
  await q.close();
  // iPhone: the share sheet first (its Save Image goes to Photos); when Safari no longer counts the tap, a download
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const r = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE });
  r.on('pageerror', e => errors.push(String(e))); r.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await r.addInitScript(() => {
    window.__shared = []; window.__shareFails = false;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: d => {
      if (window.__shareFails) return Promise.reject(new DOMException('the tap no longer counts', 'NotAllowedError'));
      window.__shared.push(...d.files.map(f => f.name + ' ' + f.type + ' ' + f.size)); return Promise.resolve();
    } });
  });
  await r.goto(URL + '?seed=photo-1'); await r.tap('[data-mode=sandbox]'); await r.evaluate(() => setHints(false)); await wait(r, 500);
  await r.tap('#moreBtn'); await wait(r, 100); await r.tap('#photoBtn'); await wait(r, 200);
  await r.tap('#photoSave'); await r.waitForFunction(() => window.__shared.length, null, { timeout: 10000 }).catch(() => {});
  const shared = await r.evaluate(() => window.__shared);
  check('iPhone photo: Save picture opens the share sheet with the PNG', shared.length === 1 && /^deep-tide-photo-1-\d+m\d\ds\.png image\/png \d{5,}$/.test(shared[0]), shared.join(', ') || 'not shared');
  await r.evaluate(() => { window.__shareFails = true; });
  const [dl] = await Promise.all([r.waitForEvent('download', { timeout: 10000 }), r.tap('#photoSave')]);
  check('iPhone photo: when Safari refuses the share, the picture downloads instead', /^deep-tide-photo-1-.*\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  errorCheck('iPhone photo');
  await r.close();
}

// M9 installable: over http (there are no service workers on file://) the worker installs and takes the page, Chromium
// finds nothing that stops an install, and with the server gone an ocean link still loads from the worker's copy and plays
async function installable(b) {
  console.log('installable (http)');
  const http = require('http');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  let probe = 0; // /__probe answers a new number each time: a file that changed on the server since the last load
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/__probe')) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(String(++probe)); return; }
    let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; // (URL is the page's path in this file)
    const fp = path.join(ROOT, f);
    if (!fp.startsWith(ROOT + path.sep) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(base);
    check('install: the service worker installs and activates', await p.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 8000))])));
    await p.reload(); await wait(p, 300);
    check('install: after a reload the worker serves the page', await count(p, () => !!navigator.serviceWorker.controller));
    const cdp = await ctx.newCDPSession(p);
    const inst = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.map(e => e.errorId);
    // a Playwright context is off the record, which alone stops an install; anything else is ours
    const ours = inst.filter(id => id !== 'in-incognito');
    check('install: Chromium finds nothing in the page that stops an install', !ours.length, inst.join(', ') || 'none');
    const man = await cdp.send('Page.getAppManifest');
    check('install: the manifest parses without errors', !man.errors.length && /Deep Tide/.test(man.data || ''), man.errors.map(e => e.message).join(' | '));
    const bad = await p.evaluate(async () => {
      const m = await (await fetch('manifest.webmanifest')).json(), out = [];
      for (const ic of m.icons.concat([{ src: 'icons/apple-touch-icon.png', sizes: '180x180' }])) {
        const img = new Image(); img.src = ic.src; await img.decode();
        if (img.naturalWidth + 'x' + img.naturalHeight !== ic.sizes) out.push(ic.src + ' is ' + img.naturalWidth + 'x' + img.naturalHeight);
      }
      return out;
    });
    check('install: every icon has the size the manifest gives', !bad.length, bad.join(', '));
    const online = await p.evaluate(async () => [await (await fetch('__probe')).text(), await (await fetch('__probe')).text(), !!navigator.serviceWorker.controller]);
    check('install: online, the worker fetches the file as it is now (a push shows on the next load)', online[2] && online[0] !== online[1], online.slice(0, 2).join(' then '));
    errorCheck('install');
    // M9 part 5: the heal in heal.js (a Web Worker; file:// pages have none) ends on exactly the ocean the page gets stepping it itself
    const healBoth = `(async () => { resetWorld('wk'); resetDeep('wk'); startRun(); for (let i = 0; i < 900; i++) { if (i === 60) startTrawl(450); if (i === 200) loseNet(600, 300); step(1 / 30); stepDeep(1 / 30); }
      const o = oceanState(), d = deepState(), steps = 1800;
      const w = new Worker('heal.js'), snaps = [];
      const done = await new Promise((ok, no) => { w.onmessage = e => { if (e.data.kind === 'snap') snaps.push(e.data.frac); else if (e.data.kind === 'done') ok(e.data); else no(e.data.msg); }; w.onerror = e => no('worker failed'); w.postMessage({ ocean: o, deep: d, seed: 'wk.h1', steps, every: 300 }); });
      w.terminate(); loadOcean(done.ocean); loadDeep(done.deep); const viaWorker = ${FP2};
      loadOcean(o); loadDeep(d); startHeal('wk.h1'); seedDeep('wk.h1'); for (let i = 0; i < steps; i++) { step(1 / 30); stepDeep(1 / 30); }
      return { same: viaWorker === ${FP2}, snaps: snaps.length }; })()`;
    const hb = await p.evaluate(healBoth).catch(e => ({ err: e.message }));
    check('generations: the heal in the worker ends on exactly the ocean the page gets stepping it', hb.same && hb.snaps === 5, JSON.stringify(hb));
    errorCheck('install');
    // the server goes away (a real failure for the worker's fetch, not only for the page's)
    await new Promise(r => { srv.close(r); srv.closeAllConnections(); });
    await p.goto(base + '?seed=offline-1'); await wait(p, 300);
    await p.click('[data-mode=sandbox]'); const t0 = await count(p, () => S.t); await wait(p, 800);
    const off = await p.evaluate(async () => (await fetch('__probe')).text());
    check('install: offline, the copy kept last answers', off === online[1], off + ' (last online ' + online[1] + ')');
    check('install: offline, an ocean link still loads and plays', (await count(p, () => S.t)) > t0 + 0.3 && (await count(p, () => SEED)) === 'offline-1', await count(p, () => SEED));
    const offHeal = await p.evaluate(() => new Promise(ok => { try { const w = new Worker('heal.js'); w.onmessage = e => { w.terminate(); ok(e.data.kind); }; w.onerror = () => ok('failed');
      w.postMessage({ ocean: oceanState(), deep: deepState(), seed: 'off.h1', steps: 30, every: 0 }); } catch (e) { ok('threw ' + e.message); } setTimeout(() => ok('timeout'), 8000); }));
    check('install: offline, the heal worker still loads (Generations)', offHeal === 'done', offHeal);
    errorCheck('offline');
  } finally { await ctx.close(); srv.close(); }
}

async function phone(b) {
  console.log('phone 390x844');
  const p = await openPage(b, 390, 844, true);
  await p.tap('[data-mode=sandbox]'); await wait(p, 1200);
  check('phone: no sideways scrolling', await count(p, () => document.documentElement.scrollWidth <= innerWidth + 1),
    await count(p, () => document.documentElement.scrollWidth + ' > ' + innerWidth));
  check('phone: depth button shown exactly when the camera can reach the deep', await count(p, () => (camMax() > 300) === !document.getElementById('depthBtn').hidden), await count(p, () => 'camMax ' + Math.round(camMax())));
  const q = await count(p, () => { // an animal in view: the phone shows a part of the width (pan mode)
    const at = a => ({ x: ox + a.x * scale, y: oy + a.y * scale }), a = S.agents.find(a => { const q = at(a); return !a.dead && a.t !== PLANKTON && a.y > 40 && q.x > 30 && q.x < innerWidth - 30 && q.y > topReserve + 60 && q.y < innerHeight - barH - 80; });
    return at(a); });
  await p.touchscreen.tap(q.x, q.y); await wait(p, 300);
  check('phone: tapping an animal follows it (the card names it)', await count(p, () => !!FOLLOW.a && !document.getElementById('follow').hidden && document.querySelector('#follow .fn').textContent.length > 2));
  const gap = await p.evaluate(() => { for (let x = 40; x < innerWidth - 40; x += 20) for (let y = topReserve + 120; y < innerHeight - barH - 200; y += 20) { const w = toWorld({ clientX: x, clientY: y }); if (!pickAnimal(w.x, w.y, 70) && !ghostAt(w.x, w.y, 40)) return { x, y }; } return null; });
  await p.touchscreen.tap(gap.x, gap.y); await p.waitForFunction(() => !FOLLOW.a && FOLLOW.p === 0, null, { timeout: 6000 }).catch(() => {});  // empty water: lets go
  check('phone: a tap on empty water lets go and the view is back', await count(p, () => !FOLLOW.a && FOLLOW.p === 0 && scale === baseScale));
  // the species panel is a strip of dots and counts; a tap opens it over the water without moving the column
  check('phone: species panel starts folded (names, no sparklines), the column starts under it', await count(p, () =>
    !document.getElementById('stats').classList.contains('open') && topReserve < 140 && !document.querySelector('#row0 .spark').offsetParent && !!document.querySelector('#row0 .nm').offsetParent), 'top ' + await count(p, () => topReserve));
  check('phone: Biodiversity and Water show under the species strip', await count(p, () => !!document.getElementById('bio').offsetParent && /\d+%/.test(document.getElementById('bioN').textContent) && /\d+%/.test(document.getElementById('waterN').textContent)));
  const top0 = await count(p, () => topReserve);
  await p.tap('#stats'); await wait(p, 300);
  check('phone: a tap opens the species panel over the water', await count(p, () =>
    document.getElementById('stats').classList.contains('open') && !!document.querySelector('#row0 .spark').offsetParent) && (await count(p, () => topReserve)) === top0);
  await p.tap('#stats'); await wait(p, 200);
  // settings fold behind More; locked controls are hidden, not greyed out
  check('phone: Warmth, Hints, Sound, Pause, Reset, Menu fold behind More', await count(p, () => ['temp', 'hintsBtn', 'soundBtn', 'pause', 'reset', 'menuBtn'].every(id => !document.getElementById(id).offsetParent)));
  await p.tap('#moreBtn'); await wait(p, 200);
  check('phone: More shows them', await count(p, () => ['temp', 'hintsBtn', 'soundBtn', 'pause', 'reset', 'menuBtn'].every(id => !!document.getElementById(id).offsetParent)));
  await p.tap('#pause'); await p.tap('#moreBtn'); await wait(p, 200);
  check('phone: paused, Resume stays in reach with More folded', await count(p, () => paused && !!document.getElementById('pause').offsetParent));
  await p.tap('#pause'); await wait(p, 100);
  // the toolbar: a line for the picked tool (its setting and its hint, one line), then two rows of tools with short names
  check('phone: the toolbar is one line and two rows of tools, with short names', await count(p, () => {
    showHint(false);
    const tops = new Set([...document.querySelectorAll('#bar [data-tool], #speed, #moreBtn')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().top)));
    return tops.size === 2 && document.getElementById('bar').offsetHeight < 140
      && document.querySelector('[data-tool=invader]').innerText === 'Invader' && document.querySelector('[data-tool=reserve]').innerText === 'Protect';
  }), await count(p, () => 'bar ' + document.getElementById('bar').offsetHeight + ' px'));
  await p.tap('[data-tool=pollute]'); await wait(p, 100);
  check('phone: a tool picked the first time shows its hint in full, its setting beside it', await count(p, () =>
    hintEl.classList.contains('full') && !!pollSel.offsetParent && !document.getElementById('exclBtn').offsetParent && !stockSel.offsetParent));
  await p.touchscreen.tap(200, 450); await wait(p, 100);
  check('phone: the hint folds to one line at the first touch on the water', await count(p, () => !hintEl.classList.contains('full') && hintEl.offsetHeight <= 34));
  await p.tap('[data-tool=trawl]'); await wait(p, 100); await p.tap('#hint'); await wait(p, 100);
  const folded = await count(p, () => !hintEl.classList.contains('full'));
  await p.tap('#hint'); await wait(p, 100);
  check('phone: Trawler shows the Excluder; a tap on the hint folds and opens it', folded && await count(p, () =>
    hintEl.classList.contains('full') && !!document.getElementById('exclBtn').offsetParent && !pollSel.offsetParent));
  await p.tap('[data-tool=watch]'); await wait(p, 100);
  // the sunlit scene fills the height and the view pans sideways: one finger with Watch, two fingers with any tool
  check('phone: pan mode, animals drawn at a readable size, the reef shelf clears the toolbar (hint folded)', await count(p, () =>
    (showHint(false), measureChrome(), panMode) && scale > 0.5 && oy + FRAME_Y * scale <= innerHeight - barH + 1), await count(p, () => 'scale ' + scale.toFixed(3)));
  const cdp = await p.context().newCDPSession(p);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const swipe = async (from, to) => { // fingers [[x, y], ...] move together by (dx, dy)
    await touch('touchStart', from.slice(0, 1)); if (from.length > 1) await touch('touchStart', from);
    for (let k = 1; k <= 8; k++) await touch('touchMove', from.map(([x, y]) => [x + (to[0] * k) / 8, y + (to[1] * k) / 8]));
    await touch('touchEnd', []); await wait(p, 100);
  };
  await p.evaluate(() => { cam.x = cam.tx = 0; });
  await swipe([[300, 450]], [-200, 0]);
  check('phone: a one-finger drag with Watch pans sideways', await count(p, () => cam.x > 150), await count(p, () => 'cam.x ' + Math.round(cam.x)));
  await p.evaluate(() => { setTool('net'); window.__nets = 0; const n = netAt; window.netAt = (...a) => { __nets++; return n(...a); }; });
  const x0 = await count(p, () => cam.x);
  await swipe([[150, 450], [250, 450]], [150, 0]);
  check('phone: two fingers pan with the Net picked, and net nothing', await p.evaluate(x0 => cam.x < x0 - 100 && __nets === 0, x0), await count(p, () => 'cam.x ' + Math.round(cam.x) + ', nets ' + __nets));
  await touch('touchStart', [[200, 450]]); await wait(p, 400); await touch('touchMove', [[230, 460]]); await wait(p, 200); await touch('touchEnd', []);
  check('phone: one finger held with the Net still nets', await count(p, () => __nets > 0), await count(p, () => 'nets ' + __nets));
  // (counts the stocking itself: the total can fall in the same moment as animals die)
  await p.evaluate(() => { setTool('stock'); window.__stocked = 0; const sm = spawnMany; window.spawnMany = (...a) => { __stocked++; return sm(...a); }; });
  await p.touchscreen.tap(200, 450); await wait(p, 100);
  check('phone: a tap with Stock adds animals (on release)', await count(p, () => __stocked === 1), await count(p, () => 'stocked ' + __stocked));
  await p.evaluate(() => { setTool('net'); __nets = 0; });
  await touch('touchStart', [[200, 450]]); await touch('touchEnd', []); await wait(p, 100);
  check('phone: a quick tap with the Net still nets once', await count(p, () => __nets === 1), await count(p, () => 'nets ' + __nets));
  // the strip is measured folded and at the surface, whenever the fit happens (hints off: the deep's tip card would cover
  // the strip on a phone)
  await p.evaluate(() => { setHints(false); cam.y = cam.target = clampCam(1400); }); await wait(p, 400);
  await p.evaluate(() => { fitKey = ''; }); await wait(p, 300);
  const deepTop = await count(p, () => document.getElementById('stats').classList.contains('deepview') ? topReserve : -1);
  await p.evaluate(() => { cam.y = cam.target = -SKY; }); await wait(p, 300); await p.tap('#stats'); await wait(p, 300);
  await p.evaluate(() => { fitKey = ''; }); await wait(p, 300);
  const openTop = await count(p, () => document.getElementById('stats').classList.contains('open') ? topReserve : -1);
  await p.tap('#stats'); await wait(p, 200);
  check('phone: a fit in the deep or with the species panel open measures the strip at the surface, folded', deepTop === top0 && openTop === top0, `deep ${deepTop}, open ${openTop}, surface ${top0}`);
  // a new game from behind More: the drawer folds, the scale fits the new mode at once, the old log is gone
  await p.evaluate(() => { setTool('watch'); log('old message'); }); await wait(p, 300);
  await p.tap('#moreBtn'); await wait(p, 100); await p.tap('#menuBtn'); await wait(p, 200); await p.tap('[data-mode=run]'); await wait(p, 600);
  check('phone: a new game from behind More folds it and refits at once', await count(p, () =>
    !document.getElementById('bar').classList.contains('more') && fitKey === 'fit' && (showHint(false), measureChrome(), oy + FRAME_Y * scale <= innerHeight - barH + 1)),
    await count(p, () => 'shelf ' + Math.round(oy + FRAME_Y * scale) + ' / bar ' + Math.round(innerHeight - barH)));
  await p.evaluate(() => { S.game.streak = 2; }); await wait(p, 400); // a warning grows the run's panel over the sky
  check('phone: the pan track stays below the grown run panel', await count(p, () =>
    Math.max(topReserve, panelsNow) >= Math.round(titleEl.getBoundingClientRect().bottom) && titleEl.getBoundingClientRect().bottom > topReserve - 6),
    await count(p, () => 'track ' + (Math.max(topReserve, panelsNow) + 6) + ', panel ' + Math.round(titleEl.getBoundingClientRect().bottom) + ', reserve ' + topReserve));
  check('phone: a new game starts with a fresh log', await count(p, () => !logEl.textContent.includes('old message') && logShown <= S.events.length));
  await shot(p, '5-phone');
  errorCheck('phone');
  await p.close();
}

// M9 part 4 timelapse: a frame every 2 s of a scored run, drawn from a fixed camera, played back on the end screen
const TLPIX = `(() => { const d = TL.cv.getContext('2d').getImageData(0, 0, TL.W, TL.H).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) % 1e9; return h; })()`;
async function timelapse(b) {
  console.log('timelapse');
  const p = await openPage(b, 1280, 800);
  await p.click('[data-mode=run]'); await wait(p, 300);
  check('timelapse: nothing is recorded in the sandbox', await p.evaluate(() => { newGame('sandbox'); for (let i = 0; i < 90; i++) { step(1 / 30); tlStep(); } return TL.frames.length === 0; }));
  // the same run with and without the recorder: the sim must not notice it (counts, agents, reef, seeded streams)
  const run = rec => p.evaluate(`(() => { newGame('run'); resetWorld('tl-fp'); resetDeep('tl-fp'); startRun(); tlReset(); mode = 'run'; paused = true; /* the page's own loop must not add frames or steps */
    for (let i = 0; i < 30 * 400; i++) { step(1 / 30); stepDeep(1 / 30); ${rec ? 'tlStep();' : ''} } return ${FP} + JSON.stringify(S.game.parts || 0) + S.reef.bleach + '|' + S.avgPoll; })()`);
  const plain = await run(false), nPlain = await count(p, () => TL.frames.length);
  const taped = await run(true), nTaped = await count(p, () => TL.frames.length);
  check('timelapse: a 400 s fixed-seed run gives the same result with the recorder on', plain === taped && nPlain === 0 && nTaped === 201, nTaped + ' frames');
  await wait(p, 800);
  check('timelapse: every frame becomes a JPEG, one every 2 s, within the memory cap', await count(p, () =>
    TL.frames.every((f, i) => f.blob && f.blob.type === 'image/jpeg' && (i === 0 || Math.abs(f.t - TL.frames[i - 1].t - 2) < 0.05)) && TL.frames.length <= TL.MAX),
    await count(p, () => (TL.frames.reduce((a, f) => a + f.blob.size, 0) / 1e6).toFixed(2) + ' MB'));
  // the camera is fixed: panning, zooming and the deep view do not change what is recorded; ctx and the view come back
  const fixed = await p.evaluate(`(() => { const sv = [ctx, ox, oy, scale, photo, shooting, rec].join('|');
    TL.next = 0; tlStep(); const a = ${TLPIX}; cam.y = cam.target = 1500; ox += 40; scale *= 1.7; TL.next = 0; tlStep(); const c = ${TLPIX};
    const back = [ctx, ox - 40, oy, scale / 1.7, photo, shooting, rec].join('|'); cam.y = cam.target = -SKY; return { same: a === c, ok: back.split('|')[0] === sv.split('|')[0] && photo === null && !shooting && !rec }; })()`);
  check('timelapse: the frame ignores the player\'s view and leaves the view as it was', fixed.same && fixed.ok, JSON.stringify(fixed));
  // a mid-run frame is not blank and has no lamp or labels (pixel check on the sea, not the sky)
  check('timelapse: a frame holds a lit sea', await count(p, () => { const d = TL.cv.getContext('2d').getImageData(100, 80, 280, 120).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) > 30; }));
  // the end screen
  await p.evaluate(() => { newGame('run'); });
  await p.evaluate(() => { speedMul = 4; });
  await wait(p, 5000);
  const live = await count(p, () => ({ n: TL.frames.length, t: S.t }));
  check('timelapse: the page records on its own at 4x (real frames)', live.n >= 2 && Math.abs(live.n - (Math.floor(live.t / 2) + 1)) <= 1, JSON.stringify(live));
  await p.evaluate(() => { newGame('run'); resetWorld('tl-end'); resetDeep('tl-end'); startRun(); tlReset(); mode = 'run'; speedMul = 1; paused = true;
    for (let i = 0; i < 30 * 600; i++) { step(1 / 30); stepDeep(1 / 30); tlStep(); if (S.game.over) break; } tlStep(true); });
  await wait(p, 800);
  check('timelapse: 301 frames over a full run, the last one at 10:00', await count(p, () => TL.frames.length === 301 && TL.frames[300].t >= 599.9 && TL.frames[300].blob), await count(p, () => TL.frames.length));
  await p.evaluate(() => { showEnd(); });
  check('timelapse: the end screen shows the player, playing at once', await count(p, () => !document.getElementById('tl').hidden && document.getElementById('tlPlay').textContent === 'Playing'));
  const px = () => p.evaluate(() => { const c = document.getElementById('tlc'), d = c.getContext('2d').getImageData(0, 0, TL.W, TL.H + TL.STRIP).data; let h = 0; for (let i = 0; i < d.length; i += 11) h = (h * 31 + d[i]) % 1e9; return h; });
  await wait(p, 2000); const h1 = await px(); await wait(p, 1500); const h2 = await px();
  check('timelapse: the picture moves while it plays', h1 !== h2);
  check('timelapse: the clock is real text and moves with it', await count(p, () => /^\d:\d\d$/.test(document.getElementById('tlClock').textContent) && document.getElementById('tlClock').textContent !== '0:00'));
  await shot(p, '8-timelapse-playing');
  await p.waitForFunction(() => document.getElementById('tlPlay').textContent === 'Replay', null, { timeout: 15000 }).catch(() => {});
  check('timelapse: after about 10 s it rests on the last frame and offers Replay', await count(p, () => document.getElementById('tlPlay').textContent === 'Replay' && !document.getElementById('tlPlay').disabled));
  const hEnd = await px(); await wait(p, 600);
  check('timelapse: at rest it stays still', hEnd === await px());
  await shot(p, '8-timelapse-done');
  await p.click('#tlPlay'); await wait(p, 700);
  check('timelapse: Replay plays it again', await count(p, () => document.getElementById('tlPlay').textContent === 'Playing'));
  // a new game from the end screen stops it and starts a clean recording
  await p.click('#again'); await wait(p, 600);
  check('timelapse: a new game clears the frames, stops the player and lets go of the old frames', await count(p, () => TL.frames.length <= 1 && document.getElementById('end').hidden && !TL.play && !document.getElementById('tlPlay').onclick));
  check('timelapse: a recorder that throws does not stop the game', await p.evaluate(() => { const real = drawFrame; let ok = true; try { TL.next = 0; TL.frames.length = 0; window.drawFrame = null; drawFrame = () => { throw new Error('boom'); }; tlStep(); } catch (e) { ok = false; } drawFrame = real; const off = TL.MAX === 0; TL.MAX = 400; return ok && off && ctx === viewCtx && !rec; }));
  errorCheck('timelapse');
  await p.close();
  // reduced motion: no autoplay, it shows the final frame and waits for Play. A phone-width card: the picture fits inside it
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  q.on('pageerror', e => errors.push(String(e)));
  await q.goto(URL + '?seed=tl-phone'); await wait(q, 400); await q.tap('[data-mode=run]'); await wait(q, 400);
  await q.evaluate(() => { for (let i = 0; i < 30 * 600; i++) { step(1 / 30); stepDeep(1 / 30); tlStep(); if (S.game.over) break; } tlStep(true); paused = true; showEnd(); }); // the last JPEG is still encoding when the end screen opens
  await wait(q, 800);
  check('timelapse: the last frame is shown as itself even if it was still encoding when the end screen opened', await count(q, () => document.getElementById('tlClock').textContent === '10:00' && !!TL.frames[TL.frames.length - 1].blob));
  check('timelapse (reduced motion): it waits for Play and shows the last frame', await count(q, () => document.getElementById('tlPlay').textContent === 'Play' && !document.getElementById('tlPlay').disabled && TL.play.last === TL.frames.length - 1));
  check('timelapse (phone): the picture fits the card', await count(q, () => { const c = document.getElementById('tlc').getBoundingClientRect(), k = document.getElementById('endCard').getBoundingClientRect(); return c.width > 250 && c.left >= k.left && c.right <= k.right + 0.5 && c.right <= innerWidth; }));
  await shot(q, '8-timelapse-phone');
  await q.tap('#tlPlay'); await wait(q, 600);
  check('timelapse (phone): a tap on Play plays it', await count(q, () => document.getElementById('tlPlay').textContent === 'Playing'));
  errorCheck('timelapse phone');
  await q.close();
}

// M9 part 5 Generations (campaign.js, sim.js startHeal/beginSeason/oceanState, deep.js deepState, heal.js)
// The Anthropocene run must not change: a scripted fixed-seed run with every tool, the code before part 5 (GOLDEN_REF, read
// from git) against the code now, both headless in this node. Not a stored number: node's V8 and the browser's do not agree
// bit for bit over a long run (an untouched ocean drifts apart after ~40 s between node 22 and Chromium 156; old and new
// code agree with each other in either). If the sim changes on purpose, move GOLDEN_REF to the commit before that change.
const GOLDEN_REF = 'b0113aa';
const GOLDEN_RUN = `(() => {
  resetWorld('golden-1'); resetDeep('golden-1'); startRun();
  const act = { 20: () => startTrawl(450), 60: () => { EXCLUDER.on = true; startTrawl(790); EXCLUDER.on = false; }, 100: () => loseNet(700, 300), 130: () => releaseInvaders(800, 300),
    200: () => setMpa(0, 400), 260: () => { for (const g of S.ghosts.slice()) retrieveGhost(g); }, 320: () => startTrawl(300), 400: () => setMpa(null) };
  const fps = [];
  for (let k = 0; !S.game.over && k < 30 * 700; k++) {
    if (act[k / 30]) act[k / 30]();
    if (k % 30 === 0 && k < 30 * 500) netAt(1000, 300, 50);
    if (k >= 30 * 140 && k < 30 * 150) dumpAt(800, 220, 1 / 30, 'runoff');
    if (k >= 30 * 170 && k < 30 * 175) dumpAt(500, 400, 1 / 30, 'plastic');
    step(1 / 30); stepDeep(1 / 30);
    if (k % 3000 === 2999) { let h = 0; for (const a of S.agents) h = (h * 31 + Math.round(a.x * 1000) + Math.round(a.y * 7)) % 1e15; fps.push(h); }
  }
  let h = 0, d = 0; for (const a of S.agents) h = (h * 31 + Math.round(a.x * 1000) + Math.round(a.y * 7)) % 1e15;
  for (const a of D.agents) d = (d * 31 + Math.round(a.x * 1000)) % 1e15;
  const r = S.game.result;
  return JSON.stringify({ t: S.t, n: S.agents.length, c: S.counts, h, d, dn: D.agents.length, fps, score: r.score, parts: r.parts.map(p => p.pts), bio: r.bio, water: r.water, verdict: r.verdict, reef: S.reef, poll: S.avgPoll });
})()`;
// a finer fingerprint for the save/load checks (energies too, the deep's snow, the grids' means)
const FP2 = `(() => { let h = 0, d = 0; for (const a of S.agents) h = (h * 31 + Math.round(a.x * 1e6) + Math.round(a.y * 7e3) + Math.round(a.e * 1e3)) % 1e15;
  for (const a of D.agents) d = (d * 31 + Math.round(a.x * 1e6) + Math.round(a.e * 1e3)) % 1e15;
  return JSON.stringify({ t: S.t, n: S.agents.length, c: S.counts, h, d, dn: D.agents.length, id: AGENT_ID, g: S.ghosts.length, poll: S.avgPoll, sc: S.scarMean, det: S.detritus, reef: S.reef, snow: D.snow, wq: S.wqOn, nu: S.avgNutr }); })()`;
// season 1 with every tool (to its end), and season 2's first `s2` seconds with tools: the same script for every path
const GEN_S1 = `const act = { 20: () => startTrawl(450), 60: () => { EXCLUDER.on = true; startTrawl(790); EXCLUDER.on = false; }, 100: () => loseNet(700, 300), 130: () => releaseInvaders(800, 300),
    200: () => setMpa(0, 400), 320: () => startTrawl(780), 560: () => loseNet(300, 500), 590: () => startTrawl(600) };
  for (let k = 0; !S.game.over; k++) {
    if (act[k / 30]) act[k / 30]();
    if (k % 30 === 0 && k < 30 * 500) netAt(1000, 300, 50);
    if (k >= 30 * 140 && k < 30 * 150) dumpAt(800, 220, 1 / 30, 'runoff');
    if (k >= 30 * 580 && k < 30 * 590) dumpAt(800, 520, 1 / 30, 'runoff');
    if (k >= 30 * 170 && k < 30 * 175) dumpAt(500, 400, 1 / 30, 'plastic');
    step(1 / 30); stepDeep(1 / 30);
  }`;
const GEN_S2 = s2 => `const act2 = { 10: () => startTrawl(300), 50: () => loseNet(900, 200), 90: () => releaseInvaders(400, 300), 150: () => startTrawl(790) };
  for (let k = 0; k < 30 * ${s2}; k++) {
    if (act2[k / 30]) act2[k / 30]();
    if (k % 45 === 0) netAt(600, 250, 50);
    if (k >= 30 * 100 && k < 30 * 108) dumpAt(700, 300, 1 / 30, 'runoff');
    step(1 / 30); stepDeep(1 / 30);
  }`;
// never saved: the boundaries applied to the live sim
const GEN_LIVE = (seed, s2) => `(() => { resetWorld('${seed}.s1'); resetDeep('${seed}.s1'); startRun(); ${GEN_S1}
  const end = ${FP2}; startHeal('${seed}.h1'); seedDeep('${seed}.h1'); for (let i = 0, n = healSteps(); i < n; i++) { step(1 / 30); stepDeep(1 / 30); }
  const healed = ${FP2}; beginSeason('${seed}.s2'); seedDeep('${seed}.s2'); startRun(); const start = ${FP2}; ${GEN_S2(s2)}
  return JSON.stringify({ end, healed, start, s2: ${FP2}, haul: S.game.mins.map(m => m.haul).concat(S.game.haul) }); })()`;
// saved and loaded through JSON at both boundaries (what the page writes to localStorage)
const GEN_SAVED = (seed, s2) => `(() => { const RT = () => { const o = JSON.stringify(oceanState(), jsonPack), d = JSON.stringify(deepState(), jsonPack); loadOcean(JSON.parse(o, jsonUnpack)); loadDeep(JSON.parse(d, jsonUnpack)); };
  resetWorld('${seed}.s1'); resetDeep('${seed}.s1'); startRun(); ${GEN_S1}
  const end = ${FP2}; RT(); startHeal('${seed}.h1'); seedDeep('${seed}.h1'); for (let i = 0, n = healSteps(); i < n; i++) { step(1 / 30); stepDeep(1 / 30); }
  const healed = ${FP2}; RT(); beginSeason('${seed}.s2'); seedDeep('${seed}.s2'); startRun(); const start = ${FP2}; ${GEN_S2(s2)}
  return JSON.stringify({ end, healed, start, s2: ${FP2}, haul: S.game.mins.map(m => m.haul).concat(S.game.haul) }); })()`;
async function press(p, sel) { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 5000 }); await el.scrollIntoViewIfNeeded(); await p.click(sel); }
const genSave = p => p.evaluate(() => { try { const t = localStorage.getItem('deep-tide.generations'); return t ? { len: t.length, rec: JSON.parse(t, jsonUnpack) } : null; } catch (e) { return 'throws'; } });
// play the current season to its end without the page's loop (paused), then let the page end it as it would
const toSeasonEnd = p => p.evaluate(() => { paused = true; while (!S.game.over) { step(1 / 30); stepDeep(1 / 30); tlStep(); } tlStep(true); showEnd(); });
const waitFor = async (p, fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn)) return true; await wait(p, 150); } return false; };

async function generations(b) {
  console.log('generations');
  // determinism, headless with the real heal: a save and load at the season's end and after the heal changes nothing after
  const A = JSON.parse(simContext().run(GEN_LIVE('gd', 100))), B = JSON.parse(simContext().run(GEN_SAVED('gd', 100)));
  check('generations: saved and loaded at the season\'s end, the heal ends on the same ocean (headless, the full heal)', A.end === B.end && A.healed === B.healed, JSON.parse(A.healed).c.join(' '));
  check('generations: saved and loaded after the heal, season 2 plays the same (100 s with every tool)', A.start === B.start && A.s2 === B.s2 && JSON.stringify(A.haul) === JSON.stringify(B.haul));
  check('generations: the heal is a real change (the ocean after it differs from the season\'s end)', A.end !== A.healed);

  let before = '';
  try {
    const vm = require('vm'), { execFileSync } = require('child_process'), ctx = vm.createContext({ Math, console });
    vm.runInContext(['sim.js', 'deep.js'].map(f => execFileSync('git', ['-C', ROOT, 'show', GOLDEN_REF + ':' + f], { encoding: 'utf8' })).join('\n'), ctx);
    before = vm.runInContext(GOLDEN_RUN, ctx);
  } catch (e) { before = 'could not read ' + GOLDEN_REF + ' from git: ' + e.message.split('\n')[0]; }
  const now = simContext().run(GOLDEN_RUN);
  check('generations: the Anthropocene run is unchanged (a scripted 10-minute run with every tool, ' + GOLDEN_REF + ' and now)', before === now, before === now ? 'score ' + JSON.parse(now).score : before.slice(0, 100));
  const p = await openPage(b, 1280, 800);
  await p.goto(URL + '?seed=gen-ui'); await wait(p, 400);
  check('generations: the menu offers Generations, with nothing saved yet', await count(p, () => !!document.querySelector('[data-mode=gen]').offsetParent && document.getElementById('genSaved').hidden && /Five seasons/.test(document.getElementById('genSub').textContent)));
  await shot(p, '9-gen-menu');
  await p.click('[data-mode=gen]'); await wait(p, 300);
  await p.evaluate(() => { paused = true; setHints(false); });
  const s1 = await count(p, () => ({ seed: SEED, tag: document.getElementById('tagline').textContent, first: S.events[0].msg, hud: !hudEl.hidden, t: S.t }));
  const saved1 = await genSave(p);
  check('generations: season 1 starts on <seed>.s1 with "The water is calm.", the run HUD and a save', s1.seed === 'gen-ui.s1' && /season 1 of 5/.test(s1.tag) && s1.first === 'The water is calm.' && s1.hud && saved1 && saved1.rec.phase === 'play' && saved1.rec.season === 1, JSON.stringify(s1));
  // season 1 is an Anthropocene run on that seed (in this page: the same engine)
  const s1camp = await p.evaluate(`(() => { for (let i = 0; i < 300; i++) { step(1 / 30); stepDeep(1 / 30); } return ${FP2}; })()`);
  const s1run = await p.evaluate(`(() => { resetWorld('gen-ui.s1'); resetDeep('gen-ui.s1'); startRun(); for (let i = 0; i < 300 + ${Math.round(s1.t * 30)}; i++) { step(1 / 30); stepDeep(1 / 30); } return ${FP2}; })()`);
  check('generations: season 1 plays exactly like an Anthropocene run on the same seed', s1camp === s1run);
  errorCheck('generations start');

  // the page's own path (save to localStorage, heal, read it back as after a reload, newGame) against the live path. The heal is
  // shortened here (the full one is checked headless above): GEN.HEAL 60
  const live = await p.evaluate(`(() => { GEN.HEAL = 60; return ${GEN_LIVE('gen-ui', 200)}; })()`);
  await p.evaluate(() => { campLeave(); campClear(); newGame('run'); }); // a plain run, so the campaign starts from the menu path below
  await p.evaluate(() => { campNew(); paused = true; GEN.HEAL = 60; });
  await p.evaluate(GEN_S1.replace(/^/, '(() => { ') + ' })()'); // season 1, scripted, to its end
  await p.evaluate(() => { tlStep(true); showEnd(); });
  const endSave = await genSave(p);
  check('generations: at the season\'s end the save holds the ocean, the score and season 1\'s numbers, and no timelapse', endSave && endSave.rec.phase === 'heal' && endSave.rec.seasons.length === 1 && !!endSave.rec.ocean && !!endSave.rec.first && endSave.len < 400000,
    endSave && Math.round(endSave.len / 1024) + ' KB');
  await p.evaluate(() => { CAMP.rec = campRead(); campStopHeal(); campHealStart(); campHealShow(); }); // as if reloaded mid-heal
  check('generations: the heal runs (here without a worker: file://) and the next season\'s start is saved', await waitFor(p, () => CAMP && CAMP.between === 'ready'), await count(p, () => CAMP && CAMP.between));
  const pathB = await p.evaluate(`(() => { CAMP.rec = campRead(); newGame('run', CAMP); paused = true; const start = ${FP2}; ${GEN_S2(200)} return { start, s2: ${FP2}, haul: S.game.mins.map(m => m.haul).concat(S.game.haul) }; })()`);
  const L = JSON.parse(live);
  check('generations: the page\'s save, heal and load give the same season 2 as never saving (200 s with every tool)', pathB.start === L.start && pathB.s2 === L.s2 && JSON.stringify(pathB.haul) === JSON.stringify(L.haul), pathB.start === L.start ? 'start same' : 'start differs');
  errorCheck('generations save/load');

  // the whole path through the UI, with a short heal; real clicks
  await p.goto(URL + '?seed=gen-ui'); await wait(p, 300);
  await p.evaluate(`campClear(); window.FP2 = () => ${FP2}; GEN.HEAL = 60; { const o = campSetup; campSetup = seed => { o(seed); window.__startFP = FP2(); }; }`);
  await p.click('[data-mode=gen]'); await wait(p, 300); await p.evaluate(() => setHints(false));
  await toSeasonEnd(p);
  // (the whole season was recorded in one go here, so its 301 JPEGs are still encoding: real play encodes one every 2 s)
  check('generations: the season\'s end card says which season, puts the first ocean next to this one (pictures and counts)', await waitFor(p, () =>
    /Season 1 of 5 is over/.test(document.querySelector('#endCard h2').textContent) && document.querySelectorAll('.cmpt tr').length >= 9
    && /^data:image\/jpeg/.test(document.getElementById('cmpFirst').src) && /^blob:/.test(document.getElementById('cmpNow').src) && /Saved in this browser/.test(document.getElementById('endCard').textContent)));
  const picSave = await genSave(p);
  check('generations: the save keeps season 1\'s first picture (small), never the timelapse', picSave && /^data:image\/jpeg/.test(picSave.rec.first.pic) && picSave.rec.first.pic.length < 40000 && (JSON.stringify(picSave.rec).match(/data:image/g) || []).length === 1, picSave && Math.round(picSave.rec.first.pic.length / 1024) + ' KB picture, ' + Math.round(picSave.len / 1024) + ' KB in all');
  await shot(p, '9-gen-end');
  await p.evaluate(() => document.getElementById('pause').click()); // (the guard, not the UI: the card covers the toolbar)
  check('generations: between seasons the game cannot be unpaused', await count(p, () => paused));
  await press(p, '#campOn');
  check('generations: the heal card shows time passing, and the log is cleared', await count(p, () => CAMP.between === 'heal' && /stays in port/.test(document.querySelector('#endCard h2').textContent) && !!document.getElementById('healClock') && !logEl.children.length));
  await wait(p, 400); await shot(p, '9-gen-heal');
  check('generations: the heal ends on the next season\'s card', await waitFor(p, () => CAMP.between === 'ready'));
  check('generations: the ready card says what changed while it was left alone', await count(p, () => /Season 2 of 5/.test(document.querySelector('#endCard h2').textContent) && /left alone/.test(document.getElementById('endCard').textContent) && /→/.test(document.getElementById('endCard').textContent)));
  await shot(p, '9-gen-ready');
  await press(p, '#campGo'); await wait(p, 300);
  const s2 = await count(p, () => ({ seed: SEED, first: S.events[0].msg, tag: document.getElementById('tagline').textContent, t: S.t, fp: window.__startFP, hidden: endEl.hidden }));
  check('generations: season 2 starts on <seed>.s2 from the healed ocean, and the water is calm', s2.seed === 'gen-ui.s2' && s2.first === 'The water is calm.' && /season 2 of 5/.test(s2.tag) && s2.t < 2 && s2.hidden, JSON.stringify(s2).slice(0, 120));
  await p.click('#reset'); await wait(p, 200);
  check('generations: Reset starts the season over from its saved start', await count(p, () => SEED === 'gen-ui.s2' && S.t < 1) && (await count(p, () => window.__startFP)) === s2.fp);
  // reload mid-season: the menu offers to continue, and the season starts over from the same ocean
  await p.reload(); await wait(p, 400);
  await p.evaluate(`window.FP2 = () => ${FP2}; GEN.HEAL = 60; { const o = campSetup; campSetup = seed => { o(seed); window.__startFP = FP2(); }; }`);
  check('generations: after a reload the menu offers to continue season 2, and to abandon', await count(p, () => /season 2 of 5/.test(document.getElementById('genSub').textContent) && !document.getElementById('genSaved').hidden));
  await p.click('[data-mode=gen]'); await wait(p, 300);
  check('generations: continued after a reload, season 2 starts from exactly the saved ocean', (await count(p, () => SEED === 'gen-ui.s2' && window.__startFP)) === s2.fp);
  await p.evaluate(() => setHints(false));
  await toSeasonEnd(p); await wait(p, 500);
  check('generations: season 2\'s card gives the seasons so far and the campaign score so far', await count(p, () => /Season 2 of 5 is over/.test(document.querySelector('#endCard h2').textContent) && /Campaign score so far/.test(document.getElementById('endCard').textContent)));
  // reload on the end card: the heal is picked up again from the saved end
  await p.reload(); await wait(p, 400);
  await p.evaluate(() => { GEN.HEAL = 60; });
  check('generations: after a reload on the end card the menu says the season is over', await count(p, () => /season 2 of 5 is over/.test(document.getElementById('genSub').textContent)));
  await p.click('[data-mode=gen]');
  const picked = await count(p, () => CAMP.between === 'heal' && !endEl.hidden && menuEl.hidden);
  check('generations: continued, the heal picks up and ends on season 3', picked && await waitFor(p, () => CAMP.between === 'ready' && /Season 3 of 5/.test(document.querySelector('#endCard h2').textContent)));
  // the card's Menu, and Back to the card
  await press(p, '#campMenu'); await wait(p, 200);
  check('generations: the card\'s Menu opens the menu, the campaign waits', await count(p, () => !menuEl.hidden && endEl.hidden && !document.getElementById('menuBack').hidden));
  await p.click('#menuBack button'); await wait(p, 200);
  check('generations: Back returns to the card', await count(p, () => menuEl.hidden && !endEl.hidden && CAMP.between === 'ready'));
  // abandon: asked first, then the final screen for the seasons played, and the save is gone
  await press(p, '#campQuit'); await wait(p, 150);
  check('generations: Abandon asks first', await count(p, () => !!document.getElementById('campQuitYes') && CAMP.between === 'ready'));
  await press(p, '#campQuitNo'); await wait(p, 150);
  check('generations: Keep it puts the buttons back', await count(p, () => !!document.getElementById('campGo') && !!document.getElementById('campQuit')));
  await press(p, '#campQuit'); await press(p, '#campQuitYes'); await wait(p, 300);
  const fin = await count(p, () => ({ h2: document.querySelector('#endCard h2').textContent, score: +document.querySelector('#endCard .bigscore').textContent, words: document.querySelectorAll('#endCard .verdict').length }));
  const fin2 = await genSave(p);
  check('generations: abandoned after 2 seasons, the final screen shows them and the save is cleared', /after 2 seasons/.test(fin.h2) && fin.words >= 3 && fin2 === null, fin.h2);
  await press(p, '#campMenu2'); await wait(p, 200);
  check('generations: from the final screen the menu has no campaign to continue', await count(p, () => !menuEl.hidden && document.getElementById('genSaved').hidden && /Five seasons/.test(document.getElementById('genSub').textContent)));
  errorCheck('generations UI');

  // five short seasons to the final screen (RUN.DUR 60 and GEN.HEAL 10 here only)
  await p.goto(URL + '?seed=gen-five'); await wait(p, 300);
  await p.evaluate(() => { RUN.DUR = 60; GEN.HEAL = 10; });
  await p.click('[data-mode=gen]'); await wait(p, 200); await p.evaluate(() => setHints(false));
  for (let k = 1; k <= 5; k++) {
    await toSeasonEnd(p); await wait(p, 300);
    if (k < 5) { await press(p, '#campOn'); await waitFor(p, () => CAMP.between === 'ready'); await press(p, '#campGo'); await wait(p, 150); }
  }
  const doneSave = await genSave(p);
  check('generations: after season 5 the card leads to the end, and the save says the campaign is over', await count(p, () => /Season 5 of 5 is over/.test(document.querySelector('#endCard h2').textContent) && /How it ended/.test(document.getElementById('campOn').textContent)) && doneSave && doneSave.rec.phase === 'done');
  const scores = doneSave.rec.seasons.map(s => s.score);
  await press(p, '#campOn'); await wait(p, 400);
  const f5 = await count(p, () => ({ h2: document.querySelector('#endCard h2').textContent, score: +document.querySelector('#endCard .bigscore').textContent, rows: document.querySelectorAll('#endCard table')[0].rows.length, pics: [...document.querySelectorAll('#endCard .cmp img')].filter(i => i.src && !i.parentElement.hidden).length, calm: /The water is calm/.test(document.getElementById('endCard').textContent) }));
  check('generations: the final screen: five seasons, the campaign score is their average, first and last ocean in words and pictures',
    /5 seasons on one ocean/.test(f5.h2) && f5.score === Math.round(scores.reduce((a, v) => a + v, 0) / 5) && f5.rows === 5 && f5.pics === 2 && f5.calm, JSON.stringify(f5) + ' scores ' + scores.join(','));
  check('generations: the final screen clears the save', (await genSave(p)) === null);
  await shot(p, '9-gen-final');
  await press(p, '#campNew'); await wait(p, 300);
  check('generations: New campaign starts season 1 of a new one', await count(p, () => CAMP && CAMP.rec.season === 1 && SEED === 'gen-five.s1' && endEl.hidden));
  // the other modes still work after a campaign, and leave it saved
  await p.evaluate(() => { RUN.DUR = 600; });
  await p.click('#menuBtn'); await wait(p, 150); await p.click('[data-mode=run]'); await wait(p, 300);
  check('generations: the Anthropocene run after a campaign is a plain run, the campaign stays saved', await count(p, () => !CAMP && SEED === 'gen-five' && document.getElementById('tagline').textContent === 'Anthropocene run') && !!(await genSave(p)));
  errorCheck('generations five');
  await p.close();

  // storage that is full or missing: the campaign still plays, it only cannot resume
  for (const [name, init] of [['full', () => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; }],
    ['blocked', () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); }]]) {
    const q = await b.newPage({ viewport: { width: 1280, height: 800 } });
    q.on('pageerror', e => errors.push(String(e))); q.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await q.addInitScript(init); await q.goto(URL + '?seed=gen-st'); await wait(q, 300);
    await q.evaluate(() => { GEN.HEAL = 10; }); await q.click('[data-mode=gen]'); await wait(q, 200); await q.evaluate(() => setHints(false));
    await toSeasonEnd(q); await wait(q, 400);
    const said = await count(q, () => /would not keep it/.test(document.getElementById('endCard').textContent) && CAMP.saved === false);
    await press(q, '#campOn'); await waitFor(q, () => CAMP.between === 'ready'); await press(q, '#campGo'); await wait(q, 200);
    check('generations (storage ' + name + '): the campaign plays on into season 2 and says it cannot be kept', said && await count(q, () => SEED === 'gen-st.s2' && S.events[0].msg === 'The water is calm.'));
    errorCheck('generations storage ' + name);
    await q.close();
  }
  // a save from an older version is not continued: the menu says so, and Generations starts a new campaign
  const o = await b.newPage({ viewport: { width: 1280, height: 800 } });
  o.on('pageerror', e => errors.push(String(e)));
  await o.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('deep-tide.generations', JSON.stringify({ v: 0, seed: 'old', season: 3, phase: 'play' })); } });
  await o.goto(URL + '?seed=gen-old'); await wait(o, 300);
  check('generations: a save from an older version is not continued, and the menu says so', await count(o, () => /older version/.test(document.getElementById('genSub').textContent) && document.getElementById('genSaved').hidden));
  await o.click('[data-mode=gen]'); await wait(o, 200);
  check('generations: Generations then starts a new campaign over it', await count(o, () => SEED === 'gen-old.s1') && (await genSave(o)).rec.v === 1);
  errorCheck('generations old save');
  await o.close();

  // a phone: every card fits the width, the buttons take a tap
  const m = await openPage(b, 390, 844, true);
  await m.goto(URL + '?seed=gen-phone'); await wait(m, 300);
  await m.evaluate(() => { GEN.HEAL = 20; });
  await m.tap('[data-mode=gen]'); await wait(m, 300); await m.evaluate(() => setHints(false));
  await toSeasonEnd(m); await wait(m, 600);
  const fits = () => count(m, () => { const k = document.getElementById('endCard').getBoundingClientRect(); return document.scrollingElement.scrollWidth <= innerWidth && k.left >= 0 && k.right <= innerWidth + 0.5 && [...document.querySelectorAll('#endCard img, #endCard table, #endCard canvas')].every(e => e.getBoundingClientRect().right <= k.right + 0.5); });
  check('generations (phone): the season\'s end card fits the width', await fits());
  await shot(m, '9-gen-phone-end');
  await m.evaluate(() => document.getElementById('campOn').scrollIntoView()); await wait(m, 200); await m.tap('#campOn'); await wait(m, 300);
  await shot(m, '9-gen-phone-heal');
  check('generations (phone): the heal card and the ready card fit, Start takes a tap', await waitFor(m, () => CAMP.between === 'ready') && await fits());
  await shot(m, '9-gen-phone-ready');
  await m.tap('#campGo'); await wait(m, 300);
  check('generations (phone): season 2 runs', await count(m, () => SEED === 'gen-phone.s2' && endEl.hidden && !paused));
  errorCheck('generations phone');
  await m.close();
}

(async () => {
  const b = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { for (const f of [desktop, seeds, photoMode, followMode, timelapse, generations, phone, installable]) if (!ONLY || ONLY.includes(f.name)) await f(b); }
  catch (e) { check('test ran to the end', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  const failed = results.filter(r => !r.ok);
  console.log(failed.length ? `\n${failed.length} of ${results.length} checks FAILED` : `\nall ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
