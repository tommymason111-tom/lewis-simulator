// Chunky low-poly people with verlet active ragdolls.
import * as THREE from 'three';
import { G, V, UP, FIXED, GRAVITY, rand, pick, clamp, emit } from './state.js';
import { collideParticle, findPath, zoneAt, mat } from './world.js';
import { Bubble, labelSprite, camoTexture } from './textures.js';

// Particle indices
export const HEAD = 0, NECK = 1, PELVIS = 2, LH = 3, RH = 4, LF = 5, RF = 6;
const RADII = [0.19, 0.12, 0.15, 0.08, 0.08, 0.08, 0.08];

// Local poses: [x (right), y (up), z (forward)]
const POSES = {
  stand: [[0, 1.62, 0], [0, 1.4, 0], [0, 0.95, 0], [-0.3, 0.9, 0.02], [0.3, 0.9, 0.02], [-0.12, 0.06, 0], [0.12, 0.06, 0]],
  sit: [[0, 1.2, 0.04], [0, 0.98, 0.0], [0, 0.52, -0.06], [-0.2, 0.82, 0.38], [0.2, 0.82, 0.38], [-0.13, 0.06, 0.42], [0.13, 0.06, 0.42]],
  flex: [[0, 1.62, 0], [0, 1.4, 0], [0, 0.95, 0], [-0.42, 1.55, 0.05], [0.42, 1.55, 0.05], [-0.18, 0.06, 0], [0.18, 0.06, 0]],
  speech: [[0, 1.65, 0.02], [0, 1.42, 0], [0, 0.95, 0], [-0.3, 0.9, 0.05], [0.25, 1.85, 0.1], [-0.12, 0.06, 0], [0.12, 0.06, 0]],
  pressup: [[0, 0.4, 0.75], [0, 0.35, 0.55], [0, 0.3, 0], [-0.25, 0.04, 0.55], [0.25, 0.04, 0.55], [-0.1, 0.06, -0.55], [0.1, 0.06, -0.55]],
  keg: [[0, 1.5, 0.05], [0, 1.3, 0.02], [0, 0.85, -0.05], [-0.25, 1.95, 0.05], [0.25, 1.95, 0.05], [-0.25, 0.06, 0], [0.25, 0.06, 0]],
  phone: [[0, 1.62, 0], [0, 1.4, 0], [0, 0.95, 0], [-0.3, 0.9, 0.02], [0.12, 1.6, 0.05], [-0.12, 0.06, 0], [0.12, 0.06, 0]],
};

const CONSTRAINTS = [[HEAD, NECK], [NECK, PELVIS], [HEAD, PELVIS], [NECK, LH], [NECK, RH], [PELVIS, LF], [PELVIS, RF], [LH, PELVIS, 'min'], [RH, PELVIS, 'min'], [LF, RF, 'min'], [NECK, LF, 'soft'], [NECK, RF, 'soft']];

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5d0b0];
const HAIR = [0x2b1b0e, 0x5a3825, 0x111111, 0xb5651d, 0xd9c48c, 0x8e8e8e];

const geoCache = {};
const G_ = (k, f) => (geoCache[k] ||= f());

export class Person {
  constructor(opts = {}) {
    this.kind = opts.kind || 'customer';
    this.name = opts.name || '';
    this.scale = opts.scale || 1;
    this.wide = opts.wide || 1;
    this.heavy = opts.heavy || 1;
    this.walkSpeed = opts.walkSpeed || 1.1;
    this.root = V(opts.x || 0, 0, opts.z || 0);
    this.yaw = opts.yaw || 0;
    this.side = V(1, 0, 0); this.fwd = V(0, 0, 1);
    this.pose = 'stand';
    this.state = 'stand';
    this.phase = rand(0, 6);
    this.path = null; this.onArrive = null;
    this.ragdollTime = 0; this.stillTime = 0;
    this.heldBy = []; // hands holding particles
    this.knockCount = 0;
    this.zoneHit = false;
    this.lift = 0; // vertical offset (standing on chair)
    this.hidden = false;
    this.p = []; this.o = [];
    for (let i = 0; i < 7; i++) { this.p.push(V()); this.o.push(V()); }
    this.anim = []; for (let i = 0; i < 7; i++) this.anim.push(V());
    this.buildMesh(opts);
    this.bubble = new Bubble({ color: opts.bubbleColor || '#ffffff', name: opts.label || this.name });
    (G.dynamicRoot || G.scene).add(this.bubble.sprite);
    this.rest = [];
    this.computePose(true);
    for (let i = 0; i < 7; i++) { this.p[i].copy(this.anim[i]); this.o[i].copy(this.anim[i]); }
    for (const c of CONSTRAINTS) this.rest.push(this.p[c[0]].distanceTo(this.p[c[1]]));
    G.people.push(this);
  }

  buildMesh(o) {
    const s = this.scale, w = this.wide;
    this.group = new THREE.Group();
    if (o.costume === 'ghost') { o.shirt = 0xf5f5f5; o.trousers = 0xf5f5f5; o.bald = true; o.skin = 0xf5f5f5; }
    if (o.costume === 'skeleton') { o.shirt = 0x111111; o.trousers = 0x111111; o.skin = 0xeeeeee; o.bald = true; }
    if (o.costume === 'witch') { o.shirt = 0x2a0a3a; o.trousers = 0x111111; o.skin = 0x9ccc65; }
    if (o.costume === 'pumpkin') { o.shirt = 0xff8f00; }
    const skin = mat(o.skin ?? pick(SKIN));
    const shirtMat = o.camo ? new THREE.MeshLambertMaterial({ map: camoTexture() }) : mat(o.shirt ?? 0x3366aa);
    const trouserMat = o.camo ? shirtMat : mat(o.trousers ?? 0x2b2b3b);
    const bigHead = (G.shift?.rules?.bigHeads ? 1.7 : 1) * (o.headScale || 1);
    this.headR = 0.2 * s * bigHead;
    // Head
    this.head = new THREE.Group();
    const headMesh = new THREE.Mesh(G_('head', () => new THREE.IcosahedronGeometry(1, 1)), skin);
    headMesh.scale.setScalar(this.headR); this.head.add(headMesh);
    const eyeG = G_('eye', () => new THREE.SphereGeometry(1, 6, 4)), eyeM = mat(0x111111);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(eyeG, eyeM); e.scale.setScalar(this.headR * 0.13); e.position.set(sx * this.headR * 0.35, this.headR * 0.15, this.headR * 0.9); this.head.add(e); }
    const nose = new THREE.Mesh(G_('nose', () => new THREE.BoxGeometry(1, 1, 1)), skin);
    nose.scale.set(this.headR * 0.2, this.headR * 0.25, this.headR * 0.3); nose.position.set(0, -this.headR * 0.05, this.headR * 0.98); this.head.add(nose);
    this.mouth = new THREE.Mesh(G_('mouth', () => new THREE.BoxGeometry(1, 1, 1)), mat(0x5a1a1a));
    this.mouth.scale.set(this.headR * 0.4, this.headR * 0.07, this.headR * 0.05); this.mouth.position.set(0, -this.headR * 0.4, this.headR * 0.9); this.head.add(this.mouth);
    if (!o.bald) {
      const hairM = mat(o.hair ?? pick(HAIR));
      const hair = new THREE.Mesh(G_('hair', () => new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairM);
      hair.scale.setScalar(this.headR * 1.06); hair.rotation.x = -0.25; this.head.add(hair);
      if (o.ponytail) {
        const pt = new THREE.Mesh(G_('pt', () => new THREE.ConeGeometry(1, 3, 6)), hairM);
        pt.scale.setScalar(this.headR * 0.28); pt.position.set(0, this.headR * 0.1, -this.headR * 1.2); pt.rotation.x = -2.3; this.head.add(pt);
      }
    }
    if (o.hat === 'camo') {
      const hat = new THREE.Mesh(G_('hat', () => new THREE.CylinderGeometry(1, 1.25, 0.6, 10)), shirtMat);
      hat.scale.setScalar(this.headR); hat.position.y = this.headR * 0.75; this.head.add(hat);
      const brim = new THREE.Mesh(G_('brim', () => new THREE.CylinderGeometry(1.6, 1.6, 0.08, 12)), shirtMat);
      brim.scale.setScalar(this.headR); brim.position.y = this.headR * 0.5; this.head.add(brim);
    }
    if (o.beard) {
      const beard = new THREE.Mesh(G_('beard', () => new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45)), mat(o.beard));
      beard.scale.set(this.headR * 0.95, this.headR * 1.05, this.headR * 0.95); beard.position.z = this.headR * 0.12; this.head.add(beard);
    }
    if (o.hatType === 'santa') {
      const hat = new THREE.Mesh(G_('santa', () => new THREE.ConeGeometry(1, 1.6, 10)), mat(0xd32f2f));
      hat.scale.setScalar(this.headR * 0.9); hat.position.y = this.headR * 1.3; hat.rotation.z = 0.3; this.head.add(hat);
      const pom = new THREE.Mesh(G_('pom', () => new THREE.SphereGeometry(1, 6, 4)), mat(0xffffff));
      pom.scale.setScalar(this.headR * 0.22); pom.position.set(-this.headR * 0.45, this.headR * 1.95, 0); this.head.add(pom);
      const rim = new THREE.Mesh(G_('rim', () => new THREE.TorusGeometry(1, 0.25, 5, 12)), mat(0xffffff));
      rim.scale.setScalar(this.headR * 0.9); rim.rotation.x = Math.PI / 2; rim.position.y = this.headR * 0.6; this.head.add(rim);
    }
    if (o.hatType === 'witch') {
      const hat = new THREE.Mesh(G_('witch', () => new THREE.ConeGeometry(1, 2.2, 10)), mat(0x111111));
      hat.scale.setScalar(this.headR * 0.85); hat.position.y = this.headR * 1.6; this.head.add(hat);
      const brim = new THREE.Mesh(G_('wbrim', () => new THREE.CylinderGeometry(1.7, 1.7, 0.06, 12)), mat(0x111111));
      brim.scale.setScalar(this.headR); brim.position.y = this.headR * 0.65; this.head.add(brim);
    }
    if (o.costume === 'pumpkin') {
      const pk = new THREE.Mesh(G_('pumpkin', () => new THREE.SphereGeometry(1, 10, 8)), mat(0xff8f00));
      pk.scale.set(this.headR * 1.25, this.headR * 1.05, this.headR * 1.25); this.head.add(pk);
    }
    if (o.headband) { const hb = new THREE.Mesh(G_('hb', () => new THREE.TorusGeometry(1, 0.1, 4, 12)), mat(o.headband)); hb.scale.setScalar(this.headR * 1.02); hb.rotation.x = Math.PI / 2; hb.position.y = this.headR * 0.35; this.head.add(hb); }
    if (o.glasses) { const gl = new THREE.Mesh(G_('gl', () => new THREE.BoxGeometry(1, 0.25, 0.1)), mat(0x111111)); gl.scale.setScalar(this.headR); gl.position.set(0, this.headR * 0.15, this.headR * 0.95); this.head.add(gl); }
    this.group.add(this.head);
    // Body parts (unit boxes scaled each frame)
    const unit = G_('unit', () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; });
    this.torso = new THREE.Mesh(unit, shirtMat); this.group.add(this.torso);
    this.torsoW = 0.44 * s * w; this.torsoD = 0.26 * s * Math.max(1, w * 0.9);
    this.armL = new THREE.Mesh(unit, o.shortSleeves ? skin : shirtMat); this.armR = new THREE.Mesh(unit, o.shortSleeves ? skin : shirtMat);
    this.legL = new THREE.Mesh(unit, trouserMat); this.legR = new THREE.Mesh(unit, trouserMat);
    this.armT = 0.11 * s * Math.sqrt(w); this.legT = 0.14 * s * Math.sqrt(w);
    [this.armL, this.armR, this.legL, this.legR].forEach((m) => this.group.add(m));
    const handG = G_('hand', () => new THREE.SphereGeometry(1, 6, 4));
    this.handL = new THREE.Mesh(handG, skin); this.handR = new THREE.Mesh(handG, skin);
    this.handL.scale.setScalar(0.065 * s); this.handR.scale.setScalar(0.065 * s);
    this.group.add(this.handL, this.handR);
    const footG = G_('foot', () => new THREE.BoxGeometry(1, 1, 1)), shoe = mat(o.shoes ?? 0x222222);
    this.footL = new THREE.Mesh(footG, shoe); this.footR = new THREE.Mesh(footG, shoe);
    this.footL.scale.set(0.12 * s, 0.08 * s, 0.24 * s); this.footR.scale.copy(this.footL.scale);
    this.group.add(this.footL, this.footR);
    if (o.apron) { this.apron = new THREE.Mesh(unit, mat(o.apron)); this.group.add(this.apron); }
    if (o.kitNumber) { this.kit = labelSprite(o.kitNumber, { size: 40, scale: 0.18, w: 64, h: 64 }); this.group.add(this.kit); }
    // Held prop (Monster can, phone, fishing rod)
    if (o.prop) { this.prop = o.prop; this.group.add(o.prop); }
    if (o.tag) { this.nameTag = labelSprite(o.tag, { size: 30, scale: 0.12, bg: 'rgba(0,0,0,0.55)', stroke: 0 }); this.group.add(this.nameTag); }
    this.stars = labelSprite('✦ ✧ ✦', { size: 40, color: '#ffeb3b', scale: 0.18 });
    this.stars.visible = false; this.group.add(this.stars);
    (G.dynamicRoot || G.scene).add(this.group);
  }

  // ---- Animation -------------------------------------------------------
  setYawVectors(yaw) {
    this.side.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  }

  computePose(init) {
    const base = POSES[this.pose] || POSES.stand;
    const s = this.scale;
    this.setYawVectors(this.yaw);
    const walking = this.state === 'walk' || this.state === 'run';
    const ph = this.phase;
    const amp = this.state === 'run' ? 0.38 : 0.22;
    for (let i = 0; i < 7; i++) {
      let [x, y, z] = base[i];
      if (this.pose === 'stand' || this.pose === 'speech' || this.pose === 'phone') {
        x *= this.wide > 1.2 && (i === LH || i === RH) ? 1.25 : 1;
        if (walking) {
          if (i === LF) { z += Math.sin(ph) * amp; y += Math.max(0, Math.cos(ph)) * 0.1; }
          if (i === RF) { z -= Math.sin(ph) * amp; y += Math.max(0, -Math.cos(ph)) * 0.1; }
          if (i === LH && this.pose === 'stand') z -= Math.sin(ph) * amp * 0.8;
          if (i === RH && this.pose === 'stand') z += Math.sin(ph) * amp * 0.8;
          if (i <= PELVIS) y += Math.abs(Math.sin(ph)) * 0.04;
          if (this.state === 'run' && i <= NECK) z += 0.12;
        } else if (i === HEAD) {
          x += Math.sin(ph * 0.3) * 0.02;
        }
      }
      if (this.pose === 'sit' && (i === LH || i === RH) && this.eating) y += Math.max(0, Math.sin(ph * 2 + i)) * 0.15;
      if (this.pose === 'flex' && (i === LH || i === RH)) y += Math.sin(ph * 2) * 0.05;
      if (this.pose === 'pressup') { const k = (Math.sin(ph * 1.5) + 1) * 0.5; if (i <= PELVIS) y += k * 0.25 * (i === PELVIS ? 0.4 : 1); }
      if (this.pose === 'speech' && i === RH) { x += Math.sin(ph * 2) * 0.15; }
      const v = this.anim[i];
      v.copy(this.root);
      v.addScaledVector(this.side, x * s);
      v.y += y * s + this.lift;
      v.addScaledVector(this.fwd, z * s);
    }
  }

  setPose(p) { this.pose = p; }

  walkTo(target, onArrive, run = false) {
    this.path = findPath(this.root, target);
    this.target = target.clone();
    this.onArrive = onArrive || null;
    this.state = run ? 'run' : 'walk';
    this.pose = this.pose === 'sit' ? 'stand' : (this.pose === 'phone' ? 'phone' : 'stand');
    this.lift = 0;
  }

  stopWalking() { this.path = null; if (this.state === 'walk' || this.state === 'run') this.state = 'stand'; }

  sitAt(seat) {
    this.root.copy(seat.pos); this.yaw = seat.yaw; this.pose = 'sit'; this.state = 'sit'; this.path = null;
  }

  faceTowards(p) { this.yaw = Math.atan2(p.x - this.root.x, p.z - this.root.z); }

  // ---- Ragdoll ---------------------------------------------------------
  get isRagdoll() { return this.state === 'ragdoll'; }

  knock(impulse, source = 'hit') {
    if (this.hidden) return false;
    if (this.onBeforeKnock && this.onBeforeKnock(impulse, source) === false) return false;
    const wasRagdoll = this.state === 'ragdoll';
    if (!wasRagdoll) {
      this.prevState = { state: this.state === 'getup' ? (this.prevState?.state || 'stand') : this.state, pose: this.pose, seat: this.seat };
      this.state = 'ragdoll';
      this.ragdollTime = 0; this.stillTime = 0; this.zoneHit = false;
      this.path = null; this.lift = 0;
      this.knockCount++;
      this.stars.visible = false;
    }
    const k = 1 / this.heavy;
    for (let i = 0; i < 7; i++) {
      const extra = (i === HEAD || i === NECK) ? 1.15 : (i === LF || i === RF ? 0.75 : 1);
      this.o[i].addScaledVector(impulse, -FIXED * k * extra);
    }
    if (!wasRagdoll) emit('knocked', this, impulse, source);
    return true;
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
    // Throw: give the whole body some of the hand velocity, held point gets it all.
    const twoHand = this.heldBy.length > 0;
    const power = (this.heavy > 1.5 ? (twoHand ? 0.9 : 0.45) : 1) * (G.shift?.rules?.lowGravity ? 1.2 : 1);
    for (let i = 0; i < 7; i++) {
      const f = i === h.idx ? 1.45 : 0.9;
      this.o[i].copy(this.p[i]).addScaledVector(vel, -FIXED * f * power);
    }
    this.ragdollTime = 0; this.stillTime = 0;
    emit('thrown', this, vel.length() * power);
  }

  nearestParticle(pt) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < 7; i++) { const d = this.p[i].distanceToSquared(pt) - RADII[i] * RADII[i]; if (d < bd) { bd = d; best = i; } }
    return { idx: best, dist: Math.sqrt(Math.max(0, bd)) };
  }

  stepRagdoll(h) {
    const g = (G.shift?.rules?.lowGravity ? GRAVITY * 0.3 : GRAVITY) * h * h;
    for (let i = 0; i < 7; i++) {
      const p = this.p[i], o = this.o[i];
      const vx = (p.x - o.x) * 0.995, vy = (p.y - o.y) * 0.995, vz = (p.z - o.z) * 0.995;
      o.copy(p);
      p.x += vx; p.y += vy - g; p.z += vz;
    }
    // Pin held particles to hands
    for (const hb of this.heldBy) { this.p[hb.idx].copy(hb.hand.pos); }
    for (let it = 0; it < 5; it++) {
      CONSTRAINTS.forEach((c, ci) => {
        const a = this.p[c[0]], b = this.p[c[1]], rest = this.rest[ci];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (c[2] === 'min' && d > rest * 0.7) return;
        const target = c[2] === 'min' ? rest * 0.7 : rest;
        let diff = (d - target) / d * (c[2] === 'soft' ? 0.12 : 0.5);
        const pa = this.heldBy.some((x) => x.idx === c[0]), pb = this.heldBy.some((x) => x.idx === c[1]);
        const wa = pa ? 0 : (pb ? 2 : 1), wb = pb ? 0 : (pa ? 2 : 1);
        a.x += dx * diff * wa; a.y += dy * diff * wa; a.z += dz * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb; b.z -= dz * diff * wb;
      });
      for (let i = 0; i < 7; i++) {
        if (this.heldBy.some((x) => x.idx === i)) continue;
        const tag = collideParticle(this.p[i], this.o[i], RADII[i] * this.scale);
        if (tag === 'fruit' || tag === 'tv') this.lastTag = tag;
      }
    }
    for (const hb of this.heldBy) { this.p[hb.idx].copy(hb.hand.pos); }
  }

  speed() {
    let m = 0;
    for (let i = 0; i < 7; i++) m = Math.max(m, this.p[i].distanceTo(this.o[i]) / FIXED);
    return m;
  }

  updateRagdoll(dt) {
    this.ragdollTime += dt;
    const sp = this.speed();
    if (this.heldBy.length) { this.stillTime = 0; return; }
    if (sp < 0.6) this.stillTime += dt; else this.stillTime = 0;
    // Landing zones
    if (!this.zoneHit && this.ragdollTime > 0.15) {
      const z = zoneAt(this.p[PELVIS]);
      if (z) { this.zoneHit = true; emit('zone', this, z); }
    }
    const minTime = this.getUpDelay || 2.2;
    if ((this.stillTime > 1.0 && this.ragdollTime > minTime) || this.ragdollTime > 9) this.startGetup();
  }

  startGetup() {
    this.state = 'getup';
    this.getupT = 0;
    this.root.set(this.p[PELVIS].x, 0, this.p[PELVIS].z);
    // Face the way the body is lying
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
    if (this.state === 'ragdoll') { this.updateRagdoll(dt); }
    else if (this.state === 'getup') {
      this.getupT += dt / 0.7;
      this.computePose();
      const t = clamp(this.getupT, 0, 1), e = t * t * (3 - 2 * t);
      for (let i = 0; i < 7; i++) { this.p[i].lerpVectors(this.from[i], this.anim[i], e); this.o[i].copy(this.p[i]); }
      if (this.getupT >= 1) { this.state = 'stand'; emit('gotUp', this); if (this.onGetUp) this.onGetUp(); }
    } else {
      if (this.path && this.path.length) this.followPath(dt);
      this.computePose();
      for (let i = 0; i < 7; i++) { this.o[i].copy(this.p[i]); this.p[i].copy(this.anim[i]); }
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

  // Build the visual from particle positions.
  render() {
    this.group.visible = !this.hidden;
    if (this.hidden) { this.bubble.sprite.visible = false; return; }
    const p = this.p, s = this.scale;
    const up = V().subVectors(p[NECK], p[PELVIS]);
    const len = up.length() || 0.01; up.multiplyScalar(1 / len);
    // side vector: animated = yaw, ragdoll = from hands + feet
    let side;
    if (this.state === 'ragdoll' || this.state === 'getup') {
      side = V().subVectors(p[RH], p[LH]).add(V().subVectors(p[RF], p[LF]));
      side.addScaledVector(this.side, 0.6);
    } else side = this.side.clone();
    side.addScaledVector(up, -side.dot(up));
    if (side.lengthSq() < 1e-4) side.copy(this.side);
    side.normalize(); this.side.copy(side);
    const fwd = V().crossVectors(side, up).normalize();
    const m = new THREE.Matrix4().makeBasis(side, up, fwd);
    // Torso
    this.torso.position.copy(p[PELVIS]).addScaledVector(up, -0.08 * s);
    this.torso.quaternion.setFromRotationMatrix(m);
    this.torso.scale.set(this.torsoW, len + 0.14 * s, this.torsoD);
    if (this.apron) {
      this.apron.position.copy(this.torso.position).addScaledVector(fwd, this.torsoD / 2 + 0.005).addScaledVector(up, -0.15 * s);
      this.apron.quaternion.copy(this.torso.quaternion);
      this.apron.scale.set(this.torsoW * 0.8, len * 0.9, 0.01);
    }
    if (this.kit) this.kit.position.copy(p[NECK]).addScaledVector(up, -0.22 * s).addScaledVector(fwd, -this.torsoD / 2 - 0.02);
    // Head
    const headUp = V().subVectors(p[HEAD], p[NECK]).normalize();
    const hside = side.clone().addScaledVector(headUp, -side.dot(headUp)).normalize();
    const hfwd = V().crossVectors(hside, headUp).normalize();
    this.head.position.copy(p[HEAD]);
    this.head.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(hside, headUp, hfwd));
    if (this.talking > 0) this.mouth.scale.y = this.headR * (0.07 + Math.abs(Math.sin(performance.now() * 0.02)) * 0.15);
    else this.mouth.scale.y = this.headR * 0.07;
    // Limbs
    const shoulderL = V().copy(p[NECK]).addScaledVector(side, -this.torsoW / 2 - this.armT / 2).addScaledVector(up, -0.06 * s);
    const shoulderR = V().copy(p[NECK]).addScaledVector(side, this.torsoW / 2 + this.armT / 2).addScaledVector(up, -0.06 * s);
    const hipL = V().copy(p[PELVIS]).addScaledVector(side, -0.11 * s * this.wide);
    const hipR = V().copy(p[PELVIS]).addScaledVector(side, 0.11 * s * this.wide);
    limb(this.armL, shoulderL, p[LH], this.armT);
    limb(this.armR, shoulderR, p[RH], this.armT);
    limb(this.legL, hipL, p[LF], this.legT);
    limb(this.legR, hipR, p[RF], this.legT);
    this.handL.position.copy(p[LH]); this.handR.position.copy(p[RH]);
    for (const [f, i] of [[this.footL, LF], [this.footR, RF]]) {
      f.position.copy(p[i]).addScaledVector(fwd, 0.06 * s);
      f.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, UP.clone().addScaledVector(fwd, 0).normalize(), V().crossVectors(side, UP).normalize()));
    }
    if (this.prop) { this.prop.position.copy(p[RH]); this.prop.quaternion.copy(this.torso.quaternion); }
    if (this.nameTag) this.nameTag.position.copy(p[HEAD]).add(V(0, this.headR + 0.15, 0));
    this.stars.position.copy(p[HEAD]).add(V(0, this.headR + 0.1, 0));
    this.bubble.sprite.position.copy(p[HEAD]).add(V(0, this.headR + 0.45, 0));
    if (this.talking > 0) this.talking -= 1 / 60;
  }

  say(text, opts = {}) {
    this.bubble.say(text, opts.dur || 3.2, opts);
    this.talking = opts.dur || 2;
  }

  bodyDistance(pt) {
    // Distance from point to the pelvis-head segment (for hit tests on animated people)
    const a = this.p[PELVIS], b = this.p[HEAD];
    const ab = V().subVectors(b, a), ap = V().subVectors(pt, a);
    const t = clamp(ap.dot(ab) / ab.lengthSq(), 0, 1.15);
    const c = a.clone().addScaledVector(ab, t);
    const legs = Math.min(distSeg(pt, this.p[PELVIS], this.p[LF]), distSeg(pt, this.p[PELVIS], this.p[RF]));
    return Math.min(c.distanceTo(pt) - 0.12 * this.wide, legs - 0.05);
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

const _dir = V(), _Y = V(0, 1, 0);
function limb(mesh, a, b, t) {
  _dir.subVectors(b, a);
  const l = _dir.length() || 0.001;
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(_Y, _dir.multiplyScalar(1 / l));
  mesh.scale.set(t, l, t);
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
    // Knock others over (bowling)
    for (const other of G.people) {
      if (other === r || other.hidden || other.state === 'ragdoll' || other.immune) continue;
      for (const i of [HEAD, PELVIS, LF, RF]) {
        if (other.bodyDistance(r.p[i]) < RADII[i] + 0.05) {
          const vel = V().subVectors(r.p[i], r.o[i]).multiplyScalar(1 / FIXED);
          if (other.knock(vel.multiplyScalar(0.7), 'bowled')) emit('chain', r, other);
          break;
        }
      }
    }
    // Knock items
    for (const it of G.items) {
      if (it.held || it.cls === 'card') continue;
      for (const i of [HEAD, PELVIS, LH, RH, LF, RF]) {
        if (it.pos.distanceTo(r.p[i]) < RADII[i] + it.r + 0.03) {
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
