// Random pub chaos events + little ambient extras from the design doc.
import * as THREE from 'three';
import { G, V, rand, randi, pick, chance, clamp, emit, on } from './state.js';
import { FIX, mat, collideSphere, setDim, inPub, LIGHTS } from './world.js';
import { Item, spawnPlate } from './physics.js';
import { Person, PELVIS, HEAD, RH } from './people.js';
import { groups, tableById, delayKitchen, spawnGroup } from './serving.js';
import { ALL_EVENTS, LINES } from './data.js';
import { labelSprite, stutterize } from './textures.js';
import { sfx, speak } from './audio.js';

let active = null;          // { def, name, t, ...state }
let timer = 60;
const inter = (o) => { G.interactables.push(o); return o; };
const toast = (t, d = 3.5) => G.toast(t, d);

export function abortEvent() { if (active) endEvent(true); active = null; }
export function resetEvents() {
  if (active) endEvent(true);
  active = null;
  const cfg = G.shift.cfg;
  timer = cfg.eventsFrom ?? rand(45, 70);
  ambient.storyPounds = randi(8, 14); ambient.storyTimer = rand(40, 70); ambient.tannoy = 30; ambient.barCooldown = 0; ambient.lastPos = null;
}
export const activeEventName = () => active?.name || null;

function pickEvent() {
  const cfg = G.shift.cfg;
  const pool = cfg.events === 'all' ? ALL_EVENTS : (cfg.events || []);
  const ok = pool.filter((n) => DEFS[n] && (!DEFS[n].can || DEFS[n].can()));
  return ok.length ? pick(ok) : null;
}

export function startEvent(name) {
  if (active) endEvent(true);
  const def = DEFS[name];
  if (!def) return;
  active = { def, name, t: 0, objs: [], inters: [] };
  def.start(active);
  emit('eventStart', name);
}
function endEvent(silent) {
  const ev = active; if (!ev) return;
  active = null;
  try { ev.def.end && ev.def.end(ev, silent); } catch (e) { console.error(e); }
  ev.objs.forEach((o) => { if (o.remove) o.remove(); else if (o.parent) o.parent.remove(o); });
  ev.inters.forEach((i) => { i.dead = true; });
  timer = G.shift.cfg.sandbox ? rand(35, 55) : rand(50, 85);
}

export function updateEvents(dt) {
  const sh = G.shift;
  if (!sh || sh.cfg.minigame && sh.cfg.minigame !== 'datenight') return;
  if (active) {
    active.t += dt;
    if (active.def.update(active, dt)) endEvent(false);
  } else if (sh.timeLeft > 45 || sh.cfg.duration === Infinity) {
    timer -= dt;
    if (timer <= 0) { const n = pickEvent(); if (n) startEvent(n); else timer = 20; }
  }
  updateAmbient(dt);
}

// Forward game events to the active event's hooks.
for (const hook of ['thrown', 'knocked', 'smash', 'delivered', 'spray', 'sing', 'bonk', 'itemImpact']) {
  on(hook, (...a) => { const fn = active?.def['on_' + hook]; if (fn) fn(active, ...a); });
}

// ---------------------------------------------------------------- critters (dog, crab)
function critter(kind, build, r, speed) {
  const it = new Item(kind, { mesh: build(), r, half: r, mass: kind === 'dog' ? 2.5 : 0.5, cls: 'critter', bounce: 0.2, pos: kind === 'crab' ? V(8.6, 0.2, 4.4) : FIX.spawn.clone().setY(r) });
  it.noSleep = true; it.speed = speed; it.target = null; it.wasHeld = false; it.legPhase = 0;
  it.onUpdate = (dt) => {
    if (it.held) { it.wasHeld = true; return false; }
    if (it.pos.y > it.r + 0.06 || it.vel.length() > 1.5) return false; // flying after a throw: normal physics
    it.vel.set(0, 0, 0);
    if (it.target) {
      const d = V().subVectors(it.target, it.pos); d.y = 0;
      const dist = d.length();
      if (dist > 0.05) {
        d.normalize();
        it.pos.addScaledVector(d, Math.min(dist, it.speed * dt));
        collideSphere(it.pos, V(), it.r);
        it.mesh.rotation.set(0, Math.atan2(d.x, d.z) + (kind === 'crab' ? Math.PI / 2 : 0), 0);
        it.legPhase += dt * 20;
        it.mesh.children.forEach((c) => { if (c.userData.leg !== undefined) c.rotation.x = Math.sin(it.legPhase + c.userData.leg) * 0.6; });
      }
    }
    it.pos.y = it.r;
    return true;
  };
  return it;
}
function dogMesh() {
  const g = new THREE.Group(), fur = mat(0x8d5524);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.5), fur); body.position.y = 0.05; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.2), fur); head.position.set(0, 0.18, 0.3); g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), mat(0x5d3a1a)); snout.position.set(0, 0.14, 0.43); g.add(snout);
  for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.04), mat(0x5d3a1a)); ear.position.set(sx * 0.07, 0.3, 0.27); g.add(ear); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), fur); tail.position.set(0, 0.15, -0.3); tail.rotation.x = -0.6; g.add(tail);
  [[-0.08, 0.18], [0.08, 0.18], [-0.08, -0.18], [0.08, -0.18]].forEach(([x, z], i) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), fur); l.geometry.translate(0, -0.08, 0); l.position.set(x, -0.04, z); l.userData.leg = i * Math.PI / 2; g.add(l); });
  return g;
}
function crabMesh() {
  const g = new THREE.Group(), red = mat(0xd84315);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 5), red); body.scale.set(1.3, 0.5, 1); g.add(body);
  for (const sx of [-1, 1]) {
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), red); claw.position.set(sx * 0.11, 0.01, 0.06); g.add(claw);
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), red); l.position.set(sx * 0.09, -0.02, -0.03 + i * 0.03); l.userData.leg = i; g.add(l); }
  }
  return g;
}
function wanderTarget() { return V(rand(-8.5, 8.5), 0, rand(-6.5, 6.5)); }
const outside = (p) => p.z > 8.2 || p.x > 10.3;

// ---------------------------------------------------------------- definitions
const DEFS = {
  fireAlarm: {
    start(ev) {
      ev.dur = 22; ev.beep = 0;
      toast('🚨 FIRE ALARM! Everyone out onto the street. (Walk out with them to be the fire warden.)', 5);
      sfx.alarm();
      for (const g of groups) {
        if (g.dead || g.state === 'leaving' || g.state === 'runner') continue;
        g.evac = true;
        g.members.forEach((m) => { if (m.state !== 'ragdoll' && !m.dead) { m.eating = false; m.walkTo(V(rand(-9, -2), 0, rand(9.4, 10.8)), null, chance(0.3)); } });
      }
      if (G.ian && !G.ian.boss) G.ian.say("I'm not moving, Lewy. I've got a pint.", true);
    },
    update(ev, dt) {
      ev.beep -= dt; if (ev.beep <= 0) { ev.beep = 1.2; sfx.alarm(); }
      return ev.t > ev.dur;
    },
    end(ev) {
      const warden = G.player.pos.z > 8.1;
      for (const g of groups) {
        if (!g.evac) continue;
        g.evac = false;
        g.members.forEach((m) => {
          if (m.dead || m.state === 'ragdoll') return;
          if (m.seat && g.table) m.walkTo(m.seat.pos, () => { m.sitAt(m.seat); m.eating = g.table?.state === 'eating'; });
          else m.walkTo(FIX.queue.clone().add(V(rand(0, 2), 0, rand(-0.2, 0.3))));
        });
      }
      toast(warden ? 'All clear! Fire warden Lewis: +£3' : 'All clear. Everyone shuffles back in.', 3);
      if (warden) emit('addTips', 3);
    },
  },
  powerCut: {
    start(ev) {
      setDim(true, G.shift.cfg.season === 'halloween' ? 0.03 : 0.07);
      if (!G.torch) {
        G.torch = new THREE.SpotLight(0xfff4d0, 8, 16, 0.5, 0.5, 1.2);
        const tgt = new THREE.Object3D(); tgt.position.set(0, 0, -1); G.camera.add(tgt); G.torch.target = tgt;
        G.camera.add(G.torch);
      }
      G.torch.visible = true;
      toast('💡 POWER CUT! Phone torch on. Reset the fuse box by the STAFF ONLY door (hold).', 5);
      sfx.buzz();
      ev.inters.push(inter({ pos: V(8.9, 1.3, -7.6), radius: 2.5, label: () => 'Reset the fuse box (hold)', hold: () => 1.5, action: () => { ev.fixed = true; } }));
      for (const g of groups) if (g.table && chance(0.5)) pick(g.members).say(pick(['Who turned the lights off?!', 'I can\'t see my chips!', 'Spooky...']));
    },
    update(ev) { return ev.fixed || ev.t > 45; },
    end(ev) { setDim(false); if (G.torch) G.torch.visible = false; toast(ev.fixed ? 'Lights back on. Tall lad fixed the fuse.' : 'The power came back on by itself.', 2.5); if (ev.fixed) emit('addTips', 1); },
  },
  dog: {
    start(ev) {
      ev.dog = critter('dog', dogMesh, 0.18, 2.4); ev.objs.push(ev.dog);
      ev.phase = 'seek'; ev.retarget = 0;
      toast('🐕 A dog has wandered in! It\'s after the sausages. Grab it and put it outside.', 4);
      sfx.bounce();
    },
    update(ev, dt) {
      const d = ev.dog;
      if (d.dead) return true;
      if (d.wasHeld && !d.held && outside(d.pos) && d.pos.y < 0.4) { toast('Good boy. Out you go! The owner tips you £2.', 3); emit('addTips', 2); ev.done = true; return true; }
      ev.retarget -= dt;
      if (ev.retarget <= 0) {
        ev.retarget = 1.5;
        if (ev.phase === 'seek') {
          const plates = G.items.filter((it) => it.frozen && it.kind === 'plate' && it.servedTo && it.servedTo.group && inPub(it.pos));
          const p = plates.sort((a, b) => a.pos.distanceTo(d.pos) - b.pos.distanceTo(d.pos))[0];
          d.target = p ? p.pos.clone().setY(0) : wanderTarget();
          if (p && Math.hypot(p.pos.x - d.pos.x, p.pos.z - d.pos.z) < 0.9) {
            const t = p.servedTo;
            emit('unserve', p); p.remove();
            toast(`🐕 The dog stole table ${t.id}'s ${p.dish === 'roast' ? 'roast' : 'food'}!`, 3);
            if (t.group) pick(t.group.members).say('THAT DOG HAS MY DINNER!');
            ev.phase = 'flee'; sfx.bounce();
          }
        } else d.target = wanderTarget();
      }
      if (ev.t > 70) { toast('The dog trots off home.', 2); return true; }
      return false;
    },
  },
  crab: {
    can: () => !!G.ian && !G.ian.boss,
    start(ev) {
      ev.crab = critter('crab', crabMesh, 0.08, 1.6); ev.objs.push(ev.crab);
      ev.retarget = 0; ev.pinch = 0;
      G.ian.say("LEWY! My crab's escaped! Don't let it near the chips!", true);
      toast("🦀 Ian's live crab has escaped! Put it back on Ian's table (or throw it outside).", 4);
    },
    update(ev, dt) {
      const c = ev.crab;
      if (c.dead) return true;
      const it = tableById('ian');
      if (c.wasHeld && !c.held && Math.abs(c.pos.x - it.x) < 0.5 && Math.abs(c.pos.z - it.z) < 0.5 && c.pos.y > 0.6) { G.ian.say('Back in the bucket, Clive. Good lad, Lewy.'); G.ian.add(-10); emit('addTips', 2); toast('Crab returned. +£2', 2); return true; }
      if (c.wasHeld && !c.held && outside(c.pos) && c.pos.y < 0.3) { toast('The crab scuttles off to freedom. +£1', 2); emit('addTips', 1); return true; }
      ev.retarget -= dt;
      if (ev.retarget <= 0) { ev.retarget = rand(1, 2.5); c.target = c.pos.clone().add(V(rand(-2.5, 2.5), 0, rand(-2.5, 2.5))); }
      ev.pinch -= dt;
      if (ev.pinch <= 0 && !c.held) {
        for (const per of G.people) {
          if (per.hidden || per.immune || per.state === 'ragdoll' || per.state === 'sit' && chance(0.5)) continue;
          if (per.root.distanceTo(c.pos) < 0.4) { per.knock(V(0, 3.5, 0), 'crab'); per.say('OW! A CRAB?!'); ev.pinch = 2.5; emit('addChaos', 4, 'crab'); break; }
        }
      }
      return ev.t > 80;
    },
  },
  seagull: {
    can: () => G.gardenOpen,
    start(ev) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xffffff)); body.scale.set(0.8, 0.7, 1.4); g.add(body);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), mat(0xffb300)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.03, 0.2); g.add(beak);
      ev.wings = [];
      for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.15), mat(0xb0bec5)); w.geometry.translate(sx * 0.2, 0, 0); g.add(w); ev.wings.push(w); }
      g.position.set(16, 7, 12); G.scene.add(g); ev.objs.push(g); ev.bird = g;
      const plates = G.items.filter((it) => it.frozen && it.kind === 'plate' && it.pos.x > 10.2);
      ev.plate = pick(plates) || null;
      ev.target = ev.plate ? ev.plate.pos.clone().add(V(0, 0.15, 0)) : V(rand(12, 20), 0.85, rand(-5, 5));
      ev.phase = 'in';
      toast('🐦 SEAGULL incoming over the beer garden! Scare it off (throw something at it).', 4);
      sfx.whistle();
    },
    update(ev, dt) {
      const b = ev.bird;
      ev.wings.forEach((w, i) => { w.rotation.z = Math.sin(ev.t * 18) * 0.7 * (i ? -1 : 1); });
      const flyTo = (p, sp) => { const d = V().subVectors(p, b.position); const l = d.length(); if (l > 0.05) { b.position.addScaledVector(d, Math.min(1, sp * dt / l)); b.rotation.y = Math.atan2(d.x, d.z); } return l; };
      // Scared off by thrown items or a hand
      if (ev.phase !== 'out') {
        const hit = G.items.some((it) => !it.held && it.vel.length() > 4 && it.pos.distanceTo(b.position) < 0.5) || G.hands.some((h) => h.pos.distanceTo(b.position) < 0.4);
        if (hit) { ev.phase = 'out'; toast('SQUAWK! Seagull scared off. Hero.', 2.5); emit('addChaos', 10, 'gull'); emit('addTips', 1); sfx.whistle(); }
      }
      if (ev.phase === 'in') { if (flyTo(ev.target, 5) < 0.1) { ev.phase = 'steal'; ev.wait = 2.5; } }
      else if (ev.phase === 'steal') {
        ev.wait -= dt;
        if (ev.wait <= 0) {
          if (ev.plate && !ev.plate.dead && ev.plate.frozen) { const t = ev.plate.servedTo; emit('unserve', ev.plate); ev.plate.remove(); toast(`🐦 The seagull nicked table ${t?.id}'s chips!`, 3); if (t?.group) pick(t.group.members).say('MY CHIPS!'); }
          ev.phase = 'out';
        }
      } else if (flyTo(V(16, 10, -14), 7) < 0.5) return true;
      return ev.t > 40;
    },
  },
  kegOut: {
    can: () => !G.ronnie?.blockingTaps,
    start(ev) {
      G.kegOut = true;
      toast('🍺 The keg has run out! Change it at the cellar hatch at the end of the bar (hold).', 4);
      const hatch = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), mat(0x5d4037)); hatch.rotation.x = -Math.PI / 2; hatch.position.set(-8.6, 0.012, -7.25); G.scene.add(hatch); ev.objs.push(hatch);
      const l = labelSprite('CELLAR', { bg: '#5d4037', size: 30, scale: 0.15 }); l.position.set(-8.6, 0.6, -7.25); G.scene.add(l); ev.objs.push(l);
      ev.inters.push(inter({ pos: V(-8.6, 0.3, -7.25), radius: 2.4, label: () => 'Change the keg in the cellar (hold)', hold: () => 2.5, action: () => { ev.fixed = true; sfx.thud(); } }));
    },
    update(ev) { return ev.fixed || ev.t > 90; },
    end(ev) { G.kegOut = false; toast(ev.fixed ? 'New keg on. The taps are flowing again.' : 'Someone else changed the keg.', 2.5); },
  },
  birthday: {
    can: () => G.tables.some((t) => t.group && typeof t.id === 'number' && ['seated', 'ready', 'ordered', 'waiting'].includes(t.state)),
    start(ev) {
      const t = pick(G.tables.filter((t) => t.group && typeof t.id === 'number' && ['seated', 'ready', 'ordered', 'waiting'].includes(t.state)));
      ev.table = t; ev.group = t.group;
      t.needs.push('cake'); t.order.push('cake'); t.iconDirty = true;
      ev.cakeAt = 6;
      toast(`🎂 It's someone's birthday at table ${t.id}! A cake is coming to the pass. Carry it SLOWLY or the candles go out.`, 5);
    },
    update(ev, dt) {
      if (ev.group.dead || ev.table.group !== ev.group) return true;
      if (ev.cakeAt > 0) { ev.cakeAt -= dt; if (ev.cakeAt <= 0) { const p = spawnPlate('cake', ev.table.id, V(FIX.pass.x0, FIX.pass.y + 0.13, FIX.pass.z)); p.onPass = true; p.sleeping = true; p.candles = true; ev.cake = p; G.chef?.say('CAKE! Table ' + ev.table.id + '!'); sfx.ding(); } }
      const c = ev.cake;
      if (c && !c.dead && c.candles && c.held && c.held.speed && c.held.speed() > 2.0) {
        c.candles = false; (c.mesh.userData.flames || []).forEach((f) => { f.visible = false; }); toast('Whoosh. Candles blown out. Walk slower!', 2.5);
      }
      if (c && !c.dead) (c.mesh.userData.flames || []).forEach((f) => { if (f.visible) f.scale.y = 0.8 + Math.random() * 0.5; });
      return ev.done || ev.t > 120;
    },
    on_delivered(ev, t, it) {
      if (it.dish !== 'cake' || t !== ev.table) return;
      ev.done = true;
      if (it.candles) { toast('🎂 ♪ Happy birthday to you! ♪ The whole pub sings. +£8', 4); emit('addTips', 8); t.group.mood += 20; emit('regularsCheer'); sfx.cheer(); }
      else { toast('They relit the candles with a lighter. +£2', 3); emit('addTips', 2); }
    },
  },
  proposal: {
    can: () => G.tables.some((t) => t.group && typeof t.id === 'number' && t.group.members.length >= 2 && t.state !== 'bill'),
    start(ev) {
      const cands = G.tables.filter((t) => t.group && typeof t.id === 'number' && t.group.members.length >= 2 && t.state !== 'bill');
      ev.table = cands.find((t) => t.group.members.length === 2) || pick(cands);
      ev.c = V(ev.table.x, 0, ev.table.z);
      toast(`💍 Table ${ev.table.id}: someone's about to propose. Don't ruin it! No throws, smashes or footballs nearby.`, 5);
    },
    update(ev) {
      const g = ev.table.group;
      if (!g) return true;
      if (!ev.asked && ev.t > 8) { ev.asked = true; g.members[0].say('Will you marry me?', { dur: 4 }); speak('Will you marry me?', 'customer', true); }
      const b = G.ball;
      if (b && !b.held && b.vel.length() > 3 && b.pos.distanceTo(ev.c) < 2) ev.ruined = 'football';
      if (ev.ruined) {
        toast(`💔 You ruined the proposal (${ev.ruined}). The whole pub boos.`, 4); sfx.groan(); g.mood -= 40;
        emit('headline', 'TALL WAITER RUINS PUB PROPOSAL', 9);
        return true;
      }
      if (ev.t > 22) { g.members[1]?.say('YES!', { dur: 3 }); toast('💍 SHE SAID YES! The pub erupts. +£10', 4); emit('addTips', 10); emit('regularsCheer'); g.mood += 25; emit('headline', 'ROMANCE BLOOMS AT THE OYSTERFLEET', 4); return true; }
      return false;
    },
    on_knocked(ev, p) { if (p.root.distanceTo(ev.c) < 4) ev.ruined = 'flying customer'; },
    on_smash(ev, it) { if (it.pos.distanceTo(ev.c) < 4) ev.ruined = 'smashed glass'; },
  },
  managerInspection: {
    start(ev) {
      ev.npc = new Person({ kind: 'manager', name: 'Manager', tag: 'The Manager', x: FIX.staffDoor.x, z: FIX.staffDoor.z + 0.5, shirt: 0x37474f, trousers: 0x263238, glasses: true, hair: 0x3e2723, bubbleColor: '#eceff1' });
      ev.npc.immune = true; ev.objs.push({ remove: () => ev.npc.destroy() });
      ev.score = 0; ev.next = 0;
      toast('📋 The manager is doing a surprise inspection. Serve well. Do NOT throw anyone in front of him.', 5);
    },
    update(ev, dt) {
      ev.next -= dt;
      if (ev.next <= 0 && !ev.npc.path) { ev.next = rand(4, 7); ev.npc.walkTo(pick([V(0, 0, -2.2), V(-3.3, 0, 3), V(4, 0, -1), V(-6.5, 0, -0.5), V(3.5, 0, 4.8)])); if (chance(0.4)) ev.npc.say(pick(['Hmm.', 'Is that table clean?', '*writes something down*'])); }
      if (ev.t > 45) {
        if (ev.score >= 0) { toast('📋 Manager: "Keep it up, Lewis." +£5', 3); emit('addTips', 5); }
        else { toast('📋 Manager: "My office. Tomorrow." You\'ve been written up.', 3.5); G.shift.reviews.push(2); }
        return true;
      }
      return false;
    },
    on_thrown(ev) { ev.score -= 3; ev.npc.say('I SAW THAT.'); emit('addTips', -2); },
    on_smash(ev) { ev.score -= 1; },
    on_delivered(ev) { ev.score += 1; },
    on_bonk(ev) { ev.npc.say('*writes: "hits head on beam"*'); },
  },
  healthInspector: {
    can: () => !!G.ronnie,
    start(ev) {
      ev.arrive = 20;
      toast('🧑‍🔬 Health inspector arriving in 20 seconds! Hide Ronnie in the staff room!', 5);
      G.ronnie?.say("W-w-why does everyone w-want me hidden?", 3);
    },
    update(ev, dt) {
      if (ev.arrive > 0) {
        ev.arrive -= dt;
        if (ev.arrive <= 0) {
          ev.npc = new Person({ kind: 'inspector', name: 'Inspector', tag: 'Health Inspector', x: FIX.spawn.x, z: FIX.spawn.z, shirt: 0xffffff, trousers: 0x37474f, glasses: true, bubbleColor: '#ffffff' });
          ev.npc.immune = true; ev.objs.push({ remove: () => ev.npc.destroy() });
          ev.npc.walkTo(V(2, 0, -6.4));
          if (G.ronnie && G.ronnie.p.hidden) { toast('Inspection passed! No sign of Ronnie. +£5', 3.5); emit('addTips', 5); }
          else { toast('The inspector found Ronnie doing protein shakes in the kitchen. -1 star.', 4); G.shift.reviews.push(1); G.ronnie?.say('H-h-hello! W-want to see my g-gains?', 3); }
        }
      }
      return ev.t > 40;
    },
  },
  flood: {
    start(ev) {
      ev.c = V(4, 0, 6.8); ev.r = 0.3;
      ev.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshLambertMaterial({ color: 0x64b5f6, transparent: true, opacity: 0.6 }));
      ev.puddle.rotation.x = -Math.PI / 2; ev.puddle.position.set(ev.c.x, 0.015, ev.c.z); G.scene.add(ev.puddle); ev.objs.push(ev.puddle);
      toast('🚽 The toilets are flooding! Mop it up (hold) before someone slips.', 4);
      ev.inters.push(inter({ pos: V(4, 0.3, 6.8), radius: 2.8, label: () => 'Mop up the flood (hold)', hold: () => 2.5, action: () => { ev.mopped = true; sfx.splash(); } }));
      ev.slip = 0;
    },
    update(ev, dt) {
      ev.r = Math.min(1.5, ev.r + dt * 0.1); ev.puddle.scale.setScalar(ev.r);
      ev.slip -= dt;
      if (ev.slip <= 0) for (const per of G.people) {
        if (per.hidden || per.immune || per.state !== 'walk' && per.state !== 'run') continue;
        if (per.root.distanceTo(ev.c) < ev.r && chance(0.35)) { per.knock(per.fwd.clone().multiplyScalar(4).add(V(0, 3, 0)), 'slip'); per.say('WHOA!'); emit('addChaos', 5, 'slip'); ev.slip = 1; break; }
      }
      if (ev.mopped) { toast('Floor mopped. Tall lad, long mop.', 2.5); emit('addTips', 1); return true; }
      return ev.t > 70;
    },
  },
  rainStorm: {
    can: () => G.gardenOpen,
    start(ev) {
      const n = 900, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = rand(10, 34); pos[i * 3 + 1] = rand(0, 8); pos[i * 3 + 2] = rand(-8, 8); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      ev.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.05, transparent: true, opacity: 0.7 }));
      G.scene.add(ev.rain); ev.objs.push(ev.rain);
      LIGHTS.sun.intensity *= 0.4;
      toast('🌧 RAIN STORM! Everyone in the garden legs it inside.', 4);
      for (const id of [9, 10]) {
        const t = tableById(id);
        if (t.group) {
          const g = t.group;
          const free = G.tables.find((x) => x.state === 'free' && !x.garden && x.seatList.length >= g.members.length && typeof x.id === 'number');
          if (free) moveGroup(g, t, free);
          else { pick(g.members).say("We're soaked! We're off!"); g.patience = 0.01; }
        }
        if (t.state === 'free') t.state = 'closed';
      }
    },
    update(ev, dt) {
      const a = ev.rain.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 9; if (y < 0) y = 8; a.setY(i, y); }
      a.needsUpdate = true;
      return ev.t > 40;
    },
    end() { LIGHTS.sun.intensity /= 0.4; for (const id of [9, 10]) { const t = tableById(id); if (t.state === 'closed' && G.shift.cfg.tables.includes(id) && G.gardenOpen) t.state = 'free'; } toast('The rain stops. The garden steams gently.', 2.5); },
  },
  wedding: {
    start(ev) {
      spawnGroup('friends', { size: 6, special: 'wedding', colors: [0xffffff, 0xf8bbd0, 0xb39ddb, 0x90caf9] }).tipBonus = 1.6;
      toast('💒 A wedding party has spilled in from next door! Big group, big tips.', 4);
    },
    update() { return true; },
  },
  deckchair: {
    can: () => G.ian && !G.ian.boss && !G.ian.seq && G.ian.p.state === 'sit',
    start(ev) {
      const ian = G.ian, spot = V(-3.2, 0, -1.9);
      const chair = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.6), mat(0x1e88e5)); seat.position.y = 0.35; seat.rotation.x = -0.35; chair.add(seat);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.04), mat(0x8d6e63)); frame.position.set(0, 0.45, -0.3); frame.rotation.x = -0.5; chair.add(frame);
      chair.position.copy(spot); chair.rotation.y = Math.PI; G.scene.add(chair); ev.objs.push(chair);
      toast('🏖 Ian has set up a deckchair in the middle of the restaurant.', 3.5);
      ian.runActivity((function* () {
        let arrived = false; ian.p.walkTo(spot, () => { arrived = true; }); yield () => arrived;
        ian.p.sitAt({ pos: spot.clone().add(V(0, 0, 0.1)), yaw: Math.PI }); ian.p.lift = -0.1;
        ian.say('Lovely spot this, Lewy. Bit of sun through the window.', true);
        yield 25;
        ian.p.lift = 0;
        yield* ian.backToSeat(0);
      })());
    },
    update(ev) { return ev.t > 32; },
  },
  ronnieFridge: {
    can: () => G.ronnie && !G.ronnie.p.hidden && !G.ronnie.seq && !G.ronnie.blockingTaps && G.ronnie.p.state === 'stand',
    start(ev) {
      const r = G.ronnie;
      r.status = 'Locked in the walk-in fridge';
      r.run((function* () { let a = false; r.p.walkTo(FIX.kitchenDoor.clone().add(V(0, 0, 0.5)), () => { a = true; }); yield () => a; r.p.hidden = true; r.hiddenTimer = 999; yield () => false; })());
      ev.bang = 2;
      toast("🧊 Ronnie's locked himself in the walk-in fridge! Let him out at the KITCHEN door within 40s.", 4.5);
      ev.inters.push(inter({ pos: V(0.5, 1.2, -7.8), radius: 2.6, label: () => (G.ronnie?.p.hidden ? 'Let Ronnie out of the fridge' : null), action: () => { ev.freed = true; } }));
    },
    update(ev, dt) {
      if (G.ronnie?.p.hidden) { ev.bang -= dt; if (ev.bang <= 0) { ev.bang = 2; sfx.thud(); } }
      if (ev.freed || ev.t > 40) return true;
      return false;
    },
    end(ev, silent) {
      const r = G.ronnie; if (!r) return;
      if (silent) ev.freed = true;
      r.seq?.abort();
      r.hiddenTimer = 0.01; r.reappearAt = FIX.kitchenDoor;
      setTimeout(() => {
        if (ev.freed) { r.say('Th-th-thanks L-Lewis. C-c-cold. G-gains though.', 3); emit('addTips', 1); }
        else { r.say('I-I-I-I-I\'m an ice b-b-block.', 4); r.frozen = 20; r.status = 'Frozen solid (20s)'; }
      }, 100);
    },
  },
  proteinShaker: {
    start() {
      sfx.thud(); sfx.smash();
      toast("💥 Ronnie's protein shaker exploded in the kitchen! Chef is furious. Food delayed.", 4);
      G.chef?.say('WHOSE PROTEIN IS THIS?! RONNIE!');
      delayKitchen(6);
    },
    update() { return true; },
  },
  specialsFire: {
    start(ev) {
      ev.c = V(-9.75, 1.6, 5.5); ev.out = 0;
      ev.flames = [];
      for (let i = 0; i < 7; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff6f00 : 0xffca28, transparent: true, opacity: 0.85 }));
        f.position.set(-9.8, 1.4 + Math.random() * 0.5, 5.0 + i * 0.16); G.scene.add(f); ev.flames.push(f); ev.objs.push(f);
      }
      const r = G.ronnie;
      if (r && !r.p.hidden) r.say('L-L-L-Lewis, th-th-the sp-sp-specials b-b-board is on f-f-f-f-f-f-f... FIRE!', 8);
      setTimeout(() => toast('🔥 The specials board is ON FIRE! Grab the fire extinguisher (by the front door) and spray it. Or chuck a drink at it.', 5), 2500);
    },
    update(ev, dt) {
      ev.flames.forEach((f, i) => { f.scale.set(1, 0.7 + Math.random() * 0.6, 1); f.visible = ev.out < 1.2; });
      for (const it of G.items) if (it.kind === 'drink' && !it.held && it.vel.length() > 2.5 && it.pos.distanceTo(ev.c) < 0.8) { ev.out = 2; it.smash(); }
      if (ev.out >= 1.2) { toast('🧯 Fire out! Fire warden Lewis saves the specials. +£5', 3.5); emit('addTips', 5); emit('achieve', 'fireWarden'); emit('headline', 'TALL WAITER SAVES SPECIALS BOARD FROM BLAZE', 6); return true; }
      if (ev.t > 35) { toast('The specials board burned out. Everyone\'s coughing. -1 star.', 3.5); G.shift.reviews.push(2); emit('headline', 'SPECIALS BOARD BURNS WHILE STAFF STUTTER', 7); return true; }
      return false;
    },
    on_spray(ev, origin, dir) {
      const to = V().subVectors(ev.c, origin); const d = to.length();
      if (d < 4 && to.normalize().dot(dir) > 0.8) ev.out += 0.05;
    },
  },
  karaoke: {
    can: () => G.functionOpen,
    start(ev) { ev.sung = 0; toast('🎤 Karaoke in the function room! Grab the mic and sing: hold it to your mouth (VR) or hold USE.', 5); },
    update(ev) { if (ev.sung >= 4) { toast('🎤 Standing ovation for the big man! +£4', 3); emit('addTips', 4); emit('regularsCheer'); return true; } return ev.t > 70; },
    on_sing(ev) { ev.sung++; emit('addTips', 1); },
  },
  lightbulb: {
    start(ev) {
      const p = pick([V(-5, 2.72, -2.2), V(2, 2.72, -2.2), V(-2.6, 2.72, 2), V(5, 2.72, 5.4), V(-1, 2.72, -7)]);
      ev.p = p;
      ev.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffaa })); ev.bulb.position.copy(p); G.scene.add(ev.bulb); ev.objs.push(ev.bulb);
      toast('💡 A light bulb is flickering. The manager wants it changed. (You don\'t need a ladder.)', 4);
      ev.inters.push(inter({ pos: p, radius: 2.6, label: () => (G.player.isCrouched() ? 'Stand up to reach the bulb' : 'Change the bulb (no ladder needed)'), hold: () => (G.player.isCrouched() ? 0 : 1.2), action: () => { if (G.player.isCrouched()) G.toast("You'll need to stand up for this one, big man.", 2); else ev.done = true; } }));
    },
    update(ev) {
      ev.bulb.material.color.setHex(Math.random() < 0.3 ? 0x333333 : 0xffffaa);
      if (ev.done) { toast('Bulb changed without a ladder. The manager tips you £3. Short people everywhere weep.', 3.5); emit('addTips', 3); return true; }
      return ev.t > 60;
    },
  },
  balloon: {
    start(ev) {
      const kidTables = G.tables.filter((t) => t.group && t.group.members.some((m) => m.isKid));
      ev.table = pick(kidTables) || pick(G.tables.filter((t) => t.group)) || null;
      const start = ev.table ? V(ev.table.x, 1.2, ev.table.z) : V(0, 1.2, 0);
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(pick([0xe53935, 0x1e88e5, 0xfdd835]))); ball.scale.y = 1.15; g.add(ball);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.6, 3), mat(0xffffff)); str.position.y = -0.45; g.add(str);
      ev.b = new Item('balloon', { mesh: g, r: 0.15, half: 0.15, mass: 0.05, cls: 'balloon', gravity: -0.12, bounce: 0.1, pos: start, friction: 0.9 });
      ev.b.noSleep = true; ev.objs.push(ev.b);
      if (ev.table) pick(ev.table.group.members).say("MY BALLOON! It's on the ceiling!", { dur: 3 });
      toast('🎈 A kid\'s balloon is stuck on the ceiling. Only Lewis can reach it. Give it back to their table.', 4);
    },
    update(ev) {
      const b = ev.b;
      if (b.held) ev.wasHeld = true;
      b.vel.multiplyScalar(0.98);
      if (ev.wasHeld && !b.held && ev.table && Math.hypot(b.pos.x - ev.table.x, b.pos.z - ev.table.z) < 1.4) {
        toast('Balloon returned! "Thank you, giant!" +£2', 3); emit('addTips', 2); if (ev.table.group) ev.table.group.mood += 10; return true;
      }
      return ev.t > 70 || !ev.table?.group;
    },
  },
  whereIsIan: {
    can: () => G.gardenOpen && G.ian && !G.ian.boss && !G.ian.seq && G.ian.p.state === 'sit' && G.ian.level < 3,
    start(ev) {
      const ian = G.ian, spot = V(21.45, 0, rand(-6, 3.5));
      ev.found = false;
      ian.runActivity((function* () { let a = false; ian.p.walkTo(spot, () => { a = true; }); yield () => a; ian.p.faceTowards(V(16, 0, spot.z)); yield () => false; })());
      toast("🔎 Where's Ian? He's vanished in his camo. Try the beer garden hedge.", 4.5);
      ev.inters.push(inter({ pos: () => ian.p.p[HEAD], radius: 3.5, label: () => (ian.p.root.x > 20 ? 'Found you, Dad!' : null), action: () => { ev.found = true; } }));
    },
    update(ev) {
      if (!ev.hint && ev.t > 20 && G.hollie?.available()) { ev.hint = true; G.hollie.say("He's by the hedge, babe! I can see the hat."); }
      return ev.found || ev.t > 60;
    },
    end(ev, silent) {
      const ian = G.ian; if (!ian) return;
      if (silent) { ian.runActivity(ian.backToSeat(0)); return; }
      if (ev.found) { ian.add(-15); emit('addTips', 2); ian.say("You found me, Lewy. Camo's working though, innit."); toast('Found Dad. +£2', 2); }
      else { ian.add(10, 'ignored'); ian.say('Nobody came looking for me, Lewy.', true); }
      ian.runActivity(ian.backToSeat(0.5));
    },
  },
};

// Move a seated group to another table (rain storm).
function moveGroup(g, from, to) {
  to.group = g; to.state = from.state; to.order = from.order.slice(); to.needs = from.needs.concat(from.served.map((it) => it.id)); to.served = []; to.iconDirty = true;
  from.served.forEach((it) => it.remove());
  from.group = null; from.served = []; from.needs = []; from.state = 'closed'; from.icon.visible = false;
  from.seatList.forEach((s) => { s.taken = null; });
  g.table = to;
  g.members.forEach((m, i) => {
    const seat = to.seatList[i % to.seatList.length]; seat.taken = m; m.seat = seat;
    if (m.state !== 'ragdoll') m.walkTo(seat.pos, () => { m.sitAt(seat); m.eating = to.state === 'eating'; }, true);
  });
  if (to.state === 'eating') { to.state = 'waiting'; g.members.forEach((m) => { m.eating = false; }); }
}

// ---------------------------------------------------------------- ambient extras
const ambient = { storyPounds: 10, storyTimer: 60, tannoy: 30, barCooldown: 0, lastPos: null };
function updateAmbient(dt) {
  const sh = G.shift, ian = G.ian;
  // Ian's fishing story: the fish gets bigger every time
  if (ian && !ian.boss && ian.p.state === 'sit') {
    ambient.storyTimer -= dt;
    if (ambient.storyTimer <= 0) {
      ambient.storyTimer = rand(50, 80);
      ambient.storyPounds += randi(3, 9);
      const t = G.tables.filter((x) => x.group && typeof x.id === 'number').sort((a, b) => Math.hypot(a.x - ian.p.root.x, a.z - ian.p.root.z) - Math.hypot(b.x - ian.p.root.x, b.z - ian.p.root.z))[0];
      ian.say(`Did I tell you about the carp, Lewy? ${ambient.storyPounds} pounds. ${ambient.storyPounds > 30 ? 'Biggest in Essex.' : 'Easy.'}`);
      if (t && t.group) setTimeout(() => t.group && pick(t.group.members).say(`Last time it was ${ambient.storyPounds - randi(3, 8)} pounds...`), 3500);
    }
    // Tannoy: Ian calls for Lewy when you're far away and he's wound up
    ambient.tannoy -= dt;
    if (ambient.tannoy <= 0 && ian.level >= 2 && G.player.pos.distanceTo(ian.p.root) > 12) { ambient.tannoy = 35; toast('📢 (Ian has found the tannoy) "LEWY! LEWYYYYY!"', 3); speak('LEWY! LEWYYYY!', 'ian', true); }
  }
  // Hollie throws Lewis a protein bar when his stamina is low
  ambient.barCooldown -= dt;
  const h = G.hollie;
  if (h && ambient.barCooldown <= 0 && G.player.stamina < 0.08 && h.available() && h.p.root.distanceTo(G.player.pos) < 14) {
    ambient.barCooldown = 30;
    const bar = new Item('proteinbar', { mesh: new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.04), mat(0x8e24aa)), r: 0.05, half: 0.02, cls: 'bar', pos: h.p.p[RH].clone().add(V(0, 0.3, 0)) });
    const target = G.player.headPos().add(V(0, -0.3, 0));
    const d = V().subVectors(target, bar.pos), tFlight = Math.max(0.4, d.length() / 9);
    bar.vel.set(d.x / tFlight, d.y / tFlight + 0.5 * 9.81 * tFlight, d.z / tFlight);
    bar.ttl = 8;
    bar.onUpdate = () => {
      if (bar.pos.distanceTo(G.player.headPos()) < 0.9 || G.hands.some((hh) => hh.pos.distanceTo(bar.pos) < 0.25)) { G.player.stamina = 1; bar.remove(); toast('Hollie threw you a protein bar. Stamina restored!', 2.5); return true; }
      return false;
    };
    h.say('Babe! Catch! Protein!');
  }
  // Hollie's fitness watch: count Lewis's steps
  const p = G.player.pos;
  if (ambient.lastPos) { const d = Math.hypot(p.x - ambient.lastPos.x, p.z - ambient.lastPos.z); if (d < 1) sh.distance = (sh.distance || 0) + d; }
  ambient.lastPos = p.clone();
}

on('ianPint', () => {
  if (!chance(0.35) || !G.ian) return;
  G.ian.say("Here, have a fish for that, Lewy. Fresh this morning.");
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xb0bec5)); body.scale.set(0.6, 1, 2.2); g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 4), mat(0x90a4ae)); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.16; g.add(tail);
  const fish = new Item('fish', { mesh: g, r: 0.07, half: 0.04, cls: 'fish', pos: V(8.9, 0.95, 5.0) });
  fish.ttl = 90;
  G.toast('Ian paid for his pint with a fish.', 2.5);
});
