// People: detailed skinned characters (models.js) driven by verlet active ragdolls.
// Ragdoll rules follow the Ronnie Simulator spec: 0.7x gravity, bouncy landings (0.35),
// a random spin on launch, get up after 2-4 s, max 6 active ragdolls, comic impact words,
// and a teleport-reset if anyone gets stuck.
import * as THREE from 'three';
import { G, V, UP, FIXED, GRAVITY, rand, pick, clamp, emit } from './state.js';
import { collideParticle, findPath, zoneAt, nearestWalkable } from './world.js';
import { Bubble, labelSprite } from './textures.js';
import { buildCharacter, B, SKINS, defaultLook } from './models.js';
import { sfx } from './audio.js';

// Particle indices (0-6 unchanged from before; 7-10 add elbows and knees)
export const HEAD = 0, NECK = 1, PELVIS = 2, LH = 3, RH = 4, LF = 5, RF = 6, LE = 7, RE = 8, LK = 9, RK = 10;
export const NP = 11;
const RADII = [0.13, 0.1, 0.16, 0.06, 0.06, 0.07, 0.07, 0.06, 0.06, 0.075, 0.075].map((r) => r * 1.1);
const RAGDOLL_GRAVITY = 0.7, MAX_RAGDOLLS = 6;

// Local poses for the 7 main particles: [x (right), y (up), z (forward)]. Elbows/knees are solved with IK.
const POSES = {
  stand: [[0, 1.62, 0], [0, 1.4, 0], [0, 0.95, 0], [-0.24, 0.82, 0.03], [0.24, 0.82, 0.03], [-0.11, 0.06, 0], [0.11, 0.06, 0]],
  sit: [[0, 1.17, 0.06], [0, 0.96, 0.0], [0, 0.52, -0.06], [-0.18, 0.8, 0.36], [0.18, 0.8, 0.36], [-0.12, 0.06, 0.44], [0.12, 0.06, 0.44]],
  flex: [[0, 1.62, 0], [0, 1.4, 0], [0, 0.95, 0], [-0.36, 1.58, 0.02], [0.36, 1.58, 0.02], [-0.17, 0.06, 0], [0.17, 0.06, 0]],
  speech: [[0, 1.65, 0.02], [0, 1.42, 0], [0, 0.95, 0], [-0.24, 0.82, 0.04], [0.22, 1.86, 0.12], [-0.11, 0.06, 0], [0.11, 0.06, 0]],
  pressup: [[0, 0.42, 0.78], [0, 0.36, 0.56], [0, 0.3, 0], [-0.22, 0.04, 0.6], [0.22, 0.04, 0.6], [-0.1, 0.06, -0.62], [0.1, 0.06, -0.62]],
  keg: [[0, 1.5, 0.05], [0, 1.3, 0.02], [0, 0.85, -0.05], [-0.2, 1.92, 0.08], [0.2, 1.92, 0.08], [-0.22, 0.06, 0], [0.22, 0.06, 0]],
  phone: [[0, 1.62, 0], [0, 1.4, 0], [0, 0.95, 0], [-0.24, 0.82, 0.03], [0.12, 1.58, 0.14], [-0.11, 0.06, 0], [0.11, 0.06, 0]],
  arms: [[0, 1.62, 0], [0, 1.4, 0], [0, 0.95, 0], [0.08, 1.2, 0.2], [-0.08, 1.22, 0.2], [-0.11, 0.06, 0], [0.11, 0.06, 0]],
};

const CONSTRAINTS = [
  [HEAD, NECK], [NECK, PELVIS], [HEAD, PELVIS],
  [NECK, LE], [LE, LH], [NECK, RE], [RE, RH],
  [PELVIS, LK], [LK, LF], [PELVIS, RK], [RK, RF],
  [LH, PELVIS, 'min'], [RH, PELVIS, 'min'], [LF, RF, 'min'], [LK, RK, 'min'], [LE, RE, 'min'],
  [NECK, LK, 'soft'], [NECK, RK, 'soft'], [HEAD, LE, 'min'], [HEAD, RE, 'min'], [LF, PELVIS, 'min'], [RF, PELVIS, 'min'], [LH, HEAD, 'min'], [RH, HEAD, 'min'],
];

// Old-style options (shirt, hair, camo...) -> a look for models.js
function lookFromOpts(o) {
  if (o.look) return Object.assign({}, o.look);
  const look = {
    scale: o.scale || 1, wide: o.wide || 1, skin: o.skin ?? SKINS.warm, hair: o.hair ?? 0x3b2412,
    hairStyle: o.bald ? 'bald' : o.ponytail ? 'ponytail' : 'short', shirt: o.shirt ?? 0x3366aa, trousers: o.trousers ?? 0x2b2b3b,
    pattern: o.camo ? 'camo' : 'plain', trousersCamo: !!o.camo, hat: o.hat === 'camo' ? 'camo' : (o.hatType || null),
    glasses: !!o.glasses, headband: o.headband || null, apron: o.apron || null, backText: o.kitNumber || null,
    sleeves: o.shortSleeves === false ? 'long' : 'short', shoes: o.shoes ?? 0x222222, headScale: o.headScale || 1,
  };
  return look;
}

function applyCostume(look, costume) {
  if (costume === 'ghost') Object.assign(look, { shirt: 0xf5f5f5, trousers: 0xf5f5f5, skin: 0xf5f5f5, hairStyle: 'bald', jacket: null, hat: null, facial: 'none' });
  if (costume === 'skeleton') Object.assign(look, { shirt: 0x111111, shirt2: 0xeeeeee, pattern: 'hoops', trousers: 0x111111, skin: 0xeeeeee, hairStyle: 'bald', jacket: null });
  if (costume === 'witch') Object.assign(look, { shirt: 0x2a0a3a, trousers: 0x111111, skin: 0x9ccc65, hat: 'witch', jacket: null });
  if (costume === 'pumpkin') Object.assign(look, { shirt: 0xff8f00, jacket: null });
}

// --------------------------------------------------------------- impact words (POW! BOING! WALLOP!)
const words = [];
export function impactWord(pos, text) {
  let w = words.find((x) => x.t <= 0);
  if (!w) {
    if (words.length >= 6) return;
    w = { sprite: labelSprite('POW!', { size: 54, color: '#ffeb3b', stroke: 8, scale: 0.4, w: 256, h: 96, depthTest: false }), t: 0 };
    w.sprite.renderOrder = 12; G.scene.add(w.sprite); words.push(w);
  }
  w.sprite.userData.draw(text || pick(['BOING!', 'POW!', 'WALLOP!', 'BONK!', 'THWACK!']));
  w.sprite.position.copy(pos).add(V(0, 0.35, 0)); w.t = 0.8; w.sprite.visible = true;
}
export function updateImpactWords(dt) {
  for (const w of words) {
    if (w.t <= 0) { w.sprite.visible = false; continue; }
    w.t -= dt;
    const k = 1 - w.t / 0.8, pop = k < 0.2 ? k / 0.2 * 1.3 : 1.3 - (k - 0.2) * 0.4;
    w.sprite.scale.set(0.4 * 2.67 * pop, 0.4 * pop, 1);
    w.sprite.position.y += dt * 0.4;
    w.sprite.material.opacity = Math.min(1, w.t * 3);
  }
}

// --------------------------------------------------------------- Person
const _a = V(), _b = V(), _c = V(), _m = new THREE.Matrix4();

export class Person {
  constructor(opts = {}) {
    this.kind = opts.kind || 'customer';
    this.name = opts.name || '';
    this.look = lookFromOpts(opts);
    if (opts.costume) applyCostume(this.look, opts.costume);
    if (opts.hatType) this.look.hat = opts.hatType;
    if (G.shift?.rules?.bigHeads) this.look.headScale = (this.look.headScale || 1) * 1.7;
    if (G.shift?.rules?.everyoneIan && opts.kind === 'customer') Object.assign(this.look, { pattern: 'camo', trousersCamo: true, hat: 'camo', sleeves: 'long', jacket: null });
    const L = defaultLook(this.look);
    this.scale = L.scale;
    this.wide = L.wide;
    this.hunch = L.hunch || 0;
    this.heavy = opts.heavy || (L.wide > 1.4 ? 2.2 : 1);
    this.walkSpeed = opts.walkSpeed || (L.old ? 0.8 : 1.1);
    this.root = V(opts.x || 0, 0, opts.z || 0);
    this.yaw = opts.yaw || 0;
    this.side = V(1, 0, 0); this.fwd = V(0, 0, 1);
    this.pose = 'stand';
    this.state = 'stand';
    this.phase = rand(0, 6);
    this.path = null; this.onArrive = null;
    this.ragdollTime = 0; this.stillTime = 0;
    this.heldBy = [];
    this.knockCount = 0;
    this.zoneHit = false;
    this.lift = 0;
    this.hidden = false;
    this.noArms = !!opts.noArms;
    this.p = []; this.o = []; this.anim = [];
    for (let i = 0; i < NP; i++) { this.p.push(V()); this.o.push(V()); this.anim.push(V()); }
    this.buildMesh(opts);
    this.bubble = new Bubble({ color: opts.bubbleColor || '#ffffff', name: opts.label || this.name });
    (G.dynamicRoot || G.scene).add(this.bubble.sprite);
    this.computePose();
    for (let i = 0; i < NP; i++) { this.p[i].copy(this.anim[i]); this.o[i].copy(this.anim[i]); }
    this.rest = CONSTRAINTS.map((c) => this.p[c[0]].distanceTo(this.p[c[1]]));
    if (!opts.noRegister) G.people.push(this);
  }

  buildMesh(opts) {
    this.group = new THREE.Group();
    const built = buildCharacter(this.look, { noArms: this.noArms, splitHead: !!opts.splitHead });
    this.mesh = built.mesh; this.headMesh = built.headMesh; this.bones = built.bones; this.dims = built.dims;
    this.headR = built.dims.R;
    this.group.add(this.mesh);
    if (this.headMesh) this.group.add(this.headMesh);
    if (opts.prop) { this.prop = opts.prop; this.group.add(opts.prop); }
    if (opts.tag) { this.nameTag = labelSprite(opts.tag, { size: 30, scale: 0.12, bg: 'rgba(0,0,0,0.55)', stroke: 0 }); this.group.add(this.nameTag); }
    this.stars = labelSprite('✦ ✧ ✦', { size: 40, color: '#ffeb3b', scale: 0.18 });
    this.stars.visible = false; this.group.add(this.stars);
    (G.dynamicRoot || G.scene).add(this.group);
  }

  // ---- Animation -------------------------------------------------------
  setYawVectors(yaw) {
    this.side.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  }

  computePose() {
    const base = POSES[this.pose] || POSES.stand;
    const s = this.scale;
    this.setYawVectors(this.yaw);
    const walking = this.state === 'walk' || this.state === 'run';
    const ph = this.phase;
    const amp = this.state === 'run' ? 0.38 : 0.22;
    const A = this.anim;
    for (let i = 0; i < 7; i++) {
      let [x, y, z] = base[i];
      if (this.pose === 'stand' || this.pose === 'speech' || this.pose === 'phone' || this.pose === 'arms') {
        if ((i === LH || i === RH) && this.pose !== 'arms') x *= 0.8 + 0.25 * this.wide;
        if (walking) {
          if (i === LF) { z += Math.sin(ph) * amp; y += Math.max(0, Math.cos(ph)) * 0.1; }
          if (i === RF) { z -= Math.sin(ph) * amp; y += Math.max(0, -Math.cos(ph)) * 0.1; }
          if (i === LH && this.pose === 'stand') z -= Math.sin(ph) * amp * 0.8;
          if (i === RH && this.pose === 'stand') z += Math.sin(ph) * amp * 0.8;
          if (i <= PELVIS) y += Math.abs(Math.sin(ph)) * 0.04;
          if (this.state === 'run' && i <= NECK) z += 0.12;
        } else if (i === HEAD) x += Math.sin(ph * 0.3) * 0.02;
        if (this.hunch && i <= NECK) { z += i === HEAD ? 0.07 : 0.04; y -= 0.04; }
      }
      if (this.pose === 'sit' && (i === LH || i === RH) && this.eating) y += Math.max(0, Math.sin(ph * 2 + i)) * 0.15;
      if (this.pose === 'flex' && (i === LH || i === RH)) y += Math.sin(ph * 2) * 0.05;
      if (this.pose === 'pressup') { const k = (Math.sin(ph * 1.5) + 1) * 0.5; if (i <= PELVIS) y += k * 0.25 * (i === PELVIS ? 0.4 : 1); }
      if (this.pose === 'speech' && i === RH) x += Math.sin(ph * 2) * 0.15;
      const v = A[i];
      v.copy(this.root).addScaledVector(this.side, x * s).addScaledVector(this.fwd, z * s);
      v.y += y * s + this.lift;
    }
    // Elbows & knees by two-bone IK
    const d = this.dims;
    for (const [sx, hand, elbow] of [[-1, LH, LE], [1, RH, RE]]) {
      _a.copy(A[NECK]).addScaledVector(this.side, sx * d.shoulderX).y -= 0.04 * s;
      _b.copy(this.fwd).multiplyScalar(-1).addScaledVector(this.side, sx * 0.12).add(V(0, -0.2, 0));
      ik(A[elbow], _a, A[hand], d.upper, d.fore, _b);
    }
    for (const [sx, foot, knee] of [[-1, LF, LK], [1, RF, RK]]) {
      _a.copy(A[PELVIS]).addScaledVector(this.side, sx * d.hipX);
      ik(A[knee], _a, A[foot], d.thigh, d.shin, this.fwd);
    }
  }

  // Put every particle straight onto the current pose (teleports).
  snapToPose() { this.computePose(); for (let i = 0; i < NP; i++) { this.p[i].copy(this.anim[i]); this.o[i].copy(this.anim[i]); } }

  setPose(p) { this.pose = p; }

  walkTo(target, onArrive, run = false) {
    this.path = findPath(this.root, target);
    this.target = target.clone();
    this.onArrive = onArrive || null;
    this.state = run ? 'run' : 'walk';
    this.pose = this.pose === 'phone' ? 'phone' : 'stand';
    this.lift = 0;
  }

  stopWalking() { this.path = null; if (this.state === 'walk' || this.state === 'run') this.state = 'stand'; }

  sitAt(seat) { this.root.copy(seat.pos); this.yaw = seat.yaw; this.pose = 'sit'; this.state = 'sit'; this.path = null; }

  faceTowards(p) { this.yaw = Math.atan2(p.x - this.root.x, p.z - this.root.z); }

  // ---- Ragdoll ---------------------------------------------------------
  get isRagdoll() { return this.state === 'ragdoll'; }

  knock(impulse, source = 'hit') {
    if (this.hidden) return false;
    if (this.onBeforeKnock && this.onBeforeKnock(impulse, source) === false) return false;
    const wasRagdoll = this.state === 'ragdoll';
    if (!wasRagdoll) {
      // Quest budget: max 6 active ragdolls; the one that's been down longest gets up.
      const active = G.people.filter((q) => q !== this && q.state === 'ragdoll' && !q.heldBy.length);
      if (active.length >= MAX_RAGDOLLS) active.sort((a, b) => b.ragdollTime - a.ragdollTime)[0].startGetup();
      this.prevState = { state: this.state === 'getup' ? (this.prevState?.state || 'stand') : this.state, pose: this.pose, seat: this.seat };
      this.state = 'ragdoll';
      this.ragdollTime = 0; this.stillTime = 0; this.zoneHit = false; this.prevSp = 0;
      this.getUpAfter = this.getUpDelay || rand(2, 4);
      this.path = null; this.lift = 0;
      this.knockCount++;
      this.stars.visible = false;
    }
    const k = 1 / this.heavy;
    for (let i = 0; i < NP; i++) {
      const extra = (i === HEAD || i === NECK) ? 1.15 : (i === LF || i === RF ? 0.75 : 1);
      this.o[i].addScaledVector(impulse, -FIXED * k * extra);
    }
    const mag = impulse.length();
    if (mag > 2.5 && source !== 'grab') this.spin(Math.min(9, mag * 0.6));
    if (mag > 4 && source !== 'grab') impactWord(this.p[HEAD], source === 'item' ? pick(['SPLAT!', 'CLONK!', 'POW!']) : source === 'ball' ? pick(['BOING!', 'THWACK!']) : undefined);
    if (!wasRagdoll) emit('knocked', this, impulse, source);
    return true;
  }

  // Random tumble on launch (Ronnie Simulator: "a random spin applied on launch").
  spin(rate) {
    const axis = V(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
    const c = this.p[PELVIS];
    for (let i = 0; i < NP; i++) {
      _c.subVectors(this.p[i], c).cross(axis).multiplyScalar(-rate);
      this.o[i].addScaledVector(_c, -FIXED);
    }
  }

  grab(idx, hand) {
    if (this.state !== 'ragdoll') this.knock(V(0, 0.5, 0), 'grab');
    if (this.state !== 'ragdoll') return false;
    this.heldBy.push({ idx, hand });
    return true;
  }
  release(hand, vel) {
    const h = this.heldBy.find((x) => x.hand === hand);
    this.heldBy = this.heldBy.filter((x) => x.hand !== hand);
    if (!h) return;
    const twoHand = this.heldBy.length > 0;
    const power = (this.heavy > 1.5 ? (twoHand ? 0.9 : 0.45) : 1) * (G.shift?.rules?.lowGravity ? 1.2 : 1);
    for (let i = 0; i < NP; i++) {
      const f = i === h.idx ? 1.45 : 0.9;
      this.o[i].copy(this.p[i]).addScaledVector(vel, -FIXED * f * power);
    }
    if (vel.length() > 3) this.spin(Math.min(8, vel.length() * 0.5));
    this.ragdollTime = 0; this.stillTime = 0; this.getUpAfter = this.getUpDelay || rand(2, 4);
    emit('thrown', this, vel.length() * power);
  }

  nearestParticle(pt) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < NP; i++) { const r = RADII[i] * this.scale; const d = this.p[i].distanceToSquared(pt) - r * r; if (d < bd) { bd = d; best = i; } }
    return { idx: best, dist: Math.sqrt(Math.max(0, bd)) };
  }

  stepRagdoll(h) {
    const g = (G.shift?.rules?.lowGravity ? GRAVITY * 0.3 : GRAVITY * RAGDOLL_GRAVITY) * h * h;
    const P = this.p, O = this.o;
    for (let i = 0; i < NP; i++) {
      const p = P[i], o = O[i];
      const vx = (p.x - o.x) * 0.996, vy = (p.y - o.y) * 0.996, vz = (p.z - o.z) * 0.996;
      o.copy(p);
      p.x += vx; p.y += vy - g; p.z += vz;
    }
    const held = this.heldBy;
    for (const hb of held) P[hb.idx].copy(hb.hand.pos);
    for (let it = 0; it < 5; it++) {
      for (let ci = 0; ci < CONSTRAINTS.length; ci++) {
        const c = CONSTRAINTS[ci], a = P[c[0]], b = P[c[1]], rest = this.rest[ci];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (c[2] === 'min' && d > rest * 0.7) continue;
        const target = c[2] === 'min' ? rest * 0.7 : rest;
        const diff = (d - target) / d * (c[2] === 'soft' ? 0.1 : 0.5);
        let wa = 1, wb = 1;
        if (held.length) {
          const pa = held.some((x) => x.idx === c[0]), pb = held.some((x) => x.idx === c[1]);
          wa = pa ? 0 : (pb ? 2 : 1); wb = pb ? 0 : (pa ? 2 : 1);
        }
        a.x += dx * diff * wa; a.y += dy * diff * wa; a.z += dz * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb; b.z -= dz * diff * wb;
      }
      // Knees only bend forwards (stops the legs going full noodle)
      this.kneeHinge(LK, LF); this.kneeHinge(RK, RF);
      for (let i = 0; i < NP; i++) {
        if (held.length && held.some((x) => x.idx === i)) continue;
        const tag = collideParticle(P[i], O[i], RADII[i] * this.scale);
        if (tag === 'fruit' || tag === 'tv') this.lastTag = tag;
      }
    }
    for (const hb of held) P[hb.idx].copy(hb.hand.pos);
  }
  kneeHinge(knee, foot) {
    const P = this.p;
    // torso forward = side x up (same convention as render)
    _b.subVectors(P[RH], P[LH]).add(_c.subVectors(P[RF], P[LF]));
    _c.subVectors(P[NECK], P[PELVIS]);
    const fwd = _b.cross(_c);
    const l = fwd.length(); if (l < 1e-5) return;
    fwd.multiplyScalar(1 / l);
    _a.copy(P[PELVIS]).lerp(P[foot], 0.5);
    const back = _c.subVectors(P[knee], _a).dot(fwd);
    if (back < 0) P[knee].addScaledVector(fwd, -back * 0.5);
  }

  speed() {
    let m = 0;
    for (let i = 0; i < NP; i++) m = Math.max(m, this.p[i].distanceTo(this.o[i]) / FIXED);
    return m;
  }

  updateRagdoll(dt) {
    this.ragdollTime += dt;
    const sp = this.speed();
    if (this.heldBy.length) { this.stillTime = 0; this.prevSp = sp; return; }
    // Hard landing: comic impact word
    if (this.prevSp > 6.5 && sp < this.prevSp * 0.45) { impactWord(this.p[PELVIS], pick(['WALLOP!', 'BOING!', 'THUD!', 'OOF!'])); sfx.boing(); }
    this.prevSp = sp;
    if (sp < 0.6) this.stillTime += dt; else this.stillTime = 0;
    if (!this.zoneHit && this.ragdollTime > 0.15) {
      const z = zoneAt(this.p[PELVIS]);
      if (z) { this.zoneHit = true; emit('zone', this, z); }
    }
    if (this.p[PELVIS].y < -2) { this.startGetup(); return; }
    if ((this.stillTime > 0.8 && this.ragdollTime > this.getUpAfter) || this.ragdollTime > 7) this.startGetup();
  }

  startGetup() {
    this.heldBy.forEach((h) => h.hand.forceRelease && h.hand.forceRelease());
    this.heldBy = [];
    this.state = 'getup';
    this.getupT = 0;
    // Teleport-reset if stuck somewhere nobody can stand (inside furniture, out of bounds)
    const spot = nearestWalkable(V(this.p[PELVIS].x, 0, this.p[PELVIS].z));
    this.root.copy(spot);
    const d = V().subVectors(this.p[HEAD], this.p[PELVIS]); d.y = 0;
    if (d.lengthSq() > 0.01) this.yaw = Math.atan2(d.x, d.z);
    this.pose = 'stand';
    this.from = this.p.map((v) => v.clone());
    this.stars.visible = true; this.starTimer = 2.2;
  }

  // ---- Per-frame -------------------------------------------------------
  update(dt) {
    this.bubble.update(dt);
    if (this.hidden) return;
    this.phase += dt * (this.state === 'run' ? 11 : this.state === 'walk' ? 7 * this.walkSpeed : 2);
    if (this.starTimer > 0) { this.starTimer -= dt; if (this.starTimer <= 0) this.stars.visible = false; }
    if (this.state === 'ragdoll') this.updateRagdoll(dt);
    else if (this.state === 'getup') {
      this.getupT += dt / 0.75;
      this.computePose();
      const t = clamp(this.getupT, 0, 1), e = t * t * (3 - 2 * t);
      for (let i = 0; i < NP; i++) { this.p[i].lerpVectors(this.from[i], this.anim[i], e); this.o[i].copy(this.p[i]); }
      if (this.getupT >= 1) { this.state = 'stand'; emit('gotUp', this); if (this.onGetUp) this.onGetUp(); }
    } else {
      if (this.path && this.path.length) this.followPath(dt);
      this.computePose();
      for (let i = 0; i < NP; i++) { this.o[i].copy(this.p[i]); this.p[i].copy(this.anim[i]); }
    }
    if (this.brain) this.brain(dt);
  }

  followPath(dt) {
    const tgt = this.path[0];
    const dx = tgt.x - this.root.x, dz = tgt.z - this.root.z;
    const d = Math.hypot(dx, dz);
    const sp = (this.state === 'run' ? 4.2 : 1.25) * this.walkSpeed * (this.speedMul || 1);
    if (d < 0.08 + sp * dt) {
      this.root.x = tgt.x; this.root.z = tgt.z;
      this.path.shift();
      if (!this.path.length) {
        this.path = null; this.state = 'stand';
        const cb = this.onArrive; this.onArrive = null;
        if (cb) cb();
      }
      return;
    }
    const want = Math.atan2(dx, dz);
    let dy = want - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);
    this.root.x += (dx / d) * sp * dt;
    this.root.z += (dz / d) * sp * dt;
  }

  // Drive the skeleton from the particles.
  render() {
    this.group.visible = !this.hidden;
    if (this.hidden) { this.bubble.sprite.visible = false; return; }
    const p = this.p, d = this.dims;
    const up = V().subVectors(p[NECK], p[PELVIS]);
    const len = up.length() || 0.01; up.multiplyScalar(1 / len);
    let side;
    if (this.state === 'ragdoll' || this.state === 'getup') {
      side = V().subVectors(p[RH], p[LH]).add(V().subVectors(p[RF], p[LF])).add(V().subVectors(p[RK], p[LK]));
      side.addScaledVector(this.side, 0.6);
    } else side = this.side.clone();
    side.addScaledVector(up, -side.dot(up));
    if (side.lengthSq() < 1e-4) side.copy(this.side);
    side.normalize(); this.side.copy(side);
    const fwd = V().crossVectors(side, up).normalize();
    const bones = this.bones;
    setBasis(bones[B.TORSO], p[PELVIS], side, up, fwd, clamp(len / d.torsoLen, 0.75, 1.3));
    // Head
    const headUp = V().subVectors(p[HEAD], p[NECK]).normalize();
    const hside = side.clone().addScaledVector(headUp, -side.dot(headUp)).normalize();
    const hfwd = V().crossVectors(hside, headUp).normalize();
    setBasis(bones[B.HEAD], p[HEAD], hside, headUp, hfwd, 1);
    const talk = this.talking > 0 ? 1 + Math.abs(Math.sin(performance.now() * 0.02)) * 2.2 : 1;
    const mouthPos = V().copy(p[HEAD]).addScaledVector(headUp, -0.5 * this.headR).addScaledVector(hfwd, 0.9 * this.headR);
    setBasis(bones[B.MOUTH], mouthPos, hside, headUp, hfwd, talk);
    // Limbs
    const sh = (sx) => V().copy(p[NECK]).addScaledVector(side, sx * d.shoulderX).addScaledVector(up, -0.04 * this.scale);
    const hip = (sx) => V().copy(p[PELVIS]).addScaledVector(side, sx * d.hipX);
    limbBone(bones[B.UARM_L], sh(-1), p[LE], side, fwd, d.upper);
    limbBone(bones[B.UARM_R], sh(1), p[RE], side, fwd, d.upper);
    limbBone(bones[B.FARM_L], p[LE], p[LH], side, fwd, d.fore);
    limbBone(bones[B.FARM_R], p[RE], p[RH], side, fwd, d.fore);
    limbBone(bones[B.HAND_L], p[LH], V().copy(p[LH]).multiplyScalar(2).sub(p[LE]), side, fwd, 0);
    limbBone(bones[B.HAND_R], p[RH], V().copy(p[RH]).multiplyScalar(2).sub(p[RE]), side, fwd, 0);
    limbBone(bones[B.THIGH_L], hip(-1), p[LK], side, fwd, d.thigh);
    limbBone(bones[B.THIGH_R], hip(1), p[RK], side, fwd, d.thigh);
    limbBone(bones[B.SHIN_L], p[LK], p[LF], side, fwd, d.shin);
    limbBone(bones[B.SHIN_R], p[RK], p[RF], side, fwd, d.shin);
    footBone(bones[B.FOOT_L], p[LF], p[LK], side);
    footBone(bones[B.FOOT_R], p[RF], p[RK], side);
    if (this.prop) { this.prop.position.copy(p[RH]); this.prop.quaternion.setFromRotationMatrix(_m.makeBasis(side, up, fwd)); }
    const top = this.headR * 1.25;
    if (this.nameTag) this.nameTag.position.copy(p[HEAD]).add(V(0, top + 0.15, 0));
    this.stars.position.copy(p[HEAD]).add(V(0, top + 0.1, 0));
    this.bubble.sprite.position.copy(p[HEAD]).add(V(0, top + 0.42, 0));
    if (this.talking > 0) this.talking -= 1 / 60;
  }

  say(text, opts = {}) {
    this.bubble.say(text, opts.dur || 3.2, opts);
    this.talking = opts.dur || 2;
  }

  bodyDistance(pt) {
    const a = this.p[PELVIS], b = this.p[HEAD];
    const ab = V().subVectors(b, a), ap = V().subVectors(pt, a);
    const t = clamp(ap.dot(ab) / ab.lengthSq(), 0, 1.15);
    const c = a.clone().addScaledVector(ab, t);
    const legs = Math.min(distSeg(pt, this.p[LK], this.p[LF]), distSeg(pt, this.p[RK], this.p[RF]), distSeg(pt, this.p[PELVIS], this.p[LK]), distSeg(pt, this.p[PELVIS], this.p[RK]));
    return Math.min(c.distanceTo(pt) - 0.13 * this.wide * this.scale, legs - 0.06);
  }

  destroy() {
    this.group.parent && this.group.parent.remove(this.group);
    this.bubble.sprite.parent && this.bubble.sprite.parent.remove(this.bubble.sprite);
    const i = G.people.indexOf(this);
    if (i >= 0) G.people.splice(i, 1);
    this.dead = true;
    this.heldBy.forEach((h) => h.hand.forceRelease && h.hand.forceRelease());
  }
}

// --------------------------------------------------------------- helpers
function ik(out, a, c, l1, l2, bendDir) {
  const d = V().subVectors(c, a);
  let dist = d.length();
  if (dist < 1e-5) { out.copy(a).addScaledVector(bendDir, l1); return; }
  d.multiplyScalar(1 / dist);
  dist = clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const bend = V().copy(bendDir).addScaledVector(d, -bendDir.dot(d));
  if (bend.lengthSq() < 1e-6) bend.set(0, 0, 1).addScaledVector(d, -d.z);
  bend.normalize();
  out.copy(a).addScaledVector(d, x).addScaledVector(bend, h);
}

const _q = new THREE.Quaternion();
function setBasis(bone, pos, x, y, z, sy) {
  bone.position.copy(pos);
  bone.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
  bone.scale.set(1, sy, 1);
}
function limbBone(bone, from, to, side, fwd, rest) {
  const y = V().subVectors(to, from);
  const l = y.length() || 1e-4; y.multiplyScalar(1 / l);
  const x = V().copy(side).addScaledVector(y, -side.dot(y));
  if (x.lengthSq() < 1e-4) x.copy(fwd).addScaledVector(y, -fwd.dot(y));
  x.normalize();
  const z = V().crossVectors(x, y);
  setBasis(bone, from, x, y, z, rest ? clamp(l / rest, 0.6, 1.5) : 1);
}
function footBone(bone, foot, knee, side) {
  const y = V().subVectors(knee, foot).normalize();
  const x = V().copy(side).addScaledVector(y, -side.dot(y)).normalize();
  const z = V().crossVectors(x, y);
  setBasis(bone, foot, x, y, z, 1);
}
function distSeg(p, a, b) {
  const ab = V().subVectors(b, a), t = clamp(V().subVectors(p, a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

// Physics step for all ragdolls + ragdoll-vs-people chain reactions.
export function stepPeople(h) {
  for (const per of G.people) if (per.state === 'ragdoll' && !per.hidden) per.stepRagdoll(h);
}

export function peopleInteractions() {
  const rag = G.people.filter((p) => p.state === 'ragdoll' && !p.hidden);
  for (const r of rag) {
    const sp = r.speed();
    if (sp < 2.2 || r.heldBy.length && sp < 3) continue;
    for (const other of G.people) {
      if (other === r || other.hidden || other.state === 'ragdoll' || other.immune) continue;
      for (const i of [HEAD, PELVIS, LF, RF, LK, RK]) {
        if (other.bodyDistance(r.p[i]) < RADII[i] * r.scale + 0.05) {
          const vel = V().subVectors(r.p[i], r.o[i]).multiplyScalar(1 / FIXED);
          if (other.knock(vel.multiplyScalar(0.7), 'bowled')) emit('chain', r, other);
          break;
        }
      }
    }
    for (const it of G.items) {
      if (it.held || it.cls === 'card') continue;
      for (const i of [HEAD, PELVIS, LH, RH, LF, RF, LE, RE, LK, RK]) {
        if (it.pos.distanceTo(r.p[i]) < RADII[i] * r.scale + it.r + 0.03) {
          const vel = V().subVectors(r.p[i], r.o[i]).multiplyScalar(1 / FIXED);
          if (it.frozen) emit('unserve', it);
          it.frozen = false; it.sleeping = false;
          it.vel.copy(vel).multiplyScalar(0.8).add(V(0, 1.2, 0));
          it.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
          break;
        }
      }
    }
  }
}
