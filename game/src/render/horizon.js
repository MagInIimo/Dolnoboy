import * as THREE from 'three';
import { WATER_LEVEL, unproject } from '../core/geo.js';
import { dryness, forestDensity } from '../world/relief.js';
import { fbm, smoothstep } from '../core/util.js';

// Low-detail land from the edge of the streamed chunks out to the horizon: one polar grid,
// rebuilt around the camera every few hundred metres. Uses the terrain material (same blend attributes).
const SEGMENTS = 144;
const RINGS = 26;

export class Horizon {
  constructor(engine, world, surfaces, innerRadius) {
    this.engine = engine;
    this.world = world;
    this.inner = innerRadius - 120;
    this.outer = 9000;
    this.center = new THREE.Vector2(Infinity, Infinity);
    const n = SEGMENTS * RINGS;
    this.pos = new Float32Array(n * 3);
    this.blend = new Float32Array(n * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aBlend', new THREE.BufferAttribute(this.blend, 4));
    const idx = [];
    for (let r = 0; r < RINGS - 1; r++) {
      for (let s = 0; s < SEGMENTS; s++) {
        const a = r * SEGMENTS + s;
        const b = r * SEGMENTS + ((s + 1) % SEGMENTS);
        const c = a + SEGMENTS;
        const d = b + SEGMENTS;
        idx.push(a, c, b, b, c, d);
      }
    }
    g.setIndex(idx);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, surfaces.terrain);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = -1;
    engine.scene.add(this.mesh);
    this.job = null;
  }

  ringRadius(r) {
    return this.inner * Math.pow(this.outer / this.inner, r / (RINGS - 1));
  }

  // Rebuilds incrementally (a few rings per call) once the camera has moved far enough.
  update(focus, budgetRings = 3) {
    if (!this.job && Math.hypot(focus.x - this.center.x, focus.z - this.center.y) > 600) {
      this.job = { cx: Math.round(focus.x / 50) * 50, cz: Math.round(focus.z / 50) * 50, ring: 0, pos: new Float32Array(this.pos.length), blend: new Float32Array(this.blend.length) };
    }
    const job = this.job;
    if (!job) return;
    const { lat, lon } = unproject(job.cx, job.cz);
    for (let k = 0; k < budgetRings && job.ring < RINGS; k++, job.ring++) {
      const r = job.ring;
      const rad = this.ringRadius(r);
      for (let s = 0; s < SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const x = job.cx + Math.sin(a) * rad;
        const z = job.cz + Math.cos(a) * rad;
        let h = this.world.baseHeight(x, z);
        // the innermost ring hides under the streamed terrain
        if (r === 0) h -= 6;
        else if (r === 1) h -= 2;
        const i = r * SEGMENTS + s;
        job.pos[i * 3] = x;
        job.pos[i * 3 + 1] = h;
        job.pos[i * 3 + 2] = z;
        const forest = forestDensity(x, z, lat, lon);
        const field = (1 - smoothstep(0.35, 0.5, forest)) * smoothstep(-0.15, 0.1, fbm(x / 1500 + 7.1, z / 1500 - 3.4, 2));
        job.blend[i * 4] = dryness(x, z, lat);
        job.blend[i * 4 + 1] = field;
        job.blend[i * 4 + 2] = 1 - smoothstep(WATER_LEVEL + 0.7, WATER_LEVEL + 1.6, h);
        // distant forests read as a dark, slightly raised canopy
        job.blend[i * 4 + 3] = smoothstep(0.42, 0.62, forest) * 0.95;
        if (forest > 0.5 && h > WATER_LEVEL + 1) job.pos[i * 3 + 1] += 9 * smoothstep(0.5, 0.7, forest);
      }
    }
    if (job.ring < RINGS) return;
    this.pos.set(job.pos);
    this.blend.set(job.blend);
    this.center.set(job.cx, job.cz);
    this.job = null;
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aBlend.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
}
