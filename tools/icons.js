#!/usr/bin/env node
// Draws the app icons in icons/ from the favicon's shapes (index.html: a teal fish on deep blue), in headless Chromium.
//   node tools/icons.js
// icon-192 / icon-512: the favicon as it is, a rounded square (installed on a desktop, the browser tab).
// icon-maskable-512: full bleed, the fish inside the middle 80 % circle that Android may crop the icon to.
// apple-touch-icon (180): full bleed, iOS rounds the corners itself.
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright-core');

const OUT = path.resolve(__dirname, '..', 'icons');
const BG = '#073a57', FISH = '#5fd4d0';
// the fish spans x 6..27 and y 12.5..21.5 of the favicon's 32 x 32 box, so its middle is (16.5, 17)
const fish = k => `<g transform="translate(16 16) scale(${k}) translate(-16.5 -17)">` +
  `<path d="M6 17c4-6 12-6 16 0-4 6-12 6-16 0z" fill="${FISH}"/><path d="M22 17l5-4v8z" fill="${FISH}"/>` +
  `<circle cx="10" cy="16" r="1.3" fill="${BG}"/></g>`;
const svg = (rx, k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="${rx}" fill="${BG}"/>${fish(k)}</svg>`;
// rounded: exactly the favicon (its fish sits 0.5 lower than centred; kept, so the two match)
const ROUNDED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${BG}"/>` +
  `<path d="M6 17c4-6 12-6 16 0-4 6-12 6-16 0z" fill="${FISH}"/><path d="M22 17l5-4v8z" fill="${FISH}"/><circle cx="10" cy="16" r="1.3" fill="${BG}"/></svg>`;
const ICONS = [
  { file: 'icon-192.png', size: 192, svg: ROUNDED },
  { file: 'icon-512.png', size: 512, svg: ROUNDED },
  { file: 'icon-maskable-512.png', size: 512, svg: svg(0, 0.9) }, // the fish's far corners ~10.3 from the middle; the safe circle is 12.8
  { file: 'apple-touch-icon.png', size: 180, svg: svg(0, 1.05) },
];

function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]) : [];
  for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
    const p = path.join(base, d, sub); if (fs.existsSync(p)) return p;
  }
  return undefined;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: browserPath(), args: ['--no-sandbox'] });
  for (const ic of ICONS) {
    const p = await b.newPage({ viewport: { width: ic.size, height: ic.size }, deviceScaleFactor: 1 });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${ic.size}px;height:${ic.size}px}</style>${ic.svg}`);
    await p.screenshot({ path: path.join(OUT, ic.file), omitBackground: true });
    await p.close();
    console.log('icons/' + ic.file, ic.size + 'x' + ic.size);
  }
  await b.close();
})();
