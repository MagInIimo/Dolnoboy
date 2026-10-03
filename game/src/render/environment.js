import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';

// Colour keys by sun elevation (degrees)
const KEYS = [
  { e: -18, zenith: 0x05080f, horizon: 0x0b1220, sun: 0x000000, fog: 0x0a0f18, hemiSky: 0x1a2438, hemiGround: 0x07090c, sunI: 0, hemiI: 0.16 },
  { e: -6, zenith: 0x111d36, horizon: 0x3a3d52, sun: 0x2a1a10, fog: 0x2b3042, hemiSky: 0x2f3b58, hemiGround: 0x0c0d10, sunI: 0, hemiI: 0.28 },
  { e: 0, zenith: 0x2c4a7c, horizon: 0xe08a4c, sun: 0xff8a3c, fog: 0x8a7a72, hemiSky: 0x6a7ea6, hemiGround: 0x2a2620, sunI: 0.9, hemiI: 0.5 },
  { e: 8, zenith: 0x3a68a8, horizon: 0xe8b98a, sun: 0xffc48a, fog: 0xb5b2aa, hemiSky: 0x9fb4d6, hemiGround: 0x3d3a30, sunI: 2.1, hemiI: 0.75 },
  { e: 25, zenith: 0x3d70b8, horizon: 0xbcd2e6, sun: 0xfff0dc, fog: 0xc0d0dc, hemiSky: 0xb8cce6, hemiGround: 0x4a4a3c, sunI: 3.0, hemiI: 0.95 },
  { e: 60, zenith: 0x2f66b6, horizon: 0xc2d8ec, sun: 0xfff8ee, fog: 0xc6d6e2, hemiSky: 0xc2d6ee, hemiGround: 0x50503e, sunI: 3.3, hemiI: 1.0 },
];

export const WEATHERS = {
  clear: { ru: 'Ясно', en: 'Clear', cloud: 0.15, overcast: 0, fogFar: 6500, rain: 0, grip: 1 },
  cloudy: { ru: 'Облачно', en: 'Cloudy', cloud: 0.6, overcast: 0.25, fogFar: 5200, rain: 0, grip: 1 },
  overcast: { ru: 'Пасмурно', en: 'Overcast', cloud: 1, overcast: 0.75, fogFar: 3600, rain: 0, grip: 0.97 },
  rain: { ru: 'Дождь', en: 'Rain', cloud: 1, overcast: 0.9, fogFar: 1300, rain: 1, grip: 0.72 },
  fog: { ru: 'Туман', en: 'Fog', cloud: 0.8, overcast: 0.7, fogFar: 340, rain: 0, grip: 0.9 },
};

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function mixKey(e, field) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  if (e < KEYS[0].e) b = a;
  const t = b === a ? 0 : clamp((e - a.e) / (b.e - a.e), 0, 1);
  if (typeof a[field] === 'number' && field.endsWith('I')) return lerp(a[field], b[field], t);
  return tmpA.setHex(a[field]).lerp(tmpB.setHex(b[field]), t).clone();
}

export class Environment {
  constructor(engine) {
    this.engine = engine;
    this.hour = 9.5;
    this.weather = 'clear';
    this.weatherBlend = { ...WEATHERS.clear };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.nightFactor = 0;
    this.wet = 0;
    this.lastEnvSun = new THREE.Vector3(0, -1, 0);
    this.lastEnvWeather = '';
  }

  setWeather(id) {
    if (WEATHERS[id]) this.weather = id;
  }

  update(dt) {
    const target = WEATHERS[this.weather];
    const k = 1 - Math.exp(-dt * 0.25);
    for (const key of ['cloud', 'overcast', 'fogFar', 'rain', 'grip']) this.weatherBlend[key] = lerp(this.weatherBlend[key], target[key], k);
    this.wet = clamp(this.wet + (target.rain > 0.5 ? dt * 0.02 : -dt * 0.004), 0, 1);
    const h = ((this.hour % 24) + 24) % 24;
    // daylight between 05:30 and 20:00; azimuth swings from east (+x) through south (+z) to west
    let elev;
    let az;
    if (h >= 5.5 && h <= 20) {
      const t = (h - 5.5) / 14.5;
      elev = 52 * Math.sin(Math.PI * t);
      az = (0.5 - t) * Math.PI * 1.15;
    } else {
      const p = ((h - 20 + 24) % 24) / 9.5;
      elev = -24 * Math.sin(Math.PI * p);
      az = -0.575 * Math.PI - p * 0.85 * Math.PI;
    }
    const er = (elev * Math.PI) / 180;
    this.sunElevation = elev;
    this.sunDir.set(Math.sin(az) * Math.cos(er), Math.sin(er), Math.cos(az) * Math.cos(er)).normalize();
    // sun from the south means +z in our coordinates
    const wb = this.weatherBlend;
    const zenith = mixKey(elev, 'zenith');
    const horizon = mixKey(elev, 'horizon');
    const sunCol = mixKey(elev, 'sun');
    const fogCol = mixKey(elev, 'fog');
    const grey = new THREE.Color(0x8d949b).multiplyScalar(clamp((elev + 6) / 30, 0.08, 1));
    zenith.lerp(grey, wb.overcast * 0.85);
    horizon.lerp(grey.clone().multiplyScalar(1.08), wb.overcast * 0.8);
    fogCol.lerp(grey, wb.overcast * 0.85);
    this.nightFactor = 1 - smoothstep(-8, 2, elev);
    const e = this.engine;
    const sky = e.sky.uniforms;
    sky.uSunDir.value.copy(this.sunDir);
    sky.uZenith.value.copy(zenith);
    sky.uHorizon.value.copy(horizon);
    sky.uSunColor.value.copy(sunCol);
    sky.uCloud.value = wb.cloud;
    sky.uOvercast.value = wb.overcast;
    sky.uNight.value = this.nightFactor;
    sky.uGround.value.copy(fogCol).multiplyScalar(0.7);
    const sunI = mixKey(elev, 'sunI') * (1 - wb.overcast * 0.78);
    e.sun.color.copy(sunCol);
    e.sun.intensity = sunI;
    e.moon.intensity = this.nightFactor * 0.32 * (1 - wb.overcast * 0.6);
    e.hemi.color.copy(mixKey(elev, 'hemiSky')).lerp(grey, wb.overcast * 0.5);
    e.hemi.groundColor.copy(mixKey(elev, 'hemiGround'));
    e.hemi.intensity = mixKey(elev, 'hemiI') * (1 + wb.overcast * 0.25);
    e.scene.fog.color.copy(fogCol);
    e.fogFarTarget = wb.fogFar;
    e.renderer.setClearColor(fogCol);
    e.surfaces.uniforms.uWet.value = this.wet;
    e.environmentDirty = this.lastEnvSun.distanceTo(this.sunDir) > 0.035 || Math.abs((this.lastEnvOvercast ?? -1) - wb.overcast) > 0.08;
    if (e.environmentDirty) {
      this.lastEnvSun.copy(this.sunDir);
      this.lastEnvOvercast = wb.overcast;
    }
  }
}
