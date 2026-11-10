// Character model builder (the Ronnie Simulator cast style): realistic-ish proportions with
// 10-20% caricature, built from many parts but merged into ONE skinned mesh per person
// (rigid skinning: each part follows one bone), so 20+ people stay cheap on Quest.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { pick, rand, chance } from './state.js';

// Bones
export const B = { HEAD: 0, TORSO: 1, UARM_L: 2, UARM_R: 3, FARM_L: 4, FARM_R: 5, HAND_L: 6, HAND_R: 7, THIGH_L: 8, THIGH_R: 9, SHIN_L: 10, SHIN_R: 11, FOOT_L: 12, FOOT_R: 13, MOUTH: 14 };
export const NBONES = 15;

const sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const C = (hex) => new THREE.Color(hex);

// White British skin tones (Ronnie Simulator 80.3) with different undertones.
export const SKINS = { warm: 0xf2c9a8, ruddy: 0xeebba0, fair: 0xf7dcc8, pale: 0xf5e1d3, tan: 0xe9b48a, pink: 0xf3c6b4, old: 0xeec5ad };
const CAMO = [0x5b5f3a, 0x3b3f24, 0x7a6a45, 0x2b2a1e, 0x6f7a48];

// --------------------------------------------------------------- geometry helpers
// Every part: non-indexed geometry with position/normal/color + skinIndex/skinWeight for one bone.
function finish(geo, bone, colorFn) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count, pos = g.attributes.position;
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const color = typeof colorFn === 'function' ? colorFn(m, t / 3) : colorFn;
    for (let k = 0; k < 3; k++) { col[(t + k) * 3] = color.r; col[(t + k) * 3 + 1] = color.g; col[(t + k) * 3 + 2] = color.b; }
  }
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}
const sphere = (r, ws = 12, hs = 9, phiS, phiL, thS, thL) => new THREE.SphereGeometry(r, ws, hs, phiS, phiL, thS, thL);
const xf = (geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
  return geo;
};
// Capsule spanning y = 0..len
function limb(r, len, radial = 8) {
  const mid = Math.max(0.001, len - 2 * r);
  return xf(new THREE.CapsuleGeometry(r, mid, 3, radial), { p: [0, len / 2, 0] });
}
function box(w, h, d, p, r) { return xf(new THREE.BoxGeometry(w, h, d), { p, r }); }

// --------------------------------------------------------------- the look
// Defaults for a generic adult; callers override.
export function defaultLook(o = {}) {
  return Object.assign({
    scale: 1, wide: 1, belly: 0.2, armBulk: 1, legBulk: 1, chest: 1,
    skin: SKINS.warm, cheeks: null, eyes: 0x4a3326,
    hair: 0x3b2412, hairStyle: 'short', facial: 'none', facialColor: null,
    shirt: 0x3366aa, shirt2: null, pattern: 'plain', sleeves: 'short', collar: null,
    trousers: 0x2b2b3b, shorts: false, socks: null, shoes: 0x222222, sliders: false,
    apron: null, backText: null, hat: null, hatColor: null, glasses: false, headband: null, cane: false,
    headScale: 1, kid: false,
  }, o);
}

// --------------------------------------------------------------- build
// Returns { mesh, headMesh (optional), bones, dims, look }
export function buildCharacter(look, opts = {}) {
  const L = defaultLook(look);
  const s = L.scale, w = L.wide;
  const R = 0.118 * s * L.headScale;          // head radius
  const dims = {
    R, s, w,
    torsoLen: 0.45 * s,                        // pelvis -> neck
    shoulderX: (0.17 + 0.03 * L.chest) * s * w,
    hipX: 0.095 * s * w,
    upper: 0.29 * s, fore: 0.27 * s, thigh: 0.45 * s, shin: 0.45 * s,
    depth: 0.62,
  };
  const skin = C(L.skin), hairC = C(L.hair), shirtC = C(L.shirt), shirt2C = C(L.shirt2 ?? L.shirt), trouC = C(L.trousers), shoeC = C(L.shoes);
  const camo = L.pattern === 'camo' || L.camo;
  const rng = mulberry(L.seed ?? Math.floor(Math.random() * 1e9));
  const camoCol = () => C(CAMO[Math.floor(rng() * CAMO.length)]);
  // Shirt colouring by pattern (per triangle so stripes stay crisp)
  const shirtFn = (m) => {
    if (camo) return camoCol();
    if (L.pattern === 'stripes') return Math.floor((Math.atan2(m.x, m.z) + Math.PI) / (Math.PI / 6)) % 2 ? shirtC : shirt2C;
    if (L.pattern === 'hoops') return Math.floor((m.y + 1) / (0.07 * s)) % 2 ? shirtC : shirt2C;
    if (L.pattern === 'halves') return m.x > 0 ? shirtC : shirt2C;
    return shirtC;
  };
  const trouFn = () => (L.trousersCamo || camo ? camoCol() : trouC);
  const parts = [], headParts = [];
  const add = (geo, bone, col) => parts.push(finish(geo, bone, col));
  const addH = (geo, col) => (opts.splitHead ? headParts : parts).push(finish(geo, B.HEAD, col));

  // ---------------- torso (pelvis-local, y up, z forward)
  const T = dims.torsoLen;
  const prof = [[0.001, -0.14], [0.15, -0.13], [0.165, -0.05], [0.16, 0.05], [0.15 + 0.03 * L.belly, 0.14], [0.16 + 0.02 * L.belly, 0.24], [0.17 + 0.02 * L.chest, 0.34], [0.175 + 0.02 * L.chest, 0.40], [0.13, 0.46], [0.001, 0.47]]
    .map(([r, y]) => new THREE.Vector2(r * s, y * s));
  const torso = xf(new THREE.LatheGeometry(prof, 18), { s: [w * (1 + 0.15 * (L.chest - 1)), 1, dims.depth * (1 + 0.15 * L.belly)] });
  const beltY = 0.02 * s;
  add(torso, B.TORSO, (m) => (m.y < beltY ? trouFn() : shirtFn(m)));
  if (L.belly > 0.15) add(xf(sphere(0.14 * s * (0.6 + L.belly * 0.6), 12, 9), { p: [0, 0.12 * s, (0.04 + 0.07 * L.belly) * s], s: [w * 1.05, 0.95, 0.85] }), B.TORSO, (m) => (m.y < beltY ? trouFn() : shirtFn(m)));
  // shoulders + neck
  for (const sx of [-1, 1]) add(xf(sphere(0.075 * s * L.armBulk, 10, 7), { p: [sx * dims.shoulderX, 0.405 * s, 0] }), B.TORSO, shirtFn);
  add(xf(new THREE.CylinderGeometry(0.055 * s * Math.sqrt(w), 0.065 * s * Math.sqrt(w), 0.16 * s, 10), { p: [0, 0.5 * s, 0] }), B.TORSO, skin);
  if (L.collar) add(xf(new THREE.TorusGeometry(0.07 * s * Math.sqrt(w), 0.015 * s, 5, 12), { p: [0, 0.445 * s, 0], r: [Math.PI / 2, 0, 0] }), B.TORSO, C(L.collar));
  if (L.apron) add(box(0.3 * s * w, 0.42 * s, 0.012, [0, 0.08 * s, (0.155 + 0.03 * L.belly) * s * dims.depth * 1.6 + 0.012]), B.TORSO, L.apronCamo ? () => camoCol() : C(L.apron));
  if (L.jacket) { // open cardigan / jacket panels over the shirt
    for (const sx of [-1, 1]) add(box(0.13 * s * w, 0.44 * s, 0.02, [sx * 0.09 * s * w, 0.2 * s, 0.112 * s * w + 0.01 * L.belly]), B.TORSO, C(L.jacket));
    add(xf(new THREE.LatheGeometry(prof.slice(2, 9), 14), { s: [w * 1.04, 1, dims.depth * 1.06 * (1 + 0.15 * L.belly)], r: [0, Math.PI, 0] }), B.TORSO, (m) => (m.z < 0.02 * s ? C(L.jacket) : shirtFn(m)));
  }
  if (L.pocketCan) add(xf(new THREE.CylinderGeometry(0.034, 0.034, 0.15, 8), { p: [0.13 * s * w, -0.08 * s, 0.09 * s] }), B.TORSO, (m) => (m.y > -0.06 * s ? C(0x7cfc00) : C(0x111111)));

  // ---------------- head (head-local: face towards +z)
  const headGeo = xf(sphere(R, 18, 14), { s: [0.9, 1.06, 0.98] });
  addH(headGeo, skin);
  addH(xf(sphere(R * 0.72, 12, 8), { p: [0, -R * 0.42, R * 0.28], s: [1.05 * (L.jaw || 1), 0.8, 0.9] }), skin); // jaw / chin
  for (const sx of [-1, 1]) {
    addH(xf(sphere(R * 0.24, 8, 6), { p: [sx * R * 0.9, -R * 0.02, -R * 0.05], s: [0.45, 1, 0.75] }), skin); // ears
    addH(xf(sphere(R * 0.15, 8, 6), { p: [sx * R * 0.33, R * 0.12, R * 0.82] }), C(0xf8f8f2)); // sclera
    addH(xf(sphere(R * 0.085, 8, 6), { p: [sx * R * 0.33, R * 0.12, R * 0.95] }), C(L.eyes)); // iris
    addH(box(R * 0.36, R * 0.07, R * 0.08, [sx * R * 0.35, R * 0.36, R * 0.9], [0, 0, sx * -0.12]), C(L.brows ?? (L.hairStyle === 'bald' || L.old ? 0xbdbdbd : L.hair))); // brows
    if (L.cheeks) addH(xf(sphere(R * 0.2, 8, 6), { p: [sx * R * 0.48, -R * 0.15, R * 0.68], s: [1, 0.7, 0.4] }), C(L.cheeks));
  }
  addH(xf(new THREE.ConeGeometry(R * 0.14 * (L.nose || 1), R * 0.34 * (L.nose || 1), 6), { p: [0, -R * 0.05, R * 1.02], r: [Math.PI / 2 - 0.25, 0, 0] }), skin);
  buildHair(L, R, addH, hairC, rng);
  buildFacial(L, R, addH);
  buildHat(L, R, addH, camoCol, rng);
  if (L.glasses) for (const sx of [-1, 1]) addH(xf(new THREE.TorusGeometry(R * 0.17, R * 0.025, 4, 12), { p: [sx * R * 0.33, R * 0.12, R * 1.03] }), C(0x111111));
  if (L.glasses) addH(box(R * 0.3, R * 0.03, R * 0.03, [0, R * 0.15, R * 1.04]), C(0x111111));
  // mouth (own bone so it can flap when talking)
  (opts.splitHead ? headParts : parts).push(finish(box(R * 0.36, R * 0.08, R * 0.06, [0, 0, 0]), B.MOUTH, C(0x6a2a2a)));

  // ---------------- arms
  if (!opts.noArms) for (const [ua, fa, hd, sx] of [[B.UARM_L, B.FARM_L, B.HAND_L, -1], [B.UARM_R, B.FARM_R, B.HAND_R, 1]]) {
    const ra = 0.052 * s * Math.sqrt(w) * L.armBulk, rf = 0.043 * s * Math.sqrt(w) * L.armBulk;
    const sleeveLen = L.sleeves === 'long' ? 9 : L.sleeves === 'none' ? 0 : 0.13 * s;
    const sleeveC = L.jacket ? C(L.jacket) : null;
    add(limb(ra, dims.upper), ua, (m) => (m.y < sleeveLen ? (sleeveC || shirtFn(m)) : skin));
    add(limb(rf, dims.fore), fa, (m) => (L.sleeves === 'long' ? (sleeveC || shirtFn(m)) : skin));
    const hand = mergeGeometries([box(0.075 * s, 0.09 * s, 0.032 * s, [0, 0.05 * s, 0]), box(0.07 * s, 0.05 * s, 0.03 * s, [0, 0.105 * s, 0.006 * s], [0.4, 0, 0]), box(0.02 * s, 0.05 * s, 0.022 * s, [sx * 0.045 * s, 0.045 * s, 0.012 * s], [0, 0, sx * 0.5])]);
    add(hand, hd, skin);
  }
  // ---------------- legs
  for (const [th, sh, ft] of [[B.THIGH_L, B.SHIN_L, B.FOOT_L], [B.THIGH_R, B.SHIN_R, B.FOOT_R]]) {
    const rt = 0.075 * s * Math.sqrt(w) * L.legBulk, rs = 0.055 * s * Math.sqrt(w) * L.legBulk;
    add(limb(rt, dims.thigh), th, (m) => (L.shorts && m.y > dims.thigh * 0.55 ? skin : trouFn()));
    const sockC = L.socks ? C(L.socks) : null;
    add(limb(rs, dims.shin), sh, (m) => (L.shorts ? (sockC && m.y < dims.shin * 0.55 ? sockC : skin) : (sockC && m.y < 0.06 * s ? sockC : trouFn())));
    if (L.sliders) {
      add(box(0.1 * s, 0.025 * s, 0.26 * s, [0, -0.045 * s, 0.05 * s]), ft, C(0x111111));
      add(box(0.09 * s, 0.05 * s, 0.2 * s, [0, -0.01 * s, 0.05 * s]), ft, C(L.socks ?? 0xffffff));
      add(box(0.1 * s, 0.03 * s, 0.08 * s, [0, 0.01 * s, 0.07 * s]), ft, C(0x111111));
    } else add(xf(new THREE.BoxGeometry(0.1 * s, 0.075 * s, 0.25 * s), { p: [0, -0.03 * s, 0.05 * s] }), ft, shoeC);
  }

  // ---------------- merge
  const geo = mergeGeometries(parts, false);
  let mat = sharedMat;
  if (L.backText) {
    const plane = xf(new THREE.PlaneGeometry(0.28 * s * w, 0.18 * s), { p: [0, 0.27 * s, -(0.175 * s * dims.depth * 1.02) - 0.006], r: [0, Math.PI, 0] });
    const pf = finish(plane, B.TORSO, C(0xffffff));
    const uv = new THREE.PlaneGeometry(1, 1).toNonIndexed().attributes.uv;
    const all = mergeGeometries([geo, pf], true);
    // uv needed for the text material only; add zeros for the rest
    const uvs = new Float32Array(all.attributes.position.count * 2);
    uvs.set(uv.array, geo.attributes.position.count * 2);
    all.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    mat = [sharedMat, textMaterial(L.backText, L.backTextColor || '#ffffff')];
    return finishMesh(all, mat, opts, headParts, dims, L);
  }
  return finishMesh(geo, mat, opts, headParts, dims, L);
}

function finishMesh(geo, mat, opts, headParts, dims, L) {
  const bones = [];
  for (let i = 0; i < NBONES; i++) bones.push(new THREE.Bone());
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const mesh = new THREE.SkinnedMesh(geo, mat);
  bones.forEach((b) => mesh.add(b));
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;
  let headMesh = null;
  if (headParts.length) {
    headMesh = new THREE.SkinnedMesh(mergeGeometries(headParts, false), sharedMat);
    headMesh.bind(skeleton, new THREE.Matrix4());
    headMesh.frustumCulled = false;
  }
  return { mesh, headMesh, bones, dims, look: L };
}

function textMaterial(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  const parts = String(text).split(' ');
  const num = parts.pop(), name = parts.join(' ');
  if (name) { x.font = 'bold 34px Arial'; x.fillText(name, 128, 34, 240); }
  x.font = 'bold 92px Arial'; x.fillText(num, 128, name ? 104 : 80);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4 });
}

// --------------------------------------------------------------- hair, beards, hats
function buildHair(L, R, addH, hairC, rng) {
  const st = L.hairStyle;
  const cap = (k, th = 0.55, back = 0) => xf(sphere(R * k, 16, 10, 0, Math.PI * 2, 0, Math.PI * th), { r: [-0.25 - back, 0, 0], s: [0.93, 1.06, 1.0] });
  if (st === 'none' || st === 'bald') return;
  if (st === 'baldring') { addH(xf(new THREE.TorusGeometry(R * 0.86, R * 0.13, 6, 16, Math.PI * 1.25), { p: [0, R * 0.08, -R * 0.05], r: [Math.PI / 2, 0, Math.PI * 1.375] }), hairC); return; }
  if (st === 'buzz') { addH(cap(1.02, 0.52), hairC); return; }
  if (st === 'combover') { addH(cap(1.015, 0.5), hairC); addH(xf(new THREE.TorusGeometry(R * 0.86, R * 0.12, 6, 16, Math.PI * 1.25), { p: [0, R * 0.05, -R * 0.05], r: [Math.PI / 2, 0, Math.PI * 1.375] }), hairC); return; }
  addH(cap(1.07, 0.58), hairC);
  if (st === 'short') { addH(xf(sphere(R * 0.95, 12, 8), { p: [0, R * 0.12, -R * 0.12], s: [0.98, 0.95, 0.95] }), hairC); }
  if (st === 'curtains' || st === 'mullet') {
    for (const sx of [-1, 1]) addH(box(R * 0.55, R * 0.12, R * 0.35, [sx * R * 0.32, R * 0.68, R * 0.62], [0.5, 0, sx * -0.45]), hairC);
  }
  if (st === 'mullet') {
    addH(box(R * 1.3, R * 0.9, R * 0.35, [0, -R * 0.45, -R * 0.82], [0.15, 0, 0]), hairC);
    for (let i = 0; i < 12; i++) { const a = rng() * Math.PI * 2, b = rng() * 0.9; addH(xf(new THREE.IcosahedronGeometry(R * 0.2, 0), { p: [Math.cos(a) * R * 0.75 * Math.sin(b + 0.3), R * (0.75 + rng() * 0.25), Math.sin(a) * R * 0.7 * Math.sin(b + 0.3) - R * 0.05] }), hairC); }
  }
  if (st === 'curls') for (let i = 0; i < 18; i++) { const a = rng() * Math.PI * 2, b = rng() * 1.0; addH(xf(new THREE.IcosahedronGeometry(R * 0.2, 0), { p: [Math.cos(a) * R * 0.85 * Math.sin(b + 0.25), R * (0.72 + rng() * 0.3), Math.sin(a) * R * 0.85 * Math.sin(b + 0.25)] }), hairC); }
  if (st === 'tucked') for (const sx of [-1, 1]) addH(box(R * 0.25, R * 1.0, R * 0.7, [sx * R * 0.85, -R * 0.15, -R * 0.35], [0, 0, sx * 0.05]), hairC);
  if (st === 'ponytail' || st === 'long') {
    addH(xf(sphere(R * 0.99, 12, 8), { p: [0, R * 0.05, -R * 0.14] }), hairC);
    if (st === 'ponytail') {
      addH(xf(new THREE.TorusGeometry(R * 0.16, R * 0.06, 5, 10), { p: [0, R * 0.35, -R * 1.0], r: [0.4, 0, 0] }), C(L.scrunchie ?? 0x29b6f6));
      addH(xf(new THREE.ConeGeometry(R * 0.24, R * 1.5, 8), { p: [0, -R * 0.35, -R * 1.18], r: [Math.PI + 0.35, 0, 0] }), hairC);
    } else addH(box(R * 1.7, R * 1.6, R * 0.4, [0, -R * 0.6, -R * 0.7]), hairC);
  }
}

function buildFacial(L, R, addH) {
  const col = C(L.facialColor ?? L.hair), f = L.facial;
  if (!f || f === 'none') return;
  const tache = () => addH(box(R * 0.5, R * 0.1, R * 0.12, [0, -R * 0.3, R * 0.98], [0.1, 0, 0]), col);
  if (f === 'goatee') { tache(); addH(box(R * 0.3, R * 0.32, R * 0.15, [0, -R * 0.78, R * 0.75], [0.35, 0, 0]), col); for (const sx of [-1, 1]) addH(box(R * 0.08, R * 0.38, R * 0.1, [sx * R * 0.24, -R * 0.55, R * 0.9]), col); }
  if (f === 'beard' || f === 'shortbeard') {
    addH(xf(sphere(R * (f === 'beard' ? 1.06 : 1.02), 14, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), { p: [0, -R * 0.08, R * 0.12], s: [0.95, f === 'beard' ? 1.2 : 1.05, 1.0] }), col);
    tache();
  }
  if (f === 'stubble' || f === 'patchy') {
    const n = f === 'patchy' ? 7 : 14;
    for (let i = 0; i < n; i++) { const a = -1.2 + (i / (n - 1)) * 2.4; addH(box(R * 0.2, R * 0.16, R * 0.03, [Math.sin(a) * R * 0.75, -R * (0.45 + 0.2 * Math.cos(a * 2)), Math.cos(a) * R * 0.8 + R * 0.05], [0, a, 0]), col); }
  }
  if (f === 'moustache') tache();
  if (f === 'walrus') addH(box(R * 0.6, R * 0.18, R * 0.16, [0, -R * 0.33, R * 0.98], [0.1, 0, 0]), col);
}

function buildHat(L, R, addH, camoCol, rng) {
  const h = L.hat;
  if (!h) { if (L.headband) addH(xf(new THREE.TorusGeometry(R * 0.98, R * 0.08, 5, 16), { p: [0, R * 0.38, 0], r: [Math.PI / 2 + 0.2, 0, 0] }), C(L.headband)); return; }
  const hc = L.hatColor ? C(L.hatColor) : null;
  if (h === 'camo') {
    addH(xf(new THREE.CylinderGeometry(R * 0.95, R * 1.08, R * 0.55, 14), { p: [0, R * 0.72, -R * 0.03] }), () => camoCol());
    addH(xf(new THREE.CylinderGeometry(R * 1.6, R * 1.6, R * 0.06, 16), { p: [0, R * 0.48, -R * 0.03] }), () => camoCol());
  }
  if (h === 'flatcap') {
    addH(xf(sphere(R * 1.08, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), { p: [0, R * 0.12, -R * 0.02], s: [1.0, 0.75, 1.1] }), hc || C(0x6d5a43));
    addH(box(R * 1.4, R * 0.06, R * 0.6, [0, R * 0.55, R * 0.85], [0.18, 0, 0]), hc || C(0x6d5a43));
  }
  if (h === 'santa') {
    addH(xf(new THREE.ConeGeometry(R * 1.0, R * 1.8, 12), { p: [0, R * 1.3, -R * 0.1], r: [-0.25, 0, 0.2] }), C(0xd32f2f));
    addH(xf(new THREE.TorusGeometry(R * 0.95, R * 0.2, 6, 14), { p: [0, R * 0.55, -R * 0.03], r: [Math.PI / 2, 0, 0] }), C(0xffffff));
  }
  if (h === 'witch') {
    addH(xf(new THREE.ConeGeometry(R * 0.9, R * 2.4, 12), { p: [0, R * 1.65, 0] }), C(0x111111));
    addH(xf(new THREE.CylinderGeometry(R * 1.8, R * 1.8, R * 0.06, 16), { p: [0, R * 0.55, 0] }), C(0x111111));
  }
  if (h === 'chef') addH(xf(new THREE.CylinderGeometry(R * 1.05, R * 0.9, R * 1.3, 12), { p: [0, R * 1.2, -R * 0.05] }), C(0xffffff));
  if (h === 'beanie') addH(xf(sphere(R * 1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), { p: [0, R * 0.05, 0] }), hc || C(0x263238));
  if (h === 'monster') { addH(xf(new THREE.CylinderGeometry(R * 0.5, R * 0.5, R * 1.4, 12), { p: [0, R * 1.5, 0] }), (m) => (Math.abs(m.x) < R * 0.15 && m.z > 0 ? C(0x7cfc00) : C(0x111111))); }
  if (L.headband) addH(xf(new THREE.TorusGeometry(R * 0.98, R * 0.08, 5, 16), { p: [0, R * 0.38, 0], r: [Math.PI / 2 + 0.2, 0, 0] }), C(L.headband));
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// --------------------------------------------------------------- cast (Ronnie Simulator 59.2 / 80.3, plus Lewis Simulator's own)
export const CAST = {
  // Ronnie: 5ft 10, black buzz cut, black goatee + moustache, blue "Kings Road FC" shirt RONNIE 10,
  // grey joggers, white socks, black sliders, MONSTOR can in his pocket. Light warm skin, ruddy cheeks.
  ronnie: () => ({ scale: 1.02, wide: 1.25, belly: 0.75, chest: 1.1, armBulk: 1.1, skin: SKINS.warm, cheeks: 0xe89a86, eyes: 0x5a3a22,
    hair: 0x141414, hairStyle: 'buzz', facial: 'goatee', facialColor: 0x141414,
    shirt: 0x1d4fd8, collar: 0xffffff, backText: 'RONNIE 10', trousers: 0x9e9e9e, socks: 0xffffff, sliders: true, pocketCan: true }),
  // Lewis: 6ft 3 (in-game 30cm taller still), huge V-shaped gym bro, curly brown mullet/curtains, patchy stubble,
  // gym-tan with a slightly orange sheen, Crystal Palace-style red & blue stripes, Oysterfleet apron for work.
  lewis: () => ({ scale: 1.27, wide: 1.2, belly: 0, chest: 1.6, armBulk: 1.25, legBulk: 1.1, skin: 0xf0b48c, eyes: 0x3d6fb5,
    hair: 0x5a3825, hairStyle: 'mullet', facial: 'patchy', facialColor: 0x4a2f1c,
    shirt: 0xe8303a, shirt2: 0x1b3fa0, pattern: 'stripes', backText: 'LEWIS 6', apron: 0x1d3b2a, trousers: 0x222222, shoes: 0x111111 }),
  // Ian: Lewis's dad. Big lad (about Noah's size), white skin, grey hair, full camo every single shift.
  ian: () => ({ scale: 1.0, wide: 1.6, belly: 1.0, chest: 1.2, armBulk: 1.2, legBulk: 1.15, skin: SKINS.fair, cheeks: 0xf0a898, eyes: 0x6a7d8c,
    hair: 0xa9a9a9, hairStyle: 'short', facial: 'none', pattern: 'camo', trousersCamo: true, sleeves: 'long', hat: 'camo', shoes: 0x4e342e, brows: 0x9e9e9e }),
  // Hollie: ginger, white skin, sporty runner. Same detail level as the others.
  hollie: () => ({ scale: 0.95, wide: 0.88, belly: 0, chest: 0.85, armBulk: 0.85, legBulk: 0.92, skin: SKINS.pale, cheeks: 0xf2b0a0, eyes: 0x4f7a3a,
    hair: 0xc8501e, hairStyle: 'ponytail', scrunchie: 0x29b6f6, headband: 0x29b6f6, brows: 0xa04a20, jaw: 0.85, nose: 0.8,
    shirt: 0xff4f8b, sleeves: 'none', trousers: 0x1a1a1a, shoes: 0x29b6f6 }),
  // The lads (Ronnie Simulator 59.2)
  Tommy: () => ({ scale: 0.96, wide: 1.0, chest: 1.3, armBulk: 1.05, skin: SKINS.tan, hair: 0x6b4423, hairStyle: 'curtains', facial: 'shortbeard', facialColor: 0x8a6a45, eyes: 0x6a7f8f, shirt: 0xffd54a, trousers: 0x37474f }),
  'Harry H': () => ({ scale: 1.05, wide: 0.85, armBulk: 0.85, skin: SKINS.pale, hair: 0x1a1a1a, hairStyle: 'curls', facial: 'shortbeard', facialColor: 0x1a1a1a, shirt: 0x7a1f3d, shirt2: 0x8ecae6, pattern: 'halves', backText: 'HARRY 8' }),
  Aidan: () => ({ scale: 1.02, wide: 1.05, belly: 0.3, skin: SKINS.pink, cheeks: 0xf0a090, hair: 0x111111, hairStyle: 'tucked', facial: 'beard', facialColor: 0x111111, eyes: 0x3f7a4a, shirt: 0x7a1f3d, shirt2: 0x8ecae6, pattern: 'halves' }),
  Noah: () => ({ scale: 0.99, wide: 1.6, belly: 0.9, chest: 1.3, armBulk: 1.2, legBulk: 1.2, skin: SKINS.ruddy, cheeks: 0xe58e80, hair: 0x5a3825, hairStyle: 'short', facial: 'stubble', facialColor: 0x5a3825, eyes: 0x3d6fb5, shirt: 0xc62828, backText: 'NOAH 9' }),
  Oliver: () => ({ scale: 1.0, wide: 1.0, hair: 0x6b4423, hairStyle: 'short', facial: 'beard', facialColor: 0x5a3825, glasses: true, shirt: 0xffffff, shirt2: 0x1a237e, pattern: 'hoops' }),
  Dylan: () => ({ scale: 0.94, wide: 0.85, skin: SKINS.ruddy, hair: 0x111111, hairStyle: 'short', facial: 'goatee', facialColor: 0x222222, shirt: 0x7a1f3d, shirt2: 0x8ecae6, pattern: 'halves', jacket: 0x33691e }),
};

// The locals: old men (and the odd grandkid).
export function oldManLook(extra = {}) {
  const tops = [0x8d6e63, 0x6d4c41, 0x795548, 0x5d4037, 0x9e9d24, 0x455a64, 0x7b1f3a, 0x37474f, 0xbcaaa4, 0x827717];
  const shirts = [0xeceff1, 0xd7ccc8, 0xbbdefb, 0xc5e1a5, 0xfff3e0];
  const hairs = [0xdedede, 0xbdbdbd, 0x9e9e9e, 0xf0f0f0, 0x8d8d8d];
  const look = {
    old: true, scale: rand(0.9, 1.0), wide: rand(0.95, 1.35), belly: rand(0.3, 1.0), chest: 0.9, armBulk: 0.9,
    skin: pick([SKINS.old, SKINS.pink, SKINS.fair, SKINS.ruddy]), cheeks: chance(0.5) ? 0xe9a090 : null, eyes: pick([0x6a7d8c, 0x5a3a22, 0x3d6fb5]),
    hair: pick(hairs), hairStyle: pick(['baldring', 'baldring', 'combover', 'short', 'bald']), facial: pick(['none', 'moustache', 'moustache', 'walrus', 'shortbeard']),
    nose: rand(1.1, 1.4), shirt: pick(shirts), jacket: pick(tops), sleeves: 'long', collar: chance(0.5) ? 0xffffff : null,
    trousers: pick([0x5d4f3a, 0x757575, 0x8d7b62, 0x4e4e5a, 0x6d6d50]), shoes: pick([0x3e2723, 0x111111, 0x5d4037]),
    glasses: chance(0.5), hat: chance(0.45) ? 'flatcap' : null, hatColor: pick([0x6d5a43, 0x5d4f3a, 0x4e4a3a, 0x7b6b55]), hunch: 1,
  };
  look.facialColor = look.hair;
  return Object.assign(look, extra);
}
export function kidLook(extra = {}) {
  return Object.assign({ scale: 0.62, headScale: 1.25, wide: 0.9, skin: pick([SKINS.fair, SKINS.pale, SKINS.pink]), hair: pick([0x6b4423, 0xd9a05b, 0x3b2412]), hairStyle: 'short', shirt: pick([0x4a7bd1, 0xd14a6b, 0x6bd14a, 0xe0c040]), trousers: 0x37474f, kid: true }, extra);
}
