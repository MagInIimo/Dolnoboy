import { rng } from '../core/util.js';
import { WATER_LEVEL } from '../core/geo.js';
import { F } from '../render/facades.js';

// Houses with fenced plots on both sides of the highway around a village point.
export function generateVillage(world, v) {
  if (v.buildings) return v;
  const net = world.net;
  const e = net.edges[v.edge];
  const r = rng(v.seed);
  const list = [];
  const trees = [];
  const region = world.nearestCity(v.x, v.z).city.region;
  const south = region === 'south' || region === 'steppe';
  for (const side of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      let s = v.s - v.half + r() * 10;
      while (s < v.s + v.half) {
        const pw = 17 + r() * 8;
        const pd = 26 + r() * 8;
        if (row === 1 && r() < 0.45) {
          s += pw;
          continue;
        }
        const mid = s + pw / 2;
        const p = net.pointAt(e, mid);
        const rx = -p.fz * side;
        const rz = p.fx * side;
        const plotOff = e.type.outerHalf + 5 + pd / 2 + row * (pd + 10);
        const px = p.x + rx * plotOff;
        const pz = p.z + rz * plotOff;
        const heading = Math.atan2(-rx, -rz);
        let ok = world.baseHeight(px, pz) > WATER_LEVEL + 1.2;
        for (const k of [-0.5, 0.5]) {
          for (const m of [-0.5, 0.5]) {
            const cx = px - p.fz * k * pw + rx * m * pd;
            const cz = pz + p.fx * k * pw + rz * m * pd;
            if (net.query(cx, cz, 2).some((q) => q.edge !== e) || world.lotAt(cx, cz, 3)) ok = false;
          }
        }
        if (ok) {
          const type = south ? (r() < 0.75 ? 'cottage' : 'izba') : r() < 0.7 ? 'izba' : 'cottage';
          const w = type === 'izba' ? 6.8 + r() * 1.8 : 8.5 + r() * 2.5;
          const d = type === 'izba' ? 9 + r() * 2.5 : 8.5 + r() * 2.5;
          const front = pd / 2 - 3.5 - d / 2;
          const hx = px - rx * front - p.fz * (r() - 0.5) * (pw - w - 4);
          const hz = pz - rz * front + p.fx * (r() - 0.5) * (pw - w - 4);
          const b = {
            type,
            x: hx,
            z: hz,
            y: world.terrainHeight(hx, hz) - 0.15,
            heading,
            w,
            d,
            floors: type === 'cottage' ? (r() < 0.5 ? 1 : 2) : 1,
            seed: Math.floor(r() * 1e6),
            facade: type === 'izba' ? (r() < 0.75 ? F.logWall : F.siding) : r() < 0.4 ? F.redBrick : r() < 0.5 ? F.siding : F.plasterWhite,
            fence: { x: px, z: pz, w: pw, d: pd, heading, layer: r() < 0.55 ? F.woodFence : F.profFence },
          };
          b.fence.y = world.terrainHeight(px, pz);
          list.push(b);
          // a shed and an orchard behind the house
          const sv = -pd / 2 + 4;
          list.push({ type: 'shed', x: px + rx * -sv - p.fz * (pw / 2 - 4), z: pz + rz * -sv + p.fx * (pw / 2 - 4), y: b.y, heading, w: 4 + r() * 2, d: 3.5, seed: b.seed + 1 });
          for (let t = 0; t < 3; t++) {
            const tv = -pd / 2 + 5 + r() * 8;
            const tu = (r() - 0.5) * (pw - 4);
            trees.push({ x: px - rx * tv - p.fz * tu, z: pz - rz * tv + p.fx * tu, species: r() < 0.6 ? 'apple' : 'birch', scale: 0.7 + r() * 0.4 });
          }
        }
        s += pw + (r() < 0.12 ? 8 + r() * 14 : 0.5);
      }
    }
  }
  // village shop near the centre
  const side = r() < 0.5 ? 1 : -1;
  const p = net.pointAt(e, v.s);
  const rx = -p.fz * side;
  const rz = p.fx * side;
  const off = e.type.outerHalf + 9;
  const sx = p.x + rx * off;
  const sz = p.z + rz * off;
  if (!list.some((b) => Math.hypot(b.x - sx, b.z - sz) < 20)) list.push({ type: 'shop', x: sx, z: sz, y: world.terrainHeight(sx, sz) - 0.1, heading: Math.atan2(-rx, -rz), w: 12, d: 10, seed: v.seed + 7 });
  v.buildings = list;
  v.trees = trees;
  return v;
}
