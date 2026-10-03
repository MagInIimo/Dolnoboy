// Headless traffic simulation: overlaps between cars, flow, red-light compliance.
import * as THREE from 'three';
import { World } from '../game/src/world/world.js';
import { Traffic } from '../game/src/traffic/traffic.js';
import { TruckPhysics } from '../game/src/vehicle/physics.js';
import { signalPhase } from '../game/src/world/signals.js';

const world = new World();
const cityId = process.argv[2] ?? 'moscow';
const seconds = Number(process.argv[3] ?? 300);
const hwMode = cityId.startsWith('hw:');
const city = world.cities.find((c) => c.id === (hwMode ? cityId.slice(3).split('-')[0] : cityId));
const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
const traffic = new Traffic(engine, world, { shadows: 1024, trees: 1 });
if (process.env.DIAG) traffic.stats.log = [];
const player = new TruckPhysics(world);
player.env = { grip: 1 };
const node = city.plan.nodes.find((n) => n.signal) ?? city.plan.nodes[0];
// park the player's truck in a depot yard so it does not block a road
const yard = city.lots.find((l) => l.kind === 'company') ?? city.lots[0];
if (hwMode) {
  const [a, b] = cityId.slice(3).split('-');
  const e = world.highways.find((h) => h.A.id === a && h.B.id === b).edge;
  const p = world.net.pointAt(e, e.len * 0.4, e.type.outerHalf + 30);
  player.place(p.x, p.z, p.heading);
} else player.place(yard.x, yard.z, yard.heading);
engine.camera.position.set(player.x, 20, player.z);
const dt = 1 / 60;
let overlaps = 0;
let worst = 0;
let redRuns = 0;
let moved = 0;
let samples = 0;
let maxCars = 0;
const lastPos = new Map();
const obb = (a, b) => {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  let min = Infinity;
  for (const ang of axes) {
    const ax = Math.sin(ang), az = Math.cos(ang);
    const proj = (r) => Math.abs(Math.sin(r.yaw) * ax + Math.cos(r.yaw) * az) * (r.spec.len / 2) + Math.abs(-Math.cos(r.yaw) * ax + Math.sin(r.yaw) * az) * (r.spec.wid / 2);
    const o = proj(a) + proj(b) - Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
    if (o <= 0) return 0;
    min = Math.min(min, o);
  }
  return min;
};
for (let step = 0; step < seconds * 60; step++) {
  player.step(dt, { throttle: 0, brake: 0, steer: 0 }, world.colliders);
  traffic.step(dt, player);
  if (step % 30 === 0) {
    const cars = traffic.cars;
    maxCars = Math.max(maxCars, cars.length);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        if (Math.abs(a.x - b.x) > 20 || Math.abs(a.z - b.z) > 20 || Math.abs(a.y - b.y) > 3) continue;
        const o = obb(a, b);
        if (o > 0.15) {
          overlaps++;
          worst = Math.max(worst, o);
          if (process.env.DIAG && overlaps < 40) console.log(JSON.stringify({ o: +o.toFixed(2), a: [a.id, a.mode, a.kind, a.edge.id, a.dir, a.lane, +a.s.toFixed(1), +a.lat.toFixed(2), a.reserved, a.wait.toFixed(0)], b: [b.id, b.mode, b.kind, b.edge.id, b.dir, b.lane, +b.s.toFixed(1), +b.lat.toFixed(2), b.reserved, b.wait.toFixed(0)], sameNode: a.next?.node === b.next?.node }));
        }
      }
      const c = cars[i];
      const prev = lastPos.get(c.id);
      if (prev) { samples++; if (Math.hypot(c.x - prev.x, c.z - prev.z) > 0.5) moved++; }
      lastPos.set(c.id, { x: c.x, z: c.z });
      // a car that enters a junction on red (turn mode began during red, not yet inside at yellow)
      if (c.mode === 'turn' && c.turn.d < c.v * 0.5 + 0.1 && c.v > 3) {
        const prevEdge = c._lastEdge;
        if (prevEdge && c.next.node.signal && signalPhase(c.next.node, prevEdge.id, world.signalTime - 3.5) === 'red' && signalPhase(c.next.node, prevEdge.id, world.signalTime) === 'red') redRuns++;
      }
      if (c.mode === 'edge') c._lastEdge = c.edge;
    }
  }
}
const stuckCars = traffic.cars.filter((c) => c.wait > 30);
const stuck = stuckCars.length;
if (process.env.DIAG) for (const c of stuckCars) console.log('stuck', JSON.stringify({ id: c.id, mode: c.mode, kind: c.kind, edge: c.edge.id, type: c.edge.type.id, dir: c.dir, s: +c.s.toFixed(1), len: +c.edge.len.toFixed(1), endS: +traffic.endS(c).toFixed(1), reserved: c.reserved, node: c.next?.node?.id, signal: !!c.next?.node?.signal, busy: c.plan ? traffic.junctionBusy(c, c.plan) : null, inJ: [...(traffic.inJunction.get(c.next?.node?.id) ?? [])].map((o) => [o.id, o.mode, +o.v.toFixed(1), o.wait | 0]), turnD: c.turn ? +c.turn.d.toFixed(1) + '/' + c.turn.len.toFixed(1) : null }));
if (process.env.DIAG && stuckCars.length) {
  const c = stuckCars.reduce((a, b) => (Math.abs(traffic.endS(a) - a.s) < Math.abs(traffic.endS(b) - b.s) ? a : b));
  const n = c.next.node;
  const phases = [];
  for (let t = 0; t < 34; t += 2) phases.push(signalPhase(n, c.edge.id, world.signalTime + t)[0]);
  { const o = traffic.cars.find((q) => q.id === 35); console.log('pair', JSON.stringify([c.id, c.edge.id, c.dir, c.lane, +c.s.toFixed(1), +c.lat.toFixed(2), +c.yaw.toFixed(2), +c.x.toFixed(1), +c.z.toFixed(1)]), JSON.stringify(o && [o.id, o.mode, o.edge.id, o.dir, o.lane, +o.s.toFixed(1), +o.lat.toFixed(2), +o.yaw.toFixed(2), +o.x.toFixed(1), +o.z.toFixed(1), o.kind])); }
  console.log('front', c.id, c.why, 'chain', (() => { const out = []; let k = c; for (let i = 0; i < 8 && k; i++) { out.push(k.id + ':' + k.why + ':' + k.mode + ':' + k.v.toFixed(1)); const m = /(\d+)/.exec(k.why); k = m ? traffic.cars.find((o) => o.id === +m[1]) : null; } return out.join(' > '); })(), 'sig', JSON.stringify(n.signal), 'edge', c.edge.id, 'phases', phases.join(''), 'playerGap', player.boxes().map((b) => traffic.gapTo(c, b.x, b.z, b.h, b.d, b.w, player.y).toFixed(1)), 'next', c.next.edge.id, c.next.dir, 'exitClear', traffic.exitClear(c, c.plan ?? traffic.planTurn(c)));
}
if (process.env.DIAG) for (const l of traffic.stats.log ?? []) console.log('red', JSON.stringify(l));
const result = { city: cityId, seconds, maxCars, cars: traffic.cars.length, overlaps, worstOverlap: +worst.toFixed(2), movingShare: +(moved / Math.max(1, samples)).toFixed(2), stuckOver30s: stuck, redRuns: traffic.stats.redRuns };
console.log(JSON.stringify(result));
