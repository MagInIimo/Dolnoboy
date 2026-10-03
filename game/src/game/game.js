import * as THREE from 'three';
import { Engine } from '../render/engine.js';
import { SurfaceMaterials, buildSurfaceArrays, loadPhotoTextures, macroNoiseTexture } from '../render/surfaces.js';
import { WorldView } from '../render/world-view.js';
import { BuildingLayer, buildingMaterial, facadeArray } from '../render/building-layer.js';
import { TreeSystem } from '../render/trees.js';
import { Truck } from '../vehicle/truck.js';
import { buildTrailer } from '../vehicle/trailer-model.js';
import { CameraRig, Mirrors } from '../render/camera-rig.js';
import { Input } from '../core/input.js';
import { Sound } from '../core/audio.js';
import { Hud } from '../ui/hud.js';
import { Menus } from '../ui/menus.js';
import { TouchControls } from '../ui/touch.js';
import { makeT, TITLE } from '../ui/i18n.js';
import { JobMarket, settle } from './jobs.js';
import { Navigator, cityDistances } from './route.js';
import { layoutLot } from '../world/lot-layout.js';
import { WEATHERS } from '../render/environment.js';
import { CARGO, COMPANIES, TRAILERS, TRUCKS, UPGRADES, PAINTS, FUEL_PRICE, levelForXp } from '../data/economy.js';
import { SCALE, TIME_SCALE, unproject } from '../core/geo.js';
import { angleDiff, clamp, formatMoney, rng } from '../core/util.js';
import { Traffic } from '../traffic/traffic.js';
import { Props } from '../render/props.js';
import { Rain } from '../render/rain.js';

const STEP = 1 / 60;

export class Game {
  constructor(frame, platform, state, loading) {
    this.frame = frame;
    this.platform = platform;
    this.state = state;
    this.loading = loading;
    this.lang = state.lang;
    this.t = makeT(this.lang);
    this.touch = matchMedia('(pointer: coarse)').matches || platform.mobile;
    document.body.classList.toggle('touch', this.touch);
    this.paused = false;
    this.acc = 0;
    this.cameraHits = new Map();
    this.fineCooldown = 0;
  }

  async init(world) {
    const s = this.state;
    if (!s.settings.quality) s.settings.quality = this.touch ? 'low' : 'medium';
    this.world = world;
    const L = this.loading;
    const engine = new Engine(this.frame, s.settings.quality);
    this.engine = engine;
    L.stage('loadingTextures', 0.35);
    const photos = await loadPhotoTextures((p) => L.stage('loadingTextures', 0.35 + p * 0.15));
    const texSize = engine.quality.texture;
    this.surfaces = new SurfaceMaterials(buildSurfaceArrays(photos, texSize), macroNoiseTexture(), s.settings.quality);
    engine.attachSurfaces(this.surfaces);
    L.stage('loadingFacades', 0.55);
    await L.frame();
    this.buildingMat = buildingMaterial(facadeArray(texSize >= 512 ? 512 : 256));
    this.buildings = new BuildingLayer(world, this.buildingMat, this.surfaces.road, this.surfaces.roadOverlay, engine.scene, engine.quality);
    L.stage('loadingTrees', 0.62);
    await L.frame();
    this.trees = new TreeSystem(engine, world, engine.quality);
    this.props = new Props(engine, world, engine.quality, this.lang);
    this.view = new WorldView(engine, world, this.surfaces, [this.buildings, this.trees, this.props]);
    this.truck = new Truck(engine, world);
    this.applyTruck();
    this.rig = new CameraRig(engine, this.truck, world);
    this.mirrors = new Mirrors(engine, this.truck, engine.quality.mirrors);
    this.mirrors.attach(this.truck.model);
    this.rain = new Rain(engine, engine.quality);
    this.distances = cityDistances(world);
    this.jobs = new JobMarket(world, this.distances);
    this.nav = new Navigator(world);
    this.sound = new Sound();
    this.sound.volume = s.settings.volume;
    this.sound.enabled = s.settings.sound;
    this.input = new Input(this.frame, (a) => this.action(a));
    this.input.bindView(engine.renderer.domElement);
    this.input.onDrag = (dx, dy) => this.rig.drag(dx, dy);
    this.input.onZoom = (d) => this.rig.zoom(d);
    this.hud = new Hud(this.frame, this);
    this.menus = new Menus(this.frame, this);
    this.touchUi = new TouchControls(this.frame, this.input, this);
    this.touchUi.setVisible(this.touch);
    this.touchUi.setMode(s.settings.controls);
    this.traffic = new Traffic(engine, world, engine.quality);
    this.truck.physics.onShift = () => this.sound.click(300, 0.08);
    // world state
    this.placeTruck();
    engine.env.hour = (s.time % 1440) / 60;
    engine.env.setWeather(s.weather);
    engine.env.weatherBlend = { ...WEATHERS[s.weather] };
    this.truck.physics.env = { grip: 1 };
    this.restoreJob();
    // stream the surroundings before showing the game
    L.stage('loadingDone', 0.7);
    const focus = new THREE.Vector3(this.truck.physics.x, this.truck.physics.y, this.truck.physics.z);
    engine.update(0.016, focus);
    for (let i = 0; i < 2000; i++) {
      this.view.update(focus, 30);
      this.trees.update(1, focus);
      const left = this.view.pending;
      L.stage('loadingDone', 0.7 + 0.28 * (1 - Math.min(1, left / 40)));
      if (left === 0 && i > 2) break;
      await L.frame();
    }
    this.rig.update(0.016);
    this.trees.update(1, engine.camera.position);
    engine.update(0.016, focus);
    engine.render();
    // events
    this.platform.onPause((paused) => this.onPlatformPause(paused));
    const blur = () => {
      this.input.reset();
      this.focusLost = true;
      this.updateRunning();
      this.save(true);
    };
    addEventListener('blur', blur);
    addEventListener('focus', () => {
      this.focusLost = false;
      this.updateRunning();
    });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (document.hidden) blur();
      this.updateRunning();
    });
    addEventListener('pagehide', () => this.save(true));
    addEventListener('resize', () => engine.resize());
    const unlock = () => this.sound.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    window.game = this;
    if (!s.job && s.stats.deliveries === 0 && s.settings.tutorial) {
      this.hud.notify(this.t('tutorial1'));
      this.menus.show('jobs');
    }
    this.updateRunning();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- helpers ----------
  name(o) {
    return this.lang === 'en' ? o.en : o.ru;
  }

  money(v) {
    return formatMoney(v, this.lang);
  }

  weatherName() {
    return this.name(WEATHERS[this.engine.env.weather]);
  }

  currentCity() {
    const p = this.truck.physics;
    const { city, d } = this.world.nearestCity(p.x, p.z);
    return d < city.Rout + 400 ? city : null;
  }

  currentJobLine() {
    const j = this.state.job;
    if (!j) return this.t('noActiveJob');
    return `${this.name(CARGO[j.cargo])}: ${this.name(this.world.cities[j.from.city])} → ${this.name(this.world.cities[j.to.city])}`;
  }

  nearbyLots() {
    const p = this.truck.physics;
    return [...new Set(this.world.lotHash.query(p.x - 500, p.z - 500, p.x + 500, p.z + 500))];
  }

  rewardAmount() {
    return 6000 + levelForXp(this.state.xp) * 2000;
  }

  repairCost() {
    return Math.round(this.truck.physics.damage * 60000);
  }

  atService() {
    const p = this.truck.physics;
    for (const lot of this.world.lotHash.query(p.x, p.z, p.x, p.z)) {
      if (lot.kind !== 'service') continue;
      const L = layoutLot(lot);
      if (L.zone && Math.hypot(p.x - L.zone.x, p.z - L.zone.z) < L.zone.r + 6) return lot;
    }
    return null;
  }

  applyTruck() {
    const s = this.state;
    this.truck.setTruck(s.truck.model, s.truck.paint, s.truck.upgrades);
    this.truck.physics.tank = [600, 900, 1200][s.truck.upgrades.tank ?? 0];
    if (this.mirrors) this.mirrors.attach(this.truck.model);
  }

  // ---------- placement ----------
  placeTruck() {
    const s = this.state;
    const p = this.truck.physics;
    if (s.pos) {
      p.place(s.pos.x, s.pos.z, s.pos.yaw, s.pos.trailerYaw ?? s.pos.yaw);
    } else {
      const start = this.startLot();
      const slot = layoutLot(start).slots[0];
      const f = { x: Math.sin(start.heading), z: Math.cos(start.heading) };
      // parked in the yard facing the road
      p.place(slot.x + f.x * 4, slot.z + f.z * 4, start.heading);
    }
    p.fuel = clamp(s.fuel, 0, p.tank);
    p.damage = s.damage;
  }

  startLot() {
    const moscow = this.world.cities.find((c) => c.id === 'moscow');
    return moscow.lots.find((l) => l.kind === 'company' && COMPANIES[l.company].kind === 'warehouse') ?? moscow.lots.find((l) => l.kind === 'company');
  }

  restoreJob() {
    const s = this.state;
    const j = s.job;
    if (!j) {
      if (s.target) this.setTarget(s.target);
      return;
    }
    if (j.stage === 'pickup') this.spawnParkedTrailer();
    else if (j.attached) {
      this.attachJobTrailer(s.pos?.trailerYaw ?? this.truck.physics.yaw);
    } else if (s.trailer) this.spawnParkedTrailer(s.trailer);
    this.routeForJob();
  }

  jobTrailerSpec() {
    const j = this.state.job;
    return { cargo: j.cargo, company: j.from.company, mass: j.mass * 1000, seed: j.seed };
  }

  spawnParkedTrailer(at = null) {
    this.removeParkedTrailer();
    const j = this.state.job;
    if (!j) return;
    const spec = this.jobTrailerSpec();
    const cargo = CARGO[spec.cargo];
    const model = buildTrailer(cargo.trailer, { cargo, company: COMPANIES[spec.company], lang: this.lang, seed: spec.seed });
    let pos = at;
    if (!pos) {
      const lot = this.world.lots[j.from.lot];
      const L = layoutLot(lot);
      const slot = L.slots[(spec.seed % Math.max(1, L.slots.length)) | 0] ?? L.slots[0];
      const len = TRAILERS[cargo.trailer].length;
      const f = { x: Math.sin(slot.heading), z: Math.cos(slot.heading) };
      const k = len / 2 - 1.3;
      pos = { x: slot.x + f.x * k, z: slot.z + f.z * k, yaw: slot.heading };
    }
    const g = this.world.groundAt(pos.x, pos.z, null);
    model.root.position.set(pos.x, g.y, pos.z);
    model.root.rotation.y = pos.yaw;
    model.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.engine.scene.add(model.root);
    const front = 1.3;
    const c = front - model.length / 2;
    const collider = { x: pos.x + Math.sin(pos.yaw) * c, z: pos.z + Math.cos(pos.yaw) * c, w: 2.6, d: model.length, heading: pos.yaw, kind: 'trailer', h: 4 };
    const r = model.length / 2 + 2;
    this.world.colliders.insertBox(collider, collider.x - r, collider.z - r, collider.x + r, collider.z + r);
    this.parked = { model, pos, collider, r };
    this.state.trailer = { x: pos.x, z: pos.z, yaw: pos.yaw };
  }

  removeParkedTrailer() {
    if (!this.parked) return;
    const { model, collider, r } = this.parked;
    this.engine.scene.remove(model.root);
    this.world.colliders.remove(collider, collider.x - r, collider.z - r, collider.x + r, collider.z + r);
    this.parked = null;
  }

  attachJobTrailer(trailerYaw) {
    const spec = this.jobTrailerSpec();
    this.truck.attachTrailer(spec.cargo, spec.company, this.lang, spec.seed, spec.mass);
    this.truck.physics.trailerYaw = trailerYaw;
    this.state.job.attached = true;
    this.state.trailer = null;
  }

  routeForJob() {
    const j = this.state.job;
    if (!j) return;
    if (j.stage === 'pickup' || (!j.attached && this.parked)) {
      const at = this.parked?.pos;
      const lot = this.world.lots[j.from.lot];
      this.targetLabel = `${this.name(COMPANIES[j.from.company])}, ${this.name(this.world.cities[j.from.city])}`;
      this.setNavTarget(at ? { x: lot.frontX, z: lot.frontZ } : { x: lot.frontX, z: lot.frontZ });
      if (j.stage !== 'pickup') this.setNavTarget({ x: at.x, z: at.z });
    } else {
      const lot = this.world.lots[j.to.lot];
      this.targetLabel = `${this.name(COMPANIES[j.to.company])}, ${this.name(this.world.cities[j.to.city])}`;
      this.setNavTarget({ x: lot.frontX, z: lot.frontZ });
    }
  }

  setNavTarget(pt) {
    this.navTarget = pt;
    const p = this.truck.physics;
    this.nav.setTarget(pt, p.x, p.z, p.yaw);
  }

  setTarget(cityIndex) {
    const c = this.world.cities[cityIndex];
    if (!c) return;
    this.state.target = cityIndex;
    this.targetLabel = this.name(c);
    const node = c.plan.nodes[0] ?? { x: c.x, z: c.z };
    this.setNavTarget({ x: node.x, z: node.z });
  }

  // ---------- running state ----------
  updateRunning() {
    const running = !this.menus?.open && this.platform.pauses.size === 0 && !this.hidden && !this.focusLost;
    this.running = running;
    this.platform.gameplay(running);
    this.sound?.setActive(running && this.state.settings.sound);
    if (this.input) this.input.enabled = running;
    if (!running) this.sound?.horn(false);
  }

  onPlatformPause(paused) {
    this.input.reset();
    this.updateRunning();
    if (paused) this.save(true);
  }

  save(force = false) {
    const s = this.state;
    const p = this.truck.physics;
    s.pos = { x: p.x, z: p.z, yaw: p.yaw, trailerYaw: p.trailerYaw };
    s.fuel = p.fuel;
    s.damage = p.damage;
    s.weather = this.engine.env.weather;
    this.platform.save(s, force);
  }

  // ---------- actions ----------
  action(a) {
    const s = this.state;
    const p = this.truck.physics;
    const t = this.t;
    this.sound.unlock();
    if (this.menus.open) {
      if (a === 'pause' || a === 'map' || a === 'jobs' || a === 'garage') this.menuAction(a === 'pause' ? 'resume' : a);
      return;
    }
    switch (a) {
      case 'pause':
        this.openMenu('pause');
        break;
      case 'map':
        this.openMenu('map');
        break;
      case 'jobs':
        this.openMenu('jobs');
        break;
      case 'garage':
        this.openMenu('garage');
        break;
      case 'profile':
        this.openMenu('pause');
        break;
      case 'camera':
        this.rig.cycle();
        break;
      case 'cam1':
        this.rig.setMode('chase');
        break;
      case 'cam2':
        this.rig.setMode('cab');
        break;
      case 'cam3':
        this.rig.setMode('top');
        break;
      case 'lights':
        this.truck.lightsOn = !this.truck.lightsOn;
        this.manualLights = true;
        this.sound.click(1200, 0.05);
        break;
      case 'highBeam':
        this.truck.highBeam = !this.truck.highBeam;
        if (this.truck.highBeam) this.truck.lightsOn = true;
        break;
      case 'indicatorLeft':
        this.truck.indicator = this.truck.indicator === -1 ? 0 : -1;
        break;
      case 'indicatorRight':
        this.truck.indicator = this.truck.indicator === 1 ? 0 : 1;
        break;
      case 'hazard':
        this.truck.hazard = !this.truck.hazard;
        break;
      case 'horn':
        this.sound.horn(true);
        clearTimeout(this.hornTimer);
        this.hornTimer = setTimeout(() => this.sound.horn(false), 450);
        break;
      case 'handbrake':
        p.parking = !p.parking;
        this.sound.hiss(0.6, 0.18);
        break;
      case 'cruise':
        p.cruise = p.cruise ? 0 : p.v > 8 ? p.v : 0;
        this.hud.notify(`${t('cruise')}: ${p.cruise ? Math.round(p.cruise * 3.6) + ' ' + (this.lang === 'en' ? 'km/h' : 'км/ч') : t('off')}`);
        break;
      case 'retarder':
        p.retarder = (p.retarder + 1) % 4;
        break;
      case 'toggleReverse':
        if (Math.abs(p.v) > 1.5) {
          this.hud.notify(t('needStop'));
          break;
        }
        p.direction = p.direction > 0 ? -1 : 1;
        p.gear = p.direction > 0 ? 1 : -1;
        this.sound.click(300, 0.08);
        break;
      case 'trailer':
        this.trailerAction();
        break;
      case 'interact':
        this.interact();
        break;
    }
  }

  openMenu(screen, data) {
    this.input.reset();
    this.menus.show(screen, data);
    this.updateRunning();
    this.save(true);
  }

  closeMenu() {
    this.menus.show('');
    this.updateRunning();
  }

  async menuAction(act, v) {
    const s = this.state;
    const t = this.t;
    switch (act) {
      case 'back':
        if (['jobs', 'map', 'garage', 'settings', 'help', 'about'].includes(this.menus.screen) && this.menus.from === 'pause') this.menus.show('pause');
        else this.closeMenu();
        break;
      case 'resume':
        this.closeMenu();
        break;
      case 'jobs':
      case 'map':
      case 'garage':
      case 'settings':
      case 'help':
      case 'about':
        this.menus.from = this.menus.screen === 'pause' ? 'pause' : null;
        this.menus.show(act, act === 'garage' ? { tab: 'upgrades' } : null);
        this.updateRunning();
        break;
      case 'garageTab':
        this.menus.show('garage', { tab: v });
        break;
      case 'accept':
        this.acceptJob(v);
        break;
      case 'cancelJob':
        this.menus.show('confirm', { title: t('cancelJob'), text: t('sure', { price: this.money(this.cancelFee()) }), yes: 'cancelYes' });
        break;
      case 'cancelYes':
        this.cancelJob();
        this.closeMenu();
        break;
      case 'towYes':
        this.closeMenu();
        await this.tow();
        break;
      case 'gpsCity':
        this.setTarget(Number(v));
        this.hud.notify(t('gpsSet'));
        this.closeMenu();
        break;
      case 'zoomIn':
        this.menus.zoomMap(1.4);
        break;
      case 'zoomOut':
        this.menus.zoomMap(1 / 1.4);
        break;
      case 'mapCenter':
        this.menus.centerMap();
        break;
      case 'upgrade': {
        const u = UPGRADES[v];
        const lvl = s.truck.upgrades[v] ?? 0;
        const price = u.steps[lvl + 1];
        if (price !== undefined && s.money >= price) {
          s.money -= price;
          s.truck.upgrades[v] = lvl + 1;
          this.refitTruck();
          this.sound.chime('good');
        }
        this.menus.render();
        break;
      }
      case 'paint': {
        const paint = PAINTS.find((p) => p.id === v);
        if (!paint) break;
        if (!s.truck.paints.includes(v)) {
          if (s.money < paint.price) {
            this.hud.notify(t('notEnough'), 'bad');
            break;
          }
          s.money -= paint.price;
          s.truck.paints.push(v);
        }
        s.truck.paint = v;
        this.refitTruck();
        this.menus.render();
        break;
      }
      case 'truck': {
        const tr = TRUCKS[v];
        if (!s.truck.owned.includes(v)) {
          if (s.money < tr.price) break;
          s.money -= tr.price;
          s.truck.owned.push(v);
        }
        s.truck.model = v;
        this.refitTruck();
        this.menus.render();
        break;
      }
      case 'repair': {
        const cost = this.repairCost();
        if (cost > 0 && s.money >= cost) {
          s.money -= cost;
          this.truck.physics.damage = 0;
          this.hud.notify(t('repaired', { price: this.money(cost) }), 'good');
        }
        this.menus.render();
        break;
      }
      case 'adRepair': {
        const ok = await this.platform.rewarded();
        if (ok) {
          this.truck.physics.damage = 0;
          this.hud.notify(t('rewardThanks'), 'good');
        } else this.hud.notify(t('rewardFail'), 'bad');
        this.menus.render();
        break;
      }
      case 'adCash': {
        const wait = 240000 - (Date.now() - (s.lastReward ?? 0));
        if (wait > 0) {
          this.hud.notify(t('rewardWait', { min: Math.ceil(wait / 60000) }));
          break;
        }
        const amount = this.rewardAmount();
        const ok = await this.platform.rewarded();
        if (ok) {
          s.money += amount;
          s.lastReward = Date.now();
          this.hud.notify(t('rewardThanks') + ': +' + this.money(amount), 'good');
          this.sound.chime('good');
        } else this.hud.notify(t('rewardFail'), 'bad');
        this.menus.render();
        this.save(true);
        break;
      }
      case 'setting': {
        const [key, raw] = v.split(':');
        const val = raw === 'true' ? true : raw === 'false' ? false : Number.isFinite(Number(raw)) ? Number(raw) : raw;
        s.settings[key] = val;
        if (key === 'sound') {
          this.sound.enabled = val;
          this.updateRunning();
        }
        if (key === 'volume') this.sound.volume = val;
        if (key === 'controls') this.touchUi.setMode(val);
        if (key === 'quality') {
          this.save(true);
          location.reload();
          return;
        }
        this.save(true);
        this.menus.render();
        break;
      }
      case 'lang':
        s.lang = v;
        this.lang = v;
        this.t = makeT(v);
        document.documentElement.lang = v;
        document.title = TITLE[v];
        this.hud.t = this.t;
        this.hud.applyLanguage();
        this.props.setLanguage?.(v);
        this.save(true);
        this.menus.render();
        break;
      case 'licenses': {
        let text = '';
        try {
          text = await (await fetch('licenses.txt')).text();
        } catch {
          text = '';
        }
        this.menus.show('about', { licenses: text });
        break;
      }
    }
    this.save();
  }

  refitTruck() {
    const p = this.truck.physics;
    const keep = { trailer: p.trailer, cargoMass: p.cargoMass };
    this.applyTruck();
    p.trailer = keep.trailer;
    p.cargoMass = keep.cargoMass;
    p.fuel = Math.min(p.fuel, p.tank);
  }

  cancelFee() {
    const j = this.state.job;
    return j ? Math.round(j.pay * 0.15) : 0;
  }

  acceptJob(id) {
    const s = this.state;
    const city = this.currentCity();
    if (!city || s.job) return;
    const offer = this.jobs.offers(city.index, s).find((o) => o.id === id);
    if (!offer || offer.locked) return;
    s.job = { ...offer, stage: 'pickup', attached: false, accepted: s.time, deadline: s.time + offer.deadlineMinutes, cargoDamage: 0, startDamage: this.truck.physics.damage };
    s.target = null;
    if (this.truck.physics.trailer) this.truck.detachTrailer();
    this.spawnParkedTrailer();
    this.routeForJob();
    this.closeMenu();
    this.hud.notify(this.t('jobTaken', { company: this.name(COMPANIES[offer.from.company]) }), 'good');
    if (s.stats.deliveries === 0) this.hud.notify(this.t('tutorial2'));
    this.save(true);
  }

  cancelJob() {
    const s = this.state;
    if (!s.job) return;
    s.money -= this.cancelFee();
    s.job = null;
    s.trailer = null;
    this.removeParkedTrailer();
    this.truck.detachTrailer();
    this.nav.clear();
    this.navTarget = null;
    this.hud.notify(this.t('canceled'));
    this.save(true);
  }

  trailerAction() {
    const p = this.truck.physics;
    const j = this.state.job;
    if (p.trailer) {
      if (Math.abs(p.v) > 0.6) return this.hud.notify(this.t('needStop'));
      // uncouple: leave the trailer where it stands
      const hp = p.hitchPos();
      const yaw = p.trailerYaw;
      this.truck.detachTrailer();
      if (j) {
        j.attached = false;
        this.spawnParkedTrailer({ x: hp.x, z: hp.z, yaw });
        this.setNavTarget({ x: hp.x, z: hp.z });
      }
      this.hud.notify(this.t('trailerDropped'));
      this.sound.hiss(0.9, 0.25);
      this.save(true);
      return;
    }
    this.tryCouple();
  }

  coupleState() {
    if (!this.parked) return null;
    const p = this.truck.physics;
    const hp = p.hitchPos();
    const k = this.parked.pos;
    const d = Math.hypot(hp.x - k.x, hp.z - k.z);
    const ang = Math.abs(angleDiff(p.yaw, k.yaw));
    return { d, ang, ok: d < 1.6 && ang < 0.32 && Math.abs(p.v) < 1.2 };
  }

  tryCouple() {
    const c = this.coupleState();
    if (!c) return;
    if (!c.ok) {
      this.hud.notify(this.t('alignTrailer'));
      return;
    }
    const yaw = this.parked.pos.yaw;
    this.removeParkedTrailer();
    this.attachJobTrailer(yaw);
    const j = this.state.job;
    if (j.stage === 'pickup') {
      j.stage = 'deliver';
      j.pickupDamage = this.truck.physics.damage;
    }
    this.routeForJob();
    this.hud.notify(this.t('trailerCoupled'), 'good');
    this.sound.hiss(0.8, 0.3);
    this.save(true);
  }

  // Context-sensitive action under Enter / the big button.
  interact() {
    const c = this.contextAction;
    if (!c) return;
    if (c === 'attach') this.tryCouple();
    else if (c === 'deliver') this.deliver();
    else if (c === 'refuel') this.refuel();
    else if (c === 'service') this.openMenu('garage', { tab: 'upgrades' });
    else if (c === 'tow') this.openTow();
    else if (c === 'jobs') this.openMenu('jobs');
  }

  refuel() {
    const p = this.truck.physics;
    const s = this.state;
    const need = p.tank - p.fuel;
    if (need < 1) return this.hud.notify(this.t('tankFull'));
    const liters = Math.min(need, Math.floor(Math.max(0, s.money) / FUEL_PRICE));
    if (liters < 1) return this.hud.notify(this.t('notEnough'), 'bad');
    const price = Math.round(liters * FUEL_PRICE);
    s.money -= price;
    p.fuel += liters;
    p.engineOn = true;
    this.hud.notify(this.t('refuelled', { liters: Math.round(liters), price: this.money(price) }), 'good');
    this.sound.chime('good');
    this.save(true);
  }

  parkingQuality() {
    const p = this.truck.physics;
    const j = this.state.job;
    const lot = this.world.lots[j.to.lot];
    const L = layoutLot(lot);
    if (!p.trailer) return null;
    const hp = p.hitchPos();
    const len = p.trailer.length;
    const c = 1.3 - len / 2;
    const tx = hp.x + Math.sin(p.trailerYaw) * c;
    const tz = hp.z + Math.cos(p.trailerYaw) * c;
    let best = null;
    for (const slot of L.slots) {
      const d = Math.hypot(tx - slot.x, tz - slot.z);
      const ang = Math.abs(angleDiff(p.trailerYaw, slot.heading));
      const q = d < 1.3 && ang < 0.12 ? 'perfect' : d < 3.2 && ang < 0.3 ? 'good' : null;
      if (q && (!best || (q === 'perfect' && best !== 'perfect'))) best = q;
    }
    const inLot = this.world.lotAt(tx, tz, 6) === lot || this.world.lotAt(p.x, p.z, 6) === lot;
    return { quality: best ?? (inLot ? 'simple' : null), inLot };
  }

  deliver() {
    const s = this.state;
    const j = s.job;
    if (!j || !this.truck.physics.trailer) return;
    const pq = this.parkingQuality();
    if (!pq?.quality) return;
    const cargoDamage = clamp((this.truck.physics.damage - (j.pickupDamage ?? 0)) * (1 + CARGO[j.cargo].fragile), 0, 1);
    const r = settle(j, s, s.time, pq.quality, cargoDamage);
    const levelBefore = levelForXp(s.xp);
    s.money += r.pay;
    s.xp += r.xp;
    s.stats.deliveries++;
    s.stats.earned += r.pay;
    if (pq.quality === 'perfect') s.stats.perfectParks++;
    const levelAfter = levelForXp(s.xp);
    this.truck.detachTrailer();
    s.job = null;
    s.trailer = null;
    this.nav.clear();
    this.navTarget = null;
    this.sound.chime('good');
    this.sound.hiss(0.9, 0.25);
    this.save(true);
    this.openMenu('result', { ...r, cargo: this.name(CARGO[j.cargo]), km: j.km, parking: pq.quality, levelUp: levelAfter > levelBefore ? levelAfter : 0 });
    this.platform.interstitial().then(() => this.updateRunning());
  }

  openTow() {
    const t = this.t;
    this.menus.show('confirm', { title: t('tow'), text: t('towText', { price: this.money(this.towCost()) }), yes: 'towYes' });
    this.updateRunning();
  }

  towCost() {
    return 9000 + Math.round(levelForXp(this.state.xp) * 800);
  }

  async tow() {
    const p = this.truck.physics;
    const s = this.state;
    let best = null;
    for (const lot of this.world.lots) {
      if (lot.kind !== 'service') continue;
      const d = Math.hypot(lot.x - p.x, lot.z - p.z);
      if (!best || d < best.d) best = { lot, d };
    }
    if (!best) return;
    s.money -= this.towCost();
    const lot = best.lot;
    const L = layoutLot(lot);
    const zone = L.zone ?? { x: lot.x, z: lot.z };
    const keepTrailer = !!p.trailer;
    p.place(zone.x, zone.z, lot.heading, lot.heading);
    p.fuel = Math.max(p.fuel, p.tank * 0.25);
    p.engineOn = true;
    p.v = 0;
    if (keepTrailer) p.trailerYaw = lot.heading;
    this.rig.ready = false;
    this.nav.recalc(p.x, p.z, p.yaw);
    this.hud.notify(this.t('towed'));
    this.save(true);
  }

  // ---------- per-frame logic ----------
  updateContext() {
    const p = this.truck.physics;
    const t = this.t;
    const j = this.state.job;
    let act = null;
    let label = '';
    let key = 'Enter';
    const slow = Math.abs(p.v) < 1.0;
    if ((p.fuel <= 0 || p.inWater) && slow) {
      act = 'tow';
      label = t('tow');
    } else if (j && this.parked && !p.trailer) {
      const c = this.coupleState();
      if (c.d < 3 && c.ok) {
        act = 'attach';
        label = t('attach');
        key = 'T';
      } else if (c.d < 30) {
        act = 'info';
        label = t('alignTrailer');
        key = '';
      }
    } else if (j && j.stage === 'deliver' && p.trailer) {
      const lot = this.world.lots[j.to.lot];
      const d = Math.hypot(lot.x - p.x, lot.z - p.z);
      if (d < 90) {
        const pq = this.parkingQuality();
        if (pq?.quality && slow) {
          act = 'deliver';
          label = `${t('deliver')} · ${t(pq.quality)}`;
        } else {
          act = 'info';
          label = t('parkHint');
          key = '';
        }
      }
    }
    if (!act && slow) {
      for (const lot of this.world.lotHash.query(p.x, p.z, p.x, p.z)) {
        const L = layoutLot(lot);
        if (!L.zone) continue;
        if (Math.hypot(p.x - L.zone.x, p.z - L.zone.z) > L.zone.r + 4) continue;
        if (L.zone.kind === 'fuel') {
          act = 'refuel';
          label = t('refuel');
        } else if (L.zone.kind === 'service') {
          act = 'service';
          label = t('service');
        }
      }
    }
    this.contextAction = act === 'info' ? null : act;
    this.hud.setContext(act, label, key);
  }

  updateRules(dt) {
    const p = this.truck.physics;
    const s = this.state;
    const t = this.t;
    // speed limit at the current position
    const q = this.world.net.nearest(p.x, p.z, 30);
    if (q) this.speedLimit = this.world.speedLimit(q.edge, q.s);
    const speed = Math.abs(p.v) * 3.6;
    // speed cameras: fine once per pass when more than 20 km/h over the limit
    this.fineCooldown -= dt;
    for (const cam of this.world.cameras) {
      const e = this.world.net.edges[cam.edge];
      const cp = this.world.net.pointAt(e, cam.s);
      const d = Math.hypot(cp.x - p.x, cp.z - p.z);
      if (d > 28) continue;
      const last = this.cameraHits.get(cam) ?? -1e9;
      if (performance.now() - last < 30000) continue;
      if (speed > cam.limit + 20) {
        const fine = speed > cam.limit + 40 ? 2000 : 750;
        s.money -= fine;
        s.stats.fines += fine;
        this.cameraHits.set(cam, performance.now());
        this.hud.notify(t('fineSpeed', { price: this.money(fine), speed: Math.round(speed), limit: cam.limit }), 'bad');
        this.hud.flash();
        this.sound.chime('bad');
      }
    }
    if (p.impact > 2.5 && this.fineCooldown <= 0) {
      this.sound.thud(Math.min(2, p.impact / 4));
      if (p.impactKind === 'car') {
        const fine = 3000;
        s.money -= fine;
        s.stats.fines += fine;
        s.stats.accidents = (s.stats.accidents ?? 0) + 1;
        this.hud.notify(t('fineCrash', { price: this.money(fine) }), 'bad');
        this.hud.flash();
      }
      this.fineCooldown = 1.5;
    }
    // events from the traffic simulation
    for (const ev of this.traffic.takeEvents()) {
      if (ev === 'redLight') {
        const fine = 1000;
        s.money -= fine;
        s.stats.fines += fine;
        this.hud.notify(t('fineRed', { price: this.money(fine) }), 'bad');
        this.hud.flash();
        this.sound.chime('bad');
      } else if (ev.type === 'accidentAhead') {
        this.hud.notify(t('accidentAhead'));
      }
    }
    // fuel warnings
    if (p.fuel / p.tank < 0.12 && !this.fuelWarned) {
      this.fuelWarned = true;
      this.hud.notify(t('fuelLow'), 'bad');
    }
    if (p.fuel / p.tank > 0.2) this.fuelWarned = false;
    // automatic headlights at dusk unless the player chose otherwise
    const night = this.engine.env.nightFactor > 0.35 || this.engine.env.weather === 'fog' || this.engine.env.weather === 'rain';
    if (!this.manualLights && s.settings.autoLights) this.truck.lightsOn = night;
    // odometer in real-equivalent kilometres
    const km = (p.odometer * SCALE) / 1000;
    if (this.lastOdo !== undefined) s.stats.km += Math.max(0, km - this.lastOdo);
    this.lastOdo = km;
    // visited cities
    const c = this.currentCity();
    if (c && !s.visited.includes(c.index)) s.visited.push(c.index);
  }

  updateWeather() {
    const s = this.state;
    if (s.time < s.weatherUntil) return;
    const p = this.truck.physics;
    const { lat } = unproject(p.x, p.z);
    const r = rng(Math.floor(s.time) * 977 + 13);
    const hour = (s.time % 1440) / 60;
    const pool = lat < 50 ? [['clear', 6], ['cloudy', 3], ['overcast', 1], ['rain', 1]] : lat > 58 ? [['clear', 2], ['cloudy', 3], ['overcast', 3], ['rain', 2], ['fog', 1]] : [['clear', 4], ['cloudy', 3], ['overcast', 2], ['rain', 2], ['fog', hour < 9 ? 2 : 0.3]];
    s.weather = r.weighted(pool);
    s.weatherUntil = s.time + 120 + r() * 300;
    this.engine.env.setWeather(s.weather);
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.state;
    const p = this.truck.physics;
    if (this.running) {
      const controls = this.input.read(dt);
      this.acc += dt;
      let steps = 0;
      p.env.grip = this.engine.env.weatherBlend.grip;
      while (this.acc >= STEP && steps < 5) {
        p.step(STEP, controls, this.world.colliders);
        this.traffic.step(STEP, p);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      s.time += (dt * TIME_SCALE) / 60;
      this.engine.env.hour = (s.time % 1440) / 60;
      this.updateRules(dt);
      this.updateWeather();
      this.nav.update(dt, p.x, p.z, p.yaw);
      this.saveTimer = (this.saveTimer ?? 0) + dt;
      if (this.saveTimer > 10) {
        this.saveTimer = 0;
        this.save();
      }
      this.touchUi.update(dt);
      this.ctxTimer = (this.ctxTimer ?? 0) - dt;
      if (this.ctxTimer <= 0) {
        this.ctxTimer = 0.12;
        this.updateContext();
      }
      if (p.impact > 0) p.impact = 0;
    }
    if (!this.hidden) {
      const night = this.engine.env.nightFactor;
      this.truck.update(dt, night, this.rig.mode === 'cab');
      this.rig.update(dt);
      const focus = this.focusVec ?? (this.focusVec = new THREE.Vector3());
      focus.set(p.x, p.y, p.z);
      this.engine.update(this.running ? dt : 0, focus);
      this.buildingMat.userData.shader && (this.buildingMat.userData.shader.uniforms.uNight.value = night * 0.95 + (this.engine.env.weatherBlend.overcast > 0.8 ? 0.15 : 0));
      this.view.update(focus, this.running ? 4 : 8);
      this.trees.update(dt, this.engine.camera.position);
      this.props.update(dt, this.engine.camera.position, night);
      this.traffic.update(dt, this.engine.camera.position, night);
      this.rain.update(dt, this.engine.camera, this.engine.env.weatherBlend.rain, this.rig.mode === 'cab');
      this.mirrors.setActive(this.rig.mode === 'cab');
      this.mirrors.render();
      this.engine.render();
      this.hud.update(dt);
      this.sound.update(dt, {
        rpm: p.rpm,
        throttle: p.throttle,
        engineOn: p.engineOn,
        speed: p.v,
        surface: p.groundSurface,
        slip: p.slip,
        rain: this.engine.env.weatherBlend.rain,
        interior: this.rig.mode === 'cab',
        blinkOn: this.truck.blink % 0.8 < 0.42,
        indicating: this.truck.indicator !== 0 || this.truck.hazard,
        daylight: this.engine.env.nightFactor < 0.3,
        countryside: !this.currentCity(),
      });
    }
    requestAnimationFrame((t) => this.loop(t));
  }
}
