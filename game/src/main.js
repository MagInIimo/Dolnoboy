import * as THREE from 'three';
import { World } from './world/world.js';
import { Engine } from './render/engine.js';
import { SurfaceMaterials, buildSurfaceArrays, loadPhotoTextures, macroNoiseTexture } from './render/surfaces.js';
import { WorldView } from './render/world-view.js';
import { BuildingLayer, buildingMaterial, facadeArray } from './render/building-layer.js';
import { Truck } from './vehicle/truck.js';
import { CameraRig, Mirrors } from './render/camera-rig.js';
import { Input } from './core/input.js';
import { TreeSystem } from './render/trees.js';

async function boot() {
  const frame = document.querySelector('#frame');
  const status = document.querySelector('#status');
  const say = (t) => (status.textContent = t);
  say('world');
  await new Promise((r) => setTimeout(r, 20));
  const world = new World();
  const engine = new Engine(frame, 'medium');
  say('textures');
  const photos = await loadPhotoTextures();
  const surfaces = new SurfaceMaterials(buildSurfaceArrays(photos, 512), macroNoiseTexture(), 'medium');
  engine.attachSurfaces(surfaces);
  const facade = facadeArray(512);
  const buildingMat = buildingMaterial(facade);
  const buildings = new BuildingLayer(world, buildingMat, surfaces.road, surfaces.roadOverlay, engine.scene, engine.quality);
  const trees = new TreeSystem(engine, world, engine.quality);
  const view = new WorldView(engine, world, surfaces, [buildings, trees]);
  const truck = new Truck(engine, world);
  truck.setTruck('buran', 'red', {});
  const params = new URLSearchParams(location.hash.slice(1));
  const city = world.cities.find((c) => c.id === (params.get('city') ?? 'moscow'));
  const entry = city.plan.entryNodes[Number(params.get('entry') ?? 0)];
  let e = entry.stub;
  let sAt = e.len * 0.5;
  if (params.get('hw')) {
    const [a, b] = params.get('hw').split('-');
    e = world.highways.find((h) => h.A.id === a && h.B.id === b).edge;
    sAt = Number(params.get('s') ?? 2000);
  }
  const p = world.net.pointAt(e, sAt, e.type.id === 'M' ? 5.6 : 2.0);
  truck.physics.place(p.x, p.z, p.heading);
  if (params.get('trailer') !== 'no') truck.attachTrailer(params.get('cargo') ?? 'groceries', 'retail', 'ru', 7, 12000);
  truck.physics.env = { grip: 1 };
  const rig = new CameraRig(engine, truck, world);
  const mirrors = new Mirrors(engine, truck, 2);
  mirrors.attach(truck.model);
  engine.env.hour = Number(params.get('hour') ?? 12);
  engine.env.setWeather(params.get('weather') ?? 'clear');
  const input = new Input(frame, (a) => {
    const t = truck;
    if (a === 'camera') rig.cycle();
    if (a === 'lights') t.lightsOn = !t.lightsOn;
    if (a === 'highBeam') t.highBeam = !t.highBeam;
    if (a === 'indicatorLeft') t.indicator = t.indicator === -1 ? 0 : -1;
    if (a === 'indicatorRight') t.indicator = t.indicator === 1 ? 0 : 1;
    if (a === 'hazard') t.hazard = !t.hazard;
    if (a === 'handbrake') t.physics.parking = !t.physics.parking;
    if (a === 'cruise') t.physics.cruise = t.physics.cruise ? 0 : Math.max(8, t.physics.v);
    if (a === 'retarder') t.physics.retarder = (t.physics.retarder + 1) % 4;
  });
  input.bindView(engine.renderer.domElement);
  input.onDrag = (dx, dy) => rig.drag(dx, dy);
  input.onZoom = (d) => rig.zoom(d);
  addEventListener('resize', () => engine.resize());
  window.dev = { engine, view, world, truck, rig, input };
  const focus = new THREE.Vector3(p.x, p.y, p.z);
  for (let i = 0; i < 400 && (view.pending > 0 || i < 2); i++) {
    view.update(focus, 40);
    trees.update(0.5, focus);
    say('chunks ' + view.pending);
    await new Promise((r) => setTimeout(r, 0));
  }
  say('');
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    const controls = input.read(dt);
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      truck.physics.step(STEP, controls, world.colliders);
      acc -= STEP;
      steps++;
    }
    if (steps === 6) acc = 0;
    const night = engine.env.nightFactor;
    truck.update(dt, night, rig.mode === 'cab');
    rig.update(dt);
    focus.set(truck.physics.x, truck.physics.y, truck.physics.z);
    engine.update(dt, focus);
    view.update(focus, 5);
    trees.update(dt, engine.camera.position);
    mirrors.setActive(rig.mode === 'cab');
    mirrors.render();
    engine.render();
    status.textContent = `${Math.round(Math.abs(truck.physics.v) * 3.6)} км/ч  G${truck.physics.gear} ${Math.round(truck.physics.rpm)}rpm ${truck.physics.groundSurface}`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  document.querySelector('#status').textContent = 'ERROR ' + e.message;
  console.error(e);
});
