// Minimal GLB loader for the character models in models/ (one mesh, one textured material).
import * as THREE from 'three';

const cache = new Map();

export function loadGLB(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }).then(parse));
  return cache.get(url);
}

async function parse(buf) {
  const dv = new DataView(buf);
  const jlen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jlen)));
  const binOff = 20 + jlen + 8;
  const view = (i) => { const bv = json.bufferViews[i]; return { off: binOff + (bv.byteOffset || 0), len: bv.byteLength, stride: bv.byteStride || 0 }; };
  const read = (ai, n) => {
    const a = json.accessors[ai], v = view(a.bufferView);
    const T = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    const start = v.off + (a.byteOffset || 0);
    if (!v.stride || v.stride === n * T.BYTES_PER_ELEMENT) return new T(buf.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT));
    const out = new T(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const o = start + k * v.stride + c * T.BYTES_PER_ELEMENT;
      out[k * n + c] = T === Float32Array ? dv.getFloat32(o, true) : T === Uint32Array ? dv.getUint32(o, true) : dv.getUint16(o, true);
    }
    return out;
  };
  const prim = json.meshes[0].primitives[0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(read(prim.attributes.POSITION, 3), 3));
  if (prim.attributes.NORMAL !== undefined) geo.setAttribute('normal', new THREE.BufferAttribute(read(prim.attributes.NORMAL, 3), 3));
  if (prim.attributes.TEXCOORD_0 !== undefined) geo.setAttribute('uv', new THREE.BufferAttribute(read(prim.attributes.TEXCOORD_0, 2), 2));
  if (prim.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(read(prim.indices, 1), 1));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const tex = async (ti, srgb) => {
    if (ti === undefined) return null;
    const img = json.images[json.textures[ti.index].source], v = view(img.bufferView);
    const bmp = await createImageBitmap(new Blob([new Uint8Array(buf, v.off, v.len)], { type: img.mimeType }));
    const t = new THREE.Texture(bmp);
    t.flipY = false; // glTF UVs have a top-left origin
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const m = json.materials?.[0] || {};
  const map = await tex(m.pbrMetallicRoughness?.baseColorTexture, true);
  const normalMap = await tex(m.normalTexture, false);
  return { geometry: geo, map, normalMap };
}
