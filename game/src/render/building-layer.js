import * as THREE from 'three';
import { GeoBuilder } from './geo-builder.js';
import { FACADES, FACADE_PBR, F, paintFacades } from './facades.js';
import { GLSL_HASH, patchMaterial } from './patch.js';
import { emitBuilding, emitBuildingSimple } from './building-types.js';
import { CityBuildings } from '../world/city-buildings.js';
import { generateVillage } from '../world/villages.js';
import { layoutLot } from '../world/lot-layout.js';
import { L } from './surfaces.js';
import { loadImage } from './textures.js';
import { SpatialHash } from '../core/util.js';
import { emitLandmarks, landmarkColliders } from './landmarks.js';

// Facade tiles rendered from 3D geometry in Blender (tools/blender/facades.py): colour, normal, glass mask.
const BAKED = ['panelWhite', 'panelBeige', 'panelTower', 'khrushchevka', 'khrushchevkaBrick', 'redBrick', 'stalinkaYellow', 'stalinkaPeach', 'merchant', 'modernResidential', 'school'];

export async function loadFacadeImages(base = 'assets/facades/') {
  const out = {};
  await Promise.all(
    BAKED.map(async (n) => {
      try {
        const [col, nrm, msk] = await Promise.all([loadImage(base + n + '.webp'), loadImage(base + n + '_n.webp'), loadImage(base + n + '_m.png')]);
        out[n] = { col, nrm, msk };
      } catch (e) {
        console.warn('facade', n, e);
      }
    })
  );
  return out;
}

// Colour (rgb) + glass mask (a), and a normal map per layer. Rows run bottom-up (v grows upward on walls).
export function facadeArray(size, baked = {}) {
  const painted = paintFacades();
  const n = painted.length;
  const data = new Uint8Array(size * size * 4 * n);
  const ndata = new Uint8Array(size * size * 4 * n);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = size;
  const g = tmp.getContext('2d', { willReadFrequently: true });
  const read = (img) => {
    g.save();
    g.clearRect(0, 0, size, size);
    g.translate(0, size);
    g.scale(1, -1);
    g.drawImage(img, 0, 0, size, size);
    g.restore();
    return g.getImageData(0, 0, size, size).data;
  };
  painted.forEach((p, i) => {
    const b = baked[FACADES[i]];
    const col = read(b ? b.col : p.color);
    const mask = read(b ? b.msk : p.mask);
    const nrm = b ? read(b.nrm) : null;
    const off = i * size * size * 4;
    for (let k = 0; k < size * size; k++) {
      data[off + k * 4] = col[k * 4];
      data[off + k * 4 + 1] = col[k * 4 + 1];
      data[off + k * 4 + 2] = col[k * 4 + 2];
      data[off + k * 4 + 3] = mask[k * 4];
      ndata[off + k * 4] = nrm ? nrm[k * 4] : 128;
      ndata[off + k * 4 + 1] = nrm ? nrm[k * 4 + 1] : 128;
      ndata[off + k * 4 + 2] = nrm ? nrm[k * 4 + 2] : 255;
      ndata[off + k * 4 + 3] = 255;
    }
  });
  const make = (arr, srgb) => {
    const tex = new THREE.DataArrayTexture(arr, size, size, n);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return { color: make(data, true), normal: make(ndata, false) };
}

export function buildingMaterial(facades) {
  const pbr = FACADES.map((name) => FACADE_PBR[name] ?? [0.9, 0.12, 0.0]);
  const uniforms = { uFacade: { value: facades.color }, uFacadeN: { value: facades.normal }, uNight: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  return patchMaterial(m, {
    key: 'building',
    uniforms,
    vertexHead: 'attribute float aLayer;\nattribute float aSeed;\nattribute vec3 aTint;\nvarying float vLayer;\nvarying float vSeed;\nvarying vec3 vTint;\nvarying vec2 vFUv;',
    vertexBody: 'vLayer = aLayer; vSeed = aSeed; vTint = aTint; vFUv = uv;',
    fragmentHead: `
      precision highp sampler2DArray;
      uniform sampler2DArray uFacade;
      uniform sampler2DArray uFacadeN;
      uniform float uNight;
      vec3 perturbFacade(vec3 n, vec3 pos, vec2 uv, vec3 ts) {
        vec3 q0 = dFdx(pos);
        vec3 q1 = dFdy(pos);
        vec2 st0 = dFdx(uv);
        vec2 st1 = dFdy(uv);
        vec3 q1perp = cross(q1, n);
        vec3 q0perp = cross(n, q0);
        vec3 T = q1perp * st0.x + q0perp * st1.x;
        vec3 B = q1perp * st0.y + q0perp * st1.y;
        float det = max(dot(T, T), dot(B, B));
        float scale = det == 0.0 ? 0.0 : inversesqrt(det);
        return normalize(T * (ts.x * scale) + B * (ts.y * scale) + n * ts.z);
      }
      varying float vLayer;
      varying float vSeed;
      varying vec3 vTint;
      varying vec2 vFUv;
      ${GLSL_HASH}
      const vec3 PBR[${pbr.length}] = vec3[${pbr.length}](${pbr.map((p) => `vec3(${p.map((v) => v.toFixed(2)).join(',')})`).join(',')});
    `,
    fragmentMap: `
      float layerIdx = floor(vLayer + 0.5);
      vec4 fac = texture(uFacade, vec3(vFUv * 0.25, layerIdx));
      diffuseColor.rgb *= fac.rgb * vTint;
      float glassMask = fac.a;
      vec3 pbrv = PBR[int(layerIdx)];
    `,
    fragmentNormal: `
      #include <normal_fragment_maps>
      if (abs(vWorldNormal.y) < 0.5) {
        vec3 tsn = texture(uFacadeN, vec3(vFUv * 0.25, layerIdx)).xyz * 2.0 - 1.0;
        normal = perturbFacade(normal, -vViewPosition, vFUv, tsn);
      }
    `,
    fragmentRoughness: 'float roughnessFactor = mix(pbrv.x, pbrv.y, glassMask);',
    fragmentMetalness: 'float metalnessFactor = pbrv.z * (1.0 - glassMask * 0.7);',
    fragmentEmissive: `
      {
        vec2 cell = floor(vFUv + 0.0001);
        float h = hash12(cell * 1.37 + vec2(vSeed * 0.71, vSeed * 0.13));
        float on = step(0.48, h) * step(0.5, glassMask);
        vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.78, 0.86, 1.0), step(0.86, fract(h * 9.7)));
        warm *= 0.6 + 0.6 * fract(h * 31.3);
        totalEmissiveRadiance += warm * on * uNight * 1.35;
      }
    `,
  });
}

// WorldView extra: buildings, lot structures, yards and fences per chunk.
export class BuildingLayer {
  constructor(world, material, roadMaterial, markMaterial, scene, quality) {
    this.name = 'buildings';
    this.world = world;
    this.material = material;
    this.roadMaterial = roadMaterial;
    this.markMaterial = markMaterial;
    this.scene = scene;
    this.shadows = quality.shadows > 0;
    this.cityData = new Map();
    world.colliders = world.colliders ?? new SpatialHash(32);
    this.registered = new Set();
    this.chunks = new Map();
    this.nearLod = quality.shadows === 0 ? 380 : quality.trees >= 1 ? 700 : 520;
  }

  city(city) {
    let cb = this.cityData.get(city.index);
    if (!cb) {
      cb = new CityBuildings(this.world, city);
      this.cityData.set(city.index, cb);
    }
    return cb;
  }

  collider(b, kind = 'building') {
    const c = { x: b.x, z: b.z, w: b.w, d: b.d, heading: b.heading, kind, h: b.h ?? 10 };
    const r = Math.hypot(b.w, b.d) / 2 + 1;
    this.world.colliders.insertBox(c, b.x - r, b.z - r, b.x + r, b.z + r);
  }

  fenceCollider(p0, p1) {
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    if (len < 0.5) return;
    const a = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    this.collider({ x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2, w: len, d: 0.25, heading: a + Math.PI / 2 }, 'fence');
  }

  registerCity(cb) {
    const key = 'c' + cb.city.index;
    if (this.registered.has(key)) return;
    this.registered.add(key);
    for (const b of cb.list) this.collider(b);
    for (const c of landmarkColliders(this.world, cb.city)) this.collider(c, 'landmark');
  }

  registerLot(lot) {
    const key = 'l' + lot.id;
    if (this.registered.has(key)) return;
    this.registered.add(key);
    const L_ = layoutLot(lot);
    for (const s of L_.structures) if (s.type !== 'canopy') this.collider(s);
    for (const [a, b] of L_.fences) this.fenceCollider(a, b);
  }

  registerVillage(v) {
    const key = 'v' + v.id;
    if (this.registered.has(key)) return;
    this.registered.add(key);
    for (const b of v.buildings) {
      this.collider(b);
      if (b.fence) for (const [p0, p1] of fenceSegments(b.fence)) this.fenceCollider(p0, p1);
    }
  }

  *build(chunk) {
    const { x0, z0 } = chunk;
    const size = 512;
    const gb = new GeoBuilder({ aLayer: 1, aSeed: 1, aTint: 3 });
    gb.setOrigin(x0, 0, z0);
    // far level of detail, shown instead of gb beyond NEAR_LOD metres
    const far = new GeoBuilder({ aLayer: 1, aSeed: 1, aTint: 3 });
    far.setOrigin(x0, 0, z0);
    // landmarks stay detailed at any distance
    const lm = new GeoBuilder({ aLayer: 1, aSeed: 1, aTint: 3 });
    lm.setOrigin(x0, 0, z0);
    const yard = new GeoBuilder({ aLayer: 1, aTint: 3 });
    yard.setOrigin(x0, 0, z0);
    const marks = new GeoBuilder({ aLayer: 1, aTint: 3 });
    marks.setOrigin(x0, 0, z0);
    const inside = (x, z) => x >= x0 && x < x0 + size && z >= z0 && z < z0 + size;
    const trees = [];
    // cities overlapping this chunk
    for (const c of this.world.cities) {
      const reach = c.Rout + 200;
      if (c.x + reach < x0 || c.x - reach > x0 + size || c.z + reach < z0 || c.z - reach > z0 + size) continue;
      const cb = this.city(c);
      if (!cb.done) yield* cb.generate();
      this.registerCity(cb);
      let n = 0;
      for (const b of cb.list) {
        if (!inside(b.x, b.z)) continue;
        emitBuilding(gb, b);
        emitBuildingSimple(far, b);
        if (++n % 20 === 0) yield;
      }
      for (const t of cb.trees) if (inside(t.x, t.z)) trees.push(t);
      if (inside(c.x, c.z)) {
        emitLandmarks(lm, this.world, c, yard);
        yield;
      }
    }
    // villages
    for (const v of this.world.villages) {
      if (Math.abs(v.x - (x0 + size / 2)) > size / 2 + v.half + 80 || Math.abs(v.z - (z0 + size / 2)) > size / 2 + v.half + 80) continue;
      generateVillage(this.world, v);
      this.registerVillage(v);
      for (const b of v.buildings) {
        if (!inside(b.x, b.z)) continue;
        emitBuilding(gb, b);
        emitBuildingSimple(far, b);
        if (b.fence) emitFence(gb, b.fence, b.seed);
      }
      for (const t of v.trees) if (inside(t.x, t.z)) trees.push(t);
      yield;
    }
    // lots: depots, fuel stations, services
    for (const lot of new Set(this.world.lotHash.query(x0, z0, x0 + size, z0 + size))) {
      if (!inside(lot.x, lot.z)) continue;
      this.registerLot(lot);
      emitLot(gb, yard, marks, lot);
      for (const s of layoutLot(lot).structures) emitBuildingSimple(far, s);
    }
    chunk.cityTrees = trees;
    const out = { meshes: [], near: [], far: [], cx: x0 + size / 2, cz: z0 + size / 2, isNear: true };
    const add = (builder, material, cast, group) => {
      const geo = builder.build();
      if (!geo) return null;
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x0, 0, z0);
      mesh.castShadow = cast && this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      out.meshes.push(mesh);
      group?.push(mesh);
      return mesh;
    };
    add(gb, this.material, true, out.near);
    add(far, this.material, false, out.far);
    add(lm, this.material, true, null);
    add(yard, this.roadMaterial, false, null);
    add(marks, this.markMaterial, false, out.near);
    for (const m of out.far) m.visible = false;
    this.chunks.set(chunk.key, out);
    return out;
  }

  // Detailed buildings near the camera, prisms further away.
  update(camPos) {
    for (const out of this.chunks.values()) {
      const d = Math.max(Math.abs(camPos.x - out.cx), Math.abs(camPos.z - out.cz)) - 256;
      const near = d < this.nearLod;
      if (near === out.isNear) continue;
      out.isNear = near;
      for (const m of out.near) m.visible = near;
      for (const m of out.far) m.visible = !near;
    }
  }

  dispose(chunk, out) {
    this.chunks.delete(chunk.key);
    for (const m of out.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
  }
}

function fenceSegments(f) {
  const fx = Math.sin(f.heading);
  const fz = Math.cos(f.heading);
  const P = (u, v) => ({ x: f.x - fz * u + fx * v, z: f.z + fx * u + fz * v });
  const gate = 3.5;
  return [
    [P(-f.w / 2, f.d / 2), P(-gate / 2, f.d / 2)],
    [P(gate / 2 + 2.5, f.d / 2), P(f.w / 2, f.d / 2)],
    [P(f.w / 2, f.d / 2), P(f.w / 2, -f.d / 2)],
    [P(f.w / 2, -f.d / 2), P(-f.w / 2, -f.d / 2)],
    [P(-f.w / 2, -f.d / 2), P(-f.w / 2, f.d / 2)],
  ];
}

function emitFence(gb, f, seed) {
  for (const [a, b] of fenceSegments(f)) fenceBox(gb, a, b, f.y ?? null, 1.7, f.layer, seed);
}

export function fenceBox(gb, a, b, y, h, layer, seed, yb = null) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 0.3) return;
  const ang = Math.atan2(b.x - a.x, b.z - a.z);
  const ya = a.y ?? y ?? 0;
  const yy = yb ?? b.y ?? ya;
  gb.box((a.x + b.x) / 2, (ya + yy) / 2 + h / 2 - 0.2, (a.z + b.z) / 2, len, h + 0.4, 0.1, ang + Math.PI / 2, { aLayer: layer, aSeed: seed % 997, aTint: [1, 1, 1] }, 0.3);
}

function emitLot(gb, yard, marks, lot) {
  const L_ = layoutLot(lot);
  const fx = Math.sin(lot.heading);
  const fz = Math.cos(lot.heading);
  const P = (u, v) => [lot.x - fz * u + fx * v, lot.y + 0.03, lot.z + fx * u + fz * v];
  // concrete yard plus driveway to the road
  const quad = (b, p0, p1, p2, p3, layer, tint = [1, 1, 1]) => {
    const ids = [p0, p1, p2, p3].map((p) => b.vertex(p[0], p[1], p[2], 0, 1, 0, p[0] / 6, p[2] / 6, { aLayer: layer, aTint: tint }));
    const up = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    if (up > 0) b.quad(ids[0], ids[1], ids[2], ids[3]);
    else b.quad(ids[0], ids[3], ids[2], ids[1]);
  };
  const hw = lot.w / 2;
  const hd = lot.d / 2;
  quad(yard, P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd), L.YARD);
  const drive = lot.kind === 'company' ? 9 : lot.kind === 'service' ? 13 : hw - 2;
  quad(yard, P(-drive, hd - 0.5), P(drive, hd - 0.5), P(drive, hd + 4.2), P(-drive, hd + 4.2), L.ASPHALT);
  // trailer slot markings
  const line = (u0, v0, u1, v1, wdt, tint) => {
    const dx = u1 - u0;
    const dv = v1 - v0;
    const l = Math.hypot(dx, dv) || 1;
    const nu = (-dv / l) * (wdt / 2);
    const nv = (dx / l) * (wdt / 2);
    const lift = (p) => [p[0], p[1] + 0.02, p[2]];
    quad(marks, lift(P(u0 - nu, v0 - nv)), lift(P(u1 - nu, v1 - nv)), lift(P(u1 + nu, v1 + nv)), lift(P(u0 + nu, v0 + nv)), 0, tint);
  };
  for (const slot of L_.slots) {
    const lx = slot.x - lot.x;
    const lz = slot.z - lot.z;
    const u = -lx * fz + lz * fx;
    const v = lx * fx + lz * fz;
    const hl = slot.len / 2;
    const hwid = slot.width / 2;
    line(u - hwid, v - hl, u - hwid, v + hl, 0.15, [0.95, 0.95, 0.92]);
    line(u + hwid, v - hl, u + hwid, v + hl, 0.15, [0.95, 0.95, 0.92]);
    line(u - hwid, v - hl, u + hwid, v - hl, 0.25, [0.95, 0.78, 0.2]);
  }
  for (const s of L_.structures) emitBuilding(gb, s);
  for (const [a, b] of L_.fences) fenceBox(gb, { ...a, y: lot.y }, { ...b, y: lot.y }, lot.y, 2.2, F.profFence, lot.id * 13);
  for (const p of L_.pumps) {
    gb.box(p.x, lot.y + 0.1, p.z, 6, 0.2, 1.6, p.heading, { aLayer: F.concrete, aSeed: 1, aTint: [1, 1, 1] }, 0.3);
    gb.box(p.x - Math.cos(p.heading) * 1.4, lot.y + 1.0, p.z + Math.sin(p.heading) * 1.4, 0.9, 1.8, 0.6, p.heading, { aLayer: F.stadium, aSeed: 1, aTint: [0.9, 0.95, 1] }, 0.5);
    gb.box(p.x + Math.cos(p.heading) * 1.4, lot.y + 1.0, p.z - Math.sin(p.heading) * 1.4, 0.9, 1.8, 0.6, p.heading, { aLayer: F.stadium, aSeed: 1, aTint: [0.9, 0.95, 1] }, 0.5);
  }
}
