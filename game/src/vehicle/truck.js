import * as THREE from 'three';
import { buildTractor, drawGauges, vehicleMaterials } from './truck-model.js';
import { buildTrailer } from './trailer-model.js';
import { TruckPhysics } from './physics.js';
import { TRAILERS, CARGO, COMPANIES, TRUCKS, PAINTS } from '../data/economy.js';

// Visual + physical truck with optional semi-trailer.
export class Truck {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.physics = new TruckPhysics(world);
    this.group = new THREE.Group();
    this.group.name = 'truck';
    engine.scene.add(this.group);
    this.model = null;
    this.trailerModel = null;
    this.trailerGroup = new THREE.Group();
    engine.scene.add(this.trailerGroup);
    this.indicator = 0;
    this.hazard = false;
    this.blink = 0;
    this.lightsOn = false;
    this.highBeam = false;
    this.headlights = [];
    const M = vehicleMaterials();
    this.mats = M;
    for (const s of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff2dc, 0, 120, 0.42, 0.55, 1.4);
      spot.castShadow = false;
      this.group.add(spot);
      this.group.add(spot.target);
      this.headlights.push(spot);
      spot.userData.side = s;
    }
    this.fill = new THREE.PointLight(0xffe7c4, 0, 18, 2);
    this.group.add(this.fill);
  }

  setTruck(id, paintId, upgrades = {}) {
    if (this.model) this.group.remove(this.model.root);
    const spec = TRUCKS[id] ?? TRUCKS.sokol;
    const paint = PAINTS.find((p) => p.id === paintId) ?? PAINTS[0];
    this.model = buildTractor({ cab: spec.cab, color: new THREE.Color(paint.color).getHex(), lightBar: (upgrades.lights ?? 0) > 0 });
    this.group.add(this.model.root);
    this.model.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const p = this.physics;
    p.engineTorque = spec.torque * (1 + [0, 0.07, 0.14, 0.22][upgrades.engine ?? 0]);
    p.brakeBonus = [0, 0.1, 0.2, 0.32][upgrades.brakes ?? 0];
    p.tank = [600, 900, 1200][upgrades.tank ?? 0];
    p.gripBonus = [0, 0.08, 0.16][upgrades.tyres ?? 0];
    this.spec = spec;
    for (const spot of this.headlights) {
      spot.position.set(spot.userData.side * 0.85, 0.95, this.model.cabFront + 0.3);
      spot.target.position.set(spot.userData.side * 1.5, -1.2, this.model.cabFront + 40);
    }
    this.fill.position.set(0, 1.4, this.model.cabFront + 3);
  }

  attachTrailer(cargoId, companyId, lang, seed, mass) {
    this.detachTrailer();
    const cargo = CARGO[cargoId];
    const company = COMPANIES[companyId] ?? null;
    const type = cargo?.trailer ?? 'curtain';
    this.trailerModel = buildTrailer(type, { cargo, company, lang, seed });
    this.trailerGroup.add(this.trailerModel.root);
    this.trailerModel.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const spec = TRAILERS[type];
    this.physics.trailer = { type, mass: spec.mass, length: spec.length, axle: spec.axle };
    this.physics.cargoMass = mass ?? 0;
  }

  detachTrailer() {
    if (this.trailerModel) {
      this.trailerGroup.remove(this.trailerModel.root);
      this.trailerModel.root.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
    }
    this.trailerModel = null;
    this.physics.trailer = null;
    this.physics.cargoMass = 0;
  }

  update(dt, nightFactor, interiorView) {
    const p = this.physics;
    const m = this.model;
    if (!m) return;
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.set(0, 0, 0);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = p.yaw;
    // body pitch/roll plus a touch of suspension response to acceleration and cornering
    this.group.rotation.x = -p.pitch;
    this.group.rotation.z = p.roll;
    m.body.rotation.x = -clampAbs(p.accel * 0.006, 0.03);
    m.body.rotation.z = clampAbs(p.latAccel * 0.006, 0.035);
    for (const w of m.wheels) w.children.forEach((c) => (c.rotation.x = (w.position.x < 0 ? -1 : 1) * p.wheelSpin));
    for (const w of m.frontWheels) w.rotation.y = (w.position.x < 0 ? Math.PI : 0) + p.steerAngle;
    if (m.interior) {
      m.interior.group.visible = interiorView;
      m.interior.wheel.rotation.z = -p.steerAngle * 9;
      this.gaugeTimer = (this.gaugeTimer ?? 0) - dt;
      if (interiorView && this.gaugeTimer <= 0) {
        this.gaugeTimer = 0.08;
        drawGauges(m.interior, Math.abs(p.v) * 3.6, p.rpm, p.fuel / p.tank, this.lightsOn);
      }
    }
    // trailer follows the hitch
    if (this.trailerModel) {
      const hp = p.hitchPos();
      const t = this.trailerModel.root;
      t.position.set(hp.x, p.y + Math.sin(p.pitch) * 0.35, hp.z);
      t.rotation.order = 'YXZ';
      t.rotation.y = p.trailerYaw;
      t.rotation.x = -p.trailerPitch;
      t.rotation.z = p.trailerRoll * 0.8;
      for (const w of this.trailerModel.wheels) w.children.forEach((c) => (c.rotation.x = (w.position.x < 0 ? -1 : 1) * p.trailerWheelSpin));
    }
    // lights
    this.blink += dt;
    const blinkOn = this.blink % 0.8 < 0.42;
    const left = (this.indicator < 0 || this.hazard) && blinkOn;
    const right = (this.indicator > 0 || this.hazard) && blinkOn;
    this.mats.indicator.emissiveIntensity = left ? 2.4 : 0;
    this.mats.indicatorR.emissiveIntensity = right ? 2.4 : 0;
    const on = this.lightsOn;
    this.mats.headlight.emissiveIntensity = on ? (this.highBeam ? 3.2 : 2.2) : 0.05;
    this.mats.tail.emissiveIntensity = p.braking > 0.1 ? 3 : on ? 1.1 : 0.15;
    for (const spot of this.headlights) {
      spot.intensity = on ? (this.highBeam ? 260 : 140) * (0.35 + nightFactor * 0.65) : 0;
      spot.distance = this.highBeam ? 190 : 110;
      spot.angle = this.highBeam ? 0.36 : 0.46;
    }
    this.fill.intensity = on ? nightFactor * 12 : 0;
  }
}

function clampAbs(v, m) {
  return Math.max(-m, Math.min(m, v));
}
