// Physics toys: darts, pool, jukebox, karaoke mic, fruit machine, sauce bottles,
// fire extinguisher, disposable camera, cutlery.
import * as THREE from 'three';
import { G, V, rand, pick, chance, clamp, emit, on, writeSave } from './state.js';
import { FIX, mat, dartScore, markDart, clearDartboard, addSolid } from './world.js';
import { Item } from './physics.js';
import { LINES } from './data.js';
import { dynamicTexture, labelSprite } from './textures.js';
import { sfx, speak, music } from './audio.js';
import { PELVIS } from './people.js';

const Z = new THREE.Vector3(0, 0, -1);
let decals = [], pool = [], cueBall = null, darts = [], dartTurn = { thrown: 0, total: 0 };
let fruitTex = null, fruitMesh = null, fruitSpin = 0, jukeIdx = 0, inVanZone = false, singTimer = 0, micItem = null;
const TRACKS = [null, 'indie', 'pop', 'singalong'];
const TRACK_NAMES = { indie: 'Indie anthems', pop: '2000s pop', singalong: 'Pub singalongs', country: "Ian's country" };

// ---------------------------------------------------------------- meshes
function dartMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.14, 6), mat(0xb0b0b0)); body.rotation.x = Math.PI / 2; g.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.03, 5), mat(0x333333)); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.085; g.add(tip);
  for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(i ? 0.04 : 0.002, i ? 0.002 : 0.04, 0.035), mat(color)); f.position.z = 0.06; g.add(f); }
  return g;
}
function knifeMesh() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.11), mat(0xd0d0d0)); blade.position.z = -0.05; g.add(blade);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 0.09), mat(0x3e2723)); handle.position.z = 0.05; g.add(handle);
  return g;
}
function bottleMesh(color, cap) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), mat(color)); b.rotation.x = Math.PI / 2; g.add(b);
  const n = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 8), mat(cap)); n.rotation.x = -Math.PI / 2; n.position.z = -0.1; g.add(n);
  return g;
}
function extinguisherMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), mat(0xd32f2f)); b.position.y = -0.12; g.add(b);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.18), mat(0x222222)); h.position.set(0, 0.1, -0.06); g.add(h);
  return g;
}
function cameraMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.04), mat(0xfdd835)); g.add(b);
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), mat(0x111111)); l.rotation.x = Math.PI / 2; l.position.z = -0.03; g.add(l);
  const lab = labelSprite('📷', { size: 40, scale: 0.05, w: 64, h: 64, stroke: 0 }); lab.position.y = 0.07; g.add(lab);
  return g;
}
function cueMesh() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, 1.4, 6), mat(0xc8a165));
  c.rotation.x = Math.PI / 2; c.position.z = -0.4; g.add(c);
  return g;
}
function micMesh() {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.16, 8), mat(0x222222)); h.rotation.x = Math.PI / 2; g.add(h);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0x9e9e9e)); head.position.z = -0.09; g.add(head);
  return g;
}

// ---------------------------------------------------------------- setup per shift
export function initToys() {
  decals.forEach((d) => d.parent && d.parent.remove(d)); decals = [];
  pool = []; darts = []; dartTurn = { thrown: 0, total: 0 };
  clearDartboard();
  spawnDarts();
  rackPool();
  // Cue on the pool table rail
  const cue = new Item('cue', { mesh: cueMesh(), r: 0.04, half: 0.02, cls: 'cue', pos: V(-5.5, 0.92, -10.35) });
  cue.fullOrient = true; cue.sleeping = true; cue.reportAll = false;
  // Karaoke mic
  micItem = new Item('mic', { mesh: micMesh(), r: 0.04, half: 0.03, cls: 'mic', pos: FIX.mic.clone() });
  micItem.fullOrient = true; micItem.sleeping = true;
  micItem.useHeld = () => { singTimer = Math.max(singTimer, 0.3); };
  // Sauce bottles on the bar and a few tables
  const sauces = [[0xd32f2f, 0xffffff, 0xc62828], [0xfdd835, 0xd32f2f, 0xf9a825], [0xfafafa, 0x1e88e5, 0xf5f5f5]];
  [[-8.3, 1.2, -2.4], [-8.3, 1.2, -2.2], [-8.3, 1.2, -2.0], [1.8, 0.85, 1.6], [-5, 0.85, -3.4]].forEach((p, i) => {
    const [col, cap, sauce] = sauces[i % 3];
    const b = new Item('sauce-bottle', { mesh: bottleMesh(col, cap), r: 0.05, half: 0.03, cls: 'bottle', pos: V(...p) });
    b.fullOrient = true; b.sleeping = true; b.sauceColor = sauce;
    b.squirtAcc = 0;
    b.useHeld = (h, dt) => { b.squirtAcc += dt; while (b.squirtAcc > 0.06) { b.squirtAcc -= 0.06; squirt(b, h); } };
  });
  // Fire extinguisher on its wall hook by the host stand
  const ex = new Item('extinguisher', { mesh: extinguisherMesh(), r: 0.1, half: 0.22, mass: 2, cls: 'extinguisher', pos: V(-9.6, 0.45, 6.9) });
  ex.fullOrient = true; ex.sleeping = true;
  ex.useHeld = (h, dt) => spray(ex, h, dt);
  // Disposable camera on the host stand
  const cam = new Item('camera', { mesh: cameraMesh(), r: 0.06, half: 0.035, cls: 'camera', pos: V(-6.85, 1.2, 6.3) });
  cam.fullOrient = true; cam.sleeping = true;
  cam.use = (h) => { G.photoRequest = { item: cam }; sfx.blip(); };
  // Cutlery on the bar (sticks in the dartboard too)
  for (let i = 0; i < 3; i++) {
    const k = new Item('knife', { mesh: knifeMesh(), r: 0.03, half: 0.006, cls: 'knife', pos: V(-8.2, 1.2, -1.0 + i * 0.12) });
    k.fullOrient = true; k.sleeping = true; k.aimThrow = 9; k.sticks = true; k.onUpdate = flyPointed(k);
  }
  // Fruit machine screen
  if (!fruitTex) {
    fruitTex = dynamicTexture(256, 192);
    fruitMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: fruitTex.tex }));
    fruitMesh.position.set(9.18, 1.3, 2.0); fruitMesh.rotation.y = -Math.PI / 2; G.scene.add(fruitMesh);
    addSolid(-7.6, 0, -13.4, -7.2, 1.0, -13.0, 'shelf');
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), mat(0x4a2c17)); shelf.position.set(-7.4, 0.5, -13.2); G.scene.add(shelf);
  }
  drawFruit(['🍒', '🍋', '🔔']);
  // Interactables
  G.interactables.push({
    pos: V(9.15, 1.2, 2.0), radius: 2,
    label: () => (fruitSpin > 0 ? null : 'Pull the fruit machine lever (£1)'),
    action: () => { fruitSpin = 1.3; emit('addTips', -1); sfx.fruit(); },
  });
  G.interactables.push({
    pos: FIX.jukebox, radius: 2,
    label: () => 'Jukebox: change the track',
    action: () => { jukeIdx = (jukeIdx + 1) % TRACKS.length; const t = TRACKS[jukeIdx]; music.play(t); G.toast(t ? `🎵 Jukebox: ${TRACK_NAMES[t]}` : '🎵 Jukebox off', 2); },
  });
  G.interactables.push({
    pos: V(-9.2, 1.73, FIX.dart.z), radius: 3.2,
    label: () => (darts.some((d) => d.frozen || d.pos.distanceTo(V(-7.4, 1.05, -13.2)) > 0.4) ? 'Collect the darts' : null),
    action: () => { darts.forEach((d) => d.remove()); darts = []; clearDartboard(); spawnDarts(); dartTurn = { thrown: 0, total: 0 }; sfx.grab(); },
  });
  G.interactables.push({
    pos: V(FIX.pool.x, FIX.pool.top + 0.1, FIX.pool.z), radius: 2.4,
    label: () => (cueBall && !cueBall.dead ? (G.xr ? 'Pool: grab the cue (or press A to shoot)' : 'Pool: shoot the cue ball where you\'re looking') : null),
    action: () => {
      if (!cueBall || cueBall.dead) return;
      const f = G.player.forward();
      cueBall.vel.set(f.x * 2.6, 0, f.z * 2.6); cueBall.sleeping = false; sfx.kick();
    },
  });
  jukeIdx = 0; music.play(null);
}

function spawnDarts() {
  ['#e53935', '#1e88e5', '#43a047'].forEach((c, i) => {
    const d = new Item('dart', { mesh: dartMesh(c), r: 0.025, half: 0.006, cls: 'dart', pos: V(-7.45 + i * 0.05, 1.03, -13.25), friction: 0.6 });
    d.fullOrient = true; d.sleeping = true; d.aimThrow = 8.5; d.sticks = true;
    d.onUpdate = flyPointed(d);
    darts.push(d);
  });
}
function flyPointed(it) {
  return () => {
    if (!it.held && !it.frozen && !it.sleeping && it.vel.lengthSq() > 4) it.mesh.quaternion.setFromUnitVectors(Z, it.vel.clone().normalize());
    return false;
  };
}

function rackPool() {
  const { x, z, top } = FIX.pool, r = 0.028;
  const cols = [0xd32f2f, 0xfdd835, 0xd32f2f, 0x111111, 0xfdd835, 0xd32f2f, 0xfdd835];
  let k = 0;
  for (let row = 0; row < 3 && k < 7; row++) for (let j = 0; j <= row && k < 7; j++) {
    const b = poolBall(cols[k++], V(x - 0.45 - row * 0.05, top + r + 0.002, z + (j - row / 2) * 0.058));
    pool.push(b);
  }
  const extra = poolBall(cols[6], V(x - 0.62, top + r + 0.002, z + 0.03)); pool.push(extra);
  cueBall = poolBall(0xffffff, V(x + 0.5, top + r + 0.002, z)); cueBall.isCue = true; pool.push(cueBall);
}
function poolBall(color, pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), mat(color));
  const b = new Item('pool', { mesh: m, r: 0.028, half: 0.028, cls: 'pool', bounce: 0.75, friction: 0.996, pos, mass: 0.17 });
  b.sleeping = true;
  return b;
}

function drawFruit(sym) {
  const x = fruitTex.ctx;
  x.fillStyle = '#ffeb3b'; x.fillRect(0, 0, 256, 192);
  x.fillStyle = '#6a1b9a'; x.font = 'bold 26px Arial'; x.textAlign = 'center'; x.fillText('THE CHIP MACHINE', 128, 30);
  x.fillStyle = '#fff'; for (let i = 0; i < 3; i++) x.fillRect(14 + i * 80, 50, 68, 90);
  x.font = '52px serif'; x.textBaseline = 'middle';
  sym.forEach((s, i) => x.fillText(s, 48 + i * 80, 96));
  x.fillStyle = '#6a1b9a'; x.font = 'bold 20px Arial'; x.fillText('3 = £10 · 2 = £2', 128, 168);
  fruitTex.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- sauce + extinguisher
function forwardOf(h) { return Z.clone().applyQuaternion(h.quat).normalize(); }
function squirt(bottle, h) {
  const dir = forwardOf(h);
  const blob = new Item('sauce', { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), mat(bottle.sauceColor)), r: 0.015, half: 0.015, cls: 'shard', pos: h.pos.clone().addScaledVector(dir, 0.14), bounce: 0 });
  blob.vel.copy(dir).multiplyScalar(3).add(h.vel.clone().multiplyScalar(0.5));
  blob.ttl = 3; blob.color = bottle.sauceColor;
  blob.onUpdate = () => {
    if (blob.age > 0.05 && (blob.pos.y <= blob.r + 0.01 || blob.vel.lengthSq() < 0.05)) { addDecal(blob.pos, blob.color); blob.remove(); return true; }
    return false;
  };
}
function addDecal(pos, color) {
  const d = new THREE.Mesh(new THREE.CircleGeometry(rand(0.03, 0.06), 8), new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2 }));
  d.rotation.x = -Math.PI / 2; d.position.set(pos.x, pos.y - 0.01, pos.z);
  (G.dynamicRoot || G.scene).add(d); decals.push(d);
  if (decals.length > 90) { const old = decals.shift(); old.parent && old.parent.remove(old); }
}
let sprayAcc = 0;
function spray(ex, h, dt) {
  const dir = forwardOf(h);
  sprayAcc += dt;
  while (sprayAcc > 0.03) {
    sprayAcc -= 0.03;
    const puff = new Item('puff', { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })), r: 0.04, half: 0.04, cls: 'shard', pos: h.pos.clone().addScaledVector(dir, 0.2), gravity: 0.1 });
    puff.vel.copy(dir).multiplyScalar(rand(5, 7)).add(V(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4)));
    puff.ttl = 0.5;
  }
  if (Math.random() < dt * 6) sfx.whoosh();
  // Recoil: the extinguisher sends you sliding backwards
  const push = dir.clone().setY(0).multiplyScalar(-2.4 * dt);
  if (G.xr) G.rig.position.add(push); else G.player.pos.add(push);
  // Knock people in the spray cone
  for (const per of G.people) {
    if (per.hidden || per.immune || per.state === 'ragdoll' || (per.sprayed && G.time - per.sprayed < 1.2)) continue;
    const to = V().subVectors(per.p[PELVIS], h.pos); const d = to.length();
    if (d < 2.6 && to.normalize().dot(dir) > 0.85) { per.sprayed = G.time; per.knock(dir.clone().multiplyScalar(4).add(V(0, 1.5, 0)), 'spray'); }
  }
  emit('spray', h.pos, dir);
}

// ---------------------------------------------------------------- photos
const PHOTO_KEY = 'lewis-sim-photos';
let rt = null, photoCam = null;
export function loadPhotos() { try { return JSON.parse(localStorage.getItem(PHOTO_KEY)) || []; } catch (e) { return []; } }
export function takePhoto() {
  const req = G.photoRequest; G.photoRequest = null;
  if (!req) return;
  const W = 480, H = 360;
  if (!rt) { rt = new THREE.WebGLRenderTarget(W, H); photoCam = new THREE.PerspectiveCamera(65, W / H, 0.05, 120); photoCam.layers.enable(5); }
  const it = req.item;
  it.mesh.getWorldPosition(photoCam.position);
  it.mesh.getWorldQuaternion(photoCam.quaternion);
  photoCam.position.addScaledVector(Z.clone().applyQuaternion(photoCam.quaternion), 0.05);
  photoCam.updateMatrixWorld(true);
  const r = G.renderer, xrOn = r.xr.enabled;
  r.xr.enabled = false;
  const prevBg = G.scene.background;
  r.setRenderTarget(rt); r.render(G.scene, photoCam); r.setRenderTarget(null);
  r.xr.enabled = xrOn;
  G.scene.background = prevBg;
  const px = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, px);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(255,140,0,0.9)'; ctx.font = 'bold 16px monospace'; ctx.fillText(new Date().toLocaleString('en-GB'), 10, H - 12);
  const url = c.toDataURL('image/jpeg', 0.75);
  const photos = loadPhotos(); photos.unshift(url);
  while (photos.length > 12) photos.pop();
  try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photos)); } catch (e) { photos.pop(); try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photos)); } catch (e2) { /* full */ } }
  G.player.blur = 0.35; sfx.cash();
  G.toast('📸 Snap! Saved to Photos (main menu).', 2);
  G.save.photosTaken = (G.save.photosTaken || 0) + 1;
  if (G.save.photosTaken >= 5) emit('achieve', 'photographer');
  writeSave();
}

// ---------------------------------------------------------------- per-frame
on('itemImpact', (it, impact, tag) => {
  if (it.sticks && (tag === 'dartboard' || (it.cls === 'knife' && tag === 'dartboard'))) {
    it.frozen = true; it.vel.set(0, 0, 0); it.pos.x = -9.9;
    const u = -(it.pos.z - FIX.dart.z), v = it.pos.y - FIX.dart.y;
    const res = dartScore(u, v);
    markDart(u, v); sfx.thud();
    if (it.cls === 'dart') {
      dartTurn.thrown++; dartTurn.total += res.score;
      G.toast(`🎯 ${res.label}${dartTurn.thrown >= 3 ? `  ·  3-dart total: ${dartTurn.total}` : ''}`, 2);
      if (res.score === 50) emit('achieve', 'bullseye');
      if (res.score >= 50 || res.label.startsWith('Treble 20')) emit('regularsCheer');
      if (dartTurn.thrown >= 3 && dartTurn.total > (G.save.dartsBest || 0)) { G.save.dartsBest = dartTurn.total; G.toast(`New darts record: ${dartTurn.total}!`, 3); writeSave(); }
    } else G.toast('🔪 The knife sticks in the dartboard. Ronnie claps.', 2);
  } else if (it.cls === 'dart' && !it.frozen && impact > 2) { dartTurn.thrown += 0; }
});

export function updateToys(dt) {
  // Pool ball collisions + pockets
  const balls = pool.filter((b) => !b.dead);
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], b = balls[j];
    if (a.held || b.held) continue;
    const d = a.pos.distanceTo(b.pos), min = a.r + b.r;
    if (d < min && d > 1e-5) {
      const n = V().subVectors(b.pos, a.pos).multiplyScalar(1 / d);
      const over = (min - d) / 2;
      a.pos.addScaledVector(n, -over); b.pos.addScaledVector(n, over);
      const vr = V().subVectors(b.vel, a.vel).dot(n);
      if (vr < 0) { a.vel.addScaledVector(n, vr); b.vel.addScaledVector(n, -vr); a.sleeping = b.sleeping = false; if (-vr > 0.4) sfx.blip(); }
    }
  }
  const top = FIX.pool.top;
  for (const b of balls) {
    if (b.held || b.pos.y > top + 0.08 || b.pos.y < top - 0.2) continue;
    for (const pk of FIX.pockets()) {
      if (Math.hypot(b.pos.x - pk.x, b.pos.z - pk.z) < 0.065) {
        sfx.thud();
        if (b.isCue) { G.toast('Scratch! Cue ball back on the spot.', 1.5); b.pos.set(FIX.pool.x + 0.5, top + 0.03, FIX.pool.z); b.vel.set(0, 0, 0); b.sleeping = true; }
        else {
          b.remove();
          const left = pool.filter((x) => !x.dead && !x.isCue).length;
          G.toast(left ? `Potted! ${left} left.` : 'Table cleared! Racking up again.', 1.5);
          emit('addChaos', 3, 'pool');
          if (!left) { emit('achieve', 'poolClear'); emit('addTips', 2); pool.forEach((x) => x.remove()); pool = []; rackPool(); }
        }
        break;
      }
    }
  }
  // VR cue: tip strikes balls
  for (const h of G.hands) {
    const it = h.held?.item;
    if (!it || it.cls !== 'cue') continue;
    const tip = h.pos.clone().addScaledVector(forwardOf(h), 1.1);
    const tv = h.vel.clone().add(V()); // approximate tip velocity with hand velocity
    for (const b of balls) {
      if (b.held || b.pos.distanceTo(tip) > 0.05 || tv.length() < 0.4 || (b.cueHit && G.time - b.cueHit < 0.3)) continue;
      b.cueHit = G.time;
      b.vel.set(tv.x * 1.3, 0, tv.z * 1.3); b.sleeping = false; sfx.kick();
    }
  }
  // Fruit machine
  if (fruitSpin > 0) {
    fruitSpin -= dt;
    const sym = ['🍒', '🍋', '🔔', '⭐', '🦪'];
    if (fruitSpin > 0) { if (Math.random() < 0.5) drawFruit([pick(sym), pick(sym), pick(sym)]); }
    else {
      const r = [pick(sym), pick(sym), pick(sym)];
      if (chance(0.12)) r[1] = r[2] = r[0]; else if (chance(0.3)) r[1] = r[0];
      drawFruit(r);
      const same = r[0] === r[1] && r[1] === r[2] ? 3 : (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) ? 2 : 0;
      if (same === 3) { emit('addTips', 10); sfx.cash(); G.toast('JACKPOT! £10!', 2.5); emit('regularsCheer'); }
      else if (same === 2) { emit('addTips', 2); sfx.coin(); G.toast('Two of a kind: £2', 2); }
      else G.toast('Nothing. The fruit machine always wins.', 1.5);
    }
  }
  // Karaoke: VR = hold the mic near your mouth; flat = hold USE
  if (micItem && !micItem.dead && micItem.held && G.xr && micItem.pos.distanceTo(G.player.headPos()) < 0.3) singTimer = Math.max(singTimer, 0.3);
  if (singTimer > 0) {
    singTimer -= dt;
    G.singAcc = (G.singAcc || 0) + dt;
    if (G.singAcc > 2.6) {
      G.singAcc = 0;
      const line = pick(LINES.karaoke);
      G.toast('🎤 ♪ ' + line + ' ♪', 2.4); speak(line, 'lewis');
      emit('sing');
      for (const per of G.people) if (!per.hidden && per.state !== 'ragdoll' && per.p[PELVIS].distanceTo(G.player.pos) < 7 && chance(0.3)) per.say(pick(['WOOO!', 'Get off!', 'ENCORE!', 'Lovely voice, big man!']), { dur: 1.6 });
    }
  }
  // Ian's van plays country music when you're near it
  const nearVan = G.player.pos.distanceTo(FIX.vanBack) < 7;
  if (nearVan !== inVanZone) { inVanZone = nearVan; music.play(nearVan ? 'country' : TRACKS[jukeIdx]); if (nearVan) G.toast("🎵 Ian's van is playing country. Loudly.", 2); }
}
