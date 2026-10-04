import { F } from './facades.js';
import { flatTop, frame, gableRoof, hipRoof, localBox, localCone, localCylinder, parapet, prismWalls, tentRoof, wall } from './building-geo.js';
import { rng } from '../core/util.js';

const DARK = [0.55, 0.55, 0.55];
const ONE = [1, 1, 1];

function attrsFor(b, tint = ONE) {
  return { aSeed: b.seed % 997, aTint: tint };
}

// Stacked loggias protruding from a facade: side = +1 street side, -1 courtyard side.
function balconyColumn(gb, b, F_, u, side, width, depth, y0, floors, fh, attrs) {
  const v0 = side * (b.d / 2);
  const v1 = side * (b.d / 2 + depth);
  const h = floors * fh;
  const at = (uu) => uu;
  // front
  if (side > 0) {
    wall(gb, b, F_, at(u + width / 2), v1, at(u - width / 2), v1, y0, y0 + h, F.balconyStack, width, fh, attrs);
    wall(gb, b, F_, u - width / 2, v1, u - width / 2, v0, y0, y0 + h, F.balconyStack, depth * 3, fh, attrs);
    wall(gb, b, F_, u + width / 2, v0, u + width / 2, v1, y0, y0 + h, F.balconyStack, depth * 3, fh, attrs);
  } else {
    wall(gb, b, F_, u - width / 2, v1, u + width / 2, v1, y0, y0 + h, F.balconyStack, width, fh, attrs);
    wall(gb, b, F_, u + width / 2, v1, u + width / 2, v0, y0, y0 + h, F.balconyStack, depth * 3, fh, attrs);
    wall(gb, b, F_, u - width / 2, v0, u - width / 2, v1, y0, y0 + h, F.balconyStack, depth * 3, fh, attrs);
  }
  localBox(gb, b, F_, u, y0 + h + 0.08, (v0 + v1) / 2, width + 0.1, 0.16, depth, F.concrete, attrs);
}

function entrances(gb, b, F_, count, y, side, attrs) {
  const v = side * (b.d / 2);
  for (let i = 0; i < count; i++) {
    const u = -b.w / 2 + (b.w * (i + 0.5)) / count;
    localBox(gb, b, F_, u, y + 1.1, v + side * 0.06, 1.5, 2.2, 0.12, F.door, attrs);
    localBox(gb, b, F_, u, y + 2.55, v + side * 0.8, 2.4, 0.14, 1.6, F.concrete, attrs);
    localBox(gb, b, F_, u, y + 0.08, v + side * 0.9, 2.6, 0.16, 1.8, F.concrete, attrs);
  }
}

// Lived-in facades: air conditioner units and satellite dishes next to random windows on both long sides.
function facadeClutter(gb, b, F_, base, floors, fh, bay, r, attrs, from = 1) {
  const bays = Math.max(1, Math.round(b.w / bay));
  const white = { ...attrs, aTint: [0.95, 0.95, 0.93] };
  const grey = { ...attrs, aTint: [0.7, 0.72, 0.74] };
  for (const side of [1, -1]) {
    for (let i = 0; i < bays; i++) {
      for (let f = from; f < floors; f++) {
        const k = r();
        if (k > 0.075) continue;
        const u = -b.w / 2 + (i + 0.5) * bay + (r() < 0.5 ? -1 : 1) * bay * 0.32;
        const y = base + f * fh + 0.55;
        if (k < 0.055) localBox(gb, b, F_, u, y, side * (b.d / 2 + 0.17), 0.82, 0.56, 0.3, F.plasterWhite, white, 0.5);
        else {
          // dish on a short bracket
          localBox(gb, b, F_, u, y + 0.6, side * (b.d / 2 + 0.12), 0.05, 0.05, 0.25, F.concrete, grey);
          localCylinder(gb, b, F_, u, side * (b.d / 2 + 0.3), y + 0.35, 0.3, 0.3, 0.06, 10, F.plasterWhite, white);
        }
      }
    }
  }
}

function plinth(gb, b, F_, h, attrs) {
  prismWalls(gb, b, F_, 0, 0, b.w + 0.1, b.d + 0.1, b.y - 1.5, b.y + h, F.concrete, 3, 3, { ...attrs, aTint: DARK });
}

function machineRooms(gb, b, F_, top, sections, attrs) {
  for (let i = 0; i < sections; i++) {
    const u = -b.w / 2 + (b.w * (i + 0.5)) / sections;
    localBox(gb, b, F_, u, top + 1.4, 0, 4.2, 2.8, 5.5, F.concrete, attrs);
    localBox(gb, b, F_, u + 3.2, top + 0.8, 1.5, 0.8, 1.6, 0.8, F.concrete, attrs);
  }
}

const TYPES = {
  khrushchevka(gb, b, r) {
    const F_ = frame(b);
    const fh = 2.75;
    const floors = b.floors ?? 5;
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.6, a);
    const top = b.y + 0.6 + floors * fh;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, b.y + 0.6, top, b.facade ?? F.khrushchevka, 3.2, fh, a);
    if (r() < 0.55) {
      flatTop(gb, b, F_, 0, 0, b.w, b.d, top + 0.4, F.roofFlat, a);
      parapet(gb, b, F_, 0, 0, b.w, b.d, top, 0.55, F.concrete, a);
    } else hipRoof(gb, b, F_, 0, 0, b.w, b.d, top, 2.2, r() < 0.6 ? F.roofSlate : F.roofTin, a, 0.5);
    const bays = Math.round(b.w / 3.2);
    for (let i = 1; i < bays; i += 3) balconyColumn(gb, b, F_, -b.w / 2 + (i + 0.5) * 3.2, 1, 2.8, 0.95, b.y + 0.6 + fh, floors - 1, fh, a);
    entrances(gb, b, F_, Math.max(1, Math.round(b.w / 16)), b.y + 0.6, -1, a);
    facadeClutter(gb, b, F_, b.y + 0.6, floors, fh, 3.2, r, a);
  },
  panel9(gb, b, r) {
    const F_ = frame(b);
    const fh = 2.8;
    const floors = b.floors ?? 9;
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.9, a);
    const base = b.y + 0.9;
    const top = base + floors * fh;
    if (b.shop) {
      prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, base + 3.6, F.shopfront, 4, 3.6, a);
      prismWalls(gb, b, F_, 0, 0, b.w, b.d, base + 3.6, top, b.facade ?? F.panelWhite, 3.2, fh, a, 1);
    } else prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, top, b.facade ?? F.panelWhite, 3.2, fh, a);
    flatTop(gb, b, F_, 0, 0, b.w, b.d, top + 0.45, F.roofFlat, a);
    parapet(gb, b, F_, 0, 0, b.w, b.d, top, 0.6, F.concrete, a);
    const sections = Math.max(1, Math.round(b.w / 24));
    machineRooms(gb, b, F_, top, sections, a);
    const bays = Math.round(b.w / 3.2);
    for (let i = 1; i < bays - 1; i += 2 + (i % 3 === 0 ? 1 : 0)) {
      const u = -b.w / 2 + (i + 0.5) * 3.2;
      balconyColumn(gb, b, F_, u, 1, 3.0, 1.1, base + fh, floors - 1, fh, a);
      if (r() < 0.5) balconyColumn(gb, b, F_, u, -1, 3.0, 1.1, base + fh, floors - 1, fh, a);
    }
    if (!b.shop) entrances(gb, b, F_, sections, base, -1, a);
    facadeClutter(gb, b, F_, base, floors, fh, 3.2, r, a, b.shop ? 2 : 1);
  },
  panelTower(gb, b, r) {
    const F_ = frame(b);
    const fh = 2.8;
    const floors = b.floors ?? 16;
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 1.0, a);
    const base = b.y + 1.0;
    const top = base + floors * fh;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, top, F.panelTower, 3.2, fh, a);
    flatTop(gb, b, F_, 0, 0, b.w, b.d, top + 0.5, F.roofFlat, a);
    parapet(gb, b, F_, 0, 0, b.w, b.d, top, 0.7, F.concrete, a);
    localBox(gb, b, F_, 0, top + 2.2, 0, 7, 4.4, 7, F.concrete, a);
    for (const u of [-b.w / 2 + 2.2, b.w / 2 - 2.2]) {
      balconyColumn(gb, b, F_, u, 1, 3.2, 1.2, base + fh, floors - 1, fh, a);
      balconyColumn(gb, b, F_, u, -1, 3.2, 1.2, base + fh, floors - 1, fh, a);
    }
    entrances(gb, b, F_, Math.max(1, Math.round(b.w / 26)), base, -1, a);
    facadeClutter(gb, b, F_, base, floors, fh, 3.2, r, a);
  },
  stalinka(gb, b, r) {
    const F_ = frame(b);
    const fh = 3.4;
    const floors = b.floors ?? 6;
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 1.1, a);
    const base = b.y + 1.1;
    const top = base + floors * fh;
    const wallLayer = b.facade ?? F.stalinkaYellow;
    if (b.shop) {
      prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, base + 4, F.shopfront, 4.5, 4, a);
      prismWalls(gb, b, F_, 0, 0, b.w, b.d, base + 4, top, wallLayer, 3.6, fh, a, 1);
    } else prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, top, wallLayer, 3.6, fh, a);
    // cornice and roof
    localBox(gb, b, F_, 0, top + 0.45, 0, b.w + 1.2, 0.9, b.d + 1.2, F.plasterWhite, a);
    hipRoof(gb, b, F_, 0, 0, b.w + 0.6, b.d + 0.6, top + 0.9, 4.2, r() < 0.55 ? F.roofTin : F.roofTinRed, a, 0.2);
    if (b.tower) {
      // corner tower with a spire, a hallmark of Stalinist ensembles
      const u = b.w / 2 - 4.5;
      const v = b.d / 2 - 4.5;
      prismWalls(gb, b, F_, u, v, 9, 9, top, top + 2 * fh, wallLayer, 3, fh, a);
      localBox(gb, b, F_, u, top + 2 * fh + 0.4, v, 10, 0.8, 10, F.plasterWhite, a);
      localCylinder(gb, b, F_, u, v, top + 2 * fh + 0.8, 3.2, 2.8, 5, 8, wallLayer, a);
      localCone(gb, b, F_, u, v, top + 2 * fh + 5.8, 2.9, 14, 8, F.gold, a);
    }
    for (let i = 0; i < Math.max(1, Math.round(b.w / 20)); i++) {
      if (b.shop) break;
      entrances(gb, b, F_, Math.max(1, Math.round(b.w / 20)), base, -1, a);
      break;
    }
  },
  merchant(gb, b, r) {
    const F_ = frame(b);
    const fh = 3.8;
    const floors = b.floors ?? 2;
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.7, a);
    const base = b.y + 0.7;
    const top = base + floors * fh;
    if (b.shop) {
      prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, base + fh, F.shopfront, 4, fh, a);
      prismWalls(gb, b, F_, 0, 0, b.w, b.d, base + fh, top, F.merchant, 3.4, fh, a, 1);
    } else prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, top, F.merchant, 3.4, fh, a);
    localBox(gb, b, F_, 0, top + 0.3, 0, b.w + 0.8, 0.6, b.d + 0.8, F.plasterWhite, a);
    hipRoof(gb, b, F_, 0, 0, b.w + 0.4, b.d + 0.4, top + 0.6, 3.2, r() < 0.5 ? F.roofTin : F.roofTinRed, a, 0.25);
  },
  modern(gb, b, r) {
    const F_ = frame(b);
    const fh = 3.0;
    const floors = b.floors ?? 20;
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.4, a);
    const base = b.y + 0.4;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, base + 4.5, F.shopfront, 5, 4.5, a);
    const split = b.w > 36 && r() < 0.6;
    if (split) {
      const w1 = b.w * 0.55;
      const w2 = b.w - w1;
      const f2 = Math.max(10, floors - 6 - Math.floor(r() * 6));
      prismWalls(gb, b, F_, -b.w / 2 + w1 / 2, 0, w1, b.d, base + 4.5, base + 4.5 + floors * fh, F.modernResidential, 3.4, fh, a, 1);
      prismWalls(gb, b, F_, b.w / 2 - w2 / 2, 0, w2, b.d, base + 4.5, base + 4.5 + f2 * fh, F.modernResidential, 3.4, fh, a, 1);
      flatTop(gb, b, F_, -b.w / 2 + w1 / 2, 0, w1, b.d, base + 4.5 + floors * fh, F.roofFlat, a);
      flatTop(gb, b, F_, b.w / 2 - w2 / 2, 0, w2, b.d, base + 4.5 + f2 * fh, F.roofFlat, a);
      parapet(gb, b, F_, -b.w / 2 + w1 / 2, 0, w1, b.d, base + 4.5 + floors * fh, 1.2, F.concrete, a);
    } else {
      const top = base + 4.5 + floors * fh;
      prismWalls(gb, b, F_, 0, 0, b.w, b.d, base + 4.5, top, F.modernResidential, 3.4, fh, a, 1);
      flatTop(gb, b, F_, 0, 0, b.w, b.d, top, F.roofFlat, a);
      parapet(gb, b, F_, 0, 0, b.w, b.d, top, 1.2, F.concrete, a);
      localBox(gb, b, F_, 0, top + 2, 0, 8, 4, 6, F.concrete, a);
    }
  },
  office(gb, b, r) {
    const F_ = frame(b);
    const fh = 3.7;
    const floors = b.floors ?? 14;
    const a = attrsFor(b, b.tint);
    const layer = b.facade ?? (r() < 0.6 ? F.glassBlue : F.glassDark);
    const base = b.y;
    const top = base + floors * fh;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base - 1, top, layer, 3, fh, a);
    flatTop(gb, b, F_, 0, 0, b.w, b.d, top, F.roofFlat, a);
    parapet(gb, b, F_, 0, 0, b.w, b.d, top, 1.4, F.concrete, a);
    if (b.crown) {
      prismWalls(gb, b, F_, 0, 0, b.w * 0.7, b.d * 0.7, top, top + 3 * fh, layer, 3, fh, a);
      flatTop(gb, b, F_, 0, 0, b.w * 0.7, b.d * 0.7, top + 3 * fh, F.roofFlat, a);
    }
  },
  izba(gb, b, r) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.7, a);
    const base = b.y + 0.7;
    const wallLayer = b.facade ?? F.logWall;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, base + 3.0, wallLayer, b.w / 3, 3.0, a);
    gableRoof(gb, b, F_, 0, 0, b.w, b.d, base + 3.0, 2.6 + r() * 0.8, r() < 0.55 ? F.roofSlate : r() < 0.5 ? F.roofTin : F.roofTinRed, wallLayer, a, false, 0.55);
    // porch on the side
    localBox(gb, b, F_, b.w / 2 + 1.1, base + 0.0, -b.d / 4, 2.2, 1.2, 2.6, F.woodFence, a);
    localBox(gb, b, F_, b.w / 2 + 1.1, base + 2.6, -b.d / 4, 2.4, 0.15, 2.8, F.roofSlate, a);
    // chimney
    localBox(gb, b, F_, -b.w * 0.15, base + 4.6, -b.d * 0.1, 0.7, 2.0, 0.7, F.redBrick, a);
  },
  cottage(gb, b, r) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.6, a);
    const base = b.y + 0.6;
    const floors = b.floors ?? 2;
    const layer = b.facade ?? (r() < 0.5 ? F.redBrick : r() < 0.5 ? F.siding : F.plasterWhite);
    const top = base + floors * 3;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, top, layer, b.w / 3, 3, a);
    hipRoof(gb, b, F_, 0, 0, b.w, b.d, top, 2.8, r() < 0.5 ? F.roofTinRed : F.roofTin, a, 0.6);
  },
  school(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.8, a);
    const base = b.y + 0.8;
    const top = base + 3 * 3.4;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base, top, F.school, 4.2, 3.4, a);
    flatTop(gb, b, F_, 0, 0, b.w, b.d, top + 0.4, F.roofFlat, a);
    parapet(gb, b, F_, 0, 0, b.w, b.d, top, 0.6, F.concrete, a);
    // entrance block
    prismWalls(gb, b, F_, 0, b.d / 2 + 3, 14, 6, base, base + 4, F.shopfront, 4.5, 4, a);
    flatTop(gb, b, F_, 0, b.d / 2 + 3, 14, 6, base + 4, F.roofFlat, a);
  },
  shop(gb, b, r) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    plinth(gb, b, F_, 0.4, a);
    const base = b.y + 0.4;
    const h = 4.2;
    wall(gb, b, F_, b.w / 2, b.d / 2, -b.w / 2, b.d / 2, base, base + h, F.shopfront, 4.5, h, a);
    wall(gb, b, F_, -b.w / 2, -b.d / 2, b.w / 2, -b.d / 2, base, base + h, F.concrete, 4, h, a);
    wall(gb, b, F_, b.w / 2, -b.d / 2, b.w / 2, b.d / 2, base, base + h, F.concrete, 4, h, a);
    wall(gb, b, F_, -b.w / 2, b.d / 2, -b.w / 2, -b.d / 2, base, base + h, F.concrete, 4, h, a);
    flatTop(gb, b, F_, 0, 0, b.w, b.d, base + h, F.roofFlat, a);
    parapet(gb, b, F_, 0, 0, b.w, b.d, base + h, 0.8, F.concrete, a);
    if (r() < 0.7) localBox(gb, b, F_, 0, base + h + 1.0, b.d / 2 - 0.4, Math.min(b.w - 2, 12), 1.6, 0.3, F.signRed, a);
  },
  hyper(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    const base = b.y;
    const h = 9;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base - 0.5, base + h, F.metalShed, 6, h, a);
    wall(gb, b, F_, b.w / 2 - 2, b.d / 2 + 0.05, -b.w / 2 + 2, b.d / 2 + 0.05, base, base + 4.5, F.shopfront, 5, 4.5, a);
    flatTop(gb, b, F_, 0, 0, b.w, b.d, base + h, F.roofFlat, a);
    localBox(gb, b, F_, 0, base + h + 1.6, b.d / 2 - 0.5, 26, 3.2, 0.5, F.signRed, a);
  },
  garages(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    const base = b.y;
    const h = 2.7;
    wall(gb, b, F_, b.w / 2, b.d / 2, -b.w / 2, b.d / 2, base - 0.3, base + h, F.garageDoors, 3.3, h, a);
    wall(gb, b, F_, -b.w / 2, -b.d / 2, b.w / 2, -b.d / 2, base - 0.3, base + h, F.concrete, 4, h, a);
    wall(gb, b, F_, b.w / 2, -b.d / 2, b.w / 2, b.d / 2, base - 0.3, base + h, F.concrete, 4, h, a);
    wall(gb, b, F_, -b.w / 2, b.d / 2, -b.w / 2, -b.d / 2, base - 0.3, base + h, F.concrete, 4, h, a);
    flatTop(gb, b, F_, 0, 0.3, b.w + 0.3, b.d + 0.6, base + h, F.roofFlat, a);
  },
  warehouse(gb, b, r) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    const base = b.y;
    const h = b.height ?? 10;
    wall(gb, b, F_, b.w / 2, b.d / 2, -b.w / 2, b.d / 2, base - 0.5, base + h, F.warehouseDock, 6, h / 2, a);
    wall(gb, b, F_, -b.w / 2, -b.d / 2, b.w / 2, -b.d / 2, base - 0.5, base + h, F.metalShed, 6, h, a);
    wall(gb, b, F_, b.w / 2, -b.d / 2, b.w / 2, b.d / 2, base - 0.5, base + h, F.metalShed, 6, h, a);
    wall(gb, b, F_, -b.w / 2, b.d / 2, -b.w / 2, -b.d / 2, base - 0.5, base + h, F.metalShed, 6, h, a);
    gableRoof(gb, b, F_, 0, 0, b.w, b.d, base + h, 2.2, F.roofTin, F.metalShed, a, true, 0.3);
    // dock canopy
    localBox(gb, b, F_, 0, base + 5.2, b.d / 2 + 1.5, b.w - 4, 0.25, 3, F.metalShed, a);
    void r;
  },
  factory(gb, b, r) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    const base = b.y;
    const h = b.height ?? 13;
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, base - 0.5, base + h, F.factoryBrick, 6, h / 2, a);
    // saw-tooth roof
    const teeth = Math.max(2, Math.round(b.w / 9));
    for (let i = 0; i < teeth; i++) {
      const u = -b.w / 2 + (b.w * (i + 0.5)) / teeth;
      gableRoof(gb, b, F_, u, 0, b.w / teeth, b.d, base + h, 3, F.roofFlat, F.factoryBrick, a, false, 0);
    }
    if (b.chimney !== false && r() < 0.75) {
      const u = b.w / 2 + 4;
      localCylinder(gb, b, F_, u, -b.d / 4, base, 2.6, 1.6, 48 + r() * 30, 12, r() < 0.5 ? F.tvTower : F.factoryBrick, a);
    }
  },
  banya(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, b.y - 0.3, b.y + 2.3, F.logWall, 2.9, 2.6, a);
    gableRoof(gb, b, F_, 0, 0, b.w, b.d, b.y + 2.3, 1.2, F.roofTin, F.woodFence, a, false, 0.35);
    localBox(gb, b, F_, b.w / 2 - 0.8, b.y + 3.3, -0.6, 0.5, 1.6, 0.5, F.redBrick, a);
    localBox(gb, b, F_, 0, b.y + 0.15, b.d / 2 + 0.7, b.w, 0.12, 1.4, F.woodFence, a);
  },
  shed(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, b.y - 0.3, b.y + 2.4, F.woodFence, 2, 2.4, a);
    gableRoof(gb, b, F_, 0, 0, b.w, b.d, b.y + 2.4, 1.0, F.roofSlate, F.woodFence, a, true, 0.3);
  },
  tanks(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    const n = Math.max(2, Math.round(b.w / 16));
    for (let i = 0; i < n; i++) {
      const u = -b.w / 2 + (b.w * (i + 0.5)) / n;
      localCylinder(gb, b, F_, u, 0, b.y - 0.3, 6.5, 6.5, 11, 18, F.metalShed, { ...a, aTint: [1.05, 1.05, 1.0] });
      localCone(gb, b, F_, u, 0, b.y + 10.7, 6.6, 1.6, 18, F.roofTin, { ...a, aTint: [0.9, 0.9, 0.9] });
    }
  },
  elevator(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b, b.tint);
    const n = 4;
    for (let i = 0; i < n; i++) localCylinder(gb, b, F_, -b.w / 2 + 4 + i * 7.5, 0, b.y - 0.3, 3.6, 3.6, 28, 14, F.concrete, a);
    prismWalls(gb, b, F_, b.w / 2 - 5, 0, 8, 10, b.y - 0.3, b.y + 38, F.concrete, 4, 4, a);
    flatTop(gb, b, F_, b.w / 2 - 5, 0, 8, 10, b.y + 38, F.roofFlat, a);
  },
};

Object.assign(TYPES, {
  cabin(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b);
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, b.y - 0.2, b.y + 2.8, F.siding, b.w / 2, 2.8, a);
    flatTop(gb, b, F_, 0, 0, b.w + 0.4, b.d + 0.4, b.y + 2.8, F.roofFlat, a);
    localBox(gb, b, F_, b.w / 4, b.y + 1.0, b.d / 2 + 0.05, 0.9, 2.0, 0.1, F.door, a);
  },
  canopy(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b);
    const h = 5.4;
    for (const u of [-b.w / 2 + 2, b.w / 2 - 2]) for (const v of [-b.d / 2 + 2, b.d / 2 - 2]) localBox(gb, b, F_, u, b.y + h / 2, v, 0.5, h, 0.5, F.concrete, { ...a, aTint: [1.1, 1.1, 1.1] });
    localBox(gb, b, F_, 0, b.y + h + 0.5, 0, b.w, 1.0, b.d, F.stadium, a);
    // coloured fascia band
    wall(gb, b, F_, b.w / 2 + 0.02, b.d / 2 + 0.02, -b.w / 2 - 0.02, b.d / 2 + 0.02, b.y + h, b.y + h + 1.0, F.signRed, 4, 1, { ...a, aTint: [0.25, 0.55, 1.0] });
    wall(gb, b, F_, -b.w / 2 - 0.02, -b.d / 2 - 0.02, b.w / 2 + 0.02, -b.d / 2 - 0.02, b.y + h, b.y + h + 1.0, F.signRed, 4, 1, { ...a, aTint: [0.25, 0.55, 1.0] });
  },
  service(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b);
    const h = 6;
    wall(gb, b, F_, b.w / 2, b.d / 2, -b.w / 2, b.d / 2, b.y - 0.3, b.y + h, F.garageDoors, 4.5, h / 1.4, a);
    wall(gb, b, F_, -b.w / 2, -b.d / 2, b.w / 2, -b.d / 2, b.y - 0.3, b.y + h, F.metalShed, 6, h, a);
    wall(gb, b, F_, b.w / 2, -b.d / 2, b.w / 2, b.d / 2, b.y - 0.3, b.y + h, F.metalShed, 6, h, a);
    wall(gb, b, F_, -b.w / 2, b.d / 2, -b.w / 2, -b.d / 2, b.y - 0.3, b.y + h, F.metalShed, 6, h, a);
    flatTop(gb, b, F_, 0, 0, b.w + 0.4, b.d + 0.4, b.y + h, F.roofFlat, a);
    localBox(gb, b, F_, 0, b.y + h + 1.0, b.d / 2 - 0.3, 14, 1.8, 0.3, F.signRed, { ...a, aTint: [0.3, 0.45, 1.0] });
  },
  cafe(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b);
    plinth(gb, b, F_, 0.4, a);
    wall(gb, b, F_, b.w / 2, b.d / 2, -b.w / 2, b.d / 2, b.y + 0.4, b.y + 3.6, F.shopfront, 4.5, 3.2, a);
    wall(gb, b, F_, -b.w / 2, -b.d / 2, b.w / 2, -b.d / 2, b.y + 0.4, b.y + 3.6, F.siding, 3, 3.2, a);
    wall(gb, b, F_, b.w / 2, -b.d / 2, b.w / 2, b.d / 2, b.y + 0.4, b.y + 3.6, F.siding, 3, 3.2, a);
    wall(gb, b, F_, -b.w / 2, b.d / 2, -b.w / 2, -b.d / 2, b.y + 0.4, b.y + 3.6, F.siding, 3, 3.2, a);
    gableRoof(gb, b, F_, 0, 0, b.w, b.d, b.y + 3.6, 2.4, F.roofTinRed, F.siding, a, true, 0.6);
  },
  shelter(gb, b) {
    const F_ = frame(b);
    const a = attrsFor(b);
    prismWalls(gb, b, F_, 0, 0, b.w, b.d, b.y - 0.2, b.y + 2.5, F.profFence, 2, 2.5, a);
    flatTop(gb, b, F_, 0, 0, b.w + 0.6, b.d + 0.6, b.y + 2.5, F.roofTin, a);
  },
});

export function emitBuilding(gb, b) {
  const fn = TYPES[b.type];
  if (!fn) return;
  fn(gb, b, rng(b.seed));
}

export function tentTower(gb, b, attrs) {
  const F_ = frame(b);
  tentRoof(gb, b, F_, 0, 0, b.w, b.y, b.h, F.roofTin, attrs);
}

// Far level of detail: one textured prism plus a flat or gabled cap per building (about 10–14 triangles).
// [floor height, default floors, wall layer, bay width, plinth / ground storey height]
const SIMPLE = {
  khrushchevka: [2.75, 5, F.khrushchevka, 3.2, 0.6],
  panel9: [2.8, 9, F.panelWhite, 3.2, 0.9],
  panelTower: [2.8, 16, F.panelTower, 3.2, 0.9],
  stalinka: [3.4, 6, F.stalinkaYellow, 3.6, 0.9],
  merchant: [3.8, 2, F.merchant, 3.4, 0.5],
  modern: [3.0, 20, F.modernResidential, 3.4, 4.5],
  office: [3.7, 14, F.glassBlue, 3.6, 0.5],
  school: [3.4, 3, F.school, 4.2, 0.5],
  shop: [4.2, 1, F.shopfront, 4.5, 0],
  hyper: [9, 1, F.metalShed, 6, 0],
  garages: [2.6, 1, F.garageDoors, 3.3, 0],
  izba: [3.0, 1, F.logWall, 2.9, 0.3],
  cottage: [3.0, 2, F.siding, 3.2, 0.3],
};
const PITCHED = new Set(['izba', 'cottage', 'merchant', 'stalinka', 'shed']);

export function emitBuildingSimple(gb, b) {
  const spec = SIMPLE[b.type];
  const F_ = frame(b);
  const a = attrsFor(b, b.tint);
  let h;
  let layer;
  let bay = 3.4;
  let fh = 3;
  if (spec) {
    [fh, , layer, bay] = spec;
    h = spec[4] + (b.floors ?? spec[1]) * fh;
    if (b.type !== 'office' && b.type !== 'school' && b.facade !== undefined) layer = b.facade;
  } else {
    h = b.height ?? (b.type === 'elevator' ? 38 : b.type === 'tanks' ? 11 : 7);
    layer = b.type === 'factory' ? F.factoryBrick : b.type === 'tanks' || b.type === 'warehouse' ? F.metalShed : F.concrete;
    fh = h / 2;
  }
  const y0 = b.y - 0.5;
  const top = b.y + h;
  prismWalls(gb, b, F_, 0, 0, b.w, b.d, y0, top, layer, bay, fh, a);
  if (PITCHED.has(b.type)) gableRoof(gb, b, F_, 0, 0, b.w, b.d, top, Math.min(4, b.d * 0.3), b.type === 'stalinka' || b.type === 'merchant' ? F.roofTin : F.roofSlate, layer, a, b.type !== 'izba', 0.3);
  else flatTop(gb, b, F_, 0, 0, b.w, b.d, top, F.roofFlat, a);
}
