import { COMPANIES } from '../data/economy.js';
import { rng } from '../core/util.js';

// Converts lot-local (u along road to the right, v toward the road) to world.
export function lotPoint(lot, u, v) {
  const fx = Math.sin(lot.heading);
  const fz = Math.cos(lot.heading);
  return { x: lot.x - fz * u + fx * v, z: lot.z + fx * u + fz * v };
}

// Deterministic layout of structures, trailer slots and fences for a lot (cached on the lot).
export function layoutLot(lot) {
  if (lot.layout) return lot.layout;
  const r = rng(lot.id * 7919 + 17);
  const L = { structures: [], slots: [], fences: [], pumps: [], zone: null, sign: null };
  const w = lot.w;
  const d = lot.d;
  const S = (type, u, v, bw, bd, heading = lot.heading, extra = {}) => {
    const p = lotPoint(lot, u, v);
    L.structures.push({ type, x: p.x, z: p.z, y: lot.y, w: bw, d: bd, heading, seed: lot.id * 31 + L.structures.length, ...extra });
  };
  const fenceAround = (gate) => {
    const corners = [lotPoint(lot, -w / 2, d / 2), lotPoint(lot, w / 2, d / 2), lotPoint(lot, w / 2, -d / 2), lotPoint(lot, -w / 2, -d / 2)];
    // front split by the gate
    const g0 = lotPoint(lot, -gate / 2, d / 2);
    const g1 = lotPoint(lot, gate / 2, d / 2);
    L.fences.push([corners[0], g0], [g1, corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]);
  };
  if (lot.kind === 'company' || lot.kind === 'industry') {
    const co = COMPANIES[lot.company] ?? null;
    const kind = co?.kind ?? (r() < 0.5 ? 'warehouse' : 'factory');
    const bd = 18 + r() * 4;
    const bv = -d / 2 + bd / 2 + 2;
    const bw = w - 12;
    switch (kind) {
      case 'tanks':
        S('tanks', -w / 4, bv, w / 2 - 4, bd);
        S('warehouse', w / 4, bv, w / 2 - 8, bd - 4, lot.heading, { height: 7 });
        break;
      case 'chem':
        S('tanks', -w / 4, bv, w / 2 - 6, bd);
        S('factory', w / 4, bv, w / 2 - 6, bd, lot.heading, { height: 12 });
        break;
      case 'elevator':
        S('elevator', 0, bv, bw, bd);
        break;
      case 'steel':
      case 'factory':
      case 'plant':
        S('factory', 0, bv, bw, bd, lot.heading, { height: kind === 'steel' ? 18 : 12 });
        break;
      case 'farm':
        S('warehouse', -w / 6, bv, bw * 0.6, bd, lot.heading, { height: 7 });
        S('elevator', w / 3, bv, w / 3 - 2, bd * 0.8);
        break;
      default:
        S('warehouse', 0, bv, bw, bd, lot.heading, { height: 9 + r() * 3 });
    }
    // trailer slots: backed onto the dock, cab end toward the road
    const n = Math.max(2, Math.min(6, Math.floor((w - 14) / 5.2)));
    const sv = bv + bd / 2 + 1.5 + 8.2;
    for (let i = 0; i < n; i++) {
      const u = -((n - 1) * 5.2) / 2 + i * 5.2;
      const p = lotPoint(lot, u, sv);
      L.slots.push({ x: p.x, z: p.z, heading: lot.heading, len: 15.5, width: 4.4, index: i });
    }
    const gate = 18;
    fenceAround(gate);
    const sp = lotPoint(lot, gate / 2 + 4, d / 2 - 1.5);
    L.sign = { x: sp.x, z: sp.z, heading: lot.heading, text: co ? [co.ru, co.en] : null, color: co?.color ?? '#7b8a93' };
    S('cabin', -gate / 2 - 5, d / 2 - 5, 4.5, 3);
  } else if (lot.kind === 'fuel') {
    S('canopy', 0, 2, Math.min(28, w - 18), 13);
    S('shop', 0, -d / 2 + 6.5, 16, 10);
    const islands = 3;
    for (let i = 0; i < islands; i++) {
      const u = -((islands - 1) * 8) / 2 + i * 8;
      const p = lotPoint(lot, u, 2);
      L.pumps.push({ x: p.x, z: p.z, heading: lot.heading });
    }
    const pz = lotPoint(lot, w / 2 - 4, d / 2 - 2);
    L.sign = { x: pz.x, z: pz.z, heading: lot.heading, kind: 'fuel' };
    const zc = lotPoint(lot, 0, 2);
    L.zone = { x: zc.x, z: zc.z, r: 16, kind: 'fuel' };
    L.fences.push([lotPoint(lot, -w / 2, -d / 2), lotPoint(lot, w / 2, -d / 2)]);
  } else if (lot.kind === 'service') {
    S('service', 0, -d / 2 + 9, Math.min(36, w - 12), 14);
    const zc = lotPoint(lot, 0, 2);
    L.zone = { x: zc.x, z: zc.z, r: 18, kind: 'service' };
    const sp = lotPoint(lot, w / 2 - 4, d / 2 - 2);
    L.sign = { x: sp.x, z: sp.z, heading: lot.heading, kind: 'service' };
    fenceAround(26);
  } else if (lot.kind === 'cafe') {
    S('cafe', -w / 4, -d / 2 + 7, 14, 9);
    S('shed', w / 4, -d / 2 + 5, 7, 5);
    const sp = lotPoint(lot, w / 2 - 4, d / 2 - 2);
    L.sign = { x: sp.x, z: sp.z, heading: lot.heading, kind: 'cafe' };
    const zc = lotPoint(lot, w / 6, 4);
    L.zone = { x: zc.x, z: zc.z, r: 18, kind: 'rest' };
  } else if (lot.kind === 'rest') {
    const zc = lotPoint(lot, 0, 0);
    L.zone = { x: zc.x, z: zc.z, r: 22, kind: 'rest' };
    S('shelter', -w / 2 + 6, -d / 2 + 4, 5, 3);
  }
  lot.layout = L;
  return L;
}
