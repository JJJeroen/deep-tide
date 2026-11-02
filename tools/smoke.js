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

  // released well above the trawl band (y 400): the trawler still sweeping there would net them within 300 ms
  await p.keyboard.press('i'); const iv = await toPage(p, 1200, 150); await p.mouse.click(iv.x, iv.y); await wait(p, 300);
  check('invader tool releases invaders', await count(p, () => S.counts[INVADER] > 0));
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
  await p.evaluate(() => { for (let i = 0; i < 30 * 61; i++) step(1 / 30); }); // a first minute with no catch
  check('run: a short minute sends head office\'s trawler', await count(p, () => S.trawlers.some(t => t.company) && S.game.companyTrips === 1));
  await p.evaluate(() => { for (let i = 0; i < 30 * 536; i++) step(1 / 30); }); // sim to just before the end, then let the page finish it
  await p.waitForFunction(() => !document.getElementById('end').hidden, null, { timeout: 15000 }).catch(() => {});
  check('run: end screen appears after 10:00', await p.isVisible('#end'));
  check('run: end screen has a verdict', await count(p, () => document.getElementById('endCard').innerText.trim().length > 40));
  await shot(p, '4-end');
  errorCheck('run');
  await p.close();
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
  try { await desktop(b); await phone(b); }
  catch (e) { check('test ran to the end', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  const failed = results.filter(r => !r.ok);
  console.log(failed.length ? `\n${failed.length} of ${results.length} checks FAILED` : `\nall ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
