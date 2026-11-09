// Replay theatre: keeps a rolling buffer of everyone's ragdoll pose and saves
// the best throw of the shift, which can be watched back from the results screen.
import { G, on } from './state.js';

const HZ = 30, PRE = 0.8 * HZ, POST = 2.6 * HZ, BUF = 5 * HZ;
let buf = [], acc = 0, pending = null, best = null, play = null;

export function resetReplay() { buf = []; pending = null; best = null; play = null; acc = 0; }
export const hasReplay = () => !!best;

function snapshot() {
  const frame = { people: [], ball: G.ball && !G.ball.dead ? G.ball.pos.clone() : null };
  for (const p of G.people) if (!p.hidden && !p.dead) frame.people.push([p, p.p.map((v) => v.clone())]);
  return frame;
}

export function recordReplay(dt) {
  if (play) return;
  acc += dt;
  while (acc >= 1 / HZ) {
    acc -= 1 / HZ;
    buf.push(snapshot());
    if (buf.length > BUF) buf.shift();
    if (pending) { pending.frames.push(buf[buf.length - 1]); if (pending.frames.length >= PRE + POST) { if (!best || pending.speed > best.speed) best = pending; pending = null; } }
  }
}

on('thrown', (p, speed) => {
  if (play || speed < 6 || (pending && pending.speed >= speed) || (best && best.speed >= speed)) return;
  pending = { speed, who: p.name || (p.group ? p.group.type.label : p.kind), person: p, frames: buf.slice(-PRE) };
});

export function startReplay() {
  if (!best) return false;
  play = { i: 0, t: 0, saved: G.people.map((p) => [p, p.state, p.p.map((v) => v.clone())]) };
  G.mode = 'replay';
  G.toast(`🎬 Replay theatre: best throw of the shift (${best.who}, ${best.speed.toFixed(1)} m/s)`, 3);
  return true;
}

// Returns false when playback is over.
export function updateReplay(dt) {
  if (!play) return false;
  play.t += dt * 0.6; // slow-mo
  const i = Math.floor(play.t * HZ);
  if (i >= best.frames.length) {
    for (const [p, st, pts] of play.saved) { if (p.dead) continue; pts.forEach((v, k) => { p.p[k].copy(v); p.o[k].copy(v); }); }
    play = null;
    return false;
  }
  const f = best.frames[i];
  for (const [p, pts] of f.people) { if (p.dead) continue; pts.forEach((v, k) => p.p[k].copy(v)); }
  if (f.ball && G.ball && !G.ball.dead) { G.ball.pos.copy(f.ball); G.ball.sync(); }
  // Flat screen: orbit a camera around the action
  if (!G.xr) {
    const mine = f.people.find(([p]) => p === best.person);
    const focus = mine ? mine[1][2] : G.player.pos;
    const ang = play.t * 0.6;
    G.rig.position.set(focus.x + Math.sin(ang) * 4, 0, focus.z + Math.cos(ang) * 4);
    G.rig.rotation.set(0, ang, 0);
    G.camera.position.set(0, 2.4, 0); G.camera.rotation.set(-0.3, 0, 0);
  }
  return true;
}
