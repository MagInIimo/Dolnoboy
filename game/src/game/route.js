import { angleDiff, segmentDistance } from '../core/util.js';

// Binary heap keyed by f.
class Heap {
  constructor() {
    this.a = [];
  }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

const speedOf = (e) => (e.type.highway ? e.type.speed : 45) / 3.6;

// Snap a point (with optional heading) onto the network.
export function snap(world, x, z, heading = null, maxDist = 220) {
  const q = world.net.nearest(x, z, maxDist, (e) => e.alive && e.type.id !== 'Y');
  if (!q) return null;
  let dirBias = 0;
  if (heading !== null) dirBias = Math.cos(angleDiff(heading, Math.atan2(q.hx, q.hz)));
  return { edge: q.edge, s: q.s, x, z, d: q.d, dirBias };
}

// A* from a snapped start to a snapped goal. Returns legs [{edge, s0, s1}] in travel order.
export function findRoute(world, start, goal) {
  const net = world.net;
  if (!start || !goal) return null;
  if (start.edge === goal.edge) {
    const forward = goal.s >= start.s;
    const against = forward ? start.dirBias < -0.3 : start.dirBias > 0.3;
    if (!against || Math.abs(goal.s - start.s) < 40) return finalize(world, [{ edge: start.edge, s0: start.s, s1: goal.s }], start, goal);
  }
  const gx = goal.x;
  const gz = goal.z;
  const h = (n) => Math.hypot(net.nodes[n].x - gx, net.nodes[n].z - gz) / 25;
  const best = new Map();
  const prev = new Map();
  const heap = new Heap();
  const uTurn = 45;
  const relax = (node, cost, info) => {
    if (cost >= (best.get(node) ?? Infinity)) return;
    best.set(node, cost);
    prev.set(node, info);
    heap.push({ node, g: cost, f: cost + h(node) });
  };
  // Ways to leave a point on an edge: its two end nodes and the country roads attached along it.
  const exits = (edge, s, fn) => {
    fn(edge.a, 0);
    fn(edge.b, edge.len);
    for (const at of edge.attachments ?? []) fn(at.node, at.s);
  };
  const se = start.edge;
  exits(se, start.s, (node, s1) => {
    const forward = s1 >= start.s;
    const against = forward ? start.dirBias < -0.3 : start.dirBias > 0.3;
    relax(node, Math.abs(s1 - start.s) / speedOf(se) + (against ? uTurn : 0), { start: true, leg: { edge: se, s0: start.s, s1 } });
  });
  const ge = goal.edge;
  const goalLegs = new Map();
  exits(ge, goal.s, (node, sNode) => goalLegs.set(node, { edge: ge, s0: sNode, s1: goal.s }));
  let found = null;
  let foundCost = Infinity;
  let guard = 0;
  while (heap.size && guard++ < 200000) {
    const cur = heap.pop();
    if (cur.g > (best.get(cur.node) ?? Infinity) + 1e-9) continue;
    if (cur.f >= foundCost) break;
    const gl = goalLegs.get(cur.node);
    if (gl) {
      const total = cur.g + Math.abs(gl.s1 - gl.s0) / speedOf(ge);
      if (total < foundCost) {
        foundCost = total;
        found = cur.node;
      }
    }
    const node = net.nodes[cur.node];
    const wait = node.signal ? 6 : 0;
    for (const eid of node.edges) {
      const e = net.edges[eid];
      if (!e.alive) continue;
      const fromA = e.a === cur.node;
      const s0 = fromA ? 0 : e.len;
      relax(fromA ? e.b : e.a, cur.g + e.len / speedOf(e) + wait, { from: cur.node, leg: { edge: e, s0, s1: fromA ? e.len : 0 } });
      for (const at of e.attachments ?? []) relax(at.node, cur.g + Math.abs(at.s - s0) / speedOf(e) + wait, { from: cur.node, leg: { edge: e, s0, s1: at.s } });
    }
    // a country road's first node joins the highway in both directions
    if (node.attach) {
      const e = net.edges[node.attach.edge];
      const s0 = node.attach.s;
      relax(e.a, cur.g + s0 / speedOf(e) + 4, { from: cur.node, leg: { edge: e, s0, s1: 0 } });
      relax(e.b, cur.g + (e.len - s0) / speedOf(e) + 4, { from: cur.node, leg: { edge: e, s0, s1: e.len } });
      for (const at of e.attachments ?? []) if (at.node !== cur.node) relax(at.node, cur.g + Math.abs(at.s - s0) / speedOf(e) + 4, { from: cur.node, leg: { edge: e, s0, s1: at.s } });
    }
  }
  if (found === null) return null;
  const legs = [];
  let n = found;
  for (let k = 0; k < 100000; k++) {
    const p = prev.get(n);
    legs.push(p.leg);
    if (p.start) break;
    n = p.from;
  }
  legs.reverse();
  legs.push(goalLegs.get(found));
  return finalize(world, legs.filter((l) => Math.abs(l.s1 - l.s0) > 0.01 || l.edge === ge), start, goal);
}

// Builds a polyline, length and maneuvers.
function finalize(world, legs, start, goal) {
  const net = world.net;
  const pts = [];
  let length = 0;
  const turns = [];
  for (let li = 0; li < legs.length; li++) {
    const { edge, s0, s1 } = legs[li];
    const dir = s1 >= s0 ? 1 : -1;
    const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 8));
    for (let k = 0; k <= n; k++) {
      const s = s0 + ((s1 - s0) * k) / n;
      const p = net.pointAt(edge, s, 0);
      if (pts.length) length += Math.hypot(p.x - pts[pts.length - 1].x, p.z - pts[pts.length - 1].z);
      pts.push({ x: p.x, z: p.z, d: length, edge, dir });
    }
    if (li < legs.length - 1) {
      const next = legs[li + 1];
      const ndir = next.s1 >= next.s0 ? 1 : -1;
      const a1 = net.pointAt(edge, s1 - dir * Math.min(6, Math.abs(s1 - s0) / 2), 0);
      const b1 = net.pointAt(next.edge, next.s0 + ndir * Math.min(10, Math.abs(next.s1 - next.s0) / 2), 0);
      const turn = angleDiff(b1.heading + (ndir < 0 ? Math.PI : 0), a1.heading + (dir < 0 ? Math.PI : 0));
      // a junction: a node with three or more roads, or a country road leaving the highway mid-edge
      const midEdge = s1 > 0.5 && s1 < edge.len - 0.5;
      let node;
      let degree;
      if (midEdge) {
        const at = (edge.attachments ?? []).find((q) => Math.abs(q.s - s1) < 1);
        node = at ? net.nodes[at.node] : null;
        degree = 3;
      } else {
        node = net.nodes[dir > 0 ? edge.b : edge.a];
        degree = node.attach ? 3 : node.edges.filter((id) => net.edges[id].alive).length;
      }
      if (degree >= 3 && Math.abs(turn) > 0.42) turns.push({ d: length, kind: turn > 0 ? 'left' : 'right', sharp: Math.abs(turn) > 1.9, node });
      else if (degree >= 3 && Math.abs(turn) <= 0.42) turns.push({ d: length, kind: 'straight', node });
    }
  }
  const end = { x: goal.x, z: goal.z };
  pts.push({ x: end.x, z: end.z, d: length + Math.hypot(end.x - pts[pts.length - 1].x, end.z - pts[pts.length - 1].z) });
  length = pts[pts.length - 1].d;
  return { legs, pts, length, turns, goal: end, startEdge: start.edge };
}

// Tracks progress along a route.
export class Navigator {
  constructor(world) {
    this.world = world;
    this.route = null;
    this.target = null;
    this.index = 0;
    this.offTimer = 0;
    this.remaining = 0;
    this.next = null;
  }

  setTarget(target, x, z, heading) {
    this.target = target;
    this.recalc(x, z, heading);
  }

  clear() {
    this.target = null;
    this.route = null;
  }

  recalc(x, z, heading) {
    if (!this.target) return;
    const start = snap(this.world, x, z, heading);
    const goal = snap(this.world, this.target.x, this.target.z, null, 400);
    if (goal) {
      goal.x = this.target.x;
      goal.z = this.target.z;
    }
    this.route = findRoute(this.world, start, goal);
    this.index = 0;
    this.offTimer = 0;
  }

  update(dt, x, z, heading) {
    const r = this.route;
    if (!r) {
      if (this.target) {
        this.retry = (this.retry ?? 0) - dt;
        if (this.retry <= 0) {
          this.retry = 2;
          this.recalc(x, z, heading);
        }
      }
      return;
    }
    // closest point near the previous index
    const pts = r.pts;
    let bestI = this.index;
    let bestD = Infinity;
    const lo = Math.max(0, this.index - 10);
    const hi = Math.min(pts.length - 2, this.index + 60);
    for (let i = lo; i <= hi; i++) {
      const sd = segmentDistance(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
      if (sd.d < bestD) {
        bestD = sd.d;
        bestI = i;
        this.along = pts[i].d + (pts[i + 1].d - pts[i].d) * sd.t;
      }
    }
    this.index = bestI;
    this.remaining = Math.max(0, r.length - (this.along ?? 0)) + 0;
    this.next = r.turns.find((t) => t.d > (this.along ?? 0) - 5) ?? null;
    this.offRoute = bestD > 30;
    if (this.offRoute) this.offTimer += dt;
    else this.offTimer = 0;
    if (this.offTimer > 2.2) this.recalc(x, z, heading);
  }
}

// Fast city-to-city road distance (metres) using highway edges plus a city crossing allowance.
export function cityDistances(world) {
  const n = world.cities.length;
  const adj = Array.from({ length: n }, () => []);
  for (const hw of world.highways) {
    const w = hw.edge.len + (hw.A.Rout + hw.B.Rout) * 0.8;
    adj[hw.A.index].push([hw.B.index, w]);
    adj[hw.B.index].push([hw.A.index, w]);
  }
  const dist = [];
  for (let s = 0; s < n; s++) {
    const d = new Array(n).fill(Infinity);
    d[s] = 0;
    const done = new Array(n).fill(false);
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || d[i] < d[u])) u = i;
      if (u < 0 || d[u] === Infinity) break;
      done[u] = true;
      for (const [v, w] of adj[u]) if (d[u] + w < d[v]) d[v] = d[u] + w;
    }
    dist.push(d);
  }
  return dist;
}
