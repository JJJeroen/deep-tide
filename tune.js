// Headless tuning harness for Deep Tide. Runs the sim block of index.html (between SIM-START/SIM-END) in node.
//   node tune.js [seconds=1800] [runs=10] [scenario=idle|cold|hot]
// Reports per native species: % of time at zero, mean count, births, and rescue/recolonization arrivals,
// plus who ate what. M1 acceptance: every native species at zero < 2% of the time, arrivals < 10% of births.
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
let sim = html.split('// ==SIM-START==')[1].split('// ==SIM-END==')[0];
// instrument: count births, arrivals, kills (patched into the source text so index.html stays clean)
sim = sim
  .replace('S.newborns.push(k);', 'S.newborns.push(k); T.births[a.t]++;')
  .replace('function arrive(i, n) {', 'function arrive(i, n) { T.arrivals[i] += n;')
  .replace('function eat(pred, prey, gain) {', 'function eat(pred, prey, gain) { T.eaten[pred.t][prey.t]++;');

const STEP = new vm.Script('step(1/30)'), COUNTS = new vm.Script('S.counts');
function run(seconds, scenario) {
  const T = { births: [], arrivals: [], eaten: [] };
  const ctx = vm.createContext({ Math, T, console });
  vm.runInContext(sim, ctx);
  const N = vm.runInContext('N', ctx);
  for (let i = 0; i < N; i++) { T.births[i] = 0; T.arrivals[i] = 0; T.eaten[i] = new Array(N).fill(0); }
  vm.runInContext(`resetWorld(); S.temp = ${scenario === 'cold' ? 0.2 : scenario === 'hot' ? 0.75 : 0.5};`, ctx);
  const steps = Math.round(seconds * 30), zero = new Array(N).fill(0), sum = new Array(N).fill(0);
  let samples = 0;
  for (let k = 0; k < steps; k++) {
    STEP.runInContext(ctx);
    if (k % 30 === 0) {
      const c = COUNTS.runInContext(ctx);
      samples++;
      for (let i = 0; i < N; i++) { if (c[i] === 0) zero[i]++; sum[i] += c[i]; }
    }
  }
  const names = vm.runInContext('SPECIES.map(s => s.id)', ctx);
  const native = vm.runInContext('NATIVE.map(s => s.i)', ctx);
  return { names, native, zero: zero.map(z => z / samples), mean: sum.map(s => s / samples), T };
}

const seconds = +process.argv[2] || 1800, runs = +process.argv[3] || 10, scenario = process.argv[4] || 'idle';
const R = [];
for (let r = 0; r < runs; r++) R.push(run(seconds, scenario));
const { names, native } = R[0];
const avg = f => R.reduce((a, x) => a + f(x), 0) / R.length;
console.log(`scenario=${scenario} ${seconds}s x ${runs} runs`);
console.log('species      zero%   mean   births  arrivals  arr/birth');
let pass = true;
for (const i of native) {
  if (names[i] === 'plankton') continue;
  const z = avg(x => x.zero[i]) * 100, m = avg(x => x.mean[i]), b = avg(x => x.T.births[i]), a = avg(x => x.T.arrivals[i]);
  const ratio = b ? a / b : Infinity;
  const ok = z < 2 && ratio < 0.1;
  if (!ok) pass = false;
  console.log(`${names[i].padEnd(11)} ${z.toFixed(1).padStart(6)} ${m.toFixed(1).padStart(6)} ${b.toFixed(0).padStart(8)} ${a.toFixed(1).padStart(8)} ${ratio.toFixed(2).padStart(9)}  ${ok ? 'ok' : 'FAIL'}`);
}
console.log('eaten (mean per run):');
for (const p of native) for (const q of native) {
  const e = avg(x => x.T.eaten[p][q]);
  if (e >= 0.5 && names[p] !== 'plankton') console.log(`  ${names[p]} -> ${names[q]}: ${e.toFixed(0)}`);
}
console.log(pass ? 'M1 ACCEPTANCE: PASS' : 'M1 ACCEPTANCE: not yet');
