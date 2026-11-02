// Deep Tide coach: the "Learn to play" tutorial and the Hints switch. UI only: it reads sim state and never changes it.
// - Learn mode: five fixed steps (watch, net, trawler, quota, ballast). Each waits for the player to do the thing, then
//   says what that just caused. A fixed list on purpose, not a scripting engine.
// - Hints (any mode, switchable): one-off tips at the moment they matter, explaining consequences rather than the best move.
// Hooks called from elsewhere: coachReset(mode) from newGame, coachCatch(sp, trawler, company) from collectCatch,
// coachSaw(t) from drawInspect, coachTick() from updateUI.
const coachEl = document.getElementById('coach');
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
let hintsOn = store.get('deeptide.hints') !== 'off'; // on until the player switches it off
const lc = sp => (SINGULAR[SPECIES[sp].id] || SPECIES[sp].name).toLowerCase();
const plural = sp => SPECIES[sp].name.toLowerCase();
const countOf = (n, sp) => n + ' ' + (n === 1 ? lc(sp) : plural(sp));
const minutes = s => s < 90 ? Math.round(s) + ' seconds' : 'about ' + Math.round(s / 60) + ' minutes';

const C = { mode: null, shown: new Set(), queue: [], tip: null, tipUntil: 0, L: null, trawls: new Set() };

// ---------- learn mode
const LEARN = [
  { title: 'What lives here', tool: 'watch',
    text: 'This ocean runs on its own. Plankton (the green specks) feeds the silver grazers, grazers feed the bronze hunters, and hunters feed the sharks. Jellyfish and manta rays filter plankton; sea turtles eat jellyfish.',
    task: 'Point at (or tap) three different kinds of animal.',
    prog: L => Math.min(3, L.saw.size) + ' of 3', done: L => L.saw.size >= 3,
    after: () => 'Each label shows how fed the animal is. Hungry animals hunt harder; starving ones die. Every number in the panel on the right is a living balance like this.' },
  { title: 'The net', tool: 'net',
    text: 'The fleet pays for fish. The net is slow and picky: it takes only what is inside the circle, and you choose where that is.',
    task: 'Pick the Net and drag it through a shoal of grazers. Take three.',
    prog: L => Math.min(3, L.netted[GRAZER]) + ' of 3', done: L => L.netted[GRAZER] >= 3,
    after: L => {
      const other = L.netted.reduce((a, b) => a + b, 0) - L.netted[GRAZER];
      return 'You took ' + countOf(L.netted[GRAZER], GRAZER) + (other ? ' and ' + other + ' other animal' + (other === 1 ? '' : 's') : '') + '. Grazers breed fast, so a few is fine. Everything that hunts here depends on them, though: watch their line in the panel when you take more.';
    } },
  { title: 'The trawler', tool: 'trawl',
    text: 'A trawler is fast. It drags a net the full width of the ocean at one depth.',
    task: 'Pick the Trawler and click a depth.',
    prog: L => L.trawlsDone ? 'done' : (S.trawlers.length ? 'trawling…' : ''), done: L => L.trawlsDone >= 1,
    after: L => trawlSummary(L.lastTrawl) + ' A trawler takes everything in its band: young fish, jellyfish, and anything protected.' },
  { title: 'The quota', tool: null, start: L => { L.qStart = S.t; L.qHaul = 0; },
    text: 'In the scored run the fleet needs a catch every minute, and a bigger one every minute after.',
    task: 'Bring in 6 catch in 30 seconds. Grazers are worth 1, hunters 4, jellyfish ½. Use any tool.',
    prog: L => Math.floor(L.qHaul * 2) / 2 + ' of 6 · ' + Math.max(0, Math.ceil(30 - (S.t - L.qStart))) + ' s left',
    bar: L => Math.min(1, L.qHaul / 6), done: L => L.qHaul >= 6 || S.t - L.qStart >= 30,
    after: L => (L.qHaul >= 6 ? 'Quota met. ' : 'Short by ' + Math.ceil(6 - L.qHaul) + '. ') + 'In the run, each short minute costs points and sends head office\'s own trawler, which fishes without care; three in a row bankrupt the fleet (−10, once). A species gone at the end costs 10 too, every one of them.' },
  { title: 'The ballast ship', tool: 'invader',
    text: 'Now and then a ship offers money if you let it skip treating its ballast water. In the scored run that is the Skip ballast button: +' + RUN.BALLAST_PAY + ' toward the quota.',
    task: 'Pick "Release invader" and click anywhere in the water.',
    prog: () => '', done: () => S.counts[INVADER] > 0,
    after: () => 'Those are lionfish. They hunt grazers and jellyfish, and nothing here eats them. Lost species also take much longer to return while they are around. Point at one to see it.' },
];
function trawlSummary(tr) {
  const out = tr && tr.escProt ? ' The excluder let ' + tr.escProt + ' protected animal' + (tr.escProt === 1 ? '' : 's') + ' out.' : '';
  if (!tr || !tr.catch) return 'That pass came up empty.' + out;
  const parts = Object.keys(tr.bySp || {}).map(Number).sort((a, b) => tr.bySp[b] - tr.bySp[a]).map(sp => countOf(tr.bySp[sp], sp));
  return 'That pass took ' + tr.catch + ' animal' + (tr.catch === 1 ? '' : 's') + ': ' + parts.join(', ') + '.' + out;
}

// ---------- hints: one-off tips, consequences first
function tip(id, text) {
  if (!hintsOn || C.shown.has(id)) return;
  C.shown.add(id); C.queue.push(text);
}
function coachCatch(sp, trawler, company) {
  if (company) return; // head office's trawler: not the player's catch, not their bycatch
  const L = C.L;
  if (L) {
    if (!trawler) L.netted[sp]++;
    if (L.step === 3 && !L.after) L.qHaul += RUN_VAL[sp];
  }
  if (C.mode === 'learn' && L && L.step < LEARN.length) return; // the steps do the talking during the tutorial
  if (sp === HUNTER && !trawler) tip('hunter', 'You netted a hunter' + (S.game.on ? ' (worth 4)' : '') + '. ' + countOf(S.counts[HUNTER], HUNTER) + ' left. Sharks eat only hunters, and hunters keep the grazers in check: take too many and both ends of the chain feel it.');
  if (RUN_PROTECTED[sp]) tip('prot', 'A ' + lc(sp) + ' died in your ' + (trawler ? 'trawl' : 'net') + '. ' + (S.game.on ? 'Protected animals cost a point each. ' : '') + SPECIES[sp].name + ' breed slowly: at most one young every ' + SPECIES[sp].breed + ' seconds.');
}
function hintChecks() {
  const g = S.game;
  if (S.t > 12 && C.mode !== 'learn') tip('intro', 'Plankton feeds the grazers, grazers feed the hunters, hunters feed the sharks. Jellyfish and mantas filter plankton; turtles eat jellyfish. Point at any animal to see how it is doing.');
  if (S.peak[GRAZER] > 30 && S.counts[GRAZER] < 25) tip('grazers', 'Grazers are down to ' + S.counts[GRAZER] + '. Everything that hunts here eats grazers or eats what eats them. Their line in the panel shows where this is heading.');
  if (S.avgPoll > 0.02) tip('poll', 'Waste spreads, then fades slowly. Fish lose energy in it and plankton dies in it. Species that die out will not come back until the water is above 85% clean.');
  if (S.counts[INVADER] > 0) tip('inv', 'Invaders hunt grazers and jellyfish, and nothing here eats them. While they are around, lost species take much longer to return.');
  for (const s of NATIVE) if (s.recolonize && S.zero[s.i] && S.harmed[s.i])
    tip('lost' + s.i, s.name + ' are gone. If the water stays clean and cool and there is enough for them to eat, they drift back from the open ocean in ' + minutes(s.recolonize.after) + '.');
  if (g.on && g.mins.length && !g.mins[g.mins.length - 1].ok) tip('short', 'Short this minute. Each short minute lowers your quota score, and head office sends its own trawler, which takes everything in the busiest band. Three short in a row bankrupt the fleet (−10, once) and the company trawlers stop. A species gone at the end costs 10 as well.');
  if (S.reef.bleach > 0.35) tip('bleach', 'The reef is bleaching. In water this warm, corals expel the algae that feed them and turn white. If it stays warm they starve and algae take over the skeletons; a reef recovers far slower than it dies.');
  if (S.t > 30 && SOUND.ac && SOUND.on && SOUND.ac.state === 'running')
    tip('sound', 'Listen: every species is one note in the chord, as loud as it is common. Lose a species and its note goes silent. Murky water muffles it, warm water makes it waver, a clashing note means invaders. The menu explains every sound.');
  if (cam.y > 250 || (S.t > 150 && deepVisible())) tip('deep', 'The deep. No sunlight reaches here: everything lives on marine snow, the scraps sinking from above. Lanternfish rise toward the surface at night; anglerfish lure them with light; a sperm whale dives down to hunt giant squid. Point at something and the lamp lights it up.');
  if (MOOD.n > 0.5) tip('night', 'Night. The grazers rise to feed near the surface, where hunters see less in the dark; at dawn the well-fed ones sink again. Dusk and dawn, while they pass through, are when hunters eat.');
  if (ALIVE.nutrients && S.t > 90 && S.upwell < NUT_U0 * 0.8) tip('nutrients', 'Less is drifting down than usual. Dead animals sink, rot on the seabed and well up again as food for the plankton; what the nets take never comes back. Watch the plankton grow slower.');
  if (ALIVE.refuge && S.reef.dead > 0.3) tip('reefdead', 'The reef is dying. Small fish hide among the coral (bottom left) from hunters; a dead reef hides nothing.');
  if (S.ghosts.some(gn => gn.kills > 0)) tip('ghost', 'A lost net is still fishing: what swims into it, mostly the big slow animals, just dies there. Pick Watch and click (or tap) the net to haul it up. Left alone it frays apart in a few minutes; real ghost nets drift for years.');
  if (S.mpa) tip('mpa', 'Nothing inside the strip can be netted or trawled; trawlers lift their nets over it. It pays slowly: fish that grow up safe there wander out into the rest of the water. Over the reef it also keeps the coral from being dragged. A lost net that drifts in still fishes: ghost nets obey no rules.');
  if (S.flags.scarTip) tip('scar', 'That trawl dragged along the floor. The net flattens the reef and stirs up silt: broken coral hides no fish, and it takes many minutes to grow back. Set the net higher to fish the open water instead.');
  if (g.on && g.ballast > 0) tip('ballast', '+' + RUN.BALLAST_PAY + ' toward the quota. The lionfish that came with it will hunt your grazers for the rest of the season.');
}

// ---------- state, drawing
function coachReset(mode) {
  C.mode = mode; C.shown = new Set(); C.queue = []; C.tip = null; C.trawls = new Set();
  C.L = { step: 0, after: false, saw: new Set(), netted: new Array(N).fill(0), trawlsDone: 0, lastTrawl: null, qStart: 0, qHaul: 0 };
  if (mode === 'learn' && LEARN[0].start) LEARN[0].start(C.L);
  coachRender(true);
}
function coachSaw(t) { if (C.L) C.L.saw.add(t); }
function setHints(on) {
  hintsOn = on; store.set('deeptide.hints', on ? 'on' : 'off');
  const b = document.getElementById('hintsBtn'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  if (!on) { C.queue = []; C.tip = null; }
  coachRender(true);
}
function coachTick() {
  if (!C.mode || !menuEl.hidden || !endEl.hidden) { coachEl.hidden = true; return; }
  // a trawler that has left the screen is a finished pass
  for (const tr of S.trawlers) if (!tr.company) C.trawls.add(tr);
  for (const tr of C.trawls) if (!S.trawlers.includes(tr)) { C.trawls.delete(tr); if (C.L) { C.L.trawlsDone++; C.L.lastTrawl = tr; } if (C.mode !== 'learn') { if (tr.excl) tip('excl', trawlSummary(tr) + ' The grid in the net lets big animals out through a hatch; some of the catch slips out with them (about ' + Math.round(EXCLUDER.leak * 100) + '%).'); else tip('trawl', trawlSummary(tr) + ' Everything in the band dies, young fish and bycatch too.' + (tr.prot ? ' The Excluder switch next to the Trawler fits a grid that lets protected animals out.' : '')); } }
  const L = C.L;
  if (C.mode === 'learn' && L.step < LEARN.length && !L.after && LEARN[L.step].done(L)) L.after = true;
  hintChecks();
  if (!C.tip && C.queue.length) { C.tip = C.queue.shift(); C.tipUntil = performance.now() + 14000; }
  if (C.tip && performance.now() > C.tipUntil) C.tip = null;
  coachRender(false);
}
let lastHtml = '';
function coachRender(force) {
  const L = C.L, learn = C.mode === 'learn' && L;
  let html = '';
  if (learn && L.step < LEARN.length) {
    const st = LEARN[L.step];
    html = `<div class="ch">Learn · step ${L.step + 1} of ${LEARN.length} · ${st.title}</div>`
      + (L.after ? `<p>${st.after(L)}</p>` : `<p>${st.text}</p><p class="task">${st.task}</p>`)
      + (!L.after && st.bar ? `<div class="qbar${st.bar(L) >= 1 ? ' met' : ''}"><i style="width:${Math.round(st.bar(L) * 100)}%"></i></div>` : '')
      + (!L.after && st.prog(L) ? `<p class="prog">${st.prog(L)}</p>` : '')
      + `<ol class="steps">${LEARN.map((s, i) => `<li class="${i < L.step || (i === L.step && L.after) ? 'done' : i === L.step ? 'now' : ''}">${s.title}</li>`).join('')}</ol>`
      + `<div class="actions">${L.after ? '<button class="on" data-c="next">Next</button>' : '<button data-c="skip">Skip this step</button>'}</div>`;
  } else if (learn) {
    html = `<div class="ch">Learn · done</div><p>That is all of it. The Anthropocene run gives you ten minutes, a quota that grows every minute, and water that keeps warming on its own. Hints stay on there unless you switch them off.</p>`
      + `<div class="actions"><button class="on" data-c="run">Start the Anthropocene run</button><button data-c="stay">Keep playing here</button></div>`;
  } else if (C.tip) {
    html = `<div class="ch">Hint</div><p>${C.tip}</p><div class="actions"><button data-c="ok">Got it</button><button data-c="off">Turn hints off</button></div>`;
  }
  // highlight the tool the current step asks for
  const want = learn && L.step < LEARN.length && !L.after ? LEARN[L.step].tool : null;
  document.querySelectorAll('#bar [data-tool]').forEach(b => { if (b.dataset.tool !== 'stock') b.classList.toggle('pulse', !!want && b.dataset.tool === want && tool !== want); });
  coachEl.hidden = !html;
  if (html && (force || html !== lastHtml)) { coachEl.innerHTML = html; lastHtml = html; }
  if (html) {
    // phones in portrait: the ocean is a strip in the middle, so the card goes over the panels at the top instead of over the water
    const top = innerWidth <= 760 && innerHeight > innerWidth;
    coachEl.style.top = top ? '8px' : 'auto';
    coachEl.style.bottom = top ? 'auto' : Math.round(document.getElementById('bar').getBoundingClientRect().height + 22) + 'px';
  }
}
coachEl.addEventListener('click', e => {
  const c = e.target.closest('[data-c]'); if (!c) return;
  const L = C.L, k = c.dataset.c;
  if (k === 'next' || k === 'skip') {
    L.step++; L.after = false;
    if (L.step < LEARN.length && LEARN[L.step].start) LEARN[L.step].start(L);
    if (L.step >= LEARN.length) store.set('deeptide.learned', '1');
  }
  else if (k === 'run') newGame('run');
  else if (k === 'stay') { C.mode = 'sandbox'; document.getElementById('tagline').textContent = 'A small ocean that runs without you.'; }
  else if (k === 'ok') C.tip = null;
  else if (k === 'off') setHints(false);
  coachRender(true);
});
