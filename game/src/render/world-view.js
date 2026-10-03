import * as THREE from 'three';
import { buildTerrain } from './terrain-builder.js';
import { RoadBuilder } from './road-builder.js';

export const CHUNK = 512;

// Streams terrain, roads and scenery around the focus point with a per-frame time budget.
export class WorldView {
  constructor(engine, world, surfaces, extras = []) {
    this.engine = engine;
    this.world = world;
    this.surfaces = surfaces;
    this.roads = new RoadBuilder(world);
    this.extras = extras;
    this.chunks = new Map();
    this.queue = [];
    this.active = null;
    this.group = new THREE.Group();
    this.group.name = 'world';
    engine.scene.add(this.group);
    this.radius = engine.quality.viewRadius;
    this.listeners = [];
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  lodFor(d) {
    if (d < 520) return 4;
    if (d < 1150) return 8;
    return 16;
  }

  update(focus, budgetMs = 6) {
    const r = this.radius + CHUNK;
    const cx0 = Math.floor((focus.x - r) / CHUNK);
    const cx1 = Math.floor((focus.x + r) / CHUNK);
    const cz0 = Math.floor((focus.z - r) / CHUNK);
    const cz1 = Math.floor((focus.z + r) / CHUNK);
    const wanted = new Set();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const x0 = cx * CHUNK;
        const z0 = cz * CHUNK;
        const dx = Math.max(x0 - focus.x, 0, focus.x - (x0 + CHUNK));
        const dz = Math.max(z0 - focus.z, 0, focus.z - (z0 + CHUNK));
        const d = Math.hypot(dx, dz);
        if (d > this.radius) continue;
        const key = cx + ',' + cz;
        wanted.add(key);
        let chunk = this.chunks.get(key);
        const lod = this.lodFor(d);
        if (!chunk) {
          chunk = { key, cx, cz, x0, z0, lod: 0, wantLod: lod, d, terrain: null, roads: null, marks: null, extras: {}, queued: false, ready: false };
          this.chunks.set(key, chunk);
        }
        chunk.d = d;
        chunk.wantLod = lod;
        if (chunk.lod !== lod && !chunk.queued) this.enqueue(chunk);
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (!wanted.has(key) && chunk.d > this.radius + 260) {
        const dx = Math.max(chunk.x0 - focus.x, 0, focus.x - (chunk.x0 + CHUNK));
        const dz = Math.max(chunk.z0 - focus.z, 0, focus.z - (chunk.z0 + CHUNK));
        chunk.d = Math.hypot(dx, dz);
        if (chunk.d > this.radius + 260) this.dispose(chunk);
      } else if (!wanted.has(key)) {
        const dx = Math.max(chunk.x0 - focus.x, 0, focus.x - (chunk.x0 + CHUNK));
        const dz = Math.max(chunk.z0 - focus.z, 0, focus.z - (chunk.z0 + CHUNK));
        chunk.d = Math.hypot(dx, dz);
      }
    }
    this.work(budgetMs);
  }

  enqueue(chunk) {
    chunk.queued = true;
    this.queue.push(chunk);
  }

  work(budgetMs) {
    const start = performance.now();
    while (performance.now() - start < budgetMs) {
      if (!this.active) {
        if (!this.queue.length) return;
        this.queue.sort((a, b) => a.d - b.d);
        const chunk = this.queue.shift();
        if (!this.chunks.has(chunk.key)) continue;
        this.active = { chunk, gen: this.buildChunk(chunk) };
      }
      const step = this.active.gen.next();
      if (step.done) {
        this.active.chunk.queued = false;
        this.active = null;
      }
    }
  }

  // Pending work count; useful for the loading screen.
  get pending() {
    return this.queue.length + (this.active ? 1 : 0);
  }

  *buildChunk(chunk) {
    const lod = chunk.wantLod;
    const t = yield* buildTerrain(this.world, chunk.x0, chunk.z0, CHUNK, lod);
    if (!this.chunks.has(chunk.key)) {
      t.geometry.dispose();
      return;
    }
    const mesh = new THREE.Mesh(t.geometry, this.surfaces.terrain);
    mesh.position.set(chunk.x0, 0, chunk.z0);
    mesh.receiveShadow = this.engine.quality.shadows > 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (chunk.terrain) {
      this.group.remove(chunk.terrain);
      chunk.terrain.geometry.dispose();
    }
    chunk.terrain = mesh;
    chunk.lod = lod;
    this.group.add(mesh);
    if (!chunk.roads && !chunk.roadsBuilt) {
      chunk.roadsBuilt = true;
      yield;
      const { road, marks } = this.roads.buildChunk(chunk.x0, chunk.z0, CHUNK);
      if (road) {
        chunk.roads = new THREE.Mesh(road, this.surfaces.road);
        chunk.roads.position.set(chunk.x0, 0, chunk.z0);
        chunk.roads.receiveShadow = this.engine.quality.shadows > 0;
        chunk.roads.matrixAutoUpdate = false;
        chunk.roads.updateMatrix();
        this.group.add(chunk.roads);
      }
      if (marks) {
        chunk.marks = new THREE.Mesh(marks, this.surfaces.roadOverlay);
        chunk.marks.position.set(chunk.x0, 0, chunk.z0);
        chunk.marks.receiveShadow = this.engine.quality.shadows > 0;
        chunk.marks.matrixAutoUpdate = false;
        chunk.marks.updateMatrix();
        this.group.add(chunk.marks);
      }
      for (const extra of this.extras) {
        yield;
        const out = yield* extra.build(chunk);
        if (out) chunk.extras[extra.name] = out;
      }
      chunk.ready = true;
      for (const fn of this.listeners) fn('add', chunk);
    }
  }

  dispose(chunk) {
    this.chunks.delete(chunk.key);
    for (const m of [chunk.terrain, chunk.roads, chunk.marks]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    for (const extra of this.extras) {
      const out = chunk.extras[extra.name];
      if (out) extra.dispose(chunk, out);
    }
    for (const fn of this.listeners) fn('remove', chunk);
  }
}
