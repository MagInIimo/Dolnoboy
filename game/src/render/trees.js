import * as THREE from 'three';
import { canvas } from './textures.js';
import { rng, hash2, smoothstep } from '../core/util.js';
import { WATER_LEVEL, unproject } from '../core/geo.js';
import { forestDensity } from '../world/relief.js';
import { GeoBuilder } from './geo-builder.js';
import { patchMaterial } from './patch.js';

export const SPECIES = ['birch', 'spruce', 'pine', 'oak', 'linden', 'poplar', 'apple', 'maple', 'bush'];
const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s, i]));

// Atlas layout (1024 x 1024): row 0..1 leaf cards (4 cells of 256 per row), bottom rows bark strips.
function paintAtlas() {
  const c = canvas(1024, 1024);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 1024);
  const r = rng(99);
  const leafCell = (cx, cy, palette, size, count, shape) => {
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 112;
      const x = cx + 128 + Math.cos(a) * d;
      const y = cy + 128 + Math.sin(a) * d * 0.92;
      const col = palette[Math.floor(r() * palette.length)];
      g.fillStyle = col;
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI * 2);
      g.beginPath();
      if (shape === 'needle') g.ellipse(0, 0, size * 1.8, size * 0.28, 0, 0, Math.PI * 2);
      else g.ellipse(0, 0, size, size * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // twigs
    g.strokeStyle = 'rgba(70,52,38,0.8)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.moveTo(cx + 128, cy + 230);
      g.quadraticCurveTo(cx + 128 + (r() - 0.5) * 80, cy + 150, cx + 128 + (r() - 0.5) * 200, cy + 30 + r() * 80);
      g.stroke();
    }
  };
  const broad = ['#3f6a2a', '#4c7a31', '#2f5522', '#5a8a38', '#365f26', '#68953f'];
  const birch = ['#6f9a3a', '#86ad45', '#5c8a30', '#9abb52', '#78a03c'];
  const spruce = ['#1f3b26', '#264a2d', '#18321f', '#2e5534', '#203d2a'];
  const pine = ['#2f5229', '#3a6230', '#284824', '#456d36'];
  const apple = ['#4f7f30', '#5e8f38', '#40702a', '#d33a2a'];
  const autumn = ['#c9822e', '#d8a03a', '#b5662a', '#9a8a35', '#7a8a32'];
  leafCell(0, 0, broad, 9, 900, 'leaf');
  leafCell(256, 0, birch, 6, 1200, 'leaf');
  // spruce branch: drooping layered needles
  {
    const cx = 512;
    const cy = 0;
    for (let i = 0; i < 1800; i++) {
      const t = r();
      const x = cx + 128 + (r() - 0.5) * 240 * (0.3 + t * 0.7);
      const y = cy + 30 + t * 200 + (r() - 0.5) * 20;
      g.strokeStyle = spruce[Math.floor(r() * spruce.length)];
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 10, y + 6 + r() * 8);
      g.stroke();
    }
  }
  leafCell(768, 0, pine, 7, 1100, 'needle');
  leafCell(0, 256, apple, 7, 900, 'leaf');
  leafCell(256, 256, broad.map((c) => c), 11, 700, 'leaf');
  leafCell(512, 256, autumn, 8, 900, 'leaf');
  leafCell(768, 256, ['#4c6b2c', '#5d7d36', '#3e5c25'], 6, 1300, 'leaf');
  // bark strips: birch, pine, generic, spruce
  const bark = (y0, base, fn) => {
    g.fillStyle = base;
    g.fillRect(0, y0, 1024, 128);
    fn(y0);
  };
  bark(512, '#e7e3d6', (y0) => {
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.7 ? '#2a2725' : '#77736a';
      g.fillRect(r() * 1024, y0 + r() * 128, 8 + r() * 26, 2 + r() * 4);
    }
  });
  bark(640, '#a2603a', (y0) => {
    for (let i = 0; i < 400; i++) {
      g.fillStyle = r() < 0.5 ? '#6a3a22' : '#c27a4a';
      g.fillRect(r() * 1024, y0 + r() * 128, 4 + r() * 10, 6 + r() * 14);
    }
  });
  bark(768, '#5a4636', (y0) => {
    for (let i = 0; i < 500; i++) {
      g.fillStyle = r() < 0.5 ? '#3a2c22' : '#6e5845';
      g.fillRect(r() * 1024, y0 + r() * 128, 3 + r() * 6, 10 + r() * 20);
    }
  });
  bark(896, '#4a3a2e', (y0) => {
    for (let i = 0; i < 400; i++) {
      g.fillStyle = r() < 0.5 ? '#2e241c' : '#5e4a3a';
      g.fillRect(r() * 1024, y0 + r() * 128, 3 + r() * 8, 4 + r() * 8);
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
function speciesModel(species, r) {
  const gb = new GeoBuilder({ aShade: 1 });
  const card = (cx, cy, cz, w, h, yaw, tilt, cell, shade = 1) => {
    const uv = cellUV(cell);
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const up = [Math.sin(tilt) * c, Math.cos(tilt), -Math.sin(tilt) * s];
    const right = [c, 0, s];
    const P = (u, v) => [cx + right[0] * u + up[0] * v, cy + right[1] * u + up[1] * v, cz + right[2] * u + up[2] * v];
    const nx = -s;
    const nz = c;
    const a = gb.vertex(...P(-w / 2, -h / 2), nx, 0.5, nz, uv.u0, uv.v0, { aShade: shade * 0.8 });
    const b = gb.vertex(...P(w / 2, -h / 2), nx, 0.5, nz, uv.u1, uv.v0, { aShade: shade * 0.8 });
    const cc = gb.vertex(...P(w / 2, h / 2), nx, 0.5, nz, uv.u1, uv.v1, { aShade: shade });
    const d = gb.vertex(...P(-w / 2, h / 2), nx, 0.5, nz, uv.u0, uv.v1, { aShade: shade });
    gb.idx.push(a, b, cc, a, cc, d, a, cc, b, a, d, cc);
  };
  const trunk = (h, r0, r1, bark, n = 6) => {
    const uv = barkUV(bark);
    const base = gb.count;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      gb.vertex(s * r0, 0, c * r0, s, 0, c, uv.u0 + (i / n) * 0.5, uv.v0, { aShade: 0.7 });
      gb.vertex(s * r1, h, c * r1, s, 0, c, uv.u0 + (i / n) * 0.5, uv.v1, { aShade: 1 });
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      gb.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  switch (species) {
    case 'birch': {
      trunk(11, 0.2, 0.08, 'birch');
      for (let i = 0; i < 14; i++) {
        const y = 5 + r() * 7;
        const a = r() * Math.PI * 2;
        const d = 0.6 + r() * 1.6;
        card(Math.sin(a) * d, y, Math.cos(a) * d, 3.0 + r(), 3.2 + r(), r() * Math.PI, (r() - 0.5) * 0.6, 'birch', 0.75 + (y - 5) / 20);
      }
      break;
    }
    case 'spruce': {
      trunk(14, 0.28, 0.06, 'spruce');
      const tiers = 9;
      for (let t = 0; t < tiers; t++) {
        const y = 1.2 + t * 1.45;
        const rad = 3.2 * (1 - t / tiers) + 0.4;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + t * 0.6;
          card(Math.sin(a) * rad * 0.5, y + 0.6, Math.cos(a) * rad * 0.5, rad * 1.3, 2.2, a + Math.PI / 2, 0.55, 'spruce', 0.65 + t / tiers * 0.4);
        }
      }
      card(0, 14.2, 0, 1.2, 2.4, 0, 0, 'spruce', 1);
      card(0, 14.2, 0, 1.2, 2.4, Math.PI / 2, 0, 'spruce', 1);
      break;
    }
    case 'pine': {
      trunk(15, 0.3, 0.12, 'pine');
      for (let i = 0; i < 11; i++) {
        const y = 10 + r() * 6;
        const a = r() * Math.PI * 2;
        const d = 0.5 + r() * 2.2;
        card(Math.sin(a) * d, y, Math.cos(a) * d, 3.4, 2.4, r() * Math.PI, (r() - 0.5) * 1.2, 'pine', 0.8 + (y - 10) / 30);
      }
      break;
    }
    case 'oak':
    case 'linden':
    case 'maple': {
      trunk(species === 'linden' ? 7 : 5, 0.36, 0.18, 'generic');
      const n = species === 'oak' ? 16 : 14;
      for (let i = 0; i < n; i++) {
        const y = 4 + r() * 6.5;
        const a = r() * Math.PI * 2;
        const d = r() * 3.2;
        card(Math.sin(a) * d, y, Math.cos(a) * d, 4 + r() * 1.2, 4 + r(), r() * Math.PI, (r() - 0.5) * 0.8, i % 3 ? 'broad' : 'broad2', 0.7 + (y - 4) / 18);
      }
      break;
    }
    case 'poplar': {
      trunk(14, 0.3, 0.1, 'generic');
      for (let i = 0; i < 14; i++) {
        const y = 3 + i * 1.0;
        const a = r() * Math.PI * 2;
        const d = r() * 0.9;
        card(Math.sin(a) * d, y, Math.cos(a) * d, 2.6 - i * 0.07, 3.2, r() * Math.PI, (r() - 0.5) * 0.3, 'broad2', 0.7 + i / 40);
      }
      break;
    }
    case 'apple': {
      trunk(2.4, 0.16, 0.1, 'generic');
      for (let i = 0; i < 9; i++) {
        const y = 2.2 + r() * 2.6;
        const a = r() * Math.PI * 2;
        const d = r() * 1.5;
        card(Math.sin(a) * d, y, Math.cos(a) * d, 2.4, 2.2, r() * Math.PI, (r() - 0.5) * 0.8, 'apple', 0.8);
      }
      break;
    }
    default: {
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2;
        card(Math.sin(a) * 0.6, 0.8, Math.cos(a) * 0.6, 2.2, 1.8, r() * Math.PI, (r() - 0.5) * 0.6, 'bush', 0.8);
      }
    }
  }
  return gb;
}

export class TreeSystem {
  constructor(engine, world, quality) {
    this.engine = engine;
    this.world = world;
    this.name = 'trees';
    this.density = quality.trees;
    this.shadows = quality.shadows > 0;
    const atlas = new THREE.CanvasTexture(paintAtlas());
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
    this.atlas = atlas;
    this.material = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
    patchMaterial(this.material, {
      key: 'tree',
      uniforms: { uWind: { value: 0 } },
      vertexHead: 'attribute float aShade;\nvarying float vShade;\nuniform float uWind;',
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
    const cam = new THREE.OrthographicCamera(-9, 9, 18, 0, 0.1, 100);
    cam.position.set(0, 8, 40);
    cam.lookAt(0, 8, 0);
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
        vec2 cuv = vMapUv;
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
          const h = 18 * t.scale;
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
