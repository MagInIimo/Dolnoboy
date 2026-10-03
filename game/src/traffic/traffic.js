import * as THREE from 'three';
import { GeoBuilder } from '../render/geo-builder.js';
import { computeNodeInfo } from '../render/road-builder.js';
import { signalPhase } from '../world/signals.js';
import { SpatialHash, angleDiff, clamp, rng, wrapAngle } from '../core/util.js';

// Vehicle kinds: size in metres, speed factor relative to the limit, spawn weight.
const KINDS = {
  sedan: { len: 4.6, wid: 1.8, vmul: 1.0, weight: 5, accel: 2.2 },
  hatch: { len: 4.0, wid: 1.72, vmul: 1.0, weight: 4, accel: 2.2 },
  suv: { len: 4.7, wid: 1.9, vmul: 1.02, weight: 3, accel: 2.0 },
  van: { len: 5.6, wid: 2.05, vmul: 0.92, weight: 2, accel: 1.6 },
  lorry: { len: 8.6, wid: 2.5, vmul: 0.82, weight: 2, accel: 1.0, truck: true },
  bus: { len: 11.5, wid: 2.55, vmul: 0.78, weight: 1, accel: 1.1, truck: true, city: true },
  police: { len: 4.6, wid: 1.8, vmul: 1.02, weight: 0.25, accel: 2.4, police: true },
};
const KIND_IDS = Object.keys(KINDS);
const PAINT = [0xe9ebe8, 0xe9ebe8, 0xb7bcc0, 0x8d949a, 0x1a1c1f, 0x2b3f66, 0x7a1f1d, 0x9a2d22, 0x2f4a36, 0xc9b99a, 0x4f5a63, 0x1f5c8a];
const BUS_PAINT = [0xf2c230, 0xe9ebe8, 0x3a7bc8, 0xd8452f];

const LOOK = 70;
const STOP_GAP = 2.2;
const DECEL = 3.6;
const HARD_DECEL = 7;

// ---------- procedural low-poly bodies (forward +z, origin on the ground at the centre) ----------

function wheel(gb, x, y, z, r, w) {
  const n = 10;
  const a = { color: [0.07, 0.07, 0.08], aPaint: 0 };
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    ring.push([Math.sin(t), Math.cos(t)]);
  }
  for (let i = 0; i < n; i++) {
    const [s0, c0] = ring[i];
    const [s1, c1] = ring[i + 1];
    gb.face([x - w / 2, y + c0 * r, z + s0 * r], [x + w / 2, y + c0 * r, z + s0 * r], [x + w / 2, y + c1 * r, z + s1 * r], [x - w / 2, y + c1 * r, z + s1 * r], null, a);
  }
  for (const side of [-1, 1]) {
    const cx = x + (side * w) / 2;
    const hub = { color: [0.55, 0.57, 0.6], aPaint: 0 };
    for (let i = 0; i < n; i++) {
      const [s0, c0] = ring[i];
      const [s1, c1] = ring[i + 1];
      const p0 = [cx, y, z];
      const p1 = [cx, y + c0 * r * 0.62, z + s0 * r * 0.62];
      const p2 = [cx, y + c1 * r * 0.62, z + s1 * r * 0.62];
      if (side > 0) gb.face(p0, p1, p2, p2, null, hub);
      else gb.face(p0, p2, p1, p1, null, hub);
    }
  }
}

const paint = { color: [1, 1, 1], aPaint: 1 };
const glass = { color: [0.06, 0.08, 0.1], aPaint: 0 };
const plastic = { color: [0.1, 0.1, 0.11], aPaint: 0 };
const white = { color: [0.9, 0.9, 0.88], aPaint: 0 };
const chrome = { color: [0.7, 0.72, 0.74], aPaint: 0 };

function bodyGeometry(kind) {
  const k = KINDS[kind];
  const gb = new GeoBuilder({ color: 3, aPaint: 1 });
  const L = k.len;
  const W = k.wid;
  const box = (x, y, z, w, h, d, a) => gb.box(x, y, z, w, h, d, 0, a);
  if (kind === 'sedan' || kind === 'hatch' || kind === 'suv' || kind === 'police') {
    const suv = kind === 'suv';
    const base = suv ? 0.42 : 0.3;
    const bodyH = suv ? 0.82 : 0.66;
    const r = suv ? 0.37 : 0.31;
    box(0, base + bodyH / 2, 0, W, bodyH, L - 0.1, paint);
    const cabLen = kind === 'hatch' ? L * 0.56 : suv ? L * 0.62 : L * 0.46;
    const cabZ = kind === 'hatch' ? -L * 0.12 : suv ? -L * 0.08 : -L * 0.06;
    const cabH = suv ? 0.56 : 0.48;
    box(0, base + bodyH + cabH / 2, cabZ, W - 0.14, cabH, cabLen, glass);
    box(0, base + bodyH + cabH + 0.03, cabZ, W - 0.18, 0.07, cabLen - 0.25, paint);
    box(0, base + 0.14, L / 2 - 0.05, W + 0.02, 0.26, 0.14, plastic);
    box(0, base + 0.14, -L / 2 + 0.05, W + 0.02, 0.26, 0.14, plastic);
    box(0, base + bodyH * 0.55, L / 2 - 0.02, W * 0.4, 0.18, 0.06, plastic);
    for (const z of [L / 2 - 0.85, -L / 2 + 0.85]) for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) wheel(gb, x, r, z, r, 0.22);
    if (kind === 'police') {
      // traffic police livery: blue band along the sides and a light bar base on the roof
      const blue = { color: [0.08, 0.25, 0.62], aPaint: 0 };
      for (const side of [-1, 1]) box(side * (W / 2 + 0.005), base + bodyH * 0.55, 0, 0.02, 0.2, L - 0.5, blue);
      box(0, base + bodyH + cabH + 0.1, cabZ, 1.2, 0.08, 0.3, plastic);
    }
  } else if (kind === 'van') {
    box(0, 0.75, L / 2 - 1.0, W, 0.9, 2.0, paint);
    box(0, 1.55, L / 2 - 1.15, W - 0.1, 0.7, 1.7, glass);
    box(0, 1.95, L / 2 - 1.2, W - 0.1, 0.1, 1.6, paint);
    box(0, 1.55, -0.95, W + 0.05, 2.0, L - 2.25, white);
    box(0, 0.45, 0, 0.9, 0.2, L - 0.6, plastic);
    box(0, 0.4, L / 2 - 0.02, W, 0.26, 0.1, plastic);
    for (const z of [L / 2 - 0.9, -L / 2 + 1.1]) for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) wheel(gb, x, 0.36, z, 0.36, 0.24);
  } else if (kind === 'lorry') {
    box(0, 1.55, L / 2 - 1.1, W, 1.9, 2.2, paint);
    box(0, 2.15, L / 2 - 0.02, W - 0.2, 0.8, 0.06, glass);
    box(0, 0.75, L / 2 - 0.05, W - 0.2, 0.35, 0.12, plastic);
    box(0, 2.0, -1.15, W + 0.02, 2.6, L - 2.5, white);
    box(0, 0.62, -0.5, 1.0, 0.3, L - 1.2, plastic);
    for (const z of [L / 2 - 1.2, -L / 2 + 1.6, -L / 2 + 2.7]) for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) wheel(gb, x, 0.5, z, 0.5, 0.3);
  } else {
    box(0, 0.95, 0, W, 1.1, L, paint);
    box(0, 2.0, 0, W, 1.0, L - 0.2, glass);
    box(0, 2.0, L / 2 - 0.02, W - 0.1, 1.2, 0.05, glass);
    box(0, 2.65, 0, W, 0.3, L, white);
    box(0, 2.9, -L * 0.2, W * 0.7, 0.25, L * 0.3, chrome);
    for (const z of [L / 2 - 2.4, -L / 2 + 3.0]) for (const x of [-W / 2 + 0.18, W / 2 - 0.18]) wheel(gb, x, 0.5, z, 0.5, 0.3);
  }
  return gb.build();
}

function lampGeometry(kind, front) {
  const k = KINDS[kind];
  const gb = new GeoBuilder({});
  const z = front ? k.len / 2 + 0.03 : -k.len / 2 - 0.03;
  const y = kind === 'lorry' ? (front ? 0.95 : 0.85) : kind === 'bus' ? 0.75 : kind === 'van' ? 0.85 : kind === 'suv' ? 0.95 : 0.78;
  const x = k.wid / 2 - (front ? 0.3 : 0.22);
  const w = front ? 0.34 : 0.26;
  const h = front ? 0.16 : 0.15;
  for (const sx of [-x, x]) {
    if (front) gb.face([sx + w / 2, y - h / 2, z], [sx - w / 2, y - h / 2, z], [sx - w / 2, y + h / 2, z], [sx + w / 2, y + h / 2, z]);
    else gb.face([sx - w / 2, y - h / 2, z], [sx + w / 2, y - h / 2, z], [sx + w / 2, y + h / 2, z], [sx - w / 2, y + h / 2, z]);
  }
  return gb.build();
}

function paintedMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPaint;').replace(
      '#include <color_vertex>',
      `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
        vColor = vec3( 1.0 );
      #endif
      #ifdef USE_COLOR
        vColor *= color;
      #endif
      #ifdef USE_INSTANCING_COLOR
        vColor.xyz = mix( vColor.xyz, vColor.xyz * instanceColor.xyz, aPaint );
      #endif`
    );
  };
  m.customProgramCacheKey = () => 'traffic-paint';
  return m;
}

// ---------- traffic simulation ----------

export class Traffic {
  constructor(engine, world, quality) {
    this.engine = engine;
    this.world = world;
    this.net = world.net;
    this.nodeInfo = computeNodeInfo(world);
    this.cars = [];
    this.random = rng(9031);
    this.maxCars = quality.shadows === 0 ? 22 : quality.trees >= 1 ? 52 : 36;
    this.radius = 680;
    this.spawnTimer = 0;
    this.nextId = 1;
    this.events = [];
    this.stats = { redRuns: 0 };
    world.signalTime = world.signalTime ?? 0;
    world.colliders = world.colliders ?? new SpatialHash(32);
    this.byEdge = new Map();
    this.inJunction = new Map();
    // instanced meshes per kind
    const mat = paintedMaterial();
    this.frontMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.rearMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.meshes = {};
    const cap = this.maxCars;
    for (const kind of KIND_IDS) {
      const body = new THREE.InstancedMesh(bodyGeometry(kind), mat, cap);
      body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      const front = new THREE.InstancedMesh(lampGeometry(kind, true), this.frontMat, cap);
      front.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      const rear = new THREE.InstancedMesh(lampGeometry(kind, false), this.rearMat, cap);
      rear.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      for (const m of [body, front, rear]) {
        m.count = 0;
        m.frustumCulled = false;
        engine.scene.add(m);
      }
      body.castShadow = quality.shadows > 0;
      body.receiveShadow = true;
      this.meshes[kind] = { body, front, rear };
    }
    // police light bars (left blue, right red) and warning triangles of accident scenes
    const bar = (x) => {
      const g = new THREE.BoxGeometry(0.46, 0.12, 0.24);
      g.translate(x, 1.66, -0.28);
      const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ toneMapped: false }), cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      engine.scene.add(m);
      return m;
    };
    this.beaconL = bar(-0.27);
    this.beaconR = bar(0.27);
    const tri = new THREE.Shape([new THREE.Vector2(-0.4, 0), new THREE.Vector2(0.4, 0), new THREE.Vector2(0, 0.7)]);
    const triGeo = new THREE.ShapeGeometry(tri);
    triGeo.translate(0, 0.12, 0);
    this.triangles = new THREE.InstancedMesh(triGeo, new THREE.MeshStandardMaterial({ color: 0xd8261c, emissive: 0x801008, emissiveIntensity: 0.6, side: THREE.DoubleSide }), 16);
    this.triangles.count = 0;
    this.triangles.frustumCulled = false;
    engine.scene.add(this.triangles);
    this.scenes = [];
    this.sceneDistance = 0;
    this.nextSceneAt = 2500;
    this.lastPlayer = null;
    this.clock = 0;
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.vec = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.axisY = new THREE.Vector3(0, 1, 0);
    this.color = new THREE.Color();
    this.player = { edge: null, approach: null };
  }

  // ---------- geometry of lanes ----------
  laneLat(type, lane) {
    return type.carriageHalf - type.laneWidth * (lane + 0.5);
  }

  trimAt(e, nodeId) {
    return this.nodeInfo[nodeId]?.trims.get(e.id) ?? 0;
  }

  // s where the car leaves the edge (toward the node it travels to).
  endS(car) {
    const e = car.edge;
    return car.dir > 0 ? e.len - this.trimAt(e, e.b) : this.trimAt(e, e.a);
  }

  startS(e, dir) {
    return dir > 0 ? this.trimAt(e, e.a) : e.len - this.trimAt(e, e.b);
  }

  placeOnEdge(car) {
    const p = this.net.pointAt(car.edge, car.s, car.dir * car.lat);
    car.x = p.x;
    car.y = p.y;
    car.z = p.z;
    car.yaw = car.dir > 0 ? p.heading : wrapAngle(p.heading + Math.PI);
  }

  // ---------- spawning ----------
  pickKind(city) {
    const r = this.random;
    const pairs = KIND_IDS.filter((k) => city || !KINDS[k].city).map((k) => [k, KINDS[k].weight]);
    return r.weighted(pairs);
  }

  trySpawn(px, pz, minR) {
    const r = this.random;
    const a = r() * Math.PI * 2;
    const d = minR + r() * (this.radius - 40 - minR);
    const q = this.net.nearest(px + Math.sin(a) * d, pz + Math.cos(a) * d, 140, (e) => e.alive && e.type.id !== 'Y');
    if (!q) return false;
    const e = q.edge;
    const dir = r() < 0.5 ? 1 : -1;
    const s0 = this.startS(e, dir);
    const tmp = { edge: e, dir };
    const s1 = this.endS(tmp);
    const lo = Math.min(s0, s1) + 6;
    const hi = Math.max(s0, s1) - 6;
    if (hi <= lo || q.s < lo || q.s > hi) return false;
    const kind = this.pickKind(e.city >= 0);
    const spec = KINDS[kind];
    const lanes = e.type.lanes;
    const lane = spec.truck || lanes === 1 ? 0 : r() < 0.6 ? 0 : 1;
    const p = this.net.pointAt(e, q.s);
    for (const o of this.cars) if (Math.abs(o.x - p.x) < 30 && Math.abs(o.z - p.z) < 30 && Math.hypot(o.x - p.x, o.z - p.z) < 26) return false;
    if (Math.hypot(p.x - px, p.z - pz) < minR * 0.8) return false;
    const car = this.makeCar(kind, e, dir, q.s, lane);
    car.next = this.chooseNext(car);
    this.placeOnEdge(car);
    // never appear at full speed right in front of a signal
    const toStop = this.toStopLine(car);
    if (toStop < 80) car.v = Math.min(car.v, Math.sqrt(2 * DECEL * Math.max(0, toStop - 6)));
    this.cars.push(car);
    this.registerCollider(car);
    return true;
  }

  makeCar(kind, e, dir, s, lane) {
    const r = this.random;
    const spec = KINDS[kind];
    const limit = e.type.highway ? e.type.speed : 55;
    return {
      id: this.nextId++,
      kind,
      spec,
      edge: e,
      dir,
      s,
      lane,
      lat: this.laneLat(e.type, lane),
      latTarget: this.laneLat(e.type, lane),
      v: (limit / 3.6) * 0.8,
      driver: 0.9 + r() * 0.2,
      mode: 'edge',
      turn: null,
      next: null,
      wait: 0,
      hit: 0,
      plan: null,
      reserved: null,
      braking: false,
      color: kind === 'bus' ? BUS_PAINT[Math.floor(r() * BUS_PAINT.length)] : kind === 'police' ? 0xf2f3f1 : PAINT[Math.floor(r() * PAINT.length)],
      collider: { x: 0, z: 0, w: spec.wid, d: spec.len, heading: 0, kind: 'car', h: 1.8 },
      box: null,
      hazard: false,
      beacon: false,
    };
  }

  registerCollider(car) {
    const c = car.collider;
    if (car.box) this.world.colliders.remove(c, car.box[0], car.box[1], car.box[2], car.box[3]);
    c.x = car.x;
    c.z = car.z;
    c.heading = car.yaw;
    const r = car.spec.len / 2 + 0.5;
    car.box = [car.x - r, car.z - r, car.x + r, car.z + r];
    this.world.colliders.insertBox(c, car.box[0], car.box[1], car.box[2], car.box[3]);
  }

  removeCar(car) {
    this.leaveJunction(car);
    if (car.box) this.world.colliders.remove(car.collider, car.box[0], car.box[1], car.box[2], car.box[3]);
    car.box = null;
  }

  // Next edge at the node the car is heading to; prefers going straight, never a U-turn unless it is a dead end.
  chooseNext(car) {
    const net = this.net;
    const e = car.edge;
    const nodeId = car.dir > 0 ? e.b : e.a;
    const node = net.nodes[nodeId];
    const inDir = net.departure(e, nodeId, 12);
    const options = [];
    for (const id of node.edges) {
      const o = net.edges[id];
      if (!o.alive || o === e || o.type.id === 'Y') continue;
      const out = net.departure(o, nodeId, 12);
      const turn = angleDiff(out.angle, inDir.angle + Math.PI);
      if (Math.abs(turn) > 2.5) continue;
      const w = Math.abs(turn) < 0.5 ? 3 : 1;
      options.push([{ edge: o, dir: o.a === nodeId ? 1 : -1, node, turn }, w]);
    }
    if (!options.length) return { edge: e, dir: -car.dir, node, turn: Math.PI };
    return this.random.weighted(options);
  }

  // Bezier through the junction from the lane end at the trim to the lane start of the next edge.
  planTurn(car) {
    const net = this.net;
    const nx = car.next;
    const lane = Math.min(car.lane, nx.edge.type.lanes - 1);
    const endS = this.endS(car);
    const a = net.pointAt(car.edge, endS, car.dir * car.latTarget);
    const yaw0 = car.dir > 0 ? a.heading : a.heading + Math.PI;
    const s1 = this.startS(nx.edge, nx.dir);
    const q = net.pointAt(nx.edge, s1, nx.dir * this.laneLat(nx.edge.type, lane));
    const yaw1 = nx.dir > 0 ? q.heading : q.heading + Math.PI;
    const dist = Math.hypot(q.x - a.x, q.z - a.z);
    const sharp = Math.abs(nx.turn ?? 0);
    let vmax = sharp > 1.2 ? 6.5 : sharp > 0.5 ? 9 : nx.edge.city >= 0 ? 14 : 22;
    // a signal soon after the junction: arrive slowly enough to stop for it
    const farNode = this.net.nodes[nx.dir > 0 ? nx.edge.b : nx.edge.a];
    if (farNode.signal) {
      const farEnd = nx.dir > 0 ? nx.edge.len - this.trimAt(nx.edge, nx.edge.b) : this.trimAt(nx.edge, nx.edge.a);
      const room = (farEnd - s1) * nx.dir - 6.7 - car.spec.len;
      vmax = Math.min(vmax, Math.max(3, Math.sqrt(2 * DECEL * Math.max(0, room))));
    }
    const plan = { node: nx.node, from: car.edge.id, fromDir: car.dir, lane, s1, len: 0, pts: null, d: 0, vmax, laneAt: car.latTarget };
    if (dist < 0.8) return plan;
    const k = dist * 0.42;
    const p1 = { x: a.x + Math.sin(yaw0) * k, z: a.z + Math.cos(yaw0) * k };
    const p2 = { x: q.x - Math.sin(yaw1) * k, z: q.z - Math.cos(yaw1) * k };
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * q.x;
      const z = u * u * u * a.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * q.z;
      if (i) plan.len += Math.hypot(x - pts[i - 1].x, z - pts[i - 1].z);
      pts.push({ x, z, y: a.y + (q.y - a.y) * t, d: plan.len });
    }
    plan.pts = pts;
    return plan;
  }

  // True when a car from another approach is inside the junction on a path that comes within a car width of ours.
  junctionBusy(car, plan) {
    if (!plan.pts) return false;
    if (!this.exitClear(car, plan)) return true;
    const inside = this.inJunction.get(plan.node.id);
    if (!inside) return false;
    for (const o of inside) {
      if (o === car) continue;
      const T = o.turn ?? o.plan;
      if (!T?.pts) continue;
      // followers in the same lane are handled by the distance keeping; neighbours in another lane may converge
      if (T.from === plan.from && T.fromDir === plan.fromDir && Math.abs(T.laneAt - plan.laneAt) < 1) continue;
      // long vehicles sweep wider than their centre line through a bend
      const clear = 2.6 + Math.max(0, car.spec.len + o.spec.len - 9) * 0.12;
      for (const a of plan.pts) {
        for (const b of T.pts) {
          if (b.d < T.d - o.spec.len) continue;
          if (Math.abs(a.x - b.x) < clear && Math.abs(a.z - b.z) < clear && Math.hypot(a.x - b.x, a.z - b.z) < clear) return true;
        }
      }
    }
    return false;
  }

  // Room for the whole car on the exit lane beyond the junction (cars already turning into it count too).
  exitClear(car, plan) {
    const nx = car.next;
    const lat = this.laneLat(nx.edge.type, plan.lane);
    let need = car.spec.len + 3;
    for (const o of this.cars) {
      if (o === car) continue;
      if (o.mode === 'turn' && o.next.edge === nx.edge && o.next.dir === nx.dir && o.turn.lane === plan.lane) need += o.spec.len + 3;
    }
    for (const o of this.byEdge.get(nx.edge.id) ?? []) {
      if (o.dir !== nx.dir || Math.abs(o.lat - lat) > 1.7) continue;
      const d = (o.s - plan.s1) * nx.dir - o.spec.len / 2;
      if (d < need) return false;
    }
    return true;
  }

  // Claims the junction for the planned path; others whose paths cross it wait at the entrance.
  reserve(car, plan) {
    if (car.reserved) return;
    let set = this.inJunction.get(plan.node.id);
    if (!set) this.inJunction.set(plan.node.id, (set = new Set()));
    set.add(car);
    car.reserved = plan.node.id;
  }

  // Returns false (and holds the car at the entrance) when the junction is still busy.
  beginTurn(car) {
    let plan = car.plan;
    if (!plan || plan.laneAt !== car.latTarget || plan.node !== car.next.node) {
      if (car.reserved !== undefined && car.reserved !== null) this.leaveJunction(car);
      plan = this.planTurn(car);
      car.plan = plan;
    }
    if (!plan.pts) {
      this.enterEdge(car, car.next.edge, car.next.dir, plan.s1, plan.lane);
      return true;
    }
    if (car.reserved == null && this.junctionBusy(car, plan)) return false;
    this.reserve(car, plan);
    car.plan = null;
    car.mode = 'turn';
    car.turn = plan;
    return true;
  }

  leaveJunction(car) {
    if (car.reserved == null) return;
    const set = this.inJunction.get(car.reserved);
    if (set) {
      set.delete(car);
      if (!set.size) this.inJunction.delete(car.reserved);
    }
    car.reserved = null;
  }

  enterEdge(car, edge, dir, s, lane) {
    this.leaveJunction(car);
    car.edge = edge;
    car.dir = dir;
    car.s = s;
    car.lane = Math.min(lane, edge.type.lanes - 1);
    if (car.spec.truck) car.lane = 0;
    car.lat = this.laneLat(edge.type, car.lane);
    car.latTarget = car.lat;
    car.mode = 'edge';
    car.turn = null;
    car.plan = null;
    car.edgeTime = this.world.signalTime;
    car.next = this.chooseNext(car);
  }

  // ---------- perception ----------
  // Free distance from the car's front to an oriented box ahead in its path, or Infinity.
  gapTo(car, ox, oz, oyaw, olen, owid, oy = car.y) {
    if (Math.abs(oy - car.y) > 4) return Infinity;
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const dx = ox - car.x;
    const dz = oz - car.z;
    const along = dx * fx + dz * fz;
    if (along <= 0) return Infinity; // only things whose centre is ahead of ours block us
    const lateral = dx * fz - dz * fx;
    const da = oyaw - car.yaw;
    const c = Math.abs(Math.cos(da));
    const s = Math.abs(Math.sin(da));
    const halfAlong = (c * olen + s * owid) / 2;
    const halfLat = (s * olen + c * owid) / 2;
    if (Math.abs(lateral) > halfLat + car.spec.wid / 2 + 0.35) return Infinity;
    return along - halfAlong - car.spec.len / 2;
  }

  // ---------- simulation step ----------
  step(dt, player) {
    this.world.signalTime += dt;
    this.clock += dt;
    const time = this.world.signalTime;
    const px = player.x;
    const pz = player.z;
    this.trackPlayer(player, time);
    // the player's rig hit one of our cars: it is knocked aside and stays there with hazard lights
    if (player.hitCollider?.kind === 'car') {
      const car = this.cars.find((c) => c.collider === player.hitCollider);
      if (car) this.knock(car, player);
      player.hitCollider = null;
    }
    this.updateScenes(dt, player);
    // population management
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      const cam = this.engine.camera.position;
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const car = this.cars[i];
        const d = Math.hypot(car.x - px, car.z - pz);
        const dc = Math.hypot(car.x - cam.x, car.z - cam.z);
        const wreck = car.mode === 'knocked' || car.mode === 'static';
        const tooFar = d > this.radius + 60 && !car.scene;
        const stale = (car.wait > 40 && dc > 90 && !wreck) || (wreck && !car.scene && this.clock - car.wreckTime > 90 && dc > 150);
        if (tooFar || stale) {
          this.removeCar(car);
          this.cars.splice(i, 1);
        }
      }
      const minR = this.filled ? 230 : 45;
      for (let k = 0; k < 6 && this.cars.length < this.maxCars; k++) this.trySpawn(px, pz, minR);
      if (this.cars.length >= this.maxCars * 0.8) this.filled = true;
    }
    // index cars by edge for leader search
    this.byEdge.clear();
    for (const car of this.cars) {
      if (car.mode !== 'edge') continue;
      let list = this.byEdge.get(car.edge.id);
      if (!list) this.byEdge.set(car.edge.id, (list = []));
      list.push(car);
    }
    const boxes = player.boxes();
    for (const car of this.cars) {
      if (car.mode === 'knocked') this.slide(car, dt);
      else if (car.mode !== 'static') this.drive(car, dt, time, boxes, player);
    }
  }

  // ---------- accidents ----------
  knock(car, player) {
    const push = player.hitPush ?? { x: car.x - player.x, z: car.z - player.z, speed: Math.abs(player.v) };
    // push points from the car toward the truck; the car flies the other way
    const l = Math.hypot(push.x, push.z) || 1;
    const nx = -push.x / l;
    const nz = -push.z / l;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    const speed = clamp(push.speed * 1.4 + 1.5, 2, 16);
    this.leaveJunction(car);
    car.mode = 'knocked';
    car.vx = nx * speed + fx * player.v * 0.3;
    car.vz = nz * speed + fz * player.v * 0.3;
    car.spin = (this.random() < 0.5 ? -1 : 1) * speed * 0.22;
    car.v = 0;
    car.hazard = true;
    car.wreckTime = this.clock;
    this.events.push({ type: 'crash', x: car.x, z: car.z });
  }

  slide(car, dt) {
    const sp = Math.hypot(car.vx, car.vz);
    const k = sp > 0 ? Math.max(0, sp - 7 * dt) / sp : 0;
    car.vx *= k;
    car.vz *= k;
    car.spin *= Math.exp(-2.2 * dt);
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.yaw = wrapAngle(car.yaw + car.spin * dt);
    // stay out of buildings and walls
    for (const c of this.world.colliders.query(car.x - 3, car.z - 3, car.x + 3, car.z + 3)) {
      if (c === car.collider || c.kind === 'car') continue;
      const lx = car.x - c.x;
      const lz = car.z - c.z;
      const cs = Math.cos(c.heading);
      const sn = Math.sin(c.heading);
      if (Math.abs(lx * cs - lz * sn) < c.w / 2 + 1 && Math.abs(lx * sn + lz * cs) < c.d / 2 + 1) {
        car.x -= car.vx * dt;
        car.z -= car.vz * dt;
        car.vx = car.vz = 0;
      }
    }
    car.y = this.world.groundAt(car.x, car.z, car.y).y;
    if (sp < 0.05 && Math.abs(car.spin) < 0.05) car.mode = 'static';
    this.registerCollider(car);
  }

  // Random accident scenes ahead of the player: two damaged cars, a police car with beacons and a warning triangle.
  updateScenes(dt, player) {
    if (this.lastPlayer) this.sceneDistance += Math.hypot(player.x - this.lastPlayer.x, player.z - this.lastPlayer.z);
    this.lastPlayer = { x: player.x, z: player.z };
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      const sc = this.scenes[i];
      const d = Math.hypot(sc.x - player.x, sc.z - player.z);
      sc.near = Math.min(sc.near, d);
      if ((sc.near < 60 && d > 600) || d > 1600 || this.clock - sc.born > 900) {
        for (const car of sc.cars) {
          const k = this.cars.indexOf(car);
          if (k >= 0) {
            this.removeCar(car);
            this.cars.splice(k, 1);
          }
        }
        this.scenes.splice(i, 1);
      }
    }
    if (this.scenes.length || this.sceneDistance < this.nextSceneAt) return;
    if (Math.abs(player.v) < 8) return;
    this.sceneDistance = 0;
    this.nextSceneAt = 3500 + this.random() * 5000;
    this.spawnScene(player);
  }

  spawnScene(player) {
    const q = this.net.nearest(player.x, player.z, 30, (e) => e.alive);
    if (!q) return false;
    const e = q.edge;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    const dir = fx * q.hx + fz * q.hz > 0 ? 1 : -1;
    const ahead = 420 + this.random() * 260;
    const s = q.s + dir * ahead;
    const margin = 120;
    if (s < this.startS(e, 1) + margin || s > this.startS(e, -1) - margin) return false;
    const i = this.net.pointAt(e, s).i;
    if (e.bridge[i] || e.bridge[i + 1]) return false;
    const t = e.type;
    // two-lane carriageways lose the right lane; single-lane roads get the wrecks on the shoulder
    const single = t.lanes === 1;
    const lat = single ? t.pavedHalf + 0.5 : this.laneLat(t, 0);
    const turn = single ? 0.35 : 1;
    const sc = { x: 0, z: 0, cars: [], born: this.clock, near: Infinity, edge: e, dir, s, triangle: null };
    const place = (kind, ds, dl, yaw, opts = {}) => {
      const car = this.makeCar(kind, e, dir, s + dir * ds, 0);
      car.lat = car.latTarget = lat + dl;
      this.placeOnEdge(car);
      car.yaw = wrapAngle(car.yaw + yaw);
      car.mode = 'static';
      car.v = 0;
      car.scene = sc;
      car.hazard = !!opts.hazard;
      car.beacon = !!opts.beacon;
      car.wreckTime = this.clock;
      if (opts.color) car.color = opts.color;
      this.cars.push(car);
      this.registerCollider(car);
      sc.cars.push(car);
      return car;
    };
    const kinds = ['sedan', 'hatch', 'suv', 'van'];
    const a = place(kinds[Math.floor(this.random() * 4)], 0, -0.3 * turn, 0.35 * turn, { hazard: true });
    place(kinds[Math.floor(this.random() * 4)], -5.2, 0.25 * turn, -0.5 * turn, { hazard: true });
    place('police', -17, 0.1, 0.06, { beacon: true, hazard: false });
    const tp = this.net.pointAt(e, s - dir * 38, dir * lat);
    sc.triangle = { x: tp.x, y: tp.y, z: tp.z, yaw: dir > 0 ? tp.heading + Math.PI : tp.heading };
    sc.x = a.x;
    sc.z = a.z;
    this.scenes.push(sc);
    this.events.push({ type: 'accidentAhead', x: sc.x, z: sc.z });
    return true;
  }

  drive(car, dt, time, boxes, player) {
    const spec = car.spec;
    let gap = Infinity;
    let vmax;
    car.why = '';
    car.prevWreck = car.blockedByWreck;
    car.blockedByWreck = false;
    if (car.mode === 'edge') {
      const e = car.edge;
      const limit = (e.type.highway ? e.type.speed + 5 : 55) / 3.6;
      vmax = limit * spec.vmul * car.driver;
      // slow down for bends ahead
      const ahead = clamp(car.s + car.dir * 28, 0, e.len);
      const p0 = this.net.pointAt(e, car.s);
      const p1 = this.net.pointAt(e, ahead);
      const bend = Math.abs(angleDiff(p1.heading, p0.heading));
      if (bend > 0.05) vmax = Math.min(vmax, Math.sqrt(2.6 / Math.max(1e-3, bend / 28)));
      const endS = this.endS(car);
      const toEnd = (endS - car.s) * car.dir;
      // signal at the end of the edge
      const node = car.next?.node;
      if (node?.signal) {
        const phase = signalPhase(node, e.id, time);
        // front bumper half a metre before the stop line, which is painted 6.2 m beyond the junction trim
        const toStop = toEnd - 6.7 - spec.len / 2;
        if (phase !== 'green' && toStop > -1.5) {
          // dilemma zone: on yellow, stop unless braking would have to be harsher than ~5.6 m/s²
          const canStop = phase === 'red' || toStop > (car.v * car.v) / (2 * HARD_DECEL * 0.8);
          if (canStop) {
            gap = Math.min(gap, toStop + STOP_GAP);
            car.why = 'signal';
          }
        }
      }
      // give way inside unsignalised and signalised junctions alike: enter only when our path is clear
      if (car.next && toEnd < 60) {
        if (!car.plan || car.plan.laneAt !== car.latTarget) {
          this.leaveJunction(car);
          car.plan = this.planTurn(car);
        }
        if (car.reserved == null && toEnd < 32) {
          if (this.junctionBusy(car, car.plan)) {
            gap = Math.min(gap, toEnd - spec.len / 2 + STOP_GAP - 0.3);
            car.why = 'junction';
          }
          else if (car.plan.pts && toEnd < (car.v * car.v) / (2 * DECEL) + 8 && !(node?.signal && signalPhase(node, e.id, time) === 'red')) this.reserve(car, car.plan);
        }
      }
      // turning speed before the junction
      if (car.next && toEnd < 60) {
        const vt = car.plan?.vmax ?? (Math.abs(car.next.turn ?? 0) > 1.2 ? 6.5 : Math.abs(car.next.turn ?? 0) > 0.5 ? 9 : vmax);
        vmax = Math.min(vmax, Math.sqrt(vt * vt + 2 * 2.2 * Math.max(0, toEnd)));
      }
      // leader on the same edge and lane
      const list = this.byEdge.get(e.id);
      if (list) {
        for (const o of list) {
          if (o === car || o.dir !== car.dir) continue;
          // a neighbour drifting into or out of our lane counts as a leader too
          const near = Math.min(Math.abs(o.lat - car.lat), Math.abs(o.latTarget - car.lat)) < 1.7 || (o.lat - car.lat) * (o.latTarget - car.lat) < 0;
          if (!near) continue;
          const d = (o.s - car.s) * car.dir;
          if (d < 0 || (d === 0 && o.id > car.id)) continue;
          if (d - (o.spec.len + spec.len) / 2 < gap) {
            gap = d - (o.spec.len + spec.len) / 2;
            car.why = 'leader:' + o.id;
          }
        }
      }
      // courtesy: let a car stuck behind an obstacle in the neighbouring lane merge in front of us
      if (list && e.type.lanes > 1) {
        for (const o of list) {
          if (o === car || o.dir !== car.dir || !o.mergeRequest || Math.abs(o.lat - car.lat) < 1.7) continue;
          const d = (o.s - car.s) * car.dir;
          // only a car still clearly behind the merging one yields, and it leaves room for the merge
          if (d > (o.spec.len + spec.len) / 2 + 1 && d < 30) {
            const g = d - (o.spec.len + spec.len) / 2 - 5;
            if (g < gap) {
              gap = g;
              car.why = 'yield:' + o.id;
            }
          }
        }
      }
      // lane changes on multi-lane roads: overtake slow leaders, otherwise keep right
      if (e.type.lanes > 1 && (!spec.truck || car.wait > 3) && toEnd > 70 && Math.abs(car.lat - car.latTarget) < 0.05) {
        const want = gap < 35 && car.v < vmax * 0.85 ? 1 - car.lane : car.lane === 1 ? 0 : -1;
        if (want >= 0 && want !== car.lane && this.laneFree(car, want)) {
          car.lane = want;
          car.latTarget = this.laneLat(e.type, want);
        }
      }
      // sideways drift mostly while rolling (at most about 1 m/s); pulling out from behind an obstacle works from standstill
      car.mergeRequest = car.wait > 4 && (car.prevWreck || car.behindPlayer) && e.type.lanes > 1 && toEnd > 70;
      const latRate = Math.max(car.wait > 1 ? 0.6 : 0, Math.min(1.1, car.v * 0.12)) * dt;
      if (car.lat !== car.latTarget) car.lat += clamp(car.latTarget - car.lat, -latRate, latRate);
    } else {
      vmax = car.turn.vmax;
    }
    // rubbernecking: everybody crawls past an accident
    for (const sc of this.scenes) if (Math.abs(sc.x - car.x) < 70 && Math.abs(sc.z - car.z) < 70) vmax = Math.min(vmax, 7);
    // anything in front: other cars (crossing traffic) and the player's rig
    let blockedByCar = null;
    {
      for (const o of this.cars) {
        if (o === car) continue;
        if (Math.abs(o.x - car.x) > LOOK || Math.abs(o.z - car.z) > LOOK) continue;
        const g = this.gapTo(car, o.x, o.z, o.yaw, o.spec.len, o.spec.wid, o.y);
        if (g === Infinity) continue;
        // same direction: look far; crossing traffic: medium; oncoming (in its own lane on a bend): only very close
        const c = Math.cos(o.yaw - car.yaw);
        const reach = o.mode === 'static' || o.mode === 'knocked' ? 55 : c > 0.7 ? 55 : c > -0.3 ? 26 : 9;
        if (g < reach && g < gap) {
          gap = g;
          blockedByCar = o;
          car.why = 'cone:' + o.id;
          car.blockedByWreck = o.mode === 'static' || o.mode === 'knocked';
        }
      }
    }
    car.behindPlayer = false;
    for (const b of boxes) {
      const g = this.gapTo(car, b.x, b.z, b.h, b.d, b.w, player.y);
      if (g < gap) {
        gap = g;
        blockedByCar = null;
        car.behindPlayer = g < 25;
        car.why = 'player';
      }
    }
    // go around the player's rig standing in our lane when the road has a second lane
    if (car.mode === 'edge' && car.behindPlayer && car.wait > 2.5 && car.edge.type.lanes > 1 && !car.spec.truck && Math.abs(car.lat - car.latTarget) < 0.05) {
      const other = 1 - car.lane;
      if (this.laneFree(car, other)) {
        car.lane = other;
        car.latTarget = this.laneLat(car.edge.type, other);
        car.v = Math.max(car.v, 1.5);
      }
    }
    // speed control: stop smoothly before the obstacle
    const free = gap - STOP_GAP - car.v * 0.6;
    let target = vmax;
    if (gap < Infinity) target = Math.min(target, Math.sqrt(Math.max(0, 2 * DECEL * Math.max(0, free))));
    if (car.hit > 0) {
      car.hit -= dt;
      target = 0;
    }
    const prev = car.v;
    if (target > car.v) car.v = Math.min(target, car.v + spec.accel * dt);
    else car.v = Math.max(target, car.v - (gap < STOP_GAP + 1 ? HARD_DECEL * 2 : HARD_DECEL) * dt);
    if (gap < STOP_GAP * 0.5) car.v = 0;
    car.braking = car.v < prev - 0.02 || (car.v < 0.1 && gap < 12);
    if (car.v < 0.2) car.wait += dt;
    else car.wait = 0;
    if (this.stats.log) {
      car.trace = car.trace ?? [];
      car.trace.push([+gap.toFixed(1), +car.v.toFixed(1), car.why, car.mode, +((this.toStopLine(car))).toFixed(1)]);
      if (car.trace.length > 240) car.trace.shift();
    }
    // advance
    const ds = car.v * dt;
    if (car.mode === 'edge') {
      const stopBefore = this.toStopLine(car);
      car.s += car.dir * ds;
      const stopAfter = this.toStopLine(car);
      if (stopBefore > 0 && stopAfter <= 0 && car.next.node.signal && signalPhase(car.next.node, car.edge.id, time) === 'red') {
        this.stats.redRuns++;
        if (this.stats.log) this.stats.log.push({ id: car.id, kind: car.kind, v: +car.v.toFixed(1), before: +stopBefore.toFixed(2), why: car.why, age: +(time - (car.edgeTime ?? 0)).toFixed(1), edgeLen: +car.edge.len.toFixed(0), trace: car.trace?.filter((_, i) => i % 20 === 0), p: [1, 2, 3, 4, 6].map((k) => signalPhase(car.next.node, car.edge.id, time - k)[0]).join('') });
      }
      const endS = this.endS(car);
      if ((endS - car.s) * car.dir <= 0) {
        car.s = endS;
        this.placeOnEdge(car);
        if (!this.beginTurn(car)) car.v = 0;
      }
      if (car.mode === 'edge') this.placeOnEdge(car);
    }
    if (car.mode === 'turn') {
      const T = car.turn;
      T.d += ds;
      if (T.d >= T.len) {
        this.enterEdge(car, car.next.edge, car.next.dir, T.s1, T.lane);
        this.placeOnEdge(car);
      } else {
        let i = 0;
        while (i < T.pts.length - 2 && T.pts[i + 1].d < T.d) i++;
        const a = T.pts[i];
        const b = T.pts[i + 1];
        const t = clamp((T.d - a.d) / Math.max(1e-6, b.d - a.d), 0, 1);
        car.x = a.x + (b.x - a.x) * t;
        car.z = a.z + (b.z - a.z) * t;
        car.y = a.y + (b.y - a.y) * t;
        car.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      }
    }
    // hit by the player: the car stops for a while
    const c = car.collider;
    if (Math.abs(c.x - car.x) > 0.05 || Math.abs(c.z - car.z) > 0.05 || Math.abs(c.heading - car.yaw) > 0.01) this.registerCollider(car);
    if (player.impact > 1 && player.impactKind === 'car' && Math.hypot(player.x - car.x, player.z - car.z) < 14) car.hit = 5;
  }

  // Lane change is allowed only when no car (on this edge, leaving a junction, or mid-manoeuvre)
  // occupies the strip between our lane and the target lane from 18 m behind to 45 m ahead.
  // Distance from the front bumper to the stop line of a signalised node ahead (Infinity without a signal).
  toStopLine(car) {
    if (!car.next?.node?.signal) return Infinity;
    return (this.endS(car) - car.s) * car.dir - 6.2 - car.spec.len / 2;
  }

  laneFree(car, lane) {
    const target = this.laneLat(car.edge.type, lane);
    // the strip we will sweep: from just beside our own lane to the far side of the target lane
    const lo = target > car.lat ? car.lat + 1.2 : target - 2.2;
    const hi = target > car.lat ? target + 2.2 : car.lat - 1.2;
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    for (const o of this.cars) {
      if (o === car) continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue;
      if (Math.cos(o.yaw - car.yaw) < 0.3) continue;
      const along = dx * fx + dz * fz;
      // the gap needed grows with the closing speed: someone faster behind us, or slower ahead of us
      const lens = (o.spec.len + car.spec.len) / 2;
      const behind = lens + 2.5 + Math.max(0, (o.v ?? 0) - car.v) * 1.8;
      const front = lens + 3 + Math.max(0, car.v - (o.v ?? 0)) * 1.8;
      if (along < -behind || along > front) continue;
      const rel = car.lat + (dx * -fz + dz * fx);
      const otherTarget = o.mode === 'edge' && o.edge === car.edge && o.dir === car.dir ? car.lat + (o.latTarget - o.lat) + (rel - car.lat) : rel;
      if ((rel > lo && rel < hi) || (otherTarget > lo && otherTarget < hi)) return false;
    }
    return true;
  }

  // Red-light detection for the player: approaching a signalised node, crossing its stop line on red.
  trackPlayer(p, time) {
    if (Math.abs(p.v) < 2) return;
    const list = this.net.query(p.x, p.z, 0);
    let best = null;
    for (const q of list) {
      if (q.edge.type.highway) continue;
      if (Math.abs(q.lateral) > q.edge.type.pavedHalf) continue;
      if (!best || Math.abs(q.lateral) < Math.abs(best.lateral)) best = q;
    }
    if (!best) return;
    const e = best.edge;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const dir = fx * best.hx + fz * best.hz > 0 ? 1 : -1;
    if (best.lateral * dir < 0) return; // only the player's own (right-hand) half of the road counts
    const nodeId = dir > 0 ? e.b : e.a;
    const node = this.net.nodes[nodeId];
    if (!node.signal) return;
    const toNode = dir > 0 ? e.len - best.s : best.s;
    const stop = this.trimAt(e, nodeId) + 6.2;
    const key = e.id + ':' + nodeId;
    const prev = this.player.approach;
    if (toNode > stop + 1) this.player.approach = { key, before: true };
    else if (prev && prev.key === key && prev.before && toNode < stop - 1.5) {
      this.player.approach = { key, before: false };
      if (signalPhase(node, e.id, time) === 'red' && signalPhase(node, e.id, time - 1.2) === 'red') this.events.push('redLight');
    }
  }

  takeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---------- rendering ----------
  update(dt, camPos, night) {
    const counts = {};
    for (const k of KIND_IDS) counts[k] = 0;
    const m = this.matrix;
    const front = night > 0.25 ? 1.6 : 0.18;
    const blink = this.clock % 0.8 < 0.42;
    const flash = Math.floor(this.clock * 6) % 4;
    let beacons = 0;
    for (const car of this.cars) {
      const M = this.meshes[car.kind];
      const i = counts[car.kind]++;
      this.quat.setFromAxisAngle(this.axisY, car.yaw);
      this.vec.set(car.x, car.y + 0.02, car.z);
      m.compose(this.vec, this.quat, this.one);
      M.body.setMatrixAt(i, m);
      M.front.setMatrixAt(i, m);
      M.rear.setMatrixAt(i, m);
      this.color.setHex(car.color);
      M.body.instanceColor.setXYZ(i, this.color.r, this.color.g, this.color.b);
      if (car.hazard) {
        const k = blink ? 2.2 : 0.15;
        M.front.instanceColor.setXYZ(i, k, k * 0.55, k * 0.05);
        M.rear.instanceColor.setXYZ(i, k, k * 0.5, k * 0.05);
      } else {
        const wrecked = car.mode === 'static' || car.mode === 'knocked';
        const f = wrecked ? 0.1 : front;
        M.front.instanceColor.setXYZ(i, f, f * 0.96, f * 0.86);
        const rear = car.braking ? 2.2 : night > 0.25 ? 0.9 : 0.22;
        M.rear.instanceColor.setXYZ(i, rear, rear * 0.08, rear * 0.05);
      }
      if (car.kind === 'police') {
        this.beaconL.setMatrixAt(beacons, m);
        this.beaconR.setMatrixAt(beacons, m);
        const on = car.beacon;
        const l = on && (flash === 0 || flash === 2) ? 3 : 0.25;
        const r = on && (flash === 1 || flash === 3) ? 3 : 0.25;
        this.beaconL.instanceColor.setXYZ(beacons, 0.1 * l, 0.25 * l, l);
        this.beaconR.instanceColor.setXYZ(beacons, r, 0.08 * r, 0.06 * r);
        beacons++;
      }
    }
    for (const k of KIND_IDS) {
      const M = this.meshes[k];
      for (const mesh of [M.body, M.front, M.rear]) {
        mesh.count = counts[k];
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const b of [this.beaconL, this.beaconR]) {
      b.count = beacons;
      b.instanceMatrix.needsUpdate = true;
      b.instanceColor.needsUpdate = true;
    }
    let tri = 0;
    for (const sc of this.scenes) {
      if (!sc.triangle || tri >= 16) continue;
      this.quat.setFromAxisAngle(this.axisY, sc.triangle.yaw);
      this.vec.set(sc.triangle.x, sc.triangle.y, sc.triangle.z);
      m.compose(this.vec, this.quat, this.one);
      this.triangles.setMatrixAt(tri++, m);
    }
    this.triangles.count = tri;
    this.triangles.instanceMatrix.needsUpdate = true;
  }
}
