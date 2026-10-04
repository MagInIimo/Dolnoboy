import * as THREE from 'three';
import { carModels, vehicleMaterial } from '../traffic/car-models.js';
import { PARKED_KINDS } from '../world/yards.js';

// Cars parked in courtyards: the traffic models (body plus wheels merged once per kind) drawn as instances,
// detailed near the camera and simplified further out. WorldView extra: picks up chunk.parked from the
// building layer.

function mergeGeometries(parts) {
  let count = 0;
  let icount = 0;
  for (const [g] of parts) {
    count += g.attributes.position.count;
    icount += g.index.count;
  }
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const mat = new Float32Array(count * 4);
  const idx = new Uint32Array(icount);
  const v = new THREE.Vector3();
  let base = 0;
  let ib = 0;
  for (const [g, m] of parts) {
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos.set([v.x, v.y, v.z], (base + i) * 3);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nrm.set([v.x, v.y, v.z], (base + i) * 3);
    }
    col.set(g.attributes.color.array, base * 3);
    mat.set(g.attributes.aMat.array, base * 4);
    // parked cars keep their lamps dark
    for (let i = 0; i < P.count; i++) mat[(base + i) * 4 + 3] = 0;
    for (let i = 0; i < g.index.count; i++) idx[ib++] = g.index.getX(i) + base;
    base += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
  geo.setIndex(new THREE.BufferAttribute(count > 65535 ? idx : new Uint16Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

export class ParkedCars {
  constructor(engine, quality) {
    this.name = 'parked';
    this.engine = engine;
    this.chunks = new Map();
    this.nearR = quality.shadows === 0 ? 30 : 45;
    this.farR = quality.shadows === 0 ? 100 : quality.trees >= 1 ? 190 : 150;
    this.timer = 0;
    this.dirty = true;
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this.meshes = [];
    const models = carModels();
    if (!models) return;
    this.material = vehicleMaterial(quality.shadows > 0);
    const make = (geo, n, cast) => {
      const m = new THREE.InstancedMesh(geo, this.material, n);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      geo.setAttribute('aLamp', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      geo.setAttribute('aBeacon', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = cast;
      m.receiveShadow = true;
      engine.scene.add(m);
      return m;
    };
    for (const kind of PARKED_KINDS) {
      const src = models.kinds[kind];
      if (!src?.hi || !src?.lo) {
        this.meshes.push(null);
        continue;
      }
      const spec = src.spec;
      const W = models.wheels[spec.wheel];
      const parts = [[src.hi, new THREE.Matrix4()]];
      if (W) {
        for (const [x, y, z, , width] of spec.wheels) {
          const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), x > 0 ? 0 : Math.PI), new THREE.Vector3(width ? width / W.spec.w : 1, 1, 1));
          parts.push([W.geo, m]);
        }
      }
      this.meshes.push({ hi: make(mergeGeometries(parts), 60, quality.shadows > 0), lo: make(src.lo, 160, false) });
    }
  }

  *build(chunk) {
    const list = chunk.parked ?? [];
    this.chunks.set(chunk.key, list);
    this.dirty = true;
    return { list };
  }

  dispose(chunk) {
    this.chunks.delete(chunk.key);
    this.dirty = true;
  }

  update(dt, camPos) {
    if (!this.meshes.length) return;
    this.timer -= dt;
    const moved = this.last.distanceToSquared(camPos) > 9;
    if (!this.dirty && !(moved && this.timer <= 0)) return;
    this.timer = 0.25;
    this.dirty = false;
    this.last.copy(camPos);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const n2 = this.nearR * this.nearR;
    const f2 = this.farR * this.farR;
    const counts = this.meshes.map(() => ({ hi: 0, lo: 0 }));
    for (const list of this.chunks.values()) {
      for (const c of list) {
        const M = this.meshes[c.kind];
        if (!M) continue;
        const dx = c.x - camPos.x;
        const dz = c.z - camPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > f2) continue;
        const C = counts[c.kind];
        const hi = d2 < n2 && C.hi < M.hi.instanceMatrix.count;
        const mesh = hi ? M.hi : M.lo;
        const i = hi ? C.hi++ : C.lo++;
        if (i >= mesh.instanceMatrix.count) continue;
        q.setFromAxisAngle(up, c.heading);
        p.set(c.x, c.y, c.z);
        m.compose(p, q, one);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.setHex(c.color));
      }
    }
    this.meshes.forEach((M, k) => {
      if (!M) return;
      for (const [mesh, n] of [[M.hi, counts[k].hi], [M.lo, Math.min(counts[k].lo, M.lo.instanceMatrix.count)]]) {
        mesh.count = n;
        mesh.visible = n > 0;
        if (n) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.instanceColor.needsUpdate = true;
        }
      }
    });
  }
}
