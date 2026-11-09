#!/usr/bin/env node
// Browser smoke test for Deep Tide: loads index.html in headless Chromium and drives it the way a player would
// (mode picker, tool keys, clicks on the water, scrolling into the deep, a phone viewport), then checks game state.
//   cd tools && npm install          (once: playwright-core only, it does not download a browser)
//   node tools/smoke.js [--shots <dir>]
// Browser: $CHROME_PATH, else the newest Playwright Chromium in ~/.cache/ms-playwright (npx playwright install chromium).
// Exit code 0 = all checks passed. Frame times are printed for information only (headless timing is too noisy to gate on).
const fs = require('fs'), path = require('path'), os = require('os');
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.error('playwright-core missing: run `npm install` in tools/'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..'), URL = 'file://' + path.join(ROOT, 'index.html');
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
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

  // sandbox: the sim runs and every tool does something
  await p.click('[data-mode=sandbox]');
  await p.evaluate(() => setHints(false));
  const t0 = await count(p, () => S.t); await wait(p, 1000);
  check('sandbox: the simulation advances', (await count(p, () => S.t)) > t0 + 0.5);
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

  // learn mode: the coach appears on step 1
  await p.click('#menuBtn'); await p.click('[data-mode=learn]'); await wait(p, 600);
  check('learn mode: the coach shows step 1', await count(p, () => !document.getElementById('coach').hidden && C.L.step === 0), await count(p, () => 'step ' + C.L.step));
  await shot(p, '3-learn');
  errorCheck('learn');

  // scored run: HUD up, ballast ship, then fast-forward to the end screen
  await p.click('#menuBtn'); await p.click('[data-mode=run]'); await wait(p, 500);
  check('run: HUD shows', await p.isVisible('#hud'));
  check('run: stock tool is locked', await p.isDisabled('[data-tool=stock]'));
  check('run: pollute reads Dump, with waste and farm runoff', await count(p, () => document.querySelector('[data-tool=pollute]').textContent === 'Dump' && pollSel.options[1].textContent === 'farm runoff'));
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

async function phone(b) {
  console.log('phone 390x844');
  const p = await openPage(b, 390, 844, true);
  await p.tap('[data-mode=sandbox]'); await wait(p, 1200);
  check('phone: no sideways scrolling', await count(p, () => document.documentElement.scrollWidth <= innerWidth + 1),
    await count(p, () => document.documentElement.scrollWidth + ' > ' + innerWidth));
  check('phone: depth button is reachable', await p.isVisible('#depthBtn'));
  const q = await count(p, () => { const a = S.agents.find(a => !a.dead && a.t !== PLANKTON && a.y > 40); return { x: ox + a.x * scale, y: oy + a.y * scale }; });
  await p.touchscreen.tap(q.x, q.y); await wait(p, 300);
  check('phone: tapping an animal shows its label', await count(p, () => !!inspect));
  await shot(p, '5-phone');
  errorCheck('phone');
  await p.close();
}

(async () => {
  const b = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try { await desktop(b); await seeds(b); await phone(b); }
  catch (e) { check('test ran to the end', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  const failed = results.filter(r => !r.ok);
  console.log(failed.length ? `\n${failed.length} of ${results.length} checks FAILED` : `\nall ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
