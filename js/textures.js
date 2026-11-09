// Canvas-generated textures, speech bubbles and floating labels.
import * as THREE from 'three';
import { rand, pick } from './state.js';
import { sfx } from './audio.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}

export function woodTexture(repeat = [4, 4]) {
  const c = makeCanvas(256, 256), x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const shade = 90 + rand(-15, 15);
    x.fillStyle = `rgb(${shade + 40},${shade},${shade - 40})`;
    x.fillRect(0, i * 32, 256, 32);
    x.strokeStyle = 'rgba(40,20,0,0.5)'; x.lineWidth = 2;
    x.strokeRect(0, i * 32, 256, 32);
    const off = (i % 2) * 128 + rand(0, 40);
    x.beginPath(); x.moveTo(off, i * 32); x.lineTo(off, i * 32 + 32); x.stroke();
    for (let k = 0; k < 6; k++) {
      x.strokeStyle = 'rgba(60,30,10,0.18)'; x.lineWidth = 1;
      x.beginPath(); const yy = i * 32 + rand(4, 28); x.moveTo(0, yy); x.bezierCurveTo(80, yy + rand(-4, 4), 160, yy + rand(-4, 4), 256, yy); x.stroke();
    }
  }
  return canvasTex(c, repeat);
}

export function carpetTexture(repeat = [6, 6]) {
  const c = makeCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#6b1420'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#8c2a2a';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    x.save(); x.translate(i * 32 + 16, j * 32 + 16); x.rotate(Math.PI / 4);
    x.fillRect(-8, -8, 16, 16); x.restore();
  }
  x.fillStyle = '#c9a23a';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(i * 32, j * 32, 4, 0, 7); x.fill(); }
  x.strokeStyle = '#3d0b12'; x.lineWidth = 1;
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${rand(0.05, 0.15)})`; x.fillRect(rand(128), rand(128), 2, 2); }
  return canvasTex(c, repeat);
}

export function grassTexture(repeat = [10, 10]) {
  const c = makeCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#4c8a3a'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { x.fillStyle = `hsl(${100 + rand(-15, 15)},${45 + rand(20)}%,${30 + rand(20)}%)`; x.fillRect(rand(128), rand(128), 1, rand(2, 5)); }
  return canvasTex(c, repeat);
}

export function camoTexture() {
  const c = makeCanvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#5b5f3a'; x.fillRect(0, 0, 128, 128);
  const cols = ['#3b3f24', '#7a6a45', '#2b2a1e', '#6f7a48'];
  for (let i = 0; i < 40; i++) {
    x.fillStyle = pick(cols); x.beginPath();
    const cx = rand(128), cy = rand(128);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, r = rand(6, 16); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    x.fill();
  }
  return canvasTex(c, [1, 1]);
}

export function wallTexture(repeat = [6, 1]) {
  const c = makeCanvas(128, 256), x = c.getContext('2d');
  x.fillStyle = '#e9dcc0'; x.fillRect(0, 0, 128, 256);
  x.fillStyle = '#5a3a22'; x.fillRect(0, 170, 128, 86); // wood panelling
  x.fillStyle = '#3d2615'; x.fillRect(0, 166, 128, 8);
  x.strokeStyle = '#4a2f1a'; x.lineWidth = 3;
  for (let i = 0; i < 4; i++) x.strokeRect(i * 32 + 4, 182, 24, 64);
  for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(120,90,40,${rand(0.03, 0.08)})`; x.fillRect(rand(128), rand(160), 3, 3); }
  return canvasTex(c, repeat);
}

export function textTexture(lines, opts = {}) {
  const w = opts.w || 512, h = opts.h || 256;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = opts.bg || '#1d2b22'; x.fillRect(0, 0, w, h);
  if (opts.border) { x.strokeStyle = opts.border; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10); }
  x.fillStyle = opts.color || '#f5f0e0'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const size = opts.size || 40;
  x.font = `${opts.bold ? 'bold ' : ''}${size}px ${opts.font || 'Georgia, serif'}`;
  lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.25));
  return canvasTex(c);
}

export function wrapText(x, text, maxW) {
  const words = String(text).split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}

// Stutter: "Lewis, table" -> "L-L-L-Lewis, t-t-table"
export function stutterize(text) {
  return text.split(' ').map((w, i) => {
    const m = w.match(/^([A-Za-z])/);
    if (!m || w.length < 3 || w.includes('-') || Math.random() < 0.45) return w;
    const n = i === 0 ? 3 : (Math.random() < 0.5 ? 1 : 2);
    return (m[1] + '-').repeat(n) + w;
  }).join(' ');
}

// --- Speech bubble sprite ------------------------------------------------
export class Bubble {
  constructor(opts = {}) {
    this.canvas = makeCanvas(512, 192);
    this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTex(this.canvas);
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.sprite.renderOrder = 10;
    this.sprite.scale.set(1.25, 0.47, 1);
    this.sprite.visible = false;
    this.text = ''; this.shown = 0; this.timer = 0; this.typing = false;
    this.color = opts.color || '#ffffff';
    this.name = opts.name || '';
  }
  say(text, dur = 3.5, opts = {}) {
    this.text = text; this.timer = dur + (opts.type ? text.length * 0.05 : 0);
    this.typing = !!opts.type; this.shown = this.typing ? 0 : text.length;
    this.typeAcc = 0; this.sprite.visible = true; this.draw();
  }
  hide() { this.sprite.visible = false; this.timer = 0; }
  update(dt) {
    if (!this.sprite.visible) return;
    if (this.typing && this.shown < this.text.length) {
      this.typeAcc += dt;
      while (this.typeAcc > 0.055 && this.shown < this.text.length) {
        this.typeAcc -= 0.055; this.shown++;
        if (this.text[this.shown - 1] === '-') sfx.blip();
      }
      this.draw();
    }
    this.timer -= dt;
    if (this.timer <= 0) this.sprite.visible = false;
  }
  draw() {
    const x = this.ctx, W = 512, H = 192;
    x.clearRect(0, 0, W, H);
    x.font = 'bold 34px "Trebuchet MS", Arial, sans-serif';
    const lines = wrapText(x, this.text.slice(0, this.shown) || ' ', W - 60).slice(0, 3);
    const bh = 30 + lines.length * 40;
    x.fillStyle = this.color; x.strokeStyle = '#222'; x.lineWidth = 5;
    roundRect(x, 6, H - bh - 30, W - 12, bh, 24); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(W / 2 - 20, H - 33); x.lineTo(W / 2, H - 4); x.lineTo(W / 2 + 20, H - 33); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = this.color; x.fillRect(W / 2 - 17, H - 37, 34, 8);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'top';
    lines.forEach((l, i) => x.fillText(l, W / 2, H - bh - 30 + 16 + i * 40));
    if (this.name) {
      x.font = 'bold 24px Arial'; x.fillStyle = '#333'; x.textAlign = 'left';
      x.fillText(this.name, 24, H - bh - 30 + 2);
    }
    this.tex.needsUpdate = true;
  }
}

// Simple floating label (name tags, "zzz", stars).
export function labelSprite(text, opts = {}) {
  const c = makeCanvas(opts.w || 256, opts.h || 64), x = c.getContext('2d');
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), depthTest: opts.depthTest ?? true, transparent: true }));
  s.userData.draw = (t) => {
    x.clearRect(0, 0, c.width, c.height);
    if (opts.bg) { x.fillStyle = opts.bg; roundRect(x, 2, 2, c.width - 4, c.height - 4, 14); x.fill(); }
    x.fillStyle = opts.color || '#fff'; x.font = `bold ${opts.size || 36}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = '#000'; x.lineWidth = opts.stroke ?? 5;
    if (x.lineWidth) x.strokeText(t, c.width / 2, c.height / 2);
    x.fillText(t, c.width / 2, c.height / 2);
    s.material.map.needsUpdate = true;
  };
  s.userData.draw(text);
  s.scale.set((opts.scale || 0.5) * (c.width / c.height), opts.scale || 0.5, 1);
  return s;
}

// Canvas texture that callers redraw themselves (TV, tickets, table icons).
export function dynamicTexture(w, h) {
  const c = makeCanvas(w, h);
  return { canvas: c, ctx: c.getContext('2d'), tex: canvasTex(c) };
}
