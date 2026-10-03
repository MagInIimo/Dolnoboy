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
      const pitch = -0.08 + this.lookPitch - p.pitch;
      tmp2.set(cam.position.x + Math.sin(yaw) * Math.cos(pitch), cam.position.y + Math.sin(pitch), cam.position.z + Math.cos(yaw) * Math.cos(pitch));
      cam.up.set(0, 1, 0);
      cam.lookAt(tmp2);
      cam.rotateZ(-p.roll * 0.8);
      if (cam.near !== 0.08) {
        cam.near = 0.08;
        cam.fov = 68;
        cam.updateProjectionMatrix();
      }
      this.ready = true;
      return;
    }
    if (cam.near !== 0.3) {
      cam.near = 0.3;
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

// Rear-view mirrors for the cab view: two small render targets mapped onto the mirror glass.
export class Mirrors {
  constructor(engine, truck, every) {
    this.engine = engine;
    this.truck = truck;
    this.every = every;
    this.frame = 0;
    this.targets = [new THREE.WebGLRenderTarget(256, 384), new THREE.WebGLRenderTarget(256, 384)];
    for (const t of this.targets) t.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.cams = [new THREE.PerspectiveCamera(26, 256 / 384, 0.5, 900), new THREE.PerspectiveCamera(26, 256 / 384, 0.5, 900)];
    this.mats = this.targets.map((t) => new THREE.MeshBasicMaterial({ map: t.texture }));
    for (const m of this.mats) m.map.wrapS = THREE.RepeatWrapping;
    for (const m of this.mats) {
      m.map.repeat.x = -1;
      m.map.offset.x = 1;
    }
    this.attached = null;
  }

  attach(model) {
    this.attached = model;
    this.originals = [model.mirrorL.material, model.mirrorR.material];
  }

  setActive(active) {
    const m = this.attached;
    if (!m) return;
    m.mirrorL.material = active ? this.mats[0] : this.originals[0];
    m.mirrorR.material = active ? this.mats[1] : this.originals[1];
    this.active = active;
  }

  render() {
    if (!this.active || !this.attached) return;
    this.frame++;
    if (this.frame % this.every) return;
    const r = this.engine.renderer;
    const scene = this.engine.scene;
    const p = this.truck.physics;
    const m = this.attached;
    const prev = r.getRenderTarget();
    [m.mirrorL, m.mirrorR].forEach((mesh, i) => {
      const cam = this.cams[i];
      mesh.getWorldPosition(cam.position);
      const side = i === 0 ? -1 : 1;
      const back = p.yaw + Math.PI + side * -0.06;
      cam.lookAt(cam.position.x + Math.sin(back) * 10, cam.position.y - 0.9, cam.position.z + Math.cos(back) * 10);
      mesh.visible = false;
      r.setRenderTarget(this.targets[i]);
      r.render(scene, cam);
      mesh.visible = true;
    });
    r.setRenderTarget(prev);
  }
}
