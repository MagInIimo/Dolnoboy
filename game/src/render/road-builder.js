import { GeoBuilder } from './geo-builder.js';
import { L } from './surfaces.js';
import { clamp, wrapAngle } from '../core/util.js';

const WHITE = [0.94, 0.94, 0.92];
const YELLOW = [0.95, 0.72, 0.16];
const NEUTRAL = [1, 1, 1];

// Precomputes trims and miters at every node.
export function computeNodeInfo(world) {
  const net = world.net;
  const info = new Array(net.nodes.length);
  for (const n of net.nodes) {
    const edges = n.edges.map((id) => net.edges[id]).filter((e) => e.alive);
    const dirs = edges.map((e) => ({ e, d: net.departure(e, n.id, 12) }));
    const trims = new Map();
    const miters = new Map();
    let kind = 'end';
    if (edges.length === 2) {
      const [a, b] = dirs;
      const turn = Math.abs(wrapAngle(a.d.angle - b.d.angle + Math.PI));
      if (a.e.type === b.e.type && turn < 0.6) {
        kind = 'cont';
        // shared cross-section direction: average of the incoming and outgoing travel directions
        const fx = -a.d.x + b.d.x;
        const fz = -a.d.z + b.d.z;
        const l = Math.hypot(fx, fz) || 1;
        miters.set(a.e.id, { x: -fx / l, z: -fz / l });
        miters.set(b.e.id, { x: fx / l, z: fz / l });
        trims.set(a.e.id, 0);
        trims.set(b.e.id, 0);
      }
    }
    if (kind !== 'cont' && edges.length >= 2) {
      kind = 'patch';
      for (const a of dirs) {
        let t = 3;
        for (const b of dirs) {
          if (a === b) continue;
          const sin = Math.abs(Math.sin(a.d.angle - b.d.angle));
          const reach = b.e.type.pavedHalf + b.e.type.sidewalk + 1.5;
          t = Math.max(t, reach / Math.max(0.42, sin));
          if (edges.length === 2) t = Math.max(t, 6);
        }
        trims.set(a.e.id, clamp(t, 3, Math.min(32, a.e.len * 0.4)));
      }
    }
    dirs.sort((p, q) => p.d.angle - q.d.angle);
    info[n.id] = { kind, trims, miters, dirs };
  }
  return info;
}

function rightAt(e, i, n, startMiter, endMiter) {
  let fx;
  let fz;
  if (i === 0 && startMiter) {
    fx = startMiter.x;
    fz = startMiter.z;
  } else if (i === n - 1 && endMiter) {
    fx = -endMiter.x;
    fz = -endMiter.z;
  } else {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    fx = e.xs[b] - e.xs[a];
    fz = e.zs[b] - e.zs[a];
  }
  const l = Math.hypot(fx, fz) || 1;
  return { rx: -fz / l, rz: fx / l, fx: fx / l, fz: fz / l };
}

// Lateral profile [from, to, layer, dy0, dy1]
function profileFor(type, bridge) {
  const P = [];
  const c = type.carriageHalf;
  const p = type.pavedHalf;
  const o = type.outerHalf;
  if (type.highway) {
    if (!bridge) P.push([-o, -p, L.GRAVEL, -0.22, -0.02]);
    P.push([-p, -c, L.SHOULDER, 0, 0], [-c, c, L.ASPHALT, 0, 0], [c, p, L.SHOULDER, 0, 0]);
    if (!bridge) P.push([p, o, L.GRAVEL, -0.02, -0.22]);
  } else if (type.local) {
    P.push([-o, -p, L.GRAVEL, -0.16, -0.03], [-p, p, L.WORN, 0, 0], [p, o, L.GRAVEL, -0.03, -0.16]);
  } else {
    P.push([-p, p, L.ASPHALT, 0, 0]);
  }
  return P;
}

export class RoadBuilder {
  constructor(world) {
    this.world = world;
    this.net = world.net;
    this.nodeInfo = computeNodeInfo(world);
  }

  trimAt(e, end) {
    const node = end === 'a' ? e.a : e.b;
    return this.nodeInfo[node].trims.get(e.id) ?? 0;
  }

  // Builds road surfaces and markings for all segments whose midpoint lies inside the chunk.
  buildChunk(x0, z0, size) {
    const road = new GeoBuilder({ aLayer: 1, aTint: 3 });
    const marks = new GeoBuilder({ aLayer: 1, aTint: 3 });
    road.setOrigin(x0, 0, z0);
    marks.setOrigin(x0, 0, z0);
    const edges = new Set();
    for (const key of this.net.hash.query(x0, z0, x0 + size, z0 + size)) edges.add(Math.floor(key / 8192));
    for (const id of edges) {
      const e = this.net.edges[id];
      if (!e.alive) continue;
      const inside = (i) => {
        const mx = (e.xs[i] + e.xs[i + 1]) / 2;
        const mz = (e.zs[i] + e.zs[i + 1]) / 2;
        return mx >= x0 && mx < x0 + size && mz >= z0 && mz < z0 + size;
      };
      const n = e.xs.length;
      let i = 0;
      while (i < n - 1) {
        if (!inside(i)) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < n - 1 && inside(j + 1)) j++;
        this.edgeRun(e, i, j + 1, road, marks);
        i = j + 1;
      }
    }
    for (const node of this.net.nodes) {
      if (node.x < x0 || node.x >= x0 + size || node.z < z0 || node.z >= z0 + size) continue;
      const inf = this.nodeInfo[node.id];
      if (inf.kind === 'patch') this.patch(node, inf, road, marks);
    }
    return { road: road.build(), marks: marks.build() };
  }

  edgeRun(e, i0, i1, road, marks) {
    const n = e.xs.length;
    const sA = this.trimAt(e, 'a');
    const sB = e.len - this.trimAt(e, 'b');
    const infoA = this.nodeInfo[e.a];
    const infoB = this.nodeInfo[e.b];
    const startMiter = infoA.miters.get(e.id);
    const endMiter = infoB.miters.get(e.id);
    // rows: sample indices within [i0, i1] clipped to [sA, sB]
    const rows = [];
    const lo = Math.max(e.ss[i0], sA);
    const hi = Math.min(e.ss[i1], sB);
    if (hi - lo < 0.05) return;
    const pushRow = (s, i, t) => {
      const ia = i;
      const ib = Math.min(n - 1, i + 1);
      const x = e.xs[ia] + (e.xs[ib] - e.xs[ia]) * t;
      const z = e.zs[ia] + (e.zs[ib] - e.zs[ia]) * t;
      const y = e.ys[ia] + (e.ys[ib] - e.ys[ia]) * t;
      const r = t === 0 ? rightAt(e, ia, n, startMiter, endMiter) : t === 1 ? rightAt(e, ib, n, startMiter, endMiter) : rightAt(e, ia, n, null, null);
      rows.push({ s, x, y, z, ...r, bridge: e.bridge[ia] && e.bridge[ib] });
    };
    const locate = (s) => {
      let i = i0;
      while (i < i1 && e.ss[i + 1] < s) i++;
      const seg = e.ss[i + 1] - e.ss[i] || 1;
      return { i, t: clamp((s - e.ss[i]) / seg, 0, 1) };
    };
    const a = locate(lo);
    pushRow(lo, a.i, a.t);
    for (let k = i0; k <= i1; k++) if (e.ss[k] > lo + 0.05 && e.ss[k] < hi - 0.05) pushRow(e.ss[k], k, 0);
    const b = locate(hi);
    pushRow(hi, b.i, b.t);
    // surfaces
    const type = e.type;
    for (let r = 0; r < rows.length - 1; r++) {
      const A = rows[r];
      const B = rows[r + 1];
      const bridge = A.bridge && B.bridge;
      for (const [l0, l1, layer, d0, d1] of profileFor(type, bridge)) {
        const v0 = road.vertex(A.x + A.rx * l0, A.y + d0, A.z + A.rz * l0, 0, 1, 0, l0 / 7, A.s / 7, { aLayer: layer, aTint: NEUTRAL });
        const v1 = road.vertex(A.x + A.rx * l1, A.y + d1, A.z + A.rz * l1, 0, 1, 0, l1 / 7, A.s / 7, { aLayer: layer, aTint: NEUTRAL });
        const v2 = road.vertex(B.x + B.rx * l1, B.y + d1, B.z + B.rz * l1, 0, 1, 0, l1 / 7, B.s / 7, { aLayer: layer, aTint: NEUTRAL });
        const v3 = road.vertex(B.x + B.rx * l0, B.y + d0, B.z + B.rz * l0, 0, 1, 0, l0 / 7, B.s / 7, { aLayer: layer, aTint: NEUTRAL });
        road.quad(v0, v1, v2, v3);
      }
      if (type.sidewalk > 0) {
        for (const side of [-1, 1]) {
          const p = type.pavedHalf * side;
          const q = (type.pavedHalf + type.sidewalk) * side;
          const [l0, l1] = side < 0 ? [q, p] : [p, q];
          const top = 0.15;
          const v0 = road.vertex(A.x + A.rx * l0, A.y + top, A.z + A.rz * l0, 0, 1, 0, l0 / 4, A.s / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
          const v1 = road.vertex(A.x + A.rx * l1, A.y + top, A.z + A.rz * l1, 0, 1, 0, l1 / 4, A.s / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
          const v2 = road.vertex(B.x + B.rx * l1, B.y + top, B.z + B.rz * l1, 0, 1, 0, l1 / 4, B.s / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
          const v3 = road.vertex(B.x + B.rx * l0, B.y + top, B.z + B.rz * l0, 0, 1, 0, l0 / 4, B.s / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
          road.quad(v0, v1, v2, v3);
          // curb face toward the carriageway
          const nx = -A.rx * side;
          const nz = -A.rz * side;
          const c0 = road.vertex(A.x + A.rx * p, A.y, A.z + A.rz * p, nx, 0, nz, A.s / 2, 0, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
          const c1 = road.vertex(B.x + B.rx * p, B.y, B.z + B.rz * p, nx, 0, nz, B.s / 2, 0, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
          const c2 = road.vertex(B.x + B.rx * p, B.y + top, B.z + B.rz * p, nx, 0, nz, B.s / 2, 0.08, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
          const c3 = road.vertex(A.x + A.rx * p, A.y + top, A.z + A.rz * p, nx, 0, nz, A.s / 2, 0.08, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
          if (side > 0) road.quad(c0, c3, c2, c1);
          else road.quad(c0, c1, c2, c3);
        }
      }
    }
    this.markings(e, rows, marks, sA, sB);
    this.wearDecals(e, rows, marks);
  }

  // Potholes and patches: small decals on the overlay layer (the shader draws them from decal uv).
  wearDecals(e, rows, marks) {
    const list = this.world.wearOf(e);
    if (!list.length) return;
    const lo = rows[0].s;
    const hi = rows[rows.length - 1].s;
    const under = e.type.local ? L.WORN : L.ASPHALT;
    const at = (s) => {
      let k = 0;
      while (k < rows.length - 2 && rows[k + 1].s < s) k++;
      const A = rows[k];
      const B = rows[k + 1];
      const t = clamp((s - A.s) / (B.s - A.s || 1), 0, 1);
      return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t, rx: A.rx + (B.rx - A.rx) * t, rz: A.rz + (B.rz - A.rz) * t };
    };
    for (const w of list) {
      if (w.s < lo + w.r || w.s > hi - w.r) continue;
      const along = w.kind === 'hole' ? w.r : w.r * 1.4;
      const across = w.r;
      const layer = w.kind === 'hole' ? 1 : 2;
      const tint = [w.seed, under, w.seed * 0.7];
      const ids = [];
      for (let j = 0; j <= 2; j++) {
        const p = at(w.s - along + along * j);
        for (let i = 0; i <= 2; i++) {
          const lat = w.lat - across + across * i;
          ids.push(marks.vertex(p.x + p.rx * lat, p.y + 0.012, p.z + p.rz * lat, 0, 1, 0, i / 2, j / 2, { aLayer: layer, aTint: tint }));
        }
      }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) marks.quad(ids[j * 3 + i], ids[j * 3 + i + 1], ids[(j + 1) * 3 + i + 1], ids[(j + 1) * 3 + i]);
    }
  }

  markings(e, rows, marks, sA, sB) {
    const t = e.type;
    const lines = [];
    const solid = (lat, w, tint = WHITE) => lines.push({ lat, w, tint, dash: 0 });
    const dashed = (lat, w, dash, gap, tint = WHITE) => lines.push({ lat, w, tint, dash, gap });
    if (t.id === 'M') {
      solid(-0.55, 0.15);
      solid(0.55, 0.15);
      dashed(-(t.median / 2 + t.laneWidth), 0.15, 3, 9);
      dashed(t.median / 2 + t.laneWidth, 0.15, 3, 9);
      solid(-t.carriageHalf, 0.2);
      solid(t.carriageHalf, 0.2);
    } else if (t.id === 'R') {
      dashed(0, 0.15, 4, 8);
      solid(-t.carriageHalf, 0.2);
      solid(t.carriageHalf, 0.2);
    } else if (t.id === 'A') {
      solid(-0.18, 0.12);
      solid(0.18, 0.12);
      dashed(-(t.median / 2 + t.laneWidth), 0.12, 3, 6);
      dashed(t.median / 2 + t.laneWidth, 0.12, 3, 6);
    } else if (t.id === 'S') {
      dashed(0, 0.12, 3, 6);
    }
    for (const line of lines) {
      if (line.dash) {
        const period = line.dash + line.gap;
        const first = Math.ceil((rows[0].s - line.dash) / period) * period;
        for (let s = first; s < rows[rows.length - 1].s; s += period) {
          this.markStrip(rows, marks, Math.max(s, rows[0].s), Math.min(s + line.dash, rows[rows.length - 1].s), line.lat, line.w, line.tint);
        }
      } else this.markStrip(rows, marks, rows[0].s, rows[rows.length - 1].s, line.lat, line.w, line.tint);
    }
    // stop lines and zebra crossings at signalised city nodes
    if (!t.highway) {
      for (const end of ['a', 'b']) {
        const nodeId = end === 'a' ? e.a : e.b;
        const node = this.net.nodes[nodeId];
        const inf = this.nodeInfo[nodeId];
        if (inf.kind !== 'patch' || node.entry) continue;
        const trim = end === 'a' ? sA : e.len - sB;
        const dir = end === 'a' ? 1 : -1;
        const base = end === 'a' ? sA : sB;
        const z0 = base + dir * 1.0;
        const z1 = base + dir * 5.0;
        const lo = Math.min(z0, z1);
        const hi = Math.max(z0, z1);
        if (lo < rows[0].s || hi > rows[rows.length - 1].s) continue;
        const half = t.carriageHalf;
        for (let lat = -half + 0.3; lat < half - 0.2; lat += 1.0) this.markStrip(rows, marks, lo, hi, lat + 0.25, 0.5, WHITE);
        if (node.signal) {
          // stop line across incoming lanes (right side for travel toward the node)
          const s = base + dir * 6.2;
          const sideSign = end === 'a' ? -1 : 1;
          if (s > rows[0].s && s < rows[rows.length - 1].s) this.markStrip(rows, marks, s - 0.2, s + 0.2, (sideSign * (half + t.median / 2)) / 2, half - t.median / 2, WHITE);
        }
        void trim;
      }
    }
  }

  markStrip(rows, marks, s0, s1, lat, w, tint) {
    if (s1 - s0 < 0.05) return;
    const pts = [];
    const at = (s) => {
      let k = 0;
      while (k < rows.length - 2 && rows[k + 1].s < s) k++;
      const A = rows[k];
      const B = rows[k + 1];
      const tt = clamp((s - A.s) / (B.s - A.s || 1), 0, 1);
      const rx = A.rx + (B.rx - A.rx) * tt;
      const rz = A.rz + (B.rz - A.rz) * tt;
      return { s, x: A.x + (B.x - A.x) * tt, y: A.y + (B.y - A.y) * tt, z: A.z + (B.z - A.z) * tt, rx, rz };
    };
    pts.push(at(s0));
    for (const r of rows) if (r.s > s0 + 0.05 && r.s < s1 - 0.05) pts.push(r);
    pts.push(at(s1));
    const h0 = lat - w / 2;
    const h1 = lat + w / 2;
    for (let k = 0; k < pts.length - 1; k++) {
      const A = pts[k];
      const B = pts[k + 1];
      const v0 = marks.vertex(A.x + A.rx * h0, A.y + 0.01, A.z + A.rz * h0, 0, 1, 0, 0, A.s, { aLayer: 0, aTint: tint });
      const v1 = marks.vertex(A.x + A.rx * h1, A.y + 0.01, A.z + A.rz * h1, 0, 1, 0, 1, A.s, { aLayer: 0, aTint: tint });
      const v2 = marks.vertex(B.x + B.rx * h1, B.y + 0.01, B.z + B.rz * h1, 0, 1, 0, 1, B.s, { aLayer: 0, aTint: tint });
      const v3 = marks.vertex(B.x + B.rx * h0, B.y + 0.01, B.z + B.rz * h0, 0, 1, 0, 0, B.s, { aLayer: 0, aTint: tint });
      marks.quad(v0, v1, v2, v3);
    }
  }

  patch(node, inf, road) {
    const net = this.net;
    const ends = [];
    for (const { e, d } of inf.dirs) {
      const t = inf.trims.get(e.id) ?? 0;
      const fromA = e.a === node.id;
      const p = net.pointAt(e, fromA ? t : e.len - t);
      // right vector relative to the departure direction
      const rx = -d.z;
      const rz = d.x;
      const half = e.type.pavedHalf;
      const outer = e.type.pavedHalf + e.type.sidewalk;
      const mk = (lat) => ({ x: p.x + rx * lat, z: p.z + rz * lat, y: p.y });
      const plus = (c) => wrapAngle(Math.atan2(c.x - node.x, c.z - node.z) - d.angle) > 0;
      let c1 = mk(half);
      let c2 = mk(-half);
      let o1 = mk(outer);
      let o2 = mk(-outer);
      if (!plus(c1)) {
        [c1, c2] = [c2, c1];
        [o1, o2] = [o2, o1];
      }
      ends.push({ e, d, plus: c1, minus: c2, oplus: o1, ominus: o2, y: p.y, sidewalk: e.type.sidewalk });
    }
    const y = node.y;
    const poly = [];
    const corners = [];
    for (let k = 0; k < ends.length; k++) {
      const A = ends[k];
      const B = ends[(k + 1) % ends.length];
      poly.push(A.minus, A.plus);
      const curve = bezierCorner(A.plus, A.d, B.minus, B.d, node);
      for (const c of curve) poly.push(c);
      if (A.sidewalk > 0 && B.sidewalk > 0 && ends.length > 1) {
        const outerCurve = bezierCorner(A.oplus, A.d, B.ominus, B.d, node);
        corners.push({ inner: [A.plus, ...curve, B.minus], outer: [A.oplus, ...outerCurve, B.ominus] });
      }
    }
    const center = road.vertex(node.x, y, node.z, 0, 1, 0, node.x / 7, node.z / 7, { aLayer: L.ASPHALT, aTint: NEUTRAL });
    const ids = poly.map((p) => road.vertex(p.x, y, p.z, 0, 1, 0, p.x / 7, p.z / 7, { aLayer: L.ASPHALT, aTint: NEUTRAL }));
    for (let k = 0; k < ids.length; k++) {
      const a = ids[k];
      const b = ids[(k + 1) % ids.length];
      const pa = poly[k];
      const pb = poly[(k + 1) % ids.length];
      // keep counter-clockwise winding seen from above
      const cross = (pa.x - node.x) * (pb.z - node.z) - (pa.z - node.z) * (pb.x - node.x);
      if (cross < 0) road.tri(center, a, b);
      else road.tri(center, b, a);
    }
    for (const c of corners) {
      const n = Math.min(c.inner.length, c.outer.length);
      for (let k = 0; k < n - 1; k++) {
        const i0 = c.inner[k];
        const i1 = c.inner[k + 1];
        const o0 = c.outer[k];
        const o1 = c.outer[k + 1];
        const a = road.vertex(i0.x, y + 0.15, i0.z, 0, 1, 0, i0.x / 4, i0.z / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
        const b = road.vertex(o0.x, y + 0.15, o0.z, 0, 1, 0, o0.x / 4, o0.z / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
        const cc = road.vertex(o1.x, y + 0.15, o1.z, 0, 1, 0, o1.x / 4, o1.z / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
        const d = road.vertex(i1.x, y + 0.15, i1.z, 0, 1, 0, i1.x / 4, i1.z / 4, { aLayer: L.PAVING, aTint: NEUTRAL });
        const cross = (o0.x - i0.x) * (i1.z - i0.z) - (o0.z - i0.z) * (i1.x - i0.x);
        if (cross < 0) road.quad(a, b, cc, d);
        else road.quad(a, d, cc, b);
        // curb face
        const nx = -(o0.x - i0.x);
        const nz = -(o0.z - i0.z);
        const l = Math.hypot(nx, nz) || 1;
        const f0 = road.vertex(i0.x, y, i0.z, nx / l, 0, nz / l, k, 0, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
        const f1 = road.vertex(i1.x, y, i1.z, nx / l, 0, nz / l, k + 1, 0, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
        const f2 = road.vertex(i1.x, y + 0.15, i1.z, nx / l, 0, nz / l, k + 1, 0.08, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
        const f3 = road.vertex(i0.x, y + 0.15, i0.z, nx / l, 0, nz / l, k, 0.08, { aLayer: L.CONCRETE, aTint: [0.85, 0.85, 0.85] });
        if (cross < 0) road.quad(f0, f3, f2, f1);
        else road.quad(f0, f1, f2, f3);
      }
    }
  }
}

function bezierCorner(a, da, b, db, node) {
  // curb lines run back toward the node along -da and -db
  const den = da.x * db.z - da.z * db.x;
  let cx;
  let cz;
  if (Math.abs(den) > 0.08) {
    const t = ((b.x - a.x) * db.z - (b.z - a.z) * db.x) / den;
    cx = a.x + da.x * t;
    cz = a.z + da.z * t;
    if (Math.hypot(cx - node.x, cz - node.z) > 45) {
      cx = (a.x + b.x) / 2 * 0.7 + node.x * 0.3;
      cz = (a.z + b.z) / 2 * 0.7 + node.z * 0.3;
    }
  } else {
    cx = (a.x + b.x) / 2 * 0.7 + node.x * 0.3;
    cz = (a.z + b.z) / 2 * 0.7 + node.z * 0.3;
  }
  const out = [];
  const N = 6;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, z: u * u * a.z + 2 * u * t * cz + t * t * b.z });
  }
  return out;
}
