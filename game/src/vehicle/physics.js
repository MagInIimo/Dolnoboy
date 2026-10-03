import { SCALE, WATER_LEVEL } from '../core/geo.js';
import { angleDiff, clamp, lerp, wrapAngle } from '../core/util.js';

export const GEARS = [14.93, 11.64, 9.02, 7.04, 5.64, 4.4, 3.39, 2.65, 2.05, 1.6, 1.24, 1.0];
const REVERSE = [13.0, 10.2];
const FINAL = 2.64;
const WHEEL_R = 0.52;
const G = 9.81;
const IDLE = 620;
const MAX_RPM = 2150;
const WHEELBASE = 3.8;
const HITCH = 0.35;
const TRACTOR_MASS = 8200;
const LIMITER = 90 / 3.6;

export function torqueCurve(rpm) {
  // normalised: flat plateau 1000-1400 rpm, tapering above
  if (rpm < 800) return 0.62 + ((rpm - 600) / 200) * 0.2;
  if (rpm < 1000) return 0.82 + ((rpm - 800) / 200) * 0.18;
  if (rpm <= 1400) return 1;
  return Math.max(0.35, 1 - (rpm - 1400) * 0.00052);
}

// Oriented box overlap returning minimal translation vector to push A out of B.
function obbPush(a, b) {
  const axes = [a.h, a.h + Math.PI / 2, b.h, b.h + Math.PI / 2];
  let best = null;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  for (const ang of axes) {
    const ax = Math.sin(ang);
    const az = Math.cos(ang);
    const proj = (r) => Math.abs(Math.sin(r.h) * ax + Math.cos(r.h) * az) * (r.d / 2) + Math.abs(-Math.cos(r.h) * ax + Math.sin(r.h) * az) * (r.w / 2);
    const dist = dx * ax + dz * az;
    const overlap = proj(a) + proj(b) - Math.abs(dist);
    if (overlap <= 0) return null;
    if (!best || overlap < best.overlap) best = { overlap, x: ax * Math.sign(dist || 1), z: az * Math.sign(dist || 1) };
  }
  return best;
}

export class TruckPhysics {
  constructor(world) {
    this.world = world;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.yaw = 0;
    this.v = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.steerAngle = 0;
    this.gear = 1;
    this.rpm = IDLE;
    this.shiftTimer = 0;
    this.shiftLock = 0;
    this.direction = 1;
    this.automatic = true;
    this.retarder = 0;
    this.parking = true;
    this.cruise = 0;
    this.engineOn = true;
    this.fuel = 600;
    this.tank = 600;
    this.damage = 0;
    this.trailer = null; // {spec, mass, yaw, length, axle}
    this.trailerYaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.trailerPitch = 0;
    this.trailerRoll = 0;
    this.slip = 0;
    this.groundSurface = 'road';
    this.inWater = false;
    this.impact = 0;
    this.impactKind = '';
    this.odometer = 0;
    this.engineTorque = 2200;
    this.brakeBonus = 0;
    this.gripBonus = 0;
    this.cargoMass = 0;
    this.load = 0;
    this.lastGroundY = null;
    this.hitStamp = 0;
    this.wheelSpin = 0;
    this.trailerWheelSpin = 0;
    this.braking = 0;
    this.throttle = 0;
    this.accel = 0;
    this.latAccel = 0;
    this.fuelRate = 0;
  }

  get mass() {
    return TRACTOR_MASS + (this.trailer ? this.trailer.mass + this.cargoMass : 0);
  }

  place(x, z, yaw, trailerYaw = yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.trailerYaw = trailerYaw;
    this.v = 0;
    this.yawRate = 0;
    this.lastGroundY = null;
    const g = this.world.groundAt(x, z, null);
    this.y = g.y;
  }

  hitchPos() {
    return { x: this.x + Math.sin(this.yaw) * HITCH, z: this.z + Math.cos(this.yaw) * HITCH };
  }

  trailerAxle() {
    const h = this.hitchPos();
    const a = this.trailer?.axle ?? 8;
    return { x: h.x - Math.sin(this.trailerYaw) * a, z: h.z - Math.cos(this.trailerYaw) * a };
  }

  ratio() {
    if (this.gear === 0) return 0;
    if (this.gear < 0) return REVERSE[-this.gear - 1] * FINAL;
    return GEARS[this.gear - 1] * FINAL;
  }

  wheelRpm() {
    return (Math.abs(this.v) / WHEEL_R) * (60 / (2 * Math.PI));
  }

  autoShift(throttle, dt) {
    this.shiftLock = Math.max(0, this.shiftLock - dt);
    if (this.gear < 0 || this.gear === 0) return;
    const wr = this.wheelRpm();
    const rpmAt = (g) => wr * GEARS[g - 1] * FINAL;
    if (Math.abs(this.v) < 1.2) {
      const loadFactor = this.mass / 40000;
      const start = loadFactor > 0.7 ? 1 : loadFactor > 0.45 ? 2 : 3;
      if (this.gear > start && this.shiftLock <= 0) {
        this.gear = start;
        this.shiftLock = 0.2;
      }
      return;
    }
    if (this.shiftLock > 0) return;
    const up = throttle > 0.6 ? 1750 : 1450;
    if (rpmAt(this.gear) > up && this.gear < 12) {
      let g = this.gear + 1;
      while (g < 12 && rpmAt(g + 1) > 1150 && throttle < 0.6) g++;
      this.shift(g);
    } else if (rpmAt(this.gear) < (throttle > 0.7 ? 1100 : 880) && this.gear > 1) {
      let g = this.gear - 1;
      while (g > 1 && rpmAt(g) < 1150) g--;
      this.shift(g);
    }
  }

  shift(g) {
    if (g === this.gear) return;
    this.gear = g;
    this.shiftTimer = 0.32;
    this.shiftLock = 0.9;
    this.onShift?.(g);
  }

  // input: {throttle, brake, steer, handbrake, reverseHeld}
  step(dt, input, colliders) {
    const W = this.world;
    const env = this.env ?? { grip: 1 };
    let throttle = clamp(input.throttle, 0, 1);
    let brake = clamp(input.brake, 0, 1);
    // arcade automatic: holding brake at a standstill selects reverse, then pedals swap roles
    if (this.automatic) {
      if (this.direction > 0 && brake > 0.5 && throttle < 0.1 && Math.abs(this.v) < 0.3) {
        this.reverseTimer = (this.reverseTimer ?? 0) + dt;
        if (this.reverseTimer > 0.35) {
          this.direction = -1;
          this.gear = -1;
          this.reverseTimer = 0;
          this.onShift?.(-1);
        }
      } else if (this.direction < 0 && throttle > 0.5 && brake < 0.1 && Math.abs(this.v) < 0.3) {
        this.reverseTimer = (this.reverseTimer ?? 0) + dt;
        if (this.reverseTimer > 0.2) {
          this.direction = 1;
          this.gear = 1;
          this.reverseTimer = 0;
          this.onShift?.(1);
        }
      } else this.reverseTimer = 0;
      if (this.direction < 0) [throttle, brake] = [brake, throttle];
    }
    if (input.forceReverse !== undefined) {
      // explicit direction toggle (touch controls, R key)
      if (input.forceReverse && this.direction > 0 && Math.abs(this.v) < 1.5) {
        this.direction = -1;
        this.gear = -1;
      } else if (!input.forceReverse && this.direction < 0 && Math.abs(this.v) < 1.5) {
        this.direction = 1;
        this.gear = 1;
      }
    }
    if (throttle > 0.05 || brake > 0.05) this.parking = false;
    if (input.handbrake) this.parking = true;
    if (!this.engineOn || this.fuel <= 0) throttle = 0;
    // cruise control holds speed until braking
    if (this.cruise > 0) {
      if (brake > 0.05 || this.direction < 0) this.cruise = 0;
      else throttle = Math.max(throttle, clamp((this.cruise - this.v) * 0.6, 0, 1));
    }
    if (this.v > LIMITER) throttle *= clamp(1 - (this.v - LIMITER) * 2, 0, 1);
    this.throttle = throttle;
    this.braking = brake;
    const mass = this.mass;
    // ground
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    const refY = this.lastGroundY;
    const gR = W.groundAt(this.x, this.z, refY);
    const gF = W.groundAt(this.x + fx * WHEELBASE, this.z + fz * WHEELBASE, refY);
    const gL = W.groundAt(this.x + fx * 2 + rx * -1.1, this.z + fz * 2 + rz * -1.1, refY);
    const gRt = W.groundAt(this.x + fx * 2 + rx * 1.1, this.z + fz * 2 + rz * 1.1, refY);
    this.groundSurface = gR.surface;
    const pitchTarget = Math.atan2(gF.y - gR.y, WHEELBASE);
    const rollTarget = Math.atan2(gRt.y - gL.y, 2.2);
    this.pitch = lerp(this.pitch, pitchTarget, clamp(dt * 10, 0, 1));
    this.roll = lerp(this.roll, rollTarget, clamp(dt * 8, 0, 1));
    const groundY = (gR.y + gF.y) / 2;
    this.y = this.lastGroundY === null ? gR.y : lerp(this.y, gR.y, clamp(dt * 18, 0, 1));
    this.lastGroundY = groundY;
    this.inWater = gR.surface === 'water' && gR.y < WATER_LEVEL - 1.2;
    const offroad = gR.surface === 'grass' || gR.surface === 'water';
    const surfGrip = offroad ? 0.62 : gR.surface === 'sidewalk' ? 0.9 : 1;
    const grip = 0.82 * surfGrip * env.grip * (1 + this.gripBonus);
    // engine and drivetrain
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.automatic && this.direction > 0 && this.gear <= 0) this.gear = 1;
    if (this.automatic && this.direction > 0) this.autoShift(throttle, dt);
    const ratio = this.ratio();
    const wheelRpm = this.wheelRpm();
    let rpmTarget = ratio ? wheelRpm * ratio : IDLE;
    const clutchSlip = Math.abs(this.v) < 2.2 && ratio;
    if (clutchSlip) rpmTarget = Math.max(rpmTarget, IDLE + throttle * 650);
    rpmTarget = clamp(Math.max(IDLE, rpmTarget), IDLE * 0.9, MAX_RPM + 80);
    if (!this.engineOn) rpmTarget = 0;
    this.rpm = lerp(this.rpm, rpmTarget, clamp(dt * (this.shiftTimer > 0 ? 6 : 12), 0, 1));
    let drive = 0;
    if (ratio && this.shiftTimer <= 0 && throttle > 0) {
      const torque = this.engineTorque * torqueCurve(this.rpm) * throttle * (this.rpm > MAX_RPM ? 0.1 : 1);
      drive = (torque * ratio * 0.92) / WHEEL_R;
      drive = Math.min(drive, grip * G * (TRACTOR_MASS * 0.55 + (this.trailer ? 6000 : 0)) * 1.1);
      drive *= this.gear < 0 ? -1 : 1;
    }
    const sign = Math.sign(this.v);
    let resist = 0;
    // engine brake and retarder
    if (throttle < 0.05 && ratio && this.engineOn && Math.abs(this.v) > 1) resist += (this.rpm / 2000) * 5200 * (1 + this.brakeBonus);
    if (this.retarder > 0 && Math.abs(this.v) > 2) resist += this.retarder * 9000 * (1 + this.brakeBonus);
    const maxBrake = mass * 6.2 * Math.min(1, grip * 1.15) * (1 + this.brakeBonus * 0.5);
    resist += brake * maxBrake;
    if (this.parking) resist += mass * 4;
    // hill-start assist: holds the rig when the driver releases both pedals at a standstill
    if (Math.abs(this.v) < 0.4 && throttle < 0.05) resist += mass * 3.2;
    const roll = (offroad ? 0.03 : 0.0065) * mass * G;
    const aero = 0.5 * 1.2 * 6.8 * this.v * this.v;
    const gradeForce = -mass * G * Math.sin(this.pitch);
    let accel = (drive + gradeForce) / mass;
    const decel = (resist + roll + aero) / mass;
    if (Math.abs(this.v) < 0.05 && Math.abs(drive) < decel * mass + 1e-3 && (Math.abs(gradeForce) < resist + roll || this.parking)) {
      this.v = 0;
    } else {
      this.v += accel * dt;
      const s = Math.sign(this.v) || sign;
      const dv = decel * dt;
      if (Math.abs(this.v) <= dv) this.v = 0;
      else this.v -= s * dv;
    }
    if (this.inWater) this.v *= 1 - clamp(dt * 3, 0, 1);
    this.accel = accel - decel * Math.sign(this.v || 1);
    // steering: rate limited, angle shrinks with speed
    const maxSteer = 0.62 / (1 + (this.v * this.v) / 170);
    // input.steer: +1 = right. Positive wheel angle turns toward +yaw (left), hence the sign flip.
    const target = -clamp(input.steer, -1, 1) * maxSteer;
    const rate = input.steerRate ?? 1.6;
    this.steerAngle += clamp(target - this.steerAngle, -rate * dt, rate * dt);
    // yaw from the kinematic bicycle model, saturated by lateral grip
    let yawRate = (this.v * Math.tan(this.steerAngle)) / WHEELBASE;
    const latLimit = grip * G * 0.95;
    const lat = Math.abs(this.v * yawRate);
    this.slip = 0;
    if (lat > latLimit) {
      this.slip = clamp((lat - latLimit) / latLimit, 0, 1);
      yawRate *= latLimit / lat;
    }
    this.latAccel = this.v * yawRate;
    this.yawRate = yawRate;
    const prevX = this.x;
    const prevZ = this.z;
    const prevYaw = this.yaw;
    const prevTrailer = this.trailerYaw;
    this.x += fx * this.v * dt;
    this.z += fz * this.v * dt;
    this.yaw = wrapAngle(this.yaw + yawRate * dt);
    // trailer: no lateral velocity at the trailer axle
    if (this.trailer) {
      const hv = { x: this.v * fx - HITCH * yawRate * rx, z: this.v * fz - HITCH * yawRate * rz };
      const trx = -Math.cos(this.trailerYaw);
      const trz = Math.sin(this.trailerYaw);
      const tRate = -(hv.x * trx + hv.z * trz) / this.trailer.axle;
      this.trailerYaw = wrapAngle(this.trailerYaw + tRate * dt);
      const fold = angleDiff(this.trailerYaw, this.yaw);
      const limit = 1.45;
      if (Math.abs(fold) > limit) {
        this.trailerYaw = wrapAngle(this.yaw + Math.sign(fold) * limit);
        this.v *= 0.6;
        this.jackknife = 1;
      } else this.jackknife = Math.max(0, (this.jackknife ?? 0) - dt);
      const ax = this.trailerAxle();
      const tg0 = W.groundAt(ax.x, ax.z, groundY);
      const hp = this.hitchPos();
      this.trailerPitch = lerp(this.trailerPitch, Math.atan2(gR.y + 0.2 - tg0.y, this.trailer.axle), clamp(dt * 8, 0, 1));
      const tfx = Math.sin(this.trailerYaw);
      const tfz = Math.cos(this.trailerYaw);
      const tl = W.groundAt(ax.x - tfz * 1.1 * -1, ax.z + tfx * 1.1 * -1, groundY);
      const tr = W.groundAt(ax.x - tfz * 1.1, ax.z + tfx * 1.1, groundY);
      this.trailerRoll = lerp(this.trailerRoll, Math.atan2(tr.y - tl.y, 2.2), clamp(dt * 6, 0, 1));
      void hp;
    }
    // collisions
    this.impact = 0;
    if (colliders) this.collide(colliders, dt, prevX, prevZ, prevYaw, prevTrailer);
    // fuel, odometer, wheels
    const dist = Math.hypot(this.x - prevX, this.z - prevZ);
    this.odometer += dist;
    const powerKw = (this.engineTorque * torqueCurve(this.rpm) * throttle * this.rpm * 2 * Math.PI) / 60 / 1000;
    this.fuelRate = this.engineOn ? (powerKw * 0.21) / 0.84 / 3600 + 0.0005 : 0;
    // every game metre is SCALE real metres of road, so the tank drains as over the real distance
    this.fuel = Math.max(0, this.fuel - this.fuelRate * dt * SCALE * 0.75);
    if (this.fuel <= 0) this.engineOn = false;
    this.wheelSpin += (this.v / WHEEL_R) * dt;
    this.trailerWheelSpin += (this.v / 0.5) * dt;
  }

  boxes() {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const list = [{ part: 'tractor', x: this.x + fx * 1.6, z: this.z + fz * 1.6, w: 2.5, d: 7.2, h: this.yaw }];
    if (this.trailer) {
      const hp = this.hitchPos();
      const tfx = Math.sin(this.trailerYaw);
      const tfz = Math.cos(this.trailerYaw);
      const front = 1.3;
      const len = this.trailer.length;
      const c = front - len / 2;
      list.push({ part: 'trailer', x: hp.x + tfx * c, z: hp.z + tfz * c, w: 2.55, d: len, h: this.trailerYaw });
    }
    return list;
  }

  collide(colliders, dt, prevX, prevZ, prevYaw, prevTrailer) {
    const boxes = this.boxes();
    for (const box of boxes) {
      const r = Math.hypot(box.w, box.d) / 2 + 2;
      const near = colliders.query(box.x - r, box.z - r, box.x + r, box.z + r);
      const seen = new Set();
      for (const c of near) {
        if (seen.has(c)) continue;
        seen.add(c);
        const push = obbPush(box, { x: c.x, z: c.z, w: c.w, d: c.d, h: c.heading });
        if (!push) continue;
        const speed = Math.abs(this.v);
        if (box.part === 'tractor') {
          this.x += push.x * push.overlap;
          this.z += push.z * push.overlap;
        } else {
          // trailer: rotate it away and stop the rig
          const hp = this.hitchPos();
          const lx = box.x - hp.x;
          const lz = box.z - hp.z;
          const cross = lx * push.z - lz * push.x;
          this.trailerYaw = wrapAngle(this.trailerYaw - Math.sign(cross) * Math.min(0.02, push.overlap / 8));
          if (push.overlap > 0.4) {
            this.x = prevX;
            this.z = prevZ;
            this.yaw = prevYaw;
            this.trailerYaw = prevTrailer;
          }
        }
        // impact severity relative to the push direction
        const fx = Math.sin(this.yaw);
        const fz = Math.cos(this.yaw);
        const normalSpeed = Math.abs(this.v * (fx * push.x + fz * push.z));
        if (normalSpeed > 0.8) {
          if (normalSpeed > this.impact) {
            // remembered so moving obstacles (traffic) can react to being hit
            this.hitCollider = c;
            this.hitPush = { x: push.x, z: push.z, speed: normalSpeed };
          }
          this.impact = Math.max(this.impact, normalSpeed);
          this.impactKind = c.kind ?? 'building';
          this.damage = Math.min(1, this.damage + normalSpeed * 0.004);
        }
        this.v *= 1 - clamp(normalSpeed * 0.18 + 0.05, 0, 0.95);
        if (speed < 0.5 && push.overlap > 0.05) this.v = 0;
      }
    }
  }
}
