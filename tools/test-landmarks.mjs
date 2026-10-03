// Landmark sites per city: every landmark gets a place.
import { World } from '../game/src/world/world.js';
import { CityBuildings } from '../game/src/world/city-buildings.js';
import { landmarkSites } from '../game/src/render/landmarks.js';

const world = new World();
const missing = [];
for (const c of world.cities) {
  const sites = landmarkSites(world, c);
  for (const id of c.landmarks) if (!sites.some((s) => s.id === id)) missing.push(c.id + ':' + id);
}
const msk = world.cities.find((c) => c.id === 'moscow');
console.log(JSON.stringify({ missing, moscow: landmarkSites(world, msk).map((s) => [s.id, Math.round(Math.hypot(s.x - msk.x, s.z - msk.z))]) }));
void CityBuildings;
