import { SpatialHash, clamp, segmentDistance } from '../core/util.js';

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

export class RoadNetwork {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.hash = new SpatialHash(SEG_CELL);
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

  index() {
    this.hash = new SpatialHash(SEG_CELL);
    for (const e of this.edges) {
      if (!e.alive) continue;
      const pad = e.type.outerHalf + 2;
      for (let i = 0; i < e.xs.length - 1; i++) {
        const ax = e.xs[i];
        const az = e.zs[i];
        const bx = e.xs[i + 1];
        const bz = e.zs[i + 1];
        this.hash.insertBox(e.id * SEG_MUL + i, Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad);
      }
    }
  }

  // All road segments whose outer cross-section covers (x, z) within extra metres.
  query(x, z, extra = 0) {
    const ids = this.hash.query(x - extra, z - extra, x + extra, z + extra);
    const out = [];
    const seen = new Set();
    for (const key of ids) {
      if (seen.has(key)) continue;
      seen.add(key);
      const e = this.edges[Math.floor(key / SEG_MUL)];
      const i = key % SEG_MUL;
      const r = segmentDistance(x, z, e.xs[i], e.zs[i], e.xs[i + 1], e.zs[i + 1]);
      if (r.d > e.type.outerHalf + extra) continue;
      const dx = e.xs[i + 1] - e.xs[i];
      const dz = e.zs[i + 1] - e.zs[i];
      const l = Math.hypot(dx, dz) || 1;
      const lateral = ((x - r.x) * -dz + (z - r.z) * dx) / l;
      const y = e.ys[i] + (e.ys[i + 1] - e.ys[i]) * r.t;
      out.push({ edge: e, i, t: r.t, d: r.d, lateral, s: e.ss[i] + (e.ss[i + 1] - e.ss[i]) * r.t, y, bridge: e.bridge[i] && e.bridge[i + 1], hx: dx / l, hz: dz / l });
    }
    return out;
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
