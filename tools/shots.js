#!/usr/bin/env node
// Fixed screenshots of Deep Tide for a blind design review (design-review skill, section 6; the shot list is in
// docs/review-brief.md). The same command gives the same pictures, so a run after a change compares like with like:
// the ocean seed is pinned, Math.random (used by render and sound) is seeded, and the page runs on a virtual clock
// that this script advances itself, frame by frame. The game is not changed.
//   cd tools && npm install          (once: playwright-core only)
//   node tools/shots.js <outdir>
// Optional: FONTCONFIG_FILE=<fonts.conf> renders system-ui in another font (the owner's PC shows Segoe UI).
// Browser: $CHROME_PATH, else the newest Playwright Chromium in ~/.cache/ms-playwright.
const fs = require('fs'), path = require('path'), os = require('os');
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.error('playwright-core missing: run `npm install` in tools/'); process.exit(2); }

const OUT = process.argv[2] && path.resolve(process.argv[2]);
if (!OUT) { console.error('usage: node tools/shots.js <outdir>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(__dirname, '..'), URL = 'file://' + path.join(ROOT, 'index.html') + '?seed=review-1';

function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]) : [];
  for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
    const p = path.join(base, d, sub); if (fs.existsSync(p)) return p;
  }
  return undefined;
}

// Runs before the game's scripts: seeded Math.random, and a clock (with its timers) that only moves when __pump()
// or __skip() is called.
const CLOCK = () => {
  let a = 20261115;
  Math.random = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let now = 0, queue = [], timers = [], tid = 0;
  performance.now = () => now;
  Date.now = () => 1767268800000 + now;
  window.requestAnimationFrame = cb => queue.push(cb);
  window.cancelAnimationFrame = () => {};
  // the log fades its lines on timers: on the virtual clock they fade after 11 game seconds, as in real play
  window.setTimeout = (fn, ms = 0, ...args) => { timers.push({ id: ++tid, at: now + ms, fn, args }); return tid; };
  window.clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
  const fire = () => {
    for (;;) {
      timers.sort((p, q) => p.at - q.at || p.id - q.id);
      if (!timers.length || timers[0].at > now) return;
      const t = timers.shift(); t.fn(...t.args);
    }
  };
  // draw n frames at 30 fps; each frame advances the game exactly as the real loop would
  window.__pump = n => { for (let i = 0; i < n; i++) { now += 1000 / 30; fire(); const cbs = queue; queue = []; for (const cb of cbs) cb(now); } };
  // advance the sim (and the deep) by s seconds without drawing; the log still takes its lines as they happen and
  // fades them on time. Then the scene catches up.
  window.__skip = s => {
    for (let i = 0; i < s * 30 && !S.game.over; i++) { step(1 / 30); stepDeep(1 / 30); now += 1000 / 30; fire(); if (i % 15 === 14) updateUI(); }
    stepReefFilm(s); stepFleet(s);
  };
};

const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

// Each shot starts from a fresh page, so no state leaks from one to the next.
const SHOTS = [
  ['01-menu-desktop', DESKTOP, async p => { await p.evaluate(() => __pump(60)); }],
  ['02-reef-day-desktop', DESKTOP, async p => { await sandbox(p); await p.evaluate(() => { __skip(20); __pump(60); }); }],
  ['03-trawler-desktop', DESKTOP, async p => { await sandbox(p); await p.evaluate(() => { __skip(10); startTrawl(560); for (let i = 0; i < 300 && S.trawlers.length && S.trawlers[0].x < 950; i++) __pump(1); }); }],
  ['04-night-glows-desktop', DESKTOP, async p => { await sandbox(p); await p.evaluate(() => { __skip(10); while (nightAt(S.t) < 0.95) __skip(1); __pump(60); }); }],
  ['05-bloom-dead-zone-desktop', DESKTOP, async p => {
    await sandbox(p);
    await p.evaluate(() => { for (let x = 0; x <= 1600; x += 40) for (const y of [220, 420]) for (let k = 0; k < 8; k++) addRunoff(x, y, RUNOFF.r, RUNOFF.amt); __skip(90); __pump(60); });
  }],
  ['06-deep-desktop', DESKTOP, async p => { await sandbox(p); await p.evaluate(() => { __skip(20); document.getElementById('depthBtn').click(); __pump(90); }); }],
  ['07-end-screen-desktop', DESKTOP, async p => {
    await p.click('[data-mode=run]'); await p.evaluate(() => setHints(false));
    await p.evaluate(() => { __skip(700); if (S.game.over) { paused = true; showEnd(); } __pump(10); });
  }],
  ['08-reef-day-phone', PHONE, async p => { await sandbox(p, true); await p.evaluate(() => { __skip(20); __pump(60); }); }],
  ['09-run-phone', PHONE, async p => { await p.tap('[data-mode=run]'); await p.evaluate(() => { setHints(false); __skip(150); __pump(60); }); }],
];

async function sandbox(p, tap) {
  await (tap ? p.tap('[data-mode=sandbox]') : p.click('[data-mode=sandbox]'));
  await p.evaluate(() => setHints(false));
}

(async () => {
  const browser = await chromium.launch({ executablePath: browserPath() });
  let failed = 0;
  for (const [name, opts, act] of SHOTS) {
    const ctx = await browser.newContext(opts), p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await ctx.addInitScript(CLOCK);
    await p.goto(URL);
    await p.evaluate(() => __pump(2));
    await act(p);
    const file = path.join(OUT, name + '.png');
    await p.screenshot({ path: file, animations: 'disabled' });
    console.log(file + (errors.length ? '  ERRORS: ' + errors.slice(0, 3).join(' | ') : ''));
    failed += errors.length > 0;
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
