// Shift lifecycle, scoring, campaign progress, pub events.
import * as THREE from 'three';
import { G, V, rand, pick, chance, clamp, on, emit, writeSave, FIXED } from './state.js';
import { SHIFTS, MODES, SPECIAL_RULES, ACHIEVEMENTS, LINES } from './data.js';
import { FIX, setGardenOpen, setTimeOfDay, tvScreen, inGarden } from './world.js';
import { Item, spawnPlate, spawnDrink, updateItems } from './physics.js';
import { stepPeople, peopleInteractions, PELVIS, HEAD } from './people.js';
import * as S from './serving.js';
import { spawnStaff, updateNPCs, regularsCheer, registerSpecialTableInteractables } from './npcs.js';
import { resetPlayer, updatePlayer, releasePointer } from './player.js';
import { toast, updateHUD, showPanel, hidePanel } from './hud.js';
import { sfx, speak, setAmbience } from './audio.js';
import { review } from './serving.js';

let accumulator = 0;

function newShift(cfg) {
  const s = {
    cfg, rules: {}, time: 0, timeLeft: cfg.duration, tips: 0, chaos: 0, combo: 1, comboTimer: 0,
    reviews: [], throws: 0, smashes: 0, walkouts: 0, tablesPaid: 0, worldies: 0, goals: 0,
    headlines: [], achievements: [], ended: false, hint: '', nextSpawn: cfg.tutorial ? 6 : 3,
    criticSpawned: false, criticResult: null, finale: false, chatTimer: rand(40, 70),
    tvGoalTime: -99, tvTimer: rand(30, 50), score: { home: 0, away: 0 },
    rating() { return this.reviews.length ? this.reviews.reduce((a, b) => a + b, 0) / this.reviews.length : 3; },
  };
  if (cfg.special) {
    const day = Math.floor(Date.now() / 86400000);
    const rule = SPECIAL_RULES[day % SPECIAL_RULES.length];
    s.rules[rule.id] = true; s.specialRule = rule;
  }
  return s;
}

export function cfgFor(id) { return SHIFTS.find((x) => x.id === id) || MODES[id]; }

export function startShift(id) {
  const cfg = cfgFor(id);
  G.shiftId = id;
  // Clear previous shift
  S.clearServing();
  for (const p of G.people.slice()) p.destroy();
  for (const it of G.items.slice()) it.remove();
  G.hands?.forEach((h) => h.forceRelease());
  G.people.length = 0; G.items.length = 0;
  G.interactables = [];
  G.talk = null;
  G.ronnie = G.ian = G.hollie = G.chef = null; G.regulars = [];
  G.shift = newShift(cfg);
  G.groupsRef = S.groups;
  G.timeScale = 1; G.slowmo = 0; G.time = 0;
  S.initTables();
  S.openTables(cfg.tables.filter((t) => cfg.garden || t < 9));
  S.registerServingInteractables();
  registerSpecialTableInteractables();
  setGardenOpen(!!cfg.garden);
  setTimeOfDay(cfg.hour);
  // Football (unlocked from Tuesday)
  G.ball = null;
  if (cfg.id !== 'mon') G.ball = new Item('ball', { pos: V(0.5, 0.3, 4.6) });
  // Golden oyster
  const found = Object.keys(G.save.oysters).length;
  if (found < 7) {
    const spots = FIX.goldenSpots.map((p, i) => i).filter((i) => !G.save.oysters[i]);
    if (spots.length) { const i = pick(spots); const o = new Item('golden', { pos: FIX.goldenSpots[i].clone() }); o.spot = i; o.sleeping = true; }
  }
  // TV
  G.tvChannel = cfg.matchDay || cfg.id === 'fri' ? 'football' : pick(['football', 'news', 'quiz']);
  if (cfg.quiz) G.tvChannel = 'quiz';
  G.tvLosing = false;
  drawTV();
  spawnStaff();
  if (cfg.stagStart) S.spawnGroup('stag', { size: 6 });
  if (cfg.fishingClub) S.spawnGroup('pensioner', { size: 5, camo: true, special: 'club' });
  if (cfg.sandbox) { addToyBox(); }
  resetPlayer(V(-5.6, 0, 5.0), 0.3);
  G.mode = 'playing';
  toast(`${cfg.day}: ${cfg.name}. ${cfg.twist}`, 6);
  if (s().specialRule) toast(`Today's special rule: ${s().specialRule.name}. ${s().specialRule.desc}`, 6);
  emit('shiftStart', cfg);
}
const s = () => G.shift;

function addToyBox() {
  G.interactables.push({
    pos: FIX.toybox, radius: 2,
    label: () => 'Toy box: spawn something',
    action: () => {
      const r = Math.random(), p = FIX.toybox.clone().add(V(0.4, 0.3, 0));
      let it;
      if (r < 0.25) it = new Item('ball', { pos: p });
      else if (r < 0.55) it = spawnPlate(pick(['fish', 'roast', 'burger', 'oysters']), '?', p);
      else if (r < 0.8) it = spawnDrink(pick(['pint', 'monster', 'mocktail']), p);
      else it = new Item('keg', { pos: p });
      G.player.give(it);
    },
  });
}

// ---------------------------------------------------------------- scoring helpers
function addChaos(n, why) {
  const sh = s(); if (!sh) return;
  if (sh.comboTimer > 0) sh.combo = Math.min(5, sh.combo + 0.5); else sh.combo = 1;
  sh.comboTimer = 3;
  sh.chaos += n * (sh.cfg.chaos ? sh.combo : 1);
}
function headline(text, score) { s()?.headlines.push({ text, score }); }
function achieve(id) {
  if (!ACHIEVEMENTS[id] || G.save.achievements[id]) return;
  G.save.achievements[id] = true; s()?.achievements.push(id);
  toast(`🏆 Achievement: ${ACHIEVEMENTS[id].name}! ${ACHIEVEMENTS[id].desc}`, 4);
  sfx.cash();
  writeSave();
}
function addTips(n) { if (!s().cfg.chaos) s().tips += n; }

const KIND_NAME = (p) => p.kind === 'ronnie' ? 'GYM LAD COLLEAGUE' : p.kind === 'ian' ? 'OWN DAD' : p.kind === 'hollie' ? 'GIRLFRIEND' : p.kind === 'regular' ? 'PUB REGULAR' : p.group?.typeKey === 'pensioner' ? 'PENSIONER' : p.group?.typeKey === 'stag' ? 'STAG' : p.group?.typeKey === 'karen' ? 'COMPLAINER' : p.isKid ? 'CHILD (GENTLY)' : p.group?.typeKey === 'critic' ? 'FOOD CRITIC' : 'CUSTOMER';

// ---------------------------------------------------------------- events
on('paid', (g, tip, stars) => {
  const sh = s();
  addTips(tip); sh.reviews.push(stars); sh.tablesPaid++;
  if (g.critic) {
    if (stars >= 4) { addTips(25); sh.criticResult = 'rave'; toast('🕵️ That couple was the FOOD CRITIC! Rave review: +£25!', 5); headline('FOOD CRITIC RAVES ABOUT TALL WAITER', 6); }
    else { sh.reviews.push(1); sh.criticResult = 'slated'; toast('🕵️ That couple was the FOOD CRITIC... and they hated it.', 5); headline('FOOD CRITIC SLATES OYSTERFLEET', 7); }
  } else toast(`T${g.table?.id ?? ''} review: ${review(stars)}`, 3.5);
});
on('walkout', (g) => { s().reviews.push(1); s().walkouts++; headline('DINERS STORM OUT AFTER EPIC WAIT', 3); if (g.critic) s().criticResult = 'walked'; });
on('thrown', (p, speed) => {
  const sh = s(); if (!sh) return;
  sh.throws++;
  addChaos(10 + speed * 2, 'throw');
  if (speed > 7.5) { G.slowmo = 1.2; regularsCheer('OHHHHH!'); }
  headline(`LOCAL GIANT THROWS ${KIND_NAME(p)} ACROSS PUB`, 2 + speed * 0.4 + (p.kind === 'ian' ? 3 : 0));
  if (sh.cfg.gentle) { toast('You threw someone. Gentle Giant failed!', 4); endShift('gentleFail'); }
});
on('knocked', (p, imp, source) => {
  if (source === 'grab' || source === 'trip' || source === 'chef') return;
  addChaos(6, source);
  if (source === 'ball') headline(`WAITER VOLLEYS ${KIND_NAME(p)}`, 3 + imp.length() * 0.2);
});
on('chain', () => { addChaos(15, 'chain'); toast('STRIKE! Knockdown chain reaction!', 1.5); headline('BOWLING-STYLE PILE-UP AT THE OYSTERFLEET', 6); });
on('zone', (p, z) => {
  addChaos(z.points, z.name); toast(z.label, 2.5); sfx.cheer();
  if (z.name === 'pond') sfx.splash();
  if (z.name === 'fruit') { const w = Math.round(rand(2, 10)); addTips(w); sfx.fruit(); toast(`Fruit machine pays out £${w}!`, 2.5); }
  if (z.ach) achieve(z.ach);
  headline(`${KIND_NAME(p)} ${z.name === 'trolley' ? 'VOLLEYED INTO DESSERT TROLLEY' : z.name === 'pond' ? 'LANDS IN DUCK POND' : z.name === 'ballpit' ? 'SENT INTO KIDS\' BALL PIT' : z.name === 'bins' ? 'BINNED' : 'FED TO FRUIT MACHINE'}`, 8);
});
on('smash', () => { s().smashes++; addChaos(5, 'smash'); sfx.groan(); });
on('bonk', (n) => {
  regularsCheer(pick(LINES.regulars)); addTips(0.5);
  if (n === 10) achieve('mindYourHead');
  if (n >= 5) headline(`WAITER HEADBUTTS BEAM ${n} TIMES`, n * 0.5);
  if (n === 1) toast('THUNK. Mind your head! (Crouch: B / C)', 2.5);
});
on('keepie', (n) => {
  if (n === 5 || n === 10 || n === 20) { toast(`${n} keepie-uppies!`, 1.5); regularsCheer('GO ON, BIG MAN!'); }
  if (n > (G.save.keepieRecord || 0)) { G.save.keepieRecord = n; }
  if (n >= 10) achieve('keepie10');
  if (n % 5 === 0) for (const g of S.groups) if (g.type.fan && g.table) { g.mood += 4; addTips(0.5); }
});
on('worldie', () => { achieve('worldie'); toast('WORLDIE! Football fans love it. (+£5 on their bill)', 2.5); s().worldies++; });
on('meltdown', () => { headline('DAD IN FULL CAMO HAS PUB MELTDOWN', 20); endShift('meltdown'); });
on('golden', (it) => {
  if (it.spot !== undefined) G.save.oysters[it.spot] = true;
  const n = Object.keys(G.save.oysters).length;
  toast(`✨ Golden oyster! (${n}/7)`, 3);
  if (n >= 7) { achieve('oysters7'); toast('All 7 golden oysters! The whole group raises a pint to Lewis. Legend.', 6); }
  writeSave();
});
on('ianCarriedOut', () => headline('DAD CARRIED OUT OF PUB BY OWN SON', 9));
on('lampPost', () => { if (s().cfg.tutorial) toast('Crouch to their eye level before taking orders! Standing over them like a lamp post loses tips.', 4); });
on('runner', () => toast(G.hollie && G.hollie.available() ? 'They did a RUNNER! Look at them and press A/E: "Hollie, get them!"' : 'They did a runner without paying!', 4));
on('runnerCaught', () => { addTips(8); toast('Hollie caught the runner! +£8', 3); headline('SPORTY GIRLFRIEND CHASES DOWN DINE-AND-DASHER', 7); });
on('hollieDone', (perfect) => toast(perfect ? 'Hollie is happy! Every table\'s patience drains slower.' : 'Hollie\'s fed. Not perfect, but she still loves you.', 3.5));
on('hollieThrown', () => headline('WAITER THROWS OWN GIRLFRIEND (SHE IS NOT SPEAKING TO HIM)', 10));
on('tannoy', (text) => toast('📢 ' + text, 7));
on('ronnieMonster', () => toast('Ronnie had a Monster. He\'s actually useful for 45 seconds!', 3));
on('chefThrow', () => toast('The head chef threw you out of the kitchen.', 2));
on('itemThrown', (it, sp) => { if (sp > 6) addChaos(2, 'throwItem'); });

// ---------------------------------------------------------------- TV
const CHANNELS = ['football', 'fishing', 'news', 'quiz'];
export function drawTV() {
  if (!tvScreen) return;
  const x = tvScreen.ctx, W = 512, H = 288, ch = G.tvChannel;
  x.clearRect(0, 0, W, H);
  if (ch === 'football') {
    x.fillStyle = '#2e7d32'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#fff'; x.lineWidth = 4; x.strokeRect(20, 20, W - 40, H - 40);
    x.beginPath(); x.moveTo(W / 2, 20); x.lineTo(W / 2, H - 20); x.stroke(); x.beginPath(); x.arc(W / 2, H / 2, 40, 0, 7); x.stroke();
    x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(16, 16, 230, 44);
    const sc = s()?.score || { home: 0, away: 0 };
    x.fillStyle = '#fff'; x.font = 'bold 30px Arial'; x.fillText(`HOME ${sc.home} - ${sc.away} AWAY`, 26, 48);
  } else if (ch === 'fishing') {
    x.fillStyle = '#4f8fc0'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#2e5a2a'; x.fillRect(0, 0, W, 70);
    x.fillStyle = '#c0c060'; x.beginPath(); x.ellipse(W / 2, H / 2 + 30, 90, 34, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(W / 2 + 85, H / 2 + 30); x.lineTo(W / 2 + 130, H / 2); x.lineTo(W / 2 + 130, H / 2 + 60); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 34px Arial'; x.fillText('CARP WORLD LIVE', 120, 50);
  } else if (ch === 'news') {
    x.fillStyle = '#b71c1c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#fff'; x.font = 'bold 38px Arial'; x.fillText('BREAKING NEWS', 110, 90);
    x.font = '26px Arial'; x.fillText('Local man very tall, sources confirm', 40, 160);
  } else {
    x.fillStyle = '#4a148c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ffeb3b'; x.font = 'bold 44px Arial'; x.fillText('PUB QUIZ', 150, 110);
    x.fillStyle = '#fff'; x.font = '26px Arial'; x.fillText('Round 3: Fish, Football & Ronnie', 60, 180);
  }
  tvScreen.tex.needsUpdate = true;
}
function nextChannel() {
  G.tvChannel = CHANNELS[(CHANNELS.indexOf(G.tvChannel) + 1) % CHANNELS.length];
  drawTV(); sfx.buzz();
  const msg = { football: 'TV: Football. The stag do and fans approve.', fishing: 'TV: Fishing! Ian is mesmerised (calms him down).', news: 'TV: The news.', quiz: 'TV: Pub quiz channel.' }[G.tvChannel];
  toast(msg, 2.5);
  if (G.tvChannel === 'fishing' && G.ian) G.ian.say(pick(LINES.ian.fishing));
}
function updateTV(dt) {
  const sh = s();
  sh.tvTimer -= dt;
  if (sh.tvTimer <= 0) {
    sh.tvTimer = sh.cfg.matchDay ? rand(35, 55) : rand(50, 90);
    const home = chance(0.55);
    if (home) sh.score.home++; else sh.score.away++;
    G.tvLosing = sh.score.away > sh.score.home;
    if (G.tvChannel === 'football') {
      drawTV();
      if (home) { sh.tvGoalTime = sh.time; toast('⚽ GOAL ON THE TELLY! Score a goal yourself in the next 12s for a massive tip!', 4); regularsCheer('GOOOAL!'); for (const g of S.groups) if (g.type.fan || g.type.loud) g.mood += 8; if (G.ronnie) G.ronnie.say('C-C-COME ON! *rips shirt open*'); }
      else { toast('Away team scored on TV. The fans are gutted. Ian is furious.', 3); if (G.ian) { G.ian.add(8, 'tv'); G.ian.say('REF! You\'re BLIND!', true); } for (const g of S.groups) if (g.type.fan) g.mood -= 5; }
    }
  }
  // Fans and stags get grumpy without football on
  if (G.tvChannel !== 'football') for (const g of S.groups) if ((g.type.fan || g.type.loud) && g.table) g.patience -= dt * 0.3;
}

// ---------------------------------------------------------------- collisions between items and people
function itemPeopleHits() {
  for (const it of G.items) {
    if (it.held || it.frozen || it.sleeping || it.cls === 'shard' || it.cls === 'card') continue;
    const sp = it.vel.length();
    if (sp < 3.2) continue;
    for (const per of G.people) {
      if (per.hidden || per.immune || per === it.lastHitPerson && G.time - it.lastHitTime < 0.6) continue;
      if (Math.abs(per.root.x - it.pos.x) > 1.2 || Math.abs(per.root.z - it.pos.z) > 1.2) continue;
      if (per.state === 'ragdoll') {
        const n = per.nearestParticle(it.pos);
        if (n.dist < it.r + 0.02) { per.o[n.idx].addScaledVector(it.vel, -FIXED * 0.5 * it.mass); it.vel.multiplyScalar(-0.3); it.lastHitPerson = per; it.lastHitTime = G.time; }
        continue;
      }
      if (per.bodyDistance(it.pos) < it.r + 0.04) {
        const imp = it.vel.clone().multiplyScalar(it.cls === 'ball' ? 0.75 : 0.6 * it.mass).add(V(0, 1.5, 0));
        it.lastHitPerson = per; it.lastHitTime = G.time;
        const knocked = per.knock(imp, it.cls === 'ball' ? 'ball' : 'item');
        it.vel.multiplyScalar(knocked ? 0.35 : -0.4);
        if (!knocked) it.vel.y = Math.abs(it.vel.y) + 1;
        sfx.boing();
        break;
      }
    }
  }
}

on('itemImpact', (it, impact, tag) => {
  if (tag === 'tv' && impact > 3) nextChannel();
  if (tag === 'fruit' && impact > 4) { const w = Math.round(rand(1, 6)); addTips(w); sfx.fruit(); toast(`Fruit machine whacked: pays out £${w}!`, 2); }
});

function updateGoals() {
  const b = G.ball; if (!b || b.held) return;
  const sh = s();
  const gl = FIX.goal;
  let scored = null;
  if (G.gardenOpen && b.pos.x > gl.x - 0.05 && b.pos.x < gl.x + 0.6 && Math.abs(b.pos.z - gl.z) < gl.w / 2 - 0.2 && b.pos.y < gl.h) scored = 'BIN GOAL';
  if (Math.abs(b.pos.x - FIX.toilets.x) < 0.45 && b.pos.z > 7.65 && b.pos.y < 1.9 && b.vel.z > 2) scored = 'GOAL! (goal-line technology: toilet door)';
  if (scored && (!sh.lastGoal || sh.time - sh.lastGoal > 3)) {
    sh.lastGoal = sh.time; sh.goals++;
    G.save.goldenBoot = (G.save.goldenBoot || 0) + 1;
    sfx.whistle(); sfx.cheer();
    addChaos(10, 'goal');
    if (sh.time - sh.tvGoalTime < 12) { addTips(20); toast('SCORED WITH THE TELLY! Massive tip bonus: +£20!', 4); headline('WAITER SCORES IN SYNC WITH TV, PUB ERUPTS', 9); }
    else toast(`⚽ ${scored}!`, 2.5);
    regularsCheer('GOOOAL!');
    if (scored === 'BIN GOAL') setTimeout(() => { if (G.ball === b) { b.pos.set(18, 0.3, 0); b.vel.set(0, 0, 0); } }, 800);
  }
}

// ---------------------------------------------------------------- tutorial
const K = () => G.xr ? { crouch: 'B', act: 'A', grab: 'grip', kick: 'swing a controller low' } : G.touch ? { crouch: 'CROUCH', act: 'TALK', grab: 'GRAB', kick: 'KICK' } : { crouch: 'C', act: 'E', grab: 'click', kick: 'F' };
const TUT = [
  { hint: () => `Lewis is VERY tall. Press ${K().crouch} to crouch (beams are at forehead height).`, done: () => G.player.isCrouched() },
  { hint: () => `A group is at the front door. Look at them and press ${K().act} to seat them.`, ev: 'groupFollowing' },
  { hint: () => `Lead them to a free table, look at it and press ${K().act}.`, ev: 'groupSeated' },
  { hint: () => `When the table shows ❗, crouch to their level and press ${K().act} to take the order.`, ev: 'orderTaken' },
  { hint: () => 'Slam the ticket on the TICKET SPIKE by the kitchen pass.', ev: 'spiked' },
  { hint: () => `While the food cooks, pour their drinks at the bar (hold ${K().act} at TAPS).`, ev: 'poured' },
  { hint: () => `Grab plates/drinks (${K().grab}) and put them on the right table.`, ev: 'delivered' },
  { hint: () => `When they want the bill (💷), press ${K().act}. Then wipe the table.`, ev: 'paid' },
  { hint: () => 'Keep Dad calm: crouch + talk to him, or put a pint on his table.', time: 15 },
];
let tutIdx = 0, tutFlag = false, tutTime = 0;
for (const evName of ['groupFollowing', 'groupSeated', 'orderTaken', 'spiked', 'poured', 'delivered', 'paid']) on(evName, () => { if (TUT[tutIdx]?.ev === evName) tutFlag = true; });
function updateTutorial(dt) {
  const sh = s();
  if (!sh.cfg.tutorial) { sh.hint = ''; return; }
  const step = TUT[tutIdx];
  if (!step) { sh.hint = ''; return; }
  sh.hint = step.hint();
  tutTime += dt;
  if (tutFlag || (step.done && step.done()) || (step.time && tutTime > step.time)) { tutIdx++; tutFlag = false; tutTime = 0; if (TUT[tutIdx]) sfx.good(); }
}
on('shiftStart', () => { tutIdx = 0; tutFlag = false; tutTime = 0; });

// ---------------------------------------------------------------- main update
export function updateGame(rawDt) {
  const sh = s();
  if (!sh || G.mode !== 'playing') return;
  if (G.slowmo > 0) { G.slowmo -= rawDt; G.timeScale = 0.3; } else G.timeScale = 1;
  const dt = rawDt * G.timeScale;
  G.time += dt; sh.time += dt;
  if (sh.cfg.duration !== Infinity) sh.timeLeft = Math.max(0, sh.cfg.duration - sh.time);
  if (sh.comboTimer > 0) sh.comboTimer -= dt;

  updatePlayer(rawDt);
  if (G.mode !== 'playing') return;

  // Fixed-step physics for ragdolls
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED && steps < 4) { stepPeople(FIXED); accumulator -= FIXED; steps++; }
  if (steps === 4) accumulator = 0;
  peopleInteractions();
  updateItems(dt);
  itemPeopleHits();
  for (const p of G.people.slice()) p.update(dt);
  S.updateServing(dt);
  updateNPCs(dt);
  updateTV(dt);
  updateGoals();
  updateTutorial(rawDt);

  // Spawning
  sh.nextSpawn -= dt;
  if (sh.nextSpawn <= 0) {
    const queued = S.groups.filter((g) => g.state === 'queue' || g.state === 'arriving').length;
    if (S.activeGroupCount() < sh.cfg.maxGroups && queued < 3 && (sh.timeLeft > 50 || sh.cfg.duration === Infinity)) S.spawnGroup(S.pickType(sh.cfg));
    sh.nextSpawn = sh.cfg.interval * rand(0.75, 1.2);
  }
  // Group chat banter
  sh.chatTimer -= dt;
  if (sh.chatTimer <= 0) { sh.chatTimer = rand(60, 100); toast('📱 ' + pick(LINES.groupChat), 3); }
  // Sunday finale
  if (sh.cfg.finale && !sh.finale && sh.timeLeft < 60) { sh.finale = true; toast('FINALE: Ian\'s whole fishing club is here. Keep Dad calm for 60 seconds!', 5); G.ian?.say('LEWY! THE LADS ARE HERE! ROUND FOR THE CLUB, LEWY!', true); }
  setAmbience(Math.min(1, G.people.length / 25));
  updateHUD(rawDt);
  if (sh.timeLeft <= 0 && sh.cfg.duration !== Infinity) endShift('time');
}

// Render-side updates (also during pause, so bubbles etc. look right)
export function renderPeople() { for (const p of G.people) p.render(); }

// ---------------------------------------------------------------- end of shift
export function endShift(reason) {
  const sh = s();
  if (!sh || sh.ended) return;
  sh.ended = true; sh.reason = reason;
  G.mode = 'results';
  releasePointer();
  const success = reason === 'time' || reason === 'quit-sandbox';
  if (success && !sh.cfg.chaos) {
    if (sh.throws === 0 && sh.tablesPaid >= 2) achieve('gentleGiant');
    if (sh.rating() >= 4.5 && sh.reviews.length >= 3) achieve('fiveStar');
    if (G.ian && G.ian.meter < 25 && sh.cfg.ianRate > 0 && sh.tablesPaid >= 2) achieve('calmIan');
  }
  const top = sh.headlines.sort((a, b) => b.score - a.score)[0];
  sh.headlineText = reason === 'meltdown' ? 'DAD IN FULL CAMO HAS PUB MELTDOWN; TALL SON APOLOGISES TO EVERYONE' : top ? top.text : 'QUIET SHIFT AT THE OYSTERFLEET (SUSPICIOUSLY QUIET)';
  // Save progress
  if (!sh.cfg.sandbox) {
    G.save.bank = (G.save.bank || 0) + Math.round(sh.tips * 100) / 100;
    const key = sh.cfg.id;
    const score = sh.cfg.chaos ? Math.round(sh.chaos) : Math.round(sh.tips * 10 + sh.rating() * 20);
    if (!G.save.best[key] || score > G.save.best[key].score) G.save.best[key] = { score, tips: sh.tips, stars: sh.rating(), chaos: Math.round(sh.chaos) };
    const idx = SHIFTS.findIndex((x) => x.id === key);
    if (idx >= 0 && success && G.save.unlocked < idx + 2) G.save.unlocked = Math.min(SHIFTS.length, idx + 2);
  }
  writeSave();
  emit('shiftEnded', sh);
}

export function resultsSummary() {
  const sh = s();
  const titles = { time: sh.cfg.sandbox ? 'Lock-in over' : 'Shift complete!', meltdown: 'IAN HAS KICKED OFF', gentleFail: 'Not so gentle...', quit: 'Shift abandoned', 'quit-sandbox': 'Lock-in over' };
  const lines = [];
  lines.push(`📰 "${sh.headlineText}"`);
  if (sh.reason === 'meltdown') lines.push('Cutscene: Lewis stands on a chair and apologises to the entire pub. Ian is still shouting about carp.');
  if (sh.cfg.chaos) lines.push(`Chaos score: ${Math.round(sh.chaos)}`);
  else {
    lines.push(`Tips: £${sh.tips.toFixed(2)}   Pub rating: ${sh.rating().toFixed(1)}★   Chaos: ${Math.round(sh.chaos)}`);
    lines.push(`Tables served: ${sh.tablesPaid}   Walkouts: ${sh.walkouts}   Smashes: ${sh.smashes}`);
  }
  lines.push(`People thrown: ${sh.throws}   Head bonks: ${G.player.bonks}   Goals: ${sh.goals}`);
  if (sh.criticResult) lines.push(sh.criticResult === 'rave' ? 'Secret food critic: RAVE REVIEW' : 'Secret food critic: not impressed');
  if (sh.throws === 0 && !sh.cfg.chaos && sh.tablesPaid) lines.push('Gentle Giant: zero throws. Lovely.');
  else if (sh.throws > 5 && !sh.cfg.chaos) lines.push('The manager has written you up. Again.');
  if (sh.achievements.length) lines.push('Achievements: ' + sh.achievements.map((a) => ACHIEVEMENTS[a].name).join(', '));
  return { title: titles[sh.reason] || 'Shift over', lines };
}
