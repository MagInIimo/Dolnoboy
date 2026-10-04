import { SCALE } from '../core/geo.js';

// Pre-decimated geometry for map drawing.
export class MapData {
  constructor(world) {
    this.world = world;
    this.highways = world.highways.map((hw) => {
      const e = hw.edge;
      const pts = [];
      for (let i = 0; i < e.xs.length; i += 10) pts.push([e.xs[i], e.zs[i]]);
      pts.push([e.xs[e.xs.length - 1], e.zs[e.zs.length - 1]]);
      return { pts, cls: hw.cls, ref: hw.ref, hw };
    });
    this.rivers = world.water.rivers.map((r) => ({ pts: r.pts.filter((_, i) => i % 3 === 0).map((p) => [p.x, p.z, p.w]), ru: r.ru, en: r.en }));
    this.seas = world.water.seas.map((s) => s);
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const c of world.cities) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z);
      maxZ = Math.max(maxZ, c.z);
    }
    this.bounds = { minX: minX - 3000, minZ: minZ - 3000, maxX: maxX + 3000, maxZ: maxZ + 3000 };
  }
}

const COLORS = { land: '#24302a', land2: '#2a372f', sea: '#1d3a52', river: '#2c5d82', M: '#f2b233', R: '#d9dde0', city: '#ffffff', route: '#ff5f3a', player: '#5fe0ff' };

export function drawWorldMap(ctx, w, h, view, data, opts) {
  const { cx, cz, scale } = view;
  const X = (x) => (x - cx) * scale + w / 2;
  const Z = (z) => (z - cz) * scale + h / 2;
  ctx.fillStyle = COLORS.land;
  ctx.fillRect(0, 0, w, h);
  // subtle grid of meridians for orientation
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const gridStep = 5000;
  for (let gx = Math.floor((cx - w / 2 / scale) / gridStep) * gridStep; gx < cx + w / 2 / scale; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(X(gx), 0);
    ctx.lineTo(X(gx), h);
    ctx.stroke();
  }
  for (let gz = Math.floor((cz - h / 2 / scale) / gridStep) * gridStep; gz < cz + h / 2 / scale; gz += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, Z(gz));
    ctx.lineTo(w, Z(gz));
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.sea;
  for (const s of data.seas) {
    ctx.beginPath();
    s.poly.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = COLORS.river;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of data.rivers) {
    ctx.lineWidth = Math.max(1.2, Math.min(6, r.pts[0][2] * scale * 0.9));
    ctx.beginPath();
    r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.stroke();
  }
  // city areas
  for (const c of data.world.cities) {
    ctx.fillStyle = 'rgba(210,200,170,0.13)';
    ctx.beginPath();
    ctx.arc(X(c.x), Z(c.z), Math.max(3, c.R * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  // roads: casing then fill
  for (const pass of [0, 1]) {
    for (const r of data.highways) {
      const wpx = r.cls === 'M' ? 3.4 : 2.2;
      ctx.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.55)' : r.cls === 'M' ? COLORS.M : COLORS.R;
      ctx.lineWidth = pass === 0 ? wpx + 2 : wpx;
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.stroke();
    }
  }
  // street detail when zoomed in
  if (scale > 0.12) {
    ctx.strokeStyle = 'rgba(220,224,228,0.55)';
    ctx.lineWidth = 1.2;
    for (const e of data.world.net.edges) {
      if (!e.alive || e.city < 0) continue;
      const x0 = X(e.xs[0]);
      const z0 = Z(e.zs[0]);
      if (x0 < -200 || x0 > w + 200 || z0 < -200 || z0 > h + 200) continue;
      ctx.beginPath();
      for (let i = 0; i < e.xs.length; i += 3) (i ? ctx.lineTo(X(e.xs[i]), Z(e.zs[i])) : ctx.moveTo(X(e.xs[i]), Z(e.zs[i])));
      ctx.lineTo(X(e.xs[e.xs.length - 1]), Z(e.zs[e.zs.length - 1]));
      ctx.stroke();
    }
  }
  // route
  if (opts.route) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    opts.route.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z))));
    ctx.stroke();
    ctx.strokeStyle = COLORS.route;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // markers: fuel and services when zoomed
  if (scale > 0.05 && opts.markers) {
    for (const m of opts.markers) {
      const x = X(m.x);
      const z = Z(m.z);
      if (x < -10 || x > w + 10 || z < -10 || z > h + 10) continue;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(x, z, m.r ?? 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // cities
  ctx.textAlign = 'center';
  for (const c of data.world.cities) {
    const x = X(c.x);
    const z = Z(c.z);
    if (x < -80 || x > w + 80 || z < -40 || z > h + 40) continue;
    const big = c.pop >= 900;
    const sel = opts.selected === c.index;
    ctx.fillStyle = sel ? COLORS.route : c.index === opts.jobCity ? '#ffcf5c' : '#ffffff';
    ctx.strokeStyle = '#11161a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, z, big ? 5.5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (scale > 0.0125 || big) {
      ctx.font = `${big ? 700 : 600} ${big ? 14 : 12}px 'Source Sans', Arial`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(10,14,17,0.9)';
      const name = opts.lang === 'en' ? c.en : c.ru;
      ctx.strokeText(name, x, z - 9);
      ctx.fillStyle = sel ? '#ffd6c9' : '#f2f4f5';
      ctx.fillText(name, x, z - 9);
    }
  }
  // player arrow
  if (opts.player) {
    const { x, z, yaw } = opts.player;
    const px = X(x);
    const pz = Z(z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-yaw);
    ctx.fillStyle = COLORS.player;
    ctx.strokeStyle = '#0a1014';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 11);
    ctx.lineTo(7, -7);
    ctx.lineTo(0, -3);
    ctx.lineTo(-7, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // scale bar in real kilometres
  const realPerPx = SCALE / scale;
  const niceKm = [10, 20, 50, 100, 200, 500].find((k) => (k * 1000) / realPerPx > 70) ?? 500;
  const len = (niceKm * 1000) / realPerPx;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(w - len - 28, h - 34, len + 16, 24);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w - len - 20, h - 16);
  ctx.lineTo(w - 20, h - 16);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = "600 11px 'Source Sans', Arial";
  ctx.textAlign = 'center';
  ctx.fillText(niceKm + (opts.lang === 'en' ? ' km' : ' км'), w - 20 - len / 2, h - 20);
}

// Heading-up GPS minimap around the truck.
export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.scale = 0.42;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width * dpr));
    const h = Math.max(10, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
  }

  draw(truck, route, target, speed, lots) {
    this.resize();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dpr = this.dpr;
    const want = (0.5 - Math.min(0.32, speed / 90)) * dpr;
    this.scale += (want - this.scale) * 0.05;
    const s = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#11161a');
    bg.addColorStop(1, '#1a2026');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.68;
    const yaw = truck.yaw;
    // world -> screen with heading up
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const T = (x, z) => {
      const dx = x - truck.x;
      const dz = z - truck.z;
      const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const right = dx * -cos + dz * sin;
      return [cx + right * s, cy - fwd * s];
    };
    const radius = Math.hypot(w, h) / s;
    const net = this.world.net;
    // water
    ctx.fillStyle = '#244a66';
    const step = 18 / s;
    void step;
    // roads
    const keys = net.hash.query(truck.x - radius, truck.z - radius, truck.x + radius, truck.z + radius);
    const edges = new Set();
    for (const k of keys) edges.add(Math.floor(k / 8192));
    for (const pass of [0, 1]) {
      for (const id of edges) {
        const e = net.edges[id];
        if (!e.alive) continue;
        const width = Math.max(2, e.type.pavedHalf * 2 * s);
        ctx.strokeStyle = pass === 0 ? '#090c0e' : e.type.id === 'M' ? '#d6a548' : e.type.highway ? '#9aa3aa' : e.type.local ? '#3e464d' : '#59626a';
        ctx.lineWidth = pass === 0 ? width + 2 * dpr : width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < e.xs.length; i += 2) {
          const dx = e.xs[i] - truck.x;
          const dz = e.zs[i] - truck.z;
          if (dx * dx + dz * dz > radius * radius) {
            started = false;
            continue;
          }
          const [px, py] = T(e.xs[i], e.zs[i]);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    // lots
    if (lots) {
      for (const lot of lots) {
        const [px, py] = T(lot.x, lot.z);
        if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
        ctx.fillStyle = lot.kind === 'fuel' ? '#2fbf62' : lot.kind === 'service' ? '#3d7dff' : lot.kind === 'company' ? '#6f7880' : '#a07d50';
        ctx.strokeStyle = '#0b0d0f';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(px, py, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px, py, 1.6 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // route
    if (route) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let first = true;
      for (const p of route.pts) {
        const dx = p.x - truck.x;
        const dz = p.z - truck.z;
        if (dx * dx + dz * dz > radius * radius * 1.2) {
          if (!first) break;
          continue;
        }
        const [px, py] = T(p.x, p.z);
        if (first) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        first = false;
      }
      ctx.strokeStyle = '#123e8f';
      ctx.lineWidth = 8 * dpr;
      ctx.stroke();
      ctx.strokeStyle = '#3d8bff';
      ctx.lineWidth = 5 * dpr;
      ctx.stroke();
    }
    if (target) {
      const [px, py] = T(target.x, target.z);
      const tx = Math.max(10 * dpr, Math.min(w - 10 * dpr, px));
      const ty = Math.max(10 * dpr, Math.min(h - 10 * dpr, py));
      ctx.fillStyle = '#ffcf5c';
      ctx.strokeStyle = '#1b2329';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(tx, ty, 6 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // the truck: white arrow with a blue rim, as on a navigator
    ctx.fillStyle = 'rgba(61,139,255,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, 16 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2a6fe0';
    ctx.lineWidth = 2.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11 * dpr);
    ctx.lineTo(cx + 8 * dpr, cy + 8 * dpr);
    ctx.lineTo(cx, cy + 3 * dpr);
    ctx.lineTo(cx - 8 * dpr, cy + 8 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
