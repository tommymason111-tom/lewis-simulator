// Ronnie (the "helper"), Ian (Keep Ian Calm), Hollie, the regulars and the chef.
import * as THREE from 'three';
import { G, V, rand, randi, pick, chance, clamp, emit, on, shuffle } from './state.js';
import { Person, HEAD, PELVIS, NECK, LH, RH } from './people.js';
import { FIX, inGarden, mat } from './world.js';
import { Item, spawnDrink } from './physics.js';
import { LINES, TALK_OPTIONS, QUIZ, DISHES, IAN_LOOK, DRINKS, isDrink } from './data.js';
import { CAST, oldManLook } from './models.js';
import { groups, passPlates, runnerCaught, tableById } from './serving.js';
import { stutterize } from './textures.js';
import { sfx, speak } from './audio.js';
import * as serving from './serving.js';

// ---------------------------------------------------------------- tiny coroutine runner
class Seq {
  constructor(owner, gen, onEnd) { this.owner = owner; this.gen = gen; this.wait = 0; this.until = null; this.done = false; this.onEnd = onEnd; }
  abort() { if (this.done) return; this.done = true; this.onEnd && this.onEnd(true); }
  update(dt) {
    if (this.done) return;
    if (this.owner && (this.owner.state === 'ragdoll' || this.owner.dead)) { this.abort(); return; }
    if (this.wait > 0) { this.wait -= dt; return; }
    if (this.until && !this.until()) return;
    this.until = null;
    const r = this.gen.next();
    if (r.done) { this.done = true; this.onEnd && this.onEnd(false); return; }
    if (typeof r.value === 'number') this.wait = r.value;
    else if (typeof r.value === 'function') this.until = r.value;
  }
}
function* walk(p, target, run = false) {
  let arrived = false;
  p.walkTo(target, () => { arrived = true; }, run);
  yield () => arrived;
}

function propCan() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.16, 8), mat(0x111111));
  c.position.set(0, 0.04, 0.03); g.add(c);
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.03), new THREE.MeshBasicMaterial({ color: 0x7cfc00 }));
  l.position.set(0.035, 0.04, 0.03); g.add(l);
  return g;
}
function propRod() {
  const g = new THREE.Group();
  const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 2.2, 5), mat(0x222222));
  r.position.set(0, 0.9, 0.2); r.rotation.x = 0.35; g.add(r);
  return g;
}

// ---------------------------------------------------------------- Ronnie
class Ronnie {
  constructor() {
    this.p = new Person({ kind: 'ronnie', name: 'Ronnie', tag: 'Ronnie', label: 'Ronnie', x: 4.5, z: -6, look: CAST.ronnie(), heavy: 2.2, prop: propCan(), walkSpeed: 1.05, bubbleColor: '#e8f5e9' });
    this.p.immune = false;
    this.p.onGetUp = () => this.flex();
    this.p.onBeforeKnock = (imp, src) => {
      if (src === 'ball') { this.kickBack(); return imp.length() > 12; }
      return true;
    };
    this.status = 'Helping';
    this.seq = null; this.carry = [];
    this.nextEvent = rand(...G.shift.cfg.ronnieEvery) * (G.shift.rules.ronnieManager ? 0.5 : 1);
    this.jobs = 0; this.boost = 0;
    this.blockingTaps = false;
    this.keg = null;
    this.hiddenTimer = 0;
    this.interact = {
      pos: () => this.p.p[HEAD], radius: 2.3,
      label: () => {
        if (this.p.hidden) return null;
        if (this.blockingTaps) return 'Help Ronnie out from under the keg';
        if (this.wrestle) return `ARM WRESTLE! Mash ${G.xr ? 'A / wiggle your controllers' : !G.finePointer ? 'TALK' : 'E'}!`;
        if (this.frozen > 0) return null;
        if (G.player.isCrouched() && !this.seq) return 'Arm wrestle Ronnie (on a slow table)';
        return 'Send Ronnie to the staff room';
      },
      action: () => {
        if (this.blockingTaps) { this.endKeg(true); return; }
        if (this.wrestle) { this.wrestle.p += 0.07; return; }
        if (G.player.isCrouched() && !this.seq && !(this.frozen > 0)) { this.startWrestle(); return; }
        this.sendToStaffRoom();
      },
    };
    G.interactables.push(this.interact);
    if (G.shift.cfg.tutorial) this.run(this.intro());
    else this.say(pick(LINES.ronnie.hello));
  }
  say(t, dur = 3.5) { this.p.say(stutterize(t), { type: true, dur }); speak(t.replace(/(\w)-/g, ''), 'ronnie', false, t); }
  startWrestle() {
    this.wrestle = { p: 0.5, t: 0 };
    this.p.stopWalking(); this.p.faceTowards(G.player.pos);
    this.say("A-a-arm wrestle? Y-y-you're on. I've b-b-been training.", 3);
    this.status = 'Arm wrestling Lewis';
  }
  updateWrestle(dt) {
    const w = this.wrestle;
    w.t += dt;
    w.p -= dt * (this.boost > 0 ? 0.16 : 0.11);
    if (G.xr) w.p += (G.hands[0].speed() + G.hands[1].speed()) * dt * 0.05;
    G.shift.hint = `💪 Arm wrestle: ${'█'.repeat(Math.round(w.p * 20))}${'░'.repeat(20 - Math.round(w.p * 20))}`;
    if (w.p >= 1 || w.p <= 0 || w.t > 12) {
      const won = w.p >= 0.5;
      this.wrestle = null; G.shift.hint = '';
      if (won) { this.say("G-g-gains... yours. D-don't tell the gym.", 3); emit('addTips', 2); emit('addChaos', 10, 'wrestle'); G.toast('You beat Ronnie at arm wrestling! +£2', 2.5); }
      else { this.flex(); G.toast('Ronnie wins. He will mention this for weeks.', 2.5); }
      this.status = 'Helping';
    }
  }
  run(gen, onEnd) {
    this.seq?.abort();
    this.seq = new Seq(this.p, gen, (aborted) => { this.dropCarry(aborted); this.p.setPose('stand'); this.seq = null; onEnd && onEnd(aborted); });
  }
  *intro() {
    yield 1;
    this.say("Lewis! It's m-m-me, Ronnie! I w-w-work here too. I'm here to h-h-help. You're g-g-gonna love it.", 9);
    yield 9;
  }
  flex() {
    this.p.setPose('flex'); this.say(pick(LINES.ronnie.flex), 2.5);
    this.run((function* (self) { yield 1.8; self.p.setPose('stand'); })(this));
  }
  kickBack() {
    const b = G.ball; if (!b) return;
    sfx.kick();
    b.vel.set(rand(-5, 5), rand(2, 5), rand(-5, 5));
    this.say(pick(['M-m-my ball!', 'T-t-top bins!', 'W-w-worldie!']), 2);
  }
  sendToStaffRoom() {
    this.jobs++;
    this.say(pick(LINES.ronnie.staffRoom));
    this.status = 'Walking to the staff room';
    this.run((function* (self) {
      yield* walk(self.p, FIX.staffDoor.clone().add(V(0, 0, 0.3)));
      self.p.hidden = true; self.status = 'In the staff room (doing curls)';
      self.hiddenTimer = rand(35, 60);
    })(this));
    emit('ronnieSent');
  }
  radio() {
    if (this.p.hidden) { this.hiddenTimer = Math.min(this.hiddenTimer, 2); return; }
    if (this.blockingTaps) { this.say("I c-c-can't, I'm s-stuck!"); return; }
    this.jobs++;
    this.say(pick(LINES.ronnie.radio), 2);
    this.status = 'Coming to help (eventually)';
    const self = this;
    this.run((function* () {
      yield rand(1.5, 3.5);
      yield* walk(self.p, G.player.pos.clone().add(G.player.backDir().multiplyScalar(-1.2)));
      self.p.faceTowards(G.player.pos);
      const plates = passPlates();
      const success = self.boost > 0 ? 0.9 : Math.min(0.5, 0.2 + self.jobs * 0.03);
      if (plates.length && chance(success)) { yield* self.deliverCorrect(plates[0]); }
      else if (plates.length) { yield* (chance(0.5) ? self.evWrongTable() : self.evDropPlates()); }
      else { self.say("W-w-what d-do you need, Lewis? ...I'll j-just stand here.", 4); self.p.setPose('flex'); yield 3; }
    })());
  }
  dropCarry(aborted) {
    for (const it of this.carry) {
      it.held = null; it.sleeping = false;
      it.vel.set(rand(-2, 2), aborted ? rand(-6, -3) : 0, rand(-2, 2));
      if (aborted) it.vel.y = -5;
    }
    this.carry = [];
    if (this.keg) this.endKeg(false);
  }
  holdItems(list) { for (const it of list) { it.held = { npc: this }; it.onPass = false; it.sleeping = false; this.carry.push(it); } }

  *deliverCorrect(plate) {
    yield* walk(this.p, V(plate.pos.x, 0, -6.8));
    if (plate.dead || plate.held) return;
    this.holdItems([plate]);
    const t = G.tables.find((t) => t.group && t.needs.includes(plate.dish)) || null;
    if (!t) { this.say('N-n-nobody wants th-this?'); yield 2; return; }
    yield* walk(this.p, V(t.x, 0, t.z + t.d / 2 + 0.6));
    this.placeOn(plate, t);
    this.say('S-s-sorted it, Lewis! T-t-teamwork!', 3);
    yield 1;
  }
  placeOn(it, t) {
    this.carry = this.carry.filter((x) => x !== it);
    it.held = null; it.sleeping = false; it.rejectedBy = null;
    it.pos.set(t.x + rand(-0.2, 0.2), t.top + it.r + 0.02, t.z + rand(-0.2, 0.2)); it.vel.set(0, 0, 0);
  }
  *evDropPlates() {
    const plates = passPlates().slice(0, 3 + (chance(0.4) ? 3 : 0));
    if (!plates.length) return;
    this.say(pick(["L-L-Lewis, I've g-g-got these!", 'W-w-watch this, s-s-six plates!']), 3);
    this.status = 'Carrying too many plates';
    yield* walk(this.p, V(plates[0].pos.x, 0, -6.8));
    const avail = plates.filter((p) => !p.dead && !p.held);
    this.holdItems(avail);
    yield* walk(this.p, V(rand(-3, 4), 0, rand(-2, 0.5)));
    // Trip!
    this.p.knock(V(0, 2, 4), 'trip');
  }
  *evWrongTable() {
    const plates = passPlates();
    if (!plates.length) return;
    const pl = plates[0];
    const wrong = G.tables.filter((t) => t.group && t.state !== 'dirty' && t.id !== pl.forTable && t.id !== 'hollie');
    if (!wrong.length) return;
    const t = pick(wrong);
    this.say(stutterize(`Table ${t.id}, h-h-here's your food!`), 3);
    this.status = `Taking table ${pl.forTable}'s food to table ${t.id}`;
    yield* walk(this.p, V(pl.pos.x, 0, -6.8));
    if (pl.dead || pl.held) return;
    this.holdItems([pl]);
    yield* walk(this.p, V(t.x, 0, t.z + t.d / 2 + 0.6));
    this.placeOn(pl, t);
    yield 1;
  }
  *evFoamPint() {
    const t = pick(G.tables.filter((t) => t.group && t.needs.includes('pint')));
    if (!t) return;
    this.say("I p-p-poured a p-p-pint! It's m-mostly f-f-foam. Head is g-good for you.", 4);
    this.status = 'Pouring a 90% foam pint';
    yield* walk(this.p, V(-7.5, 0, -3.3));
    yield 1.2;
    const pint = spawnDrink('pint', this.p.p[RH].clone(), 0.9);
    pint.setFill(0.35); pint.foam = 0.9; pint.setFill(0.35);
    this.holdItems([pint]);
    yield* walk(this.p, V(t.x, 0, t.z + t.d / 2 + 0.6));
    if (t.group) this.placeOn(pint, t);
    yield 1;
  }
  *evKeg() {
    this.say("W-w-watch this, Lewis. K-k-keg d-deadlift. One rep m-max.", 4);
    this.status = 'Stuck under a keg';
    yield* walk(this.p, V(-7.4, 0, -3.3));
    this.p.faceTowards(V(0, 0, -3.3));
    this.keg = new Item('keg', { pos: this.p.p[HEAD].clone().add(V(0, 0.4, 0)) });
    this.keg.held = { npc: this };
    this.p.setPose('keg');
    this.blockingTaps = true;
    yield 2;
    this.say("L-L-Lewis... I'm s-s-stuck. C-can't feel my t-t-traps.", 5);
    yield () => !this.blockingTaps;
  }
  endKeg(helped) {
    if (!this.keg) return;
    this.blockingTaps = false;
    const k = this.keg; this.keg = null;
    k.held = null; k.vel.set(rand(-1, 1), 0, rand(-1, 1)); k.ttl = 12;
    this.p.setPose('stand');
    if (helped) { this.say('Th-th-thanks Lewis. G-gains though.', 3); sfx.good(); }
  }
  *evSeatKitchen() {
    const g = groups.find((x) => x.state === 'queue');
    if (!g) return;
    this.say("I'll s-s-seat these ones, Lewis! R-r-right this way!", 3);
    this.status = 'Seating customers... in the kitchen';
    yield* walk(this.p, FIX.queue.clone().add(V(0.8, 0, -0.6)));
    if (g.state !== 'queue') return;
    g.state = 'ronnie';
    g.members.forEach((m, i) => m.walkTo(FIX.kitchenDoor.clone().add(V((i % 3) * 0.4 - 0.4, 0, 0.9 + Math.floor(i / 3) * 0.4))));
    yield* walk(this.p, FIX.kitchenDoor.clone().add(V(-0.7, 0, 0.4)));
    yield 2.5;
    G.chef.say(pick(LINES.chef)); speak(LINES.chef[0], 'chef', true);
    sfx.thud();
    g.state = 'queue';
    g.mood -= 10;
    g.members.forEach((m) => { if (!m.dead && m.state !== 'ragdoll') m.knock(V(rand(-1, 1), 3, 6), 'chef'); });
    this.say('Wr-wr-wrong d-door. M-my bad.', 3);
    yield 2;
  }
  *evSweepBag() {
    const t = pick(G.tables.filter((t) => t.group && t.group.members.length));
    if (!t) return;
    this.status = 'Sweeping (a handbag into the bin)';
    yield* walk(this.p, V(t.x + 0.9, 0, t.z + 0.9));
    this.say('J-j-just a q-quick sweep...', 2.5);
    yield 2.5;
    t.group.patience -= t.group.maxPatience * 0.25; t.group.mood -= 8;
    pick(t.group.members).say('MY HANDBAG! He swept my handbag into the bin!');
    yield 2;
  }
  *evTannoy() {
    this.status = 'Announcing the specials over the tannoy';
    emit('tannoy', stutterize("G-g-good evening Oysterfleet. T-t-today's specials are: f-f-fish. And ch-ch-chips. And... f-f-fish and ch-chips. And m-my protein pie. D-don't order the pie."));
    yield 6;
  }
  *evPressups() {
    this.status = 'Doing press-ups in the walkway';
    yield* walk(this.p, V(0, 0, -0.9 + 1.5));
    this.p.setPose('pressup');
    this.say("D-d-don't mind me. S-s-set of fifty.", 3);
    yield 12;
    this.p.setPose('stand');
  }
  *evFlirt() {
    const t = pick(G.tables.filter((t) => t.group && t.group.typeKey !== 'stag'));
    if (!t) return;
    this.status = 'Flirting with table ' + t.id;
    yield* walk(this.p, V(t.x - 0.9, 0, t.z + 0.9));
    this.p.faceTowards(V(t.x, 0, t.z));
    this.say(pick(['A-a-are you a p-p-protein shake? B-because... I f-forgot the rest.', 'D-d-do you even l-lift? ...M-me neither, today.']), 5);
    yield 5;
    t.group.mood -= 6;
    pick(t.group.members).say('...right.');
    yield 1;
  }
  randomEvent() {
    const opts = [];
    if (passPlates().length) opts.push('evDropPlates', 'evWrongTable', 'evWrongTable');
    if (G.tables.some((t) => t.group && t.needs.includes('pint'))) opts.push('evFoamPint');
    opts.push('evKeg');
    if (groups.some((g) => g.state === 'queue')) opts.push('evSeatKitchen', 'evSeatKitchen');
    if (G.tables.some((t) => t.group)) opts.push('evSweepBag', 'evFlirt');
    opts.push('evTannoy', 'evPressups');
    const ev = pick(opts);
    this.run(this[ev]());
    emit('ronnieEvent', ev);
  }
  update(dt) {
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (!this.ice) { this.ice = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.7), new THREE.MeshLambertMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5 })); (G.dynamicRoot || G.scene).add(this.ice); (G.decor ||= []).push(this.ice); }
      this.ice.visible = true; this.ice.position.copy(this.p.root).add(V(0, 1.0, 0));
      if (this.frozen <= 0) { this.ice.visible = false; this.say('Th-th-thawed. W-w-where was I?'); this.status = 'Helping'; }
      return;
    }
    if (this.boost > 0) { this.boost -= dt; if (this.boost <= 0) this.say("M-m-monster's w-worn off."); }
    this.seq?.update(dt);
    // Carried items follow his hands
    this.carry.forEach((it, i) => { it.pos.copy(this.p.p[i % 2 ? LH : RH]).add(V(0, 0.12 + Math.floor(i / 2) * 0.05, 0.1)); it.vel.set(0, 0, 0); });
    if (this.keg) this.keg.pos.copy(this.p.p[LH]).lerp(this.p.p[RH], 0.5).add(V(0, 0.2, 0));
    if (this.p.hidden) {
      this.hiddenTimer -= dt;
      if (this.hiddenTimer <= 0) {
        this.p.hidden = false; this.p.root.copy(this.reappearAt || FIX.staffDoor).add(V(0, 0, 0.5)); this.reappearAt = null; this.p.state = 'stand';
        this.p.snapToPose();
        this.say(pick(LINES.ronnie.back)); this.status = 'Helping';
        this.nextEvent = rand(8, 15);
      }
      return;
    }
    // Monster pick-up
    if (!this.seq && this.p.state === 'stand') {
      const mon = G.items.find((it) => it.drink === 'monster' && !it.held && !it.frozen && it.pos.distanceTo(this.p.p[PELVIS]) < 0.9);
      if (mon) { mon.remove(); this.boost = 45; this.status = 'MONSTER POWER (actually useful)'; this.say('M-M-MANGO LOCO! I c-can see through t-time, Lewis!', 3); sfx.good(); emit('ronnieMonster'); }
    }
    if (this.wrestle) { if (this.p.state === 'ragdoll') { this.wrestle = null; G.shift.hint = ''; } else { this.updateWrestle(dt); return; } }
    if (this.seq || this.p.state === 'ragdoll' || this.p.state === 'getup') return;
    this.status = this.boost > 0 ? 'MONSTER POWER (actually useful)' : 'Helping';
    if (this.boost > 0) {
      const pl = passPlates()[0];
      if (pl && G.tables.some((t) => t.group && t.needs.includes(pl.dish))) { this.run(this.deliverCorrect(pl)); return; }
    }
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = rand(...G.shift.cfg.ronnieEvery) * (G.shift.rules.ronnieManager ? 0.5 : 1);
      this.randomEvent();
    } else if (this.p.state === 'stand' && chance(dt * 0.15)) {
      // wander between spots
      const spots = [V(3, 0, -6.6), V(-6.5, 0, -2), V(0, 0, -0.9 + 1.4), V(7.5, 0, -1), V(-3, 0, 4.8)];
      this.p.walkTo(pick(spots));
    }
  }
}

// ---------------------------------------------------------------- Ian
// Ian: a big lad (about Noah's size), white skin, grey hair, full camo every single shift.
export function makeIanPerson(x, z, opts = {}) {
  return new Person(Object.assign({ kind: 'ian', name: 'Ian', tag: 'Ian (Dad)', label: 'Ian', x, z, model: 'ian', wide: 1.5, look: CAST.ian(), heavy: 2.4, prop: propRod(), bubbleColor: '#e8e8d0', walkSpeed: 0.95 }, opts));
}
class Ian {
  constructor() {
    const t = tableById('ian');
    this.seat = t.seatList[0];
    this.p = makeIanPerson(this.seat.pos.x, this.seat.pos.z);
    this.p.sitAt(this.seat);
    this.meter = 8; this.angryLater = 0; this.lastPint = 0; this.cooldownTalk = 0;
    this.lineTimer = rand(5, 10); this.activity = null; this.seq = null;
    this.quizTimer = 30; this.quizActive = null;
    this.p.onGetUp = () => this.afterGetUp();
    this.p.onBeforeKnock = (imp, src) => {
      if (src === 'ball') { this.add(15, 'hit'); this.say(pick(LINES.ian.hit), true); return imp.length() > 8; }
      return true;
    };
    this.interact = {
      pos: () => this.p.p[HEAD], radius: 2.6,
      label: () => {
        if (G.talk) return null;
        if (this.quizActive) return G.player.isCrouched() ? 'Help Dad with the quiz' : 'Help Dad with the quiz (crouch!)';
        if (this.cooldownTalk > 0 && !this.boss) return null;
        return G.player.isCrouched() ? '"Dad, sit down" talk' : 'Talk to Dad (crouch down first)';
      },
      action: () => {
        if (!G.player.isCrouched()) { this.say('Lewy, I\'m not talking to your belt buckle. Come down here.', true); return; }
        if (this.boss) { emit('bossTalk'); return; }
        if (this.quizActive) return this.startQuizTalk();
        this.startTalk();
      },
    };
    G.interactables.push(this.interact);
  }
  get level() { return this.meter < 25 ? 0 : this.meter < 50 ? 1 : this.meter < 75 ? 2 : 3; }
  get levelName() { return ['Calm', 'Grumbling', 'Wound up', 'About to blow'][this.level]; }
  say(t, important = false) { this.p.say(t, { dur: 3.5 }); speak(t, 'ian', important); }
  add(n, why) {
    if (G.shift.cfg.ianRate === 0 && n > 0) return;
    this.meter = clamp(this.meter + n, 0, 100);
    if (n > 0) emit('ianUp', n, why);
    if (this.meter >= 100 && !this.melted) { this.melted = true; emit('meltdown'); }
  }
  startTalk() {
    const set = pick(TALK_OPTIONS);
    const opts = shuffle([{ text: set.right, ok: true }, ...set.wrong.map((w) => ({ text: w, ok: false }))]);
    startCards(opts, (ok) => {
      if (ok) { this.add(-30); this.say(pick(['...Alright, Lewy. Alright.', 'Fair enough, Lewy.', 'You\'re a good lad, Lewy.'])); sfx.good(); emit('ianCalmed'); }
      else { this.add(10, 'talk'); this.say(pick(['WHAT did you just say, Lewy?!', 'Don\'t you start, Lewy!']), true); sfx.bad(); }
      this.cooldownTalk = 18;
    });
  }
  startQuizTalk() {
    const q = this.quizActive;
    const opts = shuffle([{ text: q.right, ok: true }, ...q.wrong.map((w) => ({ text: w, ok: false }))]);
    G.toast('QUIZ: ' + q.q);
    startCards(opts, (ok) => {
      this.quizActive = null; this.quizTimer = rand(40, 55);
      if (ok) { this.add(-25); this.say('YES! We\'re WINNING, Lewy!', true); sfx.cheer(); emit('quizWin'); }
      else { this.add(15, 'quiz'); this.say('WRONG?! That quizmaster\'s rigged, Lewy!', true); sfx.bad(); }
    });
  }
  afterGetUp() {
    if (inGarden(this.p.root)) {
      this.add(-50); this.angryLater = 60;
      this.say('...Lovely bit of fresh air, Lewy. I\'ll be BACK though.');
      emit('ianCarriedOut');
      this.runActivity(this.backToSeat(8));
    } else {
      this.add(20, 'thrown');
      this.say(pick(LINES.ian.thrown), true);
      this.runActivity(this.backToSeat(0.5));
    }
  }
  *backToSeat(delay) {
    yield delay;
    yield* walk(this.p, this.seat.pos);
    this.p.sitAt(this.seat);
  }
  runActivity(gen) {
    this.seq?.abort();
    this.seq = new Seq(this.p, gen, () => { this.seq = null; this.p.lift = 0; if (this.p.pose !== 'sit' && this.p.state !== 'ragdoll') this.p.setPose('stand'); });
  }
  *wanderArgue() {
    const t = pick(G.tables.filter((t) => t.group && typeof t.id === 'number'));
    if (!t) return;
    yield* walk(this.p, V(t.x - t.w / 2 - 0.8, 0, t.z));
    this.p.faceTowards(V(t.x, 0, t.z));
    this.say(pick(['That fish is FARMED, mate.', 'You call that a pint?', 'Lewy! LEWY! This lot are on MY side of the pub!']), true);
    if (t.group) { t.group.mood -= 8; t.group.patience -= 10; }
    yield 4;
    yield* this.backToSeat(0);
  }
  *castRod() {
    const t = pick(G.tables.filter((t) => t.group && t.served.length));
    this.p.setPose('speech');
    this.say(t ? `Watch this cast, Lewy! *catches a chip off table ${t.id}*` : 'Watch this cast, Lewy!', true);
    sfx.whoosh();
    if (t && t.group) { t.group.mood -= 6; pick(t.group.members).say('Did that man just fish my chips?!'); }
    yield 3;
    this.p.setPose('sit');
  }
  *atTheBar() {
    // Camo works too well: he's suddenly at the bar.
    this.p.hidden = true;
    yield 1.5;
    this.p.hidden = false;
    this.p.root.set(-7.3, 0, -1.8); this.p.state = 'stand'; this.p.setPose('stand'); this.p.faceTowards(V(-9, 0, -1.8));
    this.p.snapToPose();
    this.say('LEWY! Pint, Lewy!', true);
    G.toast('Ian is suddenly at the bar. Nobody saw him move. (Camo.)');
    yield 15;
    yield* this.backToSeat(0);
  }
  *speech() {
    this.p.state = 'stand'; this.p.setPose('speech'); this.p.lift = 0.45;
    this.say(pick(LINES.ian.blow), true);
    yield 5;
    this.p.lift = 0; this.p.sitAt(this.seat);
  }
  update(dt) {
    if (this.melted) return;
    this.seq?.update(dt);
    if (this.boss) return;
    this.cooldownTalk -= dt;
    const cfg = G.shift.cfg;
    let rate = cfg.ianRate;
    if (rate > 0) {
      this.lastPint += dt;
      if (this.lastPint > 75) rate += 0.25;
      if (this.angryLater > 0) { this.angryLater -= dt; rate *= 1.5; }
      const ch = G.tvChannel;
      if (ch === 'fishing') rate -= 0.8;
      if (ch === 'football' && G.tvLosing) rate += 0.2;
      if (G.shift.finale) rate *= 2.2;
      this.add(rate * dt);
    }
    // Quiz night
    if (cfg.quiz && !this.quizActive) {
      this.quizTimer -= dt;
      if (this.quizTimer <= 0) {
        this.quizActive = pick(QUIZ); this.quizExpire = 25;
        this.say('LEWY! What\'s the answer?! QUICK!', true);
        G.toast('Quizmaster: "' + this.quizActive.q + '" Ian needs you!');
      }
    } else if (this.quizActive && !G.talk) {
      this.quizExpire -= dt;
      if (this.quizExpire <= 0) { this.quizActive = null; this.quizTimer = rand(40, 55); this.add(10, 'quiz'); this.say('We lost that one, Lewy. Thanks for NOTHING.', true); }
    }
    // Lines + behaviour by level
    this.lineTimer -= dt;
    if (this.lineTimer <= 0 && this.p.state !== 'ragdoll') {
      this.lineTimer = [22, 15, 11, 7][this.level] * rand(0.8, 1.2);
      const pool = [LINES.ian.calm, LINES.ian.grumble, LINES.ian.wound, LINES.ian.blow][this.level];
      if (G.tvChannel === 'fishing' && chance(0.5)) this.say(pick(LINES.ian.fishing));
      else this.say(pick(pool), this.level >= 2);
      if (!this.seq && this.p.state === 'sit' && cfg.ianRate > 0) {
        const r = Math.random();
        if (this.level === 1 && r < 0.25) this.runActivity(this.atTheBar());
        else if (this.level === 2 && r < 0.4) this.runActivity(chance(0.5) ? this.wanderArgue() : this.castRod());
        else if (this.level === 3 && r < 0.6) this.runActivity(this.speech());
      }
    }
  }
}

on('ianDelivery', (it) => {
  const ian = G.ian;
  if (!ian) return;
  if (it.drink === 'pint') {
    it.frozen = true; it.ttl = 25;
    ian.add(-40); ian.lastPint = 0;
    ian.say(it.fill < 0.5 ? 'Half a pint, Lewy? ...Go on then.' : pick(LINES.ian.pint));
    sfx.good();
    emit('ianPint');
  } else if (it.drink === 'monster') { ian.say('I\'m not Ronnie, Lewy.'); }
  else if (it.dish === 'fish') { ian.say(pick(LINES.ian.farmed)); ian.add(4, 'fish'); }
  else if (it.kind === 'plate') { ian.say('I didn\'t order this, Lewy. ...I\'ll have it though.'); it.frozen = true; it.ttl = 20; ian.add(-8); }
});
on('fishServed', () => { if (G.ian && chance(0.3)) { G.ian.say(pick(LINES.ian.farmed)); G.ian.add(4, 'fish'); } });
on('smash', (it) => { if (G.ian && it.pos.distanceTo(G.ian.p.p[PELVIS]) < 3.5) G.ian.add(6, 'spill'); });

// ---------------------------------------------------------------- talk cards (pick a line)
export function startCards(options, onPick) {
  if (G.talk) return;
  const head = G.player.headPos(), fwd = G.player.forward();
  const right = V(-fwd.z, 0, fwd.x).normalize();
  const cards = options.map((o, i) => {
    const pos = head.clone().addScaledVector(fwd, 0.85).addScaledVector(right, (i - 1) * 0.48).add(V(0, -0.1 - Math.abs(i - 1) * 0.04, 0));
    const c = new Item('card', { text: o.text, pos });
    c.mesh.lookAt(head);
    c.ok = o.ok;
    c.interact = { pos: () => c.pos, radius: 2, label: () => `"${o.text}"`, action: () => choose(c), card: true };
    G.interactables.push(c.interact);
    return c;
  });
  G.talk = { cards, onPick, timer: 25 };
  function choose(card) {
    if (!G.talk) return;
    const t = G.talk; G.talk = null;
    t.cards.forEach((c) => { c.interact.dead = true; c.remove(); });
    t.onPick(card.ok);
  }
  G.talk.choose = choose;
}
export function updateTalk(dt) {
  if (!G.talk) return;
  G.talk.timer -= dt;
  // Grabbing a card also picks it
  for (const c of G.talk.cards) if (c.held) { G.talk.choose(c); return; }
  if (G.talk.timer <= 0) { const t = G.talk; G.talk = null; t.cards.forEach((c) => { c.interact.dead = true; c.remove(); }); }
}

// ---------------------------------------------------------------- Hollie
class Hollie {
  constructor(early) {
    this.p = new Person({ kind: 'hollie', name: 'Hollie', tag: 'Hollie', label: 'Hollie', x: FIX.spawn.x, z: FIX.spawn.z, look: CAST.hollie(), walkSpeed: 1.3, bubbleColor: '#ffe0ec' });
    this.happiness = 0.3; this.offended = 0; this.served = false; this.waterCount = 0;
    this.seq = null; this.mode = 'arrive';
    this.table = tableById('hollie');
    // Hollie can be picked up and thrown like everyone else now.
    this.p.onGetUp = () => {
      this.offended = 60; this.happiness = Math.max(0, this.happiness - 0.5);
      this.say(pick(LINES.hollie.offended));
      emit('hollieThrown');
      this.resume();
    };
    this.run(this.arrive());
  }
  say(t) { this.p.say(t, { dur: 3 }); speak(t, 'hollie'); }
  available() { return !this.offended && !this.p.hidden && this.p.state !== 'ragdoll' && this.mode !== 'chase'; }
  dodge() {
    this.say(pick(LINES.hollie.dodge));
    const side = this.p.side.clone().multiplyScalar(chance(0.5) ? 0.7 : -0.7);
    this.p.root.add(side);
    sfx.whoosh();
    emit('hollieDodge');
  }
  run(gen) { this.seq?.abort(); this.seq = new Seq(this.p, gen, () => { this.seq = null; }); }
  *arrive() {
    this.p.walkTo(FIX.frontDoor.clone().add(V(0, 0, -1)), null, true);
    yield () => !this.p.path;
    this.say(pick(LINES.hollie.arrive));
    G.toast('Hollie has arrived! Serve her perfectly: it calms every table.');
    if (G.gardenOpen && !G.shift.cfg.hollieLaps) { yield* this.laps(1); }
    yield* this.sitDown();
  }
  *laps(n) {
    this.mode = 'laps';
    for (let k = 0; k < n * 4; k++) {
      const tgt = FIX.lapPath[k % 4];
      yield* walk(this.p, tgt, true);
    }
  }
  *sitDown() {
    this.mode = 'table';
    const t = this.table;
    const seat = t.seatList[0];
    yield* walk(this.p, seat.pos);
    this.p.sitAt(seat);
    if (!this.served && !t.group) {
      t.group = { special: 'hollie', members: [this.p], type: { tip: 0 }, typeKey: 'hollie', table: t, state: 'ready', maxPatience: 999, patience: 999, mood: 80, thrown: 0, wrong: 0, photos: 0, worldies: 0 };
      t.state = 'ready'; t.iconDirty = true;
      this.say('Babe! Come take my order. Crouch, yeah?');
    }
  }
  resume() {
    if (G.shift.cfg.hollieLaps && this.served) return this.run(this.lapsForever());
    if (this.served) return this.run(this.lapsForever());
    this.run(this.sitDown());
  }
  *lapsForever() {
    if (!G.gardenOpen) { yield* walk(this.p, V(-7.2, 0, -5.2)); this.p.faceTowards(V(-9, 0, -5.2)); this.mode = 'bar'; yield () => false; }
    for (;;) yield* this.laps(1);
  }
  chase(g) {
    if (!this.available()) return;
    this.say(pick(LINES.hollie.chase));
    const prev = this.mode;
    this.mode = 'chase';
    const self = this;
    this.p.speedMul = 1.35;
    this.run((function* () {
      let t = 0;
      while (g.state === 'runner' && t < 20) {
        const target = g.leader.dead ? null : g.leader.root;
        if (!target) break;
        self.p.walkTo(target, null, true);
        yield 0.4; t += 0.4;
        if (self.p.root.distanceTo(target) < 1.0) {
          runnerCaught(g);
          g.leader.say('Alright, alright! Here\'s the money!');
          self.say('Got him, babe!');
          emit('hollieCaught');
          break;
        }
      }
      self.p.speedMul = 1;
      self.mode = prev;
      self.resume();
    })());
  }
  update(dt) {
    this.seq?.update(dt);
    if (this.offended > 0) this.offended -= dt;
    this.happiness = Math.max(0, this.happiness - dt / 300);
    const t = this.table;
    // Her table flow (served by the normal serving code)
    if (t.group && t.group.special === 'hollie') {
      if (t.state === 'eating') {
        t.group.eatTimer -= dt;
        if (t.group.eatTimer <= 0) {
          const perfect = t.group.wrong === 0 && t.group.mood >= 75;
          this.happiness = Math.min(1, this.happiness + (perfect ? 0.8 : 0.4));
          this.say(perfect ? pick(LINES.hollie.happy) : 'Thanks babe. Not your best, but I love you.');
          emit('hollieDone', perfect);
          for (const it of t.served) it.remove();
          t.served = []; t.group = null; t.state = 'closed'; t.icon.visible = false;
          this.served = true;
          this.run(this.lapsForever());
        }
      }
    }
    // Water station: she grabs water from Lewis's hand as she runs past.
    if (this.mode === 'laps' && this.p.state === 'run') {
      for (const h of G.hands) {
        const it = h.held?.item;
        if (it && it.drink === 'water' && h.pos.distanceTo(this.p.p[NECK]) < 1.2) {
          h.forceRelease(); it.remove();
          this.waterCount++; this.happiness = Math.min(1, this.happiness + 0.15);
          this.say(pick(LINES.hollie.water)); sfx.good();
          emit('hollieWater');
        }
      }
    }
  }
}

// ---------------------------------------------------------------- regulars + chef
function makeRegulars() {
  const regs = [];
  const names = ['Big Dave', 'Old Ted', 'Old Pete'];
  [-6.1, -5.3, -4.5].forEach((z, i) => {
    const p = new Person({ kind: 'regular', name: names[i], tag: names[i], x: -7.4, z, look: oldManLook(i === 0 ? { wide: 1.45, belly: 1 } : {}), walkSpeed: 0.8 });
    p.sitAt({ pos: V(-7.45, 0, z), yaw: -Math.PI / 2 });
    p.lift = 0.27;
    p.onGetUp = () => { p.say('Oi! I\'ve been coming here 30 years!'); p.walkTo(V(-7.45, 0, z), () => { p.sitAt({ pos: V(-7.45, 0, z), yaw: -Math.PI / 2 }); p.lift = 0.27; }); };
    regs.push(p);
    // Their drinks on the bar
    const d = spawnDrink(i === 1 ? 'wine' : 'pint', V(-8.12, 1.25, z)); d.setFill(rand(0.4, 0.9)); d.prop = true;
  });
  // More glasses along the bar: empties, a half-finished wine, a stack of clean pint glasses
  for (const [drink, z, fill] of [['pint', -2.75, 0.1], ['wine', -1.9, 0.5], ['pint', -0.8, 0.0], ['pint', 0.6, 0.25], ['wine', 0.75, 0.0]]) {
    const it = spawnDrink(drink, V(-8.2, 1.25, z)); it.setFill(fill); it.prop = true;
  }
  for (let k = 0; k < 4; k++) { const it = spawnDrink('pint', V(-8.62, 1.25, -5.3 + k * 0.16)); it.setFill(0); it.prop = true; }
  // Ian's own pint by the fire
  const ip = spawnDrink('pint', V(8.75, 0.9, 5.15)); ip.setFill(0.3); ip.prop = true;
  return regs;
}
// Ben: the chef at the Fleet. Runs the kitchen behind the pass, and now and then comes out
// to hand Lewis food that's been sitting on the pass, or to tell him about a table's order.
const BEN_DOOR = V(0.5, 0, -7.15), BEN_HOME = V(5.3, 0, -9.0);
class Ben {
  constructor() {
    this.p = new Person({ kind: 'chef', name: 'Ben', tag: 'Ben (Chef)', label: 'Ben', x: BEN_HOME.x, z: BEN_HOME.z, yaw: 0, model: 'ben', wide: 1.1, bubbleColor: '#ffffff',
      look: { scale: 1.03, wide: 1.1, belly: 0.4, skin: 0xeec5ad, hair: 0x5a3825, hairStyle: 'short', shirt: 0xffffff, sleeves: 'long', trousers: 0x37474f, hat: 'chef', apron: 0xeeeeee } });
    this.p.immune = true;
    this.p.onBeforeKnock = () => this.out;
    this.p.onGetUp = () => {
      this.say(pick(["Oi! I'm the CHEF, Lewis!", "I've got a kitchen to run, you big lump!", 'Do that again and you\'re eating Ronnie\'s pie.']));
      if (this.out) this.run(this.goBack());
    };
    this.out = false; this.seq = null; this.carry = []; this.next = rand(25, 40);
  }
  say(t, important) { this.p.say(t, { dur: 3.2 }); speak(t, 'chef', important); }
  run(gen) {
    this.seq?.abort();
    this.seq = new Seq(this.p, gen, (aborted) => { this.seq = null; if (aborted) this.dropCarry(); });
  }
  dropCarry() { for (const it of this.carry) { if (it.held && it.held.npc === this) { it.held = null; it.sleeping = false; it.vel.set(rand(-1, 1), 1, rand(-1, 1)); } } this.carry = []; }
  *comeOut() {
    this.p.hidden = true; yield 0.6;
    this.p.root.copy(BEN_DOOR); this.p.yaw = 0; this.p.state = 'stand'; this.p.setPose('stand'); this.p.snapToPose();
    this.p.hidden = false; this.out = true; this.p.immune = false;
    sfx.blip();
  }
  *goBack() {
    yield* walk(this.p, BEN_DOOR.clone());
    this.p.hidden = true; this.out = false; this.p.immune = true;
    yield 0.5;
    this.p.root.copy(BEN_HOME); this.p.yaw = 0; this.p.snapToPose(); this.p.hidden = false;
  }
  *toLewis(maxTime = 14) {
    let t = 0;
    while (t < maxTime) {
      const target = G.player.pos.clone().addScaledVector(G.player.forward(), 0.9);
      if (this.p.root.distanceTo(G.player.pos) < 1.4) break;
      this.p.walkTo(target, null, this.p.root.distanceTo(G.player.pos) > 5);
      yield 0.5; t += 0.5;
    }
    this.p.stopWalking(); this.p.faceTowards(G.player.pos);
    return t < maxTime;
  }
  *bringPlate(pl) {
    pl.held = { npc: this }; pl.onPass = false; pl.sleeping = false; this.carry = [pl];
    const what = DISHES[pl.dish]?.name || 'food';
    this.say(pick([`Hold on, that's table ${pl.forTable}'s ${what}!`, 'This has been on the pass AGES.']));
    yield* this.comeOut();
    const reached = yield* this.toLewis();
    if (pl.dead || !this.carry.includes(pl)) { yield* this.goBack(); return; }
    if (reached && G.hands.some((h) => !h.held)) {
      this.carry = []; pl.held = null; G.player.give(pl);
      this.say(pick([`Table ${pl.forTable}, ${what}. Go go go!`, `${what} for table ${pl.forTable}. Don't you dare drop it, Lewis.`, `Table ${pl.forTable}! It's getting cold, mate!`]), true);
      G.toast(`👨‍🍳 Ben handed you table ${pl.forTable}'s ${what}.`, 3);
      emit('benDelivered', pl);
    } else {
      this.say(reached ? "Your hands are full! I'll put it back on the pass." : "Where've you gone? Back on the pass it goes.");
      yield* walk(this.p, V(pl.forTable ? 4.5 : 4.5, 0, -6.9));
      this.carry = []; pl.held = null; pl.onPass = true; pl.passTime = G.time;
      pl.pos.set(rand(FIX.pass.x0, FIX.pass.x1), FIX.pass.y + 0.14, FIX.pass.z); pl.vel.set(0, 0, 0);
    }
    yield 1;
    yield* this.goBack();
  }
  *tellLewis(msg) {
    this.say('Lewis! LEWIS!');
    yield* this.comeOut();
    yield* this.toLewis(12);
    this.say(msg, true);
    G.toast('👨‍🍳 Ben: ' + msg, 3.5);
    yield 3.2;
    yield* this.goBack();
  }
  // What's the most urgent thing to tell Lewis about?
  findIssue() {
    const tabs = G.tables.filter((t) => t.group && typeof t.id === 'number');
    const urgency = (t) => 1 - t.group.patience / t.group.maxPatience;
    const pickT = (f) => tabs.filter(f).sort((a, b) => urgency(b) - urgency(a))[0];
    let t;
    if ((t = pickT((t) => t.state === 'ordered'))) return `I've got no ticket for table ${t.id}! Spike it on the pass, mate.`;
    if ((t = pickT((t) => t.state === 'ready' && urgency(t) > 0.2))) return `Table ${t.id} have been ready to order for ages. Crouch down and take it!`;
    if ((t = pickT((t) => t.state === 'bill'))) return `Table ${t.id} want the bill. Card machine, go!`;
    if ((t = pickT((t) => t.state === 'waiting' && t.needs.some((n) => isDrink(n))))) return `Table ${t.id} are still waiting on drinks: ${t.needs.filter((n) => isDrink(n)).map((n) => DRINKS[n]?.name || n).join(', ')}.`;
    const dirty = G.tables.find((t) => t.state === 'dirty');
    if (dirty) return `Table ${dirty.id} is minging. Give it a wipe, Lewis.`;
    if (G.groupsRef?.some((g) => g.state === 'queue')) return "There's people stood at the door waiting to be seated!";
    return null;
  }
  update(dt) {
    this.seq?.update(dt);
    this.carry.forEach((it, i) => { if (!it.dead) { it.pos.copy(this.p.p[i % 2 ? LH : RH]).add(V(0, 0.15, 0.1)); it.vel.set(0, 0, 0); } });
    if (!this.out && !this.seq) {
      this.p.root.x = BEN_HOME.x + Math.sin(G.shift.time * 0.5) * 1.5; this.p.yaw = 0;
      if (chance(dt * 0.02)) this.p.say(pick(['SERVICE!', 'Hands please!', "Where's that tall lad?", 'Two fish, one roast, LET\'S GO!']), { dur: 2 });
    }
    if (this.seq || this.out || G.shift.cfg.minigame && G.shift.cfg.minigame !== 'datenight' || G.shift.cfg.tables.length === 0) return;
    this.next -= dt;
    if (this.next > 0) return;
    this.next = rand(30, 55);
    const stale = passPlatesFor().filter((it) => G.time - (it.passTime ?? G.time) > 12).sort((a, b) => a.passTime - b.passTime)[0];
    if (stale && chance(0.7)) { this.run(this.bringPlate(stale)); return; }
    const msg = this.findIssue();
    if (msg) this.run(this.tellLewis(msg));
  }
}
function passPlatesFor() { return passPlates(); }

export function regularsCheer(text) {
  const r = pick(G.regulars || []);
  if (!r || r.state === 'ragdoll') return;
  r.say(text || pick(LINES.regulars), { dur: 2 });
  sfx.cheer();
}

// ---------------------------------------------------------------- setup / update
export function spawnStaff() {
  G.ben = new Ben();
  G.chef = G.ben.p;
  if (G.shift.cfg.noStaff) { G.regulars = []; G.ronnie = null; G.ian = null; G.hollie = null; G.shift.hollieAt = Infinity; return; }
  G.regulars = makeRegulars();
  G.ronnie = new Ronnie();
  G.ian = new Ian();
  G.hollie = null;
  const cfg = G.shift.cfg;
  G.shift.hollieAt = cfg.hollieEarly ? 25 : (cfg.sandbox ? 20 : rand(80, 140));
}

export function updateNPCs(dt) {
  if (!G.hollie && G.shift.time > G.shift.hollieAt) G.hollie = new Hollie();
  G.ronnie?.update(dt);
  G.ian?.update(dt);
  G.hollie?.update(dt);
  updateTalk(dt);
  // Chef shouts "SERVICE!" sometimes
  G.ben?.update(dt);
}

// Hollie's table + Ian need their own interactables (the generic table ones skip special tables).
export function registerSpecialTableInteractables() {
  const t = tableById('hollie');
  G.interactables.push({
    pos: V(t.x, t.top + 0.2, t.z), radius: 2.4,
    label: () => (t.group && t.state === 'ready' ? (G.player.isCrouched() ? "Take Hollie's order" : "Take Hollie's order (crouch!)") : null),
    action: () => { if (t.group && t.state === 'ready') serving.takeOrderFor(t.group); },
  });
}
