// ---------- sound (M5) ----------
// A generative chord with one voice per native species: each voice is as loud as its species is abundant, so a
// healthy ocean sounds full and a species that dies out leaves a hole in the chord. Invaders add a dissonant voice.
// Pollution closes a low-pass filter over everything (murky water, muffled sound), warmth makes the chord waver,
// night darkens it. Over that: slow sea swell, bell notes whose density follows biodiversity, a trawler engine drone
// panned with the boat, a splash for each net haul, a ship's horn for a ballast flush, a gong when a species is lost.
// Reads S and never writes it. Browsers only allow sound after a user gesture, so it starts on the first tap or key.

const SOUND = { on: store.get('deeptide.sound') !== 'off', ac: null, last: 0, nextBell: 0, zero: null };

// D major 9, spread open: plankton holds the root, the top predators the high notes
const VOICE_HZ = { plankton: 73.42, grazer: 110.0, hunter: 146.83, jelly: 164.81, turtle: 185.0, manta: 220.0, shark: 277.18 };
const INVADER_HZ = 207.65;        // G#3: a tritone against the root, the one note that doesn't belong
const BELL_SCALE = [293.66, 329.63, 369.99, 440.0, 493.88, 554.37, 587.33, 739.99, 880.0]; // D major pentatonic+, above the chord

function audioInit() {
  if (SOUND.ac || !SOUND.on) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = SOUND.ac = new AC();
  const master = ac.createGain(); master.gain.value = 0;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ac.destination);
  // a generated hall: two seconds of decaying noise
  const verb = ac.createConvolver(), len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  verb.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.35; verb.connect(wet); wet.connect(master);
  // everything musical runs through the water filter
  const water = ac.createBiquadFilter(); water.type = 'lowpass'; water.frequency.value = 3200; water.Q.value = 0.5;
  water.connect(master); water.connect(verb);
  // warmth wobble: one slow LFO shared by every chord voice's pitch
  const wob = ac.createOscillator(), wobAmt = ac.createGain(); wob.frequency.value = 0.21; wobAmt.gain.value = 0; wob.connect(wobAmt); wob.start();

  const voices = {};
  const addVoice = (key, hz, type, peak) => {
    const g = ac.createGain(); g.gain.value = 0;
    const trem = ac.createGain(); trem.gain.value = 0.75;                  // each voice breathes at its own rate
    const lfo = ac.createOscillator(), lfoAmt = ac.createGain();
    lfo.frequency.value = 0.05 + Math.random() * 0.12; lfoAmt.gain.value = 0.25; lfo.connect(lfoAmt); lfoAmt.connect(trem.gain); lfo.start();
    for (const cents of [-5, 5]) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = cents;
      wobAmt.connect(o.detune); o.connect(trem); o.start();
    }
    trem.connect(g); g.connect(water);
    voices[key] = { g, peak };
  };
  for (const sp of NATIVE) if (VOICE_HZ[sp.id]) addVoice(sp.i, VOICE_HZ[sp.id], sp.id === 'plankton' ? 'sine' : 'triangle', sp.id === 'plankton' ? 0.11 : 0.05);
  addVoice('inv', INVADER_HZ, 'sawtooth', 0.022);

  // sea swell: looped brown noise, slowly breathing
  const nb = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate), nd = nb.getChannelData(0);
  let b = 0; for (let i = 0; i < nd.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = b * 3.2; }
  const sea = ac.createBufferSource(); sea.buffer = nb; sea.loop = true;
  const seaF = ac.createBiquadFilter(); seaF.type = 'lowpass'; seaF.frequency.value = 520;
  const seaG = ac.createGain(); seaG.gain.value = 0.16;
  const swell = ac.createOscillator(), swellAmt = ac.createGain(); swell.frequency.value = 0.09; swellAmt.gain.value = 0.08; swell.connect(swellAmt); swellAmt.connect(seaG.gain); swell.start();
  sea.connect(seaF); seaF.connect(seaG); seaG.connect(master); sea.start();

  // trawler engine: two slightly detuned saws, throbbing, deep under a low-pass, panned with the boat
  const eng = ac.createGain(); eng.gain.value = 0;
  const engF = ac.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 170;
  const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
  for (const hz of [46, 46.8, 92.5]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(engF); o.start(); }
  const throb = ac.createOscillator(), throbAmt = ac.createGain(); throb.frequency.value = 5.5; throbAmt.gain.value = 0.35;
  const engAmp = ac.createGain(); engAmp.gain.value = 0.65; throb.connect(throbAmt); throbAmt.connect(engAmp.gain); throb.start();
  engF.connect(engAmp); engAmp.connect(eng);
  if (pan) { eng.connect(pan); pan.connect(master); } else eng.connect(master);

  Object.assign(SOUND, { master, water, wet, wobAmt, voices, seaF, eng, pan, verb });
  SOUND.zero = S.zero.slice();
  addEventListener('visibilitychange', () => { if (!SOUND.ac) return; if (document.hidden) SOUND.ac.suspend(); else if (SOUND.on) SOUND.ac.resume(); });
}

// one-shots
function bell(hz, when, gain, pan) {
  const ac = SOUND.ac, g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 2.6);
  for (const [m, a] of [[1, 1], [2.76, 0.3], [5.4, 0.08]]) { // a bell's inharmonic partials
    const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = hz * m; og.gain.value = a;
    o.connect(og); og.connect(g); o.start(when); o.stop(when + 2.7);
  }
  if (p) { p.pan.value = pan; g.connect(p); p.connect(SOUND.water); } else g.connect(SOUND.water);
}
function noiseBurst(when, dur, freq, gain, pan) {
  const ac = SOUND.ac, n = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  s.buffer = n; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8; g.gain.value = gain;
  s.connect(f); f.connect(g);
  if (p) { p.pan.value = pan; g.connect(p); p.connect(SOUND.master); } else g.connect(SOUND.master);
  s.start(when);
}
function soundHorn() {
  if (!SOUND.ac || !SOUND.on) return;
  const ac = SOUND.ac, t = ac.currentTime, g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 520;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.25); g.gain.setValueAtTime(0.16, t + 1.5); g.gain.linearRampToValueAtTime(0, t + 2.3);
  for (const hz of [98, 146.83, 196.5]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + 2.4); }
  f.connect(g); g.connect(SOUND.master); g.connect(SOUND.verb);
}
function gong(t) {
  const ac = SOUND.ac, g = ac.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
  for (const [hz, a] of [[55, 1], [55 * 2.1, 0.4], [55 * 3.9, 0.15], [55 * 5.3, 0.06]]) {
    const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = hz; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + 6.1);
  }
  g.connect(SOUND.master); g.connect(SOUND.verb);
}
function soundSplash(x) {
  if (!SOUND.ac || !SOUND.on) return;
  noiseBurst(SOUND.ac.currentTime, 0.35, 900, 0.18, Math.max(-1, Math.min(1, x / WW * 2 - 1)) * 0.7);
}

// called every frame; updates the mix about ten times a second
function audioTick(now) {
  if (!SOUND.ac || !SOUND.on || now - SOUND.last < 100) return;
  SOUND.last = now;
  const ac = SOUND.ac, t = ac.currentTime, ease = (param, v, tc) => param.setTargetAtTime(v, t, tc);
  const menuUp = !document.getElementById('menu').hidden || !document.getElementById('end').hidden;
  ease(SOUND.master.gain, (paused || menuUp ? 0.4 : 0.85), 0.6);
  // the chord: each voice as loud as its species is abundant (relative to the best it has done), silent at zero
  for (const sp of NATIVE) {
    const v = SOUND.voices[sp.i]; if (!v) continue;
    const ref = Math.max(sp.id === 'plankton' ? 200 : 4, S.peak[sp.i] * 0.6);
    ease(v.g.gain, v.peak * Math.sqrt(Math.min(1, S.counts[sp.i] / ref)), 1.2);
  }
  ease(SOUND.voices.inv.g.gain, SOUND.voices.inv.peak * Math.min(1, S.counts[INVADER] / 4), 0.8);
  // the water: pollution muffles, night darkens, warmth makes the chord waver
  const pol = MOOD.pol, n = MOOD.n;
  ease(SOUND.water.frequency, 3200 * (1 - 0.86 * pol) * (1 - 0.4 * n), 0.8);
  ease(SOUND.seaF.frequency, 520 * (1 - 0.5 * pol), 0.8);
  ease(SOUND.wet.gain, 0.3 + 0.2 * n, 2);
  ease(SOUND.wobAmt.gain, 30 * MOOD.warm, 2);
  // trawler engine, panned with the nearest boat
  const boats = S.trawlers.concat(SAILING);
  ease(SOUND.eng.gain, boats.length ? 0.22 : 0, 0.5);
  if (boats.length && SOUND.pan) ease(SOUND.pan.pan, Math.max(-1, Math.min(1, (boats[0].x + 230) / WW * 2 - 1)) * 0.8, 0.2);
  // bells: a living, varied ocean rings more often
  const alive = NATIVE.filter(sp => sp.i !== PLANKTON && S.counts[sp.i] > 0);
  if (!paused && !menuUp && t >= SOUND.nextBell) {
    if (alive.length) {
      const k = (Math.random() * BELL_SCALE.length) | 0;
      bell(BELL_SCALE[k] * (Math.random() < 0.2 ? 0.5 : 1), t + 0.02, 0.05 + Math.random() * 0.03, Math.random() * 1.4 - 0.7);
    }
    const div = alive.length / (NATIVE.length - 1);
    SOUND.nextBell = t + (1.2 + Math.random() * 3.5) / Math.max(0.2, div * div);
  }
  // a species just lost: one low gong, however many went in the same moment (stacked gongs clip)
  let lost = false;
  for (let i = 0; i < N; i++) { if (S.zero[i] && !SOUND.zero[i] && S.t > 2) lost = true; SOUND.zero[i] = S.zero[i]; }
  if (lost) gong(t + 0.05);
  // net hauls splash at the surface: one splash per update, however many animals came up together
  let haul = null;
  for (const l of LIFTS) if (!l.heard) { l.heard = true; haul = l; }
  if (haul) soundSplash(haul.x);
}

function setSound(on, user) {
  SOUND.on = on;
  const b = document.getElementById('soundBtn'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  if (!user) return; // page load: show the state only; the context may only start inside a gesture
  store.set('deeptide.sound', on ? 'on' : 'off');
  if (on) {
    audioInit(); if (SOUND.ac) SOUND.ac.resume();
    // whatever happened while muted is old news: no late gong or splash on switching back on
    SOUND.zero = S.zero.slice(); for (const l of LIFTS) l.heard = true;
  }
  else if (SOUND.ac) SOUND.ac.suspend();
}
// browsers allow sound only after a gesture: start on the first tap or key press. On touch screens pointerdown does
// not count as one (only pointerup/touchend/click do), so listen to all of them.
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, function first() {
  if (SOUND.on) { audioInit(); if (SOUND.ac && SOUND.ac.state !== 'running' && !document.hidden) SOUND.ac.resume(); } // iOS can leave it 'interrupted'
}, { capture: true });
