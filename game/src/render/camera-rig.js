import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from '../core/util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class CameraRig {
  constructor(engine, truck, world) {
    this.engine = engine;
    this.camera = engine.camera;
    this.truck = truck;
    this.world = world;
    this.mode = 'chase';
    this.orbitYaw = 0;
    this.orbitPitch = 0.14;
    this.distance = 14;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.dragTime = 10;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.ready = false;
    this.mirrorTimer = 0;
    this.mirrors = null;
  }

  cycle() {
    const order = ['chase', 'cab', 'top'];
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.ready = false;
  }

  setMode(m) {
    this.mode = m;
    this.ready = false;
  }

  drag(dx, dy) {
    this.dragTime = 0;
    if (this.mode === 'cab') {
      this.lookYaw = clamp(this.lookYaw - dx * 0.005, -2.3, 2.3);
      this.lookPitch = clamp(this.lookPitch - dy * 0.004, -0.6, 0.5);
    } else {
      this.orbitYaw = wrapAngle(this.orbitYaw - dx * 0.006);
      this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, 0.02, 1.25);
    }
  }

  zoom(delta) {
    this.distance = clamp(this.distance * (1 + delta * 0.0012), 8, 46);
  }

  update(dt) {
    const p = this.truck.physics;
    const cam = this.camera;
    this.dragTime += dt;
    if (this.mode === 'cab') {
      const m = this.truck.model;
      const g = this.truck.group;
      g.updateMatrixWorld(true);
      tmp.copy(m.eye);
      // small head motion from acceleration
      tmp.z += clamp(-p.accel * 0.012, -0.05, 0.05);
      tmp.x += clamp(p.latAccel * 0.008, -0.04, 0.04);
      tmp.applyMatrix4(g.matrixWorld);
      cam.position.copy(tmp);
      if (this.dragTime > 2.5) {
        this.lookYaw = damp(this.lookYaw, 0, 3, dt);
        this.lookPitch = damp(this.lookPitch, 0, 3, dt);
      }
      const yaw = p.yaw + this.lookYaw;
      const pitch = -0.08 + this.lookPitch - p.pitch - p.bumpPitch * 0.7;
      tmp2.set(cam.position.x + Math.sin(yaw) * Math.cos(pitch), cam.position.y + Math.sin(pitch), cam.position.z + Math.cos(yaw) * Math.cos(pitch));
      cam.up.set(0, 1, 0);
      cam.lookAt(tmp2);
      cam.rotateZ(-(p.roll + p.bumpRoll) * 0.8);
      if (cam.near !== 0.12) {
        cam.near = 0.12;
        cam.fov = 68;
        cam.updateProjectionMatrix();
      }
      this.ready = true;
      return;
    }
    if (cam.near !== 0.5) {
      cam.near = 0.5;
      cam.fov = 62;
      cam.updateProjectionMatrix();
    }
    // focus on the middle of the rig
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let cx = p.x + fx * 1.5;
    let cz = p.z + fz * 1.5;
    let len = 8;
    if (p.trailer) {
      const ax = p.trailerAxle();
      cx = (cx * 2 + ax.x) / 3;
      cz = (cz * 2 + ax.z) / 3;
      len = 18;
    }
    const focus = tmp.set(cx, p.y + 2.6, cz);
    if (this.mode === 'top') {
      const h = 30 + len;
      this.pos.set(focus.x - fx * 6, focus.y + h, focus.z - fz * 6);
      this.target.copy(focus);
      cam.position.copy(this.pos);
      cam.up.set(fx, 0, fz);
      cam.lookAt(this.target);
      this.ready = true;
      return;
    }
    cam.up.set(0, 1, 0);
    // auto-return behind the truck when the player stops orbiting; reversing looks forward-ish
    if (this.dragTime > 2.2) {
      const want = p.v < -0.5 ? 0 : 0;
      this.orbitYaw = wrapAngle(this.orbitYaw + wrapAngle(want - this.orbitYaw) * clamp(dt * 1.2, 0, 1));
      this.orbitPitch = damp(this.orbitPitch, 0.14, 1.2, dt);
    }
    // heading used for the chase view lags behind the truck a little
    this.followYaw = this.followYaw === undefined || !this.ready ? p.yaw : this.followYaw + wrapAngle(p.yaw - this.followYaw) * clamp(dt * 2.6, 0, 1);
    const yaw = this.followYaw + Math.PI + this.orbitYaw;
    const dist = this.distance + len * 0.35;
    const want = tmp2.set(focus.x + Math.sin(yaw) * Math.cos(this.orbitPitch) * dist, focus.y + Math.sin(this.orbitPitch) * dist + 1.5, focus.z + Math.cos(yaw) * Math.cos(this.orbitPitch) * dist);
    // keep above terrain and outside buildings
    const ground = this.world.terrainHeight(want.x, want.z);
    want.y = Math.max(want.y, ground + 1.6);
    let k = 1;
    for (let i = 0; i < 6; i++) {
      const x = lerp(focus.x, want.x, k);
      const z = lerp(focus.z, want.z, k);
      if (!this.inside(x, z, lerp(focus.y, want.y, k))) break;
      k *= 0.72;
    }
    want.set(lerp(focus.x, want.x, k), lerp(focus.y, want.y, k), lerp(focus.z, want.z, k));
    if (!this.ready) {
      this.pos.copy(want);
      this.target.copy(focus);
      this.ready = true;
    } else {
      this.pos.x = damp(this.pos.x, want.x, 9, dt);
      this.pos.y = damp(this.pos.y, want.y, 6, dt);
      this.pos.z = damp(this.pos.z, want.z, 9, dt);
      this.target.lerp(focus, clamp(dt * 12, 0, 1));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.target);
  }

  inside(x, z, y) {
    const list = this.world.colliders?.query(x - 1, z - 1, x + 1, z + 1) ?? [];
    for (const c of list) {
      if ((c.h ?? 10) + (this.world.terrainHeight(c.x, c.z) ?? 0) < y) continue;
      const lx = x - c.x;
      const lz = z - c.z;
      const cs = Math.cos(c.heading);
      const sn = Math.sin(c.heading);
      if (Math.abs(lx * cs - lz * sn) < c.w / 2 + 0.6 && Math.abs(lx * sn + lz * cs) < c.d / 2 + 0.6) return true;
    }
    return false;
  }
}

// Rear-view mirrors for the cab view. Each side renders once from the driver's eye reflected in the main
// mirror's plane; the main glass shows the middle of that image and the wide-angle glass below shows all of it.
const MW = 320;
const MH = 400;
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();

function setUV(mesh, u0, u1, w0, w1) {
  const g = mesh.geometry;
  const src = g.userData.uvSource ?? (g.userData.uvSource = g.attributes.uv.clone());
  const out = new Float32Array(src.count * 2);
  for (let i = 0; i < src.count; i++) {
    // the camera behind the glass sees the scene left-right reversed
    out[i * 2] = 1 - (u0 + src.getX(i) * (u1 - u0));
    // glTF texture coordinates run from the top; render targets from the bottom
    out[i * 2 + 1] = w0 + (1 - src.getY(i)) * (w1 - w0);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(out, 2));
}

export class Mirrors {
  constructor(engine, truck, every) {
    this.engine = engine;
    this.truck = truck;
    this.every = every;
    this.frame = 0;
    this.targets = [new THREE.WebGLRenderTarget(MW, MH), new THREE.WebGLRenderTarget(MW, MH)];
    this.cams = [new THREE.PerspectiveCamera(46, MW / MH, 0.4, 420), new THREE.PerspectiveCamera(46, MW / MH, 0.4, 420)];
    this.mats = this.targets.map((t) => new THREE.MeshBasicMaterial({ map: t.texture }));
    this.attached = null;
  }

  attach(model) {
    this.attached = model;
    this.sides = model.lineup
      ? [
          { main: model.mirrorL, wide: model.mirrorWL },
          { main: model.mirrorR, wide: model.mirrorWR },
        ]
      : [{ main: model.mirrorL }, { main: model.mirrorR }];
    for (const sd of this.sides) {
      sd.originals = [sd.main?.material, sd.wide?.material];
      if (model.lineup) {
        if (sd.main) setUV(sd.main, 0.2, 0.8, 0.3, 0.95);
        if (sd.wide) setUV(sd.wide, 0, 1, 0, 1);
      }
    }
    if (!model.lineup) for (const m of this.mats) m.map.repeat.set(-1, 1), m.map.offset.set(1, 0), (m.map.wrapS = THREE.RepeatWrapping);
    this.active = false;
  }

  setActive(active) {
    if (!this.attached) return;
    if (active && !this.active) this.frame = 0;
    if (active !== this.active) {
      this.sides.forEach((sd, i) => {
        if (sd.main) sd.main.material = active ? this.mats[i] : sd.originals[0];
        if (sd.wide) sd.wide.material = active ? this.mats[i] : sd.originals[1];
      });
    }
    this.active = active;
  }

  render() {
    if (!this.active || !this.attached) return;
    this.frame++;
    // first frame after entering the cab renders at once, then every N frames
    if ((this.frame - 1) % this.every) return;
    const r = this.engine.renderer;
    const scene = this.engine.scene;
    const m = this.attached;
    const prev = r.getRenderTarget();
    const shadows = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    const interior = m.interiorNode;
    if (interior) interior.visible = false;
    this.sides.forEach((sd, i) => {
      const mesh = sd.main;
      if (!mesh) return;
      const cam = this.cams[i];
      const info = mesh.userData.mirror;
      if (info && m.lineup) {
        // reflect the eye in the mirror plane and look through the glass centre
        const frame = m.body;
        frame.updateMatrixWorld(true);
        const c = v1.fromArray(info.centre).applyMatrix4(frame.matrixWorld);
        const n = v2.fromArray(info.normal).transformDirection(frame.matrixWorld);
        const d = v3.copy(m.eye).applyMatrix4(frame.matrixWorld).sub(c).dot(n);
        cam.position.copy(m.eye).applyMatrix4(frame.matrixWorld).addScaledVector(n, -2 * d);
        cam.up.fromArray(info.up).transformDirection(frame.matrixWorld);
        cam.lookAt(c);
        // the camera sits behind the glass: clip everything up to just past it (the mirror's own housing)
        const near = cam.position.distanceTo(c) + 0.12;
        if (Math.abs(cam.near - near) > 0.01) {
          cam.near = near;
          cam.updateProjectionMatrix();
        }
      } else {
        if (!mesh.userData.centre) {
          mesh.geometry.computeBoundingBox();
          mesh.userData.centre = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
        }
        cam.position.copy(mesh.userData.centre);
        mesh.localToWorld(cam.position);
        const p = this.truck.physics;
        const back = p.yaw + Math.PI + (i === 0 ? 0.06 : -0.06);
        cam.up.set(0, 1, 0);
        cam.lookAt(cam.position.x + Math.sin(back) * 10, cam.position.y - 0.9, cam.position.z + Math.cos(back) * 10);
      }
      mesh.visible = false;
      if (sd.wide) sd.wide.visible = false;
      r.setRenderTarget(this.targets[i]);
      r.render(scene, cam);
      mesh.visible = true;
      if (sd.wide) sd.wide.visible = true;
    });
    if (interior) interior.visible = true;
    r.shadowMap.autoUpdate = shadows;
    r.setRenderTarget(prev);
  }
}
