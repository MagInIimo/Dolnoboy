// Accident scene on a highway: traffic must pass it without contacts or permanent queues.
import * as THREE from 'three';
import { World } from '../game/src/world/world.js';
import { Traffic } from '../game/src/traffic/traffic.js';
import { TruckPhysics } from '../game/src/vehicle/physics.js';

const [a, b] = (process.argv[2] ?? 'moscow-vladimir').split('-');
const world = new World();
const e = world.highways.find((h) => h.A.id === a && h.B.id === b).edge;
const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
const traffic = new Traffic(engine, world, { shadows: 1024, trees: 1 });
const player = new TruckPhysics(world);
player.env = { grip: 1 };
const lane = e.type.carriageHalf - e.type.laneWidth * 0.5;
let s = 900;
const at = (s) => world.net.pointAt(e, s, lane);
let p = at(s);
player.place(p.x, p.z, p.heading);
const dt = 1 / 60;
traffic.sceneDistance = 1e9;
let scene = null;
let contacts = 0;
let passed = new Set();
let maxQueueWait = 0;
for (let step = 0; step < 60 * 140; step++) {
  // the player cruises at 60 km/h for 30 s, then parks on the verge to watch
  if (step < 60 * 30) {
    s += (60 / 3.6) * dt;
    p = at(s);
    player.x = p.x;
    player.z = p.z;
    player.yaw = p.heading;
    player.v = 60 / 3.6;
  } else if (step === 60 * 30) {
    p = world.net.pointAt(e, s, e.type.outerHalf + 25);
    player.place(p.x, p.z, p.heading);
  }
  engine.camera.position.set(player.x, 10, player.z);
  traffic.step(dt, player);
  scene = scene ?? traffic.scenes[0];
  if (scene && step % 30 === 0) {
    for (const c of traffic.cars) {
      if (c.scene) continue;
      for (const w of scene.cars) {
        if (Math.hypot(c.x - w.x, c.z - w.z) < (c.spec.len + w.spec.len) / 2 - 0.5 && Math.hypot(c.x - w.x, c.z - w.z) < 2.2) contacts++;
      }
      const d = (c.s - scene.s) * scene.dir;
      if (c.mode === 'edge' && c.edge === scene.edge && c.dir === scene.dir && d > 10) passed.add(c.id);
      if (c.edge === scene.edge && c.dir === scene.dir && d < 0 && d > -150) { if (process.env.DIAG && Math.floor(c.wait / 10) > Math.floor(maxQueueWait / 10)) console.log(JSON.stringify({ id: c.id, kind: c.kind, lane: c.lane, lat: +c.lat.toFixed(2), latT: c.latTarget, d: +d.toFixed(1), why: c.why, wait: +c.wait.toFixed(1), toEnd: +((traffic.endS(c) - c.s) * c.dir).toFixed(0) })); maxQueueWait = Math.max(maxQueueWait, c.wait); }
    }
  }
}
console.log(JSON.stringify({ road: a + '-' + b, lanes: e.type.lanes, scene: !!scene, sceneCars: scene?.cars.length, events: traffic.takeEvents().map((x) => x.type ?? x), passedScene: passed.size, contacts, maxQueueWait: +maxQueueWait.toFixed(1) }));
if (process.env.DIAG && scene) for (const c of traffic.cars) { const d = c.edge === scene.edge ? (c.s - scene.s) * scene.dir : NaN; if (Math.hypot(c.x - scene.x, c.z - scene.z) < 120) console.log('near', JSON.stringify({ id: c.id, kind: c.kind, mode: c.mode, scene: !!c.scene, lane: c.lane, lat: +c.lat.toFixed(2), latT: +c.latTarget.toFixed(2), d: +d.toFixed(1), v: +c.v.toFixed(1), why: c.why, wait: +c.wait.toFixed(1), merge: c.mergeRequest })); }
