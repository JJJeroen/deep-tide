// Deep Tide sprite atlases: every animal pre-rendered into animation frames. Depends only on SPECIES (sim.js).
// ---------- sprite atlases ----------
// Every animal is pre-rendered once at 4x into a handful of animation frames and then drawn as a single image.
// Drawing them procedurally every frame was cheap but flat: one solid colour, no fins, no shading, no belly, no outline.
const SS = 4, TAU = Math.PI * 2;
const DARK = '#04121c', PALE = '#eaf7ff';

function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixHex(a, b, k) {
  const A = hexRGB(a), B = hexRGB(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * k), g = Math.round(A[1] + (B[1] - A[1]) * k), bl = Math.round(A[2] + (B[2] - A[2]) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

// how far the drawing spills from the body centre, in body-size units.
// Side-view animals keep y symmetric so the belly-down flip stays centred; the upright jelly does not need that.
const SPRITE_BOUNDS = {
  fish:    sz => ({ x0: -1.78 * sz, w: 2.95 * sz, y0: -0.98 * sz, h: 1.96 * sz }),
  shark:   sz => ({ x0: -1.72 * sz, w: 2.95 * sz, y0: -0.92 * sz, h: 1.84 * sz }),
  turtle:  sz => ({ x0: -1.18 * sz, w: 2.60 * sz, y0: -0.92 * sz, h: 1.84 * sz }),
  manta:   sz => ({ x0: -2.10 * sz, w: 3.30 * sz, y0: -1.22 * sz, h: 2.44 * sz }),
  jelly:   sz => ({ x0: -1.30 * sz, w: 2.60 * sz, y0: -1.40 * sz, h: 3.90 * sz }),
};
const SPRITE_FRAMES = { fish: 8, shark: 8, turtle: 8, manta: 10, jelly: 8 };
const BEAT_HZ = { grazer: 1.5, hunter: 1.15, invader: 1.3, shark: 0.7, turtle: 0.6, manta: 0.55, jelly: 0.35 };

function fishBody(g, sz, nose, h) {
  g.beginPath();
  g.moveTo(nose * sz, 0);
  g.bezierCurveTo(nose * 0.62 * sz, -h, 0.05 * sz, -h, -0.55 * sz, -0.58 * h);
  g.quadraticCurveTo(-0.76 * sz, -0.30 * h, -0.78 * sz, 0);
  g.quadraticCurveTo(-0.76 * sz, 0.30 * h, -0.55 * sz, 0.58 * h);
  g.bezierCurveTo(0.05 * sz, h, nose * 0.62 * sz, h, nose * sz, 0);
  g.closePath();
}
function eye(g, x, y, r) {
  // a dark eye with a thin pale rim and a glint: a big white sclera made them look like cartoons
  g.fillStyle = 'rgba(226,245,252,.8)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = '#07131d'; g.beginPath(); g.arc(x, y, r * 0.8, 0, TAU); g.fill();
  if (r > 0.9) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, TAU); g.fill(); }
}

const FISH_STYLE = {
  grazer:  { h: 0.47, nose: 1.00, eye: 0.16, dorsal: 1.5, stripe: true },
  hunter:  { h: 0.31, nose: 1.08, eye: 0.12, dorsal: 2.0, stripe: false },
  invader: { h: 0.42, nose: 1.02, eye: 0.12, dorsal: 1.9, stripe: false },
};

const SHAPE_DRAW = {
  // upright bell with pulsing dome, oral arms and trailing tentacles (drawn without rotation)
  jelly(g, sp, sz, ph) {
    const r = sz * (1 + Math.sin(ph * TAU) * 0.12), col = sp.color;
    g.lineCap = 'round';
    // trailing tentacles
    for (let i = -2; i <= 2; i++) {
      const x = i * r * 0.40, wob = Math.sin(ph * TAU + i * 1.3) * r * 0.38;
      g.strokeStyle = 'rgba(214,186,255,.42)'; g.lineWidth = Math.max(0.5, r * 0.085);
      g.beginPath(); g.moveTo(x, r * 0.2);
      g.bezierCurveTo(x + wob, r * 0.85, x - wob, r * 1.5, x + wob * 0.55, r * 2.1);
      g.stroke();
    }
    // oral arms
    for (let i = -1; i <= 1; i++) {
      const x = i * r * 0.28, wob = Math.sin(ph * TAU + i) * r * 0.22;
      g.strokeStyle = 'rgba(234,216,255,.5)'; g.lineWidth = Math.max(0.7, r * 0.15);
      g.beginPath(); g.moveTo(x, r * 0.25);
      g.quadraticCurveTo(x + wob, r * 0.85, x + wob * 0.6, r * 1.3);
      g.stroke();
    }
    g.lineCap = 'butt';
    // bell
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
    // glowing rim and a hint of the inner bell
    g.strokeStyle = 'rgba(230,212,255,.55)'; g.lineWidth = Math.max(0.5, r * 0.08);
    g.beginPath(); g.moveTo(-r, r * 0.1); g.quadraticCurveTo(0, r * 0.5, r, r * 0.1); g.stroke();
    g.fillStyle = 'rgba(255,248,255,.18)';
    g.beginPath(); g.ellipse(0, -r * 0.12, r * 0.5, r * 0.3, 0, 0, TAU); g.fill();
  },

  // side view: nose to the right, caudal fin beating with `ph`
  fish(g, sp, sz, ph) {
    const st = FISH_STYLE[sp.id] || FISH_STYLE.grazer, col = sp.color, h = st.h * sz;
    const tailA = Math.sin(ph * TAU) * 0.38;
    // caudal fin (behind the body)
    g.save(); g.translate(-0.72 * sz, 0); g.rotate(tailA);
    const tg = g.createLinearGradient(0, 0, -sz, 0);
    tg.addColorStop(0, mixHex(col, DARK, 0.12)); tg.addColorStop(1, mixHex(col, DARK, 0.42));
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(0.06 * sz, 0);
    g.quadraticCurveTo(-0.34 * sz, -0.10 * sz, -0.78 * sz, -0.60 * sz);
    g.quadraticCurveTo(-0.44 * sz, 0, -0.78 * sz, 0.60 * sz);
    g.quadraticCurveTo(-0.34 * sz, 0.10 * sz, 0.06 * sz, 0);
    g.closePath(); g.fill();
    g.restore();
    // pectoral fin
    g.save(); g.translate(0.34 * sz, 0.20 * h); g.rotate(0.55 + Math.sin(ph * TAU) * 0.2);
    g.fillStyle = mixHex(col, DARK, 0.28); g.globalAlpha = 0.8;
    g.beginPath(); g.ellipse(-0.17 * sz, 0, 0.28 * sz, 0.075 * sz, 0, 0, TAU); g.fill();
    g.restore(); g.globalAlpha = 1;
    // dorsal + anal fin
    g.fillStyle = mixHex(col, DARK, 0.3);
    g.beginPath();
    g.moveTo(0.28 * sz, -0.52 * h);
    g.quadraticCurveTo(0.04 * sz, -st.dorsal * h, -0.30 * sz, -0.66 * h);
    g.quadraticCurveTo(-0.02 * sz, -0.56 * h, 0.28 * sz, -0.52 * h);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(-0.20 * sz, 0.50 * h);
    g.quadraticCurveTo(-0.34 * sz, 0.95 * h, -0.46 * sz, 0.55 * h);
    g.closePath(); g.fill();
    // spines (invader): short, swept back along the body edge
    if (sp.spines) {
      g.strokeStyle = mixHex(col, DARK, 0.2); g.lineWidth = 0.09 * sz; g.lineCap = 'round';
      for (let i = -1; i <= 2; i++) {
        const x = i * 0.19 * sz;
        g.beginPath(); g.moveTo(x, -0.78 * h); g.lineTo(x - 0.15 * sz, -1.22 * h); g.stroke();
      }
      g.lineCap = 'butt';
      // spiny pectoral fan
      g.fillStyle = mixHex(col, DARK, 0.18);
      g.beginPath(); g.moveTo(0.28 * sz, 0.34 * h); g.lineTo(0.04 * sz, 1.02 * h); g.lineTo(-0.10 * sz, 0.38 * h); g.closePath(); g.fill();
    }
    // body
    const bg = g.createLinearGradient(0, -h, 0, h);
    bg.addColorStop(0, mixHex(col, DARK, 0.45));
    bg.addColorStop(0.4, col);
    bg.addColorStop(1, mixHex(col, PALE, 0.45));
    g.fillStyle = bg;
    fishBody(g, sz, st.nose, h); g.fill();
    g.strokeStyle = 'rgba(2,10,18,.35)'; g.lineWidth = 0.9; g.stroke();
    // flank stripe
    if (st.stripe) {
      g.globalAlpha = 0.22; g.strokeStyle = '#ffffff'; g.lineWidth = 0.10 * sz;
      g.beginPath(); g.moveTo(-0.48 * sz, 0.06 * h); g.quadraticCurveTo(0.05 * sz, 0.14 * h, 0.52 * sz, 0.0); g.stroke();
      g.globalAlpha = 1;
    }
    // gill line
    g.strokeStyle = 'rgba(3,16,26,.28)'; g.lineWidth = Math.max(0.45, 0.055 * sz);
    g.beginPath(); g.arc(0.40 * sz, 0, h * 0.55, -0.95, 0.95); g.stroke();
    // mouth
    g.strokeStyle = 'rgba(3,16,26,.5)'; g.lineWidth = Math.max(0.45, 0.05 * sz);
    g.beginPath(); g.moveTo(0.99 * st.nose * sz, 0.02 * h); g.quadraticCurveTo(0.86 * st.nose * sz, 0.13 * h, 0.80 * st.nose * sz, 0.24 * h); g.stroke();
    eye(g, 0.52 * st.nose * sz, -0.24 * h, st.eye * sz);
  },

  // side view: pointed snout, countershaded torpedo, lunate tail, gill slits
  shark(g, sp, sz, ph) {
    const col = sp.color, tailA = Math.sin(ph * TAU) * 0.2;
    const dark = mixHex(col, DARK, 0.55), mid = col, belly = mixHex(col, '#ffffff', 0.72);
    // tail: crescent around the peduncle
    g.save(); g.translate(-0.78 * sz, 0.01 * sz); g.rotate(tailA);
    const tg = g.createLinearGradient(0, 0, -0.6 * sz, 0);
    tg.addColorStop(0, dark); tg.addColorStop(1, mixHex(col, DARK, 0.3));
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(0.04 * sz, 0);
    g.quadraticCurveTo(-0.26 * sz, -0.26 * sz, -0.50 * sz, -0.70 * sz);
    g.quadraticCurveTo(-0.40 * sz, -0.24 * sz, -0.30 * sz, -0.02 * sz);
    g.quadraticCurveTo(-0.28 * sz, 0.16 * sz, -0.46 * sz, 0.52 * sz);
    g.quadraticCurveTo(-0.22 * sz, 0.16 * sz, 0.04 * sz, 0);
    g.closePath(); g.fill();
    g.restore();
    // pectoral fin, swept back under the body
    g.fillStyle = mixHex(col, DARK, 0.30);
    g.beginPath();
    g.moveTo(0.36 * sz, 0.09 * sz);
    g.quadraticCurveTo(0.26 * sz, 0.32 * sz, 0.04 * sz, 0.50 * sz);
    g.quadraticCurveTo(0.10 * sz, 0.26 * sz, 0.16 * sz, 0.10 * sz);
    g.closePath(); g.fill();
    // dorsal fin
    g.fillStyle = mixHex(col, DARK, 0.22);
    g.beginPath();
    g.moveTo(0.30 * sz, -0.20 * sz);
    g.quadraticCurveTo(0.10 * sz, -0.50 * sz, -0.06 * sz, -0.64 * sz);
    g.quadraticCurveTo(-0.16 * sz, -0.36 * sz, -0.32 * sz, -0.18 * sz);
    g.closePath(); g.fill();
    // second dorsal + anal fin
    g.fillStyle = mixHex(col, DARK, 0.35);
    g.beginPath(); g.moveTo(-0.50 * sz, -0.13 * sz); g.lineTo(-0.57 * sz, -0.32 * sz); g.lineTo(-0.62 * sz, -0.12 * sz); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-0.52 * sz, 0.12 * sz); g.lineTo(-0.60 * sz, 0.28 * sz); g.lineTo(-0.64 * sz, 0.11 * sz); g.closePath(); g.fill();
    // body
    const bg = g.createLinearGradient(0, -0.29 * sz, 0, 0.29 * sz);
    bg.addColorStop(0, dark); bg.addColorStop(0.42, mid); bg.addColorStop(1, belly);
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(1.02 * sz, -0.01 * sz);
    g.bezierCurveTo(0.80 * sz, -0.13 * sz, 0.52 * sz, -0.26 * sz, 0.18 * sz, -0.28 * sz);
    g.bezierCurveTo(-0.14 * sz, -0.30 * sz, -0.40 * sz, -0.23 * sz, -0.60 * sz, -0.15 * sz);
    g.quadraticCurveTo(-0.72 * sz, -0.10 * sz, -0.78 * sz, -0.03 * sz);
    g.lineTo(-0.78 * sz, 0.04 * sz);
    g.quadraticCurveTo(-0.72 * sz, 0.10 * sz, -0.58 * sz, 0.16 * sz);
    g.bezierCurveTo(-0.34 * sz, 0.26 * sz, -0.02 * sz, 0.29 * sz, 0.34 * sz, 0.24 * sz);
    g.bezierCurveTo(0.64 * sz, 0.20 * sz, 0.90 * sz, 0.10 * sz, 1.02 * sz, -0.01 * sz);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(2,10,18,.4)'; g.lineWidth = 1; g.stroke();
    // gill slits
    g.strokeStyle = 'rgba(6,20,32,.42)'; g.lineWidth = Math.max(0.45, 0.045 * sz);
    for (let i = 0; i < 3; i++) {
      const x = (0.52 + i * 0.07) * sz;
      g.beginPath(); g.moveTo(x, -0.12 * sz); g.quadraticCurveTo(x - 0.02 * sz, 0.0, x, 0.08 * sz); g.stroke();
    }
    // mouth: a curved line under the snout
    g.strokeStyle = 'rgba(6,20,32,.55)'; g.lineWidth = Math.max(0.5, 0.045 * sz);
    g.beginPath(); g.moveTo(1.00 * sz, 0.03 * sz); g.quadraticCurveTo(0.92 * sz, 0.14 * sz, 0.78 * sz, 0.13 * sz); g.stroke();
    eye(g, 0.76 * sz, -0.07 * sz, 0.07 * sz);
  },

  // top view: green shell with scutes, sand-coloured head and four tapered flippers
  turtle(g, sp, sz, ph) {
    const f = Math.sin(ph * TAU);
    const SH = '#5f7a2e';
    const shellTop = mixHex(SH, DARK, 0.35), shellBot = mixHex(SH, '#eaffb4', 0.3);
    const skin = sp.color, skinDark = mixHex(sp.color, DARK, 0.35);
    g.fillStyle = skin;
    for (const s of [-1, 1]) { // front flippers, swept back and flapping
      g.save(); g.translate(0.34 * sz, s * 0.30 * sz); g.scale(1, s); g.rotate(0.18 + f * 0.2);
      g.beginPath();
      g.moveTo(-0.06 * sz, -0.02 * sz);
      g.quadraticCurveTo(0.30 * sz, 0.26 * sz, 0.16 * sz, 0.66 * sz);
      g.quadraticCurveTo(0.02 * sz, 0.46 * sz, -0.24 * sz, 0.10 * sz);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(2,10,18,.25)'; g.lineWidth = 0.8; g.stroke();
      g.restore();
    }
    for (const s of [-1, 1]) { // hind flippers
      g.save(); g.translate(-0.76 * sz, s * 0.26 * sz); g.scale(1, s); g.rotate(-0.25);
      g.beginPath();
      g.moveTo(0.06 * sz, 0);
      g.quadraticCurveTo(-0.12 * sz, 0.24 * sz, -0.34 * sz, 0.30 * sz);
      g.quadraticCurveTo(-0.26 * sz, 0.10 * sz, -0.30 * sz, -0.04 * sz);
      g.closePath(); g.fill();
      g.restore();
    }
    // head
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(0.94 * sz, 0.01 * sz, 0.24 * sz, 0.19 * sz, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(2,10,18,.3)'; g.lineWidth = 0.8; g.stroke();
    // beak
    g.fillStyle = skinDark;
    g.beginPath(); g.moveTo(1.13 * sz, -0.055 * sz); g.quadraticCurveTo(1.24 * sz, 0.005 * sz, 1.13 * sz, 0.065 * sz); g.closePath(); g.fill();
    // shell
    const sg = g.createLinearGradient(0, -0.52 * sz, 0, 0.52 * sz);
    sg.addColorStop(0, shellTop); sg.addColorStop(0.5, SH); sg.addColorStop(1, shellBot);
    g.fillStyle = sg;
    g.beginPath(); g.ellipse(-0.10 * sz, 0.01 * sz, 0.86 * sz, 0.51 * sz, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(2,10,18,.5)'; g.lineWidth = 1; g.stroke();
    // scutes: a spine line plus ribs that curve with the shell
    g.strokeStyle = 'rgba(235,255,180,.30)'; g.lineWidth = Math.max(0.5, 0.045 * sz);
    g.beginPath(); g.moveTo(-0.90 * sz, 0.01 * sz); g.lineTo(0.70 * sz, 0.01 * sz); g.stroke();
    for (const x of [-0.52, -0.14, 0.24]) {
      const reach = Math.sqrt(Math.max(0, 1 - ((x + 0.10) / 0.86) ** 2)) * 0.44 * sz;
      g.beginPath(); g.moveTo(x * sz, -reach); g.quadraticCurveTo(x * sz + 0.08 * sz, 0, x * sz, reach); g.stroke();
    }
    // rim highlight
    g.strokeStyle = 'rgba(235,255,180,.18)'; g.lineWidth = Math.max(0.6, 0.07 * sz);
    g.beginPath(); g.ellipse(-0.10 * sz, 0.01 * sz, 0.78 * sz, 0.44 * sz, 0, 0, TAU); g.stroke();
    // eyes on either side of the head
    eye(g, 1.01 * sz, -0.12 * sz, 0.05 * sz);
    eye(g, 1.01 * sz, 0.14 * sz, 0.05 * sz);
  },

  // top view: broad triangular wings, long whip tail and cephalic horns; a radial sheen keeps the body readable at 30px
  manta(g, sp, sz, ph) {
    const fl = Math.sin(ph * TAU), span = 1.0 + 0.08 * fl;
    const sy = sz * span, dark = mixHex(sp.color, DARK, 0.3), pale = mixHex(sp.color, '#dce9ff', 0.5);
    // whip tail, rooted at the narrow end of the body
    g.strokeStyle = mixHex(sp.color, DARK, 0.12); g.lineWidth = Math.max(0.7, 0.085 * sz); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-0.90 * sz, 0.01 * sz);
    g.quadraticCurveTo(-1.40 * sz, -0.02 * sz + fl * 0.10 * sz, -2.05 * sz, 0.08 * sz + fl * 0.20 * sz);
    g.stroke(); g.lineCap = 'butt';
    // wings
    const bg = g.createRadialGradient(0.05 * sz, 0, 0.05 * sz, 0, 0, sy);
    bg.addColorStop(0, pale); bg.addColorStop(0.45, sp.color); bg.addColorStop(1, dark);
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(0.58 * sz, 0);
    g.bezierCurveTo(0.40 * sz, -0.46 * sy, 0.04 * sz, -0.86 * sy, -0.34 * sz, -sy);   // leading edge
    g.bezierCurveTo(-0.46 * sz, -1.02 * sy, -0.54 * sz, -0.88 * sy, -0.58 * sz, -0.72 * sy); // wingtip
    g.quadraticCurveTo(-0.70 * sz, -0.40 * sy, -0.88 * sz, -0.16 * sy);                // concave trailing edge
    g.quadraticCurveTo(-0.94 * sz, -0.08 * sy, -0.98 * sz, -0.04 * sy);                // tail root
    g.quadraticCurveTo(-0.88 * sz, 0, -0.98 * sz, 0.04 * sy);                          // notch
    g.quadraticCurveTo(-0.94 * sz, 0.08 * sy, -0.88 * sz, 0.16 * sy);
    g.quadraticCurveTo(-0.70 * sz, 0.40 * sy, -0.58 * sz, 0.72 * sy);
    g.bezierCurveTo(-0.54 * sz, 0.88 * sy, -0.46 * sz, 1.02 * sy, -0.34 * sz, sy);
    g.bezierCurveTo(0.04 * sz, 0.86 * sy, 0.40 * sz, 0.46 * sy, 0.58 * sz, 0);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(175,205,255,.28)'; g.lineWidth = 0.9; g.stroke();
    // cephalic horns either side of the mouth
    g.fillStyle = pale;
    for (const s2 of [-1, 1]) {
      g.beginPath();
      g.moveTo(0.46 * sz, s2 * 0.04 * sz);
      g.quadraticCurveTo(0.66 * sz, s2 * 0.05 * sz, 0.78 * sz, s2 * 0.13 * sz);
      g.quadraticCurveTo(0.62 * sz, s2 * 0.13 * sz, 0.46 * sz, s2 * 0.10 * sz);
      g.closePath(); g.fill();
    }
    // eyes on the head, just behind the horns
    eye(g, 0.42 * sz, -0.16 * sz, 0.05 * sz);
    eye(g, 0.42 * sz, 0.18 * sz, 0.05 * sz);
  },
};

function buildSprites() {
  // Fail loudly at load instead of silently skipping an animal: every shape needs all three tables, and every
  // species needs bounds for the shape it names.
  const shapes = new Set([...Object.keys(SPRITE_BOUNDS), ...Object.keys(SPRITE_FRAMES), ...Object.keys(SHAPE_DRAW)]);
  for (const shape of shapes) {
    const missing = ['SPRITE_BOUNDS', 'SPRITE_FRAMES', 'SHAPE_DRAW'].filter(t => !({ SPRITE_BOUNDS, SPRITE_FRAMES, SHAPE_DRAW })[t][shape]);
    if (missing.length) throw new Error('sprite "' + shape + '": missing ' + missing.join(', '));
  }
  for (const sp of SPECIES) if (!sp.plant && !SPRITE_BOUNDS[sp.shape]) throw new Error('species "' + sp.id + '": no SPRITE_BOUNDS for shape "' + sp.shape + '"');
  return SPECIES.map(sp => {
    const shape = sp.plant ? null : sp.shape;
    if (!shape || !SPRITE_BOUNDS[shape]) return null;
    const sz = sp.size, b = SPRITE_BOUNDS[shape](sz), n = SPRITE_FRAMES[shape];
    const frames = [];
    for (let f = 0; f < n; f++) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(b.w * SS); c.height = Math.ceil(b.h * SS);
      const g = c.getContext('2d');
      g.scale(SS, SS); g.translate(-b.x0, -b.y0);
      SHAPE_DRAW[shape](g, sp, sz, f / n);
      frames.push(c);
    }
    return { frames, x0: b.x0, y0: b.y0, w: b.w, h: b.h, beat: BEAT_HZ[sp.id] || 1.2 };
  });
}
const SPRITES = buildSprites();
