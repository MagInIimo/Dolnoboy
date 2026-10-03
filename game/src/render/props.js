import * as THREE from 'three';
import { GeoBuilder } from './geo-builder.js';
import { computeNodeInfo } from './road-builder.js';
import { layoutLot } from '../world/lot-layout.js';
import { signalPhase } from '../world/signals.js';
import { COMPANIES, FUEL_PRICE } from '../data/economy.js';
import { WATER_LEVEL } from '../core/geo.js';
import { SpatialHash, clamp } from '../core/util.js';

const CHUNK = 512;
const FONT = "'Source Sans', Arial, sans-serif";
const BLUE = '#1d4f9e';
const RED = '#c8202a';
const C = {
  metal: [0.62, 0.64, 0.66],
  darkMetal: [0.32, 0.33, 0.35],
  concrete: [0.66, 0.65, 0.62],
  deck: [0.55, 0.54, 0.52],
  pier: [0.6, 0.59, 0.56],
  black: [0.08, 0.08, 0.09],
  white: [0.92, 0.92, 0.9],
};

// ---------- sign faces painted on canvas ----------

function fitText(g, text, size, maxW, weight = 700) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function board(w, h, px = 512) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.max(32, Math.round((px * h) / w));
  return { c, g: c.getContext('2d'), W: c.width, H: c.height, w, h };
}

function blueBoard(b) {
  const { g, W, H } = b;
  g.fillStyle = BLUE;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  roundRect(g, 8, 8, W - 16, H - 16, 14);
  g.stroke();
}

function whiteBoard(b) {
  const { g, W, H } = b;
  g.fillStyle = '#f4f4f1';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#111';
  g.lineWidth = 7;
  roundRect(g, 9, 9, W - 18, H - 18, 12);
  g.stroke();
}

function refPlate(g, x, y, ref, h = 52) {
  g.font = `800 ${h * 0.72}px ${FONT}`;
  const w = g.measureText(ref).width + h * 0.6;
  g.fillStyle = RED;
  roundRect(g, x, y, w, h, 6);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 4);
  g.stroke();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(ref, x + w / 2, y + h / 2 + 2);
  return w;
}

const PAINT = {
  distance(d) {
    const rows = d.lines.length;
    const b = board(3.4, 0.62 + 0.62 * rows + (d.ref ? 0.38 : 0));
    const { g, W } = b;
    blueBoard(b);
    let y = 22;
    if (d.ref) {
      refPlate(g, 26, y, d.ref, 50);
      y += 62;
    }
    for (const [ru, en, km] of d.lines) {
      g.fillStyle = '#fff';
      g.textBaseline = 'alphabetic';
      g.textAlign = 'right';
      g.font = `800 64px ${FONT}`;
      const kmText = String(km);
      g.fillText(kmText, W - 30, y + 62);
      const kmW = g.measureText(kmText).width;
      g.textAlign = 'left';
      fitText(g, ru, 64, W - 90 - kmW);
      g.fillText(ru, 30, y + 62);
      g.font = `600 30px ${FONT}`;
      g.fillStyle = '#dfe7f5';
      g.fillText(en, 32, y + 98);
      y += 108;
    }
    return b;
  },
  // direction pointer to a hamlet (blue) or a rural enterprise (white) at a country road junction
  pointer(d) {
    const b = board(2.9, 0.95);
    const { g, W, H } = b;
    if (d.plain) whiteBoard(b);
    else blueBoard(b);
    const fg = d.plain ? '#111' : '#fff';
    g.fillStyle = fg;
    const tip = d.right ? W - 18 : 18;
    const base = d.right ? W - 120 : 120;
    g.beginPath();
    g.moveTo(tip, H / 2);
    g.lineTo(base, H * 0.16);
    g.lineTo(base, H * 0.34);
    g.lineTo(d.right ? base - 60 : base + 60, H * 0.34);
    g.lineTo(d.right ? base - 60 : base + 60, H * 0.66);
    g.lineTo(base, H * 0.66);
    g.lineTo(base, H * 0.84);
    g.closePath();
    g.fill();
    const x0 = d.right ? 26 : 200;
    const x1 = d.right ? W - 200 : W - 26;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'right';
    g.font = `800 58px ${FONT}`;
    const km = String(d.km);
    g.fillText(km, x1, H * 0.55);
    const kmW = g.measureText(km).width;
    g.textAlign = 'left';
    fitText(g, d.ru, 58, x1 - x0 - kmW - 24);
    g.fillText(d.ru, x0, H * 0.55);
    g.font = `600 28px ${FONT}`;
    g.fillStyle = d.plain ? '#333' : '#dfe7f5';
    g.fillText(d.en, x0 + 2, H * 0.86);
    return b;
  },
  city(d, end = false) {
    const b = board(d.small ? 3.0 : 3.6, d.small ? 1.15 : 1.35);
    const { g, W, H } = b;
    whiteBoard(b);
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    fitText(g, d.ru, 92, W - 60, 800);
    g.fillText(d.ru, W / 2, H * 0.6);
    g.font = `600 ${Math.round(H * 0.17)}px ${FONT}`;
    g.fillText(d.en, W / 2, H * 0.86);
    if (end) {
      g.strokeStyle = RED;
      g.lineWidth = H * 0.085;
      g.beginPath();
      g.moveTo(W * 0.06, H * 0.9);
      g.lineTo(W * 0.94, H * 0.1);
      g.stroke();
    }
    return b;
  },
  limit(d) {
    const b = board(0.9, 0.9, 256);
    const { g, W } = b;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#f4f4f1';
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = RED;
    g.lineWidth = W * 0.1;
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 4 - W * 0.05, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${W * 0.42}px ${FONT}`;
    g.fillText(String(d.value), W / 2, W / 2 + 6);
    b.alpha = true;
    return b;
  },
  camera() {
    const b = board(0.75, 0.9, 256);
    const { g, W, H } = b;
    whiteBoard(b);
    g.fillStyle = '#111';
    roundRect(g, W * 0.18, H * 0.36, W * 0.52, H * 0.3, 10);
    g.fill();
    g.beginPath();
    g.moveTo(W * 0.7, H * 0.44);
    g.lineTo(W * 0.86, H * 0.36);
    g.lineTo(W * 0.86, H * 0.66);
    g.lineTo(W * 0.7, H * 0.58);
    g.fill();
    g.fillStyle = '#f4f4f1';
    g.beginPath();
    g.arc(W * 0.44, H * 0.51, H * 0.08, 0, Math.PI * 2);
    g.fill();
    return b;
  },
  advance(d) {
    const b = board(3.4, 2.1);
    const { g, W, H } = b;
    blueBoard(b);
    if (d.ref) refPlate(g, W - 190, 24, d.ref, 50);
    // straight-ahead arrow
    g.fillStyle = '#fff';
    const ax = W * 0.2;
    g.fillRect(ax - 14, H * 0.32, 28, H * 0.58);
    g.beginPath();
    g.moveTo(ax - 48, H * 0.36);
    g.lineTo(ax, H * 0.12);
    g.lineTo(ax + 48, H * 0.36);
    g.closePath();
    g.fill();
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    fitText(g, d.ru, 66, W * 0.62);
    g.fillText(d.ru, W * 0.32, H * 0.58);
    g.font = `600 32px ${FONT}`;
    g.fillStyle = '#dfe7f5';
    g.fillText(d.en, W * 0.32, H * 0.75);
    return b;
  },
  route(d) {
    const b = board(1.7, d.name ? 1.1 : 0.62, 256);
    const { g, W, H } = b;
    g.fillStyle = '#f4f4f1';
    g.fillRect(0, 0, W, H);
    const plateH = d.name ? H * 0.55 : H;
    g.fillStyle = RED;
    g.fillRect(0, 0, W, plateH);
    g.strokeStyle = '#fff';
    g.lineWidth = 5;
    g.strokeRect(7, 7, W - 14, plateH - 14);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${plateH * 0.56}px ${FONT}`;
    g.fillText(d.ref, W / 2, plateH / 2 + 3);
    if (d.name) {
      g.fillStyle = '#111';
      fitText(g, d.name, H * 0.3, W - 20);
      g.fillText(d.name, W / 2, plateH + (H - plateH) / 2 + 2);
    }
    return b;
  },
  fuel() {
    const b = board(1.8, 5.2, 256);
    const { g, W, H } = b;
    g.fillStyle = '#16343b';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1aa08f';
    g.fillRect(0, 0, W, H * 0.24);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${W * 0.34}px ${FONT}`;
    g.fillText('АЗС', W / 2, H * 0.1);
    g.font = `600 ${W * 0.12}px ${FONT}`;
    g.fillText('FUEL', W / 2, H * 0.19);
    const rows = [['ДТ', FUEL_PRICE.toFixed(2)], ['АИ-95', (FUEL_PRICE * 0.92).toFixed(2)], ['АИ-92', (FUEL_PRICE * 0.85).toFixed(2)]];
    rows.forEach(([n, p], i) => {
      const y = H * (0.34 + i * 0.12);
      g.fillStyle = '#0c1b1f';
      g.fillRect(W * 0.07, y - H * 0.045, W * 0.86, H * 0.09);
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      g.font = `700 ${W * 0.11}px ${FONT}`;
      g.fillText(n, W * 0.12, y);
      g.textAlign = 'right';
      g.fillStyle = '#ffcf5c';
      g.font = `800 ${W * 0.13}px ${FONT}`;
      g.fillText(p, W * 0.9, y);
    });
    g.fillStyle = '#1aa08f';
    g.fillRect(0, H * 0.74, W, H * 0.02);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = `700 ${W * 0.1}px ${FONT}`;
    g.fillText('КАФЕ · WC', W / 2, H * 0.82);
    return b;
  },
  service() {
    const b = board(4.2, 1.3);
    const { g, W, H } = b;
    blueBoard(b);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    fitText(g, 'СТО · ШИНОМОНТАЖ', 70, W - 60, 800);
    g.fillText('СТО · ШИНОМОНТАЖ', W / 2, H * 0.58);
    g.font = `600 ${H * 0.2}px ${FONT}`;
    g.fillStyle = '#dfe7f5';
    g.fillText('Truck service · Repair', W / 2, H * 0.84);
    return b;
  },
  cafe() {
    const b = board(3.6, 1.2);
    const { g, W, H } = b;
    g.fillStyle = '#f6efe2';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#7a3b22';
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = '#b8321f';
    g.textAlign = 'center';
    g.font = `800 ${H * 0.5}px ${FONT}`;
    g.fillText('КАФЕ', W / 2, H * 0.6);
    g.font = `600 ${H * 0.18}px ${FONT}`;
    g.fillStyle = '#5b3a2a';
    g.fillText('Придорожное кафе · Roadside cafe', W / 2, H * 0.86);
    return b;
  },
  company(d) {
    const b = board(4.4, 1.5);
    const { g, W, H } = b;
    g.fillStyle = '#f4f4f1';
    g.fillRect(0, 0, W, H);
    g.fillStyle = d.color;
    g.fillRect(0, 0, W * 0.07, H);
    g.fillRect(0, H - 12, W, 12);
    g.fillStyle = '#1b2026';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    fitText(g, d.ru, 62, W * 0.86, 800);
    g.fillText(d.ru, W * 0.11, H * 0.52);
    g.font = `600 ${H * 0.19}px ${FONT}`;
    g.fillStyle = '#56616b';
    g.fillText(d.en, W * 0.11, H * 0.8);
    return b;
  },
};

// ---------- instanced pools fed by streamed chunks ----------

class InstancedPool {
  constructor(scene, geometry, material, capacity, { shadows = false, colors = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = false;
    if (colors) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    scene.add(this.mesh);
    this.capacity = capacity;
    this.groups = new Map();
    this.dirty = false;
    this.items = [];
  }

  set(key, items) {
    if (items.length) this.groups.set(key, items);
    else this.groups.delete(key);
    this.dirty = true;
  }

  remove(key) {
    if (this.groups.delete(key)) this.dirty = true;
  }

  flush() {
    if (!this.dirty) return false;
    this.dirty = false;
    let n = 0;
    this.items = [];
    for (const list of this.groups.values()) {
      for (const it of list) {
        if (n >= this.capacity) break;
        this.mesh.setMatrixAt(n, it.matrix);
        it.index = n++;
        this.items.push(it);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }
}

function placeMatrix(x, y, z, yaw, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz));
  return m;
}

function mergeParts(parts) {
  const gb = new GeoBuilder({ color: 3 });
  for (const [fn, color] of parts) fn(gb, { color });
  return gb.build();
}

// ---------- the layer ----------

export class Props {
  constructor(engine, world, quality, lang) {
    this.name = 'props';
    this.engine = engine;
    this.world = world;
    this.net = world.net;
    this.lang = lang;
    this.shadows = quality.shadows > 0;
    this.scene = engine.scene;
    this.nodeInfo = computeNodeInfo(world);
    world.colliders = world.colliders ?? new SpatialHash(32);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 });
    this.textures = new Map();
    this.faceGeos = new Map();
    this.night = 0;
    this.buckets = this.bucketise();
    // street lights
    const poleGeo = mergeParts([
      [(gb, a) => gb.cylinder(0, 0, 0, 0.11, 0.08, 9, 8, a, false), C.darkMetal],
      [(gb, a) => gb.box(0, 8.9, 1.1, 0.12, 0.12, 2.3, 0, a), C.darkMetal],
      [(gb, a) => gb.box(0, 8.82, 2.2, 0.36, 0.16, 0.7, 0, a), C.darkMetal],
    ]);
    this.poles = new InstancedPool(this.scene, poleGeo, this.material, 3000, { shadows: this.shadows });
    const glowGeo = new THREE.BoxGeometry(0.3, 0.04, 0.6);
    glowGeo.translate(0, 8.72, 2.2);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x555555, toneMapped: false });
    this.glows = new InstancedPool(this.scene, glowGeo, this.glowMat, 3000);
    // roadside delineator posts: white with a black band
    const postGeo = mergeParts([
      [(gb, a) => gb.box(0, 0.45, 0, 0.12, 0.9, 0.12, 0, a), C.white],
      [(gb, a) => gb.box(0, 0.98, 0, 0.125, 0.16, 0.125, 0, a), C.black],
    ]);
    this.posts = new InstancedPool(this.scene, postGeo, this.material, 6000);
    // traffic lights: heads plus lamps coloured by the current phase
    const headGeo = mergeParts([[(gb, a) => gb.box(0, 0, -0.12, 0.42, 1.15, 0.28, 0, a), C.black]]);
    this.heads = new InstancedPool(this.scene, headGeo, this.material, 1200);
    const lampGeo = new THREE.CircleGeometry(0.12, 12);
    this.lampMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.lamps = new InstancedPool(this.scene, lampGeo, this.lampMat, 3600, { colors: true });
    this.lampTimer = 0;
    // a few real lights follow the nearest street lamps at night
    this.pointLights = [];
    const count = quality.shadows > 0 ? 4 : 0;
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 34, 1.6);
      this.scene.add(l);
      this.pointLights.push(l);
    }
    this.lightTimer = 0;
  }

  setLanguage(lang) {
    // Road signs are bilingual like real federal road signs; nothing to repaint.
    this.lang = lang;
  }

  key(x, z) {
    return Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  }

  // Precomputes world positions of signs, cameras, signal approaches and lot signs per chunk.
  bucketise() {
    const net = this.net;
    const buckets = new Map();
    const put = (x, z, item) => {
      const k = this.key(x, z);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(item);
    };
    for (const s of this.world.signs) {
      const e = net.edges[s.edge];
      if (!e.alive) continue;
      const t = e.type;
      const off = t.highway ? t.pavedHalf + 1.6 : t.pavedHalf + t.sidewalk - 0.5;
      const p = net.pointAt(e, s.s, s.dir * off);
      const travel = s.dir > 0 ? p.heading : p.heading + Math.PI;
      put(p.x, p.z, { type: 'sign', x: p.x, z: p.z, y: p.y, yaw: travel + Math.PI, sign: s, bridge: e.bridge[p.i] });
    }
    for (const cam of this.world.cameras) {
      const e = net.edges[cam.edge];
      for (const dir of [1, -1]) {
        const p = net.pointAt(e, cam.s + dir * 6, dir * (e.type.pavedHalf + 1.4));
        const travel = dir > 0 ? p.heading : p.heading + Math.PI;
        put(p.x, p.z, { type: 'camera', x: p.x, z: p.z, y: p.y, yaw: travel + Math.PI, reach: e.type.pavedHalf * 0.55 });
      }
    }
    for (const n of net.nodes) {
      if (!n.signal) continue;
      const inf = this.nodeInfo[n.id];
      for (const eid of n.signal.edges) {
        const e = net.edges[eid];
        if (!e.alive) continue;
        const trim = inf.trims.get(eid) ?? 6;
        const atA = e.a === n.id;
        const s = atA ? trim + 5.6 : e.len - trim - 5.6;
        if (s < 1 || s > e.len - 1) continue;
        // traffic heading toward the node: right side is +lateral when travelling a->b
        const dir = atA ? -1 : 1;
        const t = e.type;
        const p = net.pointAt(e, s, dir * (t.pavedHalf + 0.6));
        const travel = dir > 0 ? p.heading : p.heading + Math.PI;
        put(p.x, p.z, { type: 'signal', x: p.x, z: p.z, y: p.y, yaw: travel + Math.PI, node: n, edge: eid, arm: t.pavedHalf + 0.6 - (t.median / 2 + t.laneWidth * t.lanes * 0.5) });
      }
    }
    for (const lot of this.world.lots) {
      const L = layoutLot(lot);
      if (!L.sign) continue;
      put(L.sign.x, L.sign.z, { type: 'lot', x: L.sign.x, z: L.sign.z, y: lot.y, yaw: L.sign.heading, lot, sign: L.sign });
    }
    return buckets;
  }

  texture(key, paint) {
    let entry = this.textures.get(key);
    if (!entry) {
      const b = paint();
      const tex = new THREE.CanvasTexture(b.c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, alphaTest: b.alpha ? 0.5 : 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
      entry = { tex, mat, refs: 0, w: b.w, h: b.h };
      this.textures.set(key, entry);
    }
    entry.refs++;
    return entry;
  }

  release(key) {
    const e = this.textures.get(key);
    if (!e) return;
    if (--e.refs <= 0) {
      e.tex.dispose();
      e.mat.dispose();
      this.textures.delete(key);
    }
  }

  faceGeo(w, h) {
    const k = w.toFixed(2) + 'x' + h.toFixed(2);
    let g = this.faceGeos.get(k);
    if (!g) {
      g = new THREE.PlaneGeometry(w, h);
      this.faceGeos.set(k, g);
    }
    return g;
  }

  // Adds a painted face plus its backing plate and posts. yaw points the face toward the viewer.
  face(out, gb, key, paint, x, y, z, yaw, bottom, posts = 2) {
    const entry = this.texture(key, paint);
    out.keys.push(key);
    const { w, h } = entry;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const mesh = new THREE.Mesh(this.faceGeo(w, h), entry.mat);
    mesh.position.set(x + fx * 0.05, y + bottom + h / 2, z + fz * 0.05);
    mesh.rotation.y = yaw;
    mesh.castShadow = this.shadows;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    out.group.add(mesh);
    const round = key.startsWith('limit');
    const back = round ? w * 0.6 : w + 0.06;
    gb.box(x - fx * 0.01, y + bottom + h / 2, z - fz * 0.01, back, round ? back : h + 0.06, 0.06, yaw, { color: C.metal });
    const rx = -fz;
    const rz = fx;
    const span = posts === 1 ? [0] : [-w * 0.32, w * 0.32];
    for (const u of span) gb.cylinder(x + rx * u - fx * 0.08, y - 0.6, z + rz * u - fz * 0.08, 0.05, 0.05, bottom + h * 0.9 + 0.6, 6, { color: C.metal }, false);
  }

  *build(chunk) {
    const out = { group: new THREE.Group(), keys: [], colliders: [] };
    out.group.matrixAutoUpdate = false;
    const gb = new GeoBuilder({ color: 3 });
    const items = this.buckets.get(chunk.cx + ',' + chunk.cz) ?? [];
    const signals = [];
    const heads = [];
    for (const it of items) {
      if (it.type === 'sign') this.emitSign(out, gb, it);
      else if (it.type === 'camera') this.emitCamera(gb, it);
      else if (it.type === 'signal') this.emitSignal(gb, it, heads, signals);
      else if (it.type === 'lot') this.emitLotSign(out, gb, it);
    }
    yield;
    const poles = [];
    const posts = [];
    this.emitRoadside(chunk, gb, poles, posts, out);
    yield;
    const geo = gb.build();
    if (geo) {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.matrixAutoUpdate = false;
      out.group.add(mesh);
    }
    this.scene.add(out.group);
    this.poles.set(chunk.key, poles);
    this.glows.set(chunk.key, poles);
    this.posts.set(chunk.key, posts);
    this.heads.set(chunk.key, heads);
    this.lamps.set(chunk.key, signals);
    return out;
  }

  dispose(chunk, out) {
    this.scene.remove(out.group);
    for (const child of out.group.children) if (child.material === this.material) child.geometry.dispose();
    for (const k of out.keys) this.release(k);
    for (const c of out.colliders) this.world.colliders.remove(c, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r);
    for (const pool of [this.poles, this.glows, this.posts, this.heads, this.lamps]) pool.remove(chunk.key);
  }

  collider(out, x, z, w, d, heading, kind) {
    const r = Math.hypot(w, d) / 2 + 0.5;
    const c = { x, z, w, d, heading, kind, h: 1.2, r };
    this.world.colliders.insertBox(c, x - r, z - r, x + r, z + r);
    out.colliders.push(c);
  }

  emitSign(out, gb, it) {
    const s = it.sign;
    let key;
    let paint;
    let bottom = 2.1;
    switch (s.kind) {
      case 'distance':
        key = 'dist:' + s.lines.map((l) => l.join('|')).join('/') + ':' + (s.ref ?? '');
        paint = () => PAINT.distance(s);
        bottom = 2.2;
        break;
      case 'city':
      case 'village':
        key = s.kind + ':' + s.ru;
        paint = () => PAINT.city({ ...s, small: s.kind === 'village' });
        bottom = 1.6;
        break;
      case 'cityEnd':
      case 'villageEnd':
        key = s.kind + ':' + s.ru;
        paint = () => PAINT.city({ ...s, small: s.kind === 'villageEnd' }, true);
        bottom = 1.6;
        break;
      case 'pointer':
        key = 'ptr:' + s.ru + ':' + s.km + ':' + s.right + ':' + !!s.plain;
        paint = () => PAINT.pointer(s);
        bottom = 1.7;
        break;
      case 'limit':
        key = 'limit:' + s.value;
        paint = () => PAINT.limit(s);
        bottom = 1.9;
        break;
      case 'camera':
        key = 'camera';
        paint = () => PAINT.camera();
        bottom = 1.7;
        break;
      case 'advance':
        key = 'adv:' + s.ru + ':' + (s.ref ?? '');
        paint = () => PAINT.advance(s);
        bottom = 2.2;
        break;
      case 'route':
        key = 'route:' + s.ref + ':' + (s.name ?? '');
        paint = () => PAINT.route(s);
        bottom = 2.0;
        break;
      default:
        return;
    }
    const posts = s.kind === 'limit' || s.kind === 'camera' || s.kind === 'route' ? 1 : 2;
    this.face(out, gb, key, paint, it.x, it.y - 0.15, it.z, it.yaw, bottom, posts);
  }

  emitCamera(gb, it) {
    const fx = Math.sin(it.yaw);
    const fz = Math.cos(it.yaw);
    const rx = -fz;
    const rz = fx;
    const y = it.y - 0.2;
    gb.cylinder(it.x, y, it.z, 0.14, 0.11, 6.4, 8, { color: C.metal }, true);
    // arm reaching over the shoulder: the face looks back at traffic, so the road lies to the face's right
    gb.box(it.x + rx * 1.2, y + 6.2, it.z + rz * 1.2, 0.12, 0.12, 2.4, it.yaw + Math.PI / 2, { color: C.metal });
    gb.box(it.x + rx * 2.2, y + 5.9, it.z + rz * 2.2, 0.42, 0.42, 0.75, it.yaw, { color: [0.85, 0.86, 0.84] });
    gb.box(it.x + rx * 2.2 + fx * 0.4, y + 5.9, it.z + rz * 2.2 + fz * 0.4, 0.26, 0.26, 0.08, it.yaw, { color: C.black });
    gb.box(it.x, y + 1.1, it.z, 0.5, 0.8, 0.35, it.yaw, { color: [0.78, 0.79, 0.77] });
  }

  emitSignal(gb, it, heads, lamps) {
    const fx = Math.sin(it.yaw);
    const fz = Math.cos(it.yaw);
    const rx = -fz;
    const rz = fx;
    const y = it.y;
    gb.cylinder(it.x, y - 0.3, it.z, 0.12, 0.1, 6.6, 8, { color: C.darkMetal }, true);
    // mast arm over the approach lanes: the road lies to the face's right
    const reach = Math.max(2.5, it.arm);
    gb.box(it.x + rx * (reach / 2), y + 6.1, it.z + rz * (reach / 2), 0.12, 0.14, reach, it.yaw + Math.PI / 2, { color: C.darkMetal });
    const add = (hx, hy, hz) => {
      heads.push({ matrix: placeMatrix(hx, hy, hz, it.yaw) });
      [0.36, 0, -0.36].forEach((dy, k) => {
        const m = placeMatrix(hx + fx * 0.03, hy + dy, hz + fz * 0.03, it.yaw);
        lamps.push({ matrix: m, node: it.node, edge: it.edge, color: k });
      });
    };
    add(it.x + fx * 0.2, y + 2.9, it.z + fz * 0.2);
    add(it.x + rx * reach + fx * 0.05, y + 5.4, it.z + rz * reach + fz * 0.05);
  }

  emitLotSign(out, gb, it) {
    const s = it.sign;
    const lot = it.lot;
    if (s.kind === 'fuel') this.face(out, gb, 'lot:fuel', () => PAINT.fuel(), it.x, it.y, it.z, it.yaw, 1.0, 2);
    else if (s.kind === 'service') this.face(out, gb, 'lot:service', () => PAINT.service(), it.x, it.y, it.z, it.yaw, 2.6, 2);
    else if (s.kind === 'cafe') this.face(out, gb, 'lot:cafe', () => PAINT.cafe(), it.x, it.y, it.z, it.yaw, 2.4, 2);
    else if (s.text) {
      const co = COMPANIES[lot.company];
      this.face(out, gb, 'co:' + lot.company, () => PAINT.company({ ru: s.text[0], en: s.text[1], color: co?.color ?? s.color }), it.x, it.y, it.z, it.yaw, 1.4, 2);
    }
  }

  // Street lights, delineators, median barriers and bridges for every road segment in the chunk.
  emitRoadside(chunk, gb, poles, posts, out) {
    const net = this.net;
    const world = this.world;
    const { x0, z0 } = chunk;
    const ids = new Set();
    for (const key of net.hash.query(x0, z0, x0 + CHUNK, z0 + CHUNK)) ids.add(Math.floor(key / 8192));
    const inside = (x, z) => x >= x0 && x < x0 + CHUNK && z >= z0 && z < z0 + CHUNK;
    for (const id of ids) {
      const e = net.edges[id];
      if (!e.alive) continue;
      const t = e.type;
      const trimA = (this.nodeInfo[e.a].trims.get(e.id) ?? 0) + 4;
      const trimB = e.len - (this.nodeInfo[e.b].trims.get(e.id) ?? 0) - 4;
      const villages = e.city < 0 ? world.villages.filter((v) => v.edge === e.id) : [];
      for (let i = 0; i < e.xs.length - 1; i++) {
        const mx = (e.xs[i] + e.xs[i + 1]) / 2;
        const mz = (e.zs[i] + e.zs[i + 1]) / 2;
        if (!inside(mx, mz)) continue;
        const s0 = e.ss[i];
        const s1 = e.ss[i + 1];
        const bridge = e.bridge[i] && e.bridge[i + 1];
        const A = { x: e.xs[i], y: e.ys[i], z: e.zs[i] };
        const B = { x: e.xs[i + 1], y: e.ys[i + 1], z: e.zs[i + 1] };
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const len = Math.hypot(dx, dz) || 1;
        const fx = dx / len;
        const fz = dz / len;
        const rx = -fz;
        const rz = fx;
        const heading = Math.atan2(fx, fz);
        const within = s1 > trimA && s0 < trimB;
        // street lights every 30 m in cities and villages
        const lit = e.city >= 0 || villages.some((v) => Math.abs((s0 + s1) / 2 - v.s) < v.half);
        if (lit && within) {
          const step = e.city >= 0 ? 30 : 40;
          for (let s = Math.ceil(s0 / step) * step; s < s1; s += step) {
            if (s < trimA || s > trimB) continue;
            const k = Math.round(s / step);
            const sides = t.id === 'A' || t.id === 'M' ? [1, -1] : [k % 2 ? 1 : -1];
            for (const side of sides) {
              const lat = side * (t.pavedHalf + (t.sidewalk > 0 ? 0.6 : 1.4));
              const p = net.pointAt(e, s, lat);
              const yaw = Math.atan2(-rx * side, -rz * side);
              poles.push({ matrix: placeMatrix(p.x, p.y - 0.2, p.z, yaw), x: p.x, y: p.y + 8.7, z: p.z, ax: -rx * side, az: -rz * side });
            }
          }
        }
        // delineator posts on rural highways
        if (t.highway && !bridge && !lit) {
          const atts = e.attachments ?? [];
          for (let s = Math.ceil(s0 / 50) * 50; s < s1; s += 50) {
            if (s < trimA + 20 || s > trimB - 20) continue;
            for (const side of [1, -1]) {
              if (atts.some((a) => a.side === side && Math.abs(a.s - s) < 14)) continue;
              const p = net.pointAt(e, s, side * (t.pavedHalf + 0.9));
              posts.push({ matrix: placeMatrix(p.x, p.y - 0.12, p.z, heading) });
            }
          }
        }
        // median barrier on dual carriageways
        if (t.id === 'M' && within) {
          const a = Math.max(s0, trimA);
          const b = Math.min(s1, trimB);
          if (b - a > 0.5) this.barrier(gb, e, a, b, 0, true, out);
        }
        if (bridge) this.bridgeSegment(gb, e, i, A, B, { fx, fz, rx, rz, heading, len }, out);
      }
    }
  }

  // W-beam barrier between s0 and s1 at a lateral offset; double-sided in the median.
  barrier(gb, e, s0, s1, lat, double, out) {
    const net = this.net;
    const p0 = net.pointAt(e, s0, lat);
    const p1 = net.pointAt(e, s1, lat);
    const mx = (p0.x + p1.x) / 2;
    const mz = (p0.z + p1.z) / 2;
    const my = (p0.y + p1.y) / 2;
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const heading = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    const rx = -Math.cos(heading);
    const rz = Math.sin(heading);
    const offs = double ? [-0.16, 0.16] : [0];
    for (const o of offs) gb.box(mx + rx * o, my + 0.7, mz + rz * o, 0.06, 0.32, len + 0.05, heading, { color: C.metal }, 0.3);
    for (let s = Math.ceil(s0 / 4) * 4; s < s1; s += 4) {
      const p = net.pointAt(e, s, lat);
      gb.box(p.x, p.y + 0.35, p.z, 0.12, 0.7, 0.12, heading, { color: C.darkMetal }, 0.3, 31);
    }
    this.collider(out, mx, mz, double ? 0.5 : 0.3, len, heading, 'barrier');
  }

  bridgeSegment(gb, e, i, A, B, f, out) {
    const t = e.type;
    const net = this.net;
    const half = t.pavedHalf;
    const edge = half + 0.7;
    const at = (P, lat, dy) => [P.x + f.rx * lat, P.y + dy, P.z + f.rz * lat];
    const quad = (p0, p1, p2, p3, color) => gb.face(p0, p1, p2, p3, null, { color });
    // deck sides and underside
    quad(at(B, edge, -0.05), at(A, edge, -0.05), at(A, edge, -1.5), at(B, edge, -1.5), C.deck);
    quad(at(A, -edge, -0.05), at(B, -edge, -0.05), at(B, -edge, -1.5), at(A, -edge, -1.5), C.deck);
    quad(at(A, edge, -1.5), at(A, -edge, -1.5), at(B, -edge, -1.5), at(B, edge, -1.5), C.deck);
    // concrete parapets with a metal rail on top, plus their colliders
    for (const side of [1, -1]) {
      const lat = side * (half + 0.42);
      const mx = (A.x + B.x) / 2 + f.rx * lat;
      const mz = (A.z + B.z) / 2 + f.rz * lat;
      const my = (A.y + B.y) / 2;
      gb.box(mx, my + 0.15, mz, 0.4, 0.9, f.len + 0.04, f.heading, { color: C.concrete }, 0.3, 63);
      gb.box(mx, my + 0.95, mz, 0.1, 0.1, f.len + 0.04, f.heading, { color: C.metal }, 0.3, 63);
      // the parapet sits outside the paved width: also cover the strip between road and wall
      if (side > 0) quad(at(B, half, -0.02), at(A, half, -0.02), at(A, half + 0.24, -0.02), at(B, half + 0.24, -0.02), C.concrete);
      else quad(at(A, -half, -0.02), at(B, -half, -0.02), at(B, -half - 0.24, -0.02), at(A, -half - 0.24, -0.02), C.concrete);
      this.collider(out, mx, mz, 0.5, f.len + 0.1, f.heading, 'barrier');
    }
    // piers every ~36 m, kept off any road passing underneath
    const s0 = e.ss[i];
    const s1 = e.ss[i + 1];
    const k0 = Math.floor(s0 / 36);
    const k1 = Math.floor(s1 / 36);
    if (k1 > k0) {
      const s = k1 * 36;
      const p = net.pointAt(e, s);
      if (net.query(p.x, p.z, 3).some((q) => q.edge !== e)) return;
      const ground = Math.min(this.world.terrainHeight(p.x, p.z), WATER_LEVEL - 3.5);
      const top = p.y - 1.5;
      const h = top - ground;
      if (h < 1.2) return;
      gb.box(p.x, top - 0.45, p.z, half * 2 + 0.6, 0.9, 1.6, f.heading, { color: C.pier }, 0.3);
      for (const side of [-0.55, 0.55]) {
        const cx = p.x + f.rx * side * half;
        const cz = p.z + f.rz * side * half;
        gb.box(cx, ground + (h - 0.9) / 2, cz, 1.4, h - 0.9, 1.4, f.heading, { color: C.pier }, 0.3, 15);
      }
    }
  }

  update(dt, camPos, night) {
    this.night = night;
    this.poles.flush();
    this.glows.flush();
    this.posts.flush();
    this.heads.flush();
    const lampsChanged = this.lamps.flush();
    // street light glow and retro-reflective signs
    const warm = clamp(night * 1.3, 0, 1);
    this.glowMat.color.setRGB(0.35 + warm * 2.6, 0.35 + warm * 1.9, 0.33 + warm * 1.0);
    const reflect = night * 0.32;
    for (const e of this.textures.values()) e.mat.emissiveIntensity = reflect;
    // traffic light colours
    this.lampTimer -= dt;
    if (this.lampTimer <= 0 || lampsChanged) {
      this.lampTimer = 0.15;
      const time = this.world.signalTime ?? performance.now() / 1000;
      const col = this.lamps.mesh.instanceColor;
      const arr = col.array;
      for (const it of this.lamps.items) {
        const phase = signalPhase(it.node, it.edge, time);
        const active = (phase === 'red' && it.color === 0) || (phase === 'yellow' && it.color === 1) || (phase === 'green' && it.color === 2);
        const k = active ? 2.2 : 0.12;
        const base = it.color === 0 ? [1, 0.12, 0.08] : it.color === 1 ? [1, 0.7, 0.1] : [0.15, 1, 0.45];
        arr[it.index * 3] = base[0] * k;
        arr[it.index * 3 + 1] = base[1] * k;
        arr[it.index * 3 + 2] = base[2] * k;
      }
      col.needsUpdate = true;
    }
    // nearest lamps get real point lights after dusk
    this.lightTimer -= dt;
    if (this.pointLights.length && this.lightTimer <= 0) {
      this.lightTimer = 0.4;
      const lamps = this.poles.items;
      const best = [];
      if (night > 0.2) {
        for (const l of lamps) {
          const d = (l.x - camPos.x) ** 2 + (l.z - camPos.z) ** 2;
          if (d > 160 * 160) continue;
          best.push({ l, d });
        }
        best.sort((a, b) => a.d - b.d);
      }
      this.pointLights.forEach((pl, k) => {
        const b = best[k];
        if (!b) {
          pl.intensity = 0;
          return;
        }
        pl.position.set(b.l.x + b.l.ax * 2.2, b.l.y - 0.6, b.l.z + b.l.az * 2.2);
        pl.intensity = 60 * clamp((night - 0.2) * 2, 0, 1);
      });
    }
  }
}
