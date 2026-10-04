import * as THREE from 'three';
import { WATER_LEVEL, unproject } from '../core/geo.js';
import { dryness, forestDensity } from '../world/relief.js';
import { fbm, smoothstep } from '../core/util.js';

// Generator: yields periodically so the work can be spread across frames.
export function* buildTerrain(world, x0, z0, size, step) {
  const n = Math.round(size / step) + 1;
  const m = n + 2;
  const H = new Float32Array(m * m);
  // heights plus the distance to the nearest road edge, sampled in one pass
  const R = new Float32Array(m * m);
  const probe = { road: Infinity };
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      H[j * m + i] = world.terrainHeight(x0 + (i - 1) * step, z0 + (j - 1) * step, probe);
      R[j * m + i] = probe.road;
    }
    if (j % 6 === 5) yield;
  }
  const { lat, lon } = unproject(x0 + size / 2, z0 + size / 2);
  const count = n * n + n * 4;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const blend = new Float32Array(count * 4);
  let v = 0;
  const put = (x, y, z, nx, ny, nz, b0, b1, b2, b3) => {
    pos[v * 3] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;
    nrm[v * 3] = nx;
    nrm[v * 3 + 1] = ny;
    nrm[v * 3 + 2] = nz;
    blend[v * 4] = b0;
    blend[v * 4 + 1] = b1;
    blend[v * 4 + 2] = b2;
    blend[v * 4 + 3] = b3;
    return v++;
  };
  const W = WATER_LEVEL;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let h = H[(j + 1) * m + (i + 1)];
      // coarse grids cannot follow a road's edge: tuck them a little lower so asphalt never sinks below grass
      const gap = R[(j + 1) * m + (i + 1)];
      if (step > 4 && gap < step) h -= Math.min(2.5, step * 0.15) * (1 - Math.max(0, gap) / step);
      const hl = H[(j + 1) * m + i];
      const hr = H[(j + 1) * m + i + 2];
      const hd = H[j * m + i + 1];
      const hu = H[(j + 2) * m + i + 1];
      let nx = hl - hr;
      let nz = hd - hu;
      let ny = 2 * step;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const wx = x0 + i * step;
      const wz = z0 + j * step;
      // town lawns are trampled and patchy
      const dry = Math.min(1, dryness(wx, wz, lat) + nearClutter(world, wx, wz, 1e9) * (0.3 + 0.25 * fbm(wx / 37, wz / 37, 2)));
      const forest = forestDensity(wx, wz, lat, lon);
      const near = nearClutter(world, wx, wz, R[(j + 1) * m + (i + 1)]);
      const fieldNoise = fbm(wx / 1500 + 7.1, wz / 1500 - 3.4, 2);
      const field = (1 - smoothstep(0.35, 0.5, forest)) * smoothstep(-0.15, 0.1, fieldNoise) * (1 - near) * (lat > 61 ? 0.2 : 1);
      const sand = 1 - smoothstep(W + 0.7, W + 1.6, h);
      // forest floor (needles, leaf litter) right up to the forest edge; the first metres from a road stay a grass verge
      const gapHere = R[(j + 1) * m + (i + 1)];
      const nearCity = nearClutter(world, wx, wz, 1e9);
      const shade = smoothstep(0.36, 0.5, forest) * (1 - nearCity) * smoothstep(9, 16, gapHere);
      put(i * step, h, j * step, nx, ny, nz, dry, field, sand, shade);
    }
    if (j % 16 === 15) yield;
  }
  // skirts along the border hide cracks between levels of detail
  const skirt = [];
  const border = [];
  for (let i = 0; i < n; i++) border.push([i, 0]);
  for (let j = 1; j < n; j++) border.push([n - 1, j]);
  for (let i = n - 2; i >= 0; i--) border.push([i, n - 1]);
  for (let j = n - 2; j > 0; j--) border.push([0, j]);
  for (const [i, j] of border) {
    const k = j * n + i;
    skirt.push(put(pos[k * 3], pos[k * 3 + 1] - 5, pos[k * 3 + 2], nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2], blend[k * 4], blend[k * 4 + 1], blend[k * 4 + 2], blend[k * 4 + 3]));
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = a + n;
      if ((i + j) % 2) idx.push(a, d, b, b, d, c);
      else idx.push(a, d, c, a, c, b);
    }
  }
  for (let k = 0; k < border.length; k++) {
    const [i, j] = border[k];
    const [i2, j2] = border[(k + 1) % border.length];
    const a = j * n + i;
    const b = j2 * n + i2;
    const sa = skirt[k];
    const sb = skirt[(k + 1) % border.length];
    idx.push(a, b, sb, a, sb, sa, a, sb, b, a, sa, sb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, v * 3), 3));
  g.setAttribute('aBlend', new THREE.BufferAttribute(blend.subarray(0, v * 4), 4));
  g.setIndex(v > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return { geometry: g, heights: H, n, m, step, lat, lon };
}

// 1 near cities and roads: suppresses fields and forest floor shading. roadGap = metres beyond the nearest road edge.
export function nearClutter(world, x, z, roadGap) {
  let v = 0;
  for (const c of world.citiesNear(x, z)) {
    const d = Math.hypot(x - c.x, z - c.z);
    v = Math.max(v, 1 - smoothstep(c.Rout + 40, c.Rout + 260, d));
  }
  if (roadGap < 30) v = Math.max(v, 1 - smoothstep(4, 30, roadGap));
  return v;
}
