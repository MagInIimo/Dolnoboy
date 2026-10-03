import * as THREE from 'three';
import { canvas } from './textures.js';
import { rng, hash2, smoothstep } from '../core/util.js';
import { WATER_LEVEL, unproject } from '../core/geo.js';
import { forestDensity } from '../world/relief.js';
import { GeoBuilder } from './geo-builder.js';
import { patchMaterial } from './patch.js';

export const SPECIES = ['birch', 'spruce', 'pine', 'oak', 'linden', 'poplar', 'apple', 'maple', 'bush'];
const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s, i]));

// Atlas (2 x 1 cells of leaves per row pair, bark strips below). Leaf cells hold photo branches:
// a birch branch and a spruce bough, plus tinted copies for the other species.
function paintAtlas(photos, size) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const q = size / 4;
  const r = rng(99);
  const cell = (cx, cy, img, filter, flip = false) => {
    g.save();
    g.filter = filter;
    g.translate(cx * q + (flip ? q : 0), cy * q);
    g.scale(flip ? -1 : 1, 1);
    g.drawImage(img, 2, 2, q - 4, q - 4);
    g.restore();
  };
  const leaf = photos.foliage.diff;
  const bough = photos.spruce.diff;
  cell(0, 0, leaf, 'hue-rotate(10deg) saturate(1.1) brightness(0.82)');
  cell(1, 0, leaf, 'saturate(1.05) brightness(1.02)');
  cell(2, 0, bough, 'brightness(0.86)');
  cell(3, 0, bough, 'hue-rotate(-14deg) saturate(0.85) brightness(1.02)', true);
  cell(0, 1, leaf, 'hue-rotate(4deg) saturate(1.2) brightness(0.9)', true);
  cell(1, 1, leaf, 'hue-rotate(16deg) saturate(1.15) brightness(0.72)', true);
  cell(2, 1, leaf, 'hue-rotate(-38deg) saturate(1.4) brightness(1.05)');
  cell(3, 1, leaf, 'hue-rotate(8deg) saturate(0.9) brightness(0.8)');
  // apples on the apple tree cell
  g.fillStyle = '#c8321f';
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    g.arc(q * 0.15 + r() * q * 0.7, q * 1.15 + r() * q * 0.7, q * 0.012, 0, Math.PI * 2);
    g.fill();
  }
  // bark strips: birch, pine, generic, spruce
  const h = size / 8;
  const bark = (y0, base, fn) => {
    g.fillStyle = base;
    g.fillRect(0, y0, size, h);
    fn(y0);
  };
  const k = size / 1024;
  bark(size / 2, '#e2ded2', (y0) => {
    for (let i = 0; i < 300; i++) {
      g.fillStyle = r() < 0.7 ? '#2a2725' : '#8a867c';
      g.fillRect(r() * size, y0 + r() * h, (8 + r() * 26) * k, (2 + r() * 4) * k);
    }
  });
  bark(size / 2 + h, '#9c5a36', (y0) => {
    for (let i = 0; i < 500; i++) {
      g.fillStyle = r() < 0.5 ? '#5e3420' : '#b8744a';
      g.fillRect(r() * size, y0 + r() * h, (4 + r() * 10) * k, (6 + r() * 14) * k);
    }
  });
  bark(size / 2 + 2 * h, '#4f3e31', (y0) => {
    for (let i = 0; i < 600; i++) {
      g.fillStyle = r() < 0.5 ? '#33271e' : '#6a5543';
      g.fillRect(r() * size, y0 + r() * h, (3 + r() * 6) * k, (10 + r() * 20) * k);
    }
  });
  bark(size / 2 + 3 * h, '#463629', (y0) => {
    for (let i = 0; i < 500; i++) {
      g.fillStyle = r() < 0.5 ? '#2a2019' : '#5a4636';
      g.fillRect(r() * size, y0 + r() * h, (3 + r() * 8) * k, (4 + r() * 8) * k);
    }
  });
  return c;
}

const CELL = { broad: [0, 0], birch: [1, 0], spruce: [2, 0], pine: [3, 0], apple: [0, 1], broad2: [1, 1], autumn: [2, 1], bush: [3, 1] };
const BARK = { birch: 0, pine: 1, generic: 2, spruce: 3 };

function cellUV(cell) {
  const [cx, cy] = CELL[cell];
  return { u0: cx * 0.25, v0: 1 - (cy + 1) * 0.25, u1: (cx + 1) * 0.25, v1: 1 - cy * 0.25 };
}
function barkUV(kind) {
  const i = BARK[kind];
  return { u0: 0, u1: 1, v0: 1 - (0.5 + (i + 1) * 0.125), v1: 1 - (0.5 + i * 0.125) };
}

// Builds one species model in a GeoBuilder: trunk + leaf cards; uv pointing into the atlas.
// Leaf normals point away from the crown centre so a crown has a lit side and a shaded side.
function speciesModel(species, r) {
  const gb = new GeoBuilder({ aShade: 1 });
  let crown = [0, 6, 0];
  const card = (cx, cy, cz, w, h, yaw, tilt, cell, shade = 1) => {
    const uv = cellUV(cell);
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const up = [Math.sin(tilt) * c, Math.cos(tilt), -Math.sin(tilt) * s];
    const right = [c, 0, s];
    const P = (u, v) => [cx + right[0] * u + up[0] * v, cy + right[1] * u + up[1] * v, cz + right[2] * u + up[2] * v];
    const N = (p) => {
      const x = p[0] - crown[0];
      const y = (p[1] - crown[1]) * 0.8 + 1.2;
      const z = p[2] - crown[2];
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    const vert = (u, v, tu, tv, k) => {
      const p = P(u, v);
      const n = N(p);
      return gb.vertex(p[0], p[1], p[2], n[0], n[1], n[2], tu, tv, { aShade: shade * k });
    };
    const a = vert(-w / 2, -h / 2, uv.u0, uv.v0, 0.82);
    const b = vert(w / 2, -h / 2, uv.u1, uv.v0, 0.82);
    const cc = vert(w / 2, h / 2, uv.u1, uv.v1, 1);
    const d = vert(-w / 2, h / 2, uv.u0, uv.v1, 1);
    gb.idx.push(a, b, cc, a, cc, d, a, cc, b, a, d, cc);
  };
  const trunk = (h, r0, r1, bark, n = 7) => {
    const uv = barkUV(bark);
    const base = gb.count;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      gb.vertex(s * r0, -0.3, c * r0, s, 0, c, uv.u0 + (i / n) * 0.5, uv.v0, { aShade: 0.65 });
      gb.vertex(s * r1, h, c * r1, s, 0, c, uv.u0 + (i / n) * 0.5, uv.v1, { aShade: 1 });
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      gb.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  // a ball-ish crown of cards around (0, y, 0) with radius rad
  const ball = (y, rad, count, size, cell, cell2 = cell) => {
    crown = [0, y, 0];
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const e = (r() - 0.35) * 1.4;
      const d = rad * (0.35 + Math.sqrt(r()) * 0.65);
      const cy = y + Math.sin(e) * d * 0.8;
      card(Math.sin(a) * Math.cos(e) * d, cy, Math.cos(a) * Math.cos(e) * d, size * (0.85 + r() * 0.35), size * (0.85 + r() * 0.35), r() * Math.PI, (r() - 0.5) * 0.9, i % 3 ? cell : cell2, 0.72 + ((cy - y + rad) / (2 * rad)) * 0.36);
    }
  };
  switch (species) {
    case 'birch': {
      trunk(13, 0.2, 0.07, 'birch');
      ball(9.5, 3.2, 26, 3.0, 'birch');
      ball(12.2, 1.8, 8, 2.4, 'birch');
      break;
    }
    case 'spruce': {
      trunk(16, 0.3, 0.06, 'spruce');
      const tiers = 12;
      for (let t = 0; t < tiers; t++) {
        const y = 1.0 + t * 1.25;
        const rad = 3.4 * (1 - t / tiers) + 0.35;
        crown = [0, y + 3, 0];
        const n = t < 9 ? 7 : 5;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + t * 0.7 + r() * 0.3;
          card(Math.sin(a) * rad * 0.52, y + 0.4, Math.cos(a) * rad * 0.52, rad * 1.35, 2.0, a + Math.PI / 2, 0.6, 'spruce', 0.6 + (t / tiers) * 0.45);
        }
      }
      crown = [0, 14, 0];
      card(0, 16.0, 0, 1.0, 2.4, 0, 0, 'spruce', 1);
      card(0, 16.0, 0, 1.0, 2.4, Math.PI / 2, 0, 'spruce', 1);
      break;
    }
    case 'pine': {
      trunk(17, 0.32, 0.12, 'pine');
      ball(14.5, 3.0, 22, 3.2, 'pine');
      ball(12.2, 2.2, 8, 2.6, 'pine');
      break;
    }
    case 'oak':
    case 'linden':
    case 'maple': {
      trunk(species === 'linden' ? 8 : 6, 0.4, 0.18, 'generic');
      ball(species === 'linden' ? 8.5 : 7.5, 4.0, 34, 3.6, 'broad', species === 'maple' ? 'bush' : 'broad2');
      ball(species === 'linden' ? 11.2 : 10, 2.4, 10, 3.0, 'broad');
      break;
    }
    case 'poplar': {
      trunk(16, 0.32, 0.1, 'generic');
      for (let i = 0; i < 9; i++) ball(4 + i * 1.4, 1.5 - i * 0.05, 4, 2.6, 'broad2', 'broad');
      break;
    }
    case 'apple': {
      trunk(2.6, 0.17, 0.1, 'generic');
      ball(3.6, 2.0, 14, 2.2, 'apple');
      break;
    }
    default: {
      ball(1.0, 1.1, 9, 1.9, 'bush', 'broad2');
    }
  }
  return gb;
}

export class TreeSystem {
  constructor(engine, world, quality, photos) {
    this.engine = engine;
    this.world = world;
    this.name = 'trees';
    this.density = quality.trees;
    this.shadows = quality.shadows > 0;
    const atlas = new THREE.CanvasTexture(paintAtlas(photos, quality.texture >= 512 ? 2048 : 1024));
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
    this.atlas = atlas;
    // cards already carry both windings, so single-sided rendering keeps the crown normals intact
    this.material = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.FrontSide, roughness: 0.88, metalness: 0, alphaToCoverage: !!quality.antialias });
    this.wind = { value: 0 };
    patchMaterial(this.material, {
      key: 'tree',
      uniforms: { uWind: this.wind },
      vertexHead: 'attribute float aShade;\nvarying float vShade;\nuniform float uWind;',
      vertexBegin: `
        {
          #ifdef USE_INSTANCING
            vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 iPos = vec3(0.0);
          #endif
          float sway = max(0.0, position.y - 2.0) * 0.011;
          transformed.x += sin(uWind * 1.3 + iPos.x * 0.07 + position.y * 0.3) * sway;
          transformed.z += cos(uWind * 1.05 + iPos.z * 0.07 + position.y * 0.25) * sway * 0.7;
        }
      `,
      vertexBody: 'vShade = aShade;',
      fragmentHead: 'varying float vShade;',
      fragmentMap: `
        vec4 texel = texture2D(map, vMapUv);
        diffuseColor *= texel;
        diffuseColor.rgb *= vShade;
      `,
    });
    this.material.vertexColors = false;
    const r = rng(2024);
    this.near = {};
    this.capacityNear = 2400;
    for (const s of SPECIES) {
      const geo = speciesModel(s, r).build();
      const mesh = new THREE.InstancedMesh(geo, this.material, this.capacityNear);
      mesh.count = 0;
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      engine.scene.add(mesh);
      this.near[s] = mesh;
    }
    this.buildImpostors();
    this.chunks = new Map();
    this.dirty = true;
    this.lastFocus = new THREE.Vector3(1e9, 0, 1e9);
    this.timer = 0;
    this.nearRadius = quality.trees >= 1 ? 170 : 120;
  }

  // Renders each species from the side into an atlas used by far billboards.
  buildImpostors() {
    const size = 256;
    const cols = 4;
    const rows = Math.ceil(SPECIES.length / cols);
    const target = new THREE.WebGLRenderTarget(size * cols, size * rows, { samples: 0 });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x3a3a30, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.4, 1, 0.8);
    scene.add(sun);
    // capture the whole tree from the ground to 24 m; the billboard keeps the same 18 x 24 proportions
    const cam = new THREE.OrthographicCamera(-9, 9, 24, 0, 0.1, 100);
    cam.position.set(0, 0, 40);
    cam.lookAt(0, 0, 0);
    const r = this.engine.renderer;
    const prev = r.getRenderTarget();
    const prevClear = new THREE.Color();
    r.getClearColor(prevClear);
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear();
    this.heights = {};
    SPECIES.forEach((s, i) => {
      const mesh = new THREE.Mesh(this.near[s].geometry, this.material);
      scene.add(mesh);
      const col = i % cols;
      const row = Math.floor(i / cols);
      r.setViewport(col * size, (rows - 1 - row) * size, size, size);
      r.setScissor(col * size, (rows - 1 - row) * size, size, size);
      r.setScissorTest(true);
      r.render(scene, cam);
      scene.remove(mesh);
    });
    r.setScissorTest(false);
    r.setViewport(0, 0, r.domElement.width, r.domElement.height);
    r.setRenderTarget(prev);
    r.setClearColor(prevClear, prevAlpha);
    this.impostorTex = target.texture;
    const cells = SPECIES.length;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ map: target.texture, alphaTest: 0.4, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    patchMaterial(mat, {
      key: 'impostor',
      vertexHead: `attribute float aCell;\nvarying float vCell;\nuniform vec3 uCam;\n`,
      vertexBody: '',
      fragmentMap: `
        // stay half a texel inside the cell so neighbouring cells never bleed in
        vec2 cuv = clamp(vMapUv, vec2(1.0 / 256.0), vec2(1.0 - 1.0 / 256.0));
        float ci = floor(vCellF + 0.5);
        vec2 cellUv = vec2((mod(ci, ${cols}.0) + cuv.x) / ${cols}.0, (${rows}.0 - 1.0 - floor(ci / ${cols}.0) + cuv.y) / ${rows}.0);
        vec4 texel = texture2D(map, cellUv);
        diffuseColor *= texel;
      `,
      fragmentHead: 'varying float vCellF;',
    });
    // billboard: rotate the quad around Y to face the camera inside the vertex shader
    const prevCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      prevCompile(shader);
      shader.uniforms.uCam = this.camUniform;
      shader.vertexShader = shader.vertexShader
        .replace('attribute float aCell;', 'attribute float aCell;\nvarying float vCellF;')
        .replace(
          '#include <begin_vertex>',
          `
          vec3 transformed = vec3(position);
          {
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            vec2 toCam = normalize(uCam.xz - ip.xz + vec2(1e-4));
            vec2 side = vec2(toCam.y, -toCam.x);
            float sx = length(instanceMatrix[0].xyz);
            float sy = length(instanceMatrix[1].xyz);
            transformed = vec3(side.x * position.x * sx, position.y * sy, side.y * position.x * sx);
            vCellF = aCell;
          }
          `
        )
        .replace('#include <project_vertex>', `
          vec4 mvPosition = vec4(transformed + vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]), 1.0);
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;
        `)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalMatrix * objectNormal;');
    };
    this.camUniform = { value: new THREE.Vector3() };
    this.farCapacity = 90000;
    const far = new THREE.InstancedMesh(geo, mat, this.farCapacity);
    far.count = 0;
    far.frustumCulled = false;
    far.castShadow = false;
    far.receiveShadow = false;
    this.cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.farCapacity), 1);
    geo.setAttribute('aCell', this.cellAttr);
    this.engine.scene.add(far);
    this.far = far;
    void cells;
  }

  // WorldView extra hook: scatter trees for a chunk.
  *build(chunk) {
    const world = this.world;
    const list = [];
    const { x0, z0 } = chunk;
    const size = 512;
    const { lat, lon } = unproject(x0 + size / 2, z0 + size / 2);
    const north = lat > 58.5;
    const south = lat < 50;
    const step = 8.5 / Math.sqrt(this.density);
    const nx = Math.floor(size / step);
    const r = rng((chunk.cx * 73856093) ^ (chunk.cz * 19349663));
    const W = WATER_LEVEL;
    const villages = world.villages.filter((v) => v.x > x0 - v.half - 120 && v.x < x0 + size + v.half + 120 && v.z > z0 - v.half - 120 && v.z < z0 + size + v.half + 120);
    let n = 0;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nx; j++) {
        const x = x0 + (i + r()) * step;
        const z = z0 + (j + r()) * step;
        if (++n % 500 === 0) yield;
        const f = forestDensity(x, z, lat, lon);
        const lone = hash2(Math.floor(x / 40), Math.floor(z / 40), 7) < 0.035;
        if (f < 0.5 && !lone) continue;
        if (f < 0.5 && r() > 0.25) continue;
        if (r() > 0.55 + f * 0.5) continue;
        if (blocked(world, x, z, villages)) continue;
        const y = world.terrainHeight(x, z);
        if (y < W + 1.1) continue;
        let species;
        const k = r();
        if (north) species = k < 0.45 ? 'spruce' : k < 0.78 ? 'pine' : 'birch';
        else if (south) species = k < 0.55 ? 'oak' : k < 0.75 ? 'poplar' : k < 0.85 ? 'maple' : 'bush';
        else species = k < 0.36 ? 'birch' : k < 0.58 ? 'spruce' : k < 0.75 ? 'pine' : k < 0.9 ? 'oak' : 'linden';
        if (f < 0.58 && r() < 0.35) species = 'bush';
        list.push({ x, y, z, s: SPECIES_INDEX[species], scale: 0.75 + r() * 0.55, rot: r() * Math.PI * 2 });
      }
    }
    // windbreak lines along highways in the steppe
    if (south) {
      for (const key of new Set(world.net.hash.query(x0, z0, x0 + size, z0 + size))) {
        const e = world.net.edges[Math.floor(key / 8192)];
        if (!e.alive || e.city >= 0) continue;
        const i = key % 8192;
        if (i % 2) continue;
        const px = e.xs[i];
        const pz = e.zs[i];
        if (px < x0 || px >= x0 + size || pz < z0 || pz >= z0 + size) continue;
        const dx = e.xs[i + 1] - px;
        const dz = e.zs[i + 1] - pz;
        const l = Math.hypot(dx, dz) || 1;
        for (const side of [-1, 1]) {
          if (hash2(Math.floor(e.ss[i] / 400), side, e.id) < 0.45) continue;
          const off = e.type.outerHalf + 26;
          const x = px - (dz / l) * off * side;
          const z = pz + (dx / l) * off * side;
          if (blocked(world, x, z, villages)) continue;
          const y = world.terrainHeight(x, z);
          if (y < W + 1.1) continue;
          list.push({ x, y, z, s: SPECIES_INDEX[r() < 0.6 ? 'poplar' : 'oak'], scale: 0.8 + r() * 0.4, rot: r() * 6.28 });
        }
      }
    }
    // city yard trees and village gardens collected by the building layer
    for (const t of chunk.cityTrees ?? []) {
      const y = world.terrainHeight(t.x, t.z);
      list.push({ x: t.x, y, z: t.z, s: SPECIES_INDEX[t.species] ?? 0, scale: t.scale, rot: r() * 6.28 });
    }
    // trunks close to roads become obstacles
    const colliders = [];
    for (const t of list) {
      if (t.s === SPECIES_INDEX.bush) continue;
      const near = world.net.query(t.x, t.z, 22).length > 0 || world.lotAt(t.x, t.z, 20);
      if (!near) continue;
      const c = { x: t.x, z: t.z, w: 0.7, d: 0.7, heading: 0, kind: 'tree', h: 12 };
      world.colliders?.insertBox(c, t.x - 1, t.z - 1, t.x + 1, t.z + 1);
      colliders.push(c);
    }
    this.chunks.set(chunk.key, { list, colliders });
    this.dirty = true;
    return { list, colliders };
  }

  dispose(chunk, out) {
    for (const c of out.colliders) this.world.colliders?.remove(c, c.x - 1, c.z - 1, c.x + 1, c.z + 1);
    this.chunks.delete(chunk.key);
    this.dirty = true;
  }

  update(dt, camPos) {
    this.camUniform.value.copy(camPos);
    this.wind.value += Math.min(dt, 0.1);
    this.timer -= dt;
    const moved = this.lastFocus.distanceToSquared(camPos) > 18 * 18;
    if (!(this.dirty || (moved && this.timer <= 0))) return;
    this.timer = 0.35;
    this.dirty = false;
    this.lastFocus.copy(camPos);
    const counts = {};
    for (const s of SPECIES) counts[s] = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let farCount = 0;
    const nr2 = this.nearRadius * this.nearRadius;
    const farMatrix = this.far.instanceMatrix.array;
    const cells = this.cellAttr.array;
    for (const { list } of this.chunks.values()) {
      for (const t of list) {
        const dx = t.x - camPos.x;
        const dz = t.z - camPos.z;
        const d2 = dx * dx + dz * dz;
        const species = SPECIES[t.s];
        if (d2 < nr2 && counts[species] < this.capacityNear) {
          q.setFromAxisAngle(up, t.rot);
          scale.setScalar(t.scale);
          pos.set(t.x, t.y - 0.1, t.z);
          m.compose(pos, q, scale);
          this.near[species].setMatrixAt(counts[species]++, m);
        } else if (farCount < this.farCapacity) {
          const h = 24 * t.scale;
          const w = 18 * t.scale;
          const o = farCount * 16;
          farMatrix[o] = w;
          farMatrix[o + 1] = 0;
          farMatrix[o + 2] = 0;
          farMatrix[o + 3] = 0;
          farMatrix[o + 4] = 0;
          farMatrix[o + 5] = h;
          farMatrix[o + 6] = 0;
          farMatrix[o + 7] = 0;
          farMatrix[o + 8] = 0;
          farMatrix[o + 9] = 0;
          farMatrix[o + 10] = 1;
          farMatrix[o + 11] = 0;
          farMatrix[o + 12] = t.x;
          farMatrix[o + 13] = t.y - 0.2;
          farMatrix[o + 14] = t.z;
          farMatrix[o + 15] = 1;
          cells[farCount] = t.s;
          farCount++;
        }
      }
    }
    for (const s of SPECIES) {
      this.near[s].count = counts[s];
      this.near[s].instanceMatrix.needsUpdate = true;
    }
    this.far.count = farCount;
    this.far.instanceMatrix.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
  }
}

function blocked(world, x, z, villages) {
  for (const c of world.citiesNear(x, z)) if (Math.hypot(x - c.x, z - c.z) < c.Rout + 60) return true;
  for (const v of villages) if (Math.hypot(v.x - x, v.z - z) < v.half + 90) return true;
  if (world.net.query(x, z, 7).length) return true;
  if (world.lotAt(x, z, 10)) return true;
  return false;
}

export { smoothstep };
