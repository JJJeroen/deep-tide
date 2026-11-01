// ---------- boats: side views of the stern trawler, the container ship and the boats on the horizon ----------
// Every boat is drawn facing right (+x = bow) with its origin on the waterline at mid-hull, in world px.
// n = night (0..1): paint darkens, windows and navigation lights come on. Render only.

const WARP_FROM = { x: -82, y: -41 }; // the block at the top of the stern gantry the warps run from

const nightCol = (c, n, k = 0.78) => mixHex(c, '#0a1018', n * k);
// y on a quadratic curve at a given x (x is monotonic along every curve used here), by bisection
function quadY(x, x0, y0, cx, cy, x1, y1) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2, xm = (1 - m) * (1 - m) * x0 + 2 * (1 - m) * m * cx + m * m * x1; if ((xm < x) === (x1 > x0)) lo = m; else hi = m; }
  const m = (lo + hi) / 2; return (1 - m) * (1 - m) * y0 + 2 * (1 - m) * m * cy + m * m * y1;
}
function lightDot(g, x, y, col, r, n) { // a navigation or deck light at night: a glow and a bright core
  if (n < 0.15) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= n; // multiplies the boat's own fade
  g.drawImage(glow(col), x - r, y - r, 2 * r, 2 * r);
  g.fillStyle = '#ffffff'; g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  g.restore();
}
function foam(g, t, x0, len, n, dir) { // bow wave and wake: flickering white froth along the waterline
  g.save(); g.fillStyle = `rgba(235,245,248,${0.75 - 0.45 * n})`;
  const base = g.globalAlpha;
  for (let i = 0; i < 18; i++) {
    const f = i / 18, x = x0 + dir * f * len, a = (1 - f) * (0.5 + 0.5 * Math.sin(t * 7 + i * 1.9));
    g.globalAlpha = base * a; g.beginPath(); g.ellipse(x, 0.4 + Math.sin(i * 2.3) * 0.8, 3 + f * 5, 1.2, 0, 0, TAU); g.fill();
  }
  g.restore();
}

// ---- stern trawler, above the waterline
const TR_SHEER = [-88, -13, -20, -10, 50, -14]; // transom top -> control -> forecastle break
function drawTrawlerTop(g, t, n, moving) {
  const C = (c, k) => nightCol(c, n, k), sy = x => quadY(x, ...TR_SHEER);
  // exhaust drifting aft from the funnel
  for (let i = 0; i < 6; i++) {
    const k = (t * 0.45 + i / 6) % 1;
    g.fillStyle = `rgba(72,76,80,${(0.26 * (1 - k) * (1 - 0.6 * n)).toFixed(3)})`;
    g.beginPath(); g.arc(4 - k * 50, -38 - k * 16, 2.5 + k * 7, 0, TAU); g.fill();
  }
  // stern gantry: an orange A-frame leaning aft, with the block the warps run through
  g.strokeStyle = C('#d6952c'); g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-86, -12); g.lineTo(-85, -45); g.lineTo(-77, -45); g.lineTo(-66, -11); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.moveTo(-85.5, -30); g.lineTo(-70.5, -24); g.stroke(); // brace
  g.fillStyle = C('#2b2f33'); g.fillRect(-84, -44, 4, 4);
  // net drum on the working deck: the trawl wound on it, green mesh with an orange float line
  g.fillStyle = C('#2b2f33'); g.fillRect(-49, -27, 2.4, 15); g.fillRect(-31, -27, 2.4, 15);
  g.fillStyle = C('#3c7a58'); g.fillRect(-46.6, -25, 15.6, 11);
  g.strokeStyle = C('#245040'); g.lineWidth = 0.7; g.beginPath();
  for (let x = -46; x < -31; x += 2.4) { g.moveTo(x, -25); g.lineTo(x + 3, -14); }
  g.stroke();
  g.strokeStyle = C('#e07a2a'); g.lineWidth = 1.1; g.beginPath(); g.moveTo(-46.6, -21); g.lineTo(-31, -19.5); g.stroke();
  // deckhouse and bridge (white), funnel behind them
  g.fillStyle = C('#22394c'); g.beginPath(); g.moveTo(-3, -12); g.lineTo(8, -12); g.lineTo(10, -37); g.lineTo(-1, -37); g.closePath(); g.fill();
  g.fillStyle = C('#d9822b'); g.beginPath(); g.moveTo(-1.6, -31); g.lineTo(9.5, -31); g.lineTo(9.8, -27.5); g.lineTo(-1.9, -27.5); g.closePath(); g.fill();
  g.fillStyle = C('#15191c'); g.fillRect(-1.2, -38.5, 11.4, 2.4);
  g.fillStyle = C('#e8e5dc'); g.fillRect(6, -28, 46, 16);                       // deckhouse
  g.fillStyle = C('#c9c6bd'); g.fillRect(6, -15, 46, 3);                        // its shaded foot
  g.beginPath(); g.moveTo(10, -28); g.lineTo(50, -28); g.lineTo(55.5, -40); g.lineTo(13, -40); g.closePath(); // bridge, raked front
  g.fillStyle = C('#efece4'); g.fill();
  const win = n > 0.2 ? mixHex('#1d2a33', '#ffd88e', n) : '#1d2a33';
  g.fillStyle = win; g.beginPath(); g.moveTo(15, -37.4); g.lineTo(54.3, -37.4); g.lineTo(52.4, -33); g.lineTo(14.5, -33); g.closePath(); g.fill();
  g.strokeStyle = C('#e8e5dc'); g.lineWidth = 0.8; g.beginPath();
  for (let x = 20; x < 53; x += 5) { g.moveTo(x + 0.6, -37.4); g.lineTo(x, -33); }
  g.stroke();
  g.fillStyle = n > 0.2 ? mixHex('#26343e', '#ffd88e', n) : '#26343e';                          // portholes
  for (const x of [13, 20, 27]) { g.beginPath(); g.arc(x, -21, 1.5, 0, TAU); g.fill(); }
  g.fillStyle = C('#3a464f'); g.fillRect(40, -25, 4.5, 11);                      // door
  g.fillStyle = C('#2a3036'); g.fillRect(11, -41.6, 47, 1.8);                    // roof with overhang
  g.fillStyle = C('#f2f0ea'); for (const x of [17, 23]) { g.beginPath(); g.ellipse(x, -43.4, 2.6, 1.6, 0, 0, TAU); g.fill(); } // life rafts
  g.fillStyle = C('#e8742a'); for (const x of [44, 48.5]) { g.beginPath(); g.arc(x, -43.4, 1.7, 0, TAU); g.fill(); } // buoys
  // mast: crosstree, a turning radar, antennas
  g.strokeStyle = C('#c9ced2'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(34, -41.6); g.lineTo(34, -63); g.moveTo(28, -56); g.lineTo(40, -56); g.stroke();
  g.lineWidth = 0.7; g.beginPath(); g.moveTo(39, -56); g.lineTo(41, -63); g.moveTo(29, -56); g.lineTo(27.5, -62); g.stroke();
  const rw = 17 * Math.abs(Math.cos(t * 2.2));
  g.fillStyle = C('#2c3238'); g.fillRect(32.6, -49, 2.8, 2.6);
  g.fillStyle = C('#f0f0ec'); g.fillRect(34 - rw / 2, -50.6, Math.max(1, rw), 1.8);
  // hull: raised forecastle at the bow, sheer falling to a low working deck aft
  g.beginPath(); g.moveTo(-86, 0); g.lineTo(-88, -13); g.quadraticCurveTo(-20, -10, 50, -14);
  g.lineTo(51, -21); g.quadraticCurveTo(76, -22, 95, -26); g.quadraticCurveTo(90, -9, 80, 0); g.closePath();
  const hg = g.createLinearGradient(0, -26, 0, 0); hg.addColorStop(0, C('#2d4a60')); hg.addColorStop(1, C('#15232f'));
  g.fillStyle = hg; g.fill();
  g.save(); g.clip();
  g.fillStyle = C('#a3382a'); g.fillRect(-92, -2.8, 192, 3);                    // red boot-top on the waterline
  g.strokeStyle = C('#e9e6dc'); g.lineWidth = 1.2; g.beginPath();                 // white sheer stripe
  g.moveTo(-88, -10); g.quadraticCurveTo(-20, -7, 50, -11); g.lineTo(51, -18); g.quadraticCurveTo(76, -19, 96, -23); g.stroke();
  g.strokeStyle = 'rgba(120,64,36,.4)'; g.lineWidth = 1;                          // rust under the scuppers
  for (const x of [-62, -38, -14, 12, 38]) { const y = sy(x) + 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.6, y + 5 + (x & 3)); g.stroke(); }
  g.fillStyle = C('#e9e6dc'); g.font = '600 5.5px ui-sans-serif, system-ui, sans-serif'; g.fillText('DT 37', 60, -12); // registration
  g.restore();
  g.fillStyle = C('#121a20'); g.beginPath(); g.ellipse(86, -19, 2.2, 1.4, 0, 0, TAU); g.fill(); // hawse pipe
  // bulwark rail along the working deck
  g.strokeStyle = C('#b9c0c4', 0.85); g.lineWidth = 0.8; g.beginPath();
  for (let x = -84; x <= 4; x += 7) { const y = sy(x); g.moveTo(x, y); g.lineTo(x, y - 5); }
  g.moveTo(-84, sy(-84) - 5); for (let x = -84; x <= 4; x += 4) g.lineTo(x, sy(x) - 5);
  g.moveTo(52, -21); g.lineTo(52, -26); g.lineTo(92, -30); g.stroke();             // forecastle rail
  if (moving) { foam(g, t, 88, 16, n, 1); foam(g, t, -88, 70, n, -1); }
  // lights: masthead, starboard (green), stern, deck floods over the gantry and the working deck
  lightDot(g, 34, -63, '#fff6dc', 12, n); lightDot(g, 53, -31, '#7dff9a', 9, n); lightDot(g, -89, -15, '#fff6dc', 8, n);
  if (n > 0.15) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.55 * n; g.drawImage(glow('#ffe2a8'), -100, -60, 80, 70); g.drawImage(glow('#ffe2a8'), -60, -48, 70, 50); g.restore(); }
  g.lineCap = 'butt';
}

// ---- stern trawler, below the waterline: red antifouling through the water, keel, rudder, a turning propeller
function drawTrawlerBelow(g, t, n) {
  // seen through the water: the red is mostly gone at this depth, and the hull fades toward the keel
  const hb = g.createLinearGradient(0, 0, 0, 16);
  hb.addColorStop(0, mixHex('#6e3028', '#08202c', 0.5 + 0.3 * n)); hb.addColorStop(1, mixHex('#3a2a2c', '#06182a', 0.6 + 0.3 * n));
  g.fillStyle = hb;
  g.beginPath(); g.moveTo(-86, 0); g.lineTo(80, 0); g.quadraticCurveTo(87, 2, 89, 7);   // bulbous bow
  g.quadraticCurveTo(89, 12, 80, 12); g.lineTo(72, 11.5); g.quadraticCurveTo(30, 16, -50, 16);
  g.quadraticCurveTo(-70, 15, -80, 6); g.lineTo(-86, 3); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(160,210,220,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-70, 12); g.quadraticCurveTo(10, 16.5, 70, 11); g.stroke();
  g.fillStyle = mixHex('#2e2224', '#06141c', 0.45 + 0.35 * n);
  g.beginPath(); g.moveTo(-86, 2); g.lineTo(-83, 2); g.lineTo(-83.5, 15); g.lineTo(-87.5, 14); g.closePath(); g.fill(); // rudder under the stern
  g.fillRect(-80, 10.2, 8, 1.6);                                                        // shaft
  for (let k = 0; k < 3; k++) {                                                         // three blades, foreshortened as they turn
    const s = Math.sin(t * 16 + k * 2.094);
    g.beginPath(); g.ellipse(-79.5, 11 + s * 3.4, 1.4, Math.abs(s) * 3.4 + 0.5, 0, 0, TAU); g.fill();
  }
}

// ---- container ship (seen at a distance, so everything is mixed toward the haze)
const BOX_COLS = ['#b5523b', '#3f6f8f', '#c99a3a', '#5b7f4a', '#8a4a5e', '#d4d0c6', '#2f5d7c', '#a0412f'];
const BAYS = (() => { const r = seeded(23); return Array.from({ length: 10 }, (_, i) => Array.from({ length: 2 + ((r() * 3) | 0) }, () => BOX_COLS[(r() * BOX_COLS.length) | 0])); })();
function drawContainerShip(g, t, n, haze, moving) {
  const C = (c, k) => mixHex(nightCol(c, n, k), haze, 0.22);
  if (moving) foam(g, t, -96, 80, n, -1);
  // funnel aft of the accommodation
  g.fillStyle = C('#1f4e7a'); g.beginPath(); g.moveTo(-99, -14); g.lineTo(-87, -14); g.lineTo(-88, -60); g.lineTo(-98, -60); g.closePath(); g.fill();
  g.fillStyle = C('#e9e6dc'); g.fillRect(-98.4, -55, 10.6, 3);
  g.fillStyle = C('#15191c'); g.fillRect(-98.5, -61.5, 10.9, 2.5);
  // accommodation block with rows of windows, bridge deck with wings on top
  g.fillStyle = C('#e8e5dc'); g.fillRect(-88, -46, 26, 33);
  g.fillStyle = C('#cfccc2'); g.fillRect(-66, -46, 4, 33);
  const lit = n > 0.2 ? mixHex('#2a3640', '#ffd88e', n) : C('#2a3640');
  g.fillStyle = lit;
  for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) g.fillRect(-86 + i * 3.8, -42 + row * 7, 2.2, 2.2);
  g.fillStyle = C('#efece4'); g.fillRect(-93, -52, 36, 6);
  g.fillStyle = n > 0.2 ? mixHex('#1d2a33', '#ffd88e', n) : C('#1d2a33'); g.fillRect(-92, -50.6, 34, 2.4);
  g.fillStyle = C('#2a3036'); g.fillRect(-94, -53.2, 38, 1.4);
  g.strokeStyle = C('#c9ced2'); g.lineWidth = 1.1; g.beginPath(); g.moveTo(-75, -53); g.lineTo(-75, -63); g.moveTo(-80, -58); g.lineTo(-70, -58); g.stroke();
  // hull: long and low, bow rising to the right, transom stern
  g.beginPath(); g.moveTo(-94, 0); g.lineTo(-97, -15); g.quadraticCurveTo(10, -12, 92, -15); g.lineTo(105, -21); g.quadraticCurveTo(100, -8, 90, 0); g.closePath();
  const hg = g.createLinearGradient(0, -21, 0, 0); hg.addColorStop(0, C('#2b3e55')); hg.addColorStop(1, C('#18263a')); g.fillStyle = hg; g.fill();
  g.save(); g.clip();
  g.fillStyle = C('#a3382a'); g.fillRect(-100, -3, 210, 3);
  g.strokeStyle = C('#d8d4c8'); g.lineWidth = 1; g.beginPath(); g.moveTo(-97, -12); g.quadraticCurveTo(10, -9, 92, -12); g.lineTo(105, -18); g.stroke();
  g.strokeStyle = 'rgba(120,64,36,.35)'; g.lineWidth = 1;
  for (let x = -80; x < 90; x += 17) { g.beginPath(); g.moveTo(x, -11); g.lineTo(x + 0.5, -5); g.stroke(); }
  g.restore();
  // containers: ten bays, each a stack of boxes with a shaded end, ribs and a lit top edge
  g.fillStyle = C('#5a6168'); g.fillRect(-56, -16.5, 146, 2.5);                         // hatch covers
  for (let b = 0; b < BAYS.length; b++) {
    const x = -55 + b * 14.4;
    BAYS[b].forEach((col, j) => {
      const y = -22 - j * 5.6;
      g.fillStyle = C(col); g.fillRect(x, y, 13.6, 5.4);
      g.fillStyle = C(mixHex(col, '#000000', 0.3)); g.fillRect(x + 11.6, y, 2, 5.4);
      g.fillStyle = C(mixHex(col, '#ffffff', 0.25)); g.fillRect(x, y, 13.6, 0.7);
      g.fillStyle = C(mixHex(col, '#000000', 0.18)); for (let k = 2.5; k < 11; k += 2.6) g.fillRect(x + k, y + 1, 0.6, 4);
    });
    if (b) { g.fillStyle = C('#8a9198'); g.fillRect(x - 0.9, -27, 0.8, 11); }               // lashing bridge
  }
  // foremast with a light, and the bow light
  g.strokeStyle = C('#c9ced2'); g.lineWidth = 1; g.beginPath(); g.moveTo(96, -19); g.lineTo(96, -36); g.stroke();
  lightDot(g, 96, -37, '#fff6dc', 10, n); lightDot(g, -75, -63, '#fff6dc', 10, n); lightDot(g, -58, -50, '#7dff9a', 7, n);
  if (n > 0.15) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.35 * n; g.drawImage(glow('#ffe2a8'), -40, -50, 110, 50); g.restore(); }
}

// ---- small boats far out on the horizon: a hull, a wheelhouse, a mast and outrigger booms, all in the haze colour
function drawFarBoat(g, x, y, s, col, dir) {
  g.save(); g.translate(x, y); g.scale(s * dir, s);
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.4 / s;
  g.beginPath(); g.moveTo(-14, 0); g.lineTo(-15, -4); g.quadraticCurveTo(0, -3, 14, -6); g.quadraticCurveTo(12, -2, 10, 0); g.closePath(); g.fill();
  g.fillRect(2, -10, 8, 6); g.fillRect(-8, -7, 3, 3);
  g.beginPath(); g.moveTo(5, -10); g.lineTo(5, -20); g.moveTo(5, -18); g.lineTo(-9, -12); g.moveTo(5, -18); g.lineTo(16, -11); g.stroke();
  g.restore();
}
