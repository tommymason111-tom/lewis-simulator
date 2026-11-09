// HUD: order pad / meters (wrist in VR, corner on screen), prompts, toasts, VR panels.
import * as THREE from 'three';
import { G, clamp, on } from './state.js';
import { makeCanvas, roundRect, wrapText } from './textures.js';
import { iconFor } from './data.js';
import { hasUpgrade } from './state.js';

let hudC, hudX, hudTex, hudMesh;
let promptC, promptX, promptTex, promptMesh;
let toastC, toastX, toastTex, toastMesh;
let panelC, panelX, panelTex, panelMesh;
let blurMesh;
const toasts = [];
let toastTimer = 0, current = null;

export function initHUD() {
  hudC = makeCanvas(640, 420); hudX = hudC.getContext('2d');
  hudC.id = 'hudCanvas';
  document.getElementById('hud').appendChild(hudC);
  hudTex = new THREE.CanvasTexture(hudC); hudTex.colorSpace = THREE.SRGBColorSpace;
  hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.1575), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false }));
  hudMesh.renderOrder = 20;

  promptC = makeCanvas(768, 110); promptX = promptC.getContext('2d');
  promptC.id = 'promptCanvas';
  document.getElementById('hud').appendChild(promptC);
  promptTex = new THREE.CanvasTexture(promptC); promptTex.colorSpace = THREE.SRGBColorSpace;
  promptMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.1), new THREE.MeshBasicMaterial({ map: promptTex, transparent: true, depthTest: false }));
  promptMesh.renderOrder = 21;

  toastC = makeCanvas(900, 130); toastX = toastC.getContext('2d');
  toastC.id = 'toastCanvas';
  document.getElementById('hud').appendChild(toastC);
  toastTex = new THREE.CanvasTexture(toastC); toastTex.colorSpace = THREE.SRGBColorSpace;
  toastMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.13), new THREE.MeshBasicMaterial({ map: toastTex, transparent: true, depthTest: false }));
  toastMesh.renderOrder = 21;

  panelC = makeCanvas(1024, 768); panelX = panelC.getContext('2d');
  panelTex = new THREE.CanvasTexture(panelC); panelTex.colorSpace = THREE.SRGBColorSpace;
  panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, depthTest: false }));
  panelMesh.renderOrder = 30; panelMesh.visible = false;
  G.scene.add(panelMesh);

  blurMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false }));
  blurMesh.renderOrder = 40;
  G.camera.add(blurMesh);
  G.camera.add(promptMesh); promptMesh.position.set(0, -0.28, -0.8);
  G.camera.add(toastMesh); toastMesh.position.set(0, 0.25, -0.9);
}

export function toast(text, dur = 3) { toasts.push({ text, dur }); if (toasts.length > 6) toasts.shift(); }
export function clearToasts() { toasts.length = 0; current = null; }
G.toast = toast;

// Attach HUD to left wrist in VR, hide DOM version.
export function setVRHud(on) {
  document.getElementById('hud').style.display = on ? 'none' : 'block';
  if (on) {
    const left = G.hands[G.settings.leftHanded ? 1 : 0];
    left.mesh.add(hudMesh);
    hudMesh.position.set(0, 0.06, 0.12); hudMesh.rotation.set(-1.0, 0, 0);
    promptMesh.visible = true; toastMesh.visible = true;
  } else {
    hudMesh.parent && hudMesh.parent.remove(hudMesh);
    promptMesh.visible = false; toastMesh.visible = false;
  }
}

const fmtTime = (s) => (s === Infinity ? '∞' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

let hudTimer = 0;
export function updateHUD(dt) {
  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.2; drawHUD(); }
  drawPrompt();
  // Toasts
  if (current) { toastTimer -= dt; if (toastTimer <= 0) current = null; }
  if (!current && toasts.length) { current = toasts.shift(); toastTimer = current.dur; drawToast(); }
  if (!current) { toastX.clearRect(0, 0, 900, 130); toastTex.needsUpdate = true; toastC.style.opacity = 0; } else toastC.style.opacity = 1;
  // Bonk blur
  const b = clamp(G.player?.blur || 0, 0, 1);
  blurMesh.material.opacity = G.xr ? b * 0.55 : 0;
  const c = document.getElementById('c');
  c.style.filter = !G.xr && b > 0 ? `blur(${(b * 5).toFixed(1)}px)` : '';
}

function drawHUD() {
  const x = hudX, W = 640, H = 420, s = G.shift;
  if (!s) return;
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(20,28,22,0.82)'; roundRect(x, 2, 2, W - 4, H - 4, 24); x.fill();
  x.strokeStyle = '#e8c96a'; x.lineWidth = 3; roundRect(x, 2, 2, W - 4, H - 4, 24); x.stroke();
  x.textBaseline = 'top'; x.textAlign = 'left';
  x.fillStyle = '#e8c96a'; x.font = 'bold 26px Georgia';
  x.fillText(`${s.cfg.day} · ${s.cfg.name}`, 18, 14);
  x.textAlign = 'right'; x.fillStyle = s.timeLeft < 30 ? '#ff7a6a' : '#fff';
  x.fillText(fmtTime(s.timeLeft), W - 18, 14);
  x.textAlign = 'left'; x.font = 'bold 30px Arial'; x.fillStyle = '#9be59b';
  if (s.cfg.chaos) { x.fillStyle = '#ffb74d'; x.fillText(`CHAOS ${Math.round(s.chaos)}  x${s.combo.toFixed(1)}`, 18, 50); }
  else {
    x.fillText(`£${s.tips.toFixed(2)}`, 18, 50);
    x.fillStyle = '#ffd54f'; x.fillText(stars(s.rating()), 170, 50);
    x.fillStyle = '#ffb74d'; x.font = 'bold 24px Arial'; x.fillText(`Chaos ${Math.round(s.chaos)}`, 360, 54);
  }
  let y = 92;
  const extraLines = G.hudExtra ? G.hudExtra() : [];
  for (const l of extraLines) { x.font = 'bold 22px Arial'; x.fillStyle = '#ffe082'; x.fillText(wrapText(x, l, W - 36)[0], 18, y); y += 28; }
  // Ian meter (fishing float)
  if (G.ian && s.cfg.ianRate > 0) {
    const m = G.ian.meter / 100;
    x.font = 'bold 22px Arial'; x.fillStyle = '#ddd'; x.fillText(`🎣 Ian: ${G.ian.levelName}`, 18, y);
    bar(x, 250, y + 2, 370, 22, m, m < 0.5 ? '#7cb342' : m < 0.75 ? '#ffa000' : '#e53935');
    y += 32;
  }
  if (G.hollie) {
    const hh = G.hollie;
    x.fillStyle = '#ddd'; x.font = 'bold 22px Arial';
    x.fillText(hh.offended > 0 ? `💔 Hollie: ignoring you (${Math.ceil(hh.offended)}s)` : `❤ Hollie${hh.happiness > 0.5 ? ' (calming tables)' : ''}`, 18, y);
    if (!(hh.offended > 0)) bar(x, 400, y + 2, 220, 22, hh.happiness, '#ff6f9a');
    y += 32;
  }
  if (G.ronnie) {
    x.fillStyle = '#cfe8cf'; x.font = '21px Arial';
    const st = wrapText(x, `💪 Ronnie: ${G.ronnie.status}`, W - 36)[0];
    x.fillText(st, 18, y); y += 30;
  }
  // Order pad
  x.fillStyle = '#fff'; x.font = 'bold 22px Arial'; x.fillText('Order pad', 18, y); y += 28;
  const rows = G.tables.filter((t) => t.group && ['ready', 'ordered', 'waiting', 'bill'].includes(t.state) || t.state === 'dirty');
  rows.sort((a, b) => (a.group ? a.group.patience / a.group.maxPatience : 2) - (b.group ? b.group.patience / b.group.maxPatience : 2));
  x.font = '22px Arial';
  const queued = (G.groupsRef || []).filter((g) => g.state === 'queue').length;
  if (queued) { x.fillStyle = '#ffcc80'; x.fillText(`🙋 ${queued} group${queued > 1 ? 's' : ''} waiting at the door`, 18, y); y += 27; }
  for (const t of rows.slice(0, 5)) {
    if (y > H - (s.hint || s.tutHint ? 118 : 60)) break;
    const id = typeof t.id === 'number' ? 'T' + t.id : 'Hollie';
    let txt = '';
    if (t.state === 'ready') txt = 'take order';
    else if (t.state === 'ordered') txt = 'spike ticket';
    else if (t.state === 'waiting') txt = t.needs.map(iconFor).join(' ');
    else if (t.state === 'bill') txt = '💷 bill';
    else if (t.state === 'dirty') txt = '🧽 wipe';
    x.fillStyle = '#eee'; x.fillText(`${id}: ${txt}`, 18, y);
    if (t.group && (hasUpgrade('pad') || true)) {
      const f = clamp(t.group.patience / t.group.maxPatience, 0, 1);
      bar(x, 470, y + 3, 150, 16, f, f > 0.5 ? '#e0a020' : f > 0.25 ? '#e06a20' : '#d02020');
    }
    y += 27;
  }
  // Bottom line
  x.font = 'bold 20px Arial';
  x.fillStyle = G.player.isCrouched() ? '#9be59b' : '#ffcc80';
  x.fillText(G.player.isCrouched() ? '▼ CROUCHED' : '▲ STANDING (very tall)', 18, H - 32);
  x.fillStyle = '#ccc';
  const extra = [];
  if (G.player.keepie > 0) extra.push(`⚽ ${G.player.keepie}`);
  extra.push(`Bonks ${G.player.bonks}`);
  x.textAlign = 'right'; x.fillText(extra.join('   '), W - 18, H - 32);
  bar(x, 250, H - 28, 120, 10, G.player.stamina, '#4fc3f7');
  const hintText = s.hint || s.tutHint;
  if (hintText) {
    x.font = 'bold 20px Arial';
    const hl = wrapText(x, hintText, W - 40).slice(0, 2);
    const bh = 12 + hl.length * 24;
    x.textAlign = 'center'; x.fillStyle = 'rgba(232,201,106,0.97)'; roundRect(x, 10, H - 40 - bh, W - 20, bh, 10); x.fill();
    x.fillStyle = '#1d2b22';
    hl.forEach((l, i) => x.fillText(l, W / 2, H - 40 - bh + 7 + i * 24));
  }
  hudTex.needsUpdate = true;
}

function bar(x, a, b, w, h, f, col) {
  x.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(x, a, b, w, h, h / 2); x.fill();
  x.fillStyle = col; roundRect(x, a, b, Math.max(h, w * clamp(f, 0, 1)), h, h / 2); x.fill();
}

let lastPrompt = '';
function drawPrompt() {
  const p = G.player;
  const t = p.target;
  const key = G.xr ? 'A' : (G.finePointer ? 'E' : 'TALK');
  const text = t ? `[${key}] ${t.label}` : '';
  const prog = p.holdProgress;
  const sig = text + prog.toFixed(2);
  if (sig === lastPrompt) return;
  lastPrompt = sig;
  const x = promptX, W = 768, H = 110;
  x.clearRect(0, 0, W, H);
  if (text) {
    x.font = 'bold 34px Arial';
    const w = Math.min(W - 10, x.measureText(text).width + 50);
    x.fillStyle = 'rgba(20,28,22,0.85)'; roundRect(x, (W - w) / 2, 10, w, 64, 18); x.fill();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, 43, W - 30);
    if (prog > 0) { x.fillStyle = '#e8c96a'; x.fillRect((W - w) / 2 + 12, 80, (w - 24) * clamp(prog, 0, 1), 12); }
  }
  promptTex.needsUpdate = true;
}

function drawToast() {
  const x = toastX, W = 900, H = 130;
  x.clearRect(0, 0, W, H);
  x.font = 'bold 32px Arial';
  const lines = wrapText(x, current.text, W - 60).slice(0, 2);
  x.fillStyle = 'rgba(232,201,106,0.95)'; roundRect(x, 4, 4, W - 8, 20 + lines.length * 42, 20); x.fill();
  x.fillStyle = '#1d2b22'; x.textAlign = 'center'; x.textBaseline = 'top';
  lines.forEach((l, i) => x.fillText(l, W / 2, 16 + i * 42));
  toastTex.needsUpdate = true;
}

// ---------------------------------------------------------------- VR panels
export function showPanel(title, lines, footer) {
  const x = panelX, W = 1024, H = 768;
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(20,28,22,0.95)'; roundRect(x, 4, 4, W - 8, H - 8, 40); x.fill();
  x.strokeStyle = '#e8c96a'; x.lineWidth = 8; roundRect(x, 4, 4, W - 8, H - 8, 40); x.stroke();
  x.fillStyle = '#e8c96a'; x.textAlign = 'center'; x.textBaseline = 'top'; x.font = 'bold 56px Georgia';
  x.fillText(title, W / 2, 36, W - 60);
  x.fillStyle = '#fff'; x.font = '34px Arial';
  let y = 130;
  for (const l of lines) {
    for (const wl of wrapText(x, l, W - 100)) { x.fillText(wl, W / 2, y); y += 44; if (y > H - 120) break; }
    if (y > H - 120) break;
  }
  if (footer) { x.fillStyle = '#9be59b'; x.font = 'bold 34px Arial'; x.fillText(footer, W / 2, H - 80, W - 60); }
  panelTex.needsUpdate = true;
  // Place in front of the player's head
  const head = G.player.headPos(), f = G.player.forward();
  panelMesh.position.copy(head).addScaledVector(f, 1.8); panelMesh.position.y = head.y - 0.1;
  panelMesh.lookAt(head);
  panelMesh.visible = true;
}
export function hidePanel() { panelMesh.visible = false; }
