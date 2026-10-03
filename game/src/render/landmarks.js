import { F } from './facades.js';
import { L as SL } from './surfaces.js';
import { WATER_LEVEL } from '../core/geo.js';
import { hashString, rng } from '../core/util.js';
import { landmarkModel } from './landmark-models.js';

const ONE = [1, 1, 1];

// Local placement helper: origin (x, y, z), heading; u = right, v = forward.
class Local {
  constructor(gb, x, y, z, heading, seed = 1) {
    this.gb = gb;
    this.x = x;
    this.y = y;
    this.z = z;
    this.h = heading;
    this.fx = Math.sin(heading);
    this.fz = Math.cos(heading);
    this.seed = seed;
  }
  p(u, v) {
    return [this.x - this.fz * u + this.fx * v, this.z + this.fx * u + this.fz * v];
  }
  attrs(layer, tint = ONE) {
    return { aLayer: layer, aSeed: this.seed, aTint: tint };
  }
  box(u, y, v, w, h, d, layer, tint = ONE, rot = 0, uvScale = 0.25) {
    const [x, z] = this.p(u, v);
    this.gb.box(x, this.y + y + h / 2, z, w, h, d, this.h + rot, this.attrs(layer, tint), uvScale);
  }
  cyl(u, v, y, r0, r1, h, n, layer, tint = ONE, cap = true) {
    const [x, z] = this.p(u, v);
    this.gb.cylinder(x, this.y + y, z, r0, r1, h, n, this.attrs(layer, tint), cap, (2 * Math.PI * Math.max(r0, r1)) / 4);
  }
  cone(u, v, y, r, h, n, layer, tint = ONE) {
    this.cyl(u, v, y, r, 0.01, h, n, layer, tint, false);
  }
  // Surface of revolution from [radius, height] pairs.
  lathe(u, v, y, profile, n, layer, tint = ONE) {
    const [cx, cz] = this.p(u, v);
    const gb = this.gb;
    const base = gb.count;
    for (let i = 0; i < profile.length; i++) {
      const [r, py] = profile[i];
      const prev = profile[Math.max(0, i - 1)];
      const next = profile[Math.min(profile.length - 1, i + 1)];
      const dr = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const l = Math.hypot(dr, dy) || 1;
      const nr = dy / l;
      const ny = -dr / l;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const s = Math.sin(a);
        const c = Math.cos(a);
        gb.vertex(cx + s * r, this.y + y + py, cz + c * r, s * nr, ny, c * nr, (k / n) * Math.max(1, (r * 6.28) / 6), py / 3, this.attrs(layer, tint));
      }
    }
    for (let i = 0; i < profile.length - 1; i++) {
      for (let k = 0; k < n; k++) {
        const a = base + i * (n + 1) + k;
        const b = a + n + 1;
        gb.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  tent(u, v, y, size, h, layer, tint = ONE) {
    const s = size / 2;
    const P = (uu, vv, yy) => {
      const [x, z] = this.p(u + uu, v + vv);
      return [x, this.y + y + yy, z];
    };
    const apex = P(0, 0, h);
    const tri = (a, b) => {
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = apex[0] - a[0];
      const vy = apex[1] - a[1];
      const vz = apex[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      const at = this.attrs(layer, tint);
      const i0 = this.gb.vertex(a[0], a[1], a[2], nx / l, ny / l, nz / l, 0, 0, at);
      const i1 = this.gb.vertex(b[0], b[1], b[2], nx / l, ny / l, nz / l, size / 3, 0, at);
      const i2 = this.gb.vertex(apex[0], apex[1], apex[2], nx / l, ny / l, nz / l, size / 6, h / 3, at);
      this.gb.tri(i0, i1, i2);
    };
    tri(P(s, s, 0), P(-s, s, 0));
    tri(P(-s, -s, 0), P(s, -s, 0));
    tri(P(s, -s, 0), P(s, s, 0));
    tri(P(-s, s, 0), P(-s, -s, 0));
  }
  // Wall between two local points with swallowtail merlons on top.
  wall(u0, v0, u1, v1, y, h, t, layer, merlon = true, tint = ONE) {
    const len = Math.hypot(u1 - u0, v1 - v0);
    const rot = -Math.atan2(u1 - u0, v1 - v0) + Math.PI / 2;
    this.box((u0 + u1) / 2, y, (v0 + v1) / 2, len, h, t, layer, tint, rot);
    if (!merlon) return;
    const n = Math.floor(len / 2.4);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      this.box(u0 + (u1 - u0) * k, y + h, v0 + (v1 - v0) * k, 1.2, 1.7, t * 0.75, layer, tint, rot);
    }
  }
}

function tower(L, u, v, y, size, h, layer, roofLayer, roofH, tint = ONE) {
  L.box(u, y, v, size, h, size, layer, tint);
  L.box(u, y + h, v, size + 0.8, 0.8, size + 0.8, layer, tint);
  L.tent(u, v, y + h + 0.8, size + 0.6, roofH, roofLayer);
}

// --- builders -----------------------------------------------------------------
const BUILD = {
  kremlin(L, city) {
    // triangular red brick citadel with tented towers and a tall gate tower
    const pts = [[0, 62], [-56, -34], [56, -34]];
    const g = F.kremlinBrick;
    const roof = F.roofTin;
    for (let i = 0; i < 3; i++) {
      const [u0, v0] = pts[i];
      const [u1, v1] = pts[(i + 1) % 3];
      L.wall(u0, v0, u1, v1, 0, 11, 3.2, g);
      const n = 3;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        tower(L, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, 0, 7, 17, g, roof, 9, ONE);
      }
      // round corner tower
      L.cyl(u0, v0, 0, 6.5, 6, 20, 16, g);
      L.cyl(u0, v0, 20, 6.8, 6.8, 1, 16, g);
      L.cone(u0, v0, 21, 6.6, 12, 16, roof);
    }
    // main gate tower in the middle of the eastern wall: tiered with clock and slender tent
    const [ga, gb] = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2];
    L.box(ga, 0, gb, 11, 26, 11, g);
    L.box(ga, 26, gb, 12, 1.2, 12, F.whiteStone);
    L.box(ga, 27.2, gb, 9, 9, 9, g);
    L.box(ga + 4.6, 29, gb, 0.2, 4, 4, F.whiteStone, [0.95, 0.95, 0.9]);
    L.box(ga, 36.2, gb, 7.5, 6, 7.5, F.whiteStone);
    L.cyl(ga, gb, 42.2, 3.5, 3.0, 5, 8, g);
    L.cone(ga, gb, 47.2, 3.3, 15, 8, F.roofTin);
    L.cyl(ga, gb, 62.2, 0.25, 0.25, 4, 6, F.gold);
    L.lathe(ga, gb, 66, [[0.01, 0], [1.1, 0.6], [1.2, 1.2], [0.8, 2], [0.01, 2.6]], 10, F.gold);
    // palace inside
    L.box(0, 0, -12, 46, 16, 18, F.stalinkaYellow, [1.05, 1.0, 0.85]);
    L.box(0, 16, -12, 47, 1, 19, F.plasterWhite);
    L.box(0, 17, -12, 46, 3, 18, F.roofTin);
    // long red museum building with tented towers north of the square
    L.box(80, 0, 48, 34, 18, 16, g);
    for (const du of [-12, 12]) tower(L, 80 + du, 48, 18, 6, 10, g, F.roofTin, 10);
    void city;
  },
  kremlinSmall(L) {
    const g = F.kremlinBrick;
    const r = 44;
    const n = 7;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      pts.push([Math.sin(a) * r * (i % 2 ? 1 : 0.88), Math.cos(a) * r]);
    }
    for (let i = 0; i < n; i++) {
      const [u0, v0] = pts[i];
      const [u1, v1] = pts[(i + 1) % n];
      L.wall(u0, v0, u1, v1, 0, 9, 2.8, g);
      if (i % 2) tower(L, u0, v0, 0, 7, 14, g, F.roofTin, 8);
      else {
        L.cyl(u0, v0, 0, 5.5, 5, 15, 14, g);
        L.cone(u0, v0, 15, 5.8, 9, 14, F.roofTin);
      }
    }
    tower(L, 0, -r, 0, 9, 20, g, F.roofTin, 11);
  },
  stoneFortress(L) {
    const g = F.whiteStone;
    const pts = [[-40, 30], [10, 46], [44, 10], [30, -36], [-30, -40], [-48, -6]];
    for (let i = 0; i < pts.length; i++) {
      const [u0, v0] = pts[i];
      const [u1, v1] = pts[(i + 1) % pts.length];
      L.wall(u0, v0, u1, v1, 0, 10, 4, g, false, [0.85, 0.84, 0.8]);
      L.cyl(u0, v0, 0, 6, 5.5, 16, 14, g, [0.85, 0.84, 0.8]);
      L.cone(u0, v0, 16, 6.4, 9, 14, F.woodFence);
    }
  },
  fortressWall(L) {
    const g = F.kremlinBrick;
    let pu = -90;
    let pv = -20;
    for (let i = 0; i < 6; i++) {
      const nu = pu + 34;
      const nv = pv + Math.sin(i * 0.9) * 12;
      L.wall(pu, pv, nu, nv, 0, 13, 4, g);
      if (i % 2) tower(L, pu, pv, 0, 9, 20, g, F.roofTinRed, 9);
      else {
        L.cyl(pu, pv, 0, 6, 5.5, 21, 16, g);
        L.cone(pu, pv, 21, 6.2, 9, 16, F.roofTinRed);
      }
      pu = nu;
      pv = nv;
    }
    tower(L, pu, pv, 0, 9, 20, g, F.roofTinRed, 9);
  },
  kazanKremlin(L) {
    const g = F.whiteStone;
    const pts = [[-30, 58], [26, 52], [46, 6], [30, -48], [-24, -52], [-48, 0]];
    for (let i = 0; i < pts.length; i++) {
      const [u0, v0] = pts[i];
      const [u1, v1] = pts[(i + 1) % pts.length];
      L.wall(u0, v0, u1, v1, 0, 9, 3.2, g, true, [1, 1, 0.97]);
      L.cyl(u0, v0, 0, 5.8, 5.4, 15, 14, g);
      L.cone(u0, v0, 15, 6, 10, 14, F.roofTin);
    }
    // gate tower: white stone tiers, blue-green tent
    L.box(-48, 0, 0, 10, 20, 10, g);
    L.box(-48, 20, 0, 8, 8, 8, g);
    L.cyl(-48, 0, 28, 3.6, 3.6, 5, 8, g);
    L.cone(-48, 0, 33, 3.8, 14, 8, F.roofTin, [0.6, 0.9, 1.0]);
    // leaning tiered red brick tower (seven tiers tapering to a green spire)
    const su = 8;
    const sv = 6;
    const tiers = [[12, 9], [10, 8], [8.4, 7], [7, 6], [5.6, 5], [4.6, 5]];
    let y = 0;
    for (const [w, h] of tiers) {
      L.box(su, y, sv, w, h, w, F.redBrick);
      L.box(su, y + h, sv, w + 0.6, 0.6, w + 0.6, F.whiteStone);
      y += h + 0.6;
    }
    L.cyl(su, sv, y, 2.0, 2.0, 4, 8, F.redBrick);
    L.cone(su, sv, y + 4, 2.4, 14, 8, F.roofTin);
    // governor's palace
    L.box(-6, 0, -26, 38, 14, 14, F.plasterWhite, [1.0, 0.97, 0.88]);
    L.box(-6, 14, -26, 39, 3, 15, F.roofTin);
  },
  whiteKremlin(L) {
    BUILD.kazanKremlin(L);
  },
  familyCenter(L) {
    // "the bowl": stem plus a wide shallow bowl with glazed rim
    L.lathe(0, 0, 0, [[9, 0], [6.5, 6], [5.5, 18], [6, 26], [16, 34], [28, 40], [30, 44], [29.6, 45]], 32, F.stadium, [1, 1, 1]);
    L.lathe(0, 0, 40, [[28.2, 0], [30.1, 4], [29.8, 6]], 32, F.glassBlue);
    L.cyl(0, 0, 45, 29.6, 29.6, 0.4, 32, F.roofFlat);
  },
  ostankino(L) {
    // tapering concrete TV tower on ten legs with a pod and red-white mast
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      L.box(Math.sin(a) * 12, 0, Math.cos(a) * 12, 3, 30, 3, F.concrete, [1.08, 1.08, 1.08], a, 0.2);
    }
    L.lathe(0, 0, 0, [[14, 0], [12, 20], [8, 50], [5.8, 100], [4.6, 150], [4.0, 196]], 20, F.concrete, [1.08, 1.08, 1.08]);
    L.lathe(0, 0, 196, [[4.0, 0], [9, 2], [9.4, 9], [8.6, 12], [4, 14]], 20, F.glassDark);
    L.cyl(0, 0, 210, 3.6, 3.0, 40, 12, F.concrete, [1.08, 1.08, 1.08]);
    L.cyl(0, 0, 250, 2.4, 1.0, 60, 8, F.tvTower);
  },
  moscowCity(L) {
    const towers = [
      [0, 0, 26, 26, 230, F.glassDark, 0],
      [34, -6, 22, 22, 200, F.glassBlue, 0.4],
      [-30, 12, 20, 24, 175, F.glassBlue, 0],
      [8, 40, 24, 20, 150, F.glassDark, 0.2],
      [-10, -40, 22, 22, 190, F.glassBlue, 0],
      [40, 34, 18, 18, 120, F.glassDark, 0],
    ];
    for (const [u, v, w, d, h, layer, twist] of towers) {
      if (twist) {
        const steps = 10;
        for (let i = 0; i < steps; i++) L.box(u, (h * i) / steps, v, w, h / steps + 0.1, d, layer, ONE, twist * i * 0.18, 0.08);
      } else {
        L.box(u, 0, v, w, h, d, layer, ONE, 0, 0.08);
        L.box(u, h, v, w * 0.6, 10, d * 0.6, layer, ONE, 0, 0.08);
      }
    }
    // bronze tapered tower
    L.lathe(-34, -24, 0, [[13, 0], [12.5, 80], [10.5, 150], [7, 205], [0.01, 220]], 4, F.glassDark, [1.4, 1.0, 0.6]);
  },
  stalinTower(L) {
    // stepped Stalinist high-rise with wings and spire
    const y0 = 0;
    L.box(0, y0, 0, 70, 30, 22, F.stalinkaPeach, [1.08, 1.04, 0.96]);
    L.box(0, y0, 0, 30, 60, 30, F.stalinkaPeach, [1.08, 1.04, 0.96]);
    L.box(0, 60, 0, 32, 1.5, 32, F.plasterWhite);
    L.box(0, 61.5, 0, 24, 30, 24, F.stalinkaPeach, [1.08, 1.04, 0.96]);
    L.box(0, 91.5, 0, 26, 1.5, 26, F.plasterWhite);
    L.box(0, 93, 0, 16, 18, 16, F.stalinkaPeach, [1.08, 1.04, 0.96]);
    L.cyl(0, 0, 111, 7, 6, 10, 8, F.plasterWhite);
    L.cone(0, 0, 121, 5, 34, 8, F.gold);
    for (const s of [-1, 1]) {
      L.box(s * 30, 30, 0, 10, 14, 12, F.stalinkaPeach, [1.08, 1.04, 0.96]);
      L.cone(s * 30, 0, 44, 4, 12, 8, F.gold);
    }
  },
  admiralty(L) {
    // long classical building with central tower and golden needle spire
    L.box(0, 0, 0, 120, 14, 18, F.stalinkaYellow, [1.12, 1.05, 0.88]);
    L.box(0, 14, 0, 121, 1.2, 19, F.plasterWhite);
    L.box(0, 15.2, 0, 120, 3, 18, F.roofTin, [0.6, 0.65, 0.6]);
    L.box(0, 0, 0, 22, 26, 22, F.stalinkaYellow, [1.12, 1.05, 0.88]);
    for (let i = 0; i < 8; i++) L.cyl(-9 + (i % 4) * 6, i < 4 ? 11.5 : -11.5, 26, 0.8, 0.8, 8, 8, F.plasterWhite);
    L.box(0, 26, 0, 20, 8, 20, F.stalinkaYellow, [1.12, 1.05, 0.88]);
    L.box(0, 34, 0, 21, 1.2, 21, F.plasterWhite);
    L.lathe(0, 0, 35, [[7, 0], [6, 4], [3.5, 7], [1.6, 8]], 12, F.gold);
    L.cone(0, 0, 43, 1.6, 38, 8, F.gold);
  },
  lakhta(L) {
    // twisting five-sided glass spire
    const steps = 26;
    const H = 300;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = 22 * (1 - t) ** 0.9 + 1.2;
      L.cyl(0, 0, t * H, r, 22 * (1 - (i + 1) / steps) ** 0.9 + 1.2, H / steps + 0.05, 5, F.glassBlue, [0.95, 1.05, 1.15], i === steps - 1);
    }
    L.cone(0, 0, H, 1.3, 30, 5, F.glassBlue);
    L.box(30, 0, 0, 40, 18, 30, F.glassBlue);
  },
  travelPalace(L) {
    classicalPalace(L, 70, 2, F.stalinkaYellow, [1.1, 1.0, 0.8]);
  },
  rotunda(L) {
    L.cyl(0, 0, 0, 9, 9, 1.4, 20, F.whiteStone);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      L.cyl(Math.sin(a) * 7.5, Math.cos(a) * 7.5, 1.4, 0.55, 0.5, 6.5, 8, F.plasterWhite);
    }
    L.cyl(0, 0, 7.9, 8.4, 8.4, 1.2, 20, F.plasterWhite);
    L.lathe(0, 0, 9.1, [[8.2, 0], [7, 2.5], [4.5, 4.4], [0.01, 5.4]], 20, F.roofTin, [0.8, 0.95, 0.85]);
  },
  aeolianHarp(L) {
    L.cyl(0, 0, 0, 6, 6, 1, 16, F.whiteStone);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      L.cyl(Math.sin(a) * 4.8, Math.cos(a) * 4.8, 1, 0.4, 0.38, 4.8, 8, F.plasterWhite);
    }
    L.cyl(0, 0, 5.8, 5.4, 5.4, 0.8, 16, F.plasterWhite);
    L.lathe(0, 0, 6.6, [[5.2, 0], [4, 1.6], [0.01, 2.8]], 16, F.plasterWhite);
  },
  fireTower(L) {
    // fire lookout: classical portico building with a tall octagonal tower and gallery
    classicalPalace(L, 30, 2, F.stalinkaYellow, [1.12, 1.02, 0.78]);
    L.cyl(0, -2, 10, 4.2, 4.0, 20, 8, F.stalinkaYellow, [1.12, 1.02, 0.78]);
    L.cyl(0, -2, 30, 5.4, 5.4, 0.6, 8, F.plasterWhite);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      L.cyl(Math.sin(a) * 4.6, -2 + Math.cos(a) * 4.6, 30.6, 0.25, 0.25, 4, 6, F.plasterWhite);
    }
    L.cyl(0, -2, 30.6, 3.0, 3.0, 4, 8, F.stalinkaYellow, [1.12, 1.02, 0.78]);
    L.cyl(0, -2, 34.6, 4.6, 4.6, 0.6, 8, F.plasterWhite);
    L.cone(0, -2, 35.2, 2.6, 8, 8, F.roofTin);
  },
  waterTower(L) {
    L.cyl(0, 0, 0, 4.6, 3.8, 24, 12, F.redBrick);
    L.lathe(0, 0, 24, [[3.8, 0], [7.5, 3], [7.5, 9], [6.8, 9.6]], 14, F.plasterWhite, [0.95, 0.92, 0.85]);
    L.cone(0, 0, 33.6, 7.2, 4, 14, F.roofTin);
  },
  brickWaterTower(L) {
    L.cyl(0, 0, 0, 6, 5, 22, 14, F.redBrick);
    L.cyl(0, 0, 22, 6.5, 6.5, 8, 14, F.redBrick);
    L.lathe(0, 0, 30, [[6.6, 0], [5, 3], [2, 6], [0.01, 8]], 14, F.roofTin);
  },
  tvTower(L, city, r) {
    const H = 150 + r() * 70;
    // four-legged lattice mast approximated by tapering legs, cross platforms and a red-white shaft
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const s0 = 9 * (1 - t0) + 1;
        const s1 = 9 * (1 - t1) + 1;
        L.box(su * (s0 + s1) / 2, H * 0.6 * t0, sv * (s0 + s1) / 2, 0.7, (H * 0.6) / steps + 0.1, 0.7, F.tvTower);
      }
    }
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const s = 9 * (1 - t) + 1;
      L.box(0, H * 0.6 * t, s, s * 2, 0.4, 0.4, F.tvTower);
      L.box(0, H * 0.6 * t, -s, s * 2, 0.4, 0.4, F.tvTower);
      L.box(s, H * 0.6 * t, 0, 0.4, 0.4, s * 2, F.tvTower);
      L.box(-s, H * 0.6 * t, 0, 0.4, 0.4, s * 2, F.tvTower);
    }
    L.box(0, H * 0.6, 0, 3, 1, 3, F.concrete);
    L.cyl(0, 0, H * 0.6, 0.9, 0.5, H * 0.4, 6, F.tvTower);
    L.box(0, 0, 0, 10, 4, 8, F.concrete);
  },
  rocketVostok(L) {
    L.box(-24, 0, 0, 30, 9, 22, F.plasterWhite, [1.05, 1.05, 1.05]);
    L.box(-24, 9, 0, 31, 1, 23, F.glassBlue);
    // rocket: core and four conical boosters
    L.cyl(10, 0, 0, 5, 5, 2, 12, F.concrete);
    L.cyl(10, 0, 2, 1.5, 1.5, 22, 12, F.plasterWhite);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      L.lathe(10 + Math.sin(a) * 2.1, Math.cos(a) * 2.1, 2, [[1.3, 0], [1.25, 8], [0.6, 14], [0.01, 15]], 10, F.plasterWhite);
    }
    L.cyl(10, 0, 24, 1.2, 1.2, 6, 12, F.plasterWhite, [0.95, 0.95, 0.95]);
    L.lathe(10, 0, 30, [[1.3, 0], [1.3, 3], [0.6, 6], [0.01, 7]], 12, F.plasterWhite);
  },
  rocketSoyuz(L) {
    // vertical Soyuz on top of a round museum pavilion
    L.cyl(0, 0, 0, 16, 16, 9, 24, F.glassBlue);
    L.cyl(0, 0, 9, 16.5, 16.5, 1.2, 24, F.plasterWhite);
    const y = 10.2;
    L.cyl(0, 0, y, 1.5, 1.5, 28, 12, F.plasterWhite, [0.93, 0.93, 0.95]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      L.lathe(Math.sin(a) * 2.2, Math.cos(a) * 2.2, y, [[1.4, 0], [1.4, 12], [0.7, 18], [0.01, 19.5]], 10, F.plasterWhite, [0.92, 0.92, 0.9]);
    }
    L.cyl(0, 0, y + 28, 1.3, 1.3, 7, 12, F.plasterWhite, [0.9, 0.9, 0.9]);
    L.lathe(0, 0, y + 35, [[1.5, 0], [1.5, 5], [1.0, 8], [0.3, 10], [0.01, 13]], 12, F.plasterWhite);
  },
  shipGoto(L) {
    // three-masted ship moored at the embankment
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const w = 9 * Math.sin(Math.PI * (0.08 + t * 0.84)) + 1;
      L.box(0, -1, -22 + t * 44, w, 6 + (i < 2 || i > 11 ? 3 : 0), 3.3, F.woodFence, [0.7, 0.55, 0.4]);
    }
    L.box(0, 5, -20, 9, 4, 6, F.woodFence, [0.8, 0.6, 0.45]);
    for (const [v, h] of [[-12, 26], [2, 30], [14, 22]]) {
      L.cyl(0, v, 5, 0.5, 0.35, h, 6, F.woodFence, [0.6, 0.45, 0.32]);
      for (let k = 1; k <= 3; k++) L.box(0, 5 + h * (0.35 + k * 0.17), v, 14 - k * 3, 0.4, 0.5, F.woodFence, [0.6, 0.45, 0.32]);
    }
    L.cyl(0, 24, 4, 0.25, 0.2, 10, 6, F.woodFence);
  },
  shipHouse(L) {
    // constructivist "ship house": long white block with ribbon windows and a rounded bow
    L.box(0, 0, 0, 70, 18, 16, F.modernResidential, [1.1, 1.1, 1.1]);
    L.cyl(35, 0, 0, 8, 8, 18, 16, F.glassBlue);
    L.box(0, 18, 0, 70, 1, 16.4, F.plasterWhite);
    L.box(-20, 19, 0, 16, 3.5, 10, F.plasterWhite);
  },
  grainExchange(L) {
    L.box(0, 0, 0, 44, 16, 22, F.redBrick);
    L.box(0, 16, 0, 45, 1, 23, F.whiteStone);
    L.box(0, 17, 0, 44, 4, 22, F.roofTin);
    L.box(16, 0, 9, 9, 34, 9, F.redBrick);
    L.box(16, 34, 9, 10, 1, 10, F.whiteStone);
    L.box(20.6, 26, 9, 0.2, 5, 5, F.plasterWhite);
    L.tent(16, 9, 35, 9.5, 12, F.roofTin);
  },
  woodenQuarter(L, city, r) {
    for (let i = 0; i < 6; i++) {
      const u = -36 + i * 14 + r() * 3;
      L.box(u, 0, 0, 11, 8, 12, i % 2 ? F.logWall : F.siding, [1, 0.95, 0.9]);
      L.tent(u, 0, 8, 12, 4.5, F.roofTin);
    }
  },
  flemishEmbankment(L, city, r) {
    const colors = [[1.1, 0.8, 0.7], [0.9, 1.0, 1.1], [1.1, 1.05, 0.8], [0.85, 1.05, 0.85], [1.1, 0.9, 0.95]];
    for (let i = 0; i < 7; i++) {
      const u = -42 + i * 12;
      const h = 12 + (i % 3) * 3;
      L.box(u, 0, 0, 11.6, h, 12, F.merchant, colors[i % colors.length]);
      // stepped gable
      for (let k = 0; k < 4; k++) L.box(u, h + k * 1.6, 5.6, 11 - k * 2.6, 1.6, 0.8, F.merchant, colors[i % colors.length]);
      L.box(u, h, -1, 11.6, 4, 10, F.roofTinRed);
    }
    tower(L, 50, 0, 0, 8, 24, F.redBrick, F.roofTin, 10);
    void r;
  },
  cableCar(L) {
    for (const v of [-30, 30]) {
      for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) L.box(su * 3, 0, v + sv * 3, 0.8, 50, 0.8, F.tvTower, ONE, 0, 0.1);
      L.box(0, 50, v, 9, 3, 9, F.concrete);
    }
  },
  happinessLetters(L) {
    L.box(0, 0, 0, 60, 1.2, 4, F.concrete);
    for (let i = 0; i < 20; i++) L.box(-28 + i * 2.95, 1.2, 0, 2.2, 3.6, 0.6, F.signRed, [1.1, 0.6, 0.55]);
  },
  ekbCity(L) {
    L.box(0, 0, 0, 30, 170, 30, F.glassBlue, ONE, 0, 0.08);
    L.box(0, 170, 0, 20, 14, 20, F.glassDark);
    L.box(44, 0, 10, 26, 190, 26, F.glassDark, ONE, 0, 0.08);
    L.cyl(44, 10, 190, 9, 3, 14, 8, F.glassDark);
    L.box(-36, 0, 20, 30, 110, 24, F.glassBlue, ONE, 0, 0.08);
    L.box(10, 0, -40, 24, 140, 24, F.modernResidential, ONE, 0, 0.08);
  },
  horseman(L) {
    L.box(0, 0, 0, 10, 8, 14, F.whiteStone, [0.75, 0.75, 0.72]);
    const bronze = [0.55, 0.45, 0.32];
    L.box(0, 8, 0, 2.4, 2.6, 7, F.concrete, bronze);
    L.box(0, 8.8, 4, 1.6, 3.6, 2.2, F.concrete, bronze, 0.0);
    L.box(0, 11.6, 5.2, 1.2, 1.4, 2.4, F.concrete, bronze);
    for (const [u, v] of [[0.8, 2.8], [-0.8, 2.8], [0.8, -2.8], [-0.8, -2.8]]) L.box(u, 8 - 2.2, v, 0.5, 2.4, 0.5, F.concrete, bronze);
    L.box(0, 10.6, -0.5, 1.4, 3.6, 1.2, F.concrete, bronze);
    L.box(0, 14.2, -0.5, 0.9, 1.0, 0.9, F.concrete, bronze);
    L.box(0.9, 12.5, 0.4, 0.3, 0.3, 2.6, F.concrete, bronze, 0.2);
  },
  borderBridge(L) {
    L.box(0, 0, 0, 5, 18, 5, F.whiteStone);
    L.lathe(0, 0, 18, [[0.01, 0], [2.2, 0.5], [3.0, 2.2], [2.2, 4.4], [0.01, 5]], 14, F.gold);
    L.box(0, 0, 0, 14, 1.2, 14, F.whiteStone);
  },
  carPlant(L) {
    L.box(0, 0, 0, 120, 16, 50, F.metalShed, [0.9, 0.95, 1.05]);
    L.box(-70, 0, 30, 24, 70, 18, F.glassBlue);
  },
  truckPlant(L) {
    L.box(0, 0, 0, 140, 18, 54, F.metalShed, [0.85, 0.95, 1.08]);
    L.box(0, 18, 0, 140, 3, 54, F.roofFlat);
    L.box(-80, 0, 28, 20, 40, 16, F.glassBlue);
  },
  steelPlant(L, city, r) {
    for (let i = 0; i < 3; i++) {
      const u = -40 + i * 30;
      L.lathe(u, 0, 0, [[9, 0], [9, 18], [7, 34], [5, 46], [3.2, 52]], 14, F.metalShed, [0.7, 0.62, 0.55]);
      L.cyl(u + 10, 6, 0, 3, 3, 40, 10, F.metalShed, [0.8, 0.7, 0.6]);
    }
    for (let i = 0; i < 4; i++) L.cyl(50 + i * 9, -20, 0, 2.6, 1.8, 70 + r() * 30, 12, F.tvTower);
    L.box(0, 0, -40, 130, 22, 30, F.factoryBrick);
  },
  arenaOrange(L) {
    stadium(L, 62, 46, 24, F.stadium, [1.2, 0.75, 0.4]);
  },
  arenaVolga(L) {
    stadium(L, 64, 48, 26, F.stadium, [1.05, 1.05, 1.08]);
  },
  arenaRostov(L) {
    stadium(L, 62, 46, 28, F.stadium, [1.0, 1.02, 1.05]);
  },
  stadiumBowl(L) {
    stadium(L, 60, 44, 30, F.glassDark, [1, 1, 1]);
  },
  planetarium(L) {
    L.cyl(0, 0, 0, 16, 16, 12, 20, F.plasterWhite);
    L.lathe(0, 0, 12, [[16.4, 0], [14, 6], [9, 11], [0.01, 13.5]], 22, F.plasterWhite, [1.05, 1.05, 1.05]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      L.cyl(Math.sin(a) * 17.5, Math.cos(a) * 17.5, 0, 0.7, 0.7, 12, 8, F.plasterWhite);
    }
  },
  conservatory(L) {
    L.box(0, 0, 0, 40, 16, 18, F.redBrick);
    for (const u of [-18, -6, 6, 18]) {
      L.box(u, 16, 8.6, 3, 8, 1, F.redBrick);
      L.cone(u, 8.6, 24, 1.6, 7, 4, F.roofTin);
    }
    L.box(0, 0, 9, 10, 26, 6, F.redBrick);
    L.cone(0, 9, 26, 4, 14, 4, F.roofTin);
    L.box(0, 16, 0, 40, 3, 18, F.roofTin);
  },
  seaTerminal(L) {
    classicalPalace(L, 60, 2, F.plasterWhite, [1.05, 1.03, 1.0]);
    L.box(0, 10, -2, 12, 14, 12, F.plasterWhite);
    L.cyl(0, -2, 24, 5, 4.5, 6, 8, F.plasterWhite);
    L.cone(0, -2, 30, 4.4, 26, 8, F.plasterWhite);
    L.cyl(0, -2, 56, 0.4, 0.1, 5, 6, F.gold);
  },
  portCranes(L, city, r) {
    for (let i = 0; i < 4; i++) {
      const u = -36 + i * 24;
      const col = r() < 0.5 ? [1.2, 0.5, 0.4] : [0.5, 0.75, 1.2];
      for (const [a, b] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) L.box(u + a, 0, b, 0.9, 14, 0.9, F.metalShed, col);
      L.box(u, 14, 0, 9, 6, 9, F.metalShed, col);
      L.box(u, 20, -4, 2, 22, 2, F.metalShed, col);
      L.box(u, 30, 10, 1.2, 1.2, 34, F.metalShed, col, 0, 0.25);
    }
    const colors = [[1.2, 0.5, 0.35], [0.4, 0.6, 1.1], [0.5, 0.9, 0.5], [1.1, 1.0, 0.5], [0.9, 0.9, 0.9]];
    for (let i = 0; i < 18; i++) L.box(-40 + (i % 6) * 13, Math.floor(i / 6) * 2.6, -22, 12.2, 2.6, 2.5, F.metalShed, colors[i % colors.length]);
  },
};

function classicalPalace(L, w, floors, layer, tint) {
  const h = floors * 4.6;
  L.box(0, 0, 0, w, h, 18, layer, tint, 0, 0.25);
  L.box(0, h, 0, w + 1, 1, 19, F.plasterWhite);
  L.box(0, h + 1, 0, w, 2.6, 18, F.roofTin, [0.65, 0.7, 0.66]);
  // portico with six columns and pediment
  for (let i = 0; i < 6; i++) L.cyl(-10 + i * 4, 11, 0, 0.75, 0.7, h, 10, F.plasterWhite);
  L.box(0, h, 11, 24, 1.2, 4, F.plasterWhite);
  for (let k = 0; k < 4; k++) L.box(0, h + 1.2 + k * 1.1, 11.5, 24 - k * 6, 1.1, 3, F.plasterWhite);
}

function stadium(L, a, b, h, layer, tint) {
  const n = 28;
  const prof = (s) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push([Math.sin(t) * a * s, Math.cos(t) * b * s]);
    }
    return pts;
  };
  const outer = prof(1);
  for (let i = 0; i < n; i++) {
    const [u0, v0] = outer[i];
    const [u1, v1] = outer[(i + 1) % n];
    L.wall(u0, v0, u1, v1, 0, h, 1.5, layer, false, tint);
  }
  const roof = prof(0.86);
  for (let i = 0; i < n; i++) {
    const [u0, v0] = roof[i];
    const [u1, v1] = roof[(i + 1) % n];
    L.wall(u0, v0, u1, v1, h - 4, 4, 14, F.stadium, false, tint);
  }
  L.box(0, 0.2, 0, a * 1.2, 0.2, b * 1.1, F.roofTin, [0.4, 0.9, 0.4]);
}

// Landmark sites: plaza objects near the centre, waterfront ones on the nearest bank, tall ones in the middle ring.
const KIND = {
  shipGoto: 'water', rotunda: 'water', flemishEmbankment: 'water', happinessLetters: 'water', portCranes: 'water', seaTerminal: 'water', cableCar: 'water',
  ostankino: 'ring', moscowCity: 'ring', stalinTower: 'ring', lakhta: 'ring', ekbCity: 'ring', tvTower: 'ring', steelPlant: 'out', truckPlant: 'out', carPlant: 'out',
  waterTower: 'ring', brickWaterTower: 'plaza', familyCenter: 'water',
};
const RADIUS = { kremlin: 140, kremlinSmall: 52, stoneFortress: 56, fortressWall: 100, kazanKremlin: 118, whiteKremlin: 64, familyCenter: 38, ostankino: 34, moscowCity: 90, stalinTower: 76, admiralty: 112, lakhta: 82, travelPalace: 40, rotunda: 12, aeolianHarp: 9, fireTower: 22, waterTower: 10, brickWaterTower: 10, tvTower: 16, rocketVostok: 34, rocketSoyuz: 30, shipGoto: 26, shipHouse: 40, grainExchange: 28, woodenQuarter: 46, flemishEmbankment: 58, cableCar: 40, happinessLetters: 34, ekbCity: 66, horseman: 12, borderBridge: 10, carPlant: 82, truckPlant: 92, steelPlant: 90, arenaOrange: 70, arenaVolga: 72, arenaRostov: 70, stadiumBowl: 68, planetarium: 22, conservatory: 30, seaTerminal: 40, portCranes: 56 };

export function landmarkSites(world, city) {
  if (city.landmarkSites) return city.landmarkSites;
  const sites = [];
  const r = rng(hashString(city.id) ^ 0x1a2b);
  const r0 = city.plan.rings[0] * city.R;
  const plazaR = r0 * 0.78;
  const plazaItems = city.landmarks.filter((id) => !KIND[id] || KIND[id] === 'plaza');
  plazaItems.forEach((id, i) => {
    const rad = RADIUS[id] ?? 30;
    const off = plazaItems.length > 1 ? Math.max(0, plazaR - rad - 4) * (i === 0 ? 0.2 : 0.9) : 0;
    const a = i * 2.4 + 0.6;
    sites.push({ id, x: city.x + Math.sin(a) * off, z: city.z + Math.cos(a) * off, heading: r() * Math.PI * 2, radius: rad });
  });
  for (const id of city.landmarks) {
    const kind = KIND[id];
    if (!kind || kind === 'plaza') continue;
    const rad = RADIUS[id] ?? 30;
    let best = null;
    for (let k = 0; k < 220 && !(best && k >= 64); k++) {
      // big monuments get a looser clearance test once the first attempts fail
      const slack = k < 64 ? 0.8 : k < 140 ? 0.6 : 0.45;
      const a = r() * Math.PI * 2;
      let d;
      if (kind === 'ring') d = city.R * (0.45 + r() * 0.35);
      else if (kind === 'out') d = city.R * (0.9 + r() * 0.15);
      else d = r0 + r() * city.R * 0.6;
      const x = city.x + Math.sin(a) * d;
      const z = city.z + Math.cos(a) * d;
      if (world.baseHeight(x, z) < WATER_LEVEL + 1.4) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + rad + 10)) continue;
      let clear = true;
      for (let s = 0; s < 8 && clear; s++) {
        const b = (s / 8) * Math.PI * 2;
        const px = x + Math.sin(b) * rad * slack;
        const pz = z + Math.cos(b) * rad * slack;
        if (world.net.query(px, pz, 2).length || world.lotAt(px, pz, 4)) clear = false;
      }
      if (world.net.query(x, z, rad * slack * 0.5).length) clear = false;
      if (!clear) continue;
      let score = 0;
      if (kind === 'water') {
        const river = world.water.riverInfo(x, z);
        const sea = world.water.seaDistance(x, z);
        const dw = Math.min(river ? Math.max(0, river.edge) : 1e9, sea === Infinity ? 1e9 : Math.max(0, sea));
        score = -dw;
      } else score = -Math.abs(d - city.R * 0.6) * 0.1 + r() * 5;
      if (!best || score > best.score) {
        let heading = r() * Math.PI * 2;
        if (kind === 'water') {
          // face the water: probe directions for the lowest ground
          let low = Infinity;
          for (let q = 0; q < 16; q++) {
            const b = (q / 16) * Math.PI * 2;
            const h = world.baseHeight(x + Math.sin(b) * (rad + 30), z + Math.cos(b) * (rad + 30));
            if (h < low) {
              low = h;
              heading = b;
            }
          }
        }
        best = { id, x, z, heading, radius: rad, score };
      }
    }
    if (best) sites.push(best);
  }
  city.landmarkSites = sites;
  return sites;
}

// Procedural landmarks go into the chunk geometry; Blender-modelled ones are returned as placements.
export function emitLandmarks(gb, world, city, yard, placements = []) {
  const sites = landmarkSites(world, city);
  const r = rng(hashString(city.id) ^ 0x9e37);
  for (const s of sites) {
    const base = world.terrainHeight(s.x, s.z);
    const y = Math.min(base, city.baseY + 1) - 0.05;
    const model = landmarkModel(s.id);
    if (model) {
      placements.push({ model, x: s.x, y, z: s.z, heading: s.heading });
      continue;
    }
    const fn = BUILD[s.id];
    if (!fn) continue;
    // a paved apron around the monument
    const rad = s.radius + 10;
    const n = 24;
    const center = yard.vertex(s.x, y + 0.08, s.z, 0, 1, 0, s.x / 4, s.z / 4, { aLayer: SL.PAVING, aTint: [1, 1, 1] });
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = s.x + Math.sin(a) * rad;
      const z = s.z + Math.cos(a) * rad;
      ring.push(yard.vertex(x, y + 0.08, z, 0, 1, 0, x / 4, z / 4, { aLayer: SL.PAVING, aTint: [1, 1, 1] }));
    }
    for (let i = 0; i < n; i++) yard.tri(center, ring[i], ring[i + 1]);
    const L = new Local(gb, s.x, y, s.z, s.heading, hashString(s.id) % 997);
    fn(L, city, r);
  }
  return placements;
}

export function landmarkColliders(world, city) {
  return landmarkSites(world, city).map((s) => ({ x: s.x, z: s.z, w: s.radius * 1.2, d: s.radius * 1.2, heading: s.heading }));
}
