export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const angleDiff = (a, b) => wrapAngle(a - b);
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const approach = (v, target, rate) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));
export const damp = (v, target, lambda, dt) => lerp(v, target, 1 - Math.exp(-lambda * dt));

export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  next.weighted = (pairs) => {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = next() * total;
    for (const [value, w] of pairs) {
      r -= w;
      if (r <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  };
  return next;
}

export function hash2(x, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);
const PERM = new Uint8Array(512);
{
  const r = rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

export function noise2(x, z) {
  const F2 = 0.3660254037844386;
  const G2 = 0.21132486540518713;
  const s = (x + z) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(z + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const z0 = z - (j - t);
  const i1 = x0 > z0 ? 1 : 0;
  const j1 = 1 - i1;
  const x1 = x0 - i1 + G2;
  const z1 = z0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const z2 = z0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n = 0;
  let t0 = 0.5 - x0 * x0 - z0 * z0;
  if (t0 > 0) {
    const g = (PERM[ii + PERM[jj]] & 7) * 2;
    t0 *= t0;
    n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * z0);
  }
  let t1 = 0.5 - x1 * x1 - z1 * z1;
  if (t1 > 0) {
    const g = (PERM[ii + i1 + PERM[jj + j1]] & 7) * 2;
    t1 *= t1;
    n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * z1);
  }
  let t2 = 0.5 - x2 * x2 - z2 * z2;
  if (t2 > 0) {
    const g = (PERM[ii + 1 + PERM[jj + 1]] & 7) * 2;
    t2 *= t2;
    n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * z2);
  }
  return 70 * n;
}

export function fbm(x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x, z) * amp;
    norm += amp;
    amp *= gain;
    x *= lacunarity;
    z *= lacunarity;
  }
  return sum / norm;
}

export function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  const qx = ax + dx * t;
  const qz = az + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, x: qx, z: qz };
}

export function segmentIntersection(ax, az, bx, bz, cx, cz, dx, dz) {
  const rX = bx - ax;
  const rZ = bz - az;
  const sX = dx - cx;
  const sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sZ - (cz - az) * sX) / den;
  const u = ((cx - ax) * rZ - (cz - az) * rX) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + rX * t, z: az + rZ * t };
}

// Oriented rectangles {x, z, w (along heading-right axis), d (along heading), heading}
export function obbOverlap(a, b, margin = 0) {
  const axes = [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const ang of axes) {
    const ax = Math.sin(ang);
    const az = Math.cos(ang);
    const proj = (r) => {
      const fx = Math.sin(r.heading);
      const fz = Math.cos(r.heading);
      return Math.abs(fx * ax + fz * az) * (r.d / 2) + Math.abs(-fz * ax + fx * az) * (r.w / 2);
    };
    if (Math.abs(dx * ax + dz * az) > proj(a) + proj(b) + margin) return false;
  }
  return true;
}

export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

export function centripetalCatmull(points, step) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const count = Math.max(2, Math.ceil(segLen / step));
    for (let k = 0; k < count; k++) out.push(catmullRom(p0, p1, p2, p3, k / count));
  }
  out.push({ x: points[n - 1].x, z: points[n - 1].z });
  return out;
}

export function resample(points, step) {
  const out = [{ x: points[0].x, z: points[0].z }];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      d += step;
    }
    carry = len - (d - step);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > step * 0.35) out.push({ x: last.x, z: last.z });
  else {
    tail.x = last.x;
    tail.z = last.z;
  }
  return out;
}

export function formatMoney(value, lang) {
  const sign = value < 0 ? '−' : '';
  const digits = Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sign + digits + (lang === 'en' ? ' RUB' : ' ₽');
}

export class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }
  insertBox(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    const x0 = Math.floor(minX / c);
    const x1 = Math.floor(maxX / c);
    const z0 = Math.floor(minZ / c);
    const z1 = Math.floor(maxZ / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(item);
      }
    }
  }
  query(minX, minZ, maxX, maxZ, out = [], stamp = null) {
    const c = this.cell;
    const x0 = Math.floor(minX / c);
    const x1 = Math.floor(maxX / c);
    const z0 = Math.floor(minZ / c);
    const z1 = Math.floor(maxZ / c);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        for (const item of list) {
          if (stamp !== null) {
            if (item._stamp === stamp) continue;
            item._stamp = stamp;
          }
          out.push(item);
        }
      }
    }
    return out;
  }
  remove(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++) {
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        const i = list.indexOf(item);
        if (i >= 0) list.splice(i, 1);
      }
    }
  }
}

let stampCounter = 1;
export const nextStamp = () => ++stampCounter;
