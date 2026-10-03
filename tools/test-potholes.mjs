// Drives a tractor along a country road and counts pothole hits, jolts and wear.
import { World } from '../game/src/world/world.js';
import { TruckPhysics } from '../game/src/vehicle/physics.js';
import { SpatialHash, angleDiff, clamp } from '../game/src/core/util.js';

const world = new World();
const colliders = new SpatialHash(32);
const e = world.localRoads.find((q) => q.len > 900);
const lane = e.type.carriageHalf - e.type.laneWidth / 2;
const result = {};
for (const kmh of [25, 55]) {
  const p0 = world.net.pointAt(e, 40, lane);
  const truck = new TruckPhysics(world);
  truck.env = { grip: 1 };
  truck.place(p0.x, p0.z, p0.heading);
  const dt = 1 / 60;
  let hits = 0;
  let maxBounce = 0;
  for (let t = 0; t < 60; t += dt) {
    const q = world.net.nearest(truck.x, truck.z, 30, (x) => x === e);
    if (!q || q.s > e.len - 60) break;
    const aim = world.net.pointAt(e, Math.min(e.len, q.s + 14), lane);
    const diff = angleDiff(Math.atan2(aim.x - truck.x, aim.z - truck.z), truck.yaw);
    const v = truck.v * 3.6;
    truck.step(dt, { throttle: v < kmh ? 0.7 : 0, brake: v > kmh + 4 ? 0.3 : 0, steer: clamp(-diff * 2.2, -1, 1) }, colliders);
    if (truck.pothole > 0) {
      hits++;
      truck.pothole = 0;
    }
    maxBounce = Math.max(maxBounce, Math.abs(truck.bounce), Math.abs(truck.bumpRoll));
  }
  result[kmh + 'kmh'] = { hits, damagePct: +(truck.damage * 100).toFixed(2), maxBounce: +maxBounce.toFixed(3) };
}
console.log(JSON.stringify({ road: e.id, len: Math.round(e.len), holes: world.wearOf(e).filter((w) => w.kind === 'hole').length, ...result }));
