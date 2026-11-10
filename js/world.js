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
  wine: V(-8.35, 1.1, -2.35),
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
  goals: [{ x: 30.4, z: -15.25, w: 2.8, h: 1.4, dir: 1, name: 'EAST GOAL' }, { x: 11.6, z: -15.25, w: 2.8, h: 1.4, dir: -1, name: 'WEST GOAL' }],
  penaltySpot: V(27.0, 0, -15.25),
  pitch: { x0: 12, x1: 30, z0: -20.8, z1: -9.7, cx: 21, cz: -15.25 },
  ianSeat: V(9.45, 0, 5.0),
  hollieTable: V(6.2, 0, 6.2),
  pondC: V(19.7, 0, 6.5), pondR: 1.15,
  lapPath: [V(11.2, 0, -5.4), V(21.2, 0, -5.4), V(21.2, 0, 4.6), V(11.2, 0, 5.4)],
  goldenSpots: [
    V(16.8, 0.6, -9.4), V(-9.5, 2.06, 1.8), V(1.8, 0.05, -3.4), V(-9.6, 1.6, -3.0), V(1.5, 0.62, 6.4), V(21.4, 0.25, -6.5), V(-5.5, 0.88, -11.3), V(31.4, 0.3, 5), V(-0.2, 0.3, -13.5),
    V(-4, 2.78, -7.8), V(6.7, 1.05, -7.6), V(5.8, 0.05, 1.6), V(8.9, 0.8, 5.0), V(-2.5, 1.15, 6.3),
  ],
};

// Table layout. seats are computed in buildTables.
export const TABLE_DEFS = [
  { id: 1, x: -5, z: -3.4, w: 1.1, d: 1.1, seats: 4 },
  { id: 2, x: -1.6, z: -3.4, w: 0.9, d: 0.9, seats: 2, booth: true },
  { id: 3, x: 1.8, z: -3.4, w: 1.1, d: 1.1, seats: 4 },
  { id: 4, x: 5.6, z: -3.4, w: 1.1, d: 1.1, seats: 4 },
  { id: 5, x: -5, z: 1.6, w: 1.1, d: 1.1, seats: 4 },
  { id: 6, x: -1.6, z: 1.6, w: 0.9, d: 0.9, seats: 2, booth: true },
  { id: 7, x: 1.8, z: 1.6, w: 1.1, d: 1.1, seats: 4 },
  { id: 8, x: 5.8, z: 1.6, w: 2.6, d: 1.0, seats: 8 },
  { id: 9, x: 13.5, z: -6.6, w: 1.8, d: 0.8, seats: 4, garden: true, picnic: true },
  { id: 10, x: 17.5, z: -6.6, w: 1.8, d: 0.8, seats: 4, garden: true, picnic: true },
  { id: 11, x: -3.2, z: -9.4, w: 2.2, d: 0.9, seats: 6, functionRoom: true },
  { id: 12, x: 14.2, z: 3.0, w: 1.8, d: 0.8, seats: 4, garden: true, picnic: true },
  { id: 13, x: 17.8, z: 2.4, w: 1.8, d: 0.8, seats: 4, garden: true, picnic: true },
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
  const plaster = mat(0xcbb48c); // nicotine-stained pub ceiling

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
  for (let z = -7.4; z < 8; z += 1.2) box(20, 0.12, 0.14, darkWood, 0, PUB.h - 0.06, z); // ceiling joists
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
  lights.windowMat.userData.dynamic = true;
  for (const x of [-3.5, 1, 6]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), lights.windowMat); w.position.set(x, 1.5, 7.98); w.rotation.y = Math.PI; scene.add(w); }
  for (const z of [3, 6.5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), lights.windowMat); w.position.set(9.98, 1.5, z); w.rotation.y = -Math.PI / 2; scene.add(w); }

  // Bar
  solidBox(-9.0, 0, -6.5, -7.9, 1.1, 1.0, darkWood, 'bar');
  box(1.25, 0.06, 7.6, mat(0x2b1a0e), -8.45, 1.13, -2.75);
  addSolid(-9.02, 1.1, -6.5, -7.88, 1.16, 1.0, 'bar');
  // Taps
  for (let i = 0; i < 3; i++) {
    const t = box(0.06, 0.35, 0.06, mat(0xd4af37), -8.35, 1.33, -3.6 + i * 0.3);
    box(0.04, 0.16, 0.08, mat(0x111111), -8.35, 1.55, -3.6 + i * 0.3);
    t.userData.tap = true;
  }
  barLabel('TAPS', FIX.taps); barLabel('WATER', FIX.water); barLabel('WINE', FIX.wine); barLabel('MOCKTAILS', FIX.mocktail);
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
    map: textTexture(['TODAY\'S SPECIALS', 'Whatever Ronnie', 'hasn\'t eaten', 'Oysters (obviously)', 'Fish & chips £12'], { w: 512, h: 384, size: 34, bg: '#1e2b22', border: '#6d4c41' }) }));
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
  buildPitch();
  buildExterior();
  buildPubDetail(darkWood);
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
  // Plain opaque colours are baked into vertex colours (one mesh per material type);
  // everything else is grouped by how it looks (texture, transparency, side).
  const vcLambert = { mr: new THREE.MeshLambertMaterial({ vertexColors: true }), no: new THREE.MeshLambertMaterial({ vertexColors: true }) };
  vcLambert.mr.userData.mr = true;
  const vcBasic = new THREE.MeshBasicMaterial({ vertexColors: true });
  const buckets = new Map(), remove = [];
  const keyOf = (m) => [m.type, m.map ? m.map.uuid : '', m.transparent, m.opacity, m.side, m.alphaTest, m.wireframe, m.userData.mr ? 1 : 0, m.map ? '' : m.color?.getHex()].join('|');
  G.scene.traverse((o) => {
    if (!(o.isMesh) || Array.isArray(o.material) || o.isSkinnedMesh) return;
    for (let a = o; a; a = a.parent) if (a.userData.noMerge || a === G.rig || a === G.dynamicRoot) return;
    const m = o.material;
    if (m.userData.dynamic) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    let target, key;
    const plain = !m.map && !m.transparent && !m.wireframe && m.color && (m.isMeshLambertMaterial || m.isMeshBasicMaterial);
    if (plain) {
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.deleteAttribute('uv');
      target = m.isMeshBasicMaterial ? vcBasic : (m.userData.mr ? vcLambert.mr : vcLambert.no);
      key = 'vc|' + target.uuid + '|' + (m.side === THREE.DoubleSide ? 2 : 0);
      if (m.side === THREE.DoubleSide) { target = target.clone(); target.side = THREE.DoubleSide; }
    } else { key = keyOf(m); target = m; }
    if (!buckets.has(key)) buckets.set(key, { mat: target, geos: [] });
    buckets.get(key).geos.push(geo);
    remove.push(o);
  });
  remove.forEach((o) => o.parent.remove(o));
  for (const { mat: m, geos } of buckets.values()) {
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
  const darkBooth = mat(0x3b2412);
  [top, leg, chairM, bench, darkBooth].forEach((m) => { m.userData.mr = true; });
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
    if (def.booth) for (const s of seats) {
      const c = new THREE.Group();
      const len = def.w + 0.5;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.5), mat(0x7a1d1d)); seat.position.set(0, 0.42, -0.05); c.add(seat);
      const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.36, 0.5), darkBooth); base.position.set(0, 0.18, -0.05); c.add(base);
      const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.12), mat(0x7a1d1d)); back.position.set(0, 0.85, -0.3); c.add(back);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 1.25, 0.08), darkBooth); frame.position.set(0, 0.63, -0.38); c.add(frame);
      c.position.copy(s.pos); c.rotation.y = s.yaw; def.group.add(c);
      s.chairHome = { pos: s.pos.clone(), yaw: s.yaw };
    }
    if (!def.picnic && !def.booth) for (const s of seats) {
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
  const hedge = mat(0x2e5a2a), fence = mat(0x8d6e4b), deck = new THREE.MeshLambertMaterial({ map: woodTexture([3, 4]) });
  // Hedge east (gate to the car park), fences north (gate to the pitch) and south
  solidBox(21.9, 0, -8, 22.6, 1.6, 4.8, hedge, 'hedge');
  solidBox(21.9, 0, 6.6, 22.6, 1.6, 8, hedge, 'hedge');
  carParkGate = solidBox(22.15, 0, 4.8, 22.35, 1.3, 6.6, mat(0x6d4c41), 'gate');
  carParkGate.mesh.userData.noMerge = true;
  solidBox(10, 0, -8.3, 15.3, 1.1, -8.05, fence, 'fence');
  solidBox(16.4, 0, -8.3, 22, 1.1, -8.05, fence, 'fence');
  solidBox(10, 0, 8.05, 22, 1.1, 8.3, fence, 'fence');
  for (let x = 10.5; x < 22; x += 1.2) { box(0.1, 1.25, 0.1, fence, x, 0.62, -8.17); box(0.1, 1.25, 0.1, fence, x, 0.62, 8.17); }
  addSolid(21.9, 1.6, -8.5, 23, 7, 8.5, 'invisible');
  addSolid(10, 1.1, -8.6, 15.3, 7, -8.05, 'invisible');
  addSolid(16.4, 1.1, -8.6, 22, 7, -8.05, 'invisible');
  addSolid(10, 1.1, 8.05, 22, 7, 8.6, 'invisible');
  const gl = labelSprite('5-A-SIDE PITCH →', { bg: '#2e7d32', size: 26, scale: 0.15 });
  gl.position.set(15.85, 1.6, -8.1); G.scene.add(gl);
  // Decking by the pub door + stone path
  const d = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.0), deck); d.rotation.x = -Math.PI / 2; d.position.set(11.6, 0.012, -5.2); G.scene.add(d);
  for (let i = 0; i < 9; i++) { const st = new THREE.Mesh(new THREE.CircleGeometry(0.28, 8), mat(0x9e9e9e)); st.rotation.x = -Math.PI / 2; st.position.set(13.6 + i * 0.9, 0.012, -2.5 + Math.sin(i) * 0.4); G.scene.add(st); }
  for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.CircleGeometry(0.28, 8), mat(0x9e9e9e)); st.rotation.x = -Math.PI / 2; st.position.set(15.85, 0.012, -7.6 + i * 0.95); G.scene.add(st); }
  // Parasols over the picnic tables
  for (const t of TABLE_DEFS.filter((t) => t.picnic)) {
    box(0.05, 2.3, 0.05, mat(0xeeeeee), t.x, 1.15, t.z);
    const can = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 8), mat(t.id % 2 ? 0x1d6b3a : 0xc62828)); can.position.set(t.x, 2.45, t.z); G.scene.add(can);
  }
  // Patio heaters
  for (const [x, z] of [[12.9, -3.0], [12.9, -7.4]]) { box(0.08, 2.0, 0.08, mat(0x9e9e9e), x, 1.0, z); const top = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 10), mat(0x9e9e9e)); top.position.set(x, 2.1, z); G.scene.add(top); const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xff7043 })); glow.position.set(x, 1.85, z); G.scene.add(glow); }
  // Smoking shelter
  for (const [x, z] of [[20.2, -2.2], [21.6, -2.2], [20.2, -0.2], [21.6, -0.2]]) box(0.08, 2.2, 0.08, mat(0x37474f), x, 1.1, z);
  box(1.7, 0.06, 2.3, mat(0x546e7a), 20.9, 2.22, -1.2);
  box(1.4, 0.45, 0.35, mat(0x6d4c41), 20.9, 0.22, -2.0);
  // Flower beds along the south fence
  const flowers = [0xe91e63, 0xffeb3b, 0x9c27b0, 0xff5722, 0xffffff];
  for (let x = 10.6; x < 21.6; x += 2.4) {
    box(2.0, 0.25, 0.5, mat(0x5d4037), x + 1, 0.12, 7.7);
    for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(flowers[(i + Math.round(x)) % 5])); f.position.set(x + 0.2 + i * 0.32, 0.33, 7.6 + (i % 2) * 0.15); G.scene.add(f); }
  }
  // Fairy lights strung along the fences
  const bulbM = new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), bulbG = new THREE.SphereGeometry(0.035, 5, 4);
  for (const z of [-7.9, 7.9]) for (let x = 10.3; x < 21.8; x += 0.45) { const b = new THREE.Mesh(bulbG, bulbM); b.position.set(x, 1.9 - Math.abs(Math.sin((x - 10.3) * 0.55)) * 0.35, z); G.scene.add(b); }
  for (const x of [10.3, 21.8]) for (const z of [-7.9, 7.9]) box(0.06, 2.0, 0.06, mat(0x5d4037), x, 1.0, z);
  // Duck pond with reeds
  const pond = new THREE.Mesh(new THREE.CircleGeometry(FIX.pondR, 20), new THREE.MeshLambertMaterial({ color: 0x3f7fbf, transparent: true, opacity: 0.85 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(FIX.pondC.x, 0.02, FIX.pondC.z); G.scene.add(pond);
  const rim = new THREE.Mesh(new THREE.RingGeometry(FIX.pondR, FIX.pondR + 0.2, 20), mat(0x9e9e9e)); rim.rotation.x = -Math.PI / 2; rim.position.set(FIX.pondC.x, 0.021, FIX.pondC.z); G.scene.add(rim);
  for (let i = 0; i < 10; i++) { const a = i * 0.7; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.7, 4), mat(0x558b2f)); r.position.set(FIX.pondC.x + Math.cos(a) * (FIX.pondR + 0.05), 0.35, FIX.pondC.z + Math.sin(a) * (FIX.pondR + 0.05)); G.scene.add(r); }
  for (let i = 0; i < 3; i++) {
    const duck = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xffeb3b)); b.scale.set(1.3, 0.8, 1); duck.add(b);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xffeb3b)); hd.position.set(0.12, 0.1, 0); duck.add(hd);
    duck.position.set(FIX.pondC.x, 0.08, FIX.pondC.z);
    duck.userData.phase = i * 2; duck.userData.noMerge = true; G.scene.add(duck);
    (G.ducks ||= []).push(duck);
  }
  // Bins + BBQ + kids' slide
  for (let i = 0; i < 2; i++) solidBox(12 + i * 0.85, 0, 7.3, 12.7 + i * 0.85, 1.0, 7.9, mat(0x37474f), 'bin');
  const bl = labelSprite('BINS', { bg: '#37474f', size: 30, scale: 0.15 }); bl.position.set(12.75, 1.4, 7.6); G.scene.add(bl);
  solidBox(15.2, 0, 7.2, 16.4, 0.9, 7.9, mat(0x222222), 'bbq');
  solidBox(17.2, 0, -1.6, 17.6, 1.4, -1.2, mat(0xfdd835), 'slide');
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 2.0), mat(0xe53935)); slide.position.set(17.4, 0.7, -0.35); slide.rotation.x = -0.6; G.scene.add(slide);
  // Trees and garden lamps
  for (const [tx, tz] of [[20.8, -7.2], [10.9, 7.3], [17.6, 7.4], [21.2, 2.2]]) {
    box(0.25, 2.2, 0.25, mat(0x5d4037), tx, 1.1, tz);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(0x3e7a35)); leaves.position.set(tx, 2.9, tz); G.scene.add(leaves);
  }
  for (const [x, z] of [[13.2, 0.5], [18.8, -4.6], [11.2, 6.0]]) { box(0.06, 1.0, 0.06, mat(0x263238), x, 0.5, z); const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3b0 })); l.position.set(x, 1.05, z); G.scene.add(l); }
}

function buildPitch() {
  const P = { x0: 11, x1: 31, z0: -21.5, z1: -9 };
  // Astroturf with mown stripes
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#2f8a3a' : '#38a046'; x.fillRect(i * 32, 0, 32, 64); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0), new THREE.MeshLambertMaterial({ map: tex }));
  turf.rotation.x = -Math.PI / 2; turf.position.set((P.x0 + P.x1) / 2, 0.006, (P.z0 + P.z1) / 2); G.scene.add(turf);
  const around = new THREE.Mesh(new THREE.PlaneGeometry(21.4, 15.2), mat(0x7a7a7a)); around.rotation.x = -Math.PI / 2; around.position.set(21, 0.003, -15.9); G.scene.add(around);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  const line = (w, d, px, pz) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); l.rotation.x = -Math.PI / 2; l.position.set(px, 0.012, pz); G.scene.add(l); };
  const cz = -15.25;
  line(19.6, 0.08, 21, P.z0 + 0.3); line(19.6, 0.08, 21, P.z1 - 0.3); line(0.08, 12, 11.3, cz); line(0.08, 12, 30.7, cz); line(0.08, 12, 21, cz);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.83, 32), lineM); ring.rotation.x = -Math.PI / 2; ring.position.set(21, 0.012, cz); G.scene.add(ring);
  for (const [gx, s] of [[11.3, 1], [30.7, -1]]) { line(0.08, 5, gx + s * 3.2, cz); line(3.2, 0.08, gx + s * 1.6, cz - 2.5); line(3.2, 0.08, gx + s * 1.6, cz + 2.5); }
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), lineM); spot.rotation.x = -Math.PI / 2; spot.position.set(FIX.penaltySpot.x, 0.013, FIX.penaltySpot.z); G.scene.add(spot);
  // Goals (posts, crossbar, nets)
  const postM = mat(0xffffff), netM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, wireframe: true });
  for (const g of FIX.goals) {
    for (const s of [-1, 1]) solidBox(g.x - 0.05, 0, g.z + s * g.w / 2 - 0.05, g.x + 0.05, g.h, g.z + s * g.w / 2 + 0.05, postM, 'post');
    solidBox(g.x - 0.05, g.h, g.z - g.w / 2 - 0.05, g.x + 0.05, g.h + 0.1, g.z + g.w / 2 + 0.05, postM, 'post');
    const back = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.h, 8, 5), netM); back.position.set(g.x + g.dir * 0.8, g.h / 2, g.z); back.rotation.y = Math.PI / 2; G.scene.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(0.8, g.w, 3, 8), netM); roof.rotation.x = -Math.PI / 2; roof.position.set(g.x + g.dir * 0.4, g.h, g.z); G.scene.add(roof);
    for (const s of [-1, 1]) { const sideN = new THREE.Mesh(new THREE.PlaneGeometry(0.8, g.h, 3, 5), netM); sideN.position.set(g.x + g.dir * 0.4, g.h / 2, g.z + s * g.w / 2); G.scene.add(sideN); }
    addSolid(g.x + g.dir * 0.8 - 0.03, 0, g.z - g.w / 2, g.x + g.dir * 0.8 + 0.03, g.h, g.z + g.w / 2, 'net');
    addSolid(Math.min(g.x, g.x + g.dir * 0.8), g.h, g.z - g.w / 2, Math.max(g.x, g.x + g.dir * 0.8), g.h + 0.03, g.z + g.w / 2, 'net');
    for (const s of [-1, 1]) addSolid(Math.min(g.x, g.x + g.dir * 0.8), 0, g.z + s * g.w / 2 - 0.02, Math.max(g.x, g.x + g.dir * 0.8), g.h, g.z + s * g.w / 2 + 0.02, 'net');
  }
  // The cage: chain-link fence with gates (south gate from the garden)
  const cc = document.createElement('canvas'); cc.width = 64; cc.height = 64; const cx = cc.getContext('2d');
  cx.strokeStyle = 'rgba(200,200,200,0.9)'; cx.lineWidth = 3; for (let i = -64; i < 128; i += 16) { cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + 64, 64); cx.stroke(); cx.beginPath(); cx.moveTo(i + 64, 0); cx.lineTo(i, 64); cx.stroke(); }
  const ct = new THREE.CanvasTexture(cc); ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
  const fenceM = new THREE.MeshBasicMaterial({ map: ct, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  const H = 3.2;
  const fenceRun = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05) return;
    const t = ct.clone(); t.repeat.set(len / 0.5, H / 0.5); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), fenceM); m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2); m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0); G.scene.add(m);
    addSolid(Math.min(x0, x1) - 0.05, 0, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, 7, Math.max(z0, z1) + 0.05, 'cage');
    for (let k = 0; k <= len; k += 2) box(0.07, H, 0.07, mat(0x1b5e20), x0 + (x1 - x0) * (k / len), H / 2, z0 + (z1 - z0) * (k / len));
  };
  fenceRun(P.x0, P.z1, 15.3, P.z1); fenceRun(16.4, P.z1, P.x1, P.z1);
  fenceRun(P.x0, P.z0, P.x1, P.z0); fenceRun(P.x0, P.z0, P.x0, P.z1); fenceRun(P.x1, P.z0, P.x1, P.z1);
  box(1.2, 0.1, 0.1, mat(0x1b5e20), 15.85, H, P.z1);
  // Floodlights
  for (const [fx, fz] of [[11.4, -21.1], [30.6, -21.1], [11.4, -9.4], [30.6, -9.4]]) {
    box(0.18, 7, 0.18, mat(0x9e9e9e), fx, 3.5, fz);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xfffde7 })); head.position.set(fx, 7.1, fz); head.lookAt(21, 0, cz); G.scene.add(head);
  }
  // Dugout + scoreboard
  box(3.0, 0.06, 1.0, mat(0x37474f), 21, 2.0, -21.0); box(3.0, 2.0, 0.06, mat(0x37474f), 21, 1.0, -21.45);
  solidBox(19.6, 0, -21.4, 22.4, 0.45, -21.0, mat(0x1565c0), 'bench');
  const sb = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), new THREE.MeshBasicMaterial({ map: textTexture(['OYSTERFLEET 5-A-SIDE', 'NO SLIDE TACKLES ON RONNIE'], { w: 512, h: 142, size: 36, bg: '#1b5e20', color: '#fff59d', border: '#fff59d' }) }));
  sb.position.set(21, 3.6, -21.45); G.scene.add(sb);
  box(0.12, 3.2, 0.12, mat(0x333333), 19.3, 1.6, -21.45); box(0.12, 3.2, 0.12, mat(0x333333), 22.7, 1.6, -21.45);
  // Spare balls in a bag by the gate
  solidBox(16.8, 0, -9.6, 17.4, 0.5, -9.2, mat(0x263238), 'ballbag');
}

function buildCarPark() {
  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 16), mat(0x4a4a4a));
  tarmac.rotation.x = -Math.PI / 2; tarmac.position.set(28.3, 0.004, 0); G.scene.add(tarmac);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
  for (let i = 0; i < 7; i++) for (const z of [-5.5, 5.5]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.6), lineM); l.rotation.x = -Math.PI / 2; l.position.set(23.6 + i * 1.6, 0.01, z); G.scene.add(l); }
  const dbl = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 4.4), new THREE.MeshBasicMaterial({ map: textTexture(['RONNIE\'S SPACE', '(DOUBLE WIDTH)'], { w: 256, h: 360, size: 34, bg: '#4a4a4a', color: '#fdd835' }) }));
  dbl.rotation.x = -Math.PI / 2; dbl.position.set(31.6, 0.011, 5.5); G.scene.add(dbl);
  // Ian's van
  const van = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 4.4), mat(0xf5f5f5)); body.position.y = 1.3; van.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.25, 4.0), mat(0x2e7d32)); stripe.position.y = 1.1; van.add(stripe);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.9, 1.0), mat(0x90caf9)); cab.position.set(0, 1.6, 2.3); van.add(cab);
  for (const [wx, wz] of [[-1, -1.5], [1, -1.5], [-1, 1.6], [1, 1.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10), mat(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.35, wz); van.add(w); }
  for (let i = 0; i < 5; i++) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.5, 4), mat(0x222222)); rod.rotation.x = Math.PI / 2; rod.position.set(-0.8 + i * 0.4, 2.3, 0); van.add(rod); }
  const vl = labelSprite("IAN'S VAN", { bg: '#3b3f24', size: 30, scale: 0.3 }); vl.position.set(0, 3.0, 0); van.add(vl);
  van.position.set(26, 0, -2); G.scene.add(van);
  addSolid(25, 0, -4.2, 27, 2.25, 0.8, 'van');
  solidBox(25.6, 0, -4.9, 26.4, 0.5, -4.4, mat(0x1e88e5), 'cooler');
  const cl = labelSprite('BAIT + COOLER', { bg: '#1e88e5', size: 26, scale: 0.12 }); cl.position.set(26, 0.9, -4.65); G.scene.add(cl);
  // Parked cars
  const car = (x, z, col, rot = 0) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 3.9), mat(col)); b.position.y = 0.55; g.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.0), mat(0x90a4ae)); top.position.set(0, 1.08, -0.2); g.add(top);
    for (const [wx, wz] of [[-0.85, -1.2], [0.85, -1.2], [-0.85, 1.2], [0.85, 1.2]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10), mat(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.32, wz); g.add(w); }
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff9c4 })); l.position.set(s * 0.55, 0.6, 1.96); g.add(l); }
    g.position.set(x, 0, z); g.rotation.y = rot; G.scene.add(g);
    addSolid(x - 0.9, 0, z - 2.0, x + 0.9, 1.35, z + 2.0, 'car');
  };
  car(24.4, -5.6, 0xc62828); car(29.2, -5.6, 0xb0bec5); car(27.6, 5.6, 0x1565c0); car(32.4, -5.6, 0x212121);
  // The skip
  solidBox(30.2, 0, 3.8, 32.6, 0.15, 6.2, mat(0xf9a825), 'skip-floor');
  for (const [x0, z0, x1, z1] of [[30.2, 3.8, 32.6, 3.95], [30.2, 6.05, 32.6, 6.2], [30.2, 3.8, 30.35, 6.2], [32.45, 3.8, 32.6, 6.2]]) solidBox(x0, 0, z0, x1, 1.1, z1, mat(0xf9a825), 'skip');
  const sl = labelSprite('SKIP', { bg: '#f9a825', color: '#222', size: 30, scale: 0.18 }); sl.position.set(31.4, 1.6, 5); G.scene.add(sl);
  // Recycling bins, pay machine, lamp posts
  [[0x2e7d32, 23.2], [0x1565c0, 23.9], [0x6d4c41, 24.6]].forEach(([c, x]) => solidBox(x - 0.3, 0, 7.2, x + 0.3, 1.1, 7.8, mat(c), 'bin'));
  solidBox(33.3, 0, -0.4, 33.7, 1.5, 0.2, mat(0x455a64), 'paymachine');
  for (const [x, z] of [[23.2, 0], [33.4, 4], [33.4, -4]]) { box(0.12, 4.5, 0.12, mat(0x333333), x, 2.25, z); const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff3b0 })); l.position.set(x, 4.5, z); G.scene.add(l); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(['OYSTERFLEET CUSTOMERS ONLY', 'Ian: please stop parking diagonally'], { w: 512, h: 200, size: 30, bg: '#1d3b2a', color: '#e8c96a' }) }));
  sign.position.set(33.85, 1.8, 0); sign.rotation.y = -Math.PI / 2; G.scene.add(sign);
  // Fences
  solidBox(22.6, 0, -8.3, 34, 1.4, -8.05, mat(0x8d6e4b), 'fence');
  solidBox(22.6, 0, 8.05, 34, 1.4, 8.3, mat(0x8d6e4b), 'fence');
  solidBox(33.9, 0, -8.3, 34.2, 1.4, 8.3, mat(0x8d6e4b), 'fence');
  addSolid(22.6, 1.4, -8.6, 34.5, 7, -8.05, 'invisible');
  addSolid(22.6, 1.4, 8.05, 34.5, 7, 8.6, 'invisible');
  addSolid(33.9, 1.4, -8.6, 34.6, 7, 8.6, 'invisible');
}

// The building from outside: brick, a pitched roof, chimney, the hanging oyster sign, the street.
function buildExterior() {
  const brickT = brickTexture(), brick = (rx, ry) => { const t = brickT.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshLambertMaterial({ map: t }); };
  const H = PUB.h;
  const face = (w, h, x, y, z, ry, m) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; G.scene.add(p); return p; };
  // South facade (street) with the door gap
  const southM = brick(4, 1.2);
  face(2.6, H, -8.9, H / 2, 8.205, 0, southM); face(16.4, H, 1.8, H / 2, 8.205, 0, southM); face(1.2, H - 1.9, -7, (H + 1.9) / 2, 8.205, 0, southM);
  for (const x of [-3.5, 1, 6]) { face(1.6, 1.0, x, 1.5, 8.215, 0, lights.windowMat); for (const dx of [-0.4, 0, 0.4]) box(0.04, 1.0, 0.03, mat(0x1d3b2a), x + dx, 1.5, 8.22); box(1.7, 0.08, 0.15, mat(0x1d3b2a), x, 0.97, 8.27); }
  box(1.25, 0.08, 0.06, mat(0x1d3b2a), -7, 1.92, 8.24);
  // East facade (garden) with the garden door gap
  const eastM = brick(3, 1.2);
  face(1.8, H, 10.205, H / 2, -7.1, Math.PI / 2, eastM); face(12.7, H, 10.205, H / 2, 1.65, Math.PI / 2, eastM); face(1.5, H - 1.95, 10.205, (H + 1.95) / 2, -5.45, Math.PI / 2, eastM);
  for (const z of [6.5]) face(1.4, 1.0, 10.215, 1.5, z, Math.PI / 2, lights.windowMat);
  // Back of house (kitchen, cellar, staff room) + function room exterior
  solidBox(8.3, 0, -14, 10.2, H, -8.2, brick(1, 1.2), 'backhouse');
  solidBox(1.2, 0, -14, 8.3, H, -10.45, brick(3, 1.2), 'backhouse');
  solidBox(-10.2, 0, -14.4, 1.2, 0.01, -14.2, mat(0x5d4037), 'trim');
  face(11.2, H, -4.4, H / 2, -14.205, Math.PI, brick(5, 1.2));
  box(11.4, 0.3, 6.4, mat(0x616161), -4.4, H + 0.15, -11.1); box(9.2, 0.3, 6.2, mat(0x616161), 5.6, H + 0.15, -11.1);
  // Pitched roof over the main bar
  const tiles = roofTexture();
  const roofM = new THREE.MeshLambertMaterial({ map: tiles, side: THREE.DoubleSide });
  const rise = 1.9, half = 8.5, slope = Math.hypot(half, rise);
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(21, slope), roofM); r.position.set(0, H + rise / 2, s * half / 2); r.rotation.set(-s * Math.atan2(half, rise), 0, 0); G.scene.add(r); }
  for (const x of [-10.3, 10.3]) { const shape = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]); const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), brick(3, 0.8)); gable.position.set(x, H, 0); gable.rotation.y = Math.PI / 2; G.scene.add(gable); }
  // Chimney above the fireplace
  box(0.8, 2.6, 1.0, brick(1, 1), 9.6, H + 1.6, 3.4);
  for (const dz of [-0.2, 0.2]) { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 8), mat(0xa1563a)); pot.position.set(9.6, H + 3.05, 3.4 + dz); G.scene.add(pot); }
  // Hanging pub sign with the oyster painted on it
  box(0.1, 3.4, 0.1, mat(0x1d3b2a), -9.6, 1.7, 8.6);
  box(0.06, 0.06, 1.1, mat(0x1d3b2a), -9.6, 3.2, 9.05);
  const signG = new THREE.Group();
  const signTex = oysterSignTexture();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.85), [mat(0x1d3b2a), mat(0x1d3b2a), mat(0x1d3b2a), mat(0x1d3b2a), new THREE.MeshLambertMaterial({ map: signTex }), new THREE.MeshLambertMaterial({ map: signTex })]);
  board.rotation.y = Math.PI / 2; board.position.y = -0.6; signG.add(board);
  signG.position.set(-9.6, 3.15, 9.2); signG.userData.noMerge = true; G.scene.add(signG);
  G.pubSign = signG;
  // Hanging baskets and lanterns on the facade
  for (const x of [-4.8, 3.3, 8.2]) {
    box(0.04, 0.04, 0.4, mat(0x111111), x, 2.4, 8.4);
    const bsk = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x3e2723)); bsk.position.set(x, 2.15, 8.6); G.scene.add(bsk);
    for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat([0xe91e63, 0x8bc34a, 0xffeb3b, 0x9c27b0][i % 4])); f.position.set(x + Math.cos(i) * 0.22, 2.2 + (i % 2) * 0.06, 8.6 + Math.sin(i) * 0.22); G.scene.add(f); }
  }
  for (const x of [-8.2, -5.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.18), new THREE.MeshBasicMaterial({ color: 0xffe082 })); l.position.set(x, 2.15, 8.33); G.scene.add(l); }
  // Street: kerb, road, lamp posts, bench, A-board, houses opposite
  box(40, 0.12, 0.25, mat(0xbdbdbd), 4, 0.06, 11.3);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 7), mat(0x37383a)); road.rotation.x = -Math.PI / 2; road.position.set(8, 0.002, 14.9); G.scene.add(road);
  for (let x = -20; x < 36; x += 3) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.12), new THREE.MeshBasicMaterial({ color: 0xf5f5f5 })); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.01, 14.9); G.scene.add(d); }
  const pave2 = new THREE.Mesh(new THREE.PlaneGeometry(60, 3), mat(0x8d8d8d)); pave2.rotation.x = -Math.PI / 2; pave2.position.set(8, 0.003, 19.9); G.scene.add(pave2);
  for (const x of [-9, 0, 9]) { box(0.08, 3.6, 0.08, mat(0x333333), x, 1.8, 11.0); box(0.5, 0.06, 0.06, mat(0x333333), x, 3.6, 10.8); const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: 0xfff3b0 })); l.position.set(x, 3.5, 10.6); G.scene.add(l); }
  box(1.6, 0.06, 0.45, mat(0x6d4c41), -2.5, 0.45, 10.8); box(1.6, 0.4, 0.06, mat(0x6d4c41), -2.5, 0.75, 11.0); box(0.06, 0.45, 0.4, mat(0x333333), -3.2, 0.22, 10.8); box(0.06, 0.45, 0.4, mat(0x333333), -1.8, 0.22, 10.8);
  const ab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.04), [mat(0x111111), mat(0x111111), mat(0x111111), mat(0x111111), new THREE.MeshBasicMaterial({ map: textTexture(['LIVE FOOTBALL', 'TODAY!', '', 'QUIZ WEDNESDAY', 'MIND YOUR HEAD'], { w: 256, h: 384, size: 28, bg: '#1e2b22' }) }), mat(0x111111)]);
  ab.position.set(-5.4, 0.45, 9.2); ab.rotation.x = -0.15; G.scene.add(ab);
  const houseCols = [0x8d4b3a, 0xa0522d, 0x9e7b5a, 0x7b4a3a, 0xb07050];
  for (let i = 0; i < 8; i++) {
    const hx = -18 + i * 6.2;
    box(6.0, 6.5, 4, mat(houseCols[i % 5]), hx, 3.25, 23.4);
    for (const wx of [-1.6, 1.6]) for (const wy of [1.6, 4.4]) face(1.1, 1.2, hx + wx, wy, 21.39, Math.PI, mat(0x90a4ae));
    face(0.9, 2.0, hx, 1.0, 21.39, Math.PI, mat([0x1d3b2a, 0x7b1f3a, 0x1a237e][i % 3]));
    const rf = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.0, 4), mat(0x4e342e)); rf.position.set(hx, 7.5, 23.4); rf.rotation.y = Math.PI / 4; rf.scale.z = 0.7; G.scene.add(rf);
  }
  addSolid(-14, 0, 17.6, 40, 7, 18.0, 'invisible');
}

function brickTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#d6cfc4'; x.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 8; r++) for (let k = -1; k < 9; k++) {
    const off = (r % 2) * 16;
    x.fillStyle = `hsl(${10 + Math.random() * 12},${45 + Math.random() * 15}%,${30 + Math.random() * 12}%)`;
    x.fillRect(k * 32 + off + 1, r * 16 + 1, 30, 14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function roofTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#5d3a2e'; x.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 8; r++) for (let k = -1; k < 9; k++) { x.fillStyle = `hsl(12,${35 + Math.random() * 15}%,${22 + Math.random() * 10}%)`; x.fillRect(k * 16 + (r % 2) * 8 + 1, r * 16 + 1, 14, 14); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 6);
  return t;
}
function oysterSignTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 288; const x = c.getContext('2d');
  x.fillStyle = '#1d3b2a'; x.fillRect(0, 0, 256, 288);
  x.strokeStyle = '#e8c96a'; x.lineWidth = 8; x.strokeRect(8, 8, 240, 272);
  // The oyster: open shell with a pearl
  x.fillStyle = '#cfc6b8'; x.beginPath(); x.ellipse(128, 150, 80, 52, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#8d8173'; x.lineWidth = 3;
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(128, 196); x.quadraticCurveTo(128 + i * 30, 140, 128 + i * 24, 100); x.stroke(); }
  x.fillStyle = '#f3e9f5'; x.beginPath(); x.ellipse(128, 150, 46, 26, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(128, 148, 14, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#e8c96a'; x.textAlign = 'center'; x.font = 'bold 30px Georgia'; x.fillText('THE', 128, 52); x.fillText('OYSTERFLEET', 128, 250);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- jokes on the walls (one texture atlas = one draw call)
let atlas = null;
function sign(lines, x, y, z, ry, w = 0.9, opts = {}) {
  if (!atlas) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 2048;
    atlas = { c, ctx: c.getContext('2d'), n: 0, tex: null, mat: null };
    atlas.tex = new THREE.CanvasTexture(c); atlas.tex.colorSpace = THREE.SRGBColorSpace;
    atlas.mat = new THREE.MeshBasicMaterial({ map: atlas.tex });
  }
  const i = atlas.n++; if (i >= 32) return;
  const col = i % 4, row = Math.floor(i / 4), cw = 512, ch = 256, x0 = col * cw, y0 = row * ch, cx = atlas.ctx;
  cx.fillStyle = opts.bg || '#f5f0e0'; cx.fillRect(x0, y0, cw, ch);
  cx.strokeStyle = opts.border || '#3b2412'; cx.lineWidth = 12; cx.strokeRect(x0 + 6, y0 + 6, cw - 12, ch - 12);
  cx.fillStyle = opts.color || '#2b1a0e'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  const size = opts.size || (lines.length > 3 ? 34 : 44);
  cx.font = `bold ${size}px ${opts.font || 'Arial'}`;
  lines.forEach((l, k) => {
    if (l.startsWith('~')) { cx.save(); cx.fillText(l.slice(1), x0 + cw / 2, y0 + ch / 2 + (k - (lines.length - 1) / 2) * size * 1.2); cx.strokeStyle = '#c62828'; cx.lineWidth = 6; const tw = cx.measureText(l.slice(1)).width; const ly = y0 + ch / 2 + (k - (lines.length - 1) / 2) * size * 1.2; cx.beginPath(); cx.moveTo(x0 + cw / 2 - tw / 2, ly); cx.lineTo(x0 + cw / 2 + tw / 2, ly); cx.stroke(); cx.restore(); }
    else cx.fillText(l, x0 + cw / 2, y0 + ch / 2 + (k - (lines.length - 1) / 2) * size * 1.2, cw - 30);
  });
  atlas.tex.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 4, 1 - (row + 1 - uv.getY(k)) / 8);
  const m = new THREE.Mesh(geo, atlas.mat); m.position.set(x, y, z); m.rotation.y = ry; G.scene.add(m);
  return m;
}

function buildPubDetail(darkWood) {
  const H = PUB.h;
  // Warm amber lighting: pendants over the tables, wall lights, a crackling fire
  const shadeM = mat(0x1d3b2a), bulbM = new THREE.MeshBasicMaterial({ color: 0xffd28a });
  for (const t of TABLE_DEFS.filter((t) => !t.garden && !t.picnic && !t.functionRoom && typeof t.id === 'number')) {
    box(0.015, H - 2.18, 0.015, mat(0x111111), t.x, (H + 2.18) / 2, t.z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 12, 1, true), shadeM); shade.position.set(t.x, 2.12, t.z); G.scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbM); bulb.position.set(t.x, 2.05, t.z); G.scene.add(bulb);
    G.beams.push({ min: V(t.x - 0.22, 2.0, t.z - 0.22), max: V(t.x + 0.22, 2.3, t.z + 0.22), name: 'lampshade' });
  }
  for (const [x, z, ry] of [[-9.95, 4.0, Math.PI / 2], [-9.95, 6.8, Math.PI / 2], [9.95, -3.8, -Math.PI / 2], [-2, 7.95, Math.PI], [4.5, 7.95, Math.PI]]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), bulbM); w.position.set(x, 1.85, z); w.rotation.y = ry; G.scene.add(w);
    box(0.05, 0.2, 0.05, mat(0xb08d57), x, 1.75, z);
  }
  for (const [x, z] of [[-3.3, -1.2], [3.3, -1.2], [0, 4.6]]) { const l = new THREE.PointLight(0xffb060, 1.6, 9, 1.2); l.position.set(x, 1.7, z); G.scene.add(l); }
  // Backlit bottle shelves behind the bar + etched mirrors
  const glowM = new THREE.MeshBasicMaterial({ color: 0xffc864 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.5), glowM); back.position.set(-9.97, 1.62, -2.75); back.rotation.y = Math.PI / 2; G.scene.add(back);
  for (const y of [0.9, 1.4, 1.9, 2.38]) box(0.32, 0.04, 7.5, darkWood, -9.82, y, -2.75);
  const bottleCols = [0x2e7d32, 0x8d6e63, 0xffc107, 0x1565c0, 0xc62828, 0xe0e0e0, 0x6a1b9a];
  for (let i = 0; i < 54; i++) {
    const row = Math.floor(i / 18), b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.28, 6), new THREE.MeshLambertMaterial({ color: bottleCols[(i * 3 + row) % 7], transparent: true, opacity: 0.85 }));
    b.position.set(-9.8, 0.92 + row * 0.5 + 0.14, -6.2 + (i % 18) * 0.4); G.scene.add(b);
  }
  const mc = document.createElement('canvas'); mc.width = 1024; mc.height = 96; const mx = mc.getContext('2d');
  const grad = mx.createLinearGradient(0, 0, 1024, 96); grad.addColorStop(0, '#b8c6cc'); grad.addColorStop(0.5, '#e6eef0'); grad.addColorStop(1, '#aebcc2'); mx.fillStyle = grad; mx.fillRect(0, 0, 1024, 96);
  mx.fillStyle = 'rgba(255,255,255,0.85)'; mx.font = 'italic bold 52px Georgia'; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.fillText('✦ The Oysterfleet ✦ Fine Ales & Oysters ✦ Est. 1887 ✦', 512, 50);
  const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 0.38), new THREE.MeshBasicMaterial({ map: mt })); mirror.position.set(-9.96, 2.6, -2.75); mirror.rotation.y = Math.PI / 2; G.scene.add(mirror);
  // Brass drip tray + bar rail + towel
  box(0.2, 0.02, 1.1, mat(0xb08d57), -8.35, 1.165, -3.3);
  box(0.05, 0.05, 7.5, mat(0xb08d57), -7.82, 0.18, -2.75);
  // Fireplace (east wall) with a working fire
  solidBox(9.45, 0, 2.6, 10.0, H, 4.2, mat(0x8d7f73), 'chimney');
  const fb = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.75), mat(0x111111)); fb.position.set(9.44, 0.42, 3.4); fb.rotation.y = -Math.PI / 2; G.scene.add(fb);
  box(0.25, 0.08, 1.9, darkWood, 9.35, 1.25, 3.4);
  box(0.5, 0.05, 1.8, mat(0x6d6d6d), 9.2, 0.025, 3.4);
  for (let i = 0; i < 3; i++) box(0.12, 0.1, 0.6, mat(0x4e342e), 9.33, 0.06 + i * 0.04, 3.25 + i * 0.12);
  const fire = new THREE.Group(); fire.userData.noMerge = true;
  for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff6f00 : 0xffca28, transparent: true, opacity: 0.9 })); f.position.set(9.36, 0.26, 3.1 + i * 0.12); fire.add(f); }
  G.scene.add(fire); G.fire = fire;
  G.fireLight = new THREE.PointLight(0xff8a3c, 3, 6, 1.5); G.fireLight.position.set(9.0, 0.7, 3.4); G.scene.add(G.fireLight);
  const trophy = new THREE.Group(); trophy.userData.noMerge = false;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.18, 10), mat(0xd4af37)); cup.position.set(9.35, 1.4, 3.4); G.scene.add(cup);
  // Frosted window frames inside
  for (const x of [-3.5, 1, 6]) for (const dx of [-0.4, 0, 0.4]) box(0.04, 1.0, 0.03, mat(0x2b1a0e), x + dx, 1.5, 7.97);
  // Second big screen for the football
  const tv2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.68), new THREE.MeshBasicMaterial({ map: tvScreen.tex })); tv2.position.set(6, 2.38, 7.9); tv2.rotation.y = Math.PI; tv2.userData.noMerge = true; G.scene.add(tv2);
  box(1.3, 0.76, 0.06, mat(0x111111), 6, 2.38, 7.95);
  // Broken bar stool, wet floor sign, tip jar
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), mat(0x7a1d1d)); stool.position.set(-7.6, 0.12, 0.9); stool.rotation.z = 1.3; G.scene.add(stool);
  const wet = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 4, 1, true), new THREE.MeshLambertMaterial({ color: 0xfdd835, side: THREE.DoubleSide })); wet.position.set(3.2, 0.3, 7.3); G.scene.add(wet);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.5 })); jar.position.set(-8.3, 1.24, 0.4); G.scene.add(jar);
  // The joke signs (Ronnie Simulator 84.5, Lewis edition)
  sign(['STAFF OF THE MONTH:', 'RONNIE', '(ATE THE CERTIFICATE)'], 7.6, 1.6, -7.88, 0);
  sign(['STAFF ROTA', 'MON-SUN: RONNIE — BREAK', 'LEWIS — MIND YOUR HEAD', 'IAN — NOT STAFF (STOP)'], 6.4, 2.45, -7.89, 0, 0.9, { size: 30 });
  sign(['PLEASE DO NOT', 'FEED THE BARMAN'], -7.88, 0.62, -4.2, Math.PI / 2, 0.8, { bg: '#fff59d' });
  sign(['PIE OF THE DAY:', 'GONE (RONNIE)'], 2.0, 1.6, -7.88, 0, 0.7, { bg: '#1e2b22', color: '#f5f0e0', border: '#e8c96a' });
  sign(['MAX OCCUPANCY: 120', '(OR 3 RONNIES)'], -8.8, 2.3, 7.88, Math.PI, 0.8);
  sign(['~MIND YOUR HEAD', 'MIND YOUR BELLY, RON', 'ACTUALLY, MIND YOUR HEAD, LEWIS'], -8.45, 0.62, 1.02, 0, 0.9, { size: 34 });
  sign(['STAFF FOOD ALLOWANCE:', 'ONE (1) BAG OF CRISPS.', 'RONNIE THIS MEANS YOU.'], -1.0, 1.5, -7.88, 0, 0.8, { size: 36 });
  sign(["RONNIE'S FIRST SHIFT", '→  RONNIE TODAY  →', '(needs a wider frame)'], 2.6, 1.6, 7.88, Math.PI, 0.9);
  sign(['WE DO NOT SERVE SALAD', '', '"YES YOU DO" — Chloe'], -6.0, 1.7, 7.88, Math.PI, 0.8);
  sign(['TIMES RONNIE GOT STUCK', 'BEHIND THE BAR: IIII IIII II', 'TIMES LEWIS HIT HIS HEAD:', '∞'], 9.88, 1.6, -0.6, -Math.PI / 2, 0.9, { bg: '#ffffff', size: 32 });
  sign(['OYSTERFLEET PIE-EATING', 'CHAMPION: RONNIE', '(UNDEFEATED, UNCHALLENGED, UNWELL)'], 9.43, 1.75, 3.4, -Math.PI / 2, 0.75, { bg: '#3e2723', color: '#e8c96a', size: 30 });
  sign(['BIG SCREEN MATCHDAY!', '(Ronnie may block view)'], 4.6, 1.5, 7.88, Math.PI, 0.7, { bg: '#1565c0', color: '#ffffff' });
  sign(['STAFF TOILET', 'RONNIE: USE THE BIG ONE'], 4.0, 2.05, 7.86, Math.PI, 0.6);
  sign(['CAUTION:', 'RONNIE SWEAT'], 3.2, 0.68, 7.04, 0, 0.35, { bg: '#fdd835', size: 54 });
  sign(["RONNIE'S", 'PASTY FUND'], -8.3, 1.42, 0.4, Math.PI / 2, 0.22, { bg: '#ffffff', size: 60 });
  sign(['GLASS WASHER:', "These are for GLASSES, Ronnie,", 'not for washing your plate', 'between seconds'], -9.2, 0.62, 1.02, 0, 0.8, { size: 28 });
  sign(['QUIZ NIGHT', 'Q1: How many pies did', 'Ronnie eat last night?', 'A: Yes.'], -9.88, 1.6, -9.5, Math.PI / 2, 0.9, { bg: '#1e2b22', color: '#f5f0e0', size: 32 });
  sign(['DARTS: RONNIE 180', '(pies)'], -9.88, 2.3, -13.2, Math.PI / 2, 0.6, { bg: '#111111', color: '#fdd835' });
  sign(['NO BARBECUES', '(RONNIE ATE THE LAST ONE)'], 18.6, 0.85, 7.98, Math.PI, 0.8, { bg: '#ffffff' });
  sign(['LOST PROPERTY:', '30 EMPTY MONSTOR CANS', "+ RONNIE'S NECK"], 8.0, 0.8, -7.88, 0, 0.6, { size: 32 });
  sign(['SAVE RONNIE\'S', 'SHIRT BUTTONS'], -8.3, 1.42, 0.0, Math.PI / 2, 0.22, { bg: '#ffffff', size: 56 });
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
  sign.position.set(-4, 2.45, 8.24); G.scene.add(sign);
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
  lights.windowMat.color.copy(c).lerp(new THREE.Color(0xf2f6f8), 0.6); // frosted glass
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
    o.y = p.y + vy * 0.35; // bouncy landings (Ronnie Simulator: 0.35)
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
  p.x = clamp(p.x, -9.75, G.gardenOpen ? 33.7 : 9.75);
  p.z = clamp(p.z, -23.4, 11);
  if (p.z < -8 && p.x > 0.75 && p.x < 10.3) p.x = 0.75;
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
const NAV = { x0: -10, z0: -24, cell: 0.4, cols: 112, rows: 88, blocked: null };
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
    const inPitch = c.x > 10.6 && c.x < 31.4 && c.z > -23.5 && c.z < -8.3;
    const inGate = c.x > 15.3 && c.x < 16.4 && c.z > -8.6 && c.z < -7.9;
    if (!inPubArea && !inGardenArea && !inStreet && !inFunction && !inCarPark && !inPitch && !inGate) b = true;
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

export function nearestWalkable(p) {
  const [i, j] = cellOf(p.x, p.z);
  if (!isBlocked(i, j)) return p.clone().setY(0);
  const [a, b] = nearestFree(i, j);
  return cellCenter(a, b);
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
  if (G.fire) { G.fire.children.forEach((f, i) => { f.scale.y = 0.7 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.6; }); if (G.fireLight) G.fireLight.intensity = 2.6 + Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.4; }
  if (G.pubSign) G.pubSign.rotation.x = Math.sin(t * 1.3) * 0.06;
  if (G.ducks) G.ducks.forEach((d) => { const ph = d.userData.phase + t * 0.3; d.position.x = FIX.pondC.x + Math.cos(ph) * 0.7; d.position.z = FIX.pondC.z + Math.sin(ph) * 0.7; d.rotation.y = -ph; });
}
