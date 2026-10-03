import { CITIES, cityRadius } from '../data/cities.js';
import { HIGHWAYS } from '../data/roads.js';
import { project, WATER_LEVEL, SCALE } from '../core/geo.js';
import { SpatialHash, centripetalCatmull, clamp, hashString, lerp, resample, rng, segmentIntersection, smoothstep, wrapAngle } from '../core/util.js';
import { WaterBodies } from './water.js';
import { naturalHeight } from './relief.js';
import { RoadNetwork } from './network.js';
import { planCityLots, planCityStreets } from './city-plan.js';

const W = WATER_LEVEL;
const HW_STEP = 6;

export class World {
  constructor() {
    this.cities = CITIES.map((c) => {
      const p = project(c.lat, c.lon);
      const R = cityRadius(c.pop);
      return { ...c, x: p.x, z: p.z, R, Rout: R + (R >= 400 ? 200 : 160) };
    });
    this.cityHash = new SpatialHash(2048);
    for (const c of this.cities) {
      const r = c.Rout + 420;
      this.cityHash.insertBox(c, c.x - r, c.z - r, c.x + r, c.z + r);
    }
    this.water = new WaterBodies(this.cities);
    this.net = new RoadNetwork();
    this.lots = [];
    this.lotHash = new SpatialHash(128);
    this.villages = [];
    this.cameras = [];
    this.signs = [];
    this.issues = [];
    for (const c of this.cities) c.baseY = this.cityBaseHeight(c);
    this.prepareHighways();
    this.buildCities();
    this.buildHighwayEdges();
    this.profileEdges();
    this.net.index();
    this.buildOverpasses();
    this.net.index();
    for (const c of this.cities) c.lots = planCityLots(this, c, c.plan);
    for (const n of this.net.nodes) {
      const e = n.edges.map((id) => this.net.edges[id]);
      n.y = e.length ? e.reduce((sum, edge) => sum + (edge.a === n.id ? edge.ys[0] : edge.ys[edge.ys.length - 1]), 0) / e.length : this.terrainHeight(n.x, n.z);
    }
    this.placeVillages();
    this.placeRoadsideLots();
    this.placeCameras();
    this.placeSigns();
    this.markSignals();
  }

  // ---------- heights ----------
  cityBaseHeight(c) {
    let h = 0;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      h += naturalHeight(c.x + Math.sin(a) * c.R * 0.6, c.z + Math.cos(a) * c.R * 0.6);
    }
    h /= 9;
    const river = this.water.riverInfo(c.x, c.z);
    const nearRiver = river && river.edge < c.R * 1.4;
    const sea = this.water.seaDistance(c.x, c.z);
    const nearSea = sea !== Infinity && sea < c.R * 2.2;
    return clamp(h, W + 3.6, nearRiver || nearSea ? W + 8 : W + 60);
  }

  citiesNear(x, z) {
    return this.cityHash.query(x, z, x, z);
  }

  baseHeight(x, z, roadGuard = Infinity) {
    let h = naturalHeight(x, z);
    for (const c of this.citiesNear(x, z)) {
      const d = Math.hypot(x - c.x, z - c.z);
      const t = smoothstep(c.Rout + 30, c.Rout + 400, d);
      h = c.baseY + (h - c.baseY) * t;
    }
    return this.water.carve(x, z, h, roadGuard);
  }

  terrainHeight(x, z) {
    const roads = this.net.query(x, z, 46);
    let guard = Infinity;
    for (const q of roads) if (q.edge.type.highway) guard = Math.min(guard, Math.max(0, q.d - q.edge.type.outerHalf));
    const natural = this.baseHeight(x, z, guard);
    let h = natural;
    let bestW = 0;
    let target = 0;
    for (const q of roads) {
      if (q.bridge) continue;
      const flat = q.edge.type.outerHalf + 1.5;
      const blend = clamp(6 + Math.abs(q.y - natural) * 1.7, 6, 44);
      const w = 1 - smoothstep(flat, flat + blend, q.d);
      if (w > bestW) {
        bestW = w;
        target = q.y - 0.12;
      }
    }
    if (bestW > 0) h = lerp(h, target, bestW);
    for (const lot of this.lotHash.query(x, z, x, z)) {
      const lx = x - lot.x;
      const lz = z - lot.z;
      const c = Math.cos(lot.heading);
      const s = Math.sin(lot.heading);
      const u = Math.abs(lx * c - lz * s) - lot.w / 2;
      const v = Math.abs(lx * s + lz * c) - lot.d / 2;
      const d = Math.max(u, v);
      if (d < 26) {
        const w = 1 - smoothstep(2, 26, d);
        h = lerp(h, lot.y - 0.1, w);
      }
    }
    return h;
  }

  // Drivable surface under (x, z). refY picks the right level under bridges.
  groundAt(x, z, refY = null) {
    const list = this.net.query(x, z, 0);
    let best = null;
    let bestScore = Infinity;
    for (const q of list) {
      const t = q.edge.type;
      const lat = Math.abs(q.lateral);
      let y = q.y;
      let surface = 'road';
      if (lat > t.pavedHalf) {
        if (t.sidewalk > 0 && lat <= t.pavedHalf + t.sidewalk) {
          y += 0.15;
          surface = 'sidewalk';
        } else if (q.bridge && lat <= t.pavedHalf + 1.2) {
          surface = 'curb';
        } else continue;
      }
      const score = refY === null ? -y : y > refY + 1.6 ? 1000 + (y - refY) : Math.abs(refY - y);
      if (score < bestScore) {
        bestScore = score;
        best = { y, surface, edge: q.edge, s: q.s, lateral: q.lateral, bridge: q.bridge, q };
      }
    }
    if (best) return best;
    const lot = this.lotAt(x, z);
    if (lot) return { y: lot.y, surface: 'yard', lot };
    const y = this.terrainHeight(x, z);
    return { y, surface: y < W - 0.3 ? 'water' : 'grass' };
  }

  lotAt(x, z, margin = 0) {
    for (const lot of this.lotHash.query(x, z, x, z)) {
      const lx = x - lot.x;
      const lz = z - lot.z;
      const c = Math.cos(lot.heading);
      const s = Math.sin(lot.heading);
      if (Math.abs(lx * c - lz * s) <= lot.w / 2 + margin && Math.abs(lx * s + lz * c) <= lot.d / 2 + margin) return lot;
    }
    return null;
  }

  addLot(lot) {
    if (lot.id === undefined) lot.id = this.lots.length;
    this.lots.push(lot);
    const r = Math.hypot(lot.w, lot.d) / 2 + 30;
    this.lotHash.insertBox(lot, lot.x - r, lot.z - r, lot.x + r, lot.z + r);
  }

  // ---------- highways ----------
  prepareHighways() {
    const byId = Object.fromEntries(this.cities.map((c) => [c.id, c]));
    this.entries = new Map(this.cities.map((c) => [c.index, []]));
    this.highways = HIGHWAYS.map(([a, b, ref, nameRu, nameEn, cls, via], index) => {
      const A = byId[a];
      const B = byId[b];
      if (!A || !B) throw new Error('Unknown city in highway ' + a + '-' + b);
      const allVias = via.map(([lat, lon, ru, en]) => ({ ...project(lat, lon), ru, en }));
      const vias = [];
      for (const v of allVias) {
        if (Math.hypot(v.x - A.x, v.z - A.z) < A.Rout + 620 || Math.hypot(v.x - B.x, v.z - B.z) < B.Rout + 620) continue;
        const prev = vias[vias.length - 1];
        if (prev && Math.hypot(v.x - prev.x, v.z - prev.z) < 300) continue;
        vias.push(v);
      }
      const first = allVias[0] ?? B;
      const last = allVias[allVias.length - 1] ?? A;
      const hw = { index, A, B, ref, nameRu, nameEn, cls, vias, angleA: Math.atan2(first.x - A.x, first.z - A.z), angleB: Math.atan2(last.x - B.x, last.z - B.z) };
      this.entries.get(A.index).push({ key: index + ':A', angle: hw.angleA, hw });
      this.entries.get(B.index).push({ key: index + ':B', angle: hw.angleB, hw });
      return hw;
    });
    for (const list of this.entries.values()) spreadAngles(list, 0.4);
    for (const list of this.entries.values()) {
      for (const e of list) {
        if (e.key.endsWith(':A')) e.hw.angleA = e.angle;
        else e.hw.angleB = e.angle;
      }
    }
  }

  buildCities() {
    this.entryNodes = new Map();
    for (const city of this.cities) {
      const entries = this.entries.get(city.index);
      const plan = planCityStreets(this, city, entries);
      city.plan = plan;
      for (const en of plan.entryNodes) this.entryNodes.set(en.key, en);
      this.fixCityWater(city, plan);
    }
  }

  fixCityWater(city, plan) {
    const net = this.net;
    const wet = (x, z) => this.baseHeight(x, z) < W + 0.8;
    const dead = new Set();
    for (const n of plan.nodes) if (wet(n.x, n.z)) dead.add(n.id);
    for (const e of plan.edges) if (e.alive && (dead.has(e.a) || dead.has(e.b))) net.removeEdge(e);
    // close every ring around drowned intersections with a bridge arc
    for (let k = 0; k < plan.rings.length; k++) {
      const ringNodes = plan.nodes.filter((n) => n.ring === k && !dead.has(n.id));
      if (ringNodes.length < 2 || ringNodes.length === plan.nodes.filter((n) => n.ring === k).length) continue;
      const ang = (n) => (Math.atan2(n.x - city.x, n.z - city.z) + Math.PI * 2) % (Math.PI * 2);
      ringNodes.sort((a, b) => ang(a) - ang(b));
      for (let i = 0; i < ringNodes.length; i++) {
        const na = ringNodes[i];
        const nb = ringNodes[(i + 1) % ringNodes.length];
        const linked = na.edges.some((id) => net.other(net.edges[id], na.id) === nb.id && net.edges[id].role === 'ring');
        if (linked) continue;
        let a0 = ang(na);
        let a1 = ang(nb);
        if (a1 <= a0) a1 += Math.PI * 2;
        const ra = Math.hypot(na.x - city.x, na.z - city.z);
        const rb = Math.hypot(nb.x - city.x, nb.z - city.z);
        const steps = Math.max(3, Math.ceil(((a1 - a0) * (ra + rb)) / 14));
        const pts = [];
        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          const a = a0 + (a1 - a0) * t;
          const r = ra + (rb - ra) * t;
          pts.push(j === 0 ? { x: na.x, z: na.z } : j === steps ? { x: nb.x, z: nb.z } : { x: city.x + Math.sin(a) * r, z: city.z + Math.cos(a) * r });
        }
        const type = k === plan.rings.length - 1 && city.R >= 280 ? 'A' : plan.rings[k] >= 0.5 ? 'A' : 'S';
        plan.edges.push(net.addEdge(na, nb, pts, type, { city: city.index, role: 'ring', ring: k }));
      }
    }
    // entry stubs whose inner end drowned: reconnect to the nearest dry outer-ring node
    const outer = plan.rings.length - 1;
    for (const en of plan.entryNodes) {
      if (en.stub.alive) continue;
      let best = null;
      for (const n of plan.nodes) {
        if (n.ring !== outer || dead.has(n.id)) continue;
        const d = Math.hypot(n.x - en.node.x, n.z - en.node.z);
        if (!best || d < best.d) best = { n, d };
      }
      if (!best) continue;
      const pts = [];
      const steps = Math.max(2, Math.ceil(best.d / 6));
      for (let j = 0; j <= steps; j++) pts.push({ x: best.n.x + ((en.node.x - best.n.x) * j) / steps, z: best.n.z + ((en.node.z - best.n.z) * j) / steps });
      en.stub = net.addEdge(best.n, en.node, pts, 'A', { city: city.index, role: 'stub', avenue: true });
      plan.edges.push(en.stub);
    }
    for (const e of plan.edges) {
      if (!e.alive) continue;
      let count = 0;
      for (let i = 0; i < e.xs.length; i++) if (wet(e.xs[i], e.zs[i])) count++;
      const wetLen = (count / e.xs.length) * e.len;
      if (count && e.role === 'radial' && !e.avenue && wetLen > 140) net.removeEdge(e);
      else if (count && wetLen > 700) net.removeEdge(e);
    }
    // keep only the component reachable from the entries
    const start = plan.entryNodes[0]?.node;
    if (!start) return;
    const seen = new Set([start.id]);
    const stack = [start.id];
    while (stack.length) {
      const id = stack.pop();
      for (const eid of net.nodes[id].edges) {
        const e = net.edges[eid];
        const o = net.other(e, id);
        if (!seen.has(o)) {
          seen.add(o);
          stack.push(o);
        }
      }
    }
    for (const en of plan.entryNodes) if (!seen.has(en.node.id)) this.issues.push('entry cut off by water: ' + city.id + ' ' + en.key);
    for (const e of plan.edges) if (e.alive && !seen.has(e.a)) net.removeEdge(e);
  }

  buildHighwayEdges() {
    for (const hw of this.highways) {
      const ea = this.entryNodes.get(hw.index + ':A');
      const eb = this.entryNodes.get(hw.index + ':B');
      const { A, B } = hw;
      const random = rng(hashString(A.id + '>' + B.id));
      const gap = Math.hypot(ea.node.x - eb.node.x, ea.node.z - eb.node.z);
      const lead = clamp(gap * 0.22, 30, 240);
      const leadA = { x: ea.node.x + Math.sin(hw.angleA) * lead, z: ea.node.z + Math.cos(hw.angleA) * lead };
      const leadB = { x: eb.node.x + Math.sin(hw.angleB) * lead, z: eb.node.z + Math.cos(hw.angleB) * lead };
      const control = [{ x: ea.node.x, z: ea.node.z }, leadA, ...hw.vias, leadB, { x: eb.node.x, z: eb.node.z }];
      const pts = [control[0]];
      for (let i = 0; i < control.length - 1; i++) {
        const p = control[i];
        const q = control[i + 1];
        if (i >= 1 && i < control.length - 2) {
          const len = Math.hypot(q.x - p.x, q.z - p.z);
          const count = len > 1100 ? Math.floor(len / 620) : 0;
          const ux = (q.x - p.x) / len;
          const uz = (q.z - p.z) / len;
          for (let j = 1; j <= count; j++) {
            const t = j / (count + 1);
            const amp = Math.min(len * 0.035, 85) * (random() * 2 - 1);
            pts.push({ x: p.x + (q.x - p.x) * t - uz * amp, z: p.z + (q.z - p.z) * t + ux * amp });
          }
        }
        pts.push(q);
      }
      let line = resample(centripetalCatmull(pts, 4), HW_STEP);
      for (let pass = 0; pass < 3; pass++) {
        line = this.avoidCities(line, A, B);
        smoothLine(line, 6);
      }
      line = resample(line, HW_STEP);
      line[0] = { x: ea.node.x, z: ea.node.z };
      line[line.length - 1] = { x: eb.node.x, z: eb.node.z };
      const edge = this.net.addEdge(ea.node, eb.node, line, hw.cls, { city: -1, highway: hw.index, ref: hw.ref, nameRu: hw.nameRu, nameEn: hw.nameEn, cityA: A.index, cityB: B.index });
      hw.edge = edge;
    }
  }

  avoidCities(line, A, B) {
    for (const p of line) {
      for (const c of this.citiesNear(p.x, p.z)) {
        if (c === A || c === B) continue;
        const need = c.Rout + 140;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < need) {
          p.x = c.x + (dx / (d || 1)) * need;
          p.z = c.z + (dz / (d || 1)) * need;
        }
      }
    }
    return line;
  }

  profileEdges() {
    for (const e of this.net.edges) {
      if (!e.alive) continue;
      if (e.city >= 0) {
        const c = this.cities[e.city];
        this.profile(e, c.baseY, c.baseY, 0, 0.065);
      } else {
        const hw = this.highways[e.highway];
        this.profile(e, hw.A.baseY, hw.B.baseY, 16, 0.05);
      }
    }
  }

  profile(e, y0, y1, window, grade) {
    const n = e.xs.length;
    const base = new Float64Array(n);
    const wet = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const h = this.baseHeight(e.xs[i], e.zs[i], 0);
      base[i] = h;
      wet[i] = h < W + 0.9 ? 1 : 0;
    }
    // interpolate across water for the smoothing input
    let y = Float64Array.from(base);
    for (let i = 0; i < n; i++) {
      if (!wet[i]) continue;
      let j = i;
      while (j < n && wet[j]) j++;
      const left = i > 0 ? y[i - 1] : y0;
      const right = j < n ? y[j] : y1;
      for (let k = i; k < j; k++) y[k] = lerp(left, right, (k - i + 1) / (j - i + 1));
      i = j;
    }
    if (window > 0) {
      for (let pass = 0; pass < 3; pass++) y = movingAverage(y, window);
    } else y.fill(y0);
    const pin = Math.min(Math.floor(n / 2), Math.ceil(260 / HW_STEP));
    for (let i = 0; i < n; i++) {
      if (i < pin) y[i] = lerp(y0, y[i], smoothstep(0, pin, i));
      if (n - 1 - i < pin) y[i] = lerp(y1, y[i], smoothstep(0, pin, n - 1 - i));
    }
    y[0] = y0;
    y[n - 1] = y1;
    // bridges over water
    const step = e.len / Math.max(1, n - 1);
    const pad = Math.ceil(12 / step);
    for (let i = 0; i < n; i++) {
      if (!wet[i]) continue;
      let j = i;
      while (j < n && (wet[j] || (j + 2 < n && (wet[j + 1] || wet[j + 2])))) j++;
      const a = Math.max(0, i - pad);
      const b = Math.min(n - 1, j + pad);
      const river = this.water.riverInfo(e.xs[(i + j) >> 1], e.zs[(i + j) >> 1]);
      const deck = W + (river && river.w > 110 ? 9.5 : 7.2);
      const gs = step * grade;
      for (let k = a; k <= b; k++) {
        e.bridge[k] = 1;
        y[k] = Math.max(y[k], Math.min(deck, y0 + gs * k, y1 + gs * (n - 1 - k)));
      }
      e.bridges.push({ s0: e.ss[a], s1: e.ss[b], i0: a, i1: b, kind: 'river', deck, river: river?.river.id ?? 'water' });
      i = j;
    }
    applyGrade(y, e.bridge, step * grade, n, y0, y1, true);
    e.ys.set(y);
  }

  buildOverpasses() {
    const net = this.net;
    const hwEdges = net.edges.filter((e) => e.alive && e.city < 0);
    const found = [];
    for (const e of hwEdges) {
      for (let i = 0; i < e.xs.length - 1; i++) {
        const ax = e.xs[i];
        const az = e.zs[i];
        const bx = e.xs[i + 1];
        const bz = e.zs[i + 1];
        const list = net.query((ax + bx) / 2, (az + bz) / 2, 6);
        for (const q of list) {
          const o = q.edge;
          if (o.id <= e.id || o.city >= 0) continue;
          const j = q.i;
          const hit = segmentIntersection(ax, az, bx, bz, o.xs[j], o.zs[j], o.xs[j + 1], o.zs[j + 1]);
          if (!hit) continue;
          if (found.some((f) => f.e === e && f.o === o && Math.abs(f.si - i) < 10)) continue;
          found.push({ e, o, si: i, sj: j, hit });
        }
      }
    }
    for (const f of found) {
      const { e, o, si, sj } = f;
      const eUpper = e.type.id === 'M' && o.type.id !== 'M' ? true : o.type.id === 'M' && e.type.id !== 'M' ? false : e.id < o.id;
      const upper = eUpper ? e : o;
      const lower = eUpper ? o : e;
      const ui = eUpper ? si : sj;
      const li = eUpper ? sj : si;
      const hu = Math.atan2(upper.xs[ui + 1] - upper.xs[ui], upper.zs[ui + 1] - upper.zs[ui]);
      const hl = Math.atan2(lower.xs[li + 1] - lower.xs[li], lower.zs[li + 1] - lower.zs[li]);
      const sin = Math.max(0.35, Math.abs(Math.sin(hu - hl)));
      const half = (lower.type.outerHalf + 5) / sin;
      const deck = Math.max(lower.ys[li], lower.ys[li + 1]) + 7.6;
      const step = upper.len / (upper.xs.length - 1);
      const span = Math.ceil(half / step);
      const a = Math.max(0, ui - span);
      const b = Math.min(upper.xs.length - 1, ui + span + 1);
      const y = Float64Array.from(upper.ys);
      for (let k = a; k <= b; k++) {
        upper.bridge[k] = 1;
        y[k] = Math.max(y[k], deck);
      }
      upper.bridges.push({ s0: upper.ss[a], s1: upper.ss[b], i0: a, i1: b, kind: 'overpass', deck, under: lower.id });
      applyGrade(y, upper.bridge, step * 0.045, y.length, y[0], y[y.length - 1]);
      upper.ys.set(y);
    }
    this.overpasses = found.length;
  }

  // ---------- roadside ----------
  placeVillages() {
    const net = this.net;
    for (const hw of this.highways) {
      const e = hw.edge;
      const random = rng(hashString('village' + hw.index));
      for (const v of hw.vias) {
        const q = net.nearest(v.x, v.z, 600, (edge) => edge === e);
        if (!q) continue;
        const p = net.pointAt(e, q.s);
        if (this.villages.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 420)) continue;
        if (this.baseHeight(p.x, p.z) < W + 1) continue;
        const half = 110 + random() * 110;
        if (q.s < half + 120 || q.s > e.len - half - 120) continue;
        this.villages.push({ id: this.villages.length, ru: v.ru, en: v.en, x: p.x, z: p.z, edge: e.id, s: q.s, half, seed: hashString(v.ru) });
      }
    }
  }

  placeRoadsideLots() {
    const net = this.net;
    for (const hw of this.highways) {
      const e = hw.edge;
      const random = rng(hashString('roadside' + hw.index));
      let s = 700 + random() * 1200;
      let side = random() < 0.5 ? 1 : -1;
      while (s < e.len - 800) {
        const nearVillage = this.villages.some((v) => v.edge === e.id && Math.abs(v.s - s) < v.half + 120);
        const onBridge = e.bridges.some((b) => s > b.s0 - 140 && s < b.s1 + 140);
        if (!nearVillage && !onBridge) {
          const kind = random() < 0.72 ? 'fuel' : random() < 0.5 ? 'cafe' : 'rest';
          const w = kind === 'rest' ? 90 : 76;
          const d = kind === 'rest' ? 34 : 48;
          const p = net.pointAt(e, s);
          const off = e.type.outerHalf + 2 + d / 2;
          const rx = -p.fz * side;
          const rz = p.fx * side;
          const x = p.x + rx * off;
          const z = p.z + rz * off;
          let ok = true;
          for (let k = -1; k <= 1 && ok; k++) {
            for (let m = -1; m <= 1 && ok; m++) {
              const cx = x + (Math.cos(p.heading) * k * w) / 2 + rx * m * (d / 2);
              const cz = z - (Math.sin(p.heading) * k * w) / 2 + rz * m * (d / 2);
              if (this.baseHeight(cx, cz) < W + 1.2) ok = false;
            }
          }
          const others = net.query(x, z, Math.max(w, d) / 2 + 6).filter((q) => q.edge !== e);
          if (others.length) ok = false;
          for (const c of this.citiesNear(x, z)) if (Math.hypot(x - c.x, z - c.z) < c.Rout + 200) ok = false;
          if (ok) {
            const lot = { kind, city: -1, edge: e.id, s, side, x, z, w, d, heading: Math.atan2(-rx, -rz), roadHeading: p.heading, y: p.y, frontX: p.x + rx * (e.type.outerHalf + 2), frontZ: p.z + rz * (e.type.outerHalf + 2), highway: hw.index };
            this.addLot(lot);
          }
        }
        s += 2400 + random() * 2600;
        side = -side;
      }
    }
  }

  placeCameras() {
    for (const hw of this.highways) {
      const e = hw.edge;
      const random = rng(hashString('cam' + hw.index));
      let s = 900 + random() * 1500;
      while (s < e.len - 600) {
        if (!e.bridges.some((b) => s > b.s0 - 60 && s < b.s1 + 60)) this.cameras.push({ edge: e.id, s, limit: this.speedLimit(e, s) });
        s += 2600 + random() * 3800;
      }
    }
  }

  speedLimit(edge, s) {
    if (edge.city >= 0) return 60;
    for (const v of this.villages) if (v.edge === edge.id && Math.abs(v.s - s) < v.half + 30) return 60;
    return edge.type.speed;
  }

  placeSigns() {
    const net = this.net;
    for (const hw of this.highways) {
      const e = hw.edge;
      const km = Math.round((e.len * SCALE) / 1000);
      // leaving A towards B (travel direction +1, right side lateral +)
      this.signs.push({ edge: e.id, s: 150, dir: 1, kind: 'distance', lines: [[hw.B.ru, hw.B.en, km]], ref: hw.ref });
      this.signs.push({ edge: e.id, s: e.len - 150, dir: -1, kind: 'distance', lines: [[hw.A.ru, hw.A.en, km]], ref: hw.ref });
      // city name boards at entries
      this.signs.push({ edge: e.id, s: e.len - 40, dir: 1, kind: 'city', ru: hw.B.ru, en: hw.B.en });
      this.signs.push({ edge: e.id, s: 40, dir: -1, kind: 'city', ru: hw.A.ru, en: hw.A.en });
      this.signs.push({ edge: e.id, s: 70, dir: 1, kind: 'cityEnd', ru: hw.A.ru, en: hw.A.en });
      this.signs.push({ edge: e.id, s: e.len - 70, dir: -1, kind: 'cityEnd', ru: hw.B.ru, en: hw.B.en });
      this.signs.push({ edge: e.id, s: 230, dir: 1, kind: 'limit', value: e.type.speed });
      this.signs.push({ edge: e.id, s: e.len - 230, dir: -1, kind: 'limit', value: e.type.speed });
      this.signs.push({ edge: e.id, s: e.len - 420, dir: 1, kind: 'advance', ru: hw.B.ru, en: hw.B.en, ref: hw.ref });
      this.signs.push({ edge: e.id, s: 420, dir: -1, kind: 'advance', ru: hw.A.ru, en: hw.A.en, ref: hw.ref });
      if (hw.ref) {
        for (let s = 1600; s < e.len - 900; s += 3200) {
          this.signs.push({ edge: e.id, s, dir: 1, kind: 'route', ref: hw.ref, name: hw.nameRu, nameEn: hw.nameEn });
          this.signs.push({ edge: e.id, s: s + 400, dir: -1, kind: 'route', ref: hw.ref, name: hw.nameRu, nameEn: hw.nameEn });
        }
      }
      // mid-route distance boards
      for (let s = 2600; s < e.len - 1800; s += 5200) {
        const toB = Math.round(((e.len - s) * SCALE) / 1000);
        const toA = Math.round((s * SCALE) / 1000);
        this.signs.push({ edge: e.id, s, dir: 1, kind: 'distance', lines: [[hw.B.ru, hw.B.en, toB]], ref: hw.ref });
        this.signs.push({ edge: e.id, s: s + 250, dir: -1, kind: 'distance', lines: [[hw.A.ru, hw.A.en, toA]], ref: hw.ref });
      }
    }
    for (const v of this.villages) {
      const e = net.edges[v.edge];
      this.signs.push({ edge: e.id, s: v.s - v.half - 25, dir: 1, kind: 'village', ru: v.ru, en: v.en });
      this.signs.push({ edge: e.id, s: v.s + v.half + 25, dir: -1, kind: 'village', ru: v.ru, en: v.en });
      this.signs.push({ edge: e.id, s: v.s + v.half + 32, dir: 1, kind: 'villageEnd', ru: v.ru, en: v.en });
      this.signs.push({ edge: e.id, s: v.s - v.half - 32, dir: -1, kind: 'villageEnd', ru: v.ru, en: v.en });
    }
    for (const c of this.cameras) {
      this.signs.push({ edge: c.edge, s: c.s - 180, dir: 1, kind: 'camera' });
      this.signs.push({ edge: c.edge, s: c.s + 180, dir: -1, kind: 'camera' });
    }
  }

  markSignals() {
    for (const n of this.net.nodes) {
      if (n.city === undefined || n.entry) continue;
      const edges = n.edges.map((id) => this.net.edges[id]).filter((e) => e.alive);
      if (edges.length >= 3 && edges.some((e) => e.type.id === 'A')) {
        const dirs = edges.map((e) => ({ edge: e.id, angle: this.net.departure(e, n.id, 14).angle }));
        // two phases: roads roughly parallel to the first edge's axis share a phase
        const axis = dirs[0].angle;
        n.signal = { groups: dirs.map((d) => (Math.abs(Math.sin(wrapAngle(d.angle - axis))) < 0.6 ? 0 : 1)), edges: dirs.map((d) => d.edge), offset: (n.id * 7.3) % 30 };
      }
    }
  }

  // ---------- helpers ----------
  nearestCity(x, z) {
    let best = this.cities[0];
    let bd = Infinity;
    for (const c of this.cities) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return { city: best, d: bd };
  }
}

function spreadAngles(list, minSep) {
  if (list.length < 2) return;
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    list.sort((a, b) => a.angle - b.angle);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const b = list[(i + 1) % list.length];
      let gap = b.angle - a.angle;
      if (i === list.length - 1) gap += Math.PI * 2;
      if (gap < minSep) {
        const push = (minSep - gap) / 2 + 0.002;
        a.angle -= push;
        b.angle += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const e of list) e.angle = wrapAngle(e.angle);
}

function smoothLine(line, passes) {
  for (let p = 0; p < passes; p++) {
    for (let i = 1; i < line.length - 1; i++) {
      line[i].x = line[i].x * 0.5 + (line[i - 1].x + line[i + 1].x) * 0.25;
      line[i].z = line[i].z * 0.5 + (line[i - 1].z + line[i + 1].z) * 0.25;
    }
  }
}

function movingAverage(y, r) {
  const n = y.length;
  const out = new Float64Array(n);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + y[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - r);
    const b = Math.min(n - 1, i + r);
    out[i] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
  }
  return out;
}

// Limits the grade between neighbours and keeps every sample reachable from both ends.
// River decks may be capped by reachability (clampFixed); overpass decks must stay above the road below.
function applyGrade(y, fixed, g, n, y0, y1, clampFixed = false) {
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < n; i++) {
      const lo = Math.max(y0 - g * i, y1 - g * (n - 1 - i));
      const hi = Math.min(y0 + g * i, y1 + g * (n - 1 - i));
      if (hi >= lo && (clampFixed || !fixed[i])) y[i] = clamp(y[i], lo, hi);
    }
    for (let i = 1; i < n; i++) if (y[i] < y[i - 1] - g) y[i] = y[i - 1] - g;
    for (let i = n - 2; i >= 0; i--) if (y[i] < y[i + 1] - g) y[i] = y[i + 1] - g;
    for (let i = 1; i < n - 1; i++) if (!fixed[i] && y[i] > y[i - 1] + g) y[i] = y[i - 1] + g;
    for (let i = n - 2; i > 0; i--) if (!fixed[i] && y[i] > y[i + 1] + g) y[i] = y[i + 1] + g;
  }
  y[0] = y0;
  y[n - 1] = y1;
}
