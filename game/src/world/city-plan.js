import { TAU, hashString, obbOverlap, rng, wrapAngle } from '../core/util.js';
import { companiesFor } from '../data/economy.js';
import { WATER_LEVEL } from '../core/geo.js';

export function ringLayout(R) {
  if (R >= 700) return [0.17, 0.36, 0.6, 0.88];
  if (R >= 560) return [0.18, 0.4, 0.7];
  if (R >= 400) return [0.22, 0.5, 0.8];
  if (R >= 290) return [0.27, 0.66];
  return [0.32, 0.72];
}

const norm = (a) => ((a % TAU) + TAU) % TAU;

// Builds street nodes/edges for one city inside the shared network. Entries: [{angle, key}]
export function planCityStreets(world, city, entries) {
  const net = world.net;
  const R = city.R;
  const random = rng(hashString(city.id) ^ 0x51ab);
  const rings = ringLayout(R);
  const maxGap = R >= 560 ? 0.72 : R >= 400 ? 0.9 : 1.15;
  const entryAngles = entries.map((e) => norm(e.angle));
  let main = [...entryAngles].sort((a, b) => a - b);
  if (main.length === 0) main = [0];
  // fill angular gaps with ordinary avenues
  for (let guard = 0; guard < 24; guard++) {
    let worst = -1;
    let gap = 0;
    for (let i = 0; i < main.length; i++) {
      const a = main[i];
      const b = i + 1 < main.length ? main[i + 1] : main[0] + TAU;
      if (b - a > gap) {
        gap = b - a;
        worst = i;
      }
    }
    if (gap <= maxGap) break;
    const a = main[worst];
    const mid = norm(a + gap * (0.5 + (random() - 0.5) * 0.18));
    main.push(mid);
    main.sort((x, y) => x - y);
  }
  const ringAngles = rings.map(() => new Set(main));
  const extras = [];
  for (let k = 1; k + 1 < rings.length; k++) {
    for (let i = 0; i < main.length; i++) {
      const a = main[i];
      const b = i + 1 < main.length ? main[i + 1] : main[0] + TAU;
      const arc = (b - a) * rings[k + 1] * R;
      if (arc > 300) {
        const parts = Math.min(3, Math.floor(arc / 260));
        for (let p = 1; p <= parts; p++) {
          const m = norm(a + ((b - a) * p) / (parts + 1));
          extras.push({ angle: m, k });
          ringAngles[k].add(m);
          ringAngles[k + 1].add(m);
        }
      }
    }
  }
  const nodeAt = new Map();
  const jitter = new Map();
  const radiusFor = (k, a) => {
    const key = k + ':' + a.toFixed(5);
    if (!jitter.has(key)) jitter.set(key, 1 + (random() - 0.5) * 0.05);
    return rings[k] * R * jitter.get(key);
  };
  const node = (k, a) => {
    const key = k + ':' + a.toFixed(5);
    if (!nodeAt.has(key)) {
      const r = radiusFor(k, a);
      nodeAt.set(key, net.addNode(city.x + Math.sin(a) * r, city.z + Math.cos(a) * r, { city: city.index, ring: k }));
    }
    return nodeAt.get(key);
  };
  const created = [];
  const outerType = R >= 280 ? 'A' : 'S';
  rings.forEach((frac, k) => {
    const list = [...ringAngles[k]].sort((a, b) => a - b);
    const type = k === rings.length - 1 ? outerType : frac >= 0.5 ? 'A' : 'S';
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const b = i + 1 < list.length ? list[i + 1] : list[0] + TAU;
      const na = node(k, a);
      const nb = node(k, norm(b));
      const ra = Math.hypot(na.x - city.x, na.z - city.z);
      const rb = Math.hypot(nb.x - city.x, nb.z - city.z);
      const steps = Math.max(3, Math.ceil(((b - a) * frac * R) / 7));
      const pts = [];
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const ang = a + (b - a) * t;
        const r = ra + (rb - ra) * t;
        pts.push(j === 0 ? { x: na.x, z: na.z } : j === steps ? { x: nb.x, z: nb.z } : { x: city.x + Math.sin(ang) * r, z: city.z + Math.cos(ang) * r });
      }
      created.push(net.addEdge(na, nb, pts, type, { city: city.index, role: 'ring', ring: k }));
    }
  });
  const entrySet = new Set(entryAngles.map((a) => a.toFixed(5)));
  for (const a of main) {
    const isEntry = entrySet.has(a.toFixed(5));
    for (let k = 0; k < rings.length - 1; k++) {
      const na = node(k, a);
      const nb = node(k + 1, a);
      created.push(net.addEdge(na, nb, straight(na, nb, 7), isEntry ? 'A' : 'S', { city: city.index, role: 'radial', avenue: isEntry }));
    }
  }
  for (const { angle, k } of extras) {
    const na = node(k, angle);
    const nb = node(k + 1, angle);
    created.push(net.addEdge(na, nb, straight(na, nb, 7), 'S', { city: city.index, role: 'radial' }));
  }
  const entryNodes = [];
  for (const entry of entries) {
    const a = norm(entry.angle);
    const inner = node(rings.length - 1, a);
    const x = city.x + Math.sin(a) * city.Rout;
    const z = city.z + Math.cos(a) * city.Rout;
    const en = net.addNode(x, z, { city: city.index, entry: true, angle: a });
    const stub = net.addEdge(inner, en, straight(inner, en, 6), 'A', { city: city.index, role: 'stub', avenue: true });
    created.push(stub);
    entryNodes.push({ key: entry.key, node: en, stub, angle: a });
  }
  return { rings, main, entryNodes, edges: created, nodes: [...nodeAt.values()] };
}

function straight(a, b, step) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
  return pts;
}

// Lots for depots, fuel and service along the avenue stubs leading out of the city.
export function planCityLots(world, city, plan) {
  const net = world.net;
  const random = rng(hashString(city.id) ^ 0x7701);
  const lots = [];
  const slots = [];
  const addSlots = (e, sides, start, end, priority) => {
    for (const side of sides) {
      let s = start;
      while (s < end) {
        const w = 64 + Math.round(random() * 14);
        if (s + w > end) break;
        slots.push({ edge: e, s0: s, s1: s + w, side, depth: 50 + Math.round(random() * 14), priority: priority + random() });
        s += w + 8 + random() * 10;
      }
    }
  };
  for (const entry of plan.entryNodes) if (entry.stub.alive) addSlots(entry.stub, [1, -1], 30, entry.stub.len - 26, 0);
  const outer = plan.rings.length - 1;
  for (const e of plan.edges) {
    if (!e.alive || e.role !== 'ring' || e.ring !== outer || e.len < 110) continue;
    const mid = net.pointAt(e, e.len / 2);
    const outward = (mid.x - city.x) * -mid.fz + (mid.z - city.z) * mid.fx > 0 ? 1 : -1;
    addSlots(e, [outward], 30, e.len - 30, 2);
  }
  slots.sort((a, b) => a.priority - b.priority);
  const kinds = ['fuel', 'service', ...companiesFor(city).map((id) => 'company:' + id)];
  let industry = 0;
  for (const slot of slots) {
    if (!kinds.length && (industry >= 5 || slot.priority >= 2)) break;
    const { edge, s0, s1, side, depth } = slot;
    const mid = (s0 + s1) / 2;
    const p = net.pointAt(edge, mid);
    const off = edge.type.outerHalf + 1.5 + depth / 2;
    const rx = -p.fz * side;
    const rz = p.fx * side;
    const x = p.x + rx * off;
    const z = p.z + rz * off;
    const rect = { x, z, w: s1 - s0, d: depth, heading: Math.atan2(-rx, -rz) };
    if (!lotFits(world, rect, edge, city)) continue;
    const kind = kinds.shift() ?? 'industry';
    if (kind === 'industry') industry++;
    const lot = {
      kind: kind.startsWith('company:') ? 'company' : kind,
      company: kind.startsWith('company:') ? kind.slice(8) : null,
      city: city.index,
      edge: edge.id,
      s: mid,
      side,
      ...rect,
      // lot local frame: heading points from the lot centre toward the road.
      roadHeading: p.heading,
      y: city.baseY,
      frontX: p.x + rx * (edge.type.outerHalf + 1.5),
      frontZ: p.z + rz * (edge.type.outerHalf + 1.5),
    };
    world.addLot(lot);
    lots.push(lot);
  }
  if (kinds.some((k) => k === 'fuel' || k === 'service')) world.issues.push('no room for services in ' + city.id);
  return lots;
}

function lotFits(world, rect, edge, city) {
  const W = WATER_LEVEL;
  const f = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
  const r = { x: -f.z, z: f.x };
  for (const u of [-0.5, 0, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      const x = rect.x + r.x * u * rect.w + f.x * v * rect.d;
      const z = rect.z + r.z * u * rect.w + f.z * v * rect.d;
      if (world.baseHeight(x, z) < W + 1.2) return false;
    }
  }
  const reach = Math.hypot(rect.w, rect.d) / 2 + 4;
  for (const q of world.net.query(rect.x, rect.z, reach)) {
    if (q.edge === edge) continue;
    const p = world.net.pointAt(q.edge, q.s);
    const lx = p.x - rect.x;
    const lz = p.z - rect.z;
    const pad = q.edge.type.outerHalf + 3;
    if (Math.abs(lx * r.x + lz * r.z) < rect.w / 2 + pad && Math.abs(lx * f.x + lz * f.z) < rect.d / 2 + pad) return false;
  }
  for (const other of world.lotHash.query(rect.x, rect.z, rect.x, rect.z)) if (obbOverlap(rect, other, 4)) return false;
  return true;
}

export function angleBetween(a, b) {
  return Math.abs(wrapAngle(a - b));
}
