// Customers, tables, orders, kitchen and bar: the waiter loop.
import * as THREE from 'three';
import { G, V, rand, randi, pick, chance, clamp, weighted, emit, on, hasUpgrade } from './state.js';
import { TABLE_DEFS, FIX } from './world.js';
import { Person, PELVIS, HEAD } from './people.js';
import { Item, spawnPlate, spawnDrink } from './physics.js';
import { CUSTOMER_TYPES, DISHES, DRINKS, LINES, FRIENDS, FRIEND_LOOKS, REVIEWS, MAIN_DISHES, iconFor, isDrink, nameFor } from './data.js';
import { dynamicTexture, roundRect } from './textures.js';
import { sfx, speak } from './audio.js';

export const groups = [];
const kitchenQueue = [];

// ---------------------------------------------------------------- tables
export function initTables() {
  G.tables = [];
  for (const def of TABLE_DEFS) {
    const t = def;
    t.state = 'closed'; t.group = null; t.needs = []; t.served = []; t.order = [];
    if (!t.icon) {
      t.iconTex = dynamicTexture(256, 160);
      t.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.iconTex.tex, depthTest: false, transparent: true }));
      t.icon.renderOrder = 9;
      t.icon.scale.set(0.62, 0.39, 1);
      t.icon.position.set(t.x, 1.75, t.z);
      G.scene.add(t.icon);
    }
    t.icon.visible = false;
    t.iconDirty = true; t.iconTimer = 0;
    for (const s of t.seatList) {
      s.taken = null;
      if (s.chair) { s.chair.position.copy(s.chairHome.pos); s.chair.rotation.set(0, s.chairHome.yaw, 0); }
    }
    G.tables.push(t);
  }
}

export function openTables(ids) {
  for (const t of G.tables) {
    if (t.special) continue;
    t.state = ids.includes(t.id) ? 'free' : 'closed';
    t.group?.remove?.();
    t.icon.visible = false;
  }
}

export const tableById = (id) => G.tables.find((t) => t.id === id);

function setTableState(t, s) { t.state = s; t.iconDirty = true; }

function drawTableIcon(t) {
  const { ctx: x, tex } = t.iconTex, W = 256, H = 160;
  x.clearRect(0, 0, W, H);
  const g = t.group;
  if (t.state === 'free' || t.state === 'closed' || (!g && t.state !== 'dirty')) { t.icon.visible = false; return; }
  t.icon.visible = true;
  x.fillStyle = 'rgba(255,250,235,0.95)'; x.strokeStyle = '#3b2412'; x.lineWidth = 5;
  roundRect(x, 4, 4, W - 8, H - 8, 22); x.fill(); x.stroke();
  // Patience pint glass
  if (g) {
    const f = clamp(g.patience / g.maxPatience, 0, 1);
    x.strokeStyle = '#333'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(18, 30); x.lineTo(24, 132); x.lineTo(56, 132); x.lineTo(62, 30); x.closePath(); x.stroke();
    const top = 132 - 100 * f;
    x.fillStyle = f > 0.5 ? '#e0a020' : f > 0.25 ? '#e06a20' : '#d02020';
    x.fillRect(23, top, 34, 132 - top);
    x.fillStyle = '#fff8e7'; x.fillRect(23, top - 6, 34, 6);
  }
  x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 26px Arial';
  const label = typeof t.id === 'number' ? 'T' + t.id : (t.id === 'hollie' ? 'Hollie' : 'Ian');
  x.fillText(label, 160, 26);
  let icon = '', text = '';
  switch (t.state) {
    case 'seated': icon = '📖'; text = 'Reading menus'; break;
    case 'ready': icon = '❗'; text = 'Ready to order'; break;
    case 'ordered': icon = '🎫'; text = 'Spike the ticket'; break;
    case 'waiting': icon = ''; text = ''; break;
    case 'eating': icon = g?.photos > 0 ? '📸' : '😋'; text = g?.photos > 0 ? 'Taking photos' : 'Eating'; break;
    case 'bill': icon = '💷'; text = 'Wants the bill'; break;
    case 'dirty': icon = '🧽'; text = 'Wipe me'; break;
    case 'queue': icon = '🙋'; text = 'Seat us'; break;
  }
  if (t.state === 'waiting') {
    x.font = '40px serif';
    const n = t.needs.length;
    t.needs.slice(0, 6).forEach((id, i) => x.fillText(iconFor(id), 100 + (i % 3) * 50, 72 + Math.floor(i / 3) * 46));
    if (!n) x.fillText('✔', 160, 85);
  } else {
    x.font = '54px serif'; x.fillText(icon, 160, 76);
    x.font = 'bold 22px Arial'; x.fillText(text, 160, 128);
  }
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------- groups
let groupId = 0;
export function spawnGroup(typeKey, opts = {}) {
  const type = CUSTOMER_TYPES[typeKey];
  const size = opts.size || randi(type.size[0], type.size[1]);
  const g = {
    id: ++groupId, typeKey, type, members: [], table: null, state: 'arriving',
    maxPatience: type.patience * (hasUpgrade('charm') ? 1.15 : 1), patience: 0, mood: 70,
    thrown: 0, wrong: 0, crouched: null, critic: !!type.critic, photos: type.photos ? 6 : 0,
    eatTimer: 0, browseTimer: 0, seenFan: 0, worldies: 0, special: opts.special || null,
  };
  g.patience = g.maxPatience;
  const rules = G.shift?.rules || {};
  const friendNames = type.friends ? [...FRIENDS].sort(() => Math.random() - 0.5) : [];
  for (let i = 0; i < size; i++) {
    const isKid = type.kids && i >= 2;
    const camo = rules.everyoneIan || opts.camo;
    const name = type.friends ? friendNames[i % friendNames.length] : '';
    const look = FRIEND_LOOKS[name] || {};
    const season = G.shift?.cfg?.season;
    const costume = season === 'halloween' ? pick(['ghost', 'skeleton', 'witch', 'pumpkin', null]) : null;
    const p = new Person({
      kind: 'customer', name, tag: name || undefined, label: name,
      wide: look.wide, heavy: look.heavy, costume,
      hatType: season === 'christmas' && chance(0.7) ? 'santa' : (costume === 'witch' ? 'witch' : undefined),
      x: FIX.spawn.x + rand(-1.5, 1.5), z: FIX.spawn.z + rand(-0.3, 0.3),
      scale: isKid ? 0.62 : (look.scale || (type.scale || 1) * rand(0.94, 1.04)), headScale: isKid ? 1.25 : 1,
      shirt: camo ? undefined : opts.colors ? pick(opts.colors) : (season === 'christmas' ? pick([0xc62828, 0x2e7d32, 0xffffff]) : pick(type.colors)), camo, hat: camo ? 'camo' : undefined,
      hair: typeKey === 'pensioner' ? 0xdddddd : undefined, bald: typeKey === 'pensioner' && chance(0.4),
      glasses: typeKey === 'critic' || (typeKey === 'pensioner' && chance(0.5)),
      walkSpeed: type.walk * rand(0.9, 1.1), kitNumber: type.fan ? String(randi(1, 11)) : undefined, shortSleeves: type.fan || type.stag,
    });
    p.group = g; p.isKid = isKid;
    if (type.spectacular) p.getUpDelay = 3.2;
    p.onGetUp = () => afterGetUp(p);
    g.members.push(p);
  }
  g.leader = g.members[0];
  // Interactable: seat this group
  g.interact = {
    group: g,
    pos: () => g.leader.p[HEAD],
    radius: 2.6,
    label: () => (g.state === 'queue' ? 'Seat this group' : null),
    action: () => startFollowing(g),
  };
  G.interactables.push(g.interact);
  g.runnerInteract = {
    pos: () => g.leader.p[PELVIS], radius: 9,
    label: () => (g.state === 'runner' && G.hollie && G.hollie.available() ? 'Hollie, get them!' : null),
    action: () => G.hollie.chase(g),
  };
  G.interactables.push(g.runnerInteract);
  groups.push(g);
  walkToQueue(g);
  return g;
}

function queueSpot(g) {
  const idx = groups.filter((x) => x.state === 'queue' || x.state === 'arriving').indexOf(g);
  return FIX.queue.clone().add(V(Math.min(idx, 4) * 0.9, 0, 0));
}

function walkToQueue(g) {
  const spot = queueSpot(g);
  g.members.forEach((m, i) => {
    const off = V((i % 3) * 0.35 - 0.35, 0, Math.floor(i / 3) * 0.45 + (i % 2) * 0.1);
    m.walkTo(spot.clone().add(off), () => {
      m.faceTowards(V(-7, 0, 5));
      if (g.members.every((x) => x.state === 'stand' || x.state === 'ragdoll')) {
        if (g.state === 'arriving') { g.state = 'queue'; groupSay(g, g.type.friends ? pick(LINES.friends[g.leader.name] || LINES.greet) : 'Table for ' + g.members.length + ', please!'); emit('groupQueued', g); }
      }
    });
  });
}

function groupSay(g, text, who = 'customer', opts) {
  const m = pick(g.members.filter((x) => !x.hidden)) || g.leader;
  m.say(text, opts);
  speak(text, who);
}

function startFollowing(g) {
  g.state = 'following';
  g.followTimer = 0;
  groupSay(g, pick(['Lead the way!', 'After you, big man.', 'Follow the giant!']));
  sfx.good();
  emit('groupFollowing', g);
}

export function followingGroup() { return groups.find((g) => g.state === 'following'); }

function seatGroup(g, t) {
  g.state = 'seating'; g.table = t; t.group = g;
  setTableState(t, 'seated');
  t.needs = []; t.order = []; t.served = [];
  const seats = t.seatList.slice();
  g.members.forEach((m, i) => {
    const seat = seats[i % seats.length];
    seat.taken = m; m.seat = seat;
    m.walkTo(seat.pos, () => {
      m.sitAt(seat);
      if (g.members.every((x) => x.state === 'sit')) { g.state = 'seated'; g.browseTimer = rand(4, 7); emit('groupSeated', g); }
    });
  });
  sfx.good();
}

function freeSeatsOk(t, g) { return t.state === 'free' && t.seatList.length >= g.members.length; }

// Generate an order per member.
function makeOrder(g) {
  const order = [];
  const t = g.typeKey;
  for (const m of g.members) {
    if (g.special === 'hollie') { order.push(pick(['pancakes', 'salad', pick(MAIN_DISHES)])); order.push('water'); continue; }
    let dish = m.isKid ? 'kids' : pick(MAIN_DISHES);
    if (G.shift?.cfg?.roast && !m.isKid && chance(0.6)) dish = 'roast';
    if (t === 'pensioner' && chance(0.5)) dish = 'fish';
    order.push(dish);
    let drink = m.isKid ? 'mocktail' : weightedDrink(t);
    order.push(drink);
  }
  return order;
}
function weightedDrink(t) {
  if (t === 'stag' || t === 'fan' || t === 'friends') return weighted({ pint: 8, monster: 1, water: 0.5 });
  return weighted({ pint: 4, mocktail: 2, water: 1.2, monster: 0.5 });
}

function takeOrder(g) {
  const t = g.table;
  const crouched = G.player.isCrouched();
  g.crouched = crouched;
  if (crouched) { g.mood += 10; groupSay(g, pick(g.members.some((m) => m.isKid) ? LINES.kidGreet : LINES.crouchGreet)); }
  else { g.mood -= 10; groupSay(g, pick(LINES.lampPost)); emit('lampPost', g); }
  t.order = makeOrder(g);
  t.needs = t.order.slice();
  t.ticket = true;
  setTableState(t, 'ordered');
  sfx.blip();
  emit('orderTaken', g, crouched);
}

export function takeOrderFor(g) { takeOrder(g); }

export function spikeTickets() {
  const tabs = G.tables.filter((t) => t.state === 'ordered');
  if (!tabs.length) return false;
  for (const t of tabs) {
    setTableState(t, 'waiting');
    t.ticket = false;
    let delay = rand(5, 9);
    for (const id of t.order) if (!isDrink(id)) { kitchenQueue.push({ dish: id, table: t.id, t: delay }); delay += rand(2, 4); }
  }
  sfx.ding();
  emit('spiked', tabs);
  return true;
}

function updateKitchen(dt) {
  reconcileKitchen(dt);
  for (let i = kitchenQueue.length - 1; i >= 0; i--) {
    const k = kitchenQueue[i];
    k.t -= dt;
    if (k.t <= 0) {
      const slot = freePassSlot();
      if (!slot) { k.t = 1; continue; }
      kitchenQueue.splice(i, 1);
      const it = spawnPlate(k.dish, k.table, slot);
      it.onPass = true; it.sleeping = true;
      sfx.ding();
      emit('plateUp', it);
    }
  }
}
export function requeueDish(dish, table) { kitchenQueue.push({ dish, table, t: rand(6, 9) }); }
export function delayKitchen(sec) { kitchenQueue.forEach((k) => { k.t += sec; }); }

// Re-cook any dish that a table still needs but no longer exists anywhere (smashed, stolen by a dog...).
let reconcileTimer = 0;
function reconcileKitchen(dt) {
  reconcileTimer -= dt;
  if (reconcileTimer > 0) return;
  reconcileTimer = 2;
  const need = {}, have = {}, firstTable = {};
  for (const t of G.tables) {
    if (!t.group || (t.state !== 'waiting' && t.state !== 'eating')) continue;
    for (const id of t.needs) if (!isDrink(id)) { need[id] = (need[id] || 0) + 1; firstTable[id] ??= t.id; }
  }
  for (const it of G.items) if (it.kind === 'plate' && !it.dead && !it.frozen) have[it.dish] = (have[it.dish] || 0) + 1;
  for (const k of kitchenQueue) have[k.dish] = (have[k.dish] || 0) + 1;
  for (const id in need) for (let n = have[id] || 0; n < need[id]; n++) requeueDish(id, firstTable[id]);
}

function freePassSlot() {
  for (let x = FIX.pass.x0; x <= FIX.pass.x1; x += 0.38) {
    const p = V(x, FIX.pass.y + 0.13, FIX.pass.z);
    if (!G.items.some((it) => !it.held && it.pos.distanceTo(p) < 0.25)) return p;
  }
  return null;
}
export const passPlates = () => G.items.filter((it) => it.kind === 'plate' && it.onPass && !it.held && !it.dead);

// Deliveries: called when an item comes to rest or is dropped.
export function checkDelivery(it) {
  if (it.held || it.frozen || it.dead || (it.kind !== 'plate' && it.kind !== 'drink')) return;
  for (const t of G.tables) {
    if (!t.group && t.id !== 'ian') continue;
    if (Math.abs(it.pos.x - t.x) > t.w / 2 + 0.06 || Math.abs(it.pos.z - t.z) > t.d / 2 + 0.06) continue;
    if (it.pos.y < t.top - 0.05 || it.pos.y > t.top + 0.5) continue;
    if (t.id === 'ian') { if (!it.ianSeen) { it.ianSeen = true; emit('ianDelivery', it); } return; }
    deliver(t, it);
    return;
  }
}

function deliver(t, it) {
  const g = t.group;
  if (!g || it.rejectedBy === t) return;
  if (t.state !== 'waiting' && t.state !== 'eating' && t.state !== 'ordered') { it.rejectedBy = t; groupSay(g, 'We haven\'t ordered that!'); return; }
  const idx = t.needs.indexOf(it.id);
  if (idx < 0) {
    it.rejectedBy = t; g.wrong++; g.mood -= 12;
    groupSay(g, pick(LINES.wrong)); sfx.bad();
    emit('wrongOrder', t, it);
    return;
  }
  t.needs.splice(idx, 1);
  it.frozen = true; it.servedTo = t; it.onPass = false; it.vel.set(0, 0, 0);
  t.served.push(it);
  t.iconDirty = true;
  if (it.kind === 'drink' && it.foam > 0.5) { g.mood -= 10; groupSay(g, 'It\'s all head!'); }
  else if (it.kind === 'drink' && it.drink !== 'monster' && it.fill < 0.55) { g.mood -= 8; groupSay(g, 'Half a pint? Really?'); }
  else { g.mood += 3; if (chance(0.5)) groupSay(g, pick(LINES.happy)); }
  if (g.special === 'hollie') emit('hollieServed', it);
  if (it.dish === 'fish') emit('fishServed', t);
  sfx.good();
  emit('delivered', t, it);
  if (!t.needs.length) {
    setTableState(t, 'eating');
    g.eatTimer = rand(14, 22);
    g.members.forEach((m) => { m.eating = true; });
    if (g.photos) groupSay(g, pick(LINES.influencer));
  }
}

on('unserve', (it) => {
  const t = it.servedTo;
  if (!t) return;
  t.served = t.served.filter((x) => x !== it);
  it.servedTo = null;
  if (t.group && (t.state === 'eating' || t.state === 'waiting')) {
    t.needs.push(it.id);
    if (t.state === 'eating') { setTableState(t, 'waiting'); t.group.members.forEach((m) => { m.eating = false; }); }
    t.group.mood -= 6;
    if (!isDrink(it.id)) requeueDish(it.id, t.id);
    t.iconDirty = true;
  }
});

function payBill(g) {
  const t = g.table;
  const items = t.order.filter((x) => x !== 'water').length;
  const pf = clamp(g.patience / g.maxPatience, 0, 1);
  let tip = items * 1.6 * (0.5 + pf) * clamp(g.mood / 70, 0.2, 1.6) * g.type.tip;
  tip *= Math.pow(0.6, g.thrown) * Math.pow(0.85, g.wrong);
  if (t.order.every((x) => x === 'water' || !isDrink(x)) && t.order.includes('water') && !t.order.some((x) => isDrink(x) && x !== 'water')) tip = 0;
  if (g.special === 'hollie') tip = 0;
  tip *= g.tipBonus || 1;
  tip += g.worldies * 5;
  tip = Math.round(tip * 2) / 2;
  const stars = starsFor(g);
  emit('paid', g, tip, stars);
  sfx.cash();
  groupSay(g, tip > 0 ? `Cheers! Here's £${tip.toFixed(2)}.` : 'Just the tap water, so... no tip.');
  leave(g, false);
}

export function starsFor(g) {
  return clamp(Math.round(g.mood / 20 + (g.patience / g.maxPatience > 0.5 ? 0.4 : 0)), 1, 5);
}

export function review(stars) { return pick(REVIEWS[stars]); }

function leave(g, angry) {
  const t = g.table;
  g.state = 'leaving';
  if (t) {
    t.group = null;
    t.seatList.forEach((s) => { s.taken = null; });
    if (angry && t.seatList[0]?.chair) { const c = pick(t.seatList).chair; c.rotation.z = Math.PI / 2; c.position.y = 0.22; }
    setTableState(t, t.served.length || angry ? 'dirty' : (t.state === 'closed' ? 'closed' : 'free'));
    if (t.state === 'dirty') t.icon.visible = true;
  }
  g.members.forEach((m) => {
    m.eating = false;
    if (m.state === 'ragdoll' || m.state === 'getup') return;
    m.walkTo(FIX.spawn.clone().add(V(rand(-2, 2), 0, 0.3)), () => removeMember(m), angry && chance(0.3));
  });
}

function removeMember(m) {
  const g = m.group;
  m.destroy();
  if (g && g.members.every((x) => x.dead)) {
    g.dead = true;
    g.interact.dead = true; g.runnerInteract.dead = true;
    const i = groups.indexOf(g); if (i >= 0) groups.splice(i, 1);
  }
}

function walkout(g) {
  groupSay(g, pick(LINES.walkout), 'customer');
  sfx.groan();
  emit('walkout', g);
  leave(g, true);
}

function doRunner(g) {
  g.state = 'runner';
  groupSay(g, pick(['Leg it!', 'RUN!', 'Cheers, bye!']));
  emit('runner', g);
  const t = g.table;
  if (t) { t.group = null; t.seatList.forEach((s) => { s.taken = null; }); setTableState(t, 'dirty'); t.icon.visible = true; }
  g.members.forEach((m) => { m.eating = false; m.walkTo(FIX.spawn.clone().add(V(rand(-2, 2), 0, 0.3)), () => removeMember(m), true); });
}
export function runnerCaught(g) {
  if (g.state !== 'runner') return;
  const tip = 0;
  emit('runnerCaught', g);
  sfx.cash();
  g.state = 'leaving';
  g.members.forEach((m) => { if (m.state !== 'ragdoll') m.walkTo(FIX.spawn.clone().add(V(rand(-2, 2), 0, 0.3)), () => removeMember(m)); });
  return tip;
}

// After a thrown customer gets up.
function afterGetUp(m) {
  const g = m.group;
  if (!g || g.dead) return;
  if (g.evac) { m.walkTo(V(rand(-9, -2), 0, rand(9.4, 10.8))); return; }
  if (g.state === 'leaving' || g.state === 'runner') { m.walkTo(FIX.spawn.clone().add(V(rand(-2, 2), 0, 0.3)), () => removeMember(m), g.state === 'runner'); return; }
  if (g.typeKey === 'karen' || g.critic && g.thrown > 0) { if (g.table || g.state === 'queue') { groupSay(g, pick(LINES.karen)); walkout(g); return; } }
  if (g.state === 'queue' || g.state === 'arriving') { walkToQueue(g); return; }
  if (g.state === 'following') return;
  if (m.seat && g.table) {
    m.walkTo(m.seat.pos, () => { m.sitAt(m.seat); m.eating = g.table?.state === 'eating'; });
  }
}

on('knocked', (p, imp, source) => {
  const g = p.group;
  if (!g || !G.shift) return;
  if (source === 'ball' && g.type.fan && imp.length() > 7) { g.worldies++; p.say(pick(LINES.fan)); emit('worldie', p); return; }
  if (source === 'grab' || source === 'bowled' || source === 'ball' || source === 'item') {
    g.thrown++; g.mood -= g.type.fan && source === 'ball' ? 3 : 18;
    if (chance(0.7)) setTimeout(() => !p.dead && p.say(pick(LINES.thrown)), 300);
  }
});

// ---------------------------------------------------------------- interactables for tables / fixtures
export function registerServingInteractables() {
  for (const t of G.tables) {
    if (t.special) continue;
    G.interactables.push({
      table: t, pos: V(t.x, t.top + 0.2, t.z), radius: 2.4,
      label: () => {
        const fg = followingGroup();
        if (fg && freeSeatsOk(t, fg)) return `Seat them at table ${t.id}`;
        if (fg && t.state === 'free') return `Table ${t.id} is too small`;
        if (!t.group && t.state !== 'dirty') return null;
        switch (t.state) {
          case 'ready': return G.player.isCrouched() ? 'Take order' : 'Take order (crouch first!)';
          case 'bill': return 'Bring the card machine';
          case 'dirty': return 'Wipe table (hold)';
          case 'ordered': return 'Order taken: spike the ticket at the kitchen';
          default: return null;
        }
      },
      hold: () => (t.state === 'dirty' && !followingGroup() ? 1.0 : 0),
      action: () => {
        const fg = followingGroup();
        if (fg && freeSeatsOk(t, fg)) return seatGroup(fg, t);
        if (t.state === 'ready' && t.group) return takeOrder(t.group);
        if (t.state === 'bill' && t.group) return payBill(t.group);
        if (t.state === 'dirty') return wipeTable(t);
      },
    });
  }
  G.interactables.push({
    pos: FIX.spike, radius: 2.2,
    label: () => (G.tables.some((t) => t.state === 'ordered') ? 'Spike tickets' : null),
    action: spikeTickets,
  });
  const pourSpot = (pos, drink, label, hold) => G.interactables.push({
    pos, radius: 1.9, label: () => (G.kegOut && drink === 'pint' ? 'The keg has run out! Change it in the cellar hatch' : G.ronnie?.blockingTaps && drink === 'pint' ? 'Ronnie is stuck under a keg! Help him first' : label), hold: () => hold,
    action: () => { if ((G.ronnie?.blockingTaps || G.kegOut) && drink === 'pint') return; const it = spawnDrink(drink, pos.clone().add(V(0.15, 0.12, 0))); if (drink === 'pint') sfx.pour(); else sfx.grab(); G.player.give(it); emit('poured', it); },
    onHoldTick: (dt, hand) => G.player.pourTilt && G.player.pourTilt(dt, hand),
  });
  pourSpot(FIX.taps, 'pint', 'Pour a pint (hold)', 0.9);
  pourSpot(FIX.water, 'water', 'Tap water', 0.3);
  pourSpot(FIX.mocktail, 'mocktail', 'Mocktail (hold)', 0.6);
  pourSpot(FIX.fridge, 'monster', 'Grab a Monster', 0);
}

function wipeTable(t) {
  for (const it of t.served) it.remove();
  for (const it of G.items.slice()) if (!it.held && Math.abs(it.pos.x - t.x) < t.w / 2 + 0.1 && Math.abs(it.pos.z - t.z) < t.d / 2 + 0.1 && it.pos.y > t.top - 0.05 && it.pos.y < t.top + 0.5 && it.cls !== 'golden' && it.cls !== 'ball') it.remove();
  t.served = []; t.needs = []; t.order = [];
  for (const s of t.seatList) if (s.chair) { s.chair.position.copy(s.chairHome.pos); s.chair.rotation.set(0, s.chairHome.yaw, 0); }
  setTableState(t, G.shift.cfg.tables.includes(t.id) ? 'free' : 'closed');
  sfx.good();
  emit('wiped', t);
}

// ---------------------------------------------------------------- per-frame
export function updateServing(dt) {
  updateKitchen(dt);
  const hollieBoost = G.hollie?.happiness > 0.5 ? 0.65 : 1;
  for (const g of groups.slice()) {
    if (g.dead) continue;
    const live = g.members.filter((m) => !m.dead);
    if (!live.length || g.evac) continue;
    // Patience
    let drain = 0;
    switch (g.state) {
      case 'queue': drain = 0.6; break;
      case 'arriving': case 'following': case 'seating': drain = 0; break;
      case 'seated': drain = 0.4; g.browseTimer -= dt; if (g.browseTimer <= 0) { setTableState(g.table, 'ready'); g.state = 'ready'; } break;
      case 'ready': drain = 1; break;
    }
    const t = g.table;
    if (t && g.state !== 'leaving' && g.state !== 'runner') {
      if (t.state === 'ordered' || t.state === 'waiting') drain = 1;
      if (t.state === 'eating') {
        drain = 0;
        if (g.photos > 0) { g.photos -= dt; }
        else g.eatTimer -= dt;
        if (g.eatTimer <= 0) { setTableState(t, 'bill'); g.state = 'bill'; groupSay(g, pick(['Can we get the bill?', 'Bill please!', 'Card machine, mate?'])); }
      }
      if (t.state === 'bill') drain = 1.2;
    }
    if (g.state === 'following') {
      g.followTimer -= dt;
      if (g.followTimer <= 0) {
        g.followTimer = 0.7;
        const pp = G.player.pos, back = G.player.backDir();
        g.members.forEach((m, i) => {
          if (m.state === 'ragdoll' || m.state === 'getup') return;
          const tgt = pp.clone().addScaledVector(back, 1.0 + Math.floor(i / 2) * 0.6).add(V((i % 2) * 0.5 - 0.25, 0, 0));
          if (m.root.distanceTo(tgt) > 0.6) m.walkTo(tgt, () => m.faceTowards(G.player.pos));
        });
      }
    }
    const typeDrain = g.type.drain || 1;
    g.patience -= dt * drain * typeDrain * hollieBoost * (G.shift?.cfg?.sandbox ? 0.6 : 1);
    if (drain && g.patience < g.maxPatience * 0.3 && !g.warned) { g.warned = true; groupSay(g, g.typeKey === 'karen' ? pick(LINES.karen) : pick(LINES.annoyed)); }
    if (g.patience <= 0 && drain) {
      if (g.state === 'bill' && chance(0.6)) doRunner(g); else walkout(g);
    }
    // Type flavour
    if (g.type.loud && chance(dt * 0.08) && g.table) groupSay(g, pick(LINES.stag), 'customer', { dur: 2.5 });
    if (g.typeKey === 'pensioner' && chance(dt * 0.02) && g.table) groupSay(g, pick(LINES.pensioner));
    if (g.type.friends && chance(dt * 0.03) && g.table) { const m = pick(live); const line = pick(LINES.friends[m.name] || LINES.greet); m.say(line); speak(line, m.name); }
  }
  // Table icons
  for (const t of G.tables) {
    t.iconTimer -= dt;
    if (t.iconDirty || (t.group && t.iconTimer <= 0)) { drawTableIcon(t); t.iconDirty = false; t.iconTimer = 0.4; }
  }
  // Deliveries for items that came to rest on tables
  for (const it of G.items) if (!it.held && !it.frozen && (it.kind === 'plate' || it.kind === 'drink') && it.vel.lengthSq() < 0.05 && it.age > 0.2) checkDelivery(it);
}

export function clearServing() {
  for (const g of groups.slice()) { g.members.forEach((m) => m.destroy()); g.interact.dead = true; g.runnerInteract.dead = true; }
  groups.length = 0; kitchenQueue.length = 0;
}

export function freeTableCount() { return G.tables.filter((t) => t.state === 'free').length; }
export function activeGroupCount() { return groups.filter((g) => g.state !== 'leaving' && g.state !== 'runner' && !g.dead).length; }

// Pick a customer type for the shift
export function pickType(cfg) {
  const w = Object.assign({}, cfg.types);
  if (G.shift.criticSpawned) delete w.critic;
  const k = weighted(w);
  if (k === 'critic') G.shift.criticSpawned = true;
  return k;
}
