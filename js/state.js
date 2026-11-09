// Shared game state + small helpers. Every module imports G from here.
import * as THREE from 'three';

export const G = {
  scene: null, camera: null, renderer: null, rig: null,
  xr: false,            // true while an immersive VR session is running
  touch: false,         // touch controls visible
  mode: 'menu',         // menu | playing | paused | results
  time: 0,              // game seconds since shift start (scaled)
  dt: 0,
  timeScale: 1,
  slowmo: 0,
  settings: {
    normalHeight: false, seated: false, leftHanded: false,
    smoothTurn: false, voices: true, sfx: true, vignette: true,
  },
  save: null,
  shift: null,          // runtime shift object (see game.js)
  solids: [],           // {min:Vector3, max:Vector3, tag}
  beams: [],            // head-bonk boxes
  zones: [],            // landing zones for thrown people
  items: [], people: [], tables: [], interactables: [],
  player: null, hands: [],
  ball: null,
  ronnie: null, ian: null, hollie: null,
  dynamicRoot: null,    // group holding per-shift objects
};

export const GRAVITY = 9.81;
export const FIXED = 1 / 90;

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const chance = (p) => Math.random() < p;
export function weighted(obj) {
  let total = 0;
  for (const k in obj) total += obj[k];
  let r = Math.random() * total;
  for (const k in obj) { r -= obj[k]; if (r <= 0) return k; }
  return Object.keys(obj)[0];
}
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = new THREE.Vector3(0, 1, 0);

// Event bus so modules can talk without import cycles.
const listeners = {};
export function on(name, fn) { (listeners[name] ||= []).push(fn); }
export function emit(name, ...args) { (listeners[name] || []).forEach((fn) => fn(...args)); }

const SAVE_KEY = 'lewis-sim-save-v1';
export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  s = Object.assign({
    unlocked: 1, best: {}, bank: 0, upgrades: {}, achievements: {}, oysters: {},
    keepieRecord: 0, goldenBoot: 0, settings: {},
  }, s || {});
  Object.assign(G.settings, s.settings || {});
  G.save = s;
  return s;
}
export function writeSave() {
  if (!G.save) return;
  G.save.settings = G.settings;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* private mode */ }
}
export const hasUpgrade = (id) => !!(G.save && G.save.upgrades[id]);
