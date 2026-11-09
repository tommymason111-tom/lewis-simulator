// Voice studio: record the friend group's real voices on any phone/iPad,
// stored in this browser (IndexedDB), exportable/importable as a voice pack.
// A pack committed to the repo at voices/pack.json is loaded for everyone.
import { G } from './state.js';
import { LINES, FRIENDS } from './data.js';
import { setVoiceHook } from './audio.js';

const DB = 'lewis-voices', STORE = 'clips';
const clips = new Map(); // key -> object URL / data URL
let current = null;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbAll() {
  const db = await openDB();
  return new Promise((res) => {
    const out = [], tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
    const req = st.openCursor();
    req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
    req.onerror = () => res(out);
  });
}
async function dbPut(key, blob) { const db = await openDB(); return new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, key); tx.oncomplete = res; tx.onerror = res; }); }
async function dbDel(key) { const db = await openDB(); return new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = res; tx.onerror = res; }); }

export const keyFor = (who, text) => `${who}|${text}`;

export async function initVoices() {
  setVoiceHook(play);
  try {
    const r = await fetch('voices/pack.json', { cache: 'no-cache' });
    if (r.ok) { const pack = await r.json(); for (const [k, v] of Object.entries(pack.clips || {})) if (!clips.has(k)) clips.set(k, v); }
  } catch (e) { /* no pack in the repo yet */ }
  try { for (const [k, blob] of await dbAll()) clips.set(k, URL.createObjectURL(blob)); } catch (e) { /* IndexedDB unavailable */ }
}

function play(who, key, important) {
  const url = clips.get(keyFor(who, key));
  if (!url) return false;
  if (current && !current.ended && !current.paused) { if (!important) return true; current.pause(); }
  current = new Audio(url); current.volume = 1;
  current.play().catch(() => {});
  return true;
}

// Every recordable line, per character.
export function studioCharacters() {
  const flat = (o) => Object.values(o).flat();
  const chars = {
    Ian: flat(LINES.ian).concat(['LEWY! LEWYYYY!']),
    Ronnie: flat(LINES.ronnie),
    Hollie: flat(LINES.hollie),
    Chef: LINES.chef,
    'Lewis (karaoke)': LINES.karaoke,
  };
  for (const f of FRIENDS) chars[f] = LINES.friends[f] || [];
  return chars;
}
const whoFor = (c) => ({ Ian: 'ian', Ronnie: 'ronnie', Hollie: 'hollie', Chef: 'chef', 'Lewis (karaoke)': 'lewis' }[c] || c);

// ---------------------------------------------------------------- studio UI
let recorder = null, recKey = null, chunks = [];
export function renderStudio(el) {
  const chars = studioCharacters();
  const sel = el.dataset.char || 'Ian';
  const lines = chars[sel] || [];
  const who = whoFor(sel);
  const done = lines.filter((l) => clips.has(keyFor(who, l))).length;
  el.innerHTML = `<h3>Voice studio</h3>
    <p>Record the real voices. Pick a person, hand them the phone or iPad, and press ● on each line. Recordings are saved in this browser straight away. Use <b>Export voice pack</b> to move them to the Quest (then <b>Import</b> there), or upload the file to the repo as <code>voices/pack.json</code> so everyone gets them.</p>
    <div class="row">${Object.keys(chars).map((c) => `<button class="btn small ${c === sel ? '' : 'off'}" data-char="${c}">${c}</button>`).join('')}</div>
    <p><b>${sel}</b>: ${done}/${lines.length} recorded</p>
    <table>${lines.map((l, i) => {
      const has = clips.has(keyFor(who, l));
      return `<tr><td>${l.replace(/</g, '&lt;')}</td><td style="white-space:nowrap">
        <button class="btn small" data-rec="${i}">${recKey === keyFor(who, l) ? '■ Stop' : '● Rec'}</button>
        ${has ? `<button class="btn small" data-play="${i}">▶</button><button class="btn small" data-del="${i}">✕</button>` : ''}</td></tr>`;
    }).join('')}</table>
    <div class="row"><button class="btn" id="vExport">Export voice pack</button><label class="btn">Import voice pack<input type="file" id="vImport" accept=".json,application/json" hidden></label></div>`;
  el.querySelectorAll('[data-char]').forEach((b) => b.onclick = () => { el.dataset.char = b.dataset.char; renderStudio(el); });
  el.querySelectorAll('[data-rec]').forEach((b) => b.onclick = () => toggleRecord(keyFor(who, lines[+b.dataset.rec]), el));
  el.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => play(who, lines[+b.dataset.play], true));
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { const k = keyFor(who, lines[+b.dataset.del]); clips.delete(k); await dbDel(k); renderStudio(el); });
  el.querySelector('#vExport').onclick = exportPack;
  el.querySelector('#vImport').onchange = async (e) => { const f = e.target.files[0]; if (f) { const n = await importPack(f); alert(`Imported ${n} recordings.`); renderStudio(el); } };
}

async function toggleRecord(key, el) {
  if (recorder && recKey === key) { recorder.stop(); return; }
  if (recorder) recorder.stop();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = []; recKey = key;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      await dbPut(key, blob);
      clips.set(key, URL.createObjectURL(blob));
      recorder = null; recKey = null;
      renderStudio(el);
    };
    recorder.start();
    renderStudio(el);
  } catch (e) {
    alert('Microphone not available: ' + e.message + '\n(The page must be opened over https, e.g. GitHub Pages.)');
  }
}

const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
async function exportPack() {
  const out = {};
  for (const [k, blob] of await dbAll()) out[k] = await blobToDataURL(blob);
  const file = new Blob([JSON.stringify({ version: 1, clips: out })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'pack.json'; a.click();
}
async function importPack(file) {
  const pack = JSON.parse(await file.text());
  let n = 0;
  for (const [k, url] of Object.entries(pack.clips || {})) {
    const blob = await (await fetch(url)).blob();
    await dbPut(k, blob); clips.set(k, URL.createObjectURL(blob)); n++;
  }
  return n;
}
