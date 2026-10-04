import { rng } from '../core/util.js';
import { WATER_LEVEL } from '../core/geo.js';
import { F } from '../render/facades.js';
import { L } from '../render/surfaces.js';

// Houses with fenced plots on both sides of the highway around a village point.
export function generateVillage(world, v) {
  if (v.buildings) return v;
  const net = world.net;
  const e = net.edges[v.edge];
  const r = rng(v.seed);
  const list = [];
  const trees = [];
  const plots = [];
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
          plots.push(plotContents(r, b, px, pz, pw, pd, heading, south, list));
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
  v.plots = plots;
  return v;
}

// Kitchen garden behind the house: beds with rows of plants, a polycarbonate greenhouse, a woodpile,
// a water barrel and, on many plots, a log bath-house. Plot frame: u along the street, v toward it.
function plotContents(r, house, px, pz, pw, pd, heading, south, list) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const W = (u, v) => [px - fz * u + fx * v, pz + fx * u + fz * v];
  const y = house.fence.y + 0.04;
  const out = { b: house, surfaces: [], props: [] };
  const rect = (u0, u1, v0, v1, layer, tint, lift = 0) => out.surfaces.push({ pts: [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)], y: y + lift, layer, tint });
  const box = (u, yy, v, w, h, d, layer, tint) => {
    const [x, z] = W(u, v);
    out.props.push({ t: 'box', x, y: yy, z, w, h, d, heading, layer, tint });
  };
  // beds across the back of the plot, leaving the corner with the shed
  const bedU0 = -pw / 2 + 1.5;
  const bedU1 = pw / 2 - 7;
  const rows = 4 + Math.floor(r() * 4);
  for (let k = 0; k < rows; k++) {
    const v0 = -pd / 2 + 1.5 + k * 1.7;
    if (v0 + 1.1 > -2) break;
    rect(bedU0, bedU1, v0, v0 + 1.1, L.SOIL, [0.85, 0.8, 0.75], 0.01);
    if (r() < 0.75) rect(bedU0 + 0.3, bedU1 - 0.3, v0 + 0.3, v0 + 0.8, L.GRASS, south ? [0.75, 0.85, 0.55] : [0.6, 0.8, 0.5], 0.02);
  }
  // greenhouse: a polycarbonate arch on a timber base
  if (r() < 0.75) {
    const gu = bedU0 + 4;
    const gv = -2.5 - r() * 2;
    const len = 6;
    const R = 1.5;
    const milky = [0.86, 0.9, 0.92];
    box(gu, y + 0.12, gv, len + 0.2, 0.25, 2 * R + 0.2, F.woodFence, [0.8, 0.65, 0.5]);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a0 = (Math.PI * k) / n;
      const a1 = (Math.PI * (k + 1)) / n;
      const [x0, z0] = W(gu, gv + Math.cos(a0) * R);
      const [x1, z1] = W(gu, gv + Math.cos(a1) * R);
      out.props.push({ t: 'slab', p0: [x0, y + 0.25 + Math.sin(a0) * 2.0, z0], p1: [x1, y + 0.25 + Math.sin(a1) * 2.0, z1], width: len, thick: 0.03, layer: F.plasterWhite, tint: milky });
    }
    for (const e of [-1, 1]) box(gu + e * (len / 2), y + 1.1, gv, 0.04, 1.9, 2 * R * 0.85, F.plasterWhite, milky);
  }
  // woodpile under a strip of roofing and a blue water barrel
  const wu = pw / 2 - 2;
  const wv = -2.5;
  box(wu, y + 0.6, wv, 0.9, 1.2, 3.2, F.woodFence, [0.82, 0.6, 0.38]);
  box(wu, y + 1.3, wv, 1.1, 0.06, 3.4, F.roofSlate, [0.8, 0.8, 0.8]);
  const [bx, bz] = W(wu - 1.6, -pd / 2 + 2.2);
  out.props.push({ t: 'cyl', x: bx, y, z: bz, r0: 0.35, r1: 0.35, h: 0.9, n: 10, layer: F.metalShed, tint: [0.35, 0.5, 0.85] });
  // log bath-house in the corner opposite the shed
  if (house.type === 'izba' && r() < 0.6) {
    const [x, z] = W(-pw / 2 + 3.2, -pd / 2 + 3.2);
    list.push({ type: 'banya', x, z, y: house.y, heading, w: 3.6 + r() * 1.2, d: 4.2 + r() * 1.0, seed: house.seed + 3 });
  }
  return out;
}
