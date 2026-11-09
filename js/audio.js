// Synthesised sound effects (no audio files needed) + optional browser speech.
import { G, clamp, pick } from './state.js';

let ctx = null, master = null, noiseBuf = null, ambient = null, ambientGain = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
  // Pub chatter bed: band-passed noise with slow wobble.
  ambient = ctx.createBufferSource();
  ambient.buffer = noiseBuf; ambient.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 180;
  lfo.connect(lfoGain); lfoGain.connect(bp.frequency); lfo.start();
  ambientGain = ctx.createGain(); ambientGain.gain.value = 0;
  ambient.connect(bp); bp.connect(ambientGain); ambientGain.connect(master);
  ambient.start();
}

export function setAmbience(level) {
  if (!ctx || !ambientGain) return;
  ambientGain.gain.setTargetAtTime(G.settings.sfx ? clamp(level, 0, 1) * 0.12 : 0, ctx.currentTime, 0.5);
}

function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  if (!ctx || !G.settings.sfx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, filterType, freq, q = 1, delay = 0, attack = 0.005) {
  if (!ctx || !G.settings.sfx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, attack, vol, dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random()); s.stop(t + dur + attack + 0.05);
}

export const sfx = {
  thunk() { tone('sine', 160, 50, 0.35, 0.8); noise(0.12, 0.4, 'lowpass', 600); },
  ding() { tone('sine', 1320, 1320, 0.9, 0.25); tone('sine', 1980, 1980, 0.6, 0.08); },
  smash() { noise(0.35, 0.6, 'highpass', 2500, 0.7); for (let i = 0; i < 5; i++) tone('triangle', 2000 + Math.random() * 3000, 1500, 0.08, 0.06, i * 0.03); },
  kick() { tone('sine', 120, 45, 0.18, 0.9); noise(0.05, 0.4, 'lowpass', 1200); },
  bounce() { tone('sine', 220, 120, 0.1, 0.25); },
  boing() { tone('sine', 180, 720, 0.35, 0.3); },
  whoosh() { noise(0.35, 0.3, 'bandpass', 900, 2, 0, 0.12); },
  coin() { tone('square', 988, 988, 0.08, 0.12); tone('square', 1319, 1319, 0.25, 0.12, 0.08); },
  cash() { tone('square', 1319, 1319, 0.06, 0.1); tone('square', 1568, 1568, 0.06, 0.1, 0.07); tone('square', 2093, 2093, 0.25, 0.1, 0.14); },
  pour() { noise(1.0, 0.25, 'bandpass', 1800, 3, 0, 0.1); },
  grab() { tone('sine', 320, 260, 0.06, 0.15); },
  drop() { tone('sine', 200, 120, 0.08, 0.2); },
  thud() { tone('sine', 90, 40, 0.25, 0.7); noise(0.1, 0.3, 'lowpass', 400); },
  splash() { noise(0.6, 0.5, 'bandpass', 700, 0.6, 0, 0.02); tone('sine', 400, 900, 0.2, 0.1); },
  blip() { tone('square', 600 + Math.random() * 200, 600, 0.04, 0.05); },
  cheer() { noise(1.4, 0.35, 'bandpass', 650, 1.2, 0, 0.25); noise(1.2, 0.2, 'bandpass', 1300, 2, 0.1, 0.3); },
  groan() { tone('sawtooth', 240, 140, 0.9, 0.06); noise(0.9, 0.2, 'bandpass', 400, 1.5, 0, 0.2); },
  buzz() { tone('square', 110, 110, 0.3, 0.15); },
  good() { tone('triangle', 660, 660, 0.1, 0.2); tone('triangle', 990, 990, 0.2, 0.2, 0.1); },
  bad() { tone('triangle', 300, 200, 0.3, 0.25); },
  whistle() { tone('sine', 2400, 2600, 0.18, 0.18); tone('sine', 2400, 2600, 0.5, 0.18, 0.22); },
  fruit() { for (let i = 0; i < 8; i++) tone('square', 600 + i * 120, 600 + i * 120, 0.07, 0.08, i * 0.07); },
  alarm() { for (let i = 0; i < 6; i++) tone('square', i % 2 ? 700 : 900, i % 2 ? 700 : 900, 0.15, 0.1, i * 0.16); },
};

// --- Voices (speechSynthesis). Real recorded voices can replace this later. ---
const VOICE_STYLE = {
  ian: { pitch: 0.7, rate: 1.05 }, ronnie: { pitch: 1.15, rate: 0.9 }, hollie: { pitch: 1.4, rate: 1.1 },
  chef: { pitch: 0.6, rate: 1.2 }, customer: { pitch: 1.0, rate: 1.0 }, lewis: { pitch: 0.8, rate: 1 },
};
let gbVoices = [], lastSpeak = 0;
function loadVoices() {
  if (!window.speechSynthesis) return;
  const all = speechSynthesis.getVoices();
  gbVoices = all.filter((v) => /en[-_]GB/i.test(v.lang));
  if (!gbVoices.length) gbVoices = all.filter((v) => /^en/i.test(v.lang));
}
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

let voiceHook = null;
export function setVoiceHook(fn) { voiceHook = fn; }
export function speak(text, who = 'customer', important = false, key = text) {
  if (!G.settings.voices) return;
  if (voiceHook && voiceHook(who, key, important)) return;
  if (!window.speechSynthesis) return;
  const now = performance.now();
  if (!important && (speechSynthesis.speaking || now - lastSpeak < 1800)) return;
  if (important) speechSynthesis.cancel();
  lastSpeak = now;
  const u = new SpeechSynthesisUtterance(text.replace(/[^\w\s'!?.,-]/g, ''));
  const st = VOICE_STYLE[who] || VOICE_STYLE.customer;
  u.pitch = st.pitch; u.rate = st.rate; u.volume = 0.9;
  if (gbVoices.length) u.voice = who === 'hollie' ? (gbVoices.find((v) => /female|libby|sonia|kate|serena/i.test(v.name)) || gbVoices[0]) : pick(gbVoices.slice(0, 2));
  try { speechSynthesis.speak(u); } catch (e) { /* ignore */ }
}

// --- Music: a tiny step sequencer for the jukebox (and Ian's van) ---
const SONGS = {
  indie: { bpm: 132, bass: [40, 40, 47, 47, 45, 45, 43, 43], lead: [64, 0, 67, 69, 0, 71, 69, 67, 64, 0, 62, 64, 0, 67, 64, 62] },
  pop: { bpm: 116, bass: [45, 45, 41, 41, 36, 36, 43, 43], lead: [69, 72, 76, 72, 74, 72, 69, 0, 67, 69, 72, 69, 67, 64, 62, 0] },
  singalong: { bpm: 96, bass: [36, 43, 36, 43, 41, 48, 43, 47], lead: [60, 60, 64, 67, 67, 65, 64, 62, 60, 62, 64, 65, 64, 62, 60, 0] },
  country: { bpm: 120, bass: [43, 38, 43, 38, 36, 43, 38, 43], lead: [71, 74, 71, 67, 69, 71, 69, 67, 64, 67, 69, 67, 0, 74, 71, 0] },
};
let songTimer = null, songStep = 0, current = null;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function blipNote(type, f, t, dur, vol) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
export const music = {
  play(name) {
    if (songTimer) { clearInterval(songTimer); songTimer = null; }
    current = name;
    if (!name || !ctx || !SONGS[name]) return;
    const song = SONGS[name], stepDur = 60 / song.bpm / 2;
    let next = ctx.currentTime + 0.05; songStep = 0;
    songTimer = setInterval(() => {
      if (!G.settings.sfx) return;
      while (next < ctx.currentTime + 0.15) {
        const n = song.lead[songStep % song.lead.length];
        if (n) blipNote(name === 'country' ? 'sawtooth' : 'triangle', mtof(n), next, stepDur * 0.9, name === 'country' ? 0.025 : 0.04);
        if (songStep % 2 === 0) blipNote('square', mtof(song.bass[(songStep / 2) % song.bass.length]), next, stepDur * 1.6, 0.025);
        if (songStep % 4 === 0) { blipNote('sine', 70, next, 0.12, 0.08); }
        next += stepDur; songStep++;
      }
    }, 40);
  },
  get current() { return current; },
};
