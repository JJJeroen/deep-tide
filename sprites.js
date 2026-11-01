// Deep Tide sprite atlases: every animal pre-rendered into animation frames. Depends only on SPECIES (sim.js).
// Drawing paths per frame was cheap but flat, so each animal is drawn once at load into a set of frames:
// - natural colours per species (LOOK); the bright legend colour from SPECIES survives as one accent, so the animal
//   still matches its dot in the species panel without looking like a toy
// - side-view animals bend along the whole body (a travelling wave, BEND), and the tail fin foreshortens as it swings
// - every frame also comes in a few depth tints (TINT), so deeper animals take on the colour of the water around them
const TAU = Math.PI * 2;
const DARK = '#04121c', PALE = '#eaf7ff';

function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixHex(a, b, k) {
  const A = hexRGB(a), B = hexRGB(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * k), g = Math.round(A[1] + (B[1] - A[1]) * k), bl = Math.round(A[2] + (B[2] - A[2]) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}
function rgbaH(h, a) { const c = hexRGB(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

// Natural looks. grazer: a fusilier (silver-blue, yellow tail); hunter: an amberjack (bronze, amber eye band);
// invader: a lionfish, the real invasive species of the Atlantic; shark: a blacktip reef shark; turtle: a green turtle; manta: a reef manta.
const LOOK = {
  grazer:  { back: '#2a6a8c', flank: '#a6d6e4', belly: '#f0fafc', fin: '#efd060', iris: '#a9c3cc', h: 0.42, nose: 1.0, eye: 0.14, dorsal: 1.45, tail: 'fork', stripe: 'mid' },
  hunter:  { back: '#36434e', flank: '#b8bfba', belly: '#f4f1e8', fin: '#b9853f', iris: '#e8b04a', h: 0.30, nose: 1.1, eye: 0.12, dorsal: 1.9, tail: 'lunate', stripe: 'band', scales: true },
  invader: { back: '#8a3040', flank: '#f2e2d2', belly: '#f8eee6', fin: '#efd9cc', iris: '#e8c060', h: 0.40, nose: 1.0, eye: 0.13, dorsal: 2.6, tail: 'round', bands: '#a8203a' },
  shark:   { back: '#4b5c6c', flank: '#8fa3b4', belly: '#f2f6f8', tip: '#141b23', iris: '#c9d2a0' },
  turtle:  { shell: '#4a3b22', scute: '#8f7140', streak: '#d9b46a', skin: '#b9a06c', skinDark: '#5e4a2a' },
  manta:   { back: '#1b2230', mid: '#2a3448', patch: '#e3ebf3' },
};

// How far the drawing spills from the body centre, in body-size units.
// Side-view animals keep y symmetric so the belly-down flip stays centred; the upright jelly does not need that.
const SPRITE_BOUNDS = {
  fish:    sz => ({ x0: -1.80 * sz, w: 3.00 * sz, y0: -1.36 * sz, h: 2.72 * sz }), // room for the lionfish's spines
  shark:   sz => ({ x0: -1.72 * sz, w: 2.95 * sz, y0: -0.92 * sz, h: 1.84 * sz }),
  turtle:  sz => ({ x0: -1.22 * sz, w: 2.66 * sz, y0: -1.16 * sz, h: 2.32 * sz }), // flipper tips reach ~1.1 at full flap
  manta:   sz => ({ x0: -2.16 * sz, w: 3.36 * sz, y0: -1.22 * sz, h: 2.44 * sz }),
  jelly:   sz => ({ x0: -1.30 * sz, w: 2.60 * sz, y0: -1.40 * sz, h: 3.90 * sz }),
};
const SPRITE_FRAMES = { fish: 12, shark: 10, turtle: 8, manta: 10, jelly: 8 };
const BEAT_HZ = { grazer: 1.5, hunter: 1.15, invader: 1.0, shark: 0.7, turtle: 0.6, manta: 0.55, jelly: 0.35 };
const BEND = { fish: 0.07, shark: 0.045 }; // travelling body wave at the tail, in body sizes (side-view shapes only)
const TINT = [0, 0.16, 0.32, 0.48];        // depth tint levels: share of deep-water colour laid over the animal
const DEEP_TINT = '#0a3a55';

function fishBody(g, sz, nose, h) {
  g.beginPath();
  g.moveTo(nose * sz, 0);
  g.bezierCurveTo(nose * 0.62 * sz, -h, 0.05 * sz, -h, -0.55 * sz, -0.58 * h);
  g.quadraticCurveTo(-0.76 * sz, -0.30 * h, -0.78 * sz, 0);
  g.quadraticCurveTo(-0.76 * sz, 0.30 * h, -0.55 * sz, 0.58 * h);
  g.bezierCurveTo(0.05 * sz, h, nose * 0.62 * sz, h, nose * sz, 0);
  g.closePath();
}
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function eye(g, x, y, r, iris) {
  g.fillStyle = 'rgba(8,20,28,.5)'; circle(g, x, y, r * 1.18);       // socket shadow
  g.fillStyle = iris || '#cfe2ea'; circle(g, x, y, r);                // iris
  g.fillStyle = '#050c12'; circle(g, x, y, r * 0.6);                  // pupil
  if (r > 0.5) { g.fillStyle = 'rgba(255,255,255,.92)'; circle(g, x - r * 0.3, y - r * 0.34, r * 0.26); }
}
// fill a fin, then draw its rays clipped to it, so rays never poke past the edge
function fin(g, path, fill, rayCol, rays, lw) {
  path(); g.fillStyle = fill; g.fill();
  g.save(); path(); g.clip();
  g.strokeStyle = rayCol; g.lineWidth = lw;
  for (const r of rays) { g.beginPath(); g.moveTo(r[0], r[1]); g.lineTo(r[2], r[3]); g.stroke(); }
  g.restore();
}

const SHAPE_DRAW = {
  // upright bell with pulsing dome, oral arms and trailing tentacles (drawn without rotation)
  jelly(g, sp, sz, ph) {
    const r = sz * (1 + Math.sin(ph * TAU) * 0.12), col = sp.color;
    g.lineCap = 'round';
    for (let i = -2; i <= 2; i++) { // trailing tentacles
      const x = i * r * 0.40, wob = Math.sin(ph * TAU + i * 1.3) * r * 0.38;
      g.strokeStyle = 'rgba(214,186,255,.42)'; g.lineWidth = Math.max(0.5, r * 0.085);
      g.beginPath(); g.moveTo(x, r * 0.2);
      g.bezierCurveTo(x + wob, r * 0.85, x - wob, r * 1.5, x + wob * 0.55, r * 2.1);
      g.stroke();
    }
    for (let i = -1; i <= 1; i++) { // oral arms
      const x = i * r * 0.28, wob = Math.sin(ph * TAU + i) * r * 0.22;
      g.strokeStyle = 'rgba(234,216,255,.5)'; g.lineWidth = Math.max(0.7, r * 0.15);
      g.beginPath(); g.moveTo(x, r * 0.25);
      g.quadraticCurveTo(x + wob, r * 0.85, x + wob * 0.6, r * 1.3);
      g.stroke();
    }
    g.lineCap = 'butt';
    const bg = g.createLinearGradient(0, -r * 1.1, 0, r * 0.3);
    bg.addColorStop(0, mixHex(col, '#ffffff', 0.35));
    bg.addColorStop(0.55, col);
    bg.addColorStop(1, mixHex(col, DARK, 0.2));
    g.fillStyle = bg; g.globalAlpha = 0.88;
    g.beginPath();
    g.moveTo(-r, r * 0.1);
    g.bezierCurveTo(-r, -r * 1.15, r, -r * 1.15, r, r * 0.1);
    g.quadraticCurveTo(0, r * 0.5, -r, r * 0.1);
    g.closePath(); g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(230,212,255,.55)'; g.lineWidth = Math.max(0.5, r * 0.08);
    g.beginPath(); g.moveTo(-r, r * 0.1); g.quadraticCurveTo(0, r * 0.5, r, r * 0.1); g.stroke();
    g.fillStyle = 'rgba(255,248,255,.18)';
    g.beginPath(); g.ellipse(0, -r * 0.12, r * 0.5, r * 0.3, 0, 0, TAU); g.fill();
  },

  // side view, nose to the right. The body wave is added afterwards in buildSprites; here the tail fin
  // foreshortens with `ph` (it swings toward and away from the viewer) and the pectoral fin flutters.
  fish(g, sp, sz, ph) {
    const L = LOOK[sp.id] || LOOK.grazer, h = L.h * sz, s = Math.sin(ph * TAU), c = Math.cos(ph * TAU);
    const lw = Math.max(0.3, 0.045 * sz), finCol = mixHex(L.fin, L.back, 0.3), rayCol = rgbaH(L.back, 0.4);
    const lion = !!L.bands;

    // caudal fin
    g.save(); g.translate(-0.70 * sz, 0); g.scale(0.45 + 0.55 * Math.abs(c), 1); g.rotate(s * 0.08);
    const tg = g.createLinearGradient(0, 0, -0.85 * sz, 0);
    tg.addColorStop(0, finCol); tg.addColorStop(1, rgbaH(L.fin, lion ? 0.55 : 0.85));
    const tail = () => {
      g.beginPath();
      if (L.tail === 'fork') {
        g.moveTo(0.06 * sz, 0);
        g.quadraticCurveTo(-0.34 * sz, -0.10 * sz, -0.82 * sz, -0.62 * sz);
        g.quadraticCurveTo(-0.42 * sz, 0, -0.82 * sz, 0.62 * sz);
        g.quadraticCurveTo(-0.34 * sz, 0.10 * sz, 0.06 * sz, 0);
      } else if (L.tail === 'lunate') {
        g.moveTo(0.06 * sz, 0);
        g.quadraticCurveTo(-0.30 * sz, -0.16 * sz, -0.76 * sz, -0.72 * sz);
        g.quadraticCurveTo(-0.50 * sz, -0.12 * sz, -0.42 * sz, 0);
        g.quadraticCurveTo(-0.50 * sz, 0.12 * sz, -0.76 * sz, 0.72 * sz);
        g.quadraticCurveTo(-0.30 * sz, 0.16 * sz, 0.06 * sz, 0);
      } else { // rounded fan
        g.moveTo(0.04 * sz, -0.14 * sz);
        g.bezierCurveTo(-0.45 * sz, -0.62 * sz, -0.86 * sz, -0.30 * sz, -0.86 * sz, 0);
        g.bezierCurveTo(-0.86 * sz, 0.30 * sz, -0.45 * sz, 0.62 * sz, 0.04 * sz, 0.14 * sz);
      }
      g.closePath();
    };
    const tr = [];
    for (let i = -4; i <= 4; i++) tr.push([0.05 * sz, 0, -0.95 * sz, i * 0.19 * sz]);
    fin(g, tail, tg, lion ? rgbaH(L.bands, 0.6) : rayCol, tr, lw * 0.55);
    g.restore();

    // dorsal fin (behind the body). The lionfish gets long banded spines with a thin web instead.
    if (lion) {
      g.fillStyle = rgbaH(L.fin, 0.32);
      g.beginPath(); g.moveTo(0.36 * sz, -0.6 * h);
      for (let i = 0; i <= 8; i++) { const x = (0.34 - i * 0.1) * sz, len = L.dorsal * h * (0.55 + 0.45 * Math.sin((i + 1) / 10 * Math.PI)); g.lineTo(x - 0.22 * sz, -0.62 * h - len); }
      g.lineTo(-0.5 * sz, -0.55 * h); g.closePath(); g.fill();
      g.lineCap = 'round';
      for (let i = 0; i <= 8; i++) {
        const x = (0.34 - i * 0.1) * sz, len = L.dorsal * h * (0.55 + 0.45 * Math.sin((i + 1) / 10 * Math.PI));
        g.lineWidth = lw * 0.9; g.strokeStyle = L.fin;
        g.beginPath(); g.moveTo(x, -0.62 * h); g.lineTo(x - 0.22 * sz, -0.62 * h - len); g.stroke();
        g.setLineDash([0.14 * sz, 0.14 * sz]); g.strokeStyle = L.bands;
        g.beginPath(); g.moveTo(x, -0.62 * h); g.lineTo(x - 0.22 * sz, -0.62 * h - len); g.stroke();
        g.setLineDash([]);
      }
      g.lineCap = 'butt';
    } else {
      const dorsal = () => {
        g.beginPath();
        g.moveTo(0.30 * sz, -0.55 * h);
        g.quadraticCurveTo(0.06 * sz, -L.dorsal * h, -0.34 * sz, -0.70 * h);
        g.quadraticCurveTo(-0.02 * sz, -0.58 * h, 0.30 * sz, -0.55 * h);
        g.closePath();
      };
      const dr = [];
      for (let i = 0; i < 6; i++) { const x = (0.26 - i * 0.11) * sz; dr.push([x, -0.5 * h, x - 0.12 * sz, -2 * h]); }
      fin(g, dorsal, rgbaH(finCol, 0.9), rayCol, dr, lw * 0.5);
    }
    // anal fin
    g.fillStyle = rgbaH(finCol, 0.85);
    g.beginPath(); g.moveTo(-0.16 * sz, 0.52 * h); g.quadraticCurveTo(-0.34 * sz, 1.02 * h, -0.50 * sz, 0.56 * h); g.closePath(); g.fill();

    // body: dark back, silver flank, pale belly
    const bg = g.createLinearGradient(0, -h, 0, h);
    bg.addColorStop(0, L.back); bg.addColorStop(0.38, mixHex(L.back, L.flank, 0.7)); bg.addColorStop(0.56, L.flank); bg.addColorStop(1, L.belly);
    g.fillStyle = bg; fishBody(g, sz, L.nose, h); g.fill();
    g.save(); fishBody(g, sz, L.nose, h); g.clip();
    if (lion) { // red-brown bands, slanting back
      g.fillStyle = rgbaH(L.bands, 0.85);
      for (let i = -4; i <= 6; i++) {
        const x = i * 0.15 * sz;
        g.beginPath(); g.moveTo(x, -h); g.lineTo(x + 0.08 * sz, -h); g.lineTo(x - 0.06 * sz, h); g.lineTo(x - 0.14 * sz, h); g.closePath(); g.fill();
      }
    }
    if (L.stripe === 'mid') { // fusilier: a legend-coloured stripe with a thin yellow line above it
      g.lineCap = 'round';
      g.strokeStyle = rgbaH(sp.color, 0.8); g.lineWidth = 0.14 * h;
      g.beginPath(); g.moveTo(-0.85 * sz, 0.0); g.quadraticCurveTo(0, -0.18 * h, 0.78 * sz, -0.10 * h); g.stroke();
      g.strokeStyle = rgbaH(L.fin, 0.7); g.lineWidth = 0.07 * h;
      g.beginPath(); g.moveTo(-0.85 * sz, -0.18 * h); g.quadraticCurveTo(0, -0.38 * h, 0.7 * sz, -0.30 * h); g.stroke();
      g.lineCap = 'butt';
    } else if (L.stripe === 'band') { // amberjack: a dark band through the eye and a legend-coloured flank stripe
      g.strokeStyle = rgbaH(sp.color, 0.7); g.lineWidth = 0.16 * h;
      g.beginPath(); g.moveTo(0.9 * sz, -0.12 * h); g.quadraticCurveTo(0, -0.08 * h, -0.85 * sz, 0.02 * h); g.stroke();
      g.strokeStyle = 'rgba(30,26,22,.35)'; g.lineWidth = 0.12 * h;
      g.beginPath(); g.moveTo(0.85 * sz, -0.7 * h); g.lineTo(0.42 * sz, 0.1 * h); g.stroke();
    }
    if (L.scales) {
      g.strokeStyle = 'rgba(10,30,40,.13)'; g.lineWidth = lw * 0.45;
      for (let row = 0, y = -0.7 * h; y < 0.75 * h; y += 0.17 * h, row++)
        for (let x = -0.7 * sz + (row % 2) * 0.06 * sz; x < 0.4 * sz; x += 0.12 * sz) { g.beginPath(); g.arc(x, y, 0.075 * sz, Math.PI * 0.55, Math.PI * 1.45); g.stroke(); }
    }
    // iridescent sheen along the flank, shade toward the tail, light along the back
    const ir = g.createLinearGradient(0, -0.4 * h, 0, 0.4 * h);
    ir.addColorStop(0, 'rgba(255,255,255,0)'); ir.addColorStop(0.45, 'rgba(200,236,255,.26)'); ir.addColorStop(0.62, 'rgba(232,212,255,.16)'); ir.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ir; g.fillRect(-sz, -0.4 * h, 2.2 * sz, 0.8 * h);
    const sh = g.createLinearGradient(0.9 * sz, 0, -0.8 * sz, 0);
    sh.addColorStop(0, 'rgba(255,255,255,.08)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(4,18,28,.32)');
    g.fillStyle = sh; g.fillRect(-sz, -h, 2.2 * sz, 2 * h);
    const rim = g.createLinearGradient(0, -h, 0, -0.5 * h);
    rim.addColorStop(0, 'rgba(225,246,255,.38)'); rim.addColorStop(1, 'rgba(225,246,255,0)');
    g.fillStyle = rim; g.fillRect(-sz, -h, 2.2 * sz, 0.5 * h);
    g.restore();
    g.strokeStyle = 'rgba(2,10,18,.5)'; g.lineWidth = lw * 0.7; fishBody(g, sz, L.nose, h); g.stroke();

    // gill cover with a pale edge, mouth, eye
    g.strokeStyle = 'rgba(3,16,26,.38)'; g.lineWidth = lw * 0.8;
    g.beginPath(); g.arc(0.42 * sz, 0, h * 0.62, -1.0, 1.0); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = lw * 0.45;
    g.beginPath(); g.arc(0.39 * sz, 0, h * 0.62, -0.9, 0.9); g.stroke();
    g.strokeStyle = 'rgba(3,16,26,.55)'; g.lineWidth = lw * 0.7;
    g.beginPath(); g.moveTo(0.99 * L.nose * sz, 0.03 * h); g.quadraticCurveTo(0.88 * L.nose * sz, 0.15 * h, 0.80 * L.nose * sz, 0.22 * h); g.stroke();
    eye(g, 0.56 * L.nose * sz, -0.22 * h, L.eye * sz, L.iris);
    if (lion) { // little tentacles over the eye
      g.strokeStyle = L.fin; g.lineWidth = lw * 0.6;
      g.beginPath(); g.moveTo(0.58 * sz, -0.42 * h); g.quadraticCurveTo(0.66 * sz, -0.75 * h, 0.6 * sz, -0.95 * h); g.stroke();
    }

    // pectoral fin, in front of the body. The lionfish's is a huge banded fan.
    if (lion) {
      g.save(); g.translate(0.28 * sz, 0.3 * h); g.rotate(s * 0.12);
      const n = 9, a0 = 1.85, a1 = 3.0, R = 1.05 * sz;
      g.fillStyle = rgbaH(L.fin, 0.35);
      g.beginPath(); g.moveTo(0, 0);
      for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / (n - 1); g.lineTo(Math.cos(a) * R * (0.85 + 0.15 * (i % 2)), Math.sin(a) * R * (0.85 + 0.15 * (i % 2))); }
      g.closePath(); g.fill();
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * i / (n - 1), r = R * (0.85 + 0.15 * (i % 2));
        g.lineWidth = lw * 0.8; g.strokeStyle = L.fin;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke();
        g.setLineDash([0.12 * sz, 0.12 * sz]); g.strokeStyle = L.bands;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); g.setLineDash([]);
      }
      g.lineCap = 'butt'; g.restore();
    } else {
      g.save(); g.translate(0.30 * sz, 0.26 * h); g.rotate(0.42 + s * 0.2);
      const pec = () => { g.beginPath(); g.ellipse(-0.18 * sz, 0, 0.30 * sz, 0.085 * sz, 0, 0, TAU); };
      fin(g, pec, rgbaH(L.fin, 0.38), rgbaH(L.back, 0.22), [[0, 0, -0.5 * sz, -0.06 * sz], [0, 0, -0.5 * sz, 0], [0, 0, -0.5 * sz, 0.06 * sz]], lw * 0.4);
      g.restore();
    }
  },

  // side view: a blacktip reef shark. Countershaded torpedo, black-tipped fins, crescent tail that foreshortens.
  shark(g, sp, sz, ph) {
    const L = LOOK.shark, s = Math.sin(ph * TAU), c = Math.cos(ph * TAU), lw = Math.max(0.4, 0.04 * sz);
    const tipped = (y0, y1, base) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, base); gr.addColorStop(0.62, base); gr.addColorStop(1, L.tip); return gr; };
    // tail
    g.save(); g.translate(-0.78 * sz, 0.01 * sz); g.scale(0.55 + 0.45 * Math.abs(c), 1); g.rotate(s * 0.06);
    g.fillStyle = tipped(0, -0.7 * sz, mixHex(L.back, DARK, 0.15));
    g.beginPath();
    g.moveTo(0.04 * sz, 0);
    g.quadraticCurveTo(-0.26 * sz, -0.26 * sz, -0.52 * sz, -0.72 * sz);
    g.quadraticCurveTo(-0.40 * sz, -0.24 * sz, -0.30 * sz, -0.02 * sz);
    g.quadraticCurveTo(-0.28 * sz, 0.16 * sz, -0.46 * sz, 0.50 * sz);
    g.quadraticCurveTo(-0.22 * sz, 0.16 * sz, 0.04 * sz, 0);
    g.closePath(); g.fill();
    g.restore();
    // dorsal fin with a black tip
    g.fillStyle = tipped(-0.2 * sz, -0.64 * sz, mixHex(L.back, DARK, 0.1));
    g.beginPath();
    g.moveTo(0.30 * sz, -0.20 * sz);
    g.quadraticCurveTo(0.10 * sz, -0.50 * sz, -0.06 * sz, -0.64 * sz);
    g.quadraticCurveTo(-0.16 * sz, -0.36 * sz, -0.32 * sz, -0.18 * sz);
    g.closePath(); g.fill();
    // second dorsal + anal fin
    g.fillStyle = mixHex(L.back, DARK, 0.25);
    g.beginPath(); g.moveTo(-0.50 * sz, -0.13 * sz); g.lineTo(-0.57 * sz, -0.32 * sz); g.lineTo(-0.62 * sz, -0.12 * sz); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-0.52 * sz, 0.12 * sz); g.lineTo(-0.60 * sz, 0.28 * sz); g.lineTo(-0.64 * sz, 0.11 * sz); g.closePath(); g.fill();
    // body
    const body = () => {
      g.beginPath();
      g.moveTo(1.02 * sz, -0.01 * sz);
      g.bezierCurveTo(0.80 * sz, -0.13 * sz, 0.52 * sz, -0.26 * sz, 0.18 * sz, -0.28 * sz);
      g.bezierCurveTo(-0.14 * sz, -0.30 * sz, -0.40 * sz, -0.23 * sz, -0.60 * sz, -0.15 * sz);
      g.quadraticCurveTo(-0.72 * sz, -0.10 * sz, -0.80 * sz, -0.03 * sz);
      g.lineTo(-0.80 * sz, 0.04 * sz);
      g.quadraticCurveTo(-0.72 * sz, 0.10 * sz, -0.58 * sz, 0.16 * sz);
      g.bezierCurveTo(-0.34 * sz, 0.26 * sz, -0.02 * sz, 0.29 * sz, 0.34 * sz, 0.24 * sz);
      g.bezierCurveTo(0.64 * sz, 0.20 * sz, 0.90 * sz, 0.10 * sz, 1.02 * sz, -0.01 * sz);
      g.closePath();
    };
    const bg = g.createLinearGradient(0, -0.29 * sz, 0, 0.29 * sz);
    bg.addColorStop(0, mixHex(L.back, DARK, 0.2)); bg.addColorStop(0.4, L.flank); bg.addColorStop(0.58, mixHex(L.flank, L.belly, 0.6)); bg.addColorStop(1, L.belly);
    g.fillStyle = bg; body(); g.fill();
    g.save(); body(); g.clip();
    const rim = g.createLinearGradient(0, -0.3 * sz, 0, -0.12 * sz);
    rim.addColorStop(0, 'rgba(225,240,250,.35)'); rim.addColorStop(1, 'rgba(225,240,250,0)');
    g.fillStyle = rim; g.fillRect(-sz, -0.3 * sz, 2.1 * sz, 0.2 * sz);
    const sh = g.createLinearGradient(sz, 0, -0.8 * sz, 0);
    sh.addColorStop(0, 'rgba(255,255,255,.06)'); sh.addColorStop(0.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(4,18,28,.3)');
    g.fillStyle = sh; g.fillRect(-sz, -0.3 * sz, 2.1 * sz, 0.6 * sz);
    g.restore();
    g.strokeStyle = 'rgba(2,10,18,.45)'; g.lineWidth = lw; body(); g.stroke();
    // pectoral fin, swept back under the body, black tip
    g.fillStyle = tipped(0.09 * sz, 0.5 * sz, mixHex(L.back, DARK, 0.05));
    g.beginPath();
    g.moveTo(0.38 * sz, 0.08 * sz);
    g.quadraticCurveTo(0.26 * sz, 0.32 * sz, 0.02 * sz, 0.52 * sz);
    g.quadraticCurveTo(0.10 * sz, 0.26 * sz, 0.14 * sz, 0.12 * sz);
    g.closePath(); g.fill();
    // gill slits, mouth, eye
    g.strokeStyle = 'rgba(6,20,32,.45)'; g.lineWidth = lw;
    for (let i = 0; i < 4; i++) { const x = (0.52 + i * 0.06) * sz; g.beginPath(); g.moveTo(x, -0.12 * sz); g.quadraticCurveTo(x - 0.02 * sz, 0, x, 0.08 * sz); g.stroke(); }
    g.strokeStyle = 'rgba(6,20,32,.6)';
    g.beginPath(); g.moveTo(1.00 * sz, 0.03 * sz); g.quadraticCurveTo(0.92 * sz, 0.14 * sz, 0.78 * sz, 0.13 * sz); g.stroke();
    eye(g, 0.78 * sz, -0.07 * sz, 0.065 * sz, L.iris);
  },

  // top view: a green turtle. Shell plates with gold streaks radiating from each centre, scaly flippers that flap.
  turtle(g, sp, sz, ph) {
    const L = LOOK.turtle, f = Math.sin(ph * TAU), lw = Math.max(0.4, 0.04 * sz);
    const skinG = (x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, L.skin); gr.addColorStop(1, mixHex(L.skin, L.skinDark, 0.45)); return gr; };
    for (const s of [-1, 1]) { // front flippers, long and swept back
      g.save(); g.translate(0.36 * sz, s * 0.30 * sz); g.scale(1, s); g.rotate(0.15 + f * 0.35);
      g.fillStyle = skinG(0, -0.4 * sz);
      g.beginPath();
      g.moveTo(-0.06 * sz, -0.02 * sz);
      g.quadraticCurveTo(0.34 * sz, 0.28 * sz, 0.12 * sz, 0.78 * sz);
      g.quadraticCurveTo(0.00 * sz, 0.50 * sz, -0.26 * sz, 0.10 * sz);
      g.closePath(); g.fill();
      g.strokeStyle = rgbaH(L.skinDark, 0.6); g.lineWidth = lw * 0.6; g.stroke();
      g.fillStyle = rgbaH(L.skinDark, 0.45); // scale spots along the leading edge
      for (let i = 1; i < 5; i++) circle(g, 0.08 * sz + i * 0.035 * sz, 0.12 * sz + i * 0.13 * sz, 0.03 * sz);
      g.restore();
    }
    for (const s of [-1, 1]) { // hind flippers
      g.save(); g.translate(-0.76 * sz, s * 0.26 * sz); g.scale(1, s); g.rotate(-0.25 - f * 0.08);
      g.fillStyle = skinG(0, -0.3 * sz);
      g.beginPath();
      g.moveTo(0.06 * sz, 0);
      g.quadraticCurveTo(-0.12 * sz, 0.26 * sz, -0.36 * sz, 0.30 * sz);
      g.quadraticCurveTo(-0.26 * sz, 0.10 * sz, -0.30 * sz, -0.04 * sz);
      g.closePath(); g.fill();
      g.strokeStyle = rgbaH(L.skinDark, 0.5); g.lineWidth = lw * 0.5; g.stroke();
      g.restore();
    }
    // head with plate-like scales
    g.fillStyle = skinG(1.2 * sz, 0.7 * sz);
    g.beginPath(); g.ellipse(0.94 * sz, 0.01 * sz, 0.25 * sz, 0.19 * sz, 0, 0, TAU); g.fill();
    g.strokeStyle = rgbaH(L.skinDark, 0.7); g.lineWidth = lw * 0.6; g.stroke();
    g.strokeStyle = rgbaH(L.skinDark, 0.45); g.lineWidth = lw * 0.45;
    g.beginPath(); g.moveTo(0.82 * sz, -0.08 * sz); g.lineTo(0.96 * sz, -0.02 * sz); g.lineTo(0.82 * sz, 0.1 * sz); g.moveTo(0.96 * sz, -0.02 * sz); g.lineTo(1.08 * sz, 0.01 * sz); g.stroke();
    g.fillStyle = L.skinDark;
    g.beginPath(); g.moveTo(1.15 * sz, -0.05 * sz); g.quadraticCurveTo(1.25 * sz, 0.005 * sz, 1.15 * sz, 0.06 * sz); g.closePath(); g.fill();
    // shell
    const shell = () => { g.beginPath(); g.ellipse(-0.10 * sz, 0.01 * sz, 0.86 * sz, 0.52 * sz, 0, 0, TAU); };
    const sg = g.createRadialGradient(-0.2 * sz, -0.12 * sz, 0.1 * sz, -0.1 * sz, 0, 0.9 * sz);
    sg.addColorStop(0, mixHex(L.scute, L.streak, 0.25)); sg.addColorStop(0.7, L.shell); sg.addColorStop(1, mixHex(L.shell, DARK, 0.4));
    g.fillStyle = sg; shell(); g.fill();
    g.save(); shell(); g.clip();
    const plate = (cx, cy, rx, ry) => { // one scute: lit centre, gold streaks fanning out, dark seam
      const pg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      pg.addColorStop(0, rgbaH(L.streak, 0.55)); pg.addColorStop(0.6, rgbaH(L.scute, 0.35)); pg.addColorStop(1, rgbaH(L.shell, 0));
      g.fillStyle = pg; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = rgbaH(L.streak, 0.35); g.lineWidth = lw * 0.4;
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rx * 0.9, cy + Math.sin(a) * ry * 0.9); g.stroke(); }
      g.strokeStyle = 'rgba(20,14,6,.55)'; g.lineWidth = lw * 0.7; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.stroke();
    };
    for (let i = 0; i < 5; i++) plate((-0.78 + i * 0.32) * sz, 0.01 * sz, 0.17 * sz, 0.14 * sz);              // vertebral row
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) plate((-0.62 + i * 0.34) * sz, s * 0.29 * sz, 0.18 * sz, 0.15 * sz); // costal rows
    g.restore();
    g.strokeStyle = 'rgba(20,14,6,.65)'; g.lineWidth = lw * 1.4; shell(); g.stroke();
    g.strokeStyle = rgbaH(L.streak, 0.3); g.lineWidth = lw * 0.6; // marginal plates as ticks around the rim
    for (let k = 0; k < 26; k++) { const a = k / 26 * TAU, x = -0.10 * sz + Math.cos(a) * 0.86 * sz, y = 0.01 * sz + Math.sin(a) * 0.52 * sz; g.beginPath(); g.moveTo(x, y); g.lineTo(-0.10 * sz + Math.cos(a) * 0.76 * sz, 0.01 * sz + Math.sin(a) * 0.44 * sz); g.stroke(); }
    g.strokeStyle = 'rgba(255,236,190,.25)'; g.lineWidth = lw; // light from above-left
    g.beginPath(); g.ellipse(-0.10 * sz, 0.01 * sz, 0.80 * sz, 0.47 * sz, 0, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
    eye(g, 1.02 * sz, -0.12 * sz, 0.05 * sz, '#6b5a2a');
    eye(g, 1.02 * sz, 0.14 * sz, 0.05 * sz, '#6b5a2a');
  },

  // top view: a reef manta. Near-black back with pale shoulder patches, rolled cephalic fins, a whip tail.
  manta(g, sp, sz, ph) {
    const L = LOOK.manta, fl = Math.sin(ph * TAU), span = 1.0 + 0.09 * fl, sy = sz * span, lw = Math.max(0.4, 0.04 * sz);
    g.strokeStyle = L.back; g.lineWidth = Math.max(0.7, 0.07 * sz); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-0.90 * sz, 0.01 * sz);
    g.quadraticCurveTo(-1.40 * sz, -0.02 * sz + fl * 0.10 * sz, -2.05 * sz, 0.08 * sz + fl * 0.20 * sz);
    g.stroke(); g.lineCap = 'butt';
    const wings = () => {
      g.beginPath();
      g.moveTo(0.58 * sz, 0);
      g.bezierCurveTo(0.40 * sz, -0.46 * sy, 0.04 * sz, -0.86 * sy, -0.34 * sz, -sy);
      g.bezierCurveTo(-0.46 * sz, -1.02 * sy, -0.54 * sz, -0.88 * sy, -0.58 * sz, -0.72 * sy);
      g.quadraticCurveTo(-0.70 * sz, -0.40 * sy, -0.88 * sz, -0.16 * sy);
      g.quadraticCurveTo(-0.94 * sz, -0.08 * sy, -0.98 * sz, -0.04 * sy);
      g.quadraticCurveTo(-0.88 * sz, 0, -0.98 * sz, 0.04 * sy);
      g.quadraticCurveTo(-0.94 * sz, 0.08 * sy, -0.88 * sz, 0.16 * sy);
      g.quadraticCurveTo(-0.70 * sz, 0.40 * sy, -0.58 * sz, 0.72 * sy);
      g.bezierCurveTo(-0.54 * sz, 0.88 * sy, -0.46 * sz, 1.02 * sy, -0.34 * sz, sy);
      g.bezierCurveTo(0.04 * sz, 0.86 * sy, 0.40 * sz, 0.46 * sy, 0.58 * sz, 0);
      g.closePath();
    };
    const bg = g.createRadialGradient(0.1 * sz, 0, 0.05 * sz, 0, 0, sy);
    bg.addColorStop(0, L.mid); bg.addColorStop(0.55, L.back); bg.addColorStop(1, mixHex(L.back, DARK, 0.4));
    g.fillStyle = bg; wings(); g.fill();
    g.save(); wings(); g.clip();
    for (const s of [-1, 1]) { // shoulder patches, fading toward the wingtip
      const pg = g.createLinearGradient(0.2 * sz, 0, -0.2 * sz, s * 0.7 * sy);
      pg.addColorStop(0, rgbaH(L.patch, 0.55)); pg.addColorStop(0.7, rgbaH(L.patch, 0.08)); pg.addColorStop(1, rgbaH(L.patch, 0));
      g.fillStyle = pg;
      g.beginPath(); g.moveTo(0.34 * sz, s * 0.10 * sy); g.quadraticCurveTo(0.10 * sz, s * 0.30 * sy, -0.18 * sz, s * 0.68 * sy);
      g.quadraticCurveTo(0.02 * sz, s * 0.28 * sy, 0.16 * sz, s * 0.08 * sy); g.closePath(); g.fill();
    }
    const rim = g.createLinearGradient(0, -sy, 0, sy); // light catches the leading edges
    rim.addColorStop(0, rgbaH(sp.color, 0.35)); rim.addColorStop(0.3, 'rgba(0,0,0,0)'); rim.addColorStop(0.7, 'rgba(0,0,0,0)'); rim.addColorStop(1, rgbaH(sp.color, 0.25));
    g.fillStyle = rim; g.fillRect(-sz, -sy, 2 * sz, 2 * sy);
    g.restore();
    g.strokeStyle = rgbaH(sp.color, 0.4); g.lineWidth = lw * 0.8; wings(); g.stroke();
    // spine ridge
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = lw * 1.4;
    g.beginPath(); g.moveTo(0.4 * sz, 0); g.lineTo(-0.8 * sz, 0); g.stroke();
    // cephalic fins and the pale mouth between them
    g.fillStyle = L.back;
    for (const s2 of [-1, 1]) {
      g.beginPath();
      g.moveTo(0.46 * sz, s2 * 0.04 * sz);
      g.quadraticCurveTo(0.66 * sz, s2 * 0.05 * sz, 0.80 * sz, s2 * 0.14 * sz);
      g.quadraticCurveTo(0.62 * sz, s2 * 0.15 * sz, 0.46 * sz, s2 * 0.11 * sz);
      g.closePath(); g.fill();
    }
    g.strokeStyle = rgbaH(L.patch, 0.7); g.lineWidth = lw * 0.8;
    g.beginPath(); g.moveTo(0.58 * sz, -0.07 * sz); g.lineTo(0.58 * sz, 0.07 * sz); g.stroke();
    eye(g, 0.44 * sz, -0.16 * sz, 0.05 * sz, '#3a4458');
    eye(g, 0.44 * sz, 0.18 * sz, 0.05 * sz, '#3a4458');
  },
};

// opts: { ss: pixels per world unit (default 3), tints: depth tint levels to build (default all), only: [species ids] }
function buildSprites(opts) {
  opts = opts || {};
  const ss = opts.ss || 3, nTint = Math.max(1, Math.min(TINT.length, opts.tints || TINT.length));
  // Fail loudly at load instead of silently skipping an animal: every shape needs all three tables, and every
  // species needs bounds for the shape it names.
  const shapes = new Set([...Object.keys(SPRITE_BOUNDS), ...Object.keys(SPRITE_FRAMES), ...Object.keys(SHAPE_DRAW)]);
  for (const shape of shapes) {
    const missing = ['SPRITE_BOUNDS', 'SPRITE_FRAMES', 'SHAPE_DRAW'].filter(t => !({ SPRITE_BOUNDS, SPRITE_FRAMES, SHAPE_DRAW })[t][shape]);
    if (missing.length) throw new Error('sprite "' + shape + '": missing ' + missing.join(', '));
  }
  for (const sp of SPECIES) if (!sp.plant && !SPRITE_BOUNDS[sp.shape]) throw new Error('species "' + sp.id + '": no SPRITE_BOUNDS for shape "' + sp.shape + '"');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  return SPECIES.map(sp => {
    const shape = sp.plant ? null : sp.shape;
    if (!shape || (opts.only && !opts.only.includes(sp.id))) return null;
    const sz = sp.size, b0 = SPRITE_BOUNDS[shape](sz), n = SPRITE_FRAMES[shape], A = (BEND[shape] || 0) * sz;
    const b = { x0: b0.x0, w: b0.w, y0: b0.y0 - A, h: b0.h + 2 * A }; // room for the body wave, kept symmetric
    const W = Math.ceil(b.w * ss), H = Math.ceil(b.h * ss);
    const levels = Array.from({ length: shape === 'jelly' ? 1 : nTint }, () => []);
    const flat = A ? mk(W, H) : null, fg = flat && flat.getContext('2d');
    const head = 0.55 * sz; // the wave starts behind the eye and grows toward the tail
    for (let f = 0; f < n; f++) {
      const ph = f / n, c = mk(W, H), g = c.getContext('2d');
      if (A) {
        fg.setTransform(1, 0, 0, 1, 0, 0); fg.clearRect(0, 0, W, H);
        fg.setTransform(ss, 0, 0, ss, -b.x0 * ss, -b.y0 * ss);
        SHAPE_DRAW[shape](fg, sp, sz, ph);
        for (let x = 0; x < W; x += 2) {
          const wx = b.x0 + x / ss, u = Math.max(0, Math.min(1, (head - wx) / (head - b.x0)));
          g.drawImage(flat, x, 0, 2, H, x, A * u * u * Math.sin(ph * TAU - u * 2.4) * ss, 2, H);
        }
      } else {
        g.setTransform(ss, 0, 0, ss, -b.x0 * ss, -b.y0 * ss);
        SHAPE_DRAW[shape](g, sp, sz, ph);
      }
      levels[0].push(c);
      for (let k = 1; k < levels.length; k++) {
        const t = mk(W, H), tg = t.getContext('2d');
        tg.drawImage(c, 0, 0);
        tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = rgbaH(DEEP_TINT, TINT[k]); tg.fillRect(0, 0, W, H);
        levels[k].push(t);
      }
    }
    return { frames: levels[0], tints: levels, x0: b.x0, y0: b.y0, w: b.w, h: b.h, beat: BEAT_HZ[sp.id] || 1.2 };
  });
}
const SPRITES = buildSprites();
