// The Oysterfleet: geometry, collision, landing zones and navigation.
import * as THREE from 'three';
import { G, V, clamp } from './state.js';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { woodTexture, carpetTexture, grassTexture, wallTexture, textTexture, dynamicTexture, labelSprite } from './textures.js';

export const PUB = { x0: -10, x1: 10, z0: -8, z1: 8, h: 2.8 };
export const GARDEN = { x0: 10, x1: 22, z0: -8, z1: 8 };
export const BEAM_Y = 1.95;

// Fixture positions used by gameplay code.
export const FIX = {
  spawn: V(-7, 0, 10.6),
  frontDoor: V(-7, 0, 8),
  queue: V(-6.6, 0, 7.25),
  host: V(-7, 1.15, 6.25),
  spike: V(2.95, 1.15, -7.6),
  pass: { x0: 3.9, x1: 6.8, y: 1.0, z: -7.62 },
  taps: V(-8.35, 1.1, -3.3),
  water: V(-8.35, 1.1, -1.4),
  mocktail: V(-8.35, 1.1, -0.2),
  fridge: V(-9.1, 1.0, 1.8),
  toybox: V(-8.35, 1.1, -5.9),
  tv: V(-4, 2.3, -7.86),
  kitchenDoor: V(0.5, 0, -7.75),
  staffDoor: V(8.9, 0, -7.75),
  toilets: V(4, 0, 7.75),
  gardenDoor: V(10, 0, -5.45),
  functionDoor: V(-8.2, 0, -8),
  carParkGate: V(22.25, 0, 5.7),
  vanBack: V(26, 0, -5.3),
  pool: { x: -5.5, z: -11, w: 2.0, d: 1.0, top: 0.8 },
  pockets() { const { x, z, w, d, top } = this.pool; const out = []; for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) out.push(V(x + sx * w / 2, top, z + sz * d / 2)); return out; },
  dart: { y: 1.73, z: -12.2 },
  mic: V(-0.25, 1.6, -12.55),
  jukebox: V(0.3, 1.1, -9.15),
  goals: [{ x: 21.4, z: 0, w: 2.4, h: 1.2, dir: 1, name: 'BIN GOAL (EAST)' }, { x: 10.7, z: 0, w: 2.4, h: 1.2, dir: -1, name: 'BIN GOAL (WEST)' }],
  penaltySpot: V(18.2, 0, 0),
  ianSeat: V(9.45, 0, 5.0),
  hollieTable: V(6.2, 0, 6.2),
  pondC: V(19.7, 0, 6.5), pondR: 1.15,
  lapPath: [V(11.2, 0, -5.4), V(21.2, 0, -5.4), V(21.2, 0, 4.6), V(11.2, 0, 5.4)],
  goldenSpots: [
    V(-9.5, 2.06, 1.8), V(1.8, 0.05, -3.4), V(-9.6, 1.6, -3.0), V(1.5, 0.62, 6.4), V(21.4, 0.25, -6.5), V(-5.5, 0.88, -11.3), V(31.4, 0.3, 5), V(-0.2, 0.3, -13.5),
    V(-4, 2.78, -7.8), V(6.7, 1.05, -7.6), V(5.8, 0.05, 1.6), V(8.9, 0.8, 5.0), V(-2.5, 1.15, 6.3),
  ],
};

// Table layout. seats are computed in buildTables.
export const TABLE_DEFS = [
  { id: 1, x: -5, z: -3.4, w: 1.1, d: 1.1, seats: 4 },
  { id: 2, x: -1.6, z: -3.4, w: 0.9, d: 0.9, seats: 2 },
  { id: 3, x: 1.8, z: -3.4, w: 1.1, d: 1.1, seats: 4 },
  { id: 4, x: 5.6, z: -3.4, w: 1.1, d: 1.1, seats: 4 },
  { id: 5, x: -5, z: 1.6, w: 1.1, d: 1.1, seats: 4 },
  { id: 6, x: -1.6, z: 1.6, w: 0.9, d: 0.9, seats: 2 },
  { id: 7, x: 1.8, z: 1.6, w: 1.1, d: 1.1, seats: 4 },
  { id: 8, x: 5.8, z: 1.6, w: 2.6, d: 1.0, seats: 8 },
  { id: 9, x: 13.5, z: -6.6, w: 1.8, d: 0.8, seats: 4, garden: true, picnic: true },
  { id: 10, x: 17.5, z: -6.6, w: 1.8, d: 0.8, seats: 4, garden: true, picnic: true },
  { id: 11, x: -3.2, z: -9.4, w: 2.2, d: 0.9, seats: 6, functionRoom: true },
  { id: 'ian', x: 8.9, z: 5.0, w: 0.8, d: 0.8, seats: 1, special: true },
  { id: 'hollie', x: 6.2, z: 6.2, w: 0.8, d: 0.8, seats: 2, special: true },
];

const mats = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats[key]) mats[key] = new THREE.MeshLambertMaterial(Object.assign({ color }, opts));
  return mats[key];
}
export { mat };

function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  (parent || G.scene).add(m);
  return m;
}

export function addSolid(x0, y0, z0, x1, y1, z1, tag = 'wall') {
  const s = { min: V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), max: V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tag, enabled: true };
  G.solids.push(s);
  return s;
}
// Visible + solid box from min/max corners.
function solidBox(x0, y0, z0, x1, y1, z1, material, tag) {
  const s = addSolid(x0, y0, z0, x1, y1, z1, tag);
  s.mesh = box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return s;
}

let gardenDoor = null, gardenSign = null, functionDoor = null, functionSign = null, carParkGate = null, dartTex = null;
const lights = {};
export let tvScreen = null;

export function buildWorld() {
  const scene = G.scene;
  scene.background = new THREE.Color(0x87b5d9);
  scene.fog = new THREE.Fog(0x87b5d9, 30, 70);

  lights.hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a4030, 1.2);
  scene.add(lights.hemi);
  lights.sun = new THREE.DirectionalLight(0xffe7c4, 1.1);
  lights.sun.position.set(8, 14, 6);
  scene.add(lights.sun);
  lights.amb = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(lights.amb);

  const wood = new THREE.MeshLambertMaterial({ map: woodTexture([6, 6]) });
  const darkWood = mat(0x4a2c17);
  const carpet = new THREE.MeshLambertMaterial({ map: carpetTexture([10, 8]) });
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTexture([8, 1]) });
  const wallMatS = new THREE.MeshLambertMaterial({ map: wallTexture([3, 1]) });
  const grass = new THREE.MeshLambertMaterial({ map: grassTexture([12, 16]) });
  const plaster = mat(0xf2e8d0);

  // Floors
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), carpet);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0); scene.add(floor);
  const barFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 16), wood);
  barFloor.rotation.x = -Math.PI / 2; barFloor.position.set(-8.7, 0.005, 0); scene.add(barFloor);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(12, 16), grass);
  g.rotation.x = -Math.PI / 2; g.position.set(16, 0.002, 0); scene.add(g);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), mat(0x8d8d8d));
  street.rotation.x = -Math.PI / 2; street.position.set(4, -0.001, 11); scene.add(street);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat(0x5d8a45));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);
  const kitchenFloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), mat(0xcfcfcf));
  kitchenFloor.rotation.x = -Math.PI / 2; kitchenFloor.position.set(5.3, 0.003, -9.1); scene.add(kitchenFloor);

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), plaster);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, PUB.h, 0); scene.add(ceil);
  addSolid(-10, PUB.h, -8, 10, PUB.h + 0.5, 8, 'ceiling');

  const H = PUB.h, T = 0.2;
  // North wall with kitchen hatch (x 3.6..7.0, y 1.0..1.9)
  solidBox(-10, 0, -8 - T, -8.8, H, -8, wallMatS);
  solidBox(-7.6, 0, -8 - T, 3.6, H, -8, wallMat);
  solidBox(-8.8, 1.9, -8 - T, -7.6, H, -8, wallMatS, 'header');
  G.beams.push({ min: V(-8.8, 1.9, -8.4), max: V(-7.6, H, -7.8), name: 'function room door' });
  functionDoor = solidBox(-8.8, 0, -8.15, -7.6, 1.9, -8.05, mat(0x6a1b9a), 'door');
  functionDoor.mesh.userData.noMerge = true;
  functionSign = labelSprite('FUNCTION ROOM: CLOSED', { bg: '#6a1b9a', size: 26, scale: 0.16, w: 512 });
  functionSign.position.set(-8.2, 1.5, -7.9); scene.add(functionSign);
  solidBox(3.6, 0, -8 - T, 7.0, 1.0, -8, wallMatS);
  solidBox(3.6, 1.9, -8 - T, 7.0, H, -8, wallMatS);
  solidBox(7.0, 0, -8 - T, 10, H, -8, wallMatS);
  // Kitchen behind hatch
  box(6, H, 0.2, mat(0xdedede), 5.3, H / 2, -10.3);
  box(6, 0.9, 0.7, mat(0xb8b8c0), 5.3, 0.45, -9.8);
  // South wall with front door gap (x -7.6..-6.4)
  solidBox(-10, 0, 8, -7.6, H, 8 + T, wallMatS);
  solidBox(-6.4, 0, 8, 10, H, 8 + T, wallMat);
  solidBox(-7.6, 1.9, 8, -6.4, H, 8 + T, wallMatS, 'header');
  G.beams.push({ min: V(-7.6, 1.9, 7.8), max: V(-6.4, H, 8.4), name: 'door frame' });
  // West wall
  solidBox(-10 - T, 0, -8, -10, H, 8, wallMat);
  // East wall with garden door gap (z -2..-0.5)
  solidBox(10, 0, -8, 10 + T, H, -6.2, wallMatS);
  solidBox(10, 0, -4.7, 10 + T, H, 8, wallMat);
  solidBox(10, 1.95, -6.2, 10 + T, H, -4.7, wallMatS, 'header');
  G.beams.push({ min: V(9.8, 1.95, -6.2), max: V(10.4, H, -4.7), name: 'garden door' });
  gardenDoor = solidBox(10.02, 0, -6.2, 10.18, 1.95, -4.7, mat(0x3c5e3a), 'door');
  gardenSign = labelSprite('CLOSED', { bg: '#7a1d1d', size: 30, scale: 0.25 });
  gardenSign.position.set(9.85, 1.5, -5.45); scene.add(gardenSign);

  // Beams with Mind Your Head signs
  const signTex = textTexture(['MIND YOUR HEAD'], { w: 512, h: 96, bg: '#f2d23c', color: '#111', size: 52, bold: true, font: 'Arial' });
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  for (const z of [-5.6, -0.9, 3.8]) {
    solidBox(-10, BEAM_Y, z - 0.13, 10, BEAM_Y + 0.27, z + 0.13, darkWood, 'beam');
    G.beams.push({ min: V(-10, BEAM_Y, z - 0.13), max: V(10, BEAM_Y + 0.27, z + 0.13), name: 'beam' });
    for (const x of [-6, 0, 6]) for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), signMat);
      s.position.set(x, BEAM_Y + 0.135, z + side * 0.135);
      if (side < 0) s.rotation.y = Math.PI;
      scene.add(s);
    }
  }

  // Windows (glow tinted by time of day)
  lights.windowMat = new THREE.MeshBasicMaterial({ color: 0xbfe3ff });
  for (const x of [-3.5, 1, 6]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), lights.windowMat); w.position.set(x, 1.5, 7.98); w.rotation.y = Math.PI; scene.add(w); }
  for (const z of [3, 6.5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), lights.windowMat); w.position.set(9.98, 1.5, z); w.rotation.y = -Math.PI / 2; scene.add(w); }

  // Bar
  solidBox(-9.0, 0, -6.5, -7.9, 1.1, 1.0, darkWood, 'bar');
  box(1.25, 0.06, 7.6, mat(0x2b1a0e), -8.45, 1.13, -2.75);
  addSolid(-9.02, 1.1, -6.5, -7.88, 1.16, 1.0, 'bar');
  // Back bar shelves + bottles
  box(0.35, 1.6, 7.5, darkWood, -9.8, 1.6, -2.75);
  const bottleCols = [0x2e7d32, 0x8d6e63, 0xffc107, 0x1565c0, 0xc62828, 0xe0e0e0];
  for (let i = 0; i < 36; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 6), mat(bottleCols[i % 6]));
    b.position.set(-9.75, 1.0 + Math.floor(i / 18) * 0.5 + 0.14, -6.2 + (i % 18) * 0.4); scene.add(b);
  }
  // Taps
  for (let i = 0; i < 3; i++) {
    const t = box(0.06, 0.35, 0.06, mat(0xd4af37), -8.35, 1.33, -3.6 + i * 0.3);
    box(0.04, 0.16, 0.08, mat(0x111111), -8.35, 1.55, -3.6 + i * 0.3);
    t.userData.tap = true;
  }
  barLabel('TAPS', FIX.taps); barLabel('WATER', FIX.water); barLabel('MOCKTAILS', FIX.mocktail);
  // Fridge (Monster)
  solidBox(-9.9, 0, 1.4, -9.15, 2.0, 2.2, mat(0x1b1b1b), 'fridge');
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.7), new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.35 }));
  glass.position.set(-9.14, 1.0, 1.8); glass.rotation.y = Math.PI / 2; scene.add(glass);
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), mat(i % 3 ? 0x111111 : 0x7cfc00));
    c.position.set(-9.4, 0.3 + Math.floor(i / 4) * 0.5, 1.6 + (i % 4) * 0.12); scene.add(c);
  }
  barLabel('MONSTER', V(-9.1, 2.2, 1.8));
  // Bar stools
  for (const z of [-6.1, -5.3, -4.5]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), mat(0x7a1d1d)); st.position.set(-7.5, 0.75, z); scene.add(st);
    box(0.06, 0.72, 0.06, mat(0x222222), -7.5, 0.36, z);
  }
  barLabel('TOY BOX', FIX.toybox, true);

  // Kitchen pass + heat lamps + spike
  solidBox(3.6, 0, -8, 7.0, 1.0, -7.3, mat(0x9e9e9e), 'pass');
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7b22, side: THREE.DoubleSide }));
    lamp.position.set(4.1 + i * 0.85, 1.75, -7.65); scene.add(lamp);
  }
  const passLabel = labelSprite('KITCHEN PASS', { bg: '#222', size: 30, scale: 0.18 });
  passLabel.position.set(5.3, 2.05, -7.85); scene.add(passLabel);
  solidBox(2.5, 0, -8, 3.4, 1.0, -7.4, darkWood, 'shelf');
  box(0.02, 0.25, 0.02, mat(0x999999), FIX.spike.x, 1.12, FIX.spike.z);
  box(0.12, 0.02, 0.12, mat(0x333333), FIX.spike.x, 1.01, FIX.spike.z);
  const spikeLabel = labelSprite('TICKET SPIKE', { bg: '#222', size: 30, scale: 0.15 });
  spikeLabel.position.set(FIX.spike.x, 1.45, FIX.spike.z); scene.add(spikeLabel);

  // Doors (decorative)
  doorDecor(0.5, -7.89, 0, 'KITCHEN', 0xbfbfbf);
  doorDecor(8.9, -7.89, 0, 'STAFF ONLY', 0x6d4c41);
  doorDecor(4, 7.89, Math.PI, 'TOILETS', 0x5d7fa3);

  // Host stand
  solidBox(-7.4, 0, 6.0, -6.6, 1.1, 6.5, darkWood, 'host');
  const hostLabel = labelSprite('PLEASE WAIT TO BE SEATED', { bg: '#1d2b22', size: 22, scale: 0.12, w: 512 });
  hostLabel.position.set(-7, 1.45, 6.25); scene.add(hostLabel);

  // Specials board
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({
    map: textTexture(['TODAY\'S SPECIALS', 'Oysters (obviously)', 'Fish & chips £12', 'Sunday roast £14', 'Ronnie\'s protein pie (no)'], { w: 512, h: 384, size: 34, bg: '#1e2b22', border: '#6d4c41' }) }));
  board.position.set(-9.88, 1.6, 5.5); board.rotation.y = Math.PI / 2; scene.add(board);
  // Height chart joke on the wall
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 2.2), new THREE.MeshBasicMaterial({
    map: textTexture(['LEWIS →', '(off the top)', '', '', 'Ronnie', '', 'Ian', '', 'Hollie'], { w: 128, h: 640, size: 18, bg: '#f5f0e0', color: '#333' }) }));
  chart.position.set(9.88, 1.25, -2.5); chart.rotation.y = -Math.PI / 2; scene.add(chart);

  // TV
  solidBox(-4.75, 1.87, -8, -3.25, 2.73, -7.8, mat(0x111111), 'tv');
  tvScreen = dynamicTexture(512, 288);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.79), new THREE.MeshBasicMaterial({ map: tvScreen.tex }));
  screen.position.set(-4, 2.3, -7.79); scene.add(screen);

  // Ball pit + dessert trolley + fruit machine
  solidBox(0.7, 0, 5.8, 2.3, 0.15, 7.0, mat(0x1976d2), 'ballpit-floor');
  for (const [x0, z0, x1, z1] of [[0.7, 5.8, 2.3, 5.9], [0.7, 6.9, 2.3, 7.0], [0.7, 5.8, 0.8, 7.0], [2.2, 5.8, 2.3, 7.0]]) solidBox(x0, 0, z0, x1, 0.55, z1, mat(0x1976d2), 'ballpit');
  const ballCols = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5];
  const ballGeo = new THREE.SphereGeometry(0.07, 6, 5);
  for (let i = 0; i < 70; i++) { const b = new THREE.Mesh(ballGeo, mat(ballCols[i % 4])); b.position.set(0.85 + Math.random() * 1.3, 0.2 + Math.random() * 0.25, 5.95 + Math.random() * 0.9); scene.add(b); }
  const bpLabel = labelSprite('KIDS CORNER', { bg: '#1976d2', size: 30, scale: 0.15 });
  bpLabel.position.set(1.5, 1.0, 6.95); scene.add(bpLabel);
  solidBox(-3.0, 0, 5.95, -2.0, 0.8, 6.65, mat(0xb0b0b0), 'trolley');
  for (let i = 0; i < 4; i++) { const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10), mat([0xf8bbd0, 0x6d4c41, 0xfff59d, 0xffffff][i])); cake.position.set(-2.8 + i * 0.2, 0.86, 6.3); scene.add(cake); }
  const trLabel = labelSprite('DESSERTS', { bg: '#ad1457', size: 30, scale: 0.13 });
  trLabel.position.set(-2.5, 1.25, 6.3); scene.add(trLabel);
  solidBox(9.2, 0, 1.6, 9.9, 1.8, 2.4, mat(0x6a1b9a), 'fruit');
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), new THREE.MeshBasicMaterial({ map: textTexture(['🍒 🍋 🔔', 'FRUITS'], { w: 256, h: 192, size: 40, bg: '#ffeb3b', color: '#6a1b9a' }) }));
  fm.position.set(9.19, 1.3, 2.0); fm.rotation.y = -Math.PI / 2; scene.add(fm);

  // Golden oyster hall-of-fame + photo wall (decor)
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({
    map: textTexture(['EMPLOYEE OF THE MONTH', '(Ronnie, somehow)'], { w: 512, h: 288, size: 34, bg: '#3e2723', border: '#d4af37' }) }));
  photo.position.set(-1.5, 1.6, 7.88); photo.rotation.y = Math.PI; scene.add(photo);
  G.eomMat = photo.material; G.eomDefault = photo.material.map;

  buildTables();
  buildGarden();
  buildCarPark();
  buildFunctionRoom(wallMat, darkWood);
  buildStreet();
  defineZones();
  gardenDoor.mesh.userData.noMerge = true;
  mergeStatic();
  setGardenOpen(false);
}

// Merge all static scenery into one mesh per material (far fewer draw calls for the Quest).
function mergeStatic() {
  G.scene.updateMatrixWorld(true);
  const byMat = new Map(), remove = [];
  G.scene.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    for (let a = o; a; a = a.parent) if (a.userData.noMerge || a === G.rig || a === G.dynamicRoot) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
    remove.push(o);
  });
  remove.forEach((o) => o.parent.remove(o));
  for (const [m, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (merged) { const mm = new THREE.Mesh(merged, m); G.scene.add(mm); (G.staticMeshes ||= []).push(mm); }
    else console.warn('merge failed for material', m);
  }
}

function barLabel(text, pos, small) {
  const l = labelSprite(text, { bg: '#2b1a0e', size: 30, scale: small ? 0.12 : 0.13 });
  l.position.set(pos.x + 0.05, pos.y + 0.5, pos.z); G.scene.add(l);
}

function doorDecor(x, z, rot, label, color) {
  const d = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), mat(color));
  d.position.set(x, 0.95, z); d.rotation.y = rot; G.scene.add(d);
  const l = labelSprite(label, { bg: '#222', size: 30, scale: 0.12 });
  l.position.set(x, 1.7, z + (rot ? -0.05 : 0.05)); G.scene.add(l);
}

function buildTables() {
  const top = mat(0x6b3f1f), leg = mat(0x3b2412), chairM = mat(0x5d3a1a), bench = mat(0x8d6e4b);
  [top, leg, chairM, bench].forEach((m) => { m.userData.mr = true; });
  for (const def of TABLE_DEFS) {
    const hw = def.w / 2, hd = def.d / 2, h = 0.76;
    def.top = h;
    def.solid = addSolid(def.x - hw, 0, def.z - hd, def.x + hw, h, def.z + hd, 'table');
    def.group = new THREE.Group();
    G.scene.add(def.group);
    const t = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.05, def.d), def.picnic ? bench : top);
    t.position.set(def.x, h - 0.025, def.z); def.group.add(t);
    if (def.picnic) {
      for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.05, 0.3), bench); b.position.set(def.x, 0.45, def.z + s * (hd + 0.35)); def.group.add(b); }
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), leg);
      l.position.set(def.x + sx * (hw - 0.08), h / 2, def.z + sz * (hd - 0.08)); def.group.add(l);
    }
    // Seats: [x, z, yaw facing table]
    const seats = [];
    const off = 0.42;
    const add = (x, z) => seats.push({ pos: V(x, 0, z), yaw: Math.atan2(def.x - x, def.z - z), taken: null });
    if (def.seats === 1) add(def.x + hw + off, def.z);
    else if (def.seats === 2) { add(def.x, def.z - hd - off); add(def.x, def.z + hd + off); }
    else if (def.seats === 4 && !def.picnic) { add(def.x, def.z - hd - off); add(def.x, def.z + hd + off); add(def.x - hw - off, def.z); add(def.x + hw + off, def.z); }
    else if (def.picnic) { for (const s of [-1, 1]) for (const k of [-0.45, 0.45]) add(def.x + k, def.z + s * (hd + 0.35)); }
    else if (def.seats === 6) { for (const s of [-1, 1]) for (const k of [-0.75, 0, 0.75]) add(def.x + k, def.z + s * (hd + off)); }
    else if (def.seats === 8) {
      for (const s of [-1, 1]) for (const k of [-0.85, 0, 0.85]) add(def.x + k, def.z + s * (hd + off));
      add(def.x - hw - off, def.z); add(def.x + hw + off, def.z);
    }
    def.seatList = seats;
    if (!def.picnic) for (const s of seats) {
      const c = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), chairM); seat.position.y = 0.45; c.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.05), chairM); back.position.set(0, 0.72, -0.2); c.add(back);
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), leg); l.position.set(lx, 0.225, lz); c.add(l); }
      c.position.copy(s.pos); c.rotation.y = s.yaw; def.group.add(c);
      s.chair = c; s.chairHome = { pos: s.pos.clone(), yaw: s.yaw };
    }
    if (typeof def.id === 'number') {
      const n = labelSprite(String(def.id), { bg: '#f5f0e0', color: '#3b2412', size: 40, stroke: 0, scale: 0.16, w: 64, h: 64 });
      n.position.set(def.x, h + 0.12, def.z); def.group.add(n);
    } else if (def.id === 'ian') {
      const n = labelSprite('RESERVED: IAN', { bg: '#3b3f24', size: 26, scale: 0.1 });
      n.position.set(def.x, h + 0.12, def.z); def.group.add(n);
    }
  }
}

function buildGarden() {
  const hedge = mat(0x2e5a2a), fence = mat(0x8d6e4b);
  // Hedge east (with a gate to the car park), fences north/south
  solidBox(21.9, 0, -8, 22.6, 1.6, 4.8, hedge, 'hedge');
  solidBox(21.9, 0, 6.6, 22.6, 1.6, 8, hedge, 'hedge');
  carParkGate = solidBox(22.15, 0, 4.8, 22.35, 1.3, 6.6, mat(0x6d4c41), 'gate');
  carParkGate.mesh.userData.noMerge = true;
  solidBox(10, 0, -8.3, 22, 1.1, -8.05, fence, 'fence');
  solidBox(10, 0, 8.05, 22, 1.1, 8.3, fence, 'fence');
  // Invisible tall walls to keep balls in the garden
  addSolid(21.9, 1.6, -8.5, 23, 7, 8.5, 'invisible');
  addSolid(10, 1.1, -8.6, 22, 7, -8.05, 'invisible');
  addSolid(10, 1.1, 8.05, 22, 7, 8.6, 'invisible');
  // Two bin goals (pitch runs east-west)
  const binM = mat(0x2e7d32), postM = mat(0xeeeeee);
  for (const gl of FIX.goals) {
    const { x, z, w, h, dir } = gl;
    for (const s of [-1, 1]) solidBox(x - 0.25, 0, z + s * w / 2 - 0.25, x + 0.25, 1.0, z + s * w / 2 + 0.25, binM, 'post');
    solidBox(x - 0.05, h, z - w / 2, x + 0.05, h + 0.1, z + w / 2, postM, 'post');
    const net = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    net.position.set(x + dir * 0.35, h / 2, z); net.rotation.y = Math.PI / 2; G.scene.add(net);
    const l = labelSprite(gl.name, { bg: '#2e7d32', size: 30, scale: 0.2 });
    l.position.set(x, 1.6, z); G.scene.add(l);
  }
  // Pitch lines
  const lineM = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  for (const [w, d, x, z] of [[10.6, 0.06, 16, -5], [10.6, 0.06, 16, 5], [0.06, 10, 16, 0]]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.01, z); G.scene.add(l);
  }
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), lineM); spot.rotation.x = -Math.PI / 2; spot.position.set(FIX.penaltySpot.x, 0.011, FIX.penaltySpot.z); G.scene.add(spot);
  // Duck pond
  const pond = new THREE.Mesh(new THREE.CircleGeometry(FIX.pondR, 20), new THREE.MeshLambertMaterial({ color: 0x3f7fbf, transparent: true, opacity: 0.85 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(FIX.pondC.x, 0.02, FIX.pondC.z); G.scene.add(pond);
  for (let i = 0; i < 3; i++) {
    const duck = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xffeb3b)); b.scale.set(1.3, 0.8, 1); duck.add(b);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xffeb3b)); hd.position.set(0.12, 0.1, 0); duck.add(hd);
    duck.position.set(FIX.pondC.x, 0.08, FIX.pondC.z);
    duck.userData.phase = i * 2; duck.userData.noMerge = true; G.scene.add(duck);
    (G.ducks ||= []).push(duck);
  }
  // Bins (big wheelie bins on the south fence)
  for (let i = 0; i < 2; i++) solidBox(12 + i * 0.85, 0, 7.3, 12.7 + i * 0.85, 1.0, 7.9, mat(0x37474f), 'bin');
  const bl = labelSprite('BINS', { bg: '#37474f', size: 30, scale: 0.15 });
  bl.position.set(12.75, 1.4, 7.6); G.scene.add(bl);
  // BBQ (used in the summer shift)
  solidBox(15.2, 0, 7.2, 16.4, 0.9, 7.9, mat(0x222222), 'bbq');
  // Trees
  for (const [tx, tz] of [[20.8, -7.2], [10.9, 7.3], [17.6, 7.4]]) {
    box(0.25, 2.2, 0.25, mat(0x5d4037), tx, 1.1, tz);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(0x3e7a35)); leaves.position.set(tx, 2.9, tz); G.scene.add(leaves);
  }
}

function buildCarPark() {
  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 16), mat(0x4a4a4a));
  tarmac.rotation.x = -Math.PI / 2; tarmac.position.set(28.3, 0.004, 0); G.scene.add(tarmac);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
  for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4), lineM); l.rotation.x = -Math.PI / 2; l.position.set(28 + i * 1.3, 0.01, -5.5); G.scene.add(l); }
  // Ian's van (solid now: it's the finale arena centrepiece)
  const van = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 4.4), mat(0xf5f5f5)); body.position.y = 1.3; van.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.9, 1.0), mat(0x90caf9)); cab.position.set(0, 1.6, 2.3); van.add(cab);
  for (const [wx, wz] of [[-1, -1.5], [1, -1.5], [-1, 1.6], [1, 1.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10), mat(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.35, wz); van.add(w); }
  for (let i = 0; i < 5; i++) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.5, 4), mat(0x222222)); rod.rotation.x = Math.PI / 2; rod.position.set(-0.8 + i * 0.4, 2.3, 0); van.add(rod); }
  const vl = labelSprite("IAN'S VAN", { bg: '#3b3f24', size: 30, scale: 0.3 });
  vl.position.set(0, 3.0, 0); van.add(vl);
  van.position.set(26, 0, -2); G.scene.add(van);
  addSolid(25, 0, -4.2, 27, 2.25, 0.8, 'van');
  // Bait cooler at the back of the van
  solidBox(25.6, 0, -4.9, 26.4, 0.5, -4.4, mat(0x1e88e5), 'cooler');
  const cl = labelSprite('BAIT + COOLER', { bg: '#1e88e5', size: 26, scale: 0.12 });
  cl.position.set(26, 0.9, -4.65); G.scene.add(cl);
  // The skip (throw the fishing club in it)
  solidBox(30.2, 0, 3.8, 32.6, 0.15, 6.2, mat(0xf9a825), 'skip-floor');
  for (const [x0, z0, x1, z1] of [[30.2, 3.8, 32.6, 3.95], [30.2, 6.05, 32.6, 6.2], [30.2, 3.8, 30.35, 6.2], [32.45, 3.8, 32.6, 6.2]]) solidBox(x0, 0, z0, x1, 1.1, z1, mat(0xf9a825), 'skip');
  const sl = labelSprite('SKIP', { bg: '#f9a825', color: '#222', size: 30, scale: 0.18 });
  sl.position.set(31.4, 1.6, 5); G.scene.add(sl);
  // Fences
  solidBox(22.6, 0, -8.3, 34, 1.4, -8.05, mat(0x8d6e4b), 'fence');
  solidBox(22.6, 0, 8.05, 34, 1.4, 8.3, mat(0x8d6e4b), 'fence');
  solidBox(33.9, 0, -8.3, 34.2, 1.4, 8.3, mat(0x8d6e4b), 'fence');
  addSolid(22.6, 1.4, -8.6, 34.5, 7, -8.05, 'invisible');
  addSolid(22.6, 1.4, 8.05, 34.5, 7, 8.6, 'invisible');
  addSolid(33.9, 1.4, -8.6, 34.6, 7, 8.6, 'invisible');
  for (const x of [24, 32]) { box(0.1, 4, 0.1, mat(0x333333), x, 2, 7.8); }
}

function buildFunctionRoom(wallMat, darkWood) {
  const H = PUB.h, T = 0.2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(11, 6), new THREE.MeshLambertMaterial({ map: woodTexture([5, 3]) }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(-4.5, 0.004, -11); G.scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(11, 6), mat(0xf2e8d0));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(-4.5, H, -11); G.scene.add(ceil);
  addSolid(-10, H, -14, 1, H + 0.5, -8, 'ceiling');
  solidBox(-10, 0, -14 - T, 1, H, -14, wallMat);
  solidBox(-10 - T, 0, -14, -10, H, -8, wallMat);
  solidBox(1, 0, -14, 1 + T, H, -8.2, wallMat);
  // Bunting
  const cols = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047];
  for (let i = 0; i < 22; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 3), mat(cols[i % 4])); f.rotation.x = Math.PI; f.position.set(-9.6 + i * 0.48, 2.5, -11); G.scene.add(f); }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), new THREE.MeshBasicMaterial({ map: textTexture(['FUNCTION ROOM'], { w: 512, h: 86, size: 52, bg: '#6a1b9a', color: '#fff59d' }) }));
  banner.position.set(-4.5, 2.3, -13.88); G.scene.add(banner);
  // Pool table
  const { x, z, w, d } = FIX.pool;
  solidBox(x - w / 2, 0, z - d / 2, x + w / 2, FIX.pool.top, z + d / 2, mat(0x1b5e20), 'pooltable');
  const rail = mat(0x4e342e), r = 0.08, rh = FIX.pool.top + 0.06;
  solidBox(x - w / 2 - r, 0, z - d / 2 - r, x + w / 2 + r, rh, z - d / 2, rail, 'cushion');
  solidBox(x - w / 2 - r, 0, z + d / 2, x + w / 2 + r, rh, z + d / 2 + r, rail, 'cushion');
  solidBox(x - w / 2 - r, 0, z - d / 2, x - w / 2, rh, z + d / 2, rail, 'cushion');
  solidBox(x + w / 2, 0, z - d / 2, x + w / 2 + r, rh, z + d / 2, rail, 'cushion');
  for (const p of FIX.pockets()) { const pk = new THREE.Mesh(new THREE.CircleGeometry(0.075, 10), mat(0x050505)); pk.rotation.x = -Math.PI / 2; pk.position.set(p.x, FIX.pool.top + 0.003, p.z); G.scene.add(pk); }
  const pl = labelSprite('POOL', { bg: '#1b5e20', size: 30, scale: 0.15 });
  pl.position.set(x, 1.5, z - d / 2 - 0.2); G.scene.add(pl);
  // Dartboard
  addSolid(-10.0, 1.48, FIX.dart.z - 0.25, -9.93, 1.98, FIX.dart.z + 0.25, 'dartboard');
  dartTex = dynamicTexture(256, 256);
  drawDartboard(dartTex.ctx); dartTex.tex.needsUpdate = true;
  const board = new THREE.Mesh(new THREE.CircleGeometry(0.23, 32), new THREE.MeshBasicMaterial({ map: dartTex.tex }));
  board.position.set(-9.925, FIX.dart.y, FIX.dart.z); board.rotation.y = Math.PI / 2; G.scene.add(board);
  const oche = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1), new THREE.MeshBasicMaterial({ color: 0xd32f2f }));
  oche.rotation.x = -Math.PI / 2; oche.position.set(-7.63, 0.01, FIX.dart.z); G.scene.add(oche);
  const dl = labelSprite('DARTS (throw from the red line)', { bg: '#222', size: 24, scale: 0.12, w: 512 });
  dl.position.set(-9.85, 2.25, FIX.dart.z); G.scene.add(dl);
  // Karaoke stage + jukebox
  solidBox(-1.4, 0, -13.9, 0.9, 0.16, -12.1, mat(0x311b92), 'stage');
  box(0.03, 1.4, 0.03, mat(0x222222), -0.25, 0.86, -12.6);
  const kl = labelSprite('KARAOKE', { bg: '#311b92', size: 30, scale: 0.16 });
  kl.position.set(-0.25, 2.2, -13.6); G.scene.add(kl);
  solidBox(0.3, 0, -9.6, 0.95, 1.4, -8.7, mat(0xad1457), 'jukebox');
  const jb = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshBasicMaterial({ map: textTexture(['JUKEBOX', '♪ ♫ ♪'], { w: 256, h: 192, size: 36, bg: '#ffca28', color: '#ad1457' }) }));
  jb.position.set(0.29, 1.05, -9.15); jb.rotation.y = -Math.PI / 2; G.scene.add(jb);
  // Decor: Ronnie Simulator poster, school photo wall, fantasy league board, keepie record board
  wallPoster(['RONNIE SIMULATOR', 'Coming soon', '(he is still', 'warming up)'], -9.88, 1.5, -9.2, Math.PI / 2, '#b71c1c');
  wallPoster(['THE LADS · SCHOOL DAYS', 'Tommy · Harry H · Aidan', 'Noah · Oliver · Dylan', '+ a very tall Lewis'], -6, 1.6, -13.88, 0, '#3e2723');
  wallPoster(['OYSTERFLEET FANTASY LEAGUE', '1. Noah  2. Tommy  3. Dylan', '4. Oliver  5. Aidan  6. Harry H', '7. Ronnie (picked himself)'], -2.8, 1.6, -13.88, 0, '#1e2b22');
}

function wallPoster(lines, x, y, z, rotY, bg) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ map: textTexture(lines, { w: 512, h: 320, size: 32, bg, border: '#e8c96a' }) }));
  m.position.set(x, y, z); m.rotation.y = rotY; G.scene.add(m);
  return m;
}

const DART_SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
function drawDartboard(x) {
  const c = 128;
  x.fillStyle = '#111'; x.fillRect(0, 0, 256, 256);
  const ring = (r0, r1, colA, colB) => {
    for (let i = 0; i < 20; i++) {
      const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI / 10), a1 = a0 + Math.PI / 10;
      x.beginPath(); x.arc(c, c, r1, a0, a1); x.arc(c, c, r0, a1, a0, true); x.closePath();
      x.fillStyle = i % 2 ? colB : colA; x.fill();
    }
  };
  ring(0, 118, '#f5e6c8', '#111');
  ring(100, 112, '#c62828', '#2e7d32');
  ring(58, 68, '#c62828', '#2e7d32');
  x.fillStyle = '#2e7d32'; x.beginPath(); x.arc(c, c, 14, 0, 7); x.fill();
  x.fillStyle = '#c62828'; x.beginPath(); x.arc(c, c, 6, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 12px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  DART_SECTORS.forEach((n, i) => { const a = -Math.PI / 2 + i * Math.PI / 10; x.fillText(n, c + Math.cos(a) * 123, c + Math.sin(a) * 123); });
}
// Score for a hit at local board coords (u right, v up) in metres from the bull.
export function dartScore(u, v) {
  const r = Math.hypot(u, v) / 0.23 * 118; // in texture px
  if (r > 112) return { score: 0, label: 'Missed the board!' };
  if (r < 6) return { score: 50, label: 'BULLSEYE!' };
  if (r < 14) return { score: 25, label: 'Outer bull: 25' };
  let a = Math.atan2(-v, u) + Math.PI / 2; // 0 at top, clockwise
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const n = DART_SECTORS[Math.round(a / (Math.PI / 10)) % 20];
  if (r > 100) return { score: n * 2, label: `Double ${n}!` };
  if (r > 58 && r < 68) return { score: n * 3, label: `Treble ${n}!` };
  return { score: n, label: String(n) };
}
export function markDart(u, v) {
  const x = dartTex.ctx, c = 128, k = 118 / 0.23;
  x.fillStyle = '#ffeb3b'; x.beginPath(); x.arc(c + u * k, c - v * k, 3, 0, 7); x.fill();
  dartTex.tex.needsUpdate = true;
}
export function clearDartboard() { drawDartboard(dartTex.ctx); dartTex.tex.needsUpdate = true; }

function buildStreet() {

  // Keep the street enclosed
  addSolid(-12, 0, 11.2, 12, 7, 11.6, 'invisible');
  addSolid(-10.6, 0, 8, -10.2, 7, 11.6, 'invisible');
  addSolid(10.2, 0, 8, 10.6, 7, 11.6, 'invisible');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({
    map: textTexture(['THE OYSTERFLEET'], { w: 512, h: 112, size: 64, bg: '#1d3b2a', color: '#e8c96a', border: '#e8c96a' }) }));
  sign.position.set(-4, 2.4, 8.22); G.scene.add(sign);
  for (const x of [-9, 0, 9]) { box(0.08, 3, 0.08, mat(0x333333), x, 1.5, 11); }
}

function defineZones() {
  const Z = (name, label, x0, y0, z0, x1, y1, z1, points, ach) => G.zones.push({ name, label, min: V(x0, y0, z0), max: V(x1, y1, z1), points, ach });
  Z('ballpit', 'Into the ball pit!', 0.7, 0, 5.8, 2.3, 1.2, 7.0, 30);
  Z('trolley', 'Into the dessert trolley!', -3.1, 0, 5.85, -1.9, 1.6, 6.75, 45, 'trolley');
  Z('pond', 'Into the duck pond!', 18.5, -1, 5.3, 20.9, 0.6, 7.7, 45, 'pond');
  Z('bins', 'BINNED!', 11.8, 0, 7.0, 13.8, 1.8, 8.0, 35);
  Z('fruit', 'Into the fruit machine! JACKPOT!', 9.0, 0, 1.4, 10, 2, 2.6, 30);
  Z('skip', 'INTO THE SKIP!', 30.2, -0.5, 3.8, 32.6, 1.6, 6.2, 40, 'skip');
  Z('pooltable', 'Laid out on the pool table!', -6.5, 0.6, -11.5, -4.5, 1.6, -10.5, 25);
  Z('stage', 'Thrown on stage! Encore!', -1.4, 0, -13.9, 0.9, 1.0, -12.1, 20);
}

export const LIGHTS = lights;
// Mixed reality: hide the building, keep the furniture (tables in your living room).
const mrHidden = [];
export function setMixedReality(on) {
  if (on) {
    G.scene.traverse((o) => { if (o.isMesh && o.parent === G.scene && !o.material?.userData?.mr && (G.staticMeshes || []).includes(o)) { mrHidden.push(o); o.visible = false; } });
    G.scene.traverse((o) => { if (o.isMesh && o.parent === G.scene && o.geometry?.type === 'PlaneGeometry' && !(G.staticMeshes || []).includes(o) && o.visible) { mrHidden.push(o); o.visible = false; } });
    G.mrSavedBg = G.scene.background; G.scene.background = null; G.scene.fog.near = 999; G.scene.fog.far = 1000;
  } else {
    mrHidden.forEach((o) => { o.visible = true; }); mrHidden.length = 0;
    if (G.mrSavedBg) G.scene.background = G.mrSavedBg; G.scene.fog.near = 30; G.scene.fog.far = 70;
  }
}
export function setDim(on, level = 0.06) {
  if (on) { if (!lights.saved) lights.saved = [lights.hemi.intensity, lights.amb.intensity, lights.sun.intensity]; lights.hemi.intensity = level; lights.amb.intensity = level / 2; lights.sun.intensity = level; }
  else if (lights.saved) { [lights.hemi.intensity, lights.amb.intensity, lights.sun.intensity] = lights.saved; lights.saved = null; }
}

export function setFunctionOpen(open) {
  G.functionOpen = open;
  functionDoor.enabled = !open; functionDoor.mesh.visible = !open; functionSign.visible = !open;
  buildNav();
}
export function setCarParkOpen(open) {
  G.carParkOpen = open;
  carParkGate.enabled = !open; carParkGate.mesh.visible = !open;
  buildNav();
}

export function setGardenOpen(open) {
  G.gardenOpen = open;
  gardenDoor.enabled = !open;
  gardenDoor.mesh.visible = !open;
  gardenSign.visible = !open;
  buildNav();
}

// Time of day: hour 11..23
export function setTimeOfDay(hour) {
  lights.saved = null;
  const t = clamp((hour - 11) / 11, 0, 1);
  const day = new THREE.Color(0x87b5d9), dusk = new THREE.Color(0xf0905a), night = new THREE.Color(0x121a33);
  const c = t < 0.6 ? day.clone().lerp(dusk, t / 0.6) : dusk.clone().lerp(night, (t - 0.6) / 0.4);
  G.scene.background = c; G.scene.fog.color = c;
  lights.windowMat.color.copy(c).lerp(new THREE.Color(0xffffff), 0.3);
  lights.sun.intensity = 1.1 * (1 - t * 0.8);
  lights.hemi.intensity = 1.0 + (1 - t) * 0.3;
  lights.amb.intensity = 0.25 + t * 0.15;
}

// --- Collision -------------------------------------------------------------
const _c = V(), _d = V(), _n = V();
// Sphere vs world (items/ball). Mutates p and v. Returns hit info.
export function collideSphere(p, v, r, bounce = 0.3, fric = 0.85) {
  let impact = 0, ground = false, tag = null;
  if (p.y < r) {
    p.y = r;
    if (v.y < 0) { impact = -v.y; v.y = -v.y * bounce; if (v.y < 0.4) v.y = 0; }
    ground = true; tag = 'floor';
  }
  for (const s of G.solids) {
    if (!s.enabled) continue;
    if (p.x + r < s.min.x || p.x - r > s.max.x || p.y + r < s.min.y || p.y - r > s.max.y || p.z + r < s.min.z || p.z - r > s.max.z) continue;
    _c.set(clamp(p.x, s.min.x, s.max.x), clamp(p.y, s.min.y, s.max.y), clamp(p.z, s.min.z, s.max.z));
    _d.subVectors(p, _c);
    let dist = _d.length(), pen;
    if (dist > 1e-6) { _n.copy(_d).multiplyScalar(1 / dist); pen = r - dist; }
    else {
      // Centre inside box: push out along smallest axis
      const opts = [[p.x - s.min.x, -1, 0, 0], [s.max.x - p.x, 1, 0, 0], [p.y - s.min.y, 0, -1, 0], [s.max.y - p.y, 0, 1, 0], [p.z - s.min.z, 0, 0, -1], [s.max.z - p.z, 0, 0, 1]];
      opts.sort((a, b) => a[0] - b[0]);
      _n.set(opts[0][1], opts[0][2], opts[0][3]); pen = opts[0][0] + r;
    }
    if (pen <= 0) continue;
    p.addScaledVector(_n, pen);
    const vn = v.dot(_n);
    if (vn < 0) {
      if (-vn > impact) { impact = -vn; tag = s.tag; }
      v.addScaledVector(_n, -(1 + bounce) * vn);
      if (_n.y > 0.7 && Math.abs(v.y) < 0.4) v.y = 0;
    }
    if (_n.y > 0.7) { ground = true; if (!tag) tag = s.tag; }
  }
  if (ground) { v.x *= fric; v.z *= fric; }
  return { impact, ground, tag };
}

// Verlet particle vs world. p = position, o = previous position.
export function collideParticle(p, o, r, fric = 0.6) {
  let hit = 0, hitTag = null;
  if (p.y < r) {
    const vy = p.y - o.y;
    p.y = r;
    o.y = p.y + vy * 0.25; // small bounce
    o.x += (p.x - o.x) * fric; o.z += (p.z - o.z) * fric;
    hit = Math.max(hit, -vy); hitTag = 'floor';
  }
  for (const s of G.solids) {
    if (!s.enabled) continue;
    if (p.x + r < s.min.x || p.x - r > s.max.x || p.y + r < s.min.y || p.y - r > s.max.y || p.z + r < s.min.z || p.z - r > s.max.z) continue;
    _c.set(clamp(p.x, s.min.x, s.max.x), clamp(p.y, s.min.y, s.max.y), clamp(p.z, s.min.z, s.max.z));
    _d.subVectors(p, _c);
    let dist = _d.length(), pen;
    if (dist > 1e-6) { _n.copy(_d).multiplyScalar(1 / dist); pen = r - dist; }
    else {
      const opts = [[p.x - s.min.x, -1, 0, 0], [s.max.x - p.x, 1, 0, 0], [p.y - s.min.y, 0, -1, 0], [s.max.y - p.y, 0, 1, 0], [p.z - s.min.z, 0, 0, -1], [s.max.z - p.z, 0, 0, 1]];
      opts.sort((a, b) => a[0] - b[0]);
      _n.set(opts[0][1], opts[0][2], opts[0][3]); pen = opts[0][0] + r;
    }
    if (pen <= 0) continue;
    p.addScaledVector(_n, pen);
    if (_n.y > 0.6) { o.x += (p.x - o.x) * fric; o.z += (p.z - o.z) * fric; }
    hit = Math.max(hit, pen); hitTag = s.tag;
  }
  return hitTag;
}

// Player (circle in XZ) vs solids that block walking.
export function collidePlayer(p, r) {
  let hit = false;
  for (const s of G.solids) {
    if (!s.enabled || s.min.y > 1.2 || s.max.y < 0.2) continue;
    const cx = clamp(p.x, s.min.x, s.max.x), cz = clamp(p.z, s.min.z, s.max.z);
    let dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
    else {
      const opts = [[p.x - s.min.x, -1, 0], [s.max.x - p.x, 1, 0], [p.z - s.min.z, 0, -1], [s.max.z - p.z, 0, 1]].sort((a, b) => a[0] - b[0]);
      p.x += opts[0][1] * (opts[0][0] + r); p.z += opts[0][2] * (opts[0][0] + r);
    }
    hit = true;
  }
  // Hard world bounds
  p.x = clamp(p.x, -9.75, G.carParkOpen ? 33.7 : G.gardenOpen ? 21.6 : 9.75);
  p.z = clamp(p.z, G.functionOpen ? -13.75 : -7.75, 11);
  if (p.z < -8 && p.x > 0.75) p.x = 0.75;
  if (p.x > 10.1 && (p.z > 7.75)) p.z = 7.75;
  return hit;
}

export function zoneAt(p) {
  for (const z of G.zones) {
    if (p.x > z.min.x && p.x < z.max.x && p.y > z.min.y && p.y < z.max.y && p.z > z.min.z && p.z < z.max.z) return z;
  }
  return null;
}
export const inGarden = (p) => p.x > 10.2;
export const inPub = (p) => p.x > -10 && p.x < 10 && p.z > -8 && p.z < 8;

// --- Navigation grid + A* --------------------------------------------------
const NAV = { x0: -10, z0: -14.2, cell: 0.4, cols: 112, rows: 64, blocked: null };
function cellOf(x, z) { return [Math.floor((x - NAV.x0) / NAV.cell), Math.floor((z - NAV.z0) / NAV.cell)]; }
function cellCenter(i, j) { return V(NAV.x0 + (i + 0.5) * NAV.cell, 0, NAV.z0 + (j + 0.5) * NAV.cell); }
function isBlocked(i, j) { return i < 0 || j < 0 || i >= NAV.cols || j >= NAV.rows || NAV.blocked[j * NAV.cols + i]; }

export function buildNav() {
  NAV.blocked = new Uint8Array(NAV.cols * NAV.rows);
  const inf = 0.24;
  for (let j = 0; j < NAV.rows; j++) for (let i = 0; i < NAV.cols; i++) {
    const c = cellCenter(i, j);
    let b = false;
    // Outside the walkable areas
    const inPubArea = c.x > -10 && c.x < 10 && c.z > -8 && c.z < 8;
    const inGardenArea = c.x > 10 && c.x < 21.9 && c.z > -8 && c.z < 8;
    const inStreet = c.z > 8 && c.z < 11.2 && c.x > -10.2 && c.x < 10.2;
    const inFunction = c.x > -10 && c.x < 1 && c.z > -14 && c.z < -8;
    const inCarPark = c.x > 22 && c.x < 33.9 && c.z > -8 && c.z < 8;
    if (!inPubArea && !inGardenArea && !inStreet && !inFunction && !inCarPark) b = true;
    if (!b) for (const s of G.solids) {
      if (!s.enabled || s.min.y > 1.0 || s.max.y < 0.1 || s.tag === 'invisible') continue;
      if (c.x > s.min.x - inf && c.x < s.max.x + inf && c.z > s.min.z - inf && c.z < s.max.z + inf) { b = true; break; }
    }
    NAV.blocked[j * NAV.cols + i] = b ? 1 : 0;
  }
}

function nearestFree(i, j) {
  if (!isBlocked(i, j)) return [i, j];
  for (let r = 1; r < 8; r++) {
    let best = null, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (!isBlocked(i + di, j + dj)) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; } }
    }
    if (best) return best;
  }
  return [i, j];
}

function lineFree(a, b) {
  const d = a.distanceTo(b), n = Math.ceil(d / 0.15);
  for (let k = 1; k < n; k++) {
    const x = a.x + (b.x - a.x) * (k / n), z = a.z + (b.z - a.z) * (k / n);
    const [i, j] = cellOf(x, z);
    if (isBlocked(i, j)) return false;
  }
  return true;
}

export function findPath(from, to) {
  let [si, sj] = nearestFree(...cellOf(from.x, from.z));
  let [gi, gj] = nearestFree(...cellOf(to.x, to.z));
  const N = NAV.cols * NAV.rows;
  const gScore = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const start = sj * NAV.cols + si, goal = gj * NAV.cols + gi;
  const heap = [[0, start]];
  gScore[start] = 0;
  const h = (k) => { const i = k % NAV.cols, j = (k / NAV.cols) | 0; const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  let found = false, iter = 0;
  while (heap.length && iter++ < 20000) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) { found = true; break; }
    const i = k % NAV.cols, j = (k / NAV.cols) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (isBlocked(ni, nj)) continue;
      if (di && dj && (isBlocked(i + di, j) || isBlocked(i, j + dj))) continue;
      const nk = nj * NAV.cols + ni;
      const g2 = gScore[k] + (di && dj ? 1.414 : 1);
      if (g2 < gScore[nk]) { gScore[nk] = g2; came[nk] = k; push(g2 + h(nk), nk); }
    }
  }
  if (!found) return [to.clone()];
  const cells = [];
  for (let k = goal; k !== -1 && k !== start; k = came[k]) cells.push(cellCenter(k % NAV.cols, (k / NAV.cols) | 0));
  cells.reverse();
  cells.push(to.clone().setY(0));
  // String-pull smoothing
  const out = [];
  let anchor = from.clone().setY(0), idx = 0;
  while (idx < cells.length) {
    let far = idx;
    for (let k = cells.length - 1; k > idx; k--) if (lineFree(anchor, cells[k])) { far = k; break; }
    out.push(cells[far]); anchor = cells[far]; idx = far + 1;
  }
  return out;
}

// Duck bobbing, TV, etc.
export function updateWorld(t) {
  if (G.ducks) G.ducks.forEach((d) => { const ph = d.userData.phase + t * 0.3; d.position.x = FIX.pondC.x + Math.cos(ph) * 0.7; d.position.z = FIX.pondC.z + Math.sin(ph) * 0.7; d.rotation.y = -ph; });
}
