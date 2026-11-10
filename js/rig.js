// Real character models (Tripo scans, decimated to ~20k tris): auto-rigged at load time so they
// walk, sit and ragdoll with the same particle skeleton as everyone else.
import * as THREE from 'three';
import { G } from './state.js';
import { loadGLB } from './glb.js';
import { B, NBONES } from './models.js';

// Joint positions measured in model space (model is ~0.975 tall, facing +z).
// L = the -x side (our left-hand particles), R = mirror.
export const RIGS = {
  lewis: {
    url: 'models/lewis.glb', height: 2.22, // Lewis: 6ft 3 in real life, +30cm in the game
    head: [0, 0.90, -0.067], headTop: 0.975, shoulder: [0.12, 0.80, -0.085], elbow: [0.20, 0.665, -0.03], wrist: [0.175, 0.66, 0.09], tip: [0.15, 0.655, 0.18],
    pelvis: [0, 0.48, -0.07], hipX: 0.055, knee: [0.067, 0.297, -0.10], ankle: [0.075, 0.10, -0.13], toe: [0.075, 0.03, -0.01], centerZ: -0.08,
  },
  ian: {
    url: 'models/ian.glb', height: 1.75, // big lad, about Noah's size
    head: [0, 0.90, 0.012], headTop: 0.975, shoulder: [0.128, 0.78, -0.02], elbow: [0.257, 0.772, -0.02], wrist: [0.385, 0.772, -0.02], tip: [0.48, 0.775, -0.02],
    pelvis: [0, 0.443, 0], hipX: 0.065, knee: [0.07, 0.236, 0.0], ankle: [0.085, 0.052, -0.03], toe: [0.085, 0.02, 0.09], centerZ: 0,
  },
  ben: {
    url: 'models/ben.glb', height: 1.80,
    head: [0, 0.908, 0.03], headTop: 0.98, shoulder: [0.134, 0.78, 0], elbow: [0.235, 0.762, 0], wrist: [0.35, 0.762, 0], tip: [0.49, 0.76, 0],
    pelvis: [0, 0.455, 0], hipX: 0.06, knee: [0.07, 0.248, 0.0], ankle: [0.075, 0.064, -0.02], toe: [0.075, 0.02, 0.09], centerZ: 0,
  },
};

export async function preloadModels() {
  G.models = G.models || {};
  await Promise.all(Object.entries(RIGS).map(async ([name, r]) => {
    try { G.models[name] = await loadGLB(r.url); } catch (e) { console.warn('Model failed to load, using the built-in look instead:', name, e); }
  }));
}
export const hasModel = (name) => !!(G.models && G.models[name]);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
function basis(origin, x, y, z) { return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin); }
function limbBasis(from, to, side) {
  const y = to.clone().sub(from).normalize();
  const x = side.clone().addScaledVector(y, -side.dot(y));
  if (x.lengthSq() < 1e-6) x.set(0, 0, 1).addScaledVector(y, -y.z);
  x.normalize();
  return basis(from, x, y, new THREE.Vector3().crossVectors(x, y));
}
function distSeg(p, a, b) {
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

// Build a skinned mesh for a model. Returns the same shape of object as models.buildCharacter.
export function buildFromModel(name, opts = {}) {
  const src = G.models[name], R = RIGS[name];
  const S = R.height / R.headTop;
  const P = (a, sx = 1) => V(a[0] * sx * S, a[1] * S, (a[2] - R.centerZ) * S);
  // Joints in world units (bind pose, character at origin facing +z). "L" particles live on -x.
  const J = {
    head: P(R.head), pelvis: P(R.pelvis),
    shL: P(R.shoulder, -1), shR: P(R.shoulder), elL: P(R.elbow, -1), elR: P(R.elbow), wrL: P(R.wrist, -1), wrR: P(R.wrist), tipL: P(R.tip, -1), tipR: P(R.tip),
    knL: P(R.knee, -1), knR: P(R.knee), anL: P(R.ankle, -1), anR: P(R.ankle), toL: P(R.toe, -1), toR: P(R.toe),
  };
  const k = (J.head.y - J.anL.y) / 1.56; // relative size vs the generic 1.75m person
  J.neck = V(0, J.shR.y + 0.04 * k, (J.shR.z + J.shL.z) / 2); // neck particle sits just above the shoulder line (matches render)
  J.hipL = J.pelvis.clone().add(V(-R.hipX * S, 0, 0)); J.hipR = J.pelvis.clone().add(V(R.hipX * S, 0, 0));
  const side = V(1, 0, 0);
  const up = J.neck.clone().sub(J.pelvis).normalize();
  const fwd = new THREE.Vector3().crossVectors(side, up).normalize();
  const headUp = J.head.clone().sub(J.neck).normalize();
  const hside = side.clone().addScaledVector(headUp, -side.dot(headUp)).normalize();
  // Bind matrices, built exactly like Person.render() builds the live ones
  const bind = [];
  bind[B.HEAD] = basis(J.head, hside, headUp, new THREE.Vector3().crossVectors(hside, headUp));
  bind[B.TORSO] = basis(J.pelvis, side, up, fwd);
  bind[B.UARM_L] = limbBasis(J.shL, J.elL, side); bind[B.UARM_R] = limbBasis(J.shR, J.elR, side);
  bind[B.FARM_L] = limbBasis(J.elL, J.wrL, side); bind[B.FARM_R] = limbBasis(J.elR, J.wrR, side);
  bind[B.HAND_L] = limbBasis(J.wrL, J.wrL.clone().multiplyScalar(2).sub(J.elL), side); bind[B.HAND_R] = limbBasis(J.wrR, J.wrR.clone().multiplyScalar(2).sub(J.elR), side);
  bind[B.THIGH_L] = limbBasis(J.hipL, J.knL, side); bind[B.THIGH_R] = limbBasis(J.hipR, J.knR, side);
  bind[B.SHIN_L] = limbBasis(J.knL, J.anL, side); bind[B.SHIN_R] = limbBasis(J.knR, J.anR, side);
  bind[B.FOOT_L] = limbBasis(J.anL, J.knL, side); bind[B.FOOT_R] = limbBasis(J.anR, J.knR, side);
  bind[B.MOUTH] = basis(J.head, hside, headUp, new THREE.Vector3().crossVectors(hside, headUp));

  // Segments for skin weights
  const top = V(0, R.headTop * S, J.head.z);
  const seg = [];
  seg[B.HEAD] = [J.neck.clone().lerp(J.head, 0.35), top];
  seg[B.TORSO] = [J.pelvis.clone().add(V(0, -0.05 * S, 0)), J.neck];
  seg[B.UARM_L] = [J.shL, J.elL]; seg[B.UARM_R] = [J.shR, J.elR];
  seg[B.FARM_L] = [J.elL, J.wrL]; seg[B.FARM_R] = [J.elR, J.wrR];
  seg[B.HAND_L] = [J.wrL, J.tipL]; seg[B.HAND_R] = [J.wrR, J.tipR];
  seg[B.THIGH_L] = [J.hipL, J.knL]; seg[B.THIGH_R] = [J.hipR, J.knR];
  seg[B.SHIN_L] = [J.knL, J.anL]; seg[B.SHIN_R] = [J.knR, J.anR];
  seg[B.FOOT_L] = [J.anL, J.toL]; seg[B.FOOT_R] = [J.anR, J.toR];
  // Torso is fat: bias distances so belly/back vertices stay on the torso
  const bias = []; bias[B.TORSO] = -0.06 * S; bias[B.HEAD] = 0.0;

  const geo = src.geometry.clone();
  geo.applyMatrix4(new THREE.Matrix4().makeScale(S, S, S).setPosition(0, 0, -R.centerZ * S));
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), primary = new Uint8Array(n);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    let b1 = B.TORSO, d1 = 1e9, b2 = B.TORSO, d2 = 1e9;
    for (let b = 0; b < NBONES; b++) {
      if (!seg[b]) continue;
      if (b === B.HEAD && p.y < J.neck.y - 0.01 * S) continue;
      if ((b === B.THIGH_L || b === B.THIGH_R) && p.y > J.pelvis.y + 0.03 * S) continue;
      if ((b === B.UARM_L || b === B.UARM_R) && p.y < J.pelvis.y) continue;
      let d = distSeg(p, seg[b][0], seg[b][1]) + (bias[b] || 0);
      if ((b === B.UARM_L || b === B.FARM_L || b === B.HAND_L || b === B.THIGH_L || b === B.SHIN_L || b === B.FOOT_L) && p.x > 0.02 * S) d += 1;
      if ((b === B.UARM_R || b === B.FARM_R || b === B.HAND_R || b === B.THIGH_R || b === B.SHIN_R || b === B.FOOT_R) && p.x < -0.02 * S) d += 1;
      if (d < d1) { b2 = b1; d2 = d1; b1 = b; d1 = d; } else if (d < d2) { b2 = b; d2 = d; }
    }
    const pair = (x, y) => (b1 === x && b2 === y) || (b1 === y && b2 === x);
    const soft = pair(B.TORSO, B.UARM_L) || pair(B.TORSO, B.UARM_R) || pair(B.TORSO, B.THIGH_L) || pair(B.TORSO, B.THIGH_R) || pair(B.TORSO, B.HEAD);
    const blend = (soft ? 0.07 : 0.035) * S;
    let w1 = 1;
    if (d2 - d1 < blend) w1 = 0.5 + 0.5 * (d2 - d1) / blend;
    si[i * 4] = b1; sw[i * 4] = w1; si[i * 4 + 1] = b2; sw[i * 4 + 1] = 1 - w1;
    primary[i] = b1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));

  // Split triangles: head (selfie layer) and dropped arms (player body) if asked
  const idx = geo.index.array, body = [], head = [];
  const armBones = new Set([B.FARM_L, B.FARM_R, B.HAND_L, B.HAND_R]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = primary[idx[t]], b = primary[idx[t + 1]], c = primary[idx[t + 2]];
    if (opts.noArms && (armBones.has(a) || armBones.has(b) || armBones.has(c))) continue;
    const isHead = opts.splitHead && (a === B.HEAD || b === B.HEAD || c === B.HEAD);
    (isHead ? head : body).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const mat = new THREE.MeshLambertMaterial({ map: src.map, normalMap: src.normalMap });
  const mkMesh = (list) => {
    const g = new THREE.BufferGeometry();
    for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
    g.setIndex(list);
    const m = new THREE.SkinnedMesh(g, mat);
    m.frustumCulled = false;
    return m;
  };
  const bones = [];
  for (let i = 0; i < NBONES; i++) bones.push(new THREE.Bone());
  const skeleton = new THREE.Skeleton(bones, bind.map((m) => m.clone().invert()));
  const mesh = mkMesh(body);
  bones.forEach((b) => mesh.add(b));
  mesh.bind(skeleton, new THREE.Matrix4());
  let headMesh = null;
  if (opts.splitHead) { headMesh = mkMesh(head); headMesh.bind(skeleton, new THREE.Matrix4()); }

  return {
    mesh, headMesh, bones,
    dims: {
      R: top.y - J.head.y, s: k, w: 1, torsoLen: J.neck.distanceTo(J.pelvis), shoulderX: Math.abs(J.shR.x), hipX: R.hipX * S,
      upper: J.shR.distanceTo(J.elR), fore: J.elR.distanceTo(J.wrR), thigh: J.hipR.distanceTo(J.knR), shin: J.knR.distanceTo(J.anR), depth: 0.62,
    },
    poseMap: { foot: J.anR.y, pelvis: J.pelvis.y, neck: J.neck.y, head: J.head.y, k },
    imported: true,
  };
}
