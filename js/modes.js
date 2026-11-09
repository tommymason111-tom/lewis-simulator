// Mini-game modes (Pub Cup, Penalties, Trick Shots, Hollie's 5K, Date Night),
// the car park boss finale, and seasonal decorations.
import * as THREE from 'three';
import { G, V, rand, randi, pick, chance, clamp, emit, on } from './state.js';
import { FIX, mat, setCarParkOpen, addSolid, BEAM_Y } from './world.js';
import { Item, spawnDrink, spawnPlate } from './physics.js';
import { Person, HEAD, PELVIS, NECK, RH } from './people.js';
import { makeIanPerson, startCards } from './npcs.js';
import { tableById } from './serving.js';
import { labelSprite } from './textures.js';
import { sfx, speak } from './audio.js';
import { LINES, TALK_OPTIONS } from './data.js';

const toast = (t, d = 3) => G.toast(t, d);
const inter = (o) => { G.interactables.push(o); return o; };
const PITCH = { x0: 11.0, x1: 21.1, z0: -4.8, z1: 4.8 };
const clampPitch = (p) => { p.x = clamp(p.x, PITCH.x0, PITCH.x1); p.z = clamp(p.z, PITCH.z0, PITCH.z1); return p; };
const resetBall = (x = 16, z = 0) => { const b = G.ball; if (!b) return; b.held && b.held.forceRelease && b.held.forceRelease(); b.held = null; b.pos.set(x, 0.3, z); b.vel.set(0, 0, 0); b.sleeping = false; b.lastTouch = G.time; };

// Decorations / props created for the current shift (removed on the next one).
function decor(obj) { (G.decor ||= []).push(obj); if (obj.isObject3D && !obj.parent) G.scene.add(obj); return obj; }
export function clearDecor() { (G.decor || []).forEach((o) => { if (o.remove && !o.isObject3D) o.remove(); else if (o.parent) o.parent.remove(o); }); G.decor = []; }

// ================================================================ setup
export function setupMode() {
  const cfg = G.shift.cfg;
  G.shift.mg = null;
  if (cfg.season) decorateSeason(cfg.season);
  switch (cfg.minigame) {
    case 'pubcup': G.shift.mg = pubCup(); break;
    case 'penalties': G.shift.mg = penalties(); break;
    case 'trickshots': G.shift.mg = trickShots(); break;
    case 'fivek': G.shift.mg = fiveK(); break;
    case 'datenight': G.shift.mg = dateNight(); break;
    case 'showdown': G.shift.mg = { update() {}, hudLines: () => [], summary: () => [] }; setTimeout(() => startBoss(true), 1500); break;
  }
}
export function updateMode(dt) {
  G.shift.mg?.update?.(dt);
  if (boss) updateBoss(dt);
  // Ball through the kitchen hatch: chef sends it straight back
  const b = G.ball;
  if (b && !b.held && b.pos.z < -8.25 && b.pos.x > 2.4 && b.pos.x < 8.2 && b.pos.y < 2.5) {
    emit('hatchVolley');
    b.pos.set(5.3, 1.4, -7.0); b.vel.set(rand(-1, 1), 1.5, 4);
    G.chef?.say('KEEP YOUR BALLS OUT OF MY KITCHEN!', { dur: 2.5 });
  }
}
export const modeHudLines = () => [...(G.shift.mg?.hudLines?.() || []), ...(boss ? bossLines() : [])];
export const modeSummary = () => [...(G.shift.mg?.summary?.() || []), ...(bossResult ? [bossResult] : [])];

// ================================================================ Pub Cup (3v3)
function teamPerson(name, x, z, shirt, opts = {}) {
  const p = new Person(Object.assign({ kind: 'footballer', name, tag: name, label: name, x, z, shirt, trousers: 0x111111, shortSleeves: true, walkSpeed: 0.85 }, opts));
  p.onGetUp = () => {};
  return p;
}
function pubCup() {
  const A = 0x1d6b3a, B = 0xff7a1a;
  const mk = (p, team, speed, skill, role, home) => ({ p, team, speed, skill, role, home, cd: 0, think: 0 });
  const players = [
    mk(teamPerson('Ronnie', 14, -2, A, { wide: 1.45, heavy: 2.4, hair: 0x2b1b0e }), 'A', 0.95, 0.5, 'att', V(17, 0, -2)),
    mk(teamPerson('Hollie', 13, 2, A, { hair: 0xd2561e, skin: 0xf6d9c6, ponytail: true, headband: 0x29b6f6, scale: 0.92 }), 'A', 1.3, 0.85, 'def', V(13, 0, 1.5)),
    mk(teamPerson('Big Dave', 19, 0, B, { wide: 1.3, heavy: 1.8 }), 'B', 0.75, 0.7, 'def', V(19.5, 0, 0)),
    mk(teamPerson('Sandra', 18, -2, B, { hair: 0xd9c48c }), 'B', 1.0, 0.75, 'att', V(15, 0, -2)),
    mk(teamPerson('Old Pete', 18, 2.5, B, { hair: 0xdddddd, scale: 0.92 }), 'B', 0.6, 0.6, 'att', V(15, 0, 2.5)),
  ];
  players.forEach((pl) => pl.p.root.copy(pl.home));
  const ian = makeIanPerson(14, 6.2); ian.faceTowards(V(16, 0, 0)); ian.immune = true;
  G.player.pos.set(14.5, 0, 0); G.player.yaw = -Math.PI / 2;
  if (!G.xr) { G.rig.position.set(14.5, 0, 0); }
  resetBall();
  const score = { A: 0, B: 0 };
  let shout = 4, kickoffWait = 2;
  const kickoff = () => { resetBall(); players.forEach((pl) => { if (pl.p.state !== 'ragdoll') { pl.p.root.copy(pl.home); pl.p.path = null; } }); kickoffWait = 1.5; };
  on('goal', (idx) => {
    if (G.shift.mg?.score !== score) return;
    if (idx === 0) { score.A++; toast(`GOAL! Oysterfleet ${score.A} - ${score.B} Regulars`, 2.5); ian.say(pick(['GET IN, LEWY!', 'THAT\'S MY BOY!', 'WHAT A GOAL!']), { dur: 2.5 }); }
    else { score.B++; toast(`Regulars score. ${score.A} - ${score.B}`, 2.5); ian.say(pick(['REF! OFFSIDE!', 'Disgraceful, Lewy!', 'WAKE UP RONNIE!']), { dur: 2.5 }); }
    setTimeout(kickoff, 1200);
  });
  return {
    kind: 'pubcup', score,
    update(dt) {
      const b = G.ball; if (!b) return;
      if (kickoffWait > 0) { kickoffWait -= dt; return; }
      shout -= dt;
      if (shout <= 0) { shout = rand(5, 9); ian.say(pick(['LEWY! SHOOT!', 'Man on, Lewy!', 'Get stuck in, Ronnie!', 'Go on Hollie!', 'Use your height, Lewy!']), { dur: 2 }); }
      if (b.vel.length() < 0.2 && G.time - (b.lastTouch || 0) > 9) { resetBall(); toast('Ball reset to the centre.', 1.5); }
      // Who on each team is closest to the ball?
      const dist = (p) => Math.hypot(p.x - b.pos.x, p.z - b.pos.z);
      const chaser = {};
      for (const team of ['A', 'B']) {
        let best = null, bd = 1e9;
        for (const pl of players) if (pl.team === team && pl.p.state !== 'ragdoll' && pl.p.state !== 'getup') { const d = dist(pl.p.root); if (d < bd) { bd = d; best = pl; } }
        if (team === 'A' && dist(G.player.pos) < bd) best = 'lewis';
        chaser[team] = best;
      }
      for (const pl of players) {
        const p = pl.p;
        if (p.state === 'ragdoll' || p.state === 'getup') continue;
        pl.cd -= dt; pl.think -= dt;
        const attackX = pl.team === 'A' ? FIX.goals[0].x : FIX.goals[1].x;
        const ownX = pl.team === 'A' ? FIX.goals[1].x : FIX.goals[0].x;
        const toGoal = V(attackX - b.pos.x, 0, -b.pos.z).normalize();
        if (chaser[pl.team] === pl) {
          const behind = b.pos.clone().addScaledVector(toGoal, -0.3).setY(0);
          if (pl.think <= 0) { pl.think = 0.15; p.path = [clampPitch(behind)]; p.state = 'run'; p.walkSpeed = pl.speed; }
          if (dist(p.root) < 0.6 && b.pos.y < 0.7 && pl.cd <= 0 && !b.held) {
            pl.cd = 0.7;
            const aim = V(attackX, 0, rand(-0.9, 0.9));
            let dir = V().subVectors(aim, b.pos).setY(0);
            const d = dir.length(); dir.normalize();
            if (pl.p.name === 'Ronnie' && chance(0.35)) { dir = V(rand(-1, 1), 0, rand(-1, 1)).normalize(); p.say(pick(['T-t-top bins!', 'W-w-worldie!']), { dur: 1.5 }); }
            const err = (1 - pl.skill) * 0.6;
            dir.applyAxisAngle(V(0, 1, 0), rand(-err, err));
            const power = Math.min(12, 4 + d * 0.75) * (0.8 + pl.skill * 0.3);
            b.vel.copy(dir).multiplyScalar(power); b.vel.y = 1 + d * 0.1; b.sleeping = false; b.lastTouch = G.time;
            sfx.kick();
          }
        } else if (pl.think <= 0) {
          pl.think = 0.4;
          let t;
          if (pl.role === 'def') t = V(ownX + (b.pos.x - ownX) * 0.35, 0, b.pos.z * 0.6);
          else t = V(b.pos.x + Math.sign(attackX - ownX) * 2.5, 0, pl.home.z * 0.8 + b.pos.z * 0.3);
          p.path = [clampPitch(t)]; p.state = p.root.distanceTo(t) > 1.5 ? 'run' : 'walk'; p.walkSpeed = pl.speed;
        }
      }
    },
    hudLines: () => [`⚽ PUB CUP  Oysterfleet ${score.A} - ${score.B} Regulars`],
    summary() {
      const won = score.A > score.B;
      if (won) { emit('achieve', 'pubCup'); emit('addTips', 15); }
      return [`Final score: Oysterfleet ${score.A} - ${score.B} Regulars`, won ? '🏆 PUB CUP WINNERS! The team photo goes up on the wall.' : score.A === score.B ? 'A draw. Ian is demanding a replay.' : 'The regulars win. Old Pete will never let you forget it.'];
    },
  };
}
on('ballTouch', () => { if (G.ball) G.ball.lastTouch = G.time; });

// ================================================================ Penalties vs Ian
function penalties() {
  const goal = FIX.goals[0];
  const keeper = makeIanPerson(goal.x - 0.35, 0, { tag: 'Ian (in goal)' });
  keeper.faceTowards(V(10, 0, 0));
  keeper.onGetUp = () => {};
  const home = V(goal.x - 0.35, 0, 0);
  const st = { shots: 0, goals: 0, state: 'ready', t: 0, dived: false, result: '' };
  const placeKeeper = () => {
    keeper.state = 'stand'; keeper.pose = 'stand'; keeper.heldBy = []; keeper.root.copy(home); keeper.faceTowards(V(10, 0, 0));
    keeper.computePose(); for (let i = 0; i < 7; i++) { keeper.p[i].copy(keeper.anim[i]); keeper.o[i].copy(keeper.anim[i]); }
  };
  const ready = () => {
    st.state = 'ready'; st.t = 0; st.dived = false; resetBall(FIX.penaltySpot.x, 0); placeKeeper();
    if (st.shots < 5) { keeper.say(pick(['Come on then, Lewy!', 'You\'ll never get it past me, Lewy!', 'I can\'t even see you, Lewy. Can you see ME?']), { dur: 2.5 }); toast(`Penalty ${st.shots + 1} of 5. Kick the ball at the bin goal.`, 2.5); }
  };
  G.player.pos.set(16.4, 0, 0); G.player.yaw = -Math.PI / 2;
  setTimeout(ready, 800);
  const resolve = (txt, scored) => {
    if (st.state !== 'shot') return;
    st.state = 'done'; st.shots++; if (scored) st.goals++;
    toast(`${txt}  (${st.goals}/${st.shots})`, 2.5);
    keeper.say(scored ? pick(['...Lucky, Lewy.', 'I was unsighted!', 'The camo was too good, I couldn\'t see the ball!']) : pick(['LEWY! NOT TODAY!', 'Back of the net... NOT!', 'Get in! Your old man\'s still got it!']), { dur: 2.5 });
    if (scored) sfx.cheer(); else sfx.groan();
    setTimeout(() => { if (st.shots >= 5) emit('endShiftNow', 'time'); else ready(); }, 2200);
  };
  on('goal', (idx) => { if (G.shift.mg?.st === st && idx === 0) resolve('GOAL!', true); });
  return {
    kind: 'penalties', st,
    update(dt) {
      const b = G.ball; if (!b) return;
      if (st.state === 'ready' && b.vel.length() > 3 && b.vel.x > 0) { st.state = 'shot'; st.t = 0; }
      if (st.state !== 'shot') return;
      st.t += dt;
      if (!st.dived && st.t > 0.18 && b.vel.x > 0.5) {
        st.dived = true;
        const tLine = (goal.x - b.pos.x) / b.vel.x;
        const zPred = b.pos.z + b.vel.z * tLine;
        const guessRight = chance(0.5);
        const side = Math.abs(zPred) < 0.35 ? 0 : Math.sign(guessRight ? zPred : -zPred);
        if (side !== 0) keeper.knock(V(0, 2.2, side * 6), 'dive');
      }
      if (b.pos.x > goal.x + 0.7 || (Math.abs(b.pos.z) > goal.w / 2 && b.pos.x > goal.x - 0.3)) resolve('Missed!', false);
      else if (st.t > 1.2 && b.vel.x <= 0.3) resolve('SAVED by Ian!', false);
      else if (st.t > 4) resolve('Saved!', false);
    },
    hudLines: () => [`🥅 PENALTIES vs IAN  ${st.goals} / ${st.shots}  (5 shots)`],
    summary() { if (st.goals >= 4) emit('achieve', 'penalties'); emit('addTips', st.goals * 2); return [`You scored ${st.goals} of 5 past Ian.`, st.goals >= 4 ? 'Ian: "The camo let me down, Lewy."' : 'Ian: "Still got it, Lewy. STILL GOT IT."']; },
  };
}

// ================================================================ Trick shots
function trickShots() {
  // Ice bucket on the bar + a bin by the toilets
  const bucketPos = V(-8.45, 1.16, -5.3);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.22, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xb0bec5, side: THREE.DoubleSide }));
  bucket.position.copy(bucketPos).add(V(0, 0.11, 0)); decor(bucket);
  const bl = labelSprite('ICE BUCKET', { bg: '#455a64', size: 26, scale: 0.1 }); bl.position.copy(bucketPos).add(V(0, 0.45, 0)); decor(bl);
  const binPos = V(3.0, 0, 7.35);
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.6, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x546e7a, side: THREE.DoubleSide }));
  bin.position.copy(binPos).add(V(0, 0.3, 0)); decor(bin);
  const binl = labelSprite('BIN', { bg: '#546e7a', size: 26, scale: 0.1 }); binl.position.copy(binPos).add(V(0, 0.85, 0)); decor(binl);
  const list = [
    { name: 'Crossbar: hit a MIND YOUR HEAD beam from more than 7 m away' },
    { name: 'Volley the ball through the kitchen serving hatch' },
    { name: 'Chip the ball into the ice bucket on the bar' },
    { name: 'Bounce it off 3 walls and into the bin by the toilets' },
    { name: 'Do 10 keepie-uppies' },
  ];
  const st = { idx: 0, walls: 0, cool: 0 };
  resetBall(-2, 0); G.player.pos.set(-2, 0, 1.5); G.player.yaw = 0;
  const done = () => {
    toast(`✅ ${list[st.idx].name}!`, 2.5); sfx.cheer(); emit('addChaos', 20, 'trick'); emit('addTips', 3);
    st.idx++; st.walls = 0; st.cool = 1;
    if (st.idx >= list.length) { emit('achieve', 'trickshots'); setTimeout(() => emit('endShiftNow', 'time'), 2500); }
    else toast(`Next: ${list[st.idx].name}`, 3.5);
  };
  on('itemImpact', (it, imp, tag) => {
    if (G.shift.mg?.st !== st || it !== G.ball) return;
    if (st.idx === 0 && tag === 'beam' && it.pos.distanceTo(G.player.pos) > 7) done();
    if (st.idx === 3 && tag === 'wall' && imp > 1) { st.walls++; if (st.walls <= 3) toast(`${st.walls} wall${st.walls > 1 ? 's' : ''}...`, 0.8); }
  });
  on('ballTouch', () => { if (G.shift.mg?.st === st) st.walls = 0; });
  on('hatchVolley', () => { if (G.shift.mg?.st === st && st.idx === 1) done(); });
  on('keepie', (n) => { if (G.shift.mg?.st === st && st.idx === 4 && n >= 10) done(); });
  toast(`First: ${list[0].name}`, 4);
  return {
    kind: 'trickshots', st,
    update(dt) {
      const b = G.ball; if (!b || b.held) return;
      st.cool -= dt;
      if (st.cool > 0) return;
      if (st.idx === 2 && Math.hypot(b.pos.x - bucketPos.x, b.pos.z - bucketPos.z) < 0.14 && b.pos.y > 1.1 && b.pos.y < 1.5 && b.vel.y <= 0) done();
      if (st.idx === 3 && Math.hypot(b.pos.x - binPos.x, b.pos.z - binPos.z) < 0.26 && b.pos.y < 0.65) {
        if (st.walls >= 3) done(); else { toast(`In the bin, but only ${st.walls} wall${st.walls === 1 ? '' : 's'}. Need 3!`, 2); st.cool = 1.5; b.vel.set(0, 3, -2); }
      }
    },
    hudLines: () => [`🎯 TRICK SHOT ${Math.min(st.idx + 1, list.length)}/${list.length}`, st.idx < list.length ? list[st.idx].name : 'All done!'],
    summary: () => [`Trick shots completed: ${st.idx} / ${list.length}`],
  };
}

// ================================================================ Hollie's 5K
function fiveK() {
  const h = new Person({ kind: 'hollie', name: 'Hollie', tag: 'Hollie', label: 'Hollie', x: FIX.lapPath[0].x, z: FIX.lapPath[0].z, shirt: 0xff4f8b, trousers: 0x1a1a1a, hair: 0xd2561e, skin: 0xf6d9c6, ponytail: true, headband: 0x29b6f6, shortSleeves: true, scale: 0.92, walkSpeed: 0.75, bubbleColor: '#ffe0ec', shoes: 0x29b6f6 });
  h.onBeforeKnock = (imp, src) => { if (chance(0.8)) { h.say(pick(LINES.hollie.dodge)); return false; } return true; };
  h.onGetUp = () => { h.say('BABE! I\'m mid-run!'); st.leg = 0; };
  const ian = makeIanPerson(12.4, 3.6); ian.immune = true; ian.faceTowards(V(16, 0, 0));
  // Water station
  addSolidOnce('waterstation', () => addSolid(11.2, 0, -3.3, 12.0, 0.8, -2.5, 'table'));
  const tbl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat(0x90caf9)); tbl.position.set(11.6, 0.4, -2.9); decor(tbl);
  const l = labelSprite('WATER STATION', { bg: '#1e88e5', size: 26, scale: 0.14 }); l.position.set(11.6, 1.3, -2.9); decor(l);
  inter({ pos: V(11.6, 0.9, -2.9), radius: 2.2, label: () => 'Grab a water bottle', action: () => { const w = spawnDrink('water', V(11.6, 1.0, -2.9)); G.player.give(w); } });
  G.player.pos.set(12.6, 0, -2.4); G.player.yaw = -Math.PI / 2;
  const st = { handed: 0, laps: 0, leg: 0, cheer: 3 };
  const goNext = () => { const tgt = FIX.lapPath[st.leg % 4]; h.walkTo(tgt, () => { st.leg++; if (st.leg % 4 === 0) { st.laps++; h.say(`Lap ${st.laps}!`, { dur: 1.5 }); } goNext(); }, true); };
  setTimeout(goNext, 500);
  toast('Hollie is running her 5K. Hold out a water bottle as she runs past!', 4);
  return {
    kind: 'fivek', st,
    update(dt) {
      if (!h.path && h.state !== 'ragdoll' && h.state !== 'getup') goNext();
      st.cheer -= dt;
      if (st.cheer <= 0) { st.cheer = rand(6, 10); ian.say(pick(['GO ON HOLLIE!', 'Faster than Ronnie, that girl!', 'Lewy, WATER! Quick!']), { dur: 2 }); }
      for (const hand of G.hands) {
        const it = hand.held?.item;
        if (it && it.drink === 'water' && hand.pos.distanceTo(h.p[NECK]) < 1.2 && h.state === 'run') {
          hand.forceRelease(); it.remove(); st.handed++;
          h.say(pick(LINES.hollie.water), { dur: 1.5 }); sfx.good();
          if (st.handed === 10) { emit('achieve', 'hollie5k'); toast('10 bottles! Water Station Hero!', 3); }
        }
      }
    },
    hudLines: () => [`🏃 HOLLIE'S 5K  Water handed: ${st.handed}  Laps: ${st.laps}`],
    summary() { emit('addTips', st.handed); return [`Water bottles handed to Hollie: ${st.handed}`, `Laps run: ${st.laps}`, st.handed >= 10 ? 'Hollie: "Best water station ever, babe!"' : 'Hollie: "I\'m SO thirsty, babe."']; },
  };
}
const solidsMade = {};
function addSolidOnce(key, fn) { if (!solidsMade[key]) solidsMade[key] = fn(); solidsMade[key].enabled = true; }

// ================================================================ Date night
function dateNight() {
  G.shift.hollieAt = 0;
  const t = tableById('hollie');
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6), mat(0xfff8e1)); c.position.set(t.x - 0.15 + i * 0.15, t.top + 0.08, t.z); decor(c);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 5), new THREE.MeshBasicMaterial({ color: 0xffb300 })); f.position.set(t.x - 0.15 + i * 0.15, t.top + 0.18, t.z); decor(f);
  }
  const rose = labelSprite('🌹', { size: 40, scale: 0.12, w: 64, h: 64, stroke: 0 }); rose.position.set(t.x, t.top + 0.2, t.z + 0.2); decor(rose);
  const st = { meter: 0.3, nag: 0 };
  toast('Date night! Serve the pub, but spend time crouched at Hollie\'s candlelit table too.', 5);
  return {
    kind: 'datenight', st,
    update(dt) {
      if (!G.hollie) return;
      const near = Math.hypot(G.player.pos.x - t.x, G.player.pos.z - t.z) < 1.7 && G.player.isCrouched() && G.hollie.p.state === 'sit';
      st.meter = clamp(st.meter + (near ? dt * 0.035 : -dt * 0.006), 0, 1);
      st.nag -= dt;
      if (st.nag <= 0 && G.hollie.p.state === 'sit') {
        st.nag = rand(14, 22);
        G.hollie.say(near ? pick(['This is nice, babe.', 'Ignore table 3, they can wait.', 'You look tall tonight.']) : pick(['Babe? Are you coming back?', 'I\'ll just sit here then...', 'Is that Ronnie flirting with table 2?']));
      }
    },
    hudLines: () => [`🕯 Date with Hollie: ${Math.round(st.meter * 100)}%  (crouch at her table)`],
    summary() { const ok = st.meter >= 0.5; if (ok) emit('achieve', 'dateNight'); return [`Date meter: ${Math.round(st.meter * 100)}%`, ok ? 'Hollie: "Best date night ever. Even with the beams."' : 'Hollie: "We\'ll try again next week, babe."']; },
  };
}

// ================================================================ Car park boss (Sunday finale + Showdown)
let boss = null, bossResult = null;
export function resetBoss() { boss = null; bossResult = null; }
function bossLines() { return boss ? [`🚐 BOSS IAN: rage ${Math.round(boss.rage)}%`, boss.won ? 'Peace in the car park.' : 'Pints, the bait bucket, a crouched chat, or bin the fishing club'] : []; }

export function startBoss(standalone) {
  const ian = G.ian;
  if (!ian || boss) return;
  setCarParkOpen(true);
  boss = { standalone, rage: 100, castT: 4, club: [], won: false, pull: 0, pullDir: V(), shoveCd: 0 };
  ian.boss = true; ian.seq?.abort();
  ian.p.state = 'stand'; ian.p.lift = 0;
  const arena = V(28.5, 0, 0.8);
  ian.runActivity((function* () {
    let a = false; ian.p.walkTo(arena, () => { a = true; }, true); yield () => a;
    ian.p.setPose('speech');
    yield () => false;
  })());
  ian.say("RIGHT. THE CLUB'S HERE. CAR PARK, LEWY. NOW!", true);
  toast("🚐 FINALE: Ian's stormed out to the car park with the whole fishing club! Go through the gate by the duck pond and calm him down.", 6);
  for (let i = 0; i < 4; i++) {
    const m = new Person({ kind: 'club', name: 'Fishing club', tag: 'Fishing club', x: 29 + rand(-2, 3), z: rand(-6, 6), camo: true, hat: 'camo', hair: 0x8e8e8e, scale: rand(0.95, 1.05), wide: rand(1.0, 1.3), walkSpeed: 0.9 });
    m.isClub = true; m.onGetUp = () => {};
    boss.club.push(m);
  }
  // Bait bucket from the cooler
  boss.coolerInter = inter({ pos: V(26, 0.6, -4.65), radius: 2.2, label: () => (boss && !boss.won ? 'Grab the bait bucket' : null), action: () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 10), mat(0x1e88e5)); g.add(b);
    const it = new Item('bait', { mesh: g, r: 0.12, half: 0.1, cls: 'bait', pos: V(26, 0.8, -4.6) });
    G.player.give(it); toast('Bait bucket. Ian\'s maggots. Lovely.', 2);
  } });
  emit('headline', 'DAD AND FISHING CLUB TAKE OVER PUB CAR PARK', 8);
}

function calm(n, msg) {
  if (!boss || boss.won) return;
  boss.rage = Math.max(0, boss.rage - n);
  if (msg) G.ian.say(msg, true);
  sfx.good();
  if (boss.rage <= 0) winBoss();
}
function winBoss() {
  boss.won = true;
  const ian = G.ian;
  ian.say("...Come here, Lewy. *massive camo hug* You're a good lad. Round on me.", true);
  toast('🤗 Ian is calm! Massive camo hug. The fishing club applauds. +£30', 5);
  emit('addTips', 30); emit('achieve', 'bossDad'); emit('headline', 'DAD HUGS TALL SON IN PUB CAR PARK, FISHING CLUB WEEPS', 15);
  bossResult = '🚐 Car park finale: Ian calmed down. Massive camo hug.';
  boss.club.forEach((m) => { if (!m.dead && m.state !== 'ragdoll') m.say(pick(['Lovely.', 'Ahh, bless.', 'Group hug!'])); });
  ian.p.setPose('stand');
  if (boss.standalone) setTimeout(() => emit('endShiftNow', 'time'), 5000);
}
export function bossFailed() { if (boss && !boss.won) bossResult = '🚐 Car park finale: Ian is still going. The club are singing sea shanties.'; }

function updateBoss(dt) {
  const ian = G.ian; if (!ian || ian.p.dead) return;
  const b = boss, p = G.player, inCarPark = p.pos.x > 22.4;
  if (b.pull > 0) { b.pull -= dt; const step = b.pullDir.clone().multiplyScalar(3.2 * dt); if (G.xr) G.rig.position.add(step); else p.pos.add(step); }
  if (b.won) return;
  // Ian casts at you
  b.castT -= dt;
  if (b.castT <= 0 && ian.p.state !== 'ragdoll') {
    b.castT = rand(4, 6);
    if (!inCarPark) { ian.say(pick(['LEWY! GET OUT HERE!', 'I can see you, Lewy!']), true); }
    else {
      ian.say(pick(['Watch this cast, Lewy!', 'Reeling you in, Lewy!', 'BIGGEST CATCH OF MY LIFE!']), true); sfx.whoosh();
      const hook = new Item('hook', { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0xb0bec5)), r: 0.05, half: 0.05, cls: 'shard', gravity: 0, pos: ian.p.p[RH].clone().add(V(0, 0.4, 0)) });
      const target = p.headPos(); hook.vel.subVectors(target, hook.pos).setLength(8); hook.ttl = 2.5;
      hook.onUpdate = () => {
        if (hook.pos.distanceTo(p.headPos()) < 0.5) {
          b.pull = 0.55; b.pullDir.subVectors(ian.p.root, p.pos).setY(0).normalize(); p.blur = 0.7; sfx.thud();
          ian.say('GOT ONE! A BIG ONE, LEWY!', true); hook.remove(); return true;
        }
        return false;
      };
    }
  }
  // Fishing club rush you in the car park
  b.shoveCd -= dt;
  for (const m of b.club) {
    if (m.dead || m.state === 'ragdoll' || m.state === 'getup') continue;
    m.think = (m.think || 0) - dt;
    if (m.think <= 0) {
      m.think = 0.4;
      if (inCarPark) { m.path = [p.pos.clone()]; m.state = m.root.distanceTo(p.pos) > 2 ? 'run' : 'walk'; }
      else if (!m.path) m.walkTo(V(29 + rand(-2, 3), 0, rand(-6, 6)));
    }
    if (inCarPark && b.shoveCd <= 0 && m.root.distanceTo(p.pos) < 0.9) {
      b.shoveCd = 1.8;
      const push = V().subVectors(p.pos, m.root).setY(0).normalize().multiplyScalar(1.1);
      if (G.xr) G.rig.position.add(push); else p.pos.add(push);
      p.blur = 0.4; sfx.thud(); m.say(pick(['Oi! Leave Ian alone!', 'CLUB! CLUB! CLUB!', 'Back off, lanky!']), { dur: 1.5 });
    }
  }
  // Pints and bait delivered to Ian
  for (const it of G.items) {
    if (it.held || it.dead || it.frozen) continue;
    if (it.pos.distanceTo(ian.p.p[PELVIS]) > 1.1 || it.age < 0.3) continue;
    if (it.drink === 'pint') { it.remove(); calm(20, it.fill < 0.5 ? 'Half a pint? ...Go on then, Lewy.' : 'That\'s more like it, Lewy.'); }
    else if (it.cls === 'bait') { it.remove(); calm(30, "MY MAGGOTS! Lewy, you're a good lad."); }
  }
}

on('zone', (p, z) => {
  if (!boss || !p.isClub || z.name !== 'skip') return;
  emit('achieve', 'skip');
  toast('Club member BINNED. Ian is... impressed?', 2);
  calm(12, 'Ha! In the skip! That\'s Big Gary, that is.');
  setTimeout(() => p.destroy(), 2500);
});
// Ian's normal "Dad, sit down" chat also works on the boss
export function bossTalk() {
  const set = pick(TALK_OPTIONS);
  const opts = [{ text: set.right, ok: true }, ...set.wrong.map((w) => ({ text: w, ok: false }))].sort(() => Math.random() - 0.5);
  startCards(opts, (ok) => { if (ok) calm(22, '...Alright, Lewy. Alright.'); else { boss.rage = Math.min(100, boss.rage + 10); G.ian.say("DON'T YOU START, LEWY!", true); } });
}
export const bossActive = () => !!boss && !boss.won;
on('bossTalk', () => { if (bossActive()) bossTalk(); });

// ================================================================ Seasons
function decorateSeason(season) {
  if (season === 'christmas') {
    const cols = [0xe53935, 0x43a047, 0xfdd835, 0x1e88e5];
    for (const z of [-5.6, -0.9, 3.8]) for (let i = 0; i < 20; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.04), mat(cols[i % 4]));
      t.position.set(-9.5 + i, BEAM_Y - 0.05 - (i % 2) * 0.06, z + 0.15); t.rotation.z = (i % 2 ? 0.12 : -0.12); decor(t);
    }
    const tree = new THREE.Group();
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.75 - i * 0.18, 0.8, 8), mat(0x2e7d32)); c.position.y = 0.6 + i * 0.5; tree.add(c); }
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffd600 })); star.position.y = 1.95; tree.add(star);
    for (let i = 0; i < 16; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: cols[i % 4] })); const a = i * 1.7, h = 0.4 + (i / 16) * 1.3; b.position.set(Math.cos(a) * (0.7 - h * 0.3), h, Math.sin(a) * (0.7 - h * 0.3)); tree.add(b); }
    tree.position.set(9.1, 0, 3.6); decor(tree);
    const snow = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), mat(0xf5f5f5)); snow.rotation.x = -Math.PI / 2; snow.position.set(4, 0.006, 11); decor(snow);
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(-12, 22); pos[i * 3 + 1] = rand(0, 7); pos[i * 3 + 2] = rand(8.3, 14); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })); decor(flakes);
    G.seasonUpdate = (dt) => { const a = geo.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 0.8; if (y < 0) y = 7; a.setY(i, y); } a.needsUpdate = true; };
    G.scene.background = new THREE.Color(0xcfd8dc); G.scene.fog.color.set(0xcfd8dc);
  } else if (season === 'halloween') {
    const spots = [[-5, 0.78, -3.4], [1.8, 0.78, 1.6], [-8.4, 1.16, -1.8], [5.8, 0.78, 1.6], [-7, 1.12, 6.25], [-1.6, 0.78, -3.4], [1.8, 0.78, -3.4]];
    for (const [x, y, z] of spots) {
      const pk = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0xff8f00)); body.scale.y = 0.8; pk.add(body);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.05, 3), new THREE.MeshBasicMaterial({ color: 0xffeb3b })); face.position.set(0, 0.01, 0.12); pk.add(face);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 5), mat(0x33691e)); stalk.position.y = 0.11; pk.add(stalk);
      pk.position.set(x, y + 0.1, z); decor(pk);
    }
    for (const [x, z, r] of [[-9.8, -7.8, 0], [9.8, -7.8, Math.PI / 2], [-9.8, 7.8, -Math.PI / 2], [9.8, 7.8, Math.PI]]) {
      const web = new THREE.Mesh(new THREE.CircleGeometry(0.6, 6, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.35, side: THREE.DoubleSide, wireframe: true }));
      web.position.set(x, 2.6, z); web.rotation.set(Math.PI / 2, 0, r); decor(web);
    }
    G.scene.background = new THREE.Color(0x1a0b2e); G.scene.fog.color.set(0x1a0b2e);
  } else if (season === 'bbq') {
    const smokeGeo = new THREE.SphereGeometry(0.1, 5, 4), smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.4 });
    const puffs = [];
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(smokeGeo, smokeMat); s.position.set(15.8, 1 + i * 0.3, 7.55); decor(s); puffs.push(s); }
    G.seasonUpdate = (dt) => puffs.forEach((s, i) => { s.position.y += dt * 0.4; s.position.x = 15.8 + Math.sin(G.time + i) * 0.1; if (s.position.y > 3) s.position.y = 1; });
    const l = labelSprite('BBQ: grill burgers here', { bg: '#bf360c', size: 26, scale: 0.15, w: 512 }); l.position.set(15.8, 1.6, 7.55); decor(l);
    inter({ pos: V(15.8, 1.0, 7.55), radius: 2.2, label: () => 'Grill a burger (hold)', hold: () => 1.4, action: () => { const pl = spawnPlate('burger', 'BBQ', V(15.8, 1.1, 7.2)); G.player.give(pl); sfx.pour(); } });
  }
}
