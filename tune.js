// Headless tuning harness for Deep Tide. Runs the sim block of index.html (between SIM-START/SIM-END) in node.
//   node tune.js [seconds=1800] [runs=10] [scenario] [rescue=on|off]
//   scenarios: idle | cold | hot              (untouched ocean at warmth 0.5 / 0.2 / 0.75)
//              pollute | trawl | invade | net (player harm at HARM_T seconds, then hands off; warmth 0.5)
//              anthro (scored run, played by bots: see BOT_LIB below; bot=name|all)
//   rescue=on|off overrides RESCUE_ENABLED from index.html for this run (default: whatever index.html says).
//   env TUNE_PATCH='SPECIES[IDX.shark].meta = 0.5'  JS evaluated in the sim context before reset, for parameter sweeps.
//   env TUNE_JOBS=n  parallel worker threads (default: number of CPUs, max runs).
// Reports per native species: % of time at zero, mean count, births, and rescue/recolonization arrivals,
// plus who ate what. M1 acceptance: every native species at zero < 2% of the time, arrivals < 10% of births.
// Harm scenarios additionally report, per species: runs in which it was wiped out after the harm, its low point,
// and how long it took to climb back to half of its pre-harm mean (runs that never recovered are counted separately).
const fs = require('fs'), vm = require('vm'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const HARM_T = 600;
const HARMS = {
  // drag the pollution brush (r 80, +0.08 per step, as in the UI) along two horizontal sweeps through the sunlit layer, ~10 s
  pollute: { at: HARM_T, dur: 10, perStep: (ctx, t) => {
    const f = t / 10, y = f < 0.5 ? 220 : 420, x = ((f * 2) % 1) * 1600;
    vm.runInContext(`addPollution(${x}, ${y}, 80, 0.08)`, ctx);
  } },
  // five trawls sweeping every depth band, twice
  trawl: { at: HARM_T, once: ctx => vm.runInContext('for (const y of [90, 270, 450, 630, 810]) startTrawl(y);', ctx),
    later: [{ dt: 8, fn: ctx => vm.runInContext('for (const y of [180, 360, 540, 720]) startTrawl(y);', ctx) }] },
  // release invaders twice (3 + 3), as two clicks of the tool
  invade: { at: HARM_T, once: ctx => vm.runInContext('spawnMany(INVADER, 400, 300, 3); spawnMany(INVADER, 1200, 450, 3);', ctx) },
  // hold the net (r 50) over the busiest spots for 8 s: picks the densest non-plankton agent each second
  net: { at: HARM_T, dur: 8, perStep: ctx => vm.runInContext(
    'if (!S._nt || S.t - S._nt > 1) { const a = S.agents.find(a => !a.dead && a.t !== PLANKTON); if (a) { S._nx = a.x; S._ny = a.y; } S._nt = S.t; } if (S._nx !== undefined) netAt(S._nx, S._ny, 50);', ctx) },
};

function loadSim() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  let sim = html.split('// ==SIM-START==')[1].split('// ==SIM-END==')[0];
  // instrument: count births, arrivals, kills (patched into the source text so index.html stays clean)
  const patched = sim
    .replace('S.newborns.push(k);', 'S.newborns.push(k); T.births[a.t]++;')
    .replace('function arrive(i, n) {', 'function arrive(i, n) { T.arrivals[i] += n;')
    .replace('function eat(pred, prey, gain) {', 'function eat(pred, prey, gain) { T.eaten[pred.t][prey.t]++;')
    .replace('if (a.e <= 0 || a.age > a.maxAge) { a.dead = true; return; }', 'if (a.e <= 0 || a.age > a.maxAge) { a.dead = true; if (a.e <= 0) T.starved[a.t]++; else T.old[a.t]++; return; }');
  if ((patched.match(/T\./g) || []).length < 5) throw new Error('instrumentation hooks not found in sim block');
  return patched;
}

function run(seconds, scenario, rescue, patch) {
  const sim = loadSim();
  const T = { births: [], arrivals: [], eaten: [], starved: [], old: [] };
  const ctx = vm.createContext({ Math, T, console });
  vm.runInContext(sim, ctx); // top-level const/let are shared with later scripts in this context, so patches can see them
  const N = vm.runInContext('N', ctx);
  for (let i = 0; i < N; i++) { T.births[i] = 0; T.arrivals[i] = 0; T.starved[i] = 0; T.old[i] = 0; T.eaten[i] = new Array(N).fill(0); }
  if (rescue !== undefined) vm.runInContext(`RESCUE_ENABLED = ${rescue};`, ctx);
  if (patch) vm.runInContext(patch, ctx);
  vm.runInContext(`resetWorld(); S.temp = ${scenario === 'cold' ? 0.2 : scenario === 'hot' ? 0.75 : 0.5};`, ctx);
  const harm = HARMS[scenario];
  const STEP = new vm.Script('step(1/30)');
  const steps = Math.round(seconds * 30), zero = new Array(N).fill(0), sum = new Array(N).fill(0), series = [];
  let samples = 0;
  for (let k = 0; k < steps; k++) {
    const t = k / 30;
    if (harm) {
      if (harm.once && k === harm.at * 30) harm.once(ctx);
      for (const l of harm.later || []) if (k === (harm.at + l.dt) * 30) l.fn(ctx);
      if (harm.perStep && t >= harm.at && t < harm.at + harm.dur) harm.perStep(ctx, t - harm.at);
    }
    STEP.runInContext(ctx);
    if (k % 30 === 0) {
      const c = vm.runInContext('S.counts', ctx).slice();
      samples++; series.push(c);
      for (let i = 0; i < N; i++) { if (c[i] === 0) zero[i]++; sum[i] += c[i]; }
    }
  }
  const names = vm.runInContext('SPECIES.map(s => s.id)', ctx);
  const native = vm.runInContext('NATIVE.map(s => s.i)', ctx);
  const caps = vm.runInContext('SPECIES.map(s => s.cap || 0)', ctx);
  const max = names.map((_, i) => Math.max(...series.map(c => c[i])));
  const atCap = names.map((_, i) => caps[i] ? series.filter(c => c[i] >= caps[i]).length / samples : 0);
  // coefficient of variation over the second half: is the population actually fluctuating?
  const half = series.slice(series.length >> 1);
  const cv = names.map((_, i) => {
    const m = half.reduce((a, c) => a + c[i], 0) / half.length;
    const v = half.reduce((a, c) => a + (c[i] - m) ** 2, 0) / half.length;
    return m ? Math.sqrt(v) / m : 0;
  });
  let harmStats = null;
  if (harm) {
    harmStats = names.map((_, i) => {
      const pre = series.slice(harm.at - 300, harm.at), preMean = pre.reduce((a, c) => a + c[i], 0) / pre.length;
      const post = series.slice(harm.at);
      const low = Math.min(...post.slice(0, 300).map(c => c[i]));
      const wiped = post.some(c => c[i] === 0);
      const lowAt = post.findIndex(c => c[i] === low);
      const rec = post.findIndex((c, j) => j > lowAt && c[i] >= preMean * 0.5);
      return { preMean, low, wiped, rec: low >= preMean * 0.5 ? 0 : rec };
    });
  }
  return { names, native, zero: zero.map(z => z / samples), mean: sum.map(s => s / samples), max, atCap, cv, T, harmStats, end: series[series.length - 1], series: process.env.TUNE_TRACE ? series : null,
    zeroBy: names.map((_, i) => Array.from({ length: Math.ceil(series.length / 300) }, (_, b) => series.slice(b * 300, b * 300 + 300).filter(c => c[i] === 0).length)) };
}

// ---- scenario `anthro`: the scored "Anthropocene run", played by scripted bots. Each bot acts like a player would through
// the UI: a net click = one netAt(r 50) on one step, a trawl = startTrawl(y), dumping = dumpAt() each step while held,
// ballast = releaseInvaders() once a ship is in port.
//   node tune.js 0 10 anthro [bot=steward|light|measured|grazers|careful|greedy|plunder|ballast1|dumper|industry|all]   (seconds are fixed by RUN.DUR)
const BOT_LIB = `
var BOT = { last: {} };
function every(key, s) { if (S.t - (BOT.last[key] ?? -1e9) >= s) { BOT.last[key] = S.t; return true; } return false; }
function protNear(x, y, r) { for (const o of S.agents) if (!o.dead && RUN_PROTECTED[o.t] && Math.hypot(o.x - x, o.y - y) < r) return true; return false; }
// best of a few candidate net spots (centred on random animals of the wanted kinds); avoid = skip spots with protected animals
// (and, if spare is given, spots holding any animal of those kinds)
function spareNear(x, y, r, spare) { for (const o of S.agents) if (!o.dead && spare.includes(o.t) && Math.hypot(o.x - x, o.y - y) < r) return true; return false; }
function netSpot(kinds, avoid, spare) {
  let best = null, bv = 0;
  const mob = S.agents.filter(a => !a.dead && kinds.includes(a.t));
  for (let k = 0; k < 10 && mob.length; k++) {
    const c = mob[(Math.random() * mob.length) | 0];
    if (avoid && protNear(c.x, c.y, 50)) continue;
    if (spare && spareNear(c.x, c.y, 50, spare)) continue;
    let v = 0;
    for (const o of mob) if (Math.hypot(o.x - c.x, o.y - c.y) < 50) v += RUN_VAL[o.t];
    if (v > bv) { bv = v; best = c; }
  }
  return best;
}
function trawlBand() { // the depth whose 180 px band holds the most catch value
  let by = 450, bv = -1;
  for (let y = 90; y <= 810; y += 60) { let v = 0; for (const a of S.agents) if (!a.dead && Math.abs(a.y - y) <= 90) v += RUN_VAL[a.t]; if (v > bv) { bv = v; by = y; } }
  return by;
}
const short = () => S.game.haul < demandAt(S.game.minute);
const BOTS = {
  steward: () => {},
  // a token effort: one selective net click on grazers every 10 s, whatever the quota says
  light: () => { if (every('n', 10)) { const c = netSpot([GRAZER], true); if (c) netAt(c.x, c.y, 50); } },
  // quota-chaser that only takes grazers with the net and leaves predators and protected animals alone
  grazers: () => { if (short() && every('n', 1)) { const c = netSpot([GRAZER], true); if (c) netAt(c.x, c.y, 50); } },
  // what a thoughtful player might do: grazers only, never a net with a hunter or protected animal in it, and stop while the
  // grazer school is below 30 (let it rebuild, take the shortfall)
  measured: () => { if (short() && S.counts[GRAZER] >= 30 && every('n', 1)) { const c = netSpot([GRAZER], true, [HUNTER]); if (c) netAt(c.x, c.y, 50); } },
  // quota-chaser with the net only, takes anything that pays (hunters are worth 4), avoids protected animals
  careful: () => { if (short() && every('n', 1)) { const c = netSpot([GRAZER, HUNTER, JELLY, INVADER], true); if (c) netAt(c.x, c.y, 50); } },
  // quota-chaser that reaches for the trawler: while short, a trawl through the richest band every 8 s plus net clicks, no care for bycatch
  greedy: () => {
    if (!short()) return;
    if (every('t', 8)) startTrawl(trawlBand());
    if (every('n', 1)) { const c = netSpot([GRAZER, HUNTER, JELLY, INVADER], false); if (c) netAt(c.x, c.y, 50); }
  },
  // fishes flat out regardless of the quota: a trawl every 20 s and a net click every second
  plunder: () => {
    if (every('t', 20)) startTrawl(trawlBand());
    if (every('n', 1)) { const c = netSpot([GRAZER, HUNTER, JELLY, INVADER], false); if (c) netAt(c.x, c.y, 50); }
  },
  // the measured player plus one ballast payment in the first minute (+BALLAST_PAY, 3 invaders)
  ballast1: () => { if (S.t < 1) releaseInvaders(800, 300); BOTS.measured(); },
  // the measured player who tops up with waste contracts: dumps while still short in the last 15 s of a minute
  dumper: () => { if (short() && S.t % RUN.MINUTE > 45) dumpAt(800, 200, 1 / 30); else BOTS.measured(); },
  // the measured player taking every industry payment: every ballast ship plus the waste top-ups
  industry: () => { releaseInvaders(800, 300); BOTS.dumper(); },
};
`;
const ANTHRO_BOTS = ['steward', 'light', 'measured', 'grazers', 'careful', 'greedy', 'plunder', 'ballast1', 'dumper', 'industry'];

function runAnthro(bot, rescue, patch) {
  const z = () => new Array(32).fill(0); // instrumentation sink (unused here)
  const ctx = vm.createContext({ Math, console, T: { births: z(), arrivals: z(), starved: z(), old: z(), eaten: Array.from({ length: 32 }, z) } });
  vm.runInContext(loadSim(), ctx);
  vm.runInContext(BOT_LIB, ctx);
  if (rescue !== undefined) vm.runInContext(`RESCUE_ENABLED = ${rescue};`, ctx);
  if (patch) vm.runInContext(patch, ctx);
  vm.runInContext('resetWorld(); startRun();', ctx);
  const STEP = new vm.Script(`BOTS.${bot}(); step(1/30);`);
  for (let k = 0; !vm.runInContext('S.game.over', ctx) && k < 30 * 3600; k++) STEP.runInContext(ctx);
  return vm.runInContext('S.game.result', ctx);
}

if (!isMainThread) {
  parentPort.postMessage(workerData[0] === 'anthro' ? runAnthro(...workerData.slice(1)) : run(...workerData));
} else {
  const pos = process.argv.slice(2).filter(a => !a.includes('='));
  const kv = Object.fromEntries(process.argv.slice(2).filter(a => a.includes('=')).map(a => a.split('=')));
  const seconds = +pos[0] || 1800, runs = +pos[1] || 10, scenario = pos[2] || 'idle';
  const rescue = kv.rescue === undefined ? undefined : kv.rescue === 'on';
  const patch = process.env.TUNE_PATCH || '';
  const jobs = Math.min(runs, +process.env.TUNE_JOBS || os.cpus().length);
  if (scenario === 'anthro') {
    const bots = !kv.bot || kv.bot === 'all' ? ANTHRO_BOTS : kv.bot.split(',');
    if (bots.some(b => !ANTHRO_BOTS.includes(b))) { console.error('unknown bot ' + kv.bot); process.exit(1); }
    const queue = bots.flatMap(b => Array.from({ length: runs }, () => b)), out = {};
    let qi = 0;
    const one = b => new Promise((res, rej) => {
      const w = new Worker(__filename, { workerData: ['anthro', b, rescue, patch] });
      w.once('message', m => { (out[b] = out[b] || []).push(m); res(); }); w.once('error', rej);
    });
    const lane = async () => { while (qi < queue.length) await one(queue[qi++]); };
    Promise.all(Array.from({ length: Math.min(queue.length, +process.env.TUNE_JOBS || os.cpus().length) }, lane))
      .then(() => reportAnthro(out, bots, runs, patch));
    return;
  }
  if (!['idle', 'cold', 'hot', ...Object.keys(HARMS)].includes(scenario)) { console.error('unknown scenario ' + scenario); process.exit(1); }
  const R = [];
  let next = 0;
  const one = () => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: [seconds, scenario, rescue, patch] });
    w.once('message', m => { R.push(m); res(); }); w.once('error', rej);
  });
  const lane = async () => { while (next < runs) { next++; await one(); } };
  Promise.all(Array.from({ length: jobs }, lane)).then(() => report(R, seconds, runs, scenario, rescue, patch));
}

function report(R, seconds, runs, scenario, rescue, patch) {
  const { names, native } = R[0];
  if (process.env.TUNE_TRACE) { // env TUNE_TRACE=20: print the first run's counts every 20 s
    const every = +process.env.TUNE_TRACE;
    console.log('   t  ' + names.map(n => n.slice(0, 6).padStart(7)).join(''));
    R[0].series.forEach((c, t) => { if (t % every === 0) console.log(String(t).padStart(5) + ' ' + c.map(v => String(v).padStart(7)).join('')); });
  }
  const avg = f => R.reduce((a, x) => a + f(x), 0) / R.length;
  console.log(`scenario=${scenario} ${seconds}s x ${runs} runs  rescue=${rescue === undefined ? 'default' : rescue ? 'on' : 'off'}${patch ? '  patch: ' + patch : ''}`);
  console.log('species      zero%   mean    max  @cap%    cv   births  arrivals  arr/birth       starved  old-age');
  let pass = true;
  for (const i of native) {
    if (names[i] === 'plankton') { console.log(`${'plankton'.padEnd(11)} ${(avg(x => x.zero[i]) * 100).toFixed(1).padStart(6)} ${avg(x => x.mean[i]).toFixed(1).padStart(6)}`); continue; }
    const z = avg(x => x.zero[i]) * 100, m = avg(x => x.mean[i]), b = avg(x => x.T.births[i]), a = avg(x => x.T.arrivals[i]);
    const ratio = b ? a / b : Infinity;
    const ok = z < 2 && ratio < 0.1;
    if (!ok) pass = false;
    console.log(`${names[i].padEnd(11)} ${z.toFixed(1).padStart(6)} ${m.toFixed(1).padStart(6)} ${avg(x => x.max[i]).toFixed(0).padStart(6)} ${(avg(x => x.atCap[i]) * 100).toFixed(0).padStart(6)} ${avg(x => x.cv[i]).toFixed(2).padStart(5)} ${b.toFixed(0).padStart(8)} ${a.toFixed(1).padStart(8)} ${ratio.toFixed(2).padStart(9)}  ${ok ? 'ok  ' : 'FAIL'} ${avg(x => x.T.starved[i]).toFixed(0).padStart(7)} ${avg(x => x.T.old[i]).toFixed(0).padStart(8)}`);
  }
  console.log('zero-seconds per 300 s window, summed over runs (where is the time at zero spent?):');
  for (const i of native) {
    const zb = R[0].zeroBy[i].map((_, b) => R.reduce((a, x) => a + x.zeroBy[i][b], 0));
    if (zb.some(v => v > 0)) console.log(`  ${names[i].padEnd(11)} ${zb.join(' ')}`);
  }
  console.log('eaten (mean per run):');
  for (const p of native) for (const q of names.map((_, i) => i)) {
    const e = avg(x => x.T.eaten[p][q]);
    if (e >= 0.5 && names[p] !== 'plankton') console.log(`  ${names[p]} -> ${names[q]}: ${e.toFixed(0)}`);
  }
  if (R[0].harmStats) {
    console.log(`harm at t=${HARM_T}s: species  pre-mean  low(300s)  wiped-runs  recovered-to-50%: mean s (runs never)`);
    for (const i of native) {
      const hs = R.map(x => x.harmStats[i]);
      const recd = hs.filter(h => h.rec >= 0), never = hs.length - recd.length;
      const mrec = recd.length ? recd.reduce((a, h) => a + h.rec, 0) / recd.length : NaN;
      console.log(`  ${names[i].padEnd(11)} ${(hs.reduce((a, h) => a + h.preMean, 0) / hs.length).toFixed(1).padStart(7)} ${(hs.reduce((a, h) => a + h.low, 0) / hs.length).toFixed(1).padStart(9)} ${String(hs.filter(h => h.wiped).length).padStart(8)}/${hs.length}   ${isNaN(mrec) ? '   -' : mrec.toFixed(0).padStart(4)}s (${never} never)`);
    }
    const inv = names.indexOf('invader');
    if (inv >= 0) console.log(`  invaders: mean ${avg(x => x.mean[inv]).toFixed(1)}, still present at the end in ${R.filter(x => x.end[inv] > 0).length}/${R.length} runs`);
  } else console.log(pass ? 'M1 ACCEPTANCE: PASS' : 'M1 ACCEPTANCE: not yet');
}

function reportAnthro(out, bots, runs, patch) {
  console.log(`scenario=anthro x ${runs} runs per bot${patch ? '  patch: ' + patch : ''}`);
  console.log('bot         score  (sd)   min  max | quota%  met/10  delivered  fish  dump ballast | bio%  water%  lost  recov  bycatch  bankrupt');
  for (const b of bots) {
    const R = out[b], avg = f => R.reduce((a, x) => a + f(x), 0) / R.length;
    const m = avg(x => x.score), sd = Math.sqrt(avg(x => (x.score - m) ** 2));
    const lostNames = {};
    for (const x of R) for (const n of x.lost) lostNames[n] = (lostNames[n] || 0) + 1;
    console.log(`${b.padEnd(10)} ${m.toFixed(1).padStart(6)} ${('(' + sd.toFixed(1) + ')').padStart(6)} ${String(Math.min(...R.map(x => x.score))).padStart(5)} ${String(Math.max(...R.map(x => x.score))).padStart(4)} |` +
      ` ${(avg(x => x.quota) * 100).toFixed(0).padStart(6)} ${avg(x => x.met).toFixed(1).padStart(7)} ${avg(x => x.delivered).toFixed(0).padStart(10)} ${avg(x => x.fish).toFixed(0).padStart(5)} ${avg(x => x.dumped).toFixed(0).padStart(5)} ${avg(x => x.ballast).toFixed(0).padStart(7)} |` +
      ` ${(avg(x => x.bio) * 100).toFixed(0).padStart(4)} ${(avg(x => x.water) * 100).toFixed(0).padStart(7)} ${avg(x => x.lost.length).toFixed(1).padStart(5)} ${avg(x => x.recovered.length).toFixed(1).padStart(6)} ${avg(x => x.bycatch).toFixed(1).padStart(8)} ${(R.filter(x => x.bankrupt).length + '/' + R.length).padStart(9)}` +
      (Object.keys(lostNames).length ? '   lost: ' + Object.entries(lostNames).map(([n, c]) => n + ' ' + c).join(', ') : ''));
    console.log(' '.repeat(11) + 'parts: ' + R[0].parts.map((p, i) => p.label.replace(/ \(.*/, '') + ' ' + avg(x => x.parts[i].pts).toFixed(1)).join(' | '));
  }
}
