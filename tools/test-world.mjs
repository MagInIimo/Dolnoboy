import { World } from '../game/src/world/world.js';
import { SCALE, WATER_LEVEL } from '../game/src/core/geo.js';

const t0 = performance.now();
const world = new World();
const t1 = performance.now();
const net = world.net;
const alive = net.edges.filter((e) => e.alive);
const hw = alive.filter((e) => e.city < 0);
const cityEdges = alive.filter((e) => e.city >= 0);
const sum = (list) => list.reduce((a, e) => a + e.len, 0);
console.log('build ms', Math.round(t1 - t0));
console.log('cities', world.cities.length, 'highways', hw.length, 'city edges', cityEdges.length, 'nodes', net.nodes.length);
console.log('highway km (game)', (sum(hw) / 1000).toFixed(1), 'real km', ((sum(hw) * SCALE) / 1000).toFixed(0));
console.log('city street km (game)', (sum(cityEdges) / 1000).toFixed(1));
console.log('lots', world.lots.length, 'villages', world.villages.length, 'cameras', world.cameras.length, 'signs', world.signs.length, 'overpasses', world.overpasses);
console.log('bridges', alive.reduce((a, e) => a + e.bridges.filter((b) => b.kind === 'river').length, 0));
console.log('issues', world.issues);

// connectivity of the whole network
const seen = new Set([0]);
const stack = [0];
while (stack.length) {
  const id = stack.pop();
  for (const eid of net.nodes[id].edges) {
    const e = net.edges[eid];
    if (!e.alive) continue;
    const o = net.other(e, id);
    if (!seen.has(o)) {
      seen.add(o);
      stack.push(o);
    }
  }
}
const disconnected = world.cities.filter((c) => !c.plan.entryNodes.every((en) => seen.has(en.node.id)));
console.log('cities with unreachable entries', disconnected.map((c) => c.id));

// grades and curvature on highways
let worstGrade = 0;
let worstRadius = Infinity;
let worstWhere = '';
const gradeIssues = [];
const radiusIssues = [];
for (const e of alive) {
  for (let i = 0; i < e.xs.length - 1; i++) {
    const g = Math.abs(e.ys[i + 1] - e.ys[i]) / (e.ss[i + 1] - e.ss[i]);
    if (g > 0.08) gradeIssues.push({ g: +g.toFixed(3), where: e.city >= 0 ? world.cities[e.city].id + ':' + e.role : world.highways[e.highway].A.id + '-' + world.highways[e.highway].B.id, s: Math.round(e.ss[i]), len: Math.round(e.len), y: +e.ys[i].toFixed(1), y2: +e.ys[i + 1].toFixed(1) });
  }
}
gradeIssues.sort((a, b) => b.g - a.g);
console.log('grade > 8%', gradeIssues.length, JSON.stringify(gradeIssues.slice(0, 8)));
for (const e of hw) {
  for (let i = 1; i < e.xs.length - 1; i++) {
    const g = Math.abs(e.ys[i + 1] - e.ys[i]) / (e.ss[i + 1] - e.ss[i]);
    if (g > worstGrade) worstGrade = g;
    const ax = e.xs[i] - e.xs[i - 1], az = e.zs[i] - e.zs[i - 1];
    const bx = e.xs[i + 1] - e.xs[i], bz = e.zs[i + 1] - e.zs[i];
    const ang = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
    const r = (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2 / Math.max(1e-6, ang);
    if (r < 120) radiusIssues.push({ r: Math.round(r), where: world.highways[e.highway].A.id + '-' + world.highways[e.highway].B.id, s: Math.round(e.ss[i]), len: Math.round(e.len) });
    if (r < worstRadius) {
      worstRadius = r;
      worstWhere = world.highways[e.highway].A.id + '-' + world.highways[e.highway].B.id + ' s=' + Math.round(e.ss[i]);
    }
  }
}
const grouped = new Map();
for (const r of radiusIssues) if (!grouped.has(r.where + Math.round(r.s / 200)) ) grouped.set(r.where + Math.round(r.s / 200), r);
console.log('radius < 120 m spots', grouped.size, JSON.stringify([...grouped.values()].sort((a, b) => a.r - b.r).slice(0, 14)));
console.log('worst grade', worstGrade.toFixed(3), 'min radius', worstRadius.toFixed(0), worstWhere);

// sample terrain timing
const t2 = performance.now();
let n = 0, acc = 0;
const c = world.cities[0];
for (let x = -2000; x < 2000; x += 8) for (let z = -2000; z < 2000; z += 64) { acc += world.terrainHeight(c.x + x, c.z + z); n++; }
const t3 = performance.now();
console.log('terrainHeight µs', (((t3 - t2) * 1000) / n).toFixed(2), 'samples', n);

// roads over water without bridge, highways near sea
let wetRoad = 0;
for (const e of alive) for (let i = 0; i < e.xs.length; i += 3) if (!e.bridge[i] && world.baseHeight(e.xs[i], e.zs[i], 0) < WATER_LEVEL) wetRoad++;
console.log('road samples in water without bridge', wetRoad);
for (const city of world.cities) {
  const lotsInWater = city.lots.filter((l) => world.baseHeight(l.x, l.z) < WATER_LEVEL + 0.5).length;
  const kinds = city.lots.map((l) => l.kind === 'company' ? l.company : l.kind);
  if (lotsInWater || !kinds.includes('fuel') || !kinds.includes('service') || city.lots.filter((l) => l.kind === 'company').length < 3) console.log('lot problem', city.id, 'water', lotsInWater, kinds.join(','));
}
