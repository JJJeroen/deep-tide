// M9 part 5 (Generations): the heal between two seasons, off the main thread. GEN.HEAL (300) sim seconds of an ocean left
// alone are 9,000 steps: about 2 s in Chromium on a fast desktop (0.18 ms a step with the deep), likely several times that on
// a phone. So the page starts this worker the moment a season ends, while the player reads the end card (generations.js).
// It runs the same sim.js and deep.js as the page, in the same engine, so it ends on exactly the ocean the page would get
// stepping it itself (tools/smoke.js compares the two).
// In:  { ocean, deep, seed, steps, every }  (the season's end, as sim.js oceanState / deep.js deepState)
// Out: { kind: 'snap', frac, ocean, deep } every `every` steps (the heal card shows the ocean moving on), then
//      { kind: 'done', ocean, deep }, or { kind: 'error', msg }.
importScripts('sim.js', 'deep.js');
onmessage = e => {
  const { ocean, deep, seed, steps, every } = e.data;
  try {
    loadOcean(ocean); loadDeep(deep); startHeal(seed); seedDeep(seed);
    for (let i = 1; i <= steps; i++) {
      step(1 / 30); stepDeep(1 / 30);
      if (every && i % every === 0 && i < steps) postMessage({ kind: 'snap', frac: i / steps, ocean: oceanState(), deep: deepState() });
    }
    postMessage({ kind: 'done', ocean: oceanState(), deep: deepState() });
  } catch (err) { postMessage({ kind: 'error', msg: String((err && err.message) || err) }); }
};
