// Throwable items (plates, pints, football, cards...) and their physics.
import * as THREE from 'three';
import { G, V, GRAVITY, rand, emit, hasUpgrade } from './state.js';
import { collideSphere } from './world.js';
import { mat } from './world.js';
import { DISHES } from './data.js';
import { labelSprite } from './textures.js';
import { sfx } from './audio.js';

const geo = {
  plate: new THREE.CylinderGeometry(0.14, 0.11, 0.025, 14),
  glass: new THREE.CylinderGeometry(0.045, 0.038, 0.16, 10),
  can: new THREE.CylinderGeometry(0.034, 0.034, 0.16, 10),
  ball: new THREE.IcosahedronGeometry(0.11, 1),
  shard: new THREE.TetrahedronGeometry(0.03),
  oyster: new THREE.SphereGeometry(0.06, 8, 5),
};

function dishMesh(dish) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(geo.plate, mat(0xffffff)); g.add(plate);
  const c = DISHES[dish]?.color || 0xaaaaaa;
  const add = (geom, color, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geom, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); };
  const sph = new THREE.SphereGeometry(0.05, 7, 5), bx = new THREE.BoxGeometry(0.1, 0.03, 0.05);
  switch (dish) {
    case 'fish': add(bx, 0xe8a33d, -0.03, 0.03, 0, 1.4, 1.2, 1.2); for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.015, 0.015, 0.07), 0xf7d26b, 0.05 + (i % 3) * 0.02, 0.025 + Math.floor(i / 3) * 0.015, -0.03 + i * 0.015); break;
    case 'roast': add(sph, 0x8a5a2b, 0, 0.04, 0, 1.2, 0.7, 1); add(sph, 0x3fa34d, 0.06, 0.03, 0.04, 0.5, 0.5, 0.5); add(sph, 0xf2c14e, -0.06, 0.03, 0.04, 0.6, 0.6, 0.6); break;
    case 'burger': add(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 10), 0xd9a066, 0, 0.025, 0); add(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 10), 0x5d3a1a, 0, 0.047, 0); add(new THREE.SphereGeometry(0.05, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9a066, 0, 0.058, 0); break;
    case 'kids': for (let i = 0; i < 4; i++) add(sph, 0xf2c14e, -0.05 + i * 0.035, 0.025, 0, 0.45, 0.35, 0.5); break;
    case 'oysters': for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(geo.oyster, 0xc9c9c0, Math.cos(a) * 0.07, 0.02, Math.sin(a) * 0.07, 1, 0.35, 0.8); } break;
    case 'pancakes': for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 12), 0xe0b060, 0, 0.02 + i * 0.017, 0); break;
    case 'cake': {
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), 0xf8bbd0, 0, 0.05, 0);
      add(new THREE.CylinderGeometry(0.102, 0.102, 0.015, 14), 0xffffff, 0, 0.09, 0);
      g.userData.flames = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4), 0x90caf9, Math.cos(a) * 0.06, 0.12, Math.sin(a) * 0.06);
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.025, 5), new THREE.MeshBasicMaterial({ color: 0xffa000 }));
        f.position.set(Math.cos(a) * 0.06, 0.155, Math.sin(a) * 0.06); g.add(f); g.userData.flames.push(f);
      }
      break;
    }
    case 'salad': for (let i = 0; i < 6; i++) add(sph, i % 2 ? 0x5bbf4a : 0xe53935, rand(-0.05, 0.05), 0.03, rand(-0.05, 0.05), 0.5, 0.4, 0.5); break;
    default: add(sph, c, 0, 0.03, 0, 1, 0.5, 1);
  }
  return g;
}

function drinkMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'monster') {
    const can = new THREE.Mesh(geo.can, mat(0x111111)); g.add(can);
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.03), new THREE.MeshBasicMaterial({ color: 0x7cfc00 }));
    logo.position.set(0.034, 0, 0); g.add(logo);
    return g;
  }
  const glass = new THREE.Mesh(geo.glass, new THREE.MeshLambertMaterial({ color: 0xddeeff, transparent: true, opacity: 0.35 }));
  g.add(glass);
  const liquidCol = kind === 'pint' ? 0xc97a1e : kind === 'mocktail' ? 0xff6f91 : 0x9fd3ff;
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.14, 10), mat(liquidCol));
  liquid.position.y = -0.005; g.add(liquid);
  g.userData.liquid = liquid;
  if (kind === 'pint') {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.025, 10), mat(0xfff8e7));
    head.position.y = 0.07; g.add(head); g.userData.head = head;
  }
  if (kind === 'mocktail') { const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 4), mat(0xffffff)); straw.position.set(0.02, 0.06, 0); straw.rotation.z = 0.2; g.add(straw); }
  return g;
}

export class Item {
  constructor(kind, opts = {}) {
    this.kind = kind;
    this.id = opts.dish || opts.drink || kind;
    this.dish = opts.dish || null;
    this.drink = opts.drink || null;
    this.forTable = opts.forTable ?? null;
    this.fill = 1; this.foam = opts.foam || 0;
    this.vel = V(); this.spin = V();
    this.held = null; this.frozen = false; this.sleeping = false; this.dead = false;
    this.breakable = false; this.cls = kind;
    this.r = 0.1; this.half = 0.05; this.bounce = 0.25; this.mass = 1;
    this.age = 0; this.servedTo = null;
    this.lastHitBy = null;
    let mesh;
    if (opts.mesh) {
      mesh = opts.mesh; this.r = opts.r ?? 0.08; this.half = opts.half ?? this.r; this.mass = opts.mass ?? 1; this.bounce = opts.bounce ?? 0.3;
      this.cls = opts.cls || kind; this.breakable = !!opts.breakable; this.floating = !!opts.floating;
      if (opts.friction !== undefined) this.friction = opts.friction;
      if (opts.gravity !== undefined) this.gravity = opts.gravity;
    } else if (kind === 'plate') { mesh = dishMesh(opts.dish); this.r = 0.13; this.half = 0.03; this.cls = 'plate'; this.breakable = true; }
    else if (kind === 'drink') { mesh = drinkMesh(opts.drink); this.r = 0.07; this.half = 0.08; this.cls = opts.drink === 'monster' ? 'can' : 'glass'; this.breakable = opts.drink !== 'monster'; }
    else if (kind === 'ball') {
      mesh = new THREE.Mesh(geo.ball, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
      const spots = new THREE.Mesh(new THREE.IcosahedronGeometry(0.112, 0), new THREE.MeshLambertMaterial({ color: 0x111111, wireframe: true }));
      mesh.add(spots);
      this.r = 0.11; this.half = 0.11; this.bounce = 0.62; this.mass = 0.45; this.cls = 'ball'; this.breakable = false;
    } else if (kind === 'golden') {
      mesh = new THREE.Mesh(geo.oyster, new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x6b5200 }));
      mesh.scale.set(1.3, 0.6, 1.1);
      this.r = 0.07; this.half = 0.035; this.cls = 'golden'; this.breakable = false;
    } else if (kind === 'card') {
      mesh = new THREE.Group();
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.01), mat(0xfff8e1));
      mesh.add(c);
      const l = labelSprite(opts.text || '', { w: 512, h: 128, size: 26, bg: '#fff8e1', color: '#222', stroke: 0, scale: 0.12 });
      l.position.z = 0.02; mesh.add(l); this.label = l;
      this.r = 0.15; this.half = 0.12; this.cls = 'card'; this.breakable = false; this.floating = true;
      this.text = opts.text;
    } else if (kind === 'keg') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12), mat(0xb0b0b0));
      this.r = 0.24; this.half = 0.25; this.mass = 4; this.cls = 'keg'; this.breakable = false; this.bounce = 0.1;
    } else if (kind === 'chair') {
      mesh = new THREE.Group();
      this.r = 0.25; this.half = 0.45; this.mass = 2;
    } else { // shard / misc
      mesh = new THREE.Mesh(geo.shard, mat(opts.color || 0xffffff));
      this.r = 0.03; this.half = 0.02; this.cls = 'shard'; this.breakable = false; this.bounce = 0.3;
    }
    this.mesh = mesh;
    this.pos = V();
    if (opts.pos) this.pos.copy(opts.pos);
    this.sync();
    if (opts.forTable != null && kind === 'plate') {
      const tag = labelSprite(String(opts.forTable), { bg: '#fffbe6', color: '#b71c1c', size: 40, stroke: 0, scale: 0.09, w: 64, h: 64 });
      tag.position.set(0, 0.1, 0); mesh.add(tag); this.tag = tag;
    }
    (G.dynamicRoot || G.scene).add(mesh);
    G.items.push(this);
  }
  // Collider is a sphere of radius r; flat things are drawn sitting at its bottom.
  sync() {
    if (this.held || this.floating) this.mesh.position.copy(this.pos);
    else this.mesh.position.set(this.pos.x, this.pos.y - (this.r - this.half), this.pos.z);
  }

  setFill(f) {
    this.fill = Math.max(0, f);
    const l = this.mesh.userData.liquid;
    if (l) { l.scale.y = Math.max(0.02, this.fill); l.position.y = -0.075 + 0.07 * this.fill; }
    const h = this.mesh.userData.head;
    if (h) { h.position.y = -0.07 + 0.14 * this.fill + 0.01; h.scale.y = 1 + this.foam * 3; }
  }

  wake() { this.sleeping = false; }

  smash() {
    if (this.dead) return;
    sfx.smash();
    const col = this.cls === 'plate' ? 0xffffff : 0xcfe8ff;
    for (let i = 0; i < 7; i++) {
      const s = new Item('shard', { pos: this.pos, color: col });
      s.vel.set(rand(-2, 2), rand(1, 3), rand(-2, 2)).add(this.vel.clone().multiplyScalar(0.3));
      s.spin.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      s.ttl = rand(4, 7);
    }
    emit('smash', this);
    this.remove();
  }

  remove() {
    if (this.dead) return;
    this.dead = true;
    if (this.held) emit('itemRemoved', this);
    this.mesh.parent && this.mesh.parent.remove(this.mesh);
    const i = G.items.indexOf(this);
    if (i >= 0) G.items.splice(i, 1);
  }

  update(dt) {
    this.age += dt;
    if (this.ttl !== undefined) { this.ttl -= dt; if (this.ttl <= 0) { this.remove(); return; } }
    if (this.dead) return;
    if (this.onUpdate && this.onUpdate(dt)) { this.sync(); return; }
    if (this.held || this.frozen || this.sleeping) { this.sync(); return; }
    if (this.floating) { this.pos.y += Math.sin(this.age * 2) * 0.0008; this.sync(); return; }
    const grav = G.shift?.rules?.lowGravity ? GRAVITY * 0.3 : GRAVITY;
    this.vel.y -= grav * dt * (this.gravity ?? 1);
    const speed = this.vel.length();
    // Sub-step fast objects so they don't tunnel through thin walls.
    const steps = Math.min(14, Math.max(1, Math.ceil((speed * dt) / (Math.max(this.r, 0.04) * 0.8))));
    let maxImpact = 0, ground = false, tag = null;
    for (let s = 0; s < steps; s++) {
      this.pos.addScaledVector(this.vel, dt / steps);
      const res = collideSphere(this.pos, this.vel, this.r, this.bounce, this.friction ?? (this.cls === 'ball' ? 0.985 : 0.8));
      if (res.impact > maxImpact) { maxImpact = res.impact; tag = res.tag; }
      ground = ground || res.ground;
    }
    if (maxImpact > 0.5 || (tag && this.reportAll)) emit('itemImpact', this, maxImpact, tag);
    if (this.dead) return;
    const butter = G.shift?.rules?.butterFingers;
    if (this.breakable && maxImpact > (butter ? 1.2 : 3.6)) { this.smash(); return; }
    if (this.cls === 'ball' && maxImpact > 1.2) sfx.bounce();
    // Rotation
    if (ground && this.cls !== 'ball') {
      this.spin.multiplyScalar(0.8);
      // ease back upright
      const q = this.mesh.quaternion, e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.y, 0, 'YXZ'));
      q.slerp(target, Math.min(1, dt * 10));
    } else if (this.cls === 'ball' && ground) {
      this.spin.set(this.vel.z / this.r, 0, -this.vel.x / this.r);
    }
    if (this.spin.lengthSq() > 0.01) {
      const ang = this.spin.length() * dt;
      const axis = this.spin.clone().normalize();
      this.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
    }
    if (ground && this.vel.lengthSq() < 0.004 && this.cls !== 'ball' && !this.noSleep) { this.vel.set(0, 0, 0); this.sleeping = true; emit('itemRest', this); }
    if (this.cls === 'ball' && ground && this.vel.lengthSq() < 0.0004) this.vel.set(0, 0, 0);
    // Fell out of the world
    if (this.pos.y < -5 || Math.abs(this.pos.x) > 40 || Math.abs(this.pos.z) > 40) { if (this.cls === 'ball') { this.pos.set(0, 1, 0); this.vel.set(0, 0, 0); } else { this.remove(); return; } }
    this.sync();
  }
}

export function spawnPlate(dish, forTable, pos) { return new Item('plate', { dish, forTable, pos }); }
export function spawnDrink(drink, pos, foam = 0) {
  const it = new Item('drink', { drink, pos, foam });
  it.setFill(1);
  return it;
}

// Slosh drinks carried too fast.
export function sloshDrink(item, handSpeed, dt) {
  if (item.kind !== 'drink' || item.drink === 'monster') return;
  const limit = hasUpgrade('shoes') ? 3.2 : 2.0;
  if (handSpeed > limit) {
    const loss = (handSpeed - limit) * dt * (hasUpgrade('shoes') ? 0.08 : 0.2);
    item.setFill(item.fill - loss);
    if (Math.random() < 0.05) emit('slosh', item);
  }
}

export function updateItems(dt) {
  for (let i = G.items.length - 1; i >= 0; i--) { const it = G.items[i]; if (it) it.update(dt); }
}
