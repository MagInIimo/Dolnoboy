// One game metre stands for SCALE real metres along the map (1:10). Trucks, roads and buildings stay real size.
export const SCALE = 10;
// Game clock: one real second is TIME_SCALE game seconds (a day lasts 72 real minutes).
export const TIME_SCALE = 20;
// Game hours a truck needs per real kilometre of route at an average 62 km/h.
export const GAME_HOURS_PER_KM = TIME_SCALE / (SCALE * 62);
export const WATER_LEVEL = -2;

const R = 6371000;
const RAD = Math.PI / 180;
const PHI1 = 48 * RAD;
const PHI2 = 62 * RAD;
const PHI0 = 55.75 * RAD;
const LAMBDA0 = 42 * RAD;
const N = Math.log(Math.cos(PHI1) / Math.cos(PHI2)) / Math.log(Math.tan(Math.PI / 4 + PHI2 / 2) / Math.tan(Math.PI / 4 + PHI1 / 2));
const F = (Math.cos(PHI1) * Math.pow(Math.tan(Math.PI / 4 + PHI1 / 2), N)) / N;
const RHO0 = (R * F) / Math.pow(Math.tan(Math.PI / 4 + PHI0 / 2), N);

export function project(lat, lon) {
  const rho = (R * F) / Math.pow(Math.tan(Math.PI / 4 + (lat * RAD) / 2), N);
  const theta = N * (lon * RAD - LAMBDA0);
  const x = rho * Math.sin(theta);
  const y = RHO0 - rho * Math.cos(theta);
  return { x: x / SCALE, z: -y / SCALE };
}

export function unproject(x, z) {
  const px = x * SCALE;
  const py = -z * SCALE;
  const rho = Math.sign(N) * Math.hypot(px, RHO0 - py);
  const theta = Math.atan2(px, RHO0 - py);
  const lat = 2 * Math.atan(Math.pow((R * F) / rho, 1 / N)) - Math.PI / 2;
  const lon = LAMBDA0 + theta / N;
  return { lat: lat / RAD, lon: lon / RAD };
}

export const toRealKm = (meters) => (meters * SCALE) / 1000;
