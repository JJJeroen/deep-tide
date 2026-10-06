// Headless tuning harness for Deep Tide. Runs the sim block of index.html (between SIM-START/SIM-END) in node.
//   node tune.js [seconds=1800] [runs=10] [scenario] [rescue=on|off]
//   scenarios: idle | cold | hot              (untouched ocean at warmth 0.5 / 0.2 / 0.75)
//              pollute | trawl | invade | net (player harm at HARM_T seconds, then hands off; warmth 0.5)
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

if (!isMainThread) {
  parentPort.postMessage(run(...workerData));
} else {
  const pos = process.argv.slice(2).filter(a => !a.includes('='));
  const kv = Object.fromEntries(process.argv.slice(2).filter(a => a.includes('=')).map(a => a.split('=')));
  const seconds = +pos[0] || 1800, runs = +pos[1] || 10, scenario = pos[2] || 'idle';
  const rescue = kv.rescue === undefined ? undefined : kv.rescue === 'on';
  const patch = process.env.TUNE_PATCH || '';
  const jobs = Math.min(runs, +process.env.TUNE_JOBS || os.cpus().length);
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
