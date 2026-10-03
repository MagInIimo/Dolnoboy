import * as THREE from 'three';
import { arrayTexture, canvas, flatNormalCanvas, imageToCanvas, loadImage, noiseCanvas, tintCanvas } from './textures.js';
import { GLSL_HASH, GLSL_WORLD_NORMAL, patchMaterial } from './patch.js';
import { rng } from '../core/util.js';

export const L = { ASPHALT: 0, SHOULDER: 1, CONCRETE: 2, GRAVEL: 3, PAVING: 4, GRASS: 5, DRY: 6, SOIL: 7, SAND: 8, YARD: 9, WORN: 10 };
const ROUGH = [0.88, 0.92, 0.94, 0.97, 0.9, 0.97, 0.98, 0.98, 0.96, 0.93, 0.94];

const FILES = {
  asphalt: ['assets/asphalt_02/asphalt_02_diff_1k.jpg', 'assets/asphalt_02/asphalt_02_nor_gl_1k.jpg'],
  concrete: ['assets/concrete_floor_02/concrete_floor_02_diff_1k.jpg', 'assets/concrete_floor_02/concrete_floor_02_nor_gl_1k.jpg'],
  gravel: ['assets/gravel_ground_01/gravel_ground_01_diff_1k.jpg', 'assets/gravel_ground_01/gravel_ground_01_nor_gl_1k.jpg'],
  grass: ['assets/leafy_grass/leafy_grass_diff_1k.jpg', 'assets/leafy_grass/leafy_grass_nor_gl_1k.jpg'],
  dry: ['assets/withered_grass/withered_grass_diff_1k.jpg', 'assets/withered_grass/withered_grass_nor_gl_1k.jpg'],
  brick: ['assets/brick_wall_001/brick_wall_001_diffuse_1k.jpg', 'assets/brick_wall_001/brick_wall_001_nor_gl_1k.jpg'],
  plaster: ['assets/plastered_wall/plastered_wall_diff_1k.jpg', 'assets/plastered_wall/plastered_wall_nor_gl_1k.jpg'],
  // project photo textures (no normal map)
  lawn: ['assets/photo/grass-ground.jpg'],
  asphaltFine: ['assets/photo/asphalt-fine.jpg'],
  foliage: ['assets/photo/foliage.webp'],
  spruce: ['assets/photo/spruce-bough.webp'],
  tuft: ['assets/photo/grass-tuft.webp'],
};

export async function loadPhotoTextures(onProgress) {
  const entries = Object.entries(FILES);
  const out = {};
  let done = 0;
  const total = entries.reduce((n, [, files]) => n + files.length, 0);
  await Promise.all(
    entries.map(async ([key, [diff, nor]]) => {
      const [d, n] = await Promise.all([loadImage(diff), nor ? loadImage(nor) : null]);
      out[key] = { diff: d, nor: n };
      done += nor ? 2 : 1;
      onProgress?.(done / total);
    })
  );
  return out;
}

export function buildSurfaceArrays(photos, size) {
  const asphalt = imageToCanvas(photos.asphaltFine.diff, size, 'brightness(0.8) contrast(1.1) saturate(0.6)');
  const shoulder = imageToCanvas(photos.asphalt.diff, size, 'brightness(1.12) contrast(0.9) saturate(0.55)');
  const concrete = imageToCanvas(photos.concrete.diff, size, 'brightness(1.05) saturate(0.6)');
  const gravel = imageToCanvas(photos.gravel.diff, size, 'saturate(0.75)');
  const grass = imageToCanvas(photos.lawn.diff, size, 'brightness(0.86) saturate(0.88)');
  const dry = imageToCanvas(photos.dry.diff, size);
  const paving = pavingCanvas(size);
  const soil = tintCanvas(imageToCanvas(photos.gravel.diff, size, 'blur(1px)'), (r, g, b) => {
    const v = (r + g + b) / 3;
    return [v * 0.62 + 22, v * 0.46 + 14, v * 0.32 + 8];
  });
  const sand = tintCanvas(imageToCanvas(photos.gravel.diff, size, 'blur(1.5px)'), (r, g, b) => {
    const v = (r + g + b) / 3;
    return [150 + v * 0.42, 132 + v * 0.38, 98 + v * 0.3];
  });
  const yard = imageToCanvas(photos.concrete.diff, size, 'brightness(0.86) saturate(0.4) contrast(1.1)');
  const worn = wornAsphalt(photos, size);
  const color = arrayTexture([asphalt, shoulder, concrete, gravel, paving, grass, dry, soil, sand, yard, worn]);
  const n = (img) => imageToCanvas(img, size);
  const flat = flatNormalCanvas(size);
  const normal = arrayTexture([n(photos.asphalt.nor), n(photos.asphalt.nor), n(photos.concrete.nor), n(photos.gravel.nor), flat, n(photos.grass.nor), n(photos.dry.nor), n(photos.gravel.nor), n(photos.gravel.nor), n(photos.concrete.nor), n(photos.asphalt.nor)], { srgb: false });
  return { color, normal };
}

// Old country asphalt: faded, grey, with a tileable network of cracks and sealed seams.
function wornAsphalt(photos, size) {
  const c = imageToCanvas(photos.asphalt.diff, size, 'brightness(1.05) contrast(0.85) saturate(0.35)');
  const g = c.getContext('2d');
  const r = rng(4411);
  const k = size / 512;
  // tar-sealed cracks (dark, slightly wider) and fresh hairline cracks; drawn 9 times for seamless tiling
  for (let i = 0; i < 26; i++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * Math.PI * 2;
    const sealed = r() < 0.4;
    const segs = 6 + Math.floor(r() * 18);
    const pts = [[x, y]];
    for (let j = 0; j < segs; j++) {
      a += (r() - 0.5) * 1.3;
      x += Math.cos(a) * (8 + r() * 14) * k;
      y += Math.sin(a) * (8 + r() * 14) * k;
      pts.push([x, y]);
    }
    g.strokeStyle = sealed ? 'rgba(22,22,24,0.42)' : 'rgba(34,34,36,0.38)';
    g.lineWidth = (sealed ? 2.6 : 1.0) * k;
    g.lineJoin = 'round';
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        g.beginPath();
        pts.forEach(([px, py], j) => (j ? g.lineTo(px + ox * size, py + oy * size) : g.moveTo(px + ox * size, py + oy * size)));
        g.stroke();
      }
    }
  }
  // ravelled spots where the binder is gone
  for (let i = 0; i < 40; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = (4 + r() * 16) * k;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${150 + r() * 30},${148 + r() * 25},${140 + r() * 20},0.35)`);
    grad.addColorStop(1, 'rgba(150,148,140,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

function pavingCanvas(size) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const r = rng(77);
  g.fillStyle = '#5f5d59';
  g.fillRect(0, 0, size, size);
  const n = 16;
  const t = size / n;
  for (let y = 0; y < n; y++) {
    const off = y % 2 ? t / 4 : 0;
    for (let x = -1; x < n * 2; x++) {
      const v = 104 + r() * 26;
      g.fillStyle = `rgb(${v + 6},${v + 3},${v})`;
      g.fillRect(x * (t / 2) + off + 1, y * t + 1, t / 2 - 2, t - 2);
    }
  }
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (r() - 0.5) * 18;
    img.data[i] += k;
    img.data[i + 1] += k;
    img.data[i + 2] += k;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function macroNoiseTexture() {
  const c = noiseCanvas(256, 4, 991, 5, (v, x, y) => {
    const k = Math.round(v * 255);
    return [k, Math.round(255 * ((x * 7 + y * 13) % 17) / 17), 0, 255];
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export class SurfaceMaterials {
  constructor(arrays, macro, quality) {
    this.uniforms = {
      uSurf: { value: arrays.color },
      uSurfN: { value: arrays.normal },
      uMacro: { value: macro },
      uWet: { value: 0 },
      uOrigin: { value: new THREE.Vector2() },
      uSeason: { value: 0 },
    };
    this.terrain = this.makeTerrain(quality);
    this.road = this.makeRoad(false);
    this.roadOverlay = this.makeRoad(true);
  }

  setOrigin(x, z) {
    const step = 3072;
    this.uniforms.uOrigin.value.set(Math.floor(x / step) * step, Math.floor(z / step) * step);
  }

  makeTerrain(quality) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    const u = this.uniforms;
    return patchMaterial(m, {
      key: 'terrain-' + quality,
      uniforms: u,
      vertexHead: 'attribute vec4 aBlend;\nvarying vec4 vBlend;',
      vertexBody: 'vBlend = aBlend;',
      fragmentHead: `
        precision highp sampler2DArray;
        uniform sampler2DArray uSurf;
        uniform sampler2DArray uSurfN;
        uniform sampler2D uMacro;
        uniform vec2 uOrigin;
        uniform float uWet;
        varying vec4 vBlend;
        ${GLSL_HASH}
        ${GLSL_WORLD_NORMAL}
        vec3 cropColor(float id, vec2 p) {
          if (id < 0.22) return vec3(0.62, 0.52, 0.28);
          if (id < 0.40) return vec3(0.36, 0.45, 0.17);
          if (id < 0.55) return vec3(0.42, 0.31, 0.20);
          if (id < 0.68) return vec3(0.72, 0.62, 0.33);
          if (id < 0.80) return vec3(0.30, 0.40, 0.16);
          if (id < 0.90) return vec3(0.52, 0.48, 0.24);
          return vec3(0.45, 0.50, 0.25);
        }
      `,
      fragmentMap: `
        vec2 rp = vWorldPos.xz - uOrigin;
        vec2 uvA = rp / 7.0;
        vec2 uvB = rp / 23.0;
        float macro = texture2D(uMacro, vWorldPos.xz / 900.0).r;
        float macro2 = texture2D(uMacro, vWorldPos.xz / 140.0 + 0.37).r;
        vec3 grassA = texture(uSurf, vec3(uvA, 5.0)).rgb;
        vec3 grassB = texture(uSurf, vec3(uvB * 1.3, 5.0)).rgb;
        vec3 grass = mix(grassA, grassB, 0.35 + 0.3 * macro2);
        vec3 dryA = texture(uSurf, vec3(uvA * 0.9, 6.0)).rgb;
        float dryMix = clamp(vBlend.x + (macro - 0.5) * 0.5, 0.0, 1.0);
        vec3 col = mix(grass, dryA * vec3(1.02, 0.98, 0.9), dryMix);
        col *= 0.78 + 0.42 * macro;
        // patchwork fields
        if (vBlend.y > 0.01) {
          float ang = hash12(floor(vWorldPos.xz / 1400.0)) * 3.14159;
          mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
          vec2 fp = rot * vWorldPos.xz;
          vec2 cell = floor(fp / vec2(210.0, 130.0));
          vec2 local = fract(fp / vec2(210.0, 130.0));
          float id = hash12(cell);
          vec3 crop = cropColor(id, fp);
          float rows = 0.5 + 0.5 * sin(fp.y * 2.6 + id * 30.0);
          vec3 soil = texture(uSurf, vec3(uvA, 7.0)).rgb;
          if (id >= 0.40 && id < 0.55) crop = soil * (0.85 + 0.25 * rows);
          else crop *= 0.86 + 0.18 * rows;
          crop *= 0.85 + 0.3 * texture(uSurf, vec3(uvB, 6.0)).g;
          float edge = smoothstep(0.0, 0.035, min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y)) );
          float strip = step(0.9, hash12(cell + 7.0));
          col = mix(col, crop, vBlend.y * edge * (1.0 - strip * 0.7));
        }
        vec3 sand = texture(uSurf, vec3(uvA, 8.0)).rgb;
        col = mix(col, sand, vBlend.z);
        col *= 1.0 - 0.38 * vBlend.w;
        float slope = 1.0 - clamp(vWorldNormal.y, 0.0, 1.0);
        vec3 rock = texture(uSurf, vec3(uvB, 3.0)).rgb * vec3(0.95, 0.9, 0.85);
        col = mix(col, rock, smoothstep(0.28, 0.5, slope));
        diffuseColor.rgb *= col;
      `,
      fragmentNormal: `
        {
          vec3 ns = texture(uSurfN, vec3(uvA, mix(5.0, 6.0, step(0.5, dryMix)))).xyz;
          vec3 wn = perturbWorldNormal(normalize(vWorldNormal), ns, 0.9);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
      `,
      fragmentRoughness: 'float roughnessFactor = mix(0.97, 0.55, uWet * (1.0 - vBlend.y * 0.5));',
    });
  }

  makeRoad(overlay) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: overlay ? -3 : -1, polygonOffsetUnits: overlay ? -6 : -2 });
    const u = this.uniforms;
    return patchMaterial(m, {
      key: overlay ? 'road-overlay' : 'road',
      uniforms: u,
      vertexHead: 'attribute float aLayer;\nattribute vec3 aTint;\nvarying float vLayer;\nvarying vec3 vTint;\nvarying vec2 vRoadUv;',
      vertexBody: 'vLayer = aLayer; vTint = aTint; vRoadUv = uv;',
      fragmentHead: `
        precision highp sampler2DArray;
        uniform sampler2DArray uSurf;
        uniform sampler2DArray uSurfN;
        uniform sampler2D uMacro;
        uniform float uWet;
        varying float vLayer;
        varying vec3 vTint;
        varying vec2 vRoadUv;
        ${GLSL_HASH}
        ${GLSL_WORLD_NORMAL}
        const float ROUGH[${ROUGH.length}] = float[${ROUGH.length}](${ROUGH.map((v) => v.toFixed(2)).join(',')});
      `,
      fragmentMap: overlay
        ? `
        float layerIdx = 0.0;
        float holeWater = 0.0;
        if (vLayer > 0.5) {
          // potholes (layer 1) and asphalt patches (layer 2), drawn procedurally in decal space
          vec2 q = vRoadUv * 2.0 - 1.0;
          float seed = vTint.x * 53.0;
          vec3 under = texture(uSurf, vec3(vWorldPos.xz / 7.0, vTint.y)).rgb;
          vec3 col;
          if (vLayer < 1.5) {
            float r = length(q) + (vnoise(q * 3.2 + seed) - 0.5) * 0.5 + (vnoise(q * 9.0 - seed) - 0.5) * 0.12;
            if (r > 0.86) discard;
            float inside = smoothstep(0.74, 0.58, r);
            vec3 stones = texture(uSurf, vec3(vWorldPos.xz / 1.3, 3.0)).rgb;
            vec3 bottom = mix(vec3(0.075, 0.07, 0.065), stones * vec3(0.42, 0.38, 0.34), 0.45 + 0.3 * vnoise(q * 7.0 + seed));
            // broken, slightly lighter crumbs around the edge and a shaded inner wall
            vec3 rim = under * mix(0.82, 0.55, smoothstep(0.86, 0.72, r));
            vec3 col0 = mix(rim, bottom, inside);
            float wall = smoothstep(0.8, 0.6, r) * smoothstep(0.25, 0.62, r);
            float lit = 0.62 + 0.5 * clamp(dot(normalize(q + 1e-4), vec2(0.55, 0.83)), -1.0, 1.0);
            col = col0 * mix(1.0, lit, wall);
            holeWater = uWet * smoothstep(0.62, 0.38, r);
            col = mix(col, vec3(0.03, 0.035, 0.04), holeWater * 0.92);
          } else {
            vec2 a = abs(q);
            float edge = max(a.x, a.y) + (vnoise(q * 5.0 + seed) - 0.5) * 0.08;
            if (edge > 1.0) discard;
            vec3 fresh = texture(uSurf, vec3(vWorldPos.xz / 7.0, 0.0)).rgb * (0.74 + 0.14 * vTint.z);
            col = mix(fresh, vec3(0.035), smoothstep(0.9, 0.98, edge) * 0.7);
          }
          diffuseColor.rgb *= col;
        } else {
          float wear = texture2D(uMacro, vWorldPos.xz / 31.0).r;
          vec3 under = texture(uSurf, vec3(vWorldPos.xz / 7.0, 0.0)).rgb;
          vec3 paint = vTint * (0.8 + 0.4 * under.r);
          diffuseColor.rgb *= mix(under * 0.9, paint, smoothstep(0.08, 0.38, wear + 0.18));
        }
        `
        : `
        float layerIdx = floor(vLayer + 0.5);
        vec2 ruv = layerIdx > 9.5 ? vRoadUv * 0.71 : vRoadUv;
        vec3 c = texture(uSurf, vec3(ruv, layerIdx)).rgb;
        float macro = texture2D(uMacro, vWorldPos.xz / 160.0).r;
        float patchy = texture2D(uMacro, vWorldPos.xz / 23.0 + 0.5).r;
        c *= 0.86 + 0.26 * macro;
        if (layerIdx < 1.5) c *= mix(1.0, 0.82 + 0.3 * patchy, 0.6);
        c *= vTint;
        c = mix(c, c * 0.62, uWet * (layerIdx < 2.5 ? 1.0 : 0.6));
        diffuseColor.rgb *= c;
        `,
      fragmentNormal: overlay
        ? ''
        : `
        {
          vec3 ns = texture(uSurfN, vec3(ruv, layerIdx)).xyz;
          vec3 wn = perturbWorldNormal(normalize(vWorldNormal), ns, 0.8);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
        `,
      fragmentRoughness: overlay ? 'float roughnessFactor = mix(mix(0.7, 0.35, uWet), 0.05, holeWater);' : 'float roughnessFactor = mix(ROUGH[int(layerIdx)], 0.18, uWet * (layerIdx < 2.5 ? 1.0 : 0.5));',
    });
  }
}
