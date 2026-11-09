// Boot: renderer, menus, WebXR session, main loop.
import * as THREE from 'three';
import { G, loadSave, writeSave, on, emit } from './state.js';
import { SHIFTS, MODES, UPGRADES, ACHIEVEMENTS, COSMETICS, FRIENDS } from './data.js';
import { buildWorld, updateWorld, setTimeOfDay, setMixedReality } from './world.js';
import { takePhoto, loadPhotos } from './toys.js';
import { initVoices, renderStudio } from './voice.js';
import { startReplay, updateReplay, hasReplay } from './replay.js';
import { hasUpgrade } from './state.js';
import { createPlayer, setupInput, setupTouch, attachHands, releasePointer, applyCosmetics } from './player.js';
import { initHUD, setVRHud, showPanel, hidePanel, updateHUD } from './hud.js';
import { startShift, updateGame, renderPeople, endShift, resultsSummary, cfgFor } from './game.js';
import { initAudio, sfx, setAmbience } from './audio.js';

const $ = (id) => document.getElementById(id);
let xrSupported = false, arSupported = false;
let pendingShift = null;

function init() {
  loadSave();
  window.LEWIS = G; // handy for debugging from the browser console
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation?.(1);
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 150);
  G.rig = new THREE.Group();
  G.rig.add(G.camera);
  G.scene.add(G.rig);
  G.dynamicRoot = new THREE.Group();
  G.scene.add(G.dynamicRoot);

  buildWorld();
  setTimeOfDay(13);
  createPlayer();
  initHUD();
  setupInput(canvas);
  setupTouch();

  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => { xrSupported = ok; renderMenu(); }).catch(() => {});
    navigator.xr.isSessionSupported('immersive-ar').then((ok) => { arSupported = ok; }).catch(() => {});
  }

  on('requestPause', () => { if (G.mode === 'playing') pause(); });
  on('shiftEnded', () => showResults());

  initVoices();
  renderMenu();
  showScreen('menu');

  const clock = new THREE.Clock();
  let menuT = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05) * (G.debugSpeed || 1);
    if (G.mode === 'playing') updateGame(dt);
    else if (G.mode === 'menu') {
      // Attract-mode camera drifting around the pub
      menuT += dt * 0.08;
      G.rig.position.set(Math.sin(menuT) * 5, 0, 2 + Math.cos(menuT) * 3);
      G.rig.rotation.set(0, menuT * 0.6 + Math.PI * 0.1, 0);
      G.camera.position.set(0, 2.1, 0); G.camera.rotation.set(-0.12, 0, 0);
    } else if (G.mode === 'replay') {
      if (!updateReplay(dt)) { G.mode = 'results'; showResults(); }
    } else if (G.xr) vrPanelInput();
    if (G.mode !== 'menu') updateHUD(0);
    renderPeople();
    updateWorld(performance.now() / 1000);
    renderer.render(G.scene, G.camera);
    if (G.photoRequest) takePhoto();
    if (!G.xr && G.mode === 'playing' && hasUpgrade('pad') && G.ronnie && !G.ronnie.p.hidden) ronnieCam(renderer);
  });
}

// ---------------------------------------------------------------- screens
function showScreen(name) {
  for (const id of ['menu', 'pause', 'results', 'chooser']) $(id).classList.toggle('show', id === name);
  const playing = name === null;
  // Not in VR: always show the on-screen joystick + buttons (keyboard/mouse still work too).
  $('hud').style.display = playing && !G.xr ? 'block' : 'none';
  $('crosshair').style.display = playing && !G.xr ? 'block' : 'none';
  $('touch').style.display = playing && !G.xr ? 'block' : 'none';
}

function renderMenu() {
  const save = G.save;
  const found = Object.keys(save.oysters).length;
  let html = `
    <h1>Lewis Simulator</h1>
    <h2>Oysterfleet Shift</h2>
    <p class="tag">You're Lewis: a very tall waiter trying to survive one chaotic shift. Serve the tables, keep Dad calm, stop Ronnie "helping".</p>
    <div class="row stats"><span>Tips banked: <b>£${(save.bank || 0).toFixed(2)}</b></span><span>Golden oysters: <b>${found}/7</b></span><span>Keepie record: <b>${save.keepieRecord || 0}</b></span><span>Golden Boot: <b>${save.goldenBoot || 0}</b></span></div>
    <h3>One Week at the Oysterfleet</h3><div class="grid">`;
  SHIFTS.forEach((sh, i) => {
    const locked = i + 1 > save.unlocked;
    const best = save.best[sh.id];
    html += `<button class="card ${locked ? 'locked' : ''}" data-shift="${sh.id}" ${locked ? 'disabled' : ''}>
      <span class="day">${sh.day}</span><b>${sh.name}</b><small>${locked ? '🔒 Finish the previous shift' : sh.twist}</small>
      ${best ? `<em>Best: £${best.tips.toFixed(2)} · ${best.stars.toFixed(1)}★</em>` : ''}</button>`;
  });
  const card = (m) => { const best = save.best[m.id]; return `<button class="card" data-shift="${m.id}"><span class="day">${m.day}</span><b>${m.name}</b><small>${m.twist}</small>${best && m.chaos ? `<em>Best: ${best.chaos}</em>` : ''}</button>`; };
  html += `</div><h3>Mini-games</h3><div class="grid">${['pubcup', 'penalties', 'trickshots', 'fivek', 'datenight', 'showdown'].map((k) => card(MODES[k])).join('')}</div>`;
  html += `<h3>Seasonal shifts</h3><div class="grid">${['christmas', 'halloween', 'bbq'].map((k) => card(MODES[k])).join('')}</div>`;
  html += `<h3>Other modes</h3><div class="grid">`;
  for (const m of ['sandbox', 'gentle', 'chaos', 'special'].map((k) => MODES[k])) {
    const best = save.best[m.id];
    html += `<button class="card" data-shift="${m.id}"><span class="day">${m.day}</span><b>${m.name}</b><small>${m.twist}</small>${best && m.chaos ? `<em>Best: ${best.chaos}</em>` : ''}</button>`;
  }
  html += `</div>
    <div class="row">
      <button class="btn" id="bUpgrades">Staff room (upgrades)</button>
      <button class="btn" id="bAch">Achievements</button>
      <button class="btn" id="bWardrobe">Wardrobe</button>
      <button class="btn" id="bPhotos">Photos</button>
      <button class="btn" id="bVoices">Voice studio</button>
      <button class="btn" id="bCredits">Credits</button>
      <button class="btn" id="bSettings">Settings</button>
      <button class="btn" id="bHelp">How to play</button>
    </div>
    <div id="panel"></div>
    <p class="foot">${xrSupported ? '🥽 VR headset detected: pick a shift, then "Enter VR".' : 'Open this page in the Meta Quest browser to play in VR. Works on iPad, phone and desktop too.'}</p>`;
  $('menu').innerHTML = `<div class="inner">${html}</div>`;
  $('menu').querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.shift)));
  $('bUpgrades').onclick = () => panel('upgrades');
  $('bAch').onclick = () => panel('ach');
  $('bSettings').onclick = () => panel('settings');
  $('bWardrobe').onclick = () => panel('wardrobe');
  $('bPhotos').onclick = () => panel('photos');
  $('bVoices').onclick = () => panel('voices');
  $('bCredits').onclick = () => panel('credits');
  $('bHelp').onclick = () => panel('help');
}

function panel(which) {
  const p = $('panel');
  if (p.dataset.open === which) { p.innerHTML = ''; p.dataset.open = ''; return; }
  p.dataset.open = which;
  if (which === 'upgrades') {
    p.innerHTML = `<h3>Staff room upgrades · £${(G.save.bank || 0).toFixed(2)} to spend</h3><div class="grid">` + UPGRADES.map((u) => {
      const owned = G.save.upgrades[u.id];
      return `<button class="card" data-up="${u.id}" ${owned || G.save.bank < u.cost ? 'disabled' : ''}><b>${u.name}</b><small>${u.desc}</small><em>${owned ? '✔ Owned' : '£' + u.cost}</em></button>`;
    }).join('') + '</div>';
    p.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => {
      const u = UPGRADES.find((x) => x.id === b.dataset.up);
      if (G.save.bank >= u.cost && !G.save.upgrades[u.id]) { G.save.bank -= u.cost; G.save.upgrades[u.id] = true; writeSave(); initAudio(); sfx.cash(); renderMenu(); panel('upgrades'); }
    });
  } else if (which === 'wardrobe') {
    const sel = Object.assign({ apron: 'apron-green', shirt: 'shirt-white', hat: 'hat-none' }, G.save.cosmetics || {});
    const owned = G.save.owned || {};
    p.innerHTML = `<h3>Wardrobe · £${(G.save.bank || 0).toFixed(2)} to spend</h3><p>Look down to see your apron and shirt. Take a selfie with the disposable camera to see your hat.</p><div class="grid">` + COSMETICS.map((c) => {
      const has = c.cost === 0 || owned[c.id], on = sel[c.slot] === c.id;
      return `<button class="card" data-cos="${c.id}" ${!has && G.save.bank < c.cost ? 'disabled' : ''}><span class="day">${c.slot.toUpperCase()}</span><b>${c.name}</b><em>${on ? '✔ Wearing' : has ? 'Tap to wear' : '£' + c.cost}</em></button>`;
    }).join('') + '</div>';
    p.querySelectorAll('[data-cos]').forEach((b) => b.onclick = () => {
      const c = COSMETICS.find((x) => x.id === b.dataset.cos);
      G.save.owned ||= {}; G.save.cosmetics ||= {};
      if (c.cost && !G.save.owned[c.id]) { if (G.save.bank < c.cost) return; G.save.bank -= c.cost; G.save.owned[c.id] = true; initAudio(); sfx.cash(); }
      G.save.cosmetics[c.slot] = c.id; writeSave(); applyCosmetics(); renderMenu(); panel('wardrobe');
    });
  } else if (which === 'photos') {
    const photos = loadPhotos();
    p.innerHTML = '<h3>Photos (disposable camera)</h3>' + (photos.length ? '<div class="grid">' + photos.map((u, i) => `<a href="${u}" download="oysterfleet-${i + 1}.jpg"><img src="${u}" style="width:100%;border-radius:10px;border:3px solid #e8c96a"></a>`).join('') + '</div><p class="foot">Tap a photo to download it.</p>' : '<p>No photos yet. Grab the yellow disposable camera from the host stand and press USE (trigger in VR, G on keyboard). Turn it round for a selfie.</p>');
  } else if (which === 'voices') {
    renderStudio(p);
  } else if (which === 'credits') {
    p.innerHTML = creditsHTML();
  } else if (which === 'ach') {
    p.innerHTML = '<h3>Achievements</h3><ul class="ach">' + Object.entries(ACHIEVEMENTS).map(([id, a]) => `<li class="${G.save.achievements[id] ? 'got' : ''}">${G.save.achievements[id] ? '🏆' : '🔒'} <b>${a.name}</b>: ${a.desc}</li>`).join('') + '</ul>';
  } else if (which === 'settings') {
    const opts = [
      ['normalHeight', 'Normal height (accessibility: no crouching needed, no head bonks)'],
      ['seated', 'Seated mode (VR: still gives the tall view)'],
      ['leftHanded', 'Left-handed (swap controller roles)'],
      ['smoothTurn', 'Smooth turning (VR; default is snap turn)'],
      ['voices', 'Character voices (browser text-to-speech)'],
      ['sfx', 'Sound effects'],
    ];
    p.innerHTML = '<h3>Settings</h3>' + opts.map(([k, l]) => `<label class="opt"><input type="checkbox" data-set="${k}" ${G.settings[k] ? 'checked' : ''}> ${l}</label>`).join('') +
      '<p><button class="btn small" id="bReset">Reset save data</button></p>';
    p.querySelectorAll('[data-set]').forEach((c) => c.onchange = () => { G.settings[c.dataset.set] = c.checked; writeSave(); });
    $('bReset').onclick = () => { if (confirm('Wipe all progress?')) { localStorage.clear(); location.reload(); } };
  } else if (which === 'help') {
    p.innerHTML = `<h3>How to play</h3>
      <p>Seat groups from the front door, take orders (crouch first!), spike tickets at the kitchen, pour drinks at the bar, carry plates from the pass, take the bill, wipe the table. Every table has a pint-glass patience meter. Keep Ian's Kick-Off meter down (pints, a crouched chat, fishing on the TV, or carry him out to the beer garden). Ronnie will "help".</p>
      <table>
        <tr><th>Action</th><th>Quest 3</th><th>Keyboard + mouse</th><th>Touch</th></tr>
        <tr><td>Move / turn</td><td>Left stick / right stick</td><td>WASD + mouse</td><td>Left stick + drag right side</td></tr>
        <tr><td>Crouch (toggle)</td><td>B (tap)</td><td>C</td><td>CROUCH</td></tr>
        <tr><td>Deep crouch</td><td>Hold B</td><td>Hold V</td><td>-</td></tr>
        <tr><td>Grab / drop</td><td>Grip (either hand)</td><td>Left click (right hand), Q (left hand)</td><td>GRAB</td></tr>
        <tr><td>Throw</td><td>Swing + release grip</td><td>Right click, or flick the mouse and click</td><td>THROW</td></tr>
        <tr><td>Talk / use</td><td>A or trigger</td><td>E (hold for pour/wipe)</td><td>TALK</td></tr>
        <tr><td>Use held item (camera, sauce, extinguisher, mic)</td><td>Trigger</td><td>G or middle click</td><td>USE</td></tr>
        <tr><td>Kick the football</td><td>Swing a controller low and fast</td><td>F</td><td>KICK</td></tr>
        <tr><td>Header</td><td>Lean your head into the ball</td><td>F when the ball is high</td><td>KICK</td></tr>
        <tr><td>Sprint</td><td>Click left stick</td><td>Shift</td><td>RUN</td></tr>
        <tr><td>Radio Ronnie</td><td>X</td><td>R</td><td>RONNIE</td></tr>
        <tr><td>Pause</td><td>Y</td><td>Esc / P</td><td>II</td></tr>
      </table>
      <p>Tips: you can stack up to 3 plates per hand. Pints slosh if you rush. Hand Ronnie a Monster to make him useful. Hollie is fast: she dodges. Kick the ball at the TV to change the channel.</p>`;
  }
}

function choose(id) {
  initAudio();
  pendingShift = id;
  const cfg = cfgFor(id);
  G.touch = true; // on-screen controls whenever we're not in VR
  G.finePointer = matchMedia('(pointer: fine)').matches && navigator.maxTouchPoints === 0;
  $('chooser').innerHTML = `<div class="inner small">
    <h2>${cfg.day} · ${cfg.name}</h2><p>${cfg.twist}</p>
    ${xrSupported ? '<button class="btn big" id="bVR">🥽 Enter VR</button>' : ''}
    ${arSupported ? '<button class="btn big" id="bMR">🛋 Mixed reality (the pub in your living room)</button>' : ''}
    <button class="btn big" id="bFlat">${G.finePointer ? '🖥 Play on this screen' : '📱 Play on this screen (touch controls)'}</button>
    <button class="btn" id="bBack">Back</button>
    ${!xrSupported ? '<p class="foot">VR needs the Quest browser (or another WebXR browser) over https.</p>' : ''}</div>`;
  showScreen('chooser');
  if ($('bVR')) $('bVR').onclick = () => enterVR(id);
  if ($('bMR')) $('bMR').onclick = () => enterVR(id, true);
  $('bFlat').onclick = () => playFlat(id);
  $('bBack').onclick = () => { showScreen('menu'); G.mode = 'menu'; };
}

function playFlat(id) {
  G.xr = false;
  setVRHud(false);
  showScreen(null);
  startShift(id);
  if (G.finePointer) $('c').requestPointerLock?.();
}

async function enterVR(id, mixed = false) {
  try {
    attachHands(); // create controller grips before the session so we catch their 'connected' events
    const session = await navigator.xr.requestSession(mixed ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    G.mr = mixed;
    session.addEventListener('end', () => {
      if (G.mr) { setMixedReality(false); G.mr = false; }
      G.xr = false; setVRHud(false); hidePanel();
      G.camera.position.set(0, 2.05, 0); G.camera.rotation.set(0, 0, 0);
      toMenu();
    });
    await G.renderer.xr.setSession(session);
    G.xr = true;
    attachHands();
    setVRHud(true);
    showScreen(null);
    $('hud').style.display = 'none';
    startShift(id);
  } catch (e) {
    alert('Could not start VR: ' + e.message);
  }
}

function toMenu() {
  G.mode = 'menu';
  releasePointer();
  hidePanel();
  setAmbience(0);
  renderMenu();
  showScreen('menu');
}

function exitToMenu() {
  if (G.xr) { G.renderer.xr.getSession()?.end(); return; } // 'end' handler goes to menu
  toMenu();
}

// ---------------------------------------------------------------- pause + results
function pause() {
  G.mode = 'paused';
  releasePointer();
  if (G.xr) { prevBtns = null; showPanel('Paused', [`${G.shift.cfg.day} · ${G.shift.cfg.name}`, 'Take a breather. Ian is still watching.'], 'A: resume   ·   B: quit to menu'); return; }
  $('pause').innerHTML = `<div class="inner small"><h2>Paused</h2>
    <button class="btn big" id="pResume">Resume</button>
    <button class="btn" id="pRestart">Restart shift</button>
    <button class="btn" id="pQuit">${G.shift.cfg.sandbox ? 'End lock-in' : 'Quit to menu'}</button></div>`;
  showScreen('pause');
  $('pResume').onclick = resume;
  $('pRestart').onclick = () => { showScreen(null); startShift(G.shiftId); if (G.finePointer) $('c').requestPointerLock?.(); };
  $('pQuit').onclick = () => { if (G.shift.cfg.sandbox) { G.mode = 'playing'; endShift('quit-sandbox'); } else toMenu(); };
}
function resume() {
  hidePanel();
  G.mode = 'playing';
  showScreen(null);
  if (!G.xr && G.finePointer) $('c').requestPointerLock?.();
}

function nextShiftId() {
  const i = SHIFTS.findIndex((x) => x.id === G.shiftId);
  if (i >= 0 && i + 1 < SHIFTS.length && G.save.unlocked > i + 1) return SHIFTS[i + 1].id;
  return null;
}

function showResults() {
  const r = resultsSummary();
  const next = nextShiftId();
  if (G.shift.credits) r.lines.push('🧾 Credits roll as a bar tab: see Credits in the main menu.');
  if (G.xr) { prevBtns = null; showPanel(r.title, r.lines, `${next ? 'A: next shift · ' : ''}B: replay · ${hasReplay() ? 'X: replay throw · ' : ''}Y: menu`); return; }
  $('results').innerHTML = `<div class="inner small"><h2>${r.title}</h2>${r.lines.map((l) => `<p>${l}</p>`).join('')}
    ${next ? '<button class="btn big" id="rNext">Next shift</button>' : ''}
    ${hasReplay() ? '<button class="btn" id="rTheatre">🎬 Replay best throw</button>' : ''}
    ${G.shift.credits ? `<div class="credits">${creditsHTML()}</div>` : ''}
    <button class="btn" id="rReplay">Replay shift</button><button class="btn" id="rMenu">Menu</button></div>`;
  showScreen('results');
  if ($('rNext')) $('rNext').onclick = () => { showScreen(null); startShift(next); if (G.finePointer) $('c').requestPointerLock?.(); };
  $('rReplay').onclick = () => { showScreen(null); startShift(G.shiftId); if (G.finePointer) $('c').requestPointerLock?.(); };
  $('rMenu').onclick = toMenu;
  if ($('rTheatre')) $('rTheatre').onclick = () => { showScreen(null); $('hud').style.display = 'none'; startReplay(); };
}

// VR: answer panels with controller buttons
let prevBtns = null;
function vrPanelInput() {
  const session = G.renderer.xr.getSession();
  if (!session) return;
  const now = {};
  for (const s of session.inputSources) {
    if (!s.gamepad) continue;
    const pre = s.handedness === 'left' ? 'L' : 'R';
    s.gamepad.buttons.forEach((b, i) => { now[pre + i] = b.pressed; });
  }
  if (!prevBtns) { prevBtns = now; return; }
  const edge = (k) => now[k] && !prevBtns[k];
  if (G.mode === 'paused') {
    if (edge('R4') || edge('L5')) resume();
    else if (edge('R5')) exitToMenu();
  } else if (G.mode === 'results') {
    const next = nextShiftId();
    if (edge('R4') && next) { hidePanel(); startShift(next); }
    else if (edge('R5') || (edge('R4') && !next)) { hidePanel(); startShift(G.shiftId); }
    else if (edge('L5')) exitToMenu();
    else if (edge('L4') && hasReplay()) { hidePanel(); startReplay(); }
  }
  prevBtns = now;
}

// Credits roll as a bar tab listing everyone in the friend group.
function creditsHTML() {
  const rows = [['Lewis', 'Very tall waiter', 'Head bonks'], ['Ronnie', 'The "helper"', '6 smashed plates'], ['Hollie', 'Girlfriend, 5K runner', '1 protein bar'], ['Ian', 'Dad. Full camo.', '14 pints + 1 fish'],
    ...FRIENDS.map((f) => [f, 'Customer / cameo', 'Tap water (no tip)']), ['Chef', 'Head chef', 'Shouting'], ['Big Dave, Sandra, Old Pete', 'Regulars', 'OHHHH!']];
  return `<div class="tab"><h3>THE OYSTERFLEET · BAR TAB</h3><table>${rows.map(([n, r, i]) => `<tr><td><b>${n}</b></td><td>${r}</td><td>${i}</td></tr>`).join('')}</table><p>TOTAL: one week survived. Service not included. Mind your head on the way out.</p></div>`;
}

// Ronnie Cam (better order pad upgrade, flat screen): picture-in-picture of what Ronnie is ruining.
let rcam = null;
function ronnieCam(renderer) {
  if (!rcam) rcam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 60);
  const r = G.ronnie.p;
  rcam.position.copy(r.root).add(r.fwd.clone().multiplyScalar(2.2)).add(new THREE.Vector3(0, 2.4, 0));
  rcam.lookAt(r.p[2]);
  const w = Math.min(260, window.innerWidth * 0.3), h = w / 1.5;
  const x = window.innerWidth - w - 12, y = 12;
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
  renderer.render(G.scene, rcam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
}

init();
