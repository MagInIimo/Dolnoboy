import { project, SCALE, WATER_LEVEL } from '../core/geo.js';
import { fbm, noise2 } from '../core/util.js';

// Regional relief: [lat, lon, radius km, amplitude m]
const HILLS = [
  [57.9, 33.3, 140, 38],
  [55.4, 35.6, 170, 18],
  [53.0, 37.0, 260, 26],
  [51.3, 37.5, 220, 24],
  [52.5, 46.0, 260, 30],
  [53.42, 49.6, 38, 95],
  [55.2, 52.0, 160, 16],
  [56.6, 59.6, 230, 70],
  [55.1, 59.3, 140, 85],
  [54.6, 57.3, 120, 60],
  [44.25, 39.25, 55, 230],
  [43.75, 40.05, 70, 320],
  [44.55, 38.35, 35, 140],
  [43.95, 42.95, 45, 140],
  [45.0, 42.1, 90, 55],
  [61.4, 34.5, 160, 22],
  [48.9, 44.0, 140, 22],
];

const hillCenters = HILLS.map(([lat, lon, km, amp]) => {
  const p = project(lat, lon);
  return { x: p.x, z: p.z, r: (km * 1000) / SCALE, amp };
});

export function reliefAmplitude(x, z) {
  let amp = 7;
  for (const h of hillCenters) {
    const dx = (x - h.x) / h.r;
    const dz = (z - h.z) / h.r;
    const q = dx * dx + dz * dz;
    if (q < 9) amp += h.amp * Math.exp(-q);
  }
  return amp;
}

export function naturalHeight(x, z) {
  const amp = reliefAmplitude(x, z);
  const broad = fbm(x / 2600 + 13.1, z / 2600 - 7.7, 4);
  const ridges = 1 - Math.abs(noise2(x / 1300 + 3.3, z / 1300 + 9.1));
  const mid = fbm(x / 420 - 4.2, z / 420 + 1.9, 3);
  const fine = noise2(x / 70, z / 70);
  let h = amp * (0.42 + 0.38 * broad + 0.2 * ridges * ridges) + mid * Math.min(6, 1.5 + amp * 0.08) + fine * 0.35;
  return WATER_LEVEL + 3.2 + Math.max(0, h);
}

// 0 = humid green, 1 = dry steppe grass. Derived from latitude/longitude bands.
export function dryness(x, z, lat) {
  const base = Math.min(1, Math.max(0, (52.5 - lat) / 5.5));
  return Math.min(1, Math.max(0, base + 0.18 * fbm(x / 1800, z / 1800, 2)));
}

// Forest coverage probability 0..1 depending on region and noise.
export function forestDensity(x, z, lat, lon) {
  let regional;
  if (lat > 58.5) regional = 0.78;
  else if (lat > 56.5) regional = 0.62;
  else if (lat > 54.5) regional = 0.48;
  else if (lat > 52) regional = 0.3;
  else if (lat > 49) regional = 0.16;
  else regional = 0.1;
  if (lon > 56 && lat > 54) regional = Math.max(regional, 0.6);
  if (lat < 45 && lon < 41) regional = 0.7;
  const n = fbm(x / 900 + 41.3, z / 900 - 12.9, 4) * 0.5 + 0.5;
  return Math.max(0, Math.min(1, (n - (1 - regional)) * 3.2 + 0.5));
}
