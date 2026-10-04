import { TRUCKS, STARTER_TRUCK, OLD_TRUCKS } from '../data/economy.js';

export const SAVE_KEY = 'dalnoboy-rossii-save-v2';

export function freshState(lang = 'ru') {
  return {
    version: 2,
    lang,
    money: 30000,
    xp: 0,
    time: 9 * 60,
    day: 1,
    stats: { deliveries: 0, km: 0, earned: 0, fines: 0, perfectParks: 0 },
    truck: { model: STARTER_TRUCK, paint: 'white', upgrades: { engine: 0, brakes: 0, tank: 0, tyres: 0, lights: 0 }, owned: [STARTER_TRUCK], paints: ['white'] },
    pos: null,
    fuel: 600,
    damage: 0,
    job: null,
    trailer: null,
    target: null,
    weather: 'clear',
    weatherUntil: 9 * 60 + 180,
    visited: [],
    settings: { quality: null, sound: true, volume: 0.8, controls: 'two', camera: 'chase', units: 'metric', autoLights: true, tutorial: true },
    tutorialStep: 0,
    lastReward: 0,
    updatedAt: 0,
  };
}

const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function sanitize(raw, lang = 'ru') {
  const base = freshState(lang);
  if (!raw || typeof raw !== 'object' || raw.version !== 2) return base;
  const s = { ...base, ...raw };
  s.lang = raw.lang === 'en' ? 'en' : 'ru';
  s.money = num(raw.money, base.money, -1e7, 1e10);
  s.xp = num(raw.xp, 0, 0, 1e9);
  s.time = num(raw.time, base.time, 0, 1e9);
  s.fuel = num(raw.fuel, base.fuel, 0, 1300);
  s.damage = num(raw.damage, 0, 0, 1);
  s.stats = { ...base.stats, ...(raw.stats ?? {}) };
  s.truck = { ...base.truck, ...(raw.truck ?? {}) };
  s.truck.upgrades = { ...base.truck.upgrades, ...(raw.truck?.upgrades ?? {}) };
  if (!Array.isArray(s.truck.owned)) s.truck.owned = [STARTER_TRUCK];
  // trucks of the first release map onto the lineup; unknown ids are dropped
  const known = (id) => (TRUCKS[id] ? id : OLD_TRUCKS[id] ?? null);
  s.truck.owned = [...new Set([STARTER_TRUCK, ...s.truck.owned.map(known).filter(Boolean)])];
  s.truck.model = known(s.truck.model) ?? STARTER_TRUCK;
  if (!s.truck.owned.includes(s.truck.model)) s.truck.owned.push(s.truck.model);
  if (!Array.isArray(s.truck.paints)) s.truck.paints = ['white'];
  s.settings = { ...base.settings, ...(raw.settings ?? {}) };
  if (!Array.isArray(s.visited)) s.visited = [];
  if (s.pos && !(Number.isFinite(s.pos.x) && Number.isFinite(s.pos.z))) s.pos = null;
  return s;
}
