import { World } from '../game/src/world/world.js';
import { TruckPhysics } from '../game/src/vehicle/physics.js';
import { SpatialHash } from '../game/src/core/util.js';

const world = new World();
const colliders = new SpatialHash(32);
const hw = world.highways.find((h) => h.A.id === 'moscow' && h.B.id === 'vladimir').edge;
const p0 = world.net.pointAt(hw, 600, 5.5);
const truck = new TruckPhysics(world);
truck.env = { grip: 1 };
truck.place(p0.x, p0.z, p0.heading);
truck.trailer = { type: 'curtain', mass: 6800, length: 13.6, axle: 8.6 };
truck.cargoMass = 18000;
const dt = 1 / 60;
const log = [];
let t = 0;
function run(seconds, input, every = 2) {
  const end = t + seconds;
  while (t < end - 1e-9) {
    truck.step(dt, input, colliders);
    t += dt;
    if (Math.abs((t % every) - 0) < dt / 2 || Math.abs((t % every) - every) < dt / 2) log.push(`${t.toFixed(1)}s v=${(truck.v * 3.6).toFixed(1)}km/h gear=${truck.gear} rpm=${Math.round(truck.rpm)} pitch=${(truck.pitch * 100).toFixed(1)}% fuel=${truck.fuel.toFixed(1)} surf=${truck.groundSurface}`);
  }
}
run(40, { throttle: 1, brake: 0, steer: 0 }, 4);
const vmax = truck.v * 3.6;
let dist0 = truck.odometer;
run(15, { throttle: 0, brake: 1, steer: 0 }, 3);
const brakeDist = truck.odometer - dist0;
console.log(log.join('\n'));
console.log('speed after 40s', vmax.toFixed(1), 'km/h; braking distance', brakeDist.toFixed(1), 'm; stopped v=', truck.v.toFixed(2));
// reverse: hold brake at standstill
log.length = 0;
run(1, { throttle: 0, brake: 1, steer: 0 }, 1);
run(6, { throttle: 0, brake: 1, steer: 0 }, 2);
console.log(log.join('\n'));
console.log('reverse gear', truck.gear, 'direction', truck.direction, 'v', (truck.v * 3.6).toFixed(1));
// steering test: forward and turn
run(2, { throttle: 0, brake: 0, steer: 0 });
run(1, { throttle: 1, brake: 0, steer: 0 });
const yaw0 = truck.yaw;
run(8, { throttle: 0.6, brake: 0, steer: 1 }, 2);
console.log('turn: yaw change', ((truck.yaw - yaw0) * 180 / Math.PI).toFixed(1), 'deg; trailer fold', (((truck.trailerYaw - truck.yaw) * 180) / Math.PI).toFixed(1), 'deg');
