import { clamp } from '../core/util.js';

// Cross sections. Lateral distances from the centre line in metres.
export const ROAD_TYPES = {
  M: { id: 'M', lanes: 2, laneWidth: 3.75, median: 1.5, shoulder: 2.5, sidewalk: 0, verge: 3.5, speed: 90, highway: true },
  R: { id: 'R', lanes: 1, laneWidth: 3.6, median: 0, shoulder: 2.0, sidewalk: 0, verge: 3.0, speed: 80, highway: true },
  A: { id: 'A', lanes: 2, laneWidth: 3.4, median: 0.6, shoulder: 0.35, sidewalk: 4.5, verge: 0, speed: 60, highway: false },
  S: { id: 'S', lanes: 1, laneWidth: 3.5, median: 0, shoulder: 0.9, sidewalk: 3.2, verge: 0, speed: 60, highway: false },
  Y: { id: 'Y', lanes: 1, laneWidth: 4.0, median: 0, shoulder: 0.5, sidewalk: 0, verge: 0, speed: 20, highway: false },
};
for (const t of Object.values(ROAD_TYPES)) {
  t.carriageHalf = t.median / 2 + t.lanes * t.laneWidth;
  t.pavedHalf = t.carriageHalf + t.shoulder;
  t.outerHalf = t.pavedHalf + Math.max(t.sidewalk, t.verge);
}

const SEG_CELL = 48;
const SEG_MUL = 8192;
const cellKey = (cx, cz) => cx * 100003 + cz;

export class RoadNetwork {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.cells = new Map();
    this.segEdge = new Int32Array(0);
    this.segI = new Int32Array(0);
    this.stamps = new Uint32Array(0);
    this.stamp = 0;
  }

  addNode(x, z, props = {}) {
    const node = { id: this.nodes.length, x, z, y: 0, edges: [], ...props };
    this.nodes.push(node);
    return node;
  }

  addEdge(a, b, pts, typeId, props = {}) {
    const n = pts.length;
    const xs = new Float64Array(n);
    const zs = new Float64Array(n);
    const ss = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i].x;
      zs[i] = pts[i].z;
      if (i) ss[i] = ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    }
    const edge = {
      id: this.edges.length,
      a: a.id,
      b: b.id,
      type: ROAD_TYPES[typeId],
      xs,
      zs,
      ys: new Float64Array(n),
      ss,
      len: ss[n - 1],
      bridge: new Uint8Array(n),
      bridges: [],
      alive: true,
      ...props,
    };
    this.edges.push(edge);
    a.edges.push(edge.id);
    b.edges.push(edge.id);
    return edge;
  }

  removeEdge(edge) {
    edge.alive = false;
    for (const id of [edge.a, edge.b]) {
      const node = this.nodes[id];
      node.edges = node.edges.filter((e) => e !== edge.id);
    }
  }

  // Dense segment index on a uniform grid. Queries dedupe with a stamp array instead of allocating sets.
  index() {
    const segEdge = [];
    const segI = [];
    const cells = new Map();
    const C = SEG_CELL;
    for (const e of this.edges) {
      if (!e.alive) continue;
      const pad = e.type.outerHalf + 2;
      for (let i = 0; i < e.xs.length - 1; i++) {
        const ax = e.xs[i];
        const az = e.zs[i];
        const bx = e.xs[i + 1];
        const bz = e.zs[i + 1];
        const id = segEdge.length;
        segEdge.push(e.id);
        segI.push(i);
        const x0 = Math.floor((Math.min(ax, bx) - pad) / C);
        const x1 = Math.floor((Math.max(ax, bx) + pad) / C);
        const z0 = Math.floor((Math.min(az, bz) - pad) / C);
        const z1 = Math.floor((Math.max(az, bz) + pad) / C);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const k = cellKey(cx, cz);
            let list = cells.get(k);
            if (!list) cells.set(k, (list = []));
            list.push(id);
          }
        }
      }
    }
    this.segEdge = Int32Array.from(segEdge);
    this.segI = Int32Array.from(segI);
    this.cells = cells;
    this.stamps = new Uint32Array(segEdge.length);
    this.stamp = 0;
    // compatibility for callers that walk the grid by edge id * 8192 + segment
    this.hash = { query: (minX, minZ, maxX, maxZ) => this.keysIn(minX, minZ, maxX, maxZ) };
  }

  keysIn(minX, minZ, maxX, maxZ) {
    const out = [];
    const stamp = this.nextStamp();
    this.eachCell(minX, minZ, maxX, maxZ, (id) => {
      if (this.stamps[id] === stamp) return;
      this.stamps[id] = stamp;
      out.push(this.segEdge[id] * SEG_MUL + this.segI[id]);
    });
    return out;
  }

  nextStamp() {
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
    return this.stamp;
  }

  eachCell(minX, minZ, maxX, maxZ, fn) {
    const C = SEG_CELL;
    const x0 = Math.floor(minX / C);
    const x1 = Math.floor(maxX / C);
    const z0 = Math.floor(minZ / C);
    const z1 = Math.floor(maxZ / C);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(cellKey(cx, cz));
        if (list) for (let k = 0; k < list.length; k++) fn(list[k]);
      }
    }
  }

  // Calls fn(edge, i, t, d, lateral, s, y, bridge, hx, hz) for every segment whose cross-section
  // (plus extra metres) covers (x, z). No allocations: the hot path of terrain and physics.
  scan(x, z, extra, fn) {
    const C = SEG_CELL;
    const stamp = this.nextStamp();
    const stamps = this.stamps;
    const x0 = Math.floor((x - extra) / C);
    const x1 = Math.floor((x + extra) / C);
    const z0 = Math.floor((z - extra) / C);
    const z1 = Math.floor((z + extra) / C);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const id = list[k];
          if (stamps[id] === stamp) continue;
          stamps[id] = stamp;
          const e = this.edges[this.segEdge[id]];
          const i = this.segI[id];
          const ax = e.xs[i];
          const az = e.zs[i];
          const dx = e.xs[i + 1] - ax;
          const dz = e.zs[i + 1] - az;
          const len2 = dx * dx + dz * dz;
          let t = len2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t;
          const qz = az + dz * t;
          const d = Math.hypot(x - qx, z - qz);
          if (d > e.type.outerHalf + extra) continue;
          const l = Math.sqrt(len2) || 1;
          const lateral = ((x - qx) * -dz + (z - qz) * dx) / l;
          const y = e.ys[i] + (e.ys[i + 1] - e.ys[i]) * t;
          fn(e, i, t, d, lateral, e.ss[i] + (e.ss[i + 1] - e.ss[i]) * t, y, e.bridge[i] && e.bridge[i + 1], dx / l, dz / l);
        }
      }
    }
  }

  // All road segments whose outer cross-section covers (x, z) within extra metres.
  query(x, z, extra = 0) {
    const out = [];
    this.scan(x, z, extra, (edge, i, t, d, lateral, s, y, bridge, hx, hz) => out.push({ edge, i, t, d, lateral, s, y, bridge, hx, hz }));
    return out;
  }

  // True when any road (optionally other than `except`) covers (x, z) within extra metres.
  any(x, z, extra = 0, except = null) {
    let hit = false;
    this.scan(x, z, extra, (edge) => {
      if (edge !== except) hit = true;
    });
    return hit;
  }

  nearest(x, z, maxDist = 400, filter = null) {
    for (let r = 24; r <= maxDist * 2; r *= 2) {
      const list = this.query(x, z, Math.min(r, maxDist));
      let best = null;
      for (const q of list) {
        if (filter && !filter(q.edge)) continue;
        if (!best || q.d < best.d) best = q;
      }
      if (best) return best;
      if (r >= maxDist) break;
    }
    return null;
  }

  pointAt(edge, s, lateral = 0) {
    s = clamp(s, 0, edge.len);
    const ss = edge.ss;
    let lo = 0;
    let hi = ss.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ss[mid] > s) hi = mid - 1;
      else lo = mid;
    }
    const i = lo;
    const seg = ss[i + 1] - ss[i] || 1;
    const t = clamp((s - ss[i]) / seg, 0, 1);
    const dx = edge.xs[i + 1] - edge.xs[i];
    const dz = edge.zs[i + 1] - edge.zs[i];
    const l = Math.hypot(dx, dz) || 1;
    const fx = dx / l;
    const fz = dz / l;
    // right-hand vector (-fz, fx)
    return {
      x: edge.xs[i] + dx * t + -fz * lateral,
      z: edge.zs[i] + dz * t + fx * lateral,
      y: edge.ys[i] + (edge.ys[i + 1] - edge.ys[i]) * t,
      heading: Math.atan2(fx, fz),
      fx,
      fz,
      i,
      t,
    };
  }

  other(edge, nodeId) {
    return edge.a === nodeId ? edge.b : edge.a;
  }

  // Unit direction leaving the node along the edge.
  departure(edge, nodeId, back = 10) {
    const fromA = edge.a === nodeId;
    const s = fromA ? Math.min(back, edge.len) : Math.max(0, edge.len - back);
    const p0 = this.pointAt(edge, fromA ? 0 : edge.len);
    const p1 = this.pointAt(edge, s);
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l, angle: Math.atan2(dx / l, dz / l) };
  }
}
