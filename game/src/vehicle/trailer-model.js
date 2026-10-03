import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { vehicleMaterials, wheelMesh } from './truck-model.js';
import { canvas } from '../render/textures.js';
import { TRAILERS } from '../data/economy.js';
import { rng } from '../core/util.js';

const textCache = new Map();

function sideTexture(kind, company, lang) {
  const key = kind + ':' + (company?.ru ?? '') + ':' + lang;
  if (textCache.has(key)) return textCache.get(key);
  const c = canvas(1024, 256);
  const g = c.getContext('2d');
  if (kind === 'reefer') {
    g.fillStyle = '#eef0ef';
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 2, 256);
  } else {
    const base = company?.color ?? '#5c6a74';
    g.fillStyle = '#c9ced1';
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = base;
    g.globalAlpha = 0.18;
    g.fillRect(0, 0, 1024, 256);
    g.globalAlpha = 1;
    // fabric folds and straps
    for (let x = 0; x < 1024; x += 8) {
      g.fillStyle = `rgba(0,0,0,${0.03 + 0.03 * Math.sin(x * 0.11)})`;
      g.fillRect(x, 0, 4, 256);
    }
    g.fillStyle = 'rgba(40,40,40,0.55)';
    for (let x = 40; x < 1024; x += 78) g.fillRect(x, 0, 6, 256);
  }
  if (company) {
    g.fillStyle = company.color;
    g.fillRect(0, 170, 1024, 26);
    g.fillStyle = '#1d2226';
    g.font = 'bold 74px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const name = lang === 'en' ? company.en : company.ru;
    g.fillText(name.length > 26 ? name.slice(0, 26) + '…' : name, 512, 96, 960);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textCache.set(key, tex);
  return tex;
}

// Semi-trailer. Origin at the king pin on the ground plane; body extends toward -z.
export function buildTrailer(type, { cargo = null, company = null, lang = 'ru', seed = 1 } = {}) {
  const M = vehicleMaterials();
  const spec = TRAILERS[type] ?? TRAILERS.curtain;
  const r = rng(seed);
  const root = new THREE.Group();
  root.name = 'trailer';
  const body = new THREE.Group();
  root.add(body);
  const len = spec.length;
  const deckY = type === 'lowloader' ? 0.95 : 1.28;
  const add = (geo, mat, x, y, z, parent = body, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const front = 1.3;
  const rear = front - len;
  const mid = (front + rear) / 2;
  // chassis frame
  add(new THREE.BoxGeometry(1.0, 0.3, len - 0.4), M.chassis, 0, deckY - 0.25, mid);
  // landing legs
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.14, 1.0, 0.14), M.chassis, s * 0.85, deckY - 0.75, -0.6);
    add(new THREE.BoxGeometry(0.3, 0.05, 0.3), M.chassis, s * 0.85, 0.12, -0.6);
  }
  // side underrun guards
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.3, 4.2), M.alu, s * 1.22, deckY - 0.55, -3.6);
  // rear bumper, lights and mudflaps
  add(new THREE.BoxGeometry(2.3, 0.14, 0.14), M.chassis, 0, 0.62, rear + 0.1);
  for (const s of [-1, 1]) {
    const tl = add(new THREE.BoxGeometry(0.5, 0.16, 0.06), M.tail, s * 0.95, 0.85, rear + 0.05, body, false);
    tl.name = 'tail';
    add(new THREE.BoxGeometry(0.5, 0.55, 0.02), M.black, s * 1.05, 0.5, front - spec.axle - 2.1, body, false);
  }
  // side reflectors
  for (let z = front - 1.5; z > rear + 1; z -= 2.5) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.06, 0.12), M.reflector, s * 1.26, deckY - 0.45, z, body, false);
  // wheels: triple axle
  const wheels = [];
  const axleZ = front - spec.axle;
  for (const dz of [-1.31, 0, 1.31]) {
    for (const s of [-1, 1]) {
      const w = wheelMesh(0.5, 0.36, false);
      w.position.set(s * 1.05, 0.5, axleZ + dz);
      if (s < 0) w.rotation.y = Math.PI;
      root.add(w);
      wheels.push(w);
    }
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.05, 4.2), M.black, s * 1.05, 1.08, axleZ);
  // body by type
  const W = 2.55;
  if (type === 'curtain' || type === 'reefer') {
    const h = 2.75;
    const tex = sideTexture(type, company, lang);
    const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: type === 'reefer' ? 0.35 : 0.85, metalness: type === 'reefer' ? 0.1 : 0 });
    const plain = new THREE.MeshStandardMaterial({ color: type === 'reefer' ? 0xeef0ef : 0xc4c9cc, roughness: 0.6 });
    const box = new THREE.BoxGeometry(W, h, len);
    // groups: +x, -x, +y, -y, +z, -z
    const boxMesh = add(box, [sideMat, sideMat, plain, M.chassis, plain, plain], 0, deckY + h / 2, mid);
    boxMesh.name = 'box';
    // flip uv on the left side so text reads correctly
    const uv = box.attributes.uv;
    for (let i = 4; i < 8; i++) uv.setX(i, 1 - uv.getX(i));
    uv.needsUpdate = true;
    add(new THREE.BoxGeometry(W + 0.04, 0.1, len + 0.04), M.alu, 0, deckY + h + 0.05, mid);
    add(new THREE.BoxGeometry(W + 0.04, 0.12, len + 0.04), M.alu, 0, deckY + 0.02, mid);
    if (type === 'reefer') {
      const unit = add(new RoundedBoxGeometry(2.1, 1.6, 0.55, 2, 0.08), new THREE.MeshStandardMaterial({ color: 0xd9dcdc, roughness: 0.5 }), 0, deckY + h - 0.9, front + 0.28);
      unit.name = 'reeferUnit';
      add(new THREE.BoxGeometry(1.5, 0.9, 0.04), M.black, 0, deckY + h - 0.9, front + 0.57, body, false);
    }
    // rear doors
    add(new THREE.BoxGeometry(W - 0.06, h - 0.1, 0.04), plain, 0, deckY + h / 2, rear - 0.02);
    for (const s of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.05, h - 0.2, 0.05), M.chrome, s, deckY + h / 2, rear - 0.06, body, false);
  } else if (type === 'flatbed' || type === 'lowloader') {
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b5a46, roughness: 0.9 });
    add(new THREE.BoxGeometry(W, 0.16, len), deckMat, 0, deckY, mid);
    add(new THREE.BoxGeometry(W, 0.2, len), M.chassis, 0, deckY - 0.12, mid);
    if (type === 'flatbed') add(new THREE.BoxGeometry(W, 1.6, 0.12), M.alu, 0, deckY + 0.8, front - 0.05);
    for (let z = front - 1; z > rear; z -= 1.2) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.06, 0.06), M.chrome, s * 1.25, deckY + 0.05, z, body, false);
    buildLoad(body, cargo?.load ?? (type === 'lowloader' ? 'excavator' : 'lumber'), deckY + 0.08, front, rear, r);
  } else if (type === 'tanker') {
    const tankMat = new THREE.MeshStandardMaterial({ color: cargo?.adr ? 0xd9dde0 : 0xe8eaea, metalness: 0.85, roughness: 0.25 });
    const tank = add(new THREE.CylinderGeometry(1.15, 1.15, len - 0.6, 28), tankMat, 0, deckY + 1.15, mid);
    tank.rotation.x = Math.PI / 2;
    tank.scale.set(1.08, 1, 1);
    for (const z of [front - 0.3, rear + 0.3]) {
      const cap = add(new THREE.SphereGeometry(1.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), tankMat, 0, deckY + 1.15, z);
      cap.rotation.x = z > mid ? Math.PI / 2 : -Math.PI / 2;
      cap.scale.set(1.08, 0.35, 1);
    }
    add(new THREE.BoxGeometry(0.5, 0.06, len - 1.5), M.alu, 0, deckY + 2.33, mid);
    for (let z = front - 2; z > rear + 1; z -= 3) add(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 14), M.alu, 0, deckY + 2.32, z);
    for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.4, 0.03, 0.05), M.alu, 0, deckY + 0.3 + i * 0.3, rear - 0.25, body, false);
    if (cargo?.adr) {
      const plate = new THREE.MeshStandardMaterial({ color: 0xf28a12, roughness: 0.5 });
      add(new THREE.BoxGeometry(0.4, 0.3, 0.02), plate, 0, 1.0, rear - 0.05, body, false);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.3, 0.4), plate, s * 1.25, deckY + 0.6, mid, body, false);
    }
  } else if (type === 'container') {
    const colors = [0x1f5e9c, 0xb2321f, 0x2f7a3a, 0xc9a227, 0x6b6f75, 0xd06a1b];
    const cont = new THREE.MeshStandardMaterial({ color: colors[Math.floor(r() * colors.length)], roughness: 0.65, metalness: 0.3 });
    add(new THREE.BoxGeometry(2.44, 2.59, 12.19), cont, 0, deckY + 1.3, mid + 0.1);
    for (let z = mid - 6; z < mid + 6.1; z += 0.6) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, 2.5, 0.25), cont, s * 1.23, deckY + 1.3, z, body, false);
  } else if (type === 'logger') {
    add(new THREE.BoxGeometry(W, 0.2, len), M.chassis, 0, deckY, mid);
    for (let z = front - 1; z > rear + 0.5; z -= 2.8) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 2.4, 0.12), M.chassis, s * 1.2, deckY + 1.2, z);
    buildLoad(body, 'logs', deckY + 0.1, front, rear, r);
  }
  return { root, body, wheels, spec, length: len, front, rear, axleZ };
}

function buildLoad(parent, load, y, front, rear, r) {
  const M = vehicleMaterials();
  const add = (geo, mat, x, yy, z, rot = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, yy, z);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const mid = (front + rear) / 2;
  const len = front - rear;
  if (load === 'lumber') {
    const wood = new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.85 });
    for (let i = 0; i < 4; i++) for (const s of [-0.62, 0.62]) add(new THREE.BoxGeometry(1.18, 0.95, (len - 1.2) / 4 - 0.1), wood, s, y + 0.48 + (i % 2) * 0, front - 0.6 - ((len - 1.2) / 4) * (i + 0.5));
    for (let i = 0; i < 4; i++) for (const s of [-0.62, 0.62]) add(new THREE.BoxGeometry(1.18, 0.9, (len - 1.2) / 4 - 0.1), wood, s, y + 1.45, front - 0.6 - ((len - 1.2) / 4) * (i + 0.5));
  } else if (load === 'pipes') {
    const steel = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.75, roughness: 0.45 });
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - (row % 2); i++) add(new THREE.CylinderGeometry(0.28, 0.28, len - 1.4, 14, 1, true), steel, -0.9 + i * 0.6 + (row % 2) * 0.3, y + 0.3 + row * 0.5, mid, [Math.PI / 2, 0, 0]);
  } else if (load === 'slabs') {
    const conc = new THREE.MeshStandardMaterial({ color: 0x9b9a95, roughness: 0.95 });
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(2.3, 0.22, len - 1.6), conc, 0, y + 0.13 + i * 0.26, mid);
  } else if (load === 'coils') {
    const steel = new THREE.MeshStandardMaterial({ color: 0x7c8590, metalness: 0.85, roughness: 0.3 });
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.85, 0.85, 1.4, 22), steel, 0, y + 0.85, front - 2 - i * 2.8, [0, 0, Math.PI / 2]);
  } else if (load === 'bricks') {
    const brick = new THREE.MeshStandardMaterial({ color: 0x9a4b34, roughness: 0.9 });
    const pal = new THREE.MeshStandardMaterial({ color: 0xb48a5a, roughness: 0.9 });
    for (let i = 0; i < 9; i++) for (const s of [-0.62, 0.62]) {
      const z = front - 1 - i * 1.32;
      add(new THREE.BoxGeometry(1.05, 0.14, 1.1), pal, s, y + 0.07, z);
      add(new THREE.BoxGeometry(1.0, 0.95, 1.0), brick, s, y + 0.62, z);
    }
  } else if (load === 'logs') {
    const bark = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.95 });
    const cut = new THREE.MeshStandardMaterial({ color: 0xd9b07a, roughness: 0.8 });
    for (let row = 0; row < 4; row++) for (let i = 0; i < 6 - (row % 2); i++) {
      const rr = 0.18 + r() * 0.06;
      const m = add(new THREE.CylinderGeometry(rr, rr, len - 1.2, 9), [bark, cut, cut], -1.0 + i * 0.4 + (row % 2) * 0.2, y + 0.22 + row * 0.37, mid - r() * 0.3, [Math.PI / 2, 0, 0]);
      void m;
    }
  } else if (load === 'excavator') {
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0a51c, roughness: 0.5, metalness: 0.2 });
    for (const s of [-0.85, 0.85]) add(new THREE.BoxGeometry(0.6, 0.8, 4.2), M.black, s, y + 0.4, mid);
    add(new THREE.BoxGeometry(2.4, 1.1, 3.0), yellow, 0, y + 1.35, mid - 0.4);
    add(new THREE.BoxGeometry(0.95, 1.2, 1.1), M.glassDark, -0.7, y + 2.4, mid + 0.4);
    const boom = add(new THREE.BoxGeometry(0.4, 0.5, 4.2), yellow, 0.6, y + 2.2, mid + 2.6, [0.35, 0, 0]);
    void boom;
    add(new THREE.BoxGeometry(0.35, 2.4, 0.4), yellow, 0.6, y + 1.6, mid + 4.4, [-0.2, 0, 0]);
    add(new THREE.BoxGeometry(1.0, 0.7, 0.8), yellow, 0.6, y + 0.5, mid + 4.6);
  } else if (load === 'tractor') {
    const green = new THREE.MeshStandardMaterial({ color: 0x2c7a3c, roughness: 0.45, metalness: 0.2 });
    add(new THREE.BoxGeometry(1.2, 1.0, 2.8), green, 0, y + 1.3, mid);
    add(new THREE.BoxGeometry(1.4, 1.4, 1.4), M.glassDark, 0, y + 2.3, mid - 0.6);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.85, 0.85, 0.55, 18), M.black, s * 1.0, y + 0.85, mid - 0.9, [0, 0, Math.PI / 2]);
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16), M.black, s * 0.9, y + 0.5, mid + 1.2, [0, 0, Math.PI / 2]);
    }
  } else if (load === 'transformer') {
    const grey = new THREE.MeshStandardMaterial({ color: 0x75807a, roughness: 0.6, metalness: 0.4 });
    add(new THREE.BoxGeometry(2.4, 2.6, 5.5), grey, 0, y + 1.3, mid);
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 10), M.plastic, -0.7 + i * 0.7, y + 3.2, mid + 1.5);
    for (let z = mid - 2.5; z < mid + 2.6; z += 0.4) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.25, 2.0, 0.05), grey, s * 1.32, y + 1.2, z);
  }
}
