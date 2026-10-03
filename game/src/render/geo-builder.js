import * as THREE from 'three';

// Growable vertex buffer for merged procedural geometry.
export class GeoBuilder {
  constructor(extra = {}) {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
    this.extra = {};
    for (const [name, size] of Object.entries(extra)) this.extra[name] = { size, data: [] };
    this.count = 0;
    this.ox = 0;
    this.oy = 0;
    this.oz = 0;
  }

  setOrigin(x, y, z) {
    this.ox = x;
    this.oy = y;
    this.oz = z;
  }

  vertex(x, y, z, nx, ny, nz, u, v, attrs) {
    this.pos.push(x - this.ox, y - this.oy, z - this.oz);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    for (const [name, buf] of Object.entries(this.extra)) {
      const val = attrs?.[name] ?? 0;
      if (buf.size === 1) buf.data.push(val);
      else for (let i = 0; i < buf.size; i++) buf.data.push(val[i] ?? 0);
    }
    return this.count++;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.idx.push(a, b, c, a, c, d);
  }

  // Flat quad from 4 corner points (counter-clockwise when seen from the normal side).
  face(p0, p1, p2, p3, uvs, attrs) {
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p3[0] - p0[0];
    const vy = p3[1] - p0[1];
    const vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const t = uvs ?? [0, 0, 1, 0, 1, 1, 0, 1];
    const a = this.vertex(p0[0], p0[1], p0[2], nx, ny, nz, t[0], t[1], attrs);
    const b = this.vertex(p1[0], p1[1], p1[2], nx, ny, nz, t[2], t[3], attrs);
    const c = this.vertex(p2[0], p2[1], p2[2], nx, ny, nz, t[4], t[5], attrs);
    const d = this.vertex(p3[0], p3[1], p3[2], nx, ny, nz, t[6], t[7], attrs);
    this.idx.push(a, b, c, a, c, d);
  }

  // Axis-aligned-in-local-frame box: centre (cx,cy,cz), size (w along right, h, d along forward), heading.
  box(cx, cy, cz, w, h, d, heading, attrs, uvScale = 1, faces = 63) {
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    const fx = s;
    const fz = c;
    const rx = -c;
    const rz = s;
    const P = (u, v, k) => [cx + rx * u * w * 0.5 + fx * k * d * 0.5, cy + v * h * 0.5, cz + rz * u * w * 0.5 + fz * k * d * 0.5];
    const U = uvScale;
    const sideUV = (a, b) => [0, 0, a * U, 0, a * U, b * U, 0, b * U];
    // +forward face
    if (faces & 1) this.face(P(1, -1, 1), P(-1, -1, 1), P(-1, 1, 1), P(1, 1, 1), sideUV(w, h), attrs);
    // -forward
    if (faces & 2) this.face(P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), sideUV(w, h), attrs);
    // +right
    if (faces & 4) this.face(P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), sideUV(d, h), attrs);
    // -right
    if (faces & 8) this.face(P(-1, -1, 1), P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), sideUV(d, h), attrs);
    // top
    if (faces & 16) this.face(P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), sideUV(w, d), attrs);
    // bottom
    if (faces & 32) this.face(P(-1, -1, 1), P(1, -1, 1), P(1, -1, -1), P(-1, -1, -1), sideUV(w, d), attrs);
  }

  // Vertical cylinder (open or capped), radial segments n.
  cylinder(cx, cy, cz, r0, r1, h, n, attrs, cap = true, uScale = 1) {
    const base = this.count;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const slope = (r0 - r1) / h;
      const l = Math.hypot(1, slope);
      this.vertex(cx + s * r0, cy, cz + c * r0, s / l, slope / l, c / l, (i / n) * uScale, 0, attrs);
      this.vertex(cx + s * r1, cy + h, cz + c * r1, s / l, slope / l, c / l, (i / n) * uScale, h, attrs);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    if (cap && r1 > 0) {
      const center = this.vertex(cx, cy + h, cz, 0, 1, 0, 0.5, 0.5, attrs);
      const ring = this.count;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.vertex(cx + Math.sin(a) * r1, cy + h, cz + Math.cos(a) * r1, 0, 1, 0, 0.5 + Math.sin(a) * 0.5, 0.5 + Math.cos(a) * 0.5, attrs);
      }
      for (let i = 0; i < n; i++) this.idx.push(center, ring + i, ring + i + 1);
    }
  }

  // Appends another builder's content transformed by matrix (THREE.Matrix4).
  append(other, matrix = null) {
    const base = this.count;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    for (let i = 0; i < other.count; i++) {
      v.set(other.pos[i * 3] + other.ox, other.pos[i * 3 + 1] + other.oy, other.pos[i * 3 + 2] + other.oz);
      n.set(other.nrm[i * 3], other.nrm[i * 3 + 1], other.nrm[i * 3 + 2]);
      if (matrix) {
        v.applyMatrix4(matrix);
        n.applyMatrix3(nm).normalize();
      }
      this.pos.push(v.x - this.ox, v.y - this.oy, v.z - this.oz);
      this.nrm.push(n.x, n.y, n.z);
      this.uv.push(other.uv[i * 2], other.uv[i * 2 + 1]);
      for (const [name, buf] of Object.entries(this.extra)) {
        const src = other.extra[name];
        for (let k = 0; k < buf.size; k++) buf.data.push(src ? src.data[i * buf.size + k] : 0);
      }
      this.count++;
    }
    for (const i of other.idx) this.idx.push(i + base);
  }

  build() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    for (const [name, buf] of Object.entries(this.extra)) g.setAttribute(name, new THREE.Float32BufferAttribute(buf.data, buf.size));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
