import { CARGO, COMPANIES, BASE_RATE, levelForXp } from '../data/economy.js';
import { SCALE } from '../core/geo.js';
import { hashString, rng } from '../core/util.js';

export function maxDistanceKm(level) {
  if (level >= 6) return 99999;
  return [0, 650, 900, 1300, 1800, 2400][level];
}

export class JobMarket {
  constructor(world, distances) {
    this.world = world;
    this.distances = distances;
    this.accepts = new Map();
    for (const lot of world.lots) {
      if (lot.kind !== 'company') continue;
      for (const cargo of COMPANIES[lot.company].in) {
        if (!this.accepts.has(cargo)) this.accepts.set(cargo, []);
        this.accepts.get(cargo).push(lot);
      }
    }
  }

  km(fromCity, toCity) {
    return Math.round((this.distances[fromCity][toCity] * SCALE) / 1000);
  }

  // Offers refresh every four game hours per city.
  offers(cityIndex, state) {
    const level = levelForXp(state.xp);
    const bucket = Math.floor(state.time / 240);
    const r = rng(hashString('jobs' + cityIndex + ':' + bucket));
    const city = this.world.cities[cityIndex];
    const sources = city.lots.filter((l) => l.kind === 'company' && COMPANIES[l.company].out.length);
    const list = [];
    for (const lot of sources) {
      const co = COMPANIES[lot.company];
      const count = 2 + Math.floor(r() * 2);
      for (let k = 0; k < count; k++) {
        const cargoId = co.out[Math.floor(r() * co.out.length)];
        const cargo = CARGO[cargoId];
        const dests = (this.accepts.get(cargoId) ?? []).filter((d) => d.city !== cityIndex && Number.isFinite(this.distances[cityIndex][d.city]));
        if (!dests.length) continue;
        // prefer nearer destinations, but keep a long haul or two in every market
        dests.sort((a, b) => this.distances[cityIndex][a.city] - this.distances[cityIndex][b.city]);
        const pickRange = Math.min(dests.length, k === 0 ? 10 : dests.length);
        const dest = dests[Math.floor(r() * pickRange)];
        const km = this.km(cityIndex, dest.city);
        if (km < 60) continue;
        const urgent = r() < 0.18;
        const mass = Math.round((cargo.mass[0] + r() * (cargo.mass[1] - cargo.mass[0])) * 10) / 10;
        const pay = Math.round((3500 + BASE_RATE * km * cargo.rate * (0.92 + r() * 0.2) * (urgent ? 1.3 : 1) * (1 + Math.min(level, 10) * 0.012)) / 100) * 100;
        const hours = (km / 62) * (urgent ? 1.12 : 1.45) + 2.5;
        list.push({
          id: `${cityIndex}-${bucket}-${lot.id}-${k}`,
          cargo: cargoId,
          mass,
          from: { city: cityIndex, lot: lot.id, company: lot.company },
          to: { city: dest.city, lot: dest.id, company: dest.company },
          km,
          pay,
          urgent,
          deadlineMinutes: Math.round(hours * 60),
          locked: cargo.level > level || km > maxDistanceKm(level),
          needLevel: Math.max(cargo.level, km > maxDistanceKm(level) ? levelNeededFor(km) : 0),
          seed: Math.floor(r() * 1e6),
        });
      }
    }
    list.sort((a, b) => Number(a.locked) - Number(b.locked) || b.pay - a.pay);
    return list.slice(0, 14);
  }
}

function levelNeededFor(km) {
  for (let l = 1; l < 7; l++) if (km <= maxDistanceKm(l)) return l;
  return 6;
}

// Final payout given the job, game time and parking quality.
export function settle(job, state, now, parkingQuality, cargoDamage) {
  const late = Math.max(0, now - job.deadline);
  const latePenalty = late > 0 ? Math.min(0.6, 0.15 + late / 600) : 0;
  const damagePenalty = Math.min(0.8, cargoDamage * 1.2);
  const parkingBonus = parkingQuality === 'perfect' ? 0.05 : 0;
  const pay = Math.round(job.pay * (1 - latePenalty) * (1 - damagePenalty) * (1 + parkingBonus));
  const cargo = CARGO[job.cargo];
  const xp = Math.round(job.km * (1 + (cargo.fragile > 1 ? 0.25 : 0) + (cargo.adr ? 0.3 : 0) + (job.urgent ? 0.25 : 0)) + (parkingQuality === 'perfect' ? 150 : parkingQuality === 'good' ? 60 : 0)) * (late > 0 ? 0.6 : 1);
  return { pay: Math.max(0, pay), xp: Math.round(xp), late, latePenalty, damagePenalty, parkingBonus };
}
