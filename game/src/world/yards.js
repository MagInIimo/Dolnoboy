import { WATER_LEVEL } from '../core/geo.js';
import { F } from '../render/facades.js';
import { L } from '../render/surfaces.js';

// Courtyards of apartment blocks: the side with the entrances gets an asphalt driveway with parked cars,
// paths to every entrance with benches, and every other block a playground, a bin site and yard trees.
// Everything is laid out in the block's frame (u along the long side, v toward the street; the yard is at v < 0)
// and kept off roads, lots, water and other buildings.

const YARD_TYPES = new Set(['khrushchevka', 'panel9', 'panelTower', 'stalinka', 'modern']);
const PARKED_PAINT = [0xe9ebe8, 0xd8dcdc, 0xb7bcc0, 0x8d949a, 0x5b6268, 0x1a1c1f, 0x2b3f66, 0x7a1f1d, 0x9a2d22, 0x2f4a36, 0xc9b99a, 0x1f5c8a, 0x6e5a3e, 0xe2d6b0];
const PLAY = [[0.95, 0.3, 0.2], [0.25, 0.55, 0.95], [1.0, 0.8, 0.15], [0.3, 0.75, 0.35], [0.95, 0.55, 0.15]];

export const PARKED_KINDS = ['sedan', 'hatch', 'suv', 'van'];

export function* layoutYards(cb) {
  const world = cb.world;
  const net = world.net;
  const r = cb.random;
  const out = [];
  let work = 0;
  for (const b of cb.list) {
    if (!YARD_TYPES.has(b.type)) continue;
    if (b.shop && b.type === 'stalinka') continue;
    const fx = Math.sin(b.heading);
    const fz = Math.cos(b.heading);
    const rx = -fz;
    const rz = fx;
    const W = (u, v) => [b.x + rx * u + fx * v, b.z + rz * u + fz * v];
    const clear = (u, v, m = 1.5) => {
      const [x, z] = W(u, v);
      if (net.query(x, z, m).length) return false;
      if (world.lotAt(x, z, 2)) return false;
      if (world.baseHeight(x, z) < WATER_LEVEL + 1.1) return false;
      for (const s of cb.sites) if (Math.hypot(x - s.x, z - s.z) < s.radius + 4) return false;
      for (const o of cb.hash.query(x - 40, z - 40, x + 40, z + 40)) {
        const lx = x - o.x;
        const lz = z - o.z;
        const cs = Math.cos(o.heading);
        const sn = Math.sin(o.heading);
        const ou = Math.abs(lx * cs - lz * sn);
        const ov = Math.abs(lx * sn + lz * cs);
        const pad = o === b ? 0.4 : m;
        if (ou < (o.plot?.[0] ?? o.w) / 2 + pad && ov < (o.plot?.[1] ?? o.d) / 2 + pad) return false;
      }
      return true;
    };
    const y = b.y + 0.05;
    const yard = { b, surfaces: [], props: [], cars: [], trees: [] };
    const rect = (u0, u1, v0, v1, layer, tint = [1, 1, 1], lift = 0) =>
      yard.surfaces.push({ pts: [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)], y: y + lift, layer, tint });
    const box = (u, yy, v, w, h, d, layer, tint = [1, 1, 1], turn = 0) => {
      const [x, z] = W(u, v);
      yard.props.push({ t: 'box', x, y: yy, z, w, h, d, heading: b.heading + turn, layer, tint });
    };
    const hd = b.d / 2;
    const hw = b.w / 2;
    // blind area along the yard wall
    rect(-hw - 0.6, hw + 0.6, -hd - 1.1, -hd, L.CONCRETE, [0.92, 0.92, 0.9]);
    // driveway: the longest clear run along the block
    const vDrive = -(hd + 9);
    const step = 3;
    let best = null;
    let run = null;
    for (let u = -hw - 8; u <= hw + 8 + 1e-6; u += step) {
      const ok = clear(u, vDrive, 2) && clear(u, vDrive - 2.8, 1) && clear(u, vDrive + 2.8, 1);
      if (ok) {
        if (!run) run = { u0: u, u1: u };
        run.u1 = u;
        if (!best || run.u1 - run.u0 > best.u1 - best.u0) best = { ...run };
      } else run = null;
    }
    const entries = Math.max(1, Math.round(b.w / (b.type === 'khrushchevka' ? 16 : b.type === 'stalinka' ? 20 : 24)));
    const hasDrive = best && best.u1 - best.u0 >= Math.min(b.w * 0.6, 40);
    if (hasDrive) {
      const u0 = best.u0;
      const u1 = best.u1;
      rect(u0, u1, vDrive - 2.9, vDrive + 2.9, L.ASPHALT, [0.95, 0.95, 0.95], 0.01);
      // parking lane along the outer edge, a shade lighter (older asphalt)
      rect(u0 + 1, u1 - 1, vDrive - 5.5, vDrive - 2.9, L.WORN, [1.0, 1.0, 1.0], 0.011);
      // parked cars along the outer edge (parallel), with gaps
      for (let u = u0 + 3; u < u1 - 2.5; u += 5.4 + r() * 0.6) {
        if (r() > 0.72) continue;
        if (!clear(u, vDrive - 4.3, 0.6) || u < u0 + 1.5 || u > u1 - 1.5) continue;
        const [x, z] = W(u, vDrive - 4.1);
        yard.cars.push({ x, z, y: b.y, heading: b.heading + (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2), kind: Math.floor(r() * r() * 4), color: PARKED_PAINT[Math.floor(r() * PARKED_PAINT.length)] });
      }
      // a parking pocket with nose-in cars at one end
      const pu = r() < 0.5 ? u0 + 8 : u1 - 8;
      if (clear(pu, vDrive - 7, 1) && clear(pu - 6, vDrive - 7, 1) && clear(pu + 6, vDrive - 7, 1)) {
        rect(pu - 7.5, pu + 7.5, vDrive - 8.5, vDrive - 2.9, L.ASPHALT, [0.9, 0.9, 0.9], 0.012);
        for (let k = -2; k <= 2; k++) {
          if (r() < 0.25) continue;
          const [x, z] = W(pu + k * 2.7, vDrive - 5.9);
          yard.cars.push({ x, z, y: b.y, heading: b.heading + (r() < 0.6 ? 0 : Math.PI), kind: Math.floor(r() * r() * 4), color: PARKED_PAINT[Math.floor(r() * PARKED_PAINT.length)] });
        }
      }
    }
    // paths to the entrances, benches and a lamp at each porch
    for (let i = 0; i < entries; i++) {
      const u = -hw + (b.w * (i + 0.5)) / entries;
      if (hasDrive) rect(u - 0.9, u + 0.9, vDrive + 2.9, -hd - 1.1, L.PAVING, [0.9, 0.88, 0.85], 0.006);
      for (const s of [-1, 1]) {
        const bu = u + s * 2.6;
        if (!clear(bu, -hd - 2.4, 0.3)) continue;
        box(bu, y + 0.45, -hd - 2.4, 1.8, 0.08, 0.45, F.woodFence, [0.95, 0.85, 0.7]);
        box(bu, y + 0.75, -hd - 2.2, 1.8, 0.4, 0.06, F.woodFence, [0.95, 0.85, 0.7]);
        for (const e of [-0.8, 0.8]) box(bu + e, y + 0.22, -hd - 2.4, 0.08, 0.44, 0.4, F.concrete, [0.6, 0.6, 0.6]);
      }
    }
    // playground on every other block
    const vPlay = -(hd + 24);
    const uPlay = (r() - 0.5) * Math.max(0, b.w - 18);
    const pw = 16;
    const pd = 12;
    if (b.id % 2 === 0 && [[0, 0], [-pw / 2, -pd / 2], [pw / 2, -pd / 2], [-pw / 2, pd / 2], [pw / 2, pd / 2]].every(([du, dv]) => clear(uPlay + du, vPlay + dv, 1))) {
      rect(uPlay - pw / 2, uPlay + pw / 2, vPlay - pd / 2, vPlay + pd / 2, L.SAND, [1.0, 0.95, 0.85], 0.008);
      const col = () => PLAY[Math.floor(r() * PLAY.length)];
      // swings: two A-frames, a beam, two seats on chains
      const su = uPlay - 4.5;
      const sv = vPlay + 2;
      const c1 = col();
      for (const e of [-1.6, 1.6]) {
        box(su + e, y + 1.15, sv - 0.55, 0.08, 2.3, 0.08, F.plasterWhite, c1);
        box(su + e, y + 1.15, sv + 0.55, 0.08, 2.3, 0.08, F.plasterWhite, c1);
      }
      box(su, y + 2.3, sv, 3.4, 0.1, 0.1, F.plasterWhite, c1);
      for (const e of [-0.7, 0.7]) {
        box(su + e - 0.22, y + 1.55, sv, 0.025, 1.5, 0.025, F.concrete, [0.4, 0.4, 0.4]);
        box(su + e + 0.22, y + 1.55, sv, 0.025, 1.5, 0.025, F.concrete, [0.4, 0.4, 0.4]);
        box(su + e, y + 0.78, sv, 0.5, 0.06, 0.28, F.woodFence, col());
      }
      // slide: ladder tower, platform and a chute
      const lu = uPlay + 3.5;
      const lv = vPlay - 2.5;
      const c2 = col();
      for (const [du, dv] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(lu + du, y + 0.9, lv + dv, 0.09, 1.8, 0.09, F.plasterWhite, c2);
      box(lu, y + 1.25, lv, 1.3, 0.08, 1.3, F.woodFence, [0.95, 0.8, 0.6]);
      box(lu, y + 1.9, lv, 1.4, 0.5, 1.4, F.plasterWhite, col(), 0);
      const [ax, az] = W(lu, lv + 0.7);
      const [bx, bz] = W(lu, lv + 3.6);
      yard.props.push({ t: 'slab', p0: [ax, y + 1.25, az], p1: [bx, y + 0.25, bz], width: 0.6, thick: 0.06, layer: F.roofTin, tint: [0.85, 0.88, 0.9] });
      // sandbox with a wooden rim, horizontal bar, carousel and benches
      const bu = uPlay - 1;
      const bv = vPlay - 3;
      for (const [du, dv, w, d] of [[0, -1.5, 3.2, 0.15], [0, 1.5, 3.2, 0.15], [-1.5, 0, 0.15, 3.2], [1.5, 0, 0.15, 3.2]]) box(bu + du, y + 0.15, bv + dv, w, 0.3, d, F.woodFence, [0.95, 0.85, 0.7]);
      for (const e of [-0.9, 0.9]) box(uPlay + 6 + e, y + 1.1, vPlay + 3, 0.07, 2.2, 0.07, F.plasterWhite, [0.4, 0.45, 0.5]);
      box(uPlay + 6, y + 2.15, vPlay + 3, 1.9, 0.05, 0.05, F.plasterWhite, [0.4, 0.45, 0.5]);
      const [cx, cz] = W(uPlay + 1.5, vPlay + 3.2);
      yard.props.push({ t: 'cyl', x: cx, y: y + 0.35, z: cz, r0: 1.0, r1: 1.0, h: 0.08, n: 14, layer: F.plasterWhite, tint: col() });
      yard.props.push({ t: 'cyl', x: cx, y: y + 0.43, z: cz, r0: 0.05, r1: 0.05, h: 0.7, n: 6, layer: F.plasterWhite, tint: [0.4, 0.4, 0.4] });
      for (const e of [-1, 1]) {
        box(uPlay + e * 7.2, y + 0.45, vPlay - 4.8, 1.8, 0.08, 0.45, F.woodFence, [0.95, 0.85, 0.7], Math.PI / 2);
        box(uPlay + e * 7.2, y + 0.22, vPlay - 4.8, 0.4, 0.44, 1.4, F.concrete, [0.6, 0.6, 0.6]);
      }
      // low fence round the playground
      for (const [u0, v0, u1, v1] of [[-pw / 2, -pd / 2, pw / 2, -pd / 2], [-pw / 2, pd / 2, pw / 2, pd / 2], [-pw / 2, -pd / 2, -pw / 2, pd / 2], [pw / 2, -pd / 2, pw / 2, pd / 2]]) {
        const len = Math.hypot(u1 - u0, v1 - v0);
        box(uPlay + (u0 + u1) / 2, y + 0.45, vPlay + (v0 + v1) / 2, u0 === u1 ? 0.04 : len, 0.05, u0 === u1 ? len : 0.04, F.plasterWhite, [0.2, 0.45, 0.25]);
        box(uPlay + (u0 + u1) / 2, y + 0.15, vPlay + (v0 + v1) / 2, u0 === u1 ? 0.04 : len, 0.05, u0 === u1 ? len : 0.04, F.plasterWhite, [0.2, 0.45, 0.25]);
      }
    }
    // bin site at the end of the driveway
    if (hasDrive && b.id % 3 !== 1) {
      const gu = best.u1 + 4;
      const gv = vDrive;
      if (clear(gu, gv, 1) && clear(gu + 2, gv, 1)) {
        rect(gu - 1.8, gu + 1.8, gv - 3.2, gv + 3.2, L.CONCRETE, [0.85, 0.85, 0.82], 0.01);
        const tints = [[0.25, 0.5, 0.3], [0.25, 0.5, 0.3], [0.3, 0.4, 0.6], [0.55, 0.5, 0.2]];
        for (let k = 0; k < 4; k++) box(gu - 0.2, y + 0.62, gv - 2.25 + k * 1.5, 1.2, 1.24, 1.3, F.metalShed, tints[k]);
        box(gu + 1.6, y + 0.85, gv, 0.08, 1.7, 6.2, F.profFence, [0.75, 0.8, 0.85]);
        box(gu, y + 0.85, gv - 3.1, 3.4, 1.7, 0.08, F.profFence, [0.75, 0.8, 0.85]);
        box(gu, y + 0.85, gv + 3.1, 3.4, 1.7, 0.08, F.profFence, [0.75, 0.8, 0.85]);
      }
    }
    // yard trees: rows along the driveway and clumps in the open part of the yard
    const treeN = 4 + Math.floor(r() * 6);
    for (let k = 0; k < treeN; k++) {
      const u = (r() - 0.5) * (b.w + 10);
      const v = -(hd + 3.5 + r() * 28);
      if (Math.abs(v - vDrive) < 4.5 && hasDrive) continue;
      if (Math.abs(u - uPlay) < pw / 2 + 2 && Math.abs(v - vPlay) < pd / 2 + 2) continue;
      if (!clear(u, v, 2.5)) continue;
      const [x, z] = W(u, v);
      yard.trees.push({ x, z, species: r.weighted([['birch', 4], ['linden', 3], ['poplar', 2], ['maple', 2], ['apple', 1]]), scale: 0.7 + r() * 0.45 });
    }
    out.push(yard);
    if (++work % 12 === 0) yield;
  }
  return out;
}
