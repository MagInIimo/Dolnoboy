import { F } from './facades.js';

// Geometry helpers that write into a GeoBuilder with attributes aLayer, aSeed, aTint.
// Local frame of a building: forward f = (sin h, cos h) points to the street, right r = (-cos h, sin h).

export function frame(b) {
  const fx = Math.sin(b.heading);
  const fz = Math.cos(b.heading);
  return { fx, fz, rx: -fz, rz: fx };
}

const at = (b, F_, u, y, v) => [b.x + F_.rx * u + F_.fx * v, y, b.z + F_.rz * u + F_.fz * v];

// Wall quad from local (u0, v0) to (u1, v1) at heights y0..y1, uv in bay/floor units.
export function wall(gb, b, F_, u0, v0, u1, v1, y0, y1, layer, bay, floorH, attrs, uOff = 0, vOff = 0) {
  const p0 = at(b, F_, u0, y0, v0);
  const p1 = at(b, F_, u1, y0, v1);
  const p2 = at(b, F_, u1, y1, v1);
  const p3 = at(b, F_, u0, y1, v0);
  const len = Math.hypot(u1 - u0, v1 - v0);
  const uw = len / bay;
  const vh = (y1 - y0) / floorH;
  gb.face(p0, p1, p2, p3, [uOff, vOff, uOff + uw, vOff, uOff + uw, vOff + vh, uOff, vOff + vh], { ...attrs, aLayer: layer });
}

// Rectangular prism walls (no top), footprint centred at local (cu, cv) size w x d.
export function prismWalls(gb, b, F_, cu, cv, w, d, y0, y1, layer, bay, floorH, attrs, vOff = 0) {
  const u0 = cu - w / 2;
  const u1 = cu + w / 2;
  const v0 = cv - d / 2;
  const v1 = cv + d / 2;
  // front (facing +forward): walk from right to left when seen from outside
  wall(gb, b, F_, u1, v1, u0, v1, y0, y1, layer, bay, floorH, attrs, 0, vOff);
  wall(gb, b, F_, u0, v0, u1, v0, y0, y1, layer, bay, floorH, attrs, 0.5, vOff);
  wall(gb, b, F_, u1, v0, u1, v1, y0, y1, layer, bay, floorH, attrs, 0.25, vOff);
  wall(gb, b, F_, u0, v1, u0, v0, y0, y1, layer, bay, floorH, attrs, 0.75, vOff);
}

export function flatTop(gb, b, F_, cu, cv, w, d, y, layer, attrs, scale = 4) {
  const p0 = at(b, F_, cu + w / 2, y, cv - d / 2);
  const p1 = at(b, F_, cu - w / 2, y, cv - d / 2);
  const p2 = at(b, F_, cu - w / 2, y, cv + d / 2);
  const p3 = at(b, F_, cu + w / 2, y, cv + d / 2);
  gb.face(p0, p3, p2, p1, [0, 0, 0, d / scale, w / scale, d / scale, w / scale, 0], { ...attrs, aLayer: layer });
}

export function localBox(gb, b, F_, cu, cy, cv, w, h, d, layer, attrs, uvScale = 0.25) {
  const [x, , z] = at(b, F_, cu, 0, cv);
  gb.box(x, cy, z, w, h, d, b.heading, { ...attrs, aLayer: layer }, uvScale);
}

// Gable roof along the "u" axis (ridge parallel to the wide side) or along "v".
export function gableRoof(gb, b, F_, cu, cv, w, d, y, rise, roofLayer, gableLayer, attrs, alongU = true, overhang = 0.5) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const A = (u, yy, v) => at(b, F_, cu + u, yy, cv + v);
  if (alongU) {
    const top = y + rise;
    // slopes
    gb.face(A(hw, y - 0.15, hd), A(-hw, y - 0.15, hd), A(-hw, top, 0), A(hw, top, 0), [0, 0, w / 3, 0, w / 3, hd / 3, 0, hd / 3], { ...attrs, aLayer: roofLayer });
    gb.face(A(-hw, y - 0.15, -hd), A(hw, y - 0.15, -hd), A(hw, top, 0), A(-hw, top, 0), [0, 0, w / 3, 0, w / 3, hd / 3, 0, hd / 3], { ...attrs, aLayer: roofLayer });
    // gable triangles (as degenerate quads)
    triangle(gb, A(w / 2, y, -d / 2), A(w / 2, y, d / 2), A(w / 2, top, 0), gableLayer, attrs, d);
    triangle(gb, A(-w / 2, y, d / 2), A(-w / 2, y, -d / 2), A(-w / 2, top, 0), gableLayer, attrs, d);
  } else {
    const top = y + rise;
    gb.face(A(hw, y - 0.15, -hd), A(hw, y - 0.15, hd), A(0, top, hd), A(0, top, -hd), [0, 0, d / 3, 0, d / 3, hw / 3, 0, hw / 3], { ...attrs, aLayer: roofLayer });
    gb.face(A(-hw, y - 0.15, hd), A(-hw, y - 0.15, -hd), A(0, top, -hd), A(0, top, hd), [0, 0, d / 3, 0, d / 3, hw / 3, 0, hw / 3], { ...attrs, aLayer: roofLayer });
    triangle(gb, A(w / 2, y, d / 2), A(-w / 2, y, d / 2), A(0, top, d / 2), gableLayer, attrs, w);
    triangle(gb, A(-w / 2, y, -d / 2), A(w / 2, y, -d / 2), A(0, top, -d / 2), gableLayer, attrs, w);
  }
}

// Hip roof: four slopes rising to a short ridge.
export function hipRoof(gb, b, F_, cu, cv, w, d, y, rise, roofLayer, attrs, overhang = 0.45) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const ridge = Math.max(0, hw - hd);
  const top = y + rise;
  const A = (u, yy, v) => at(b, F_, cu + u, yy, cv + v);
  const y0 = y - 0.12;
  const uvA = [0, 0, w / 3, 0, w / 3, d / 6, 0, d / 6];
  gb.face(A(hw, y0, hd), A(-hw, y0, hd), A(-ridge, top, 0), A(ridge, top, 0), uvA, { ...attrs, aLayer: roofLayer });
  gb.face(A(-hw, y0, -hd), A(hw, y0, -hd), A(ridge, top, 0), A(-ridge, top, 0), uvA, { ...attrs, aLayer: roofLayer });
  triangle(gb, A(hw, y0, -hd), A(hw, y0, hd), A(ridge, top, 0), roofLayer, attrs, d);
  triangle(gb, A(-hw, y0, hd), A(-hw, y0, -hd), A(-ridge, top, 0), roofLayer, attrs, d);
  // soffit
  gb.face(A(hw, y0, -hd), A(-hw, y0, -hd), A(-hw, y0, hd), A(hw, y0, hd), [0, 0, 1, 0, 1, 1, 0, 1], { ...attrs, aLayer: F.concrete });
}

export function triangle(gb, p0, p1, p2, layer, attrs, base) {
  const ux = p1[0] - p0[0];
  const uy = p1[1] - p0[1];
  const uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0];
  const vy = p2[1] - p0[1];
  const vz = p2[2] - p0[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const a = { ...attrs, aLayer: layer };
  const h = p2[1] - p0[1];
  const i0 = gb.vertex(p0[0], p0[1], p0[2], nx, ny, nz, 0, 0, a);
  const i1 = gb.vertex(p1[0], p1[1], p1[2], nx, ny, nz, base / 3.2, 0, a);
  const i2 = gb.vertex(p2[0], p2[1], p2[2], nx, ny, nz, base / 6.4, h / 2.9, a);
  gb.tri(i0, i1, i2);
}

// Parapet around a flat roof.
export function parapet(gb, b, F_, cu, cv, w, d, y, h, layer, attrs) {
  const t = 0.3;
  localBox(gb, b, F_, cu, y + h / 2, cv + d / 2 - t / 2, w, h, t, layer, attrs);
  localBox(gb, b, F_, cu, y + h / 2, cv - d / 2 + t / 2, w, h, t, layer, attrs);
  localBox(gb, b, F_, cu + w / 2 - t / 2, y + h / 2, cv, t, h, d - t * 2, layer, attrs);
  localBox(gb, b, F_, cu - w / 2 + t / 2, y + h / 2, cv, t, h, d - t * 2, layer, attrs);
}

// Vertical cylinder in building-local coordinates.
export function localCylinder(gb, b, F_, cu, cv, y, r0, r1, h, n, layer, attrs, cap = true) {
  const [x, , z] = at(b, F_, cu, 0, cv);
  gb.cylinder(x, y, z, r0, r1, h, n, { ...attrs, aLayer: layer }, cap, (2 * Math.PI * Math.max(r0, r1)) / 3.2);
}

// Onion-free spire/cone for towers.
export function localCone(gb, b, F_, cu, cv, y, r, h, n, layer, attrs) {
  localCylinder(gb, b, F_, cu, cv, y, r, 0.001, h, n, layer, attrs, false);
}

// Four-sided pyramid (tent roof) on a square base.
export function tentRoof(gb, b, F_, cu, cv, size, y, h, layer, attrs) {
  const s = size / 2;
  const A = (u, yy, v) => at(b, F_, cu + u, yy, cv + v);
  const apex = A(0, y + h, 0);
  triangle(gb, A(s, y, s), A(-s, y, s), apex, layer, attrs, size);
  triangle(gb, A(-s, y, -s), A(s, y, -s), apex, layer, attrs, size);
  triangle(gb, A(s, y, -s), A(s, y, s), apex, layer, attrs, size);
  triangle(gb, A(-s, y, s), A(-s, y, -s), apex, layer, attrs, size);
}

export function crenellations(gb, b, F_, u0, v0, u1, v1, y, attrs, layer = F.kremlinBrick, tooth = 1.0, gap = 0.9, h = 1.6, t = 0.9) {
  const len = Math.hypot(u1 - u0, v1 - v0);
  const n = Math.floor(len / (tooth + gap));
  const du = (u1 - u0) / len;
  const dv = (v1 - v0) / len;
  const heading = b.heading - Math.atan2(du, dv) + Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * (tooth + gap);
    const [x, , z] = at(b, F_, u0 + du * s, 0, v0 + dv * s);
    gb.box(x, y + h / 2, z, tooth, h, t, heading, { ...attrs, aLayer: layer }, 0.3);
  }
}
