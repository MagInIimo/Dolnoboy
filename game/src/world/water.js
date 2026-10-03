import { project, WATER_LEVEL } from '../core/geo.js';
import { RIVERS, SEAS } from '../data/water.js';
import { SpatialHash, catmullRom, clamp, fbm, noise2, pointInPolygon, segmentDistance, smoothstep } from '../core/util.js';

const CELL = 256;

export class WaterBodies {
  constructor(cities) {
    this.cities = cities;
    this.rivers = [];
    this.seas = [];
    this.hash = new SpatialHash(CELL);
    this.segments = [];
    for (const river of RIVERS) this.addRiver(river);
    for (const sea of SEAS) this.addSea(sea);
  }

  addRiver(river) {
    let control = river.points.map(([lat, lon, w]) => ({ ...project(lat, lon), w: w ?? river.width }));
    control = this.protectCores(control);
    const pts = [];
    for (let i = 0; i < control.length - 1; i++) {
      const p0 = control[Math.max(0, i - 1)];
      const p1 = control[i];
      const p2 = control[i + 1];
      const p3 = control[Math.min(control.length - 1, i + 2)];
      const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const n = Math.max(2, Math.ceil(len / 30));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const p = catmullRom(p0, p1, p2, p3, t);
        pts.push({ x: p.x, z: p.z, w: p1.w + (p2.w - p1.w) * t });
      }
    }
    const last = control[control.length - 1];
    pts.push({ x: last.x, z: last.z, w: last.w });
    // natural meanders, damped near city cores so embankments stay readable
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const a = pts[i - 1];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      const core = this.coreFactor(p.x, p.z);
      const off = noise2(p.x / 900 + river.id.length, p.z / 900) * Math.min(70, p.w * 0.6) * core;
      p.x += (-dz / l) * off;
      p.z += (dx / l) * off;
    }
    const entry = { id: river.id, ru: river.ru, en: river.en, pts };
    this.rivers.push(entry);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const seg = { river: entry, a, b };
      const pad = Math.max(a.w, b.w) / 2 + 80;
      this.segments.push(seg);
      this.hash.insertBox(seg, Math.min(a.x, b.x) - pad, Math.min(a.z, b.z) - pad, Math.max(a.x, b.x) + pad, Math.max(a.z, b.z) + pad);
    }
  }

  coreFactor(x, z) {
    let f = 1;
    for (const c of this.cities) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.R * 1.6) f = Math.min(f, smoothstep(c.R * 0.6, c.R * 1.6, d));
    }
    return f;
  }

  protectCores(points) {
    let out = points.map((p) => ({ ...p }));
    for (const c of this.cities) {
      const keep = c.R * 0.36;
      for (const p of out) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const need = keep + p.w / 2;
        if (d < need) {
          const ux = d > 1 ? dx / d : 1;
          const uz = d > 1 ? dz / d : 0;
          p.x = c.x + ux * need;
          p.z = c.z + uz * need;
        }
      }
      // densify around the core so the river bends around the city centre instead of cutting through
      const dense = [];
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i];
        const b = out[i + 1];
        dense.push(a);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const sd = segmentDistance(c.x, c.z, a.x, a.z, b.x, b.z);
        const need = keep + (a.w + b.w) / 4;
        if (sd.d < need && len > 40) {
          const steps = Math.ceil(len / 60);
          for (let k = 1; k < steps; k++) {
            const t = k / steps;
            let x = a.x + (b.x - a.x) * t;
            let z = a.z + (b.z - a.z) * t;
            const w = a.w + (b.w - a.w) * t;
            const dx = x - c.x;
            const dz = z - c.z;
            const d = Math.hypot(dx, dz);
            const n = keep + w / 2;
            if (d < n) {
              const ux = d > 1 ? dx / d : (b.z - a.z) / len;
              const uz = d > 1 ? dz / d : -(b.x - a.x) / len;
              x = c.x + ux * n;
              z = c.z + uz * n;
            }
            dense.push({ x, z, w });
          }
        }
      }
      dense.push(out[out.length - 1]);
      out = dense;
    }
    return out;
  }

  addSea(sea) {
    const poly = sea.points.map(([lat, lon]) => {
      const p = project(lat, lon);
      return [p.x, p.z];
    });
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of poly) {
      minX = Math.min(minX, x);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxZ = Math.max(maxZ, z);
    }
    this.seas.push({ id: sea.id, ru: sea.ru, en: sea.en, poly, minX: minX - 400, minZ: minZ - 400, maxX: maxX + 400, maxZ: maxZ + 400 });
  }

  // Signed distance to the nearest sea shore (negative = inside water), with a noisy coastline.
  seaDistance(x, z) {
    let best = Infinity;
    for (const sea of this.seas) {
      if (x < sea.minX || x > sea.maxX || z < sea.minZ || z > sea.maxZ) continue;
      const inside = pointInPolygon(x, z, sea.poly);
      let d = Infinity;
      const poly = sea.poly;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        d = Math.min(d, segmentDistance(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]).d);
      }
      const signed = inside ? -d : d;
      if (signed < best) best = signed;
    }
    if (best === Infinity) return best;
    return best + fbm(x / 520, z / 520, 3) * 55;
  }

  // Nearest river: distance from bank (negative inside), width and river ref.
  riverInfo(x, z) {
    const list = this.hash.query(x - 1, z - 1, x + 1, z + 1);
    let best = null;
    for (const seg of list) {
      const r = segmentDistance(x, z, seg.a.x, seg.a.z, seg.b.x, seg.b.z);
      const w = seg.a.w + (seg.b.w - seg.a.w) * r.t;
      const edge = r.d - w / 2;
      if (!best || edge < best.edge) best = { edge, w, d: r.d, river: seg.river, seg, t: r.t };
    }
    return best;
  }

  // Applies river valleys and seas to a base height; returns {h, water: depth flag}
  carve(x, z, h, roadGuard = Infinity) {
    const W = WATER_LEVEL;
    const river = this.riverInfo(x, z);
    if (river) {
      const core = this.coreFactor(x, z);
      const bank = 10 + (18 + river.w * 0.35) * core;
      if (river.edge < 0) {
        const depth = clamp(-river.edge / (river.w * 0.5), 0, 1);
        h = W - 0.8 - depth * 3.2;
      } else if (river.edge < bank) {
        const t = smoothstep(0, bank, river.edge);
        h = W + 0.25 + (h - W - 0.25) * t;
      }
    }
    if (this.seas.length) {
      let sd = this.seaDistance(x, z);
      if (sd !== Infinity) {
        for (const c of this.cities) {
          const dc = Math.hypot(x - c.x, z - c.z);
          if (dc < c.R * 0.5) sd = Math.max(sd, c.R * 0.5 - dc + 2);
        }
        if (roadGuard < 40) sd = Math.max(sd, 40 - roadGuard);
        if (sd < 0) h = Math.min(h, W - 1 - clamp(-sd * 0.04, 0, 14));
        else if (sd < 70) h = Math.min(h, W + 0.3 + (h - W - 0.3) * smoothstep(0, 70, sd));
      }
    }
    return h;
  }
}
