// Routes to rural yards at the ends of country roads and back onto the highways.
import { World } from '../game/src/world/world.js';
import { findRoute, snap } from '../game/src/game/route.js';

const world = new World();
const rural = world.lots.filter((l) => l.rural);
let ok = 0;
let bad = [];
const t0 = performance.now();
for (const lot of rural) {
  const city = world.cities[lot.city];
  const depot = city.lots.find((l) => !l.rural) ?? city;
  const cx = depot.frontX ?? depot.x;
  const cz = depot.frontZ ?? depot.z;
  const from = snap(world, cx, cz);
  const goal = snap(world, lot.frontX, lot.frontZ, null, 400);
  goal.x = lot.frontX;
  goal.z = lot.frontZ;
  const r = findRoute(world, from, goal);
  const back = findRoute(world, snap(world, lot.frontX, lot.frontZ, 0), snap(world, cx, cz));
  if (r && back && r.length < 40000) {
    ok++;
    const viaLocal = r.legs.some((l) => l.edge.local);
    const turnAt = r.turns.some((t) => t.node?.attach);
    if (!viaLocal || !turnAt) bad.push({ lot: lot.id, viaLocal, turnAt });
  } else bad.push({ lot: lot.id, r: !!r, back: !!back, len: r?.length });
}
console.log(JSON.stringify({ rural: rural.length, tested: rural.length, ok, bad: bad.slice(0, 5), ms: Math.round(performance.now() - t0) }));
