// Lewis: VR controllers, flat-screen (keyboard/mouse) and touch controls.
import * as THREE from 'three';
import { G, V, clamp, rand, pick, emit, hasUpgrade } from './state.js';
import { collidePlayer, FIX } from './world.js';
import { sloshDrink } from './physics.js';
import { HEAD, PELVIS, LF, RF } from './people.js';
import { sfx, initAudio } from './audio.js';
import { labelSprite } from './textures.js';
import { mat } from './world.js';

const SKIN = 0xf1c27d;
const keys = {};
const mouse = { dx: 0, dy: 0, locked: false };
const touch = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, buttons: {} };
let pressed = {}; // edge-triggered actions this frame

// ---------------------------------------------------------------- hand meshes
function makeHandMesh(left) {
  const g = new THREE.Group();
  const skin = mat(SKIN), sleeve = mat(0xffffff);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.1), skin); palm.position.z = -0.02; g.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.07), skin);
    f.geometry.translate(0, 0, -0.035);
    f.position.set(-0.033 + i * 0.022, 0, -0.07); g.add(f); fingers.push(f);
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.05), skin);
  thumb.geometry.translate(0, 0, -0.025);
  thumb.position.set(left ? 0.05 : -0.05, -0.005, -0.01); thumb.rotation.y = left ? -0.7 : 0.7; g.add(thumb); fingers.push(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 8), sleeve);
  cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.1; g.add(cuff);
  g.userData.fingers = fingers;
  g.userData.setGrip = (v) => fingers.forEach((f, i) => { f.rotation.x = -v * (i === 4 ? 0.6 : 1.4); });
  return g;
}

// Lewis's own body (seen when looking down): apron + name badge.
function makeBody() {
  const g = new THREE.Group();
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.7, 0.24), mat(0xffffff)); shirt.position.y = -0.62; g.add(shirt);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.75, 0.02), mat(0x1d3b2a)); apron.position.set(0, -0.75, -0.13); g.add(apron);
  const badge = labelSprite('LEWIS — Happy to help', { w: 512, h: 96, size: 34, bg: '#f5f0e0', color: '#1d3b2a', stroke: 0, scale: 0.05 });
  badge.position.set(0.1, -0.42, -0.14); g.add(badge);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.2), mat(0x222222)); legs.position.y = -1.48; g.add(legs);
  return g;
}

// ---------------------------------------------------------------- Hand
class Hand {
  constructor(side) {
    this.side = side;
    this.pos = V(); this.prev = V(); this.vel = V();
    this.hist = [];
    this.quat = new THREE.Quaternion();
    this.held = null; this.stack = [];
    this.mesh = makeHandMesh(side === 'left');
    this.grip = 0;
    this.kickCooldown = 0;
  }
  isEmpty() { return !this.held; }
  speed() { return this.vel.length(); }
  maxStack(item) {
    if (item.cls === 'plate') return (hasUpgrade('stack') ? 4 : 3);
    if (item.cls === 'glass' || item.cls === 'can') return (hasUpgrade('stack') ? 3 : 2);
    return 1;
  }
  grabItem(it) {
    if (it.held && it.held.npc) { const r = it.held.npc; r.carry = r.carry.filter((x) => x !== it); }
    if (it.frozen) { emit('unserve', it); it.frozen = false; }
    it.onPass = false; it.sleeping = false; it.rejectedBy = null; it.ianSeen = false;
    if (it.cls === 'golden') { emit('golden', it); it.remove(); sfx.coin(); return true; }
    if (this.held && this.held.item && sameFamily(this.held.item, it) && this.stack.length + 1 < this.maxStack(it)) {
      it.held = this; this.stack.push(it); sfx.grab(); return true;
    }
    if (this.held) return false;
    this.held = { item: it }; it.held = this; it.vel.set(0, 0, 0);
    sfx.grab();
    emit('grabItem', it, this);
    return true;
  }
  grabPerson(per, idx) {
    if (this.held) return false;
    if (!per.grab(idx, this)) return false;
    this.held = { person: per, idx };
    sfx.grab();
    emit('grabPerson', per, this);
    return true;
  }
  release(throwVel) {
    if (!this.held) return;
    const v = (throwVel || this.vel).clone();
    if (this.held.item) {
      const all = [this.held.item, ...this.stack];
      all.forEach((it, i) => {
        it.held = null;
        if (it.dead) return;
        it.vel.copy(v);
        if (v.length() > 3) it.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
        else if (placeIfLow(it, v, i)) return;
        it.lastThrown = G.time;
        if (v.length() > 4) emit('itemThrown', it, v.length());
      });
      this.stack = [];
      sfx.drop();
    } else if (this.held.person) {
      this.held.person.release(this, v);
    }
    this.held = null;
  }
  forceRelease() {
    if (!this.held) return;
    if (this.held.item) { [this.held.item, ...this.stack].forEach((it) => { it.held = null; }); this.stack = []; }
    else if (this.held.person) this.held.person.heldBy = this.held.person.heldBy.filter((x) => x.hand !== this);
    this.held = null;
  }
  updateHeld(dt) {
    if (!this.held) return;
    if (this.held.item) {
      const it = this.held.item;
      if (it.dead) { this.held = null; this.stack = []; return; }
      it.pos.copy(this.pos);
      const yawQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, new THREE.Euler().setFromQuaternion(this.quat, 'YXZ').y, 0, 'YXZ'));
      it.mesh.quaternion.copy(it.cls === 'card' || it.cls === 'ball' ? this.quat : yawQ);
      sloshDrink(it, this.speed(), dt);
      this.stack = this.stack.filter((s) => !s.dead);
      this.stack.forEach((s, i) => {
        if (s.cls === 'plate') s.pos.copy(this.pos).add(V(0, 0.045 * (i + 1), 0));
        else s.pos.copy(this.pos).add(V(((i % 2) ? -1 : 1) * 0.09 * (Math.floor(i / 2) + 1), 0, 0).applyQuaternion(yawQ));
        s.mesh.quaternion.copy(yawQ);
        sloshDrink(s, this.speed(), dt);
      });
    } else if (this.held.person && this.held.person.dead) this.held = null;
    else if (this.held.person && this.held.person.state !== 'ragdoll') this.held = null;
  }
}
function sameFamily(a, b) {
  if (a.cls === 'plate' && b.cls === 'plate') return true;
  const drink = (x) => x.cls === 'glass' || x.cls === 'can';
  return drink(a) && drink(b);
}
// Gentle drop: snap onto the surface right below (so plates don't smash when you place them).
function placeIfLow(it, v, i) {
  if (v.length() > (G.xr ? 1.4 : 4)) return false;
  const top = surfaceBelow(it.pos.x, it.pos.z, it.pos.y + 0.05);
  const drop = it.pos.y - (top + it.r);
  if (drop < (G.xr ? 0.45 : 1.6)) {
    it.pos.y = top + it.r + 0.005 + (it.cls === 'plate' ? i * 0.03 : 0);
    if (i > 0 && it.cls !== 'plate') it.pos.x += 0.1 * i;
    it.vel.set(0, 0, 0); it.sleeping = false;
    return true;
  }
  return false;
}
export function surfaceBelow(x, z, yFrom) {
  let best = 0;
  for (const s of G.solids) {
    if (!s.enabled || s.max.y > yFrom || s.tag === 'invisible' || s.tag === 'ceiling') continue;
    if (x > s.min.x && x < s.max.x && z > s.min.z && z < s.max.z && s.max.y > best) best = s.max.y;
  }
  return best;
}

// ---------------------------------------------------------------- Player
export function createPlayer() {
  const p = {
    pos: V(-6.5, 0, 5.2), yaw: Math.PI, pitch: 0,
    crouch: 0, crouchHeld: false, deep: false,
    eye: 2.05, eyeTarget: 2.05,
    stamina: 1, sprinting: false, vel: V(),
    bonks: 0, inBeam: false, blur: 0,
    keepie: 0, lastTouchY: 0, keepieGround: true,
    target: null, holdProgress: 0, holdTarget: null,
    snapReady: true,
    rigOffset: 0,
    isCrouched() { return headWorld().y < (G.settings.normalHeight ? 1.42 : 1.75); },
    headPos() { return headWorld().clone(); },
    forward() { const f = V(); G.camera.getWorldDirection(f); f.y = 0; return f.normalize(); },
    backDir() { return this.forward().multiplyScalar(-1); },
    give(item) {
      const order = G.settings.leftHanded ? [0, 1] : [1, 0];
      for (const i of order) if (G.hands[i].isEmpty()) { G.hands[i].grabItem(item); return; }
      for (const i of order) if (G.hands[i].grabItem(item)) return;
      item.vel.set(0, 0, 0);
    },
  };
  G.player = p;
  G.hands = [new Hand('left'), new Hand('right')];
  G.body = makeBody();
  G.scene.add(G.body);
  return p;
}

const _head = V();
function headWorld() { G.camera.getWorldPosition(_head); return _head; }

export function resetPlayer(pos, yaw) {
  const p = G.player;
  p.pos.copy(pos); p.yaw = yaw; p.pitch = 0; p.crouch = 0; p.keepie = 0; p.bonks = 0; p.stamina = 1; p.blur = 0;
  G.hands.forEach((h) => { h.forceRelease(); });
  G.rig.position.set(pos.x, 0, pos.z);
  G.rig.rotation.set(0, yaw, 0);
  G.camera.rotation.set(0, 0, 0);
}

// ---------------------------------------------------------------- input setup
export function setupInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    pressed[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) && G.mode === 'playing') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  canvas.addEventListener('mousedown', (e) => {
    initAudio();
    if (G.mode !== 'playing' || G.xr || G.touch) return;
    if (!mouse.locked) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) pressed.Mouse0 = true;
    if (e.button === 2) pressed.Mouse2 = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { mouse.locked = document.pointerLockElement === canvas; if (!mouse.locked && G.mode === 'playing' && !G.xr && !G.touch) emit('requestPause'); });
  document.addEventListener('mousemove', (e) => { if (mouse.locked) { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
}

export function setupTouch() {
  const ui = document.getElementById('touch');
  ui.innerHTML = `
    <div id="stick"><div id="knob"></div></div>
    <div id="tbtns">
      <button data-b="act">TALK<br><small>use</small></button>
      <button data-b="grabR">GRAB<br><small>right</small></button>
      <button data-b="grabL">GRAB<br><small>left</small></button>
      <button data-b="throw">THROW</button>
      <button data-b="kick">KICK</button>
      <button data-b="crouch">CROUCH</button>
      <button data-b="sprint">RUN</button>
      <button data-b="radio">RONNIE</button>
      <button data-b="pause">II</button>
    </div>`;
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  let stickId = null, lookId = null, lx = 0, ly = 0, sx = 0, sy = 0;
  stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; stickId = t.identifier; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        let dx = t.clientX - sx, dy = t.clientY - sy; const m = Math.hypot(dx, dy), max = 50;
        if (m > max) { dx *= max / m; dy *= max / m; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        touch.moveX = dx / max; touch.moveY = dy / max;
      } else if (t.identifier === lookId) {
        touch.lookDX += t.clientX - lx; touch.lookDY += t.clientY - ly; lx = t.clientX; ly = t.clientY;
      }
    }
    if (G.mode === 'playing') e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; touch.moveX = touch.moveY = 0; knob.style.transform = ''; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  document.getElementById('c').addEventListener('touchstart', (e) => {
    initAudio();
    for (const t of e.changedTouches) if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
  }, { passive: true });
  ui.querySelectorAll('button').forEach((b) => {
    const name = b.dataset.b;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); touch.buttons[name] = true; pressed['T_' + name] = true; b.classList.add('on'); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); touch.buttons[name] = false; b.classList.remove('on'); }, { passive: false });
    b.addEventListener('mousedown', () => { touch.buttons[name] = true; pressed['T_' + name] = true; });
    b.addEventListener('mouseup', () => { touch.buttons[name] = false; });
  });
}

// ---------------------------------------------------------------- per-frame input state
function gatherInput() {
  const inp = { move: V(), turn: 0, snap: 0, lookX: 0, lookY: 0, sprint: false, interact: false, interactHeld: false, crouchToggle: false, deepHeld: false, radio: false, pause: false, kick: false, grab: [false, false], release: [false, false], gripHeld: [false, false], throwHard: false, flatToggle: [false, false] };
  if (G.xr) {
    const session = G.renderer.xr.getSession();
    const srcs = session ? session.inputSources : [];
    let L = null, R = null;
    for (const s of srcs) { if (!s.gamepad) continue; if (s.handedness === 'left') L = s.gamepad; else if (s.handedness === 'right') R = s.gamepad; }
    if (G.settings.leftHanded) [L, R] = [R, L];
    const prev = gatherInput.prevPads || (gatherInput.prevPads = { L: [], R: [] });
    const btn = (pad, i) => !!(pad && pad.buttons[i] && pad.buttons[i].pressed);
    const edge = (pad, key, i) => btn(pad, i) && !prev[key][i];
    if (L) { const ax = L.axes; inp.move.set(ax[2] || 0, 0, ax[3] || 0); if (inp.move.length() < 0.15) inp.move.set(0, 0, 0); inp.sprint = btn(L, 3); inp.radio = edge(L, 'L', 4); inp.pause = edge(L, 'L', 5); }
    if (R) {
      const ax = R.axes; const x = ax[2] || 0;
      if (G.settings.smoothTurn) inp.turn = Math.abs(x) > 0.2 ? -x : 0;
      else if (Math.abs(x) > 0.7 && G.player.snapReady) { inp.snap = -Math.sign(x); G.player.snapReady = false; }
      else if (Math.abs(x) < 0.3) G.player.snapReady = true;
      inp.interact = edge(R, 'R', 4); inp.interactHeld = btn(R, 4);
      // B: tap = crouch toggle, hold = deep crouch
      if (edge(R, 'R', 5)) gatherInput.bDown = performance.now();
      if (btn(R, 5) && performance.now() - (gatherInput.bDown || 0) > 350) inp.deepHeld = true;
      if (!btn(R, 5) && prev.R[5] && performance.now() - (gatherInput.bDown || 0) <= 350) inp.crouchToggle = true;
    }
    // Hands: index 0 = left hand, 1 = right hand (physical)
    const handPads = [L, R];
    if (G.settings.leftHanded) handPads.reverse();
    handPads.forEach((pad, i) => {
      const key = (G.settings.leftHanded ? i === 1 : i === 0) ? 'L' : 'R';
      inp.gripHeld[i] = btn(pad, 1);
      inp.grab[i] = edge(pad, key, 1);
      inp.release[i] = !btn(pad, 1) && prev[key][1];
      if (edge(pad, key, 0)) inp.interact = true;
      if (btn(pad, 0)) inp.interactHeld = true;
    });
    prev.L = L ? L.buttons.map((b) => b.pressed) : [];
    prev.R = R ? R.buttons.map((b) => b.pressed) : [];
    return inp;
  }
  // Flat: keyboard + mouse + touch
  const k = keys;
  inp.move.set((k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), 0, (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0));
  if (G.touch) { inp.move.x += touch.moveX; inp.move.z += touch.moveY; }
  if (inp.move.length() > 1) inp.move.normalize();
  inp.lookX = mouse.dx * 0.0025 + touch.lookDX * 0.006; inp.lookY = mouse.dy * 0.0025 + touch.lookDY * 0.006;
  mouse.dx = mouse.dy = 0; touch.lookDX = touch.lookDY = 0;
  inp.sprint = k.ShiftLeft || k.ShiftRight || touch.buttons.sprint;
  inp.interact = pressed.KeyE || pressed.T_act; inp.interactHeld = k.KeyE || touch.buttons.act;
  inp.crouchToggle = pressed.KeyC || pressed.ControlLeft || pressed.T_crouch; inp.deepHeld = k.KeyV;
  inp.radio = pressed.KeyR || pressed.T_radio; inp.pause = pressed.Escape || pressed.KeyP || pressed.T_pause;
  inp.kick = pressed.KeyF || pressed.T_kick;
  inp.flatToggle = [pressed.KeyQ || pressed.T_grabL, pressed.Mouse0 || pressed.T_grabR];
  inp.throwHard = pressed.Mouse2 || pressed.T_throw || pressed.KeyT;
  return inp;
}

// ---------------------------------------------------------------- update
const _tmpQ = new THREE.Quaternion();
export function updatePlayer(dt) {
  const p = G.player;
  const inp = gatherInput();
  pressed = {};
  if (inp.pause) { emit('requestPause'); return; }
  if (G.mode !== 'playing') return;

  // Crouch state
  if (inp.crouchToggle) { p.crouch = p.crouch ? 0 : 1; sfx.blip(); }
  p.deep = inp.deepHeld;
  const normal = G.settings.normalHeight;
  // Look / turn
  if (!G.xr) {
    p.yaw -= inp.lookX; p.pitch = clamp(p.pitch - inp.lookY, -1.45, 1.35);
    const heights = normal ? [1.7, 1.3, 0.9] : [2.05, 1.5, 0.95];
    p.eyeTarget = p.deep ? heights[2] : heights[p.crouch];
    p.eye += (p.eyeTarget - p.eye) * Math.min(1, dt * 10);
  } else {
    if (inp.snap) rotateRigAroundHead(inp.snap * Math.PI / 6);
    if (inp.turn) rotateRigAroundHead(inp.turn * dt * 2.2);
    const base = (normal ? 0 : 0.3) + (G.settings.seated ? 0.55 : 0);
    const target = base - (p.deep ? 1.0 : p.crouch ? 0.45 : 0);
    p.rigOffset += (target - p.rigOffset) * Math.min(1, dt * 10);
  }

  // Movement
  const fwd = p.forward(), right = V(-fwd.z, 0, fwd.x);
  const wish = V().addScaledVector(right, inp.move.x).addScaledVector(fwd, -inp.move.z);
  let speed = 2.6 * (hasUpgrade('walk') ? 1.2 : 1);
  if (p.crouch || p.deep) speed *= 0.6;
  p.sprinting = inp.sprint && p.stamina > 0.05 && wish.lengthSq() > 0.01;
  if (p.sprinting) { speed *= 1.7; p.stamina = Math.max(0, p.stamina - dt * 0.3); }
  else p.stamina = Math.min(1, p.stamina + dt * 0.18);
  p.vel.copy(wish).multiplyScalar(speed);

  if (G.xr) {
    G.rig.position.addScaledVector(p.vel, dt);
    G.rig.position.y = p.rigOffset;
    G.rig.updateMatrixWorld(true);
    const h = headWorld();
    const before = V(h.x, 0, h.z), after = before.clone();
    collidePlayer(after, 0.28);
    G.rig.position.x += after.x - before.x; G.rig.position.z += after.z - before.z;
    p.pos.copy(after);
    p.yaw = Math.atan2(-fwd.x, -fwd.z);
  } else {
    p.pos.addScaledVector(p.vel, dt);
    collidePlayer(p.pos, 0.3);
    G.rig.position.set(p.pos.x, 0, p.pos.z);
    G.rig.rotation.set(0, p.yaw, 0);
    G.camera.position.set(0, p.eye, 0);
    G.camera.rotation.set(p.pitch, 0, 0, 'YXZ');
  }
  G.rig.updateMatrixWorld(true);

  // Kitchen door: chef throws you out
  if (p.pos.distanceTo(FIX.kitchenDoor) < 0.65) {
    const push = V(0, 0, 1.4);
    if (G.xr) G.rig.position.add(push); else p.pos.add(push);
    p.blur = 0.8; sfx.thud();
    G.chef?.say(pick(['OUT OF MY KITCHEN!', 'NOT IN HERE, LANKY!']));
    emit('chefThrow');
  }

  updateHands(dt, inp);
  updateBody();
  updateBonk(dt);
  updateFootball(dt, inp);
  updateInteract(dt, inp);
  if (inp.radio && G.ronnie) { G.ronnie.radio(); emit('radio'); }
  if (p.blur > 0) p.blur -= dt;
}

function rotateRigAroundHead(angle) {
  const h = headWorld().clone();
  G.rig.rotation.y += angle;
  G.rig.updateMatrixWorld(true);
  const h2 = headWorld();
  G.rig.position.x += h.x - h2.x; G.rig.position.z += h.z - h2.z;
}

function updateBody() {
  const h = headWorld();
  const f = G.player.forward();
  G.body.position.set(h.x, h.y, h.z).addScaledVector(f, -0.08);
  G.body.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  const sc = clamp(h.y / 2.05, 0.4, 1.1);
  G.body.scale.set(1, sc, 1);
}

// ---------------------------------------------------------------- hands
let handsReady = false;
export function attachHands() {
  if (handsReady) return;
  handsReady = true;
  for (let i = 0; i < 2; i++) {
    const grip = G.renderer.xr.getControllerGrip(i);
    grip.addEventListener('connected', (e) => { grip.userData.handedness = e.data.handedness; });
    G.rig.add(grip);
    grip.userData.index = i;
    (G.grips ||= []).push(grip);
  }
}

function updateHands(dt, inp) {
  const p = G.player;
  for (let i = 0; i < 2; i++) {
    const h = G.hands[i];
    h.prev.copy(h.pos);
    if (G.xr) {
      const want = i === 0 ? 'left' : 'right';
      const srcs = G.renderer.xr.getSession()?.inputSources || [];
      (G.grips || []).forEach((g) => { if (!g.userData.handedness && srcs[g.userData.index]) g.userData.handedness = srcs[g.userData.index].handedness; });
      const grip = (G.grips || []).find((g) => g.userData.handedness === want);
      if (grip) {
        if (h.mesh.parent !== grip) { grip.add(h.mesh); h.mesh.position.set(0, 0, 0.02); h.mesh.rotation.set(0, 0, 0); }
        grip.getWorldPosition(h.pos); grip.getWorldQuaternion(h.quat);
      }
      h.grip += ((inp.gripHeld[i] ? 1 : 0) - h.grip) * Math.min(1, dt * 20);
    } else {
      if (h.mesh.parent !== G.camera) { G.camera.add(h.mesh); }
      const side = i === 0 ? -1 : 1;
      const reach = h.held ? 0.75 : 0.55;
      h.mesh.position.set(side * 0.28, -0.32 + (h.held ? 0.06 : 0), -reach);
      h.mesh.rotation.set(0.2, -side * 0.15, 0);
      h.mesh.updateMatrixWorld(true);
      h.mesh.getWorldPosition(h.pos);
      G.camera.getWorldQuaternion(h.quat);
      h.grip += ((h.held ? 1 : 0) - h.grip) * Math.min(1, dt * 15);
    }
    h.mesh.userData.setGrip(h.grip);
    // Velocity (smoothed)
    const v = V().subVectors(h.pos, h.prev).multiplyScalar(1 / Math.max(dt, 1e-3));
    h.hist.push(v); if (h.hist.length > 5) h.hist.shift();
    h.vel.set(0, 0, 0); h.hist.forEach((x) => h.vel.add(x)); h.vel.multiplyScalar(1 / h.hist.length);
    if (h.vel.length() > 25) h.vel.setLength(25);
    h.kickCooldown -= dt;

    if (G.xr) {
      if (inp.grab[i]) tryGrabNear(h);
      if (inp.release[i]) h.release();
    } else {
      if (inp.flatToggle[i]) {
        if (h.held) h.release(h.vel.clone().add(G.player.vel));
        else tryGrabRay(h);
      }
    }
  }
  if (!G.xr && inp.throwHard) {
    const h = G.hands[1].held ? G.hands[1] : G.hands[0];
    if (h.held) {
      const dir = V(); G.camera.getWorldDirection(dir);
      const power = h.held.person ? 9 : 11;
      h.release(dir.multiplyScalar(power).add(V(0, 2.5, 0)).add(G.player.vel));
      sfx.whoosh();
    }
  }
  G.hands.forEach((h) => h.updateHeld(dt));
}

function grabbableItems() { return G.items.filter((it) => !it.dead && it.cls !== 'shard' && (!it.held || (it.held.npc && it.kind !== 'keg'))); }

function tryGrabNear(h) {
  let best = null, bd = 0.2;
  for (const it of grabbableItems()) { const d = it.pos.distanceTo(h.pos) - it.r; if (d < bd) { bd = d; best = { it }; } }
  for (const per of G.people) {
    if (per.hidden || per.immune) continue;
    const n = per.nearestParticle(h.pos);
    if (n.dist < bd + 0.04) { bd = n.dist; best = { per, idx: n.idx }; }
  }
  if (!best) return;
  if (best.it) h.grabItem(best.it); else h.grabPerson(best.per, best.idx);
}

function tryGrabRay(h) {
  const origin = headWorld().clone(), dir = V(); G.camera.getWorldDirection(dir);
  const maxD = 3.0;
  let best = null, bt = maxD;
  const test = (center, radius) => {
    const oc = V().subVectors(center, origin), t = oc.dot(dir);
    if (t < 0 || t > maxD) return null;
    const perp = oc.addScaledVector(dir, -t).length();
    return perp < radius ? t : null;
  };
  for (const it of grabbableItems()) { const t = test(it.pos, it.r + 0.12); if (t !== null && t < bt) { bt = t; best = { it }; } }
  for (const per of G.people) {
    if (per.hidden || per.immune) continue;
    for (let i = 0; i < 7; i++) { const t = test(per.p[i], i === HEAD ? 0.26 : 0.18); if (t !== null && t < bt - 0.05) { bt = t; best = { per, idx: i }; } }
  }
  if (!best) return;
  if (best.it) h.grabItem(best.it); else h.grabPerson(best.per, best.idx);
}

// ---------------------------------------------------------------- head bonk
function updateBonk(dt) {
  if (G.settings.normalHeight) return;
  const p = G.player, h = headWorld();
  let inBeam = false, name = '';
  for (const b of G.beams) {
    if (h.y + 0.1 > b.min.y && h.x > b.min.x - 0.12 && h.x < b.max.x + 0.12 && h.z > b.min.z - 0.12 && h.z < b.max.z + 0.12) { inBeam = true; name = b.name; break; }
  }
  if (inBeam && !p.inBeam) {
    p.bonks++; p.blur = 1.0;
    sfx.thunk();
    emit('bonk', p.bonks, name);
    // little knock-back
    const back = p.vel.clone().setY(0);
    if (back.lengthSq() > 0.01) { back.normalize().multiplyScalar(-0.15); if (G.xr) G.rig.position.add(back); else p.pos.add(back); }
  }
  p.inBeam = inBeam;
}

// ---------------------------------------------------------------- football
function touchBall(kind) {
  const p = G.player, b = G.ball;
  if (!p.keepieGround && b.pos.y > 0.2) { p.keepie++; emit('keepie', p.keepie); }
  else p.keepie = Math.max(p.keepie, 0);
  p.keepieGround = false;
  b.lastKickTime = G.time; b.lastKicker = 'lewis';
  emit('ballTouch', kind);
}

function updateFootball(dt, inp) {
  const b = G.ball; if (!b || b.dead) return;
  const p = G.player;
  if (b.held) { p.keepie = 0; p.keepieGround = true; }
  else if (b.pos.y <= b.r + 0.02 && Math.abs(b.vel.y) < 0.5) { if (p.keepie > 0) emit('keepieEnd', p.keepie); p.keepie = 0; p.keepieGround = true; }
  // Dribble: walking into the ball pushes it
  const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, dxz = Math.hypot(dx, dz);
  if (!b.held && b.pos.y < 0.5 && dxz < 0.42 && dxz > 1e-3) {
    const push = V(dx / dxz, 0, dz / dxz);
    const sp = Math.max(1.2, p.vel.length() * 1.3);
    if (b.vel.dot(push) < sp) { b.vel.x = push.x * sp; b.vel.z = push.z * sp; b.sleeping = false; }
  }
  if (G.xr) {
    // Kick by swinging a controller low and fast
    for (const h of G.hands) {
      if (h.held || h.kickCooldown > 0) continue;
      const sp = h.speed();
      if (h.pos.y < 0.8 && sp > 2.2) {
        if (!b.held && h.pos.distanceTo(b.pos) < 0.42) {
          b.vel.copy(h.vel).multiplyScalar(1.6); b.vel.y = Math.max(b.vel.y, 1.0 + sp * 0.25); b.sleeping = false;
          h.kickCooldown = 0.3; sfx.kick(); touchBall('kick'); emit('kick', sp);
        } else {
          for (const per of G.people) {
            if (per.state === 'ragdoll' || per.hidden || per.immune) continue;
            if (Math.min(per.p[LF].distanceTo(h.pos), per.p[RF].distanceTo(h.pos)) < 0.35) { per.knock(h.vel.clone().multiplyScalar(0.8).add(V(0, 2, 0)), 'kick'); h.kickCooldown = 0.5; sfx.kick(); break; }
          }
        }
      }
    }
    // Headers: Lewis wins every header
    const head = headWorld();
    if (!b.held && head.distanceTo(b.pos) < b.r + 0.16 && (!b.lastHeader || G.time - b.lastHeader > 0.35)) {
      b.lastHeader = G.time;
      const f = p.forward();
      const n = V().subVectors(b.pos, head).normalize();
      b.vel.reflect(n).multiplyScalar(0.5).addScaledVector(f, 3.5).add(V(0, 2.5, 0));
      sfx.kick(); touchBall('header');
    }
  } else if (inp.kick) {
    const f = V(); G.camera.getWorldDirection(f);
    const flatF = p.forward();
    const heldBy = G.hands.find((h) => h.held && h.held.item === b);
    if (heldBy) {
      heldBy.forceRelease();
      b.pos.copy(p.pos).addScaledVector(flatF, 0.5).setY(0.5);
      b.vel.copy(f).multiplyScalar(13).add(V(0, 3.5, 0)); b.sleeping = false;
      sfx.kick(); touchBall('volley'); emit('kick', 13);
      return;
    }
    const to = V().subVectors(b.pos, p.pos); to.y = 0;
    const dist = to.length();
    const ang = dist > 0.01 ? Math.acos(clamp(to.normalize().dot(flatF), -1, 1)) : 0;
    if (!b.held && dist < 1.9 && ang < 1.0 && b.pos.y < 2.4) {
      if (b.pos.y > 1.3) { b.vel.copy(f).multiplyScalar(8).add(V(0, 2.5, 0)); touchBall('header'); }
      else {
        const lift = b.pos.y > 0.35 ? 4.5 : 3.2;
        b.vel.copy(f).setY(0).normalize().multiplyScalar(12.5).add(V(0, lift + Math.max(0, f.y) * 8, 0));
        touchBall('kick');
      }
      b.sleeping = false; sfx.kick(); emit('kick', 12);
      return;
    }
    // Trip someone in front
    for (const per of G.people) {
      if (per.state === 'ragdoll' || per.hidden || per.immune) continue;
      const d = V().subVectors(per.root, p.pos); d.y = 0;
      if (d.length() < 1.4 && d.normalize().dot(flatF) > 0.6) { per.knock(flatF.clone().multiplyScalar(5).add(V(0, 2.5, 0)), 'kick'); sfx.kick(); return; }
    }
    sfx.whoosh();
  }
}

// ---------------------------------------------------------------- interact
function updateInteract(dt, inp) {
  const p = G.player;
  const head = headWorld(), dir = V(); G.camera.getWorldDirection(dir);
  let best = null, bs = 1e9;
  G.interactables = G.interactables.filter((x) => !x.dead);
  for (const it of G.interactables) {
    const pos = typeof it.pos === 'function' ? it.pos() : it.pos;
    if (!pos) continue;
    const d = head.distanceTo(pos);
    const handNear = G.xr && G.hands.some((h) => h.pos.distanceTo(pos) < 0.4);
    if (d > (it.radius || 2) && !handNear) continue;
    const label = it.label();
    if (!label) continue;
    const to = V().subVectors(pos, head).normalize();
    const ang = Math.acos(clamp(to.dot(dir), -1, 1));
    const maxAng = it.card ? 0.22 : (G.xr ? 0.75 : 0.6);
    if (ang > maxAng && !handNear) continue;
    const score = ang + d * 0.08 - (handNear ? 1 : 0) - (it.card ? 0.3 : 0);
    if (score < bs) { bs = score; best = { it, label }; }
  }
  p.target = best;
  const hold = best && best.it.hold ? best.it.hold() : 0;
  if (best && hold > 0) {
    if (inp.interactHeld) {
      if (p.holdTarget !== best.it) { p.holdTarget = best.it; p.holdProgress = 0; }
      p.holdProgress += dt / hold;
      if (p.holdProgress >= 1) { p.holdProgress = 0; p.holdTarget = null; best.it.action(); emit('interacted', best.it); }
    } else { p.holdProgress = Math.max(0, p.holdProgress - dt * 2); }
  } else {
    p.holdProgress = 0; p.holdTarget = null;
    if (best && inp.interact) { best.it.action(); emit('interacted', best.it); }
  }
}

export function isPointerLocked() { return mouse.locked; }
export function releasePointer() { if (document.pointerLockElement) document.exitPointerLock(); }
