import { SpatialHash, hashString, obbOverlap, rng } from '../core/util.js';
import { WATER_LEVEL } from '../core/geo.js';
import { F } from '../render/facades.js';
import { landmarkSites } from '../render/landmarks.js';

const W = WATER_LEVEL;

const DIMS = {
  khrushchevka: (r) => ({ w: 3.2 * (15 + Math.floor(r() * 9)), d: 11.8, floors: r() < 0.85 ? 5 : 4, gap: 14 }),
  panel9: (r) => ({ w: 24 * (2 + Math.floor(r() * 3)) + 2, d: 13, floors: r() < 0.75 ? 9 : r() < 0.6 ? 10 : 12, gap: 18 }),
  panelTower: (r) => ({ w: 24 + Math.floor(r() * 2) * 18, d: 16, floors: 14 + Math.floor(r() * 4) + (r() < 0.25 ? 6 : 0), gap: 26 }),
  stalinka: (r) => ({ w: 3.6 * (12 + Math.floor(r() * 10)), d: 15.5, floors: 5 + Math.floor(r() * 3), gap: 10 }),
  merchant: (r) => ({ w: 3.4 * (4 + Math.floor(r() * 5)), d: 12, floors: r() < 0.6 ? 2 : 3, gap: 5 }),
  modern: (r) => ({ w: 3.4 * (9 + Math.floor(r() * 6)), d: 17, floors: 17 + Math.floor(r() * 9), gap: 26 }),
  office: (r) => ({ w: 26 + r() * 14, d: 26 + r() * 12, floors: 9 + Math.floor(r() * 14), gap: 16 }),
  school: () => ({ w: 4.2 * 15, d: 14, floors: 3, gap: 22 }),
  shop: (r) => ({ w: 14 + r() * 16, d: 12 + r() * 6, floors: 1, gap: 8 }),
  hyper: () => ({ w: 104, d: 70, floors: 1, gap: 20 }),
  garages: (r) => ({ w: 3.3 * (10 + Math.floor(r() * 16)), d: 6.5, floors: 1, gap: 6 }),
  izba: (r) => ({ w: 6.8 + r() * 1.8, d: 9 + r() * 2.5, floors: 1, gap: 4, plot: [17 + r() * 5, 22 + r() * 6] }),
  cottage: (r) => ({ w: 9 + r() * 3, d: 9 + r() * 3, floors: 2, gap: 5, plot: [22 + r() * 6, 24 + r() * 6] }),
};

function pickType(zone, city, r, frontage, onAvenue) {
  const big = city.pop >= 700;
  const capital = city.region === 'capital';
  const north = city.region === 'north';
  const south = city.region === 'south' || city.region === 'steppe';
  switch (zone) {
    case 'core':
      if (onAvenue && big) return r.weighted([['stalinka', 5], ['merchant', 3], ['office', capital ? 3 : 1]]);
      return r.weighted([['merchant', 6], ['stalinka', big ? 3 : 1], ['khrushchevka', 1]]);
    case 'inner':
      if (frontage && onAvenue) return r.weighted([['stalinka', big ? 6 : 3], ['panel9', 2], ['modern', capital ? 3 : 1], ['office', capital ? 3 : big ? 1 : 0], ['merchant', big ? 0 : 3]]);
      return r.weighted([['khrushchevka', 6], ['stalinka', 2], ['panel9', 2], ['school', 1], ['merchant', big ? 1 : 3], ['garages', 1]]);
    case 'middle':
      if (frontage && onAvenue) return r.weighted([['panel9', 5], ['khrushchevka', 3], ['shop', 2], ['modern', big ? 2 : 0], ['stalinka', 1]]);
      return r.weighted([['khrushchevka', 6], ['panel9', 5], ['panelTower', big ? 2 : 1], ['school', 1], ['garages', 2], ['shop', 1]]);
    case 'outer':
      if (frontage && onAvenue) return r.weighted([['panel9', 4], ['panelTower', 3], ['modern', big ? 3 : 1], ['shop', 2], ['hyper', big ? 0.4 : 0.15]]);
      return r.weighted([['panel9', 5], ['panelTower', big ? 5 : 2], ['modern', big ? 3 : 0.5], ['garages', 2], ['school', 1], ['khrushchevka', 2]]);
    default:
      return r.weighted([['izba', north ? 7 : south ? 2 : 5], ['cottage', south ? 7 : 3], ['garages', 0.6]]);
  }
}

export class CityBuildings {
  constructor(world, city) {
    this.world = world;
    this.city = city;
    this.list = [];
    this.trees = [];
    this.hash = new SpatialHash(64);
    this.done = false;
    this.random = rng(hashString(city.id) ^ 0xbeef);
    const rings = city.plan.rings;
    this.r0 = rings[0] * city.R;
    this.r1 = (rings[1] ?? 0.6) * city.R;
    this.plaza = this.r0 * 0.78;
    this.sites = landmarkSites(world, city);
  }

  zone(x, z) {
    const c = this.city;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < this.r0 + 6) return 'core';
    const rho = d / c.R;
    if (d < this.r1 || rho < 0.42) return 'inner';
    if (rho < 0.74) return 'middle';
    if (rho < 1.0) return 'outer';
    if (d < c.Rout + 170) return 'fringe';
    return null;
  }

  // Footprint test: water, roads, lots, other buildings, plaza.
  fits(b, margin) {
    const c = this.city;
    const dc = Math.hypot(b.x - c.x, b.z - c.z);
    if (dc < this.plaza + Math.max(b.w, b.d) / 2) return false;
    const span = Math.max(b.plot?.[0] ?? b.w, b.plot?.[1] ?? b.d) / 2;
    for (const s of this.sites) if (Math.hypot(b.x - s.x, b.z - s.z) < s.radius + span + 6) return false;
    const fx = Math.sin(b.heading);
    const fz = Math.cos(b.heading);
    const rx = -fz;
    const rz = fx;
    const pw = (b.plot?.[0] ?? b.w) + 2;
    const pd = (b.plot?.[1] ?? b.d) + 2;
    const nu = Math.max(2, Math.ceil(pw / 7));
    const nv = Math.max(2, Math.ceil(pd / 7));
    const net = this.world.net;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const u = (i / nu - 0.5) * pw;
        const v = (j / nv - 0.5) * pd;
        const x = b.x + rx * u + fx * v;
        const z = b.z + rz * u + fz * v;
        if (net.query(x, z, 0.3).length) return false;
        if (this.world.lotAt(x, z, 4)) return false;
        if ((i === 0 || i === nu || i === nu >> 1) && (j === 0 || j === nv) && this.world.baseHeight(x, z) < W + 1.3) return false;
      }
    }
    const rect = { x: b.x, z: b.z, w: pw, d: pd, heading: b.heading };
    const reach = Math.max(pw, pd) / 2 + 40;
    for (const o of this.hash.query(b.x - reach, b.z - reach, b.x + reach, b.z + reach)) {
      const ro = { x: o.x, z: o.z, w: (o.plot?.[0] ?? o.w) + 2, d: (o.plot?.[1] ?? o.d) + 2, heading: o.heading };
      if (obbOverlap(rect, ro, Math.max(margin, o.gap ?? 0) * 0.5)) return false;
    }
    return true;
  }

  add(b) {
    b.id = this.list.length;
    b.city = this.city.index;
    this.list.push(b);
    const r = Math.max(b.plot?.[0] ?? b.w, b.plot?.[1] ?? b.d) / 2 + 4;
    this.hash.insertBox(b, b.x - r, b.z - r, b.x + r, b.z + r);
  }

  make(type, x, z, heading, extra = {}) {
    const r = this.random;
    const dims = DIMS[type](r);
    const b = { type, x, z, heading, ...dims, seed: Math.floor(r() * 1e6), ...extra };
    const c = this.city;
    const dc = Math.hypot(x - c.x, z - c.z);
    b.y = dc < c.Rout + 25 ? c.baseY : this.world.terrainHeight(x, z) - 0.1;
    if (type === 'khrushchevka') b.facade = r() < 0.35 ? F.khrushchevkaBrick : r() < 0.12 ? F.redBrick : F.khrushchevka;
    if (type === 'panel9') b.facade = r() < 0.55 ? F.panelWhite : F.panelBeige;
    if (type === 'stalinka') {
      b.facade = r() < 0.6 ? F.stalinkaYellow : F.stalinkaPeach;
      b.tower = r() < 0.12 && c.pop > 400;
    }
    if (type === 'izba') b.facade = r() < 0.72 ? F.logWall : F.siding;
    if (type === 'office' && this.city.region === 'capital') b.crown = r() < 0.4;
    b.tint = [0.92 + r() * 0.12, 0.92 + r() * 0.12, 0.92 + r() * 0.12];
    return b;
  }

  *generate() {
    if (this.done) return;
    const c = this.city;
    const net = this.world.net;
    const r = this.random;
    // 1) frontage along every street of the city
    let work = 0;
    const edges = c.plan.edges.filter((e) => e.alive);
    for (const e of edges) {
      const onAvenue = e.type.id === 'A';
      for (const side of [-1, 1]) {
        let s = 18;
        while (s < e.len - 18) {
          const p = net.pointAt(e, s);
          const zone = this.zone(p.x, p.z);
          if (!zone) {
            s += 12;
            continue;
          }
          const type = pickType(zone, c, r, true, onAvenue);
          const dims = DIMS[type](r);
          const setback = zone === 'fringe' ? 3 : type === 'stalinka' || type === 'merchant' ? 2.5 : type === 'shop' ? 4 : 7 + r() * 8;
          const depth = dims.plot ? dims.plot[1] : dims.d;
          const off = e.type.outerHalf + setback + depth / 2;
          const midS = s + (dims.plot ? dims.plot[0] : dims.w) / 2;
          if (midS > e.len - 18) break;
          const q = net.pointAt(e, midS);
          const rx = -q.fz * side;
          const rz = q.fx * side;
          const b = this.make(type, q.x + rx * off, q.z + rz * off, Math.atan2(-rx, -rz), { shop: onAvenue && (type === 'panel9' || type === 'stalinka' || type === 'merchant') && zone !== 'outer' && r() < 0.75 });
          if (dims.plot) b.plot = dims.plot;
          b.w = dims.w;
          b.d = dims.d;
          b.floors = dims.floors;
          b.gap = dims.gap;
          if (this.fits(b, dims.gap)) {
            this.add(b);
            if (onAvenue && zone !== 'fringe' && r() < 0.9) this.streetTrees(e, s, s + (dims.plot ? dims.plot[0] : dims.w), side);
            s += (dims.plot ? dims.plot[0] : dims.w) + (zone === 'fringe' ? 2 + r() * 4 : dims.gap * (0.5 + r() * 0.6));
          } else s += 9;
          if (++work % 30 === 0) yield;
        }
      }
    }
    // 2) infill on a jittered polar grid
    const maxR = c.Rout + 165;
    for (let rad = this.r0 + 30; rad < maxR; rad += 26) {
      const zoneProbe = this.zone(c.x + rad, c.z);
      const spacing = zoneProbe === 'fringe' ? 30 : zoneProbe === 'outer' ? 42 : zoneProbe === 'middle' ? 34 : 30;
      const steps = Math.max(6, Math.floor((2 * Math.PI * rad) / spacing));
      const off = r() * Math.PI * 2;
      for (let k = 0; k < steps; k++) {
        const a = off + (k / steps) * Math.PI * 2 + (r() - 0.5) * 0.02;
        const rr = rad + (r() - 0.5) * 14;
        const x = c.x + Math.sin(a) * rr;
        const z = c.z + Math.cos(a) * rr;
        const zone = this.zone(x, z);
        if (!zone) continue;
        if (zone === 'fringe' && r() < 0.35) continue;
        const type = pickType(zone, c, r, false, false);
        if (type === 'hyper') continue;
        // orientation: microdistricts are laid out parallel or perpendicular to the nearest street
        const near = net.nearest(x, z, 160, (e) => e.city === c.index);
        let heading = near ? Math.atan2(near.hx, near.hz) + (r() < 0.5 ? 0 : Math.PI / 2) : a;
        if (zone === 'fringe' && near) heading = Math.atan2(near.hx, near.hz) + (near.lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
        const dims = DIMS[type](r);
        const b = this.make(type, x, z, heading);
        Object.assign(b, { w: dims.w, d: dims.d, floors: dims.floors, gap: dims.gap });
        if (dims.plot) b.plot = dims.plot;
        if (this.fits(b, dims.gap)) this.add(b);
        if (++work % 24 === 0) yield;
      }
    }
    // 3) yard trees between buildings
    const area = Math.PI * maxR * maxR;
    const want = Math.min(2600, Math.floor(area / 380));
    for (let i = 0; i < want; i++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * maxR;
      const x = c.x + Math.sin(a) * rr;
      const z = c.z + Math.cos(a) * rr;
      if (rr < this.plaza) continue;
      if (net.query(x, z, 1.5).length || this.world.lotAt(x, z, 2)) continue;
      let blocked = false;
      for (const o of this.hash.query(x - 30, z - 30, x + 30, z + 30)) {
        const lx = x - o.x;
        const lz = z - o.z;
        const cs = Math.cos(o.heading);
        const sn = Math.sin(o.heading);
        const u = Math.abs(lx * cs - lz * sn);
        const v = Math.abs(lx * sn + lz * cs);
        const pw = o.plot ? 0 : 3;
        if (u < o.w / 2 + pw && v < o.d / 2 + pw) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (this.world.baseHeight(x, z) < W + 1) continue;
      const zone = this.zone(x, z);
      const species = zone === 'fringe' ? r.weighted([['birch', 3], ['apple', 4], ['spruce', 1]]) : r.weighted([['birch', 4], ['poplar', 2], ['linden', 3], ['maple', 2], ['spruce', 0.6]]);
      this.trees.push({ x, z, species, scale: 0.75 + r() * 0.5 });
      if (i % 200 === 0) yield;
    }
    this.done = true;
  }

  streetTrees(e, s0, s1, side) {
    const net = this.world.net;
    const lat = side * (e.type.pavedHalf + e.type.sidewalk - 1.0);
    for (let s = s0 + 4; s < s1; s += 11) {
      const p = net.pointAt(e, s, lat);
      this.trees.push({ x: p.x, z: p.z, species: this.random() < 0.6 ? 'linden' : 'poplar', scale: 0.8 + this.random() * 0.3, street: true });
    }
  }
}
