import * as THREE from 'three';
import { Sky } from './sky.js';
import { Environment } from './environment.js';
import { WATER_LEVEL } from '../core/geo.js';
import { noiseCanvas } from './textures.js';
import { damp } from '../core/util.js';

export const QUALITY = {
  low: { pixelRatio: 0.8, shadows: 0, viewRadius: 1100, texture: 256, trees: 0.45, antialias: false, mirrors: 3, grass: false },
  medium: { pixelRatio: 1, shadows: 1024, viewRadius: 1500, texture: 512, trees: 0.75, antialias: true, mirrors: 2, grass: true },
  high: { pixelRatio: 1.5, shadows: 2048, viewRadius: 1900, texture: 512, trees: 1, antialias: true, mirrors: 1, grass: true },
};

export class Engine {
  constructor(canvasParent, qualityId) {
    this.qualityId = qualityId;
    this.quality = QUALITY[qualityId];
    const renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = this.quality.shadows > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'view';
    canvasParent.prepend(renderer.domElement);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb8c8d6, 60, 1800);
    this.fogFarTarget = 1800;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.15, 4200);
    this.scene.add(this.camera);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = this.quality.shadows > 0;
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(this.quality.shadows, this.quality.shadows);
      const cam = this.sun.shadow.camera;
      cam.left = -70;
      cam.right = 70;
      cam.top = 70;
      cam.bottom = -70;
      cam.near = 1;
      cam.far = 600;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
    }
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x8fa6d8, 0);
    this.moon.position.set(-0.3, 1, 0.4);
    this.scene.add(this.moon);
    this.hemi = new THREE.HemisphereLight(0xbcd2ee, 0x4a4a3c, 1);
    this.scene.add(this.hemi);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.mesh.geometry, this.sky.mesh.material);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.environmentDirty = true;
    this.makeWater();
    this.env = new Environment(this);
    this.focus = new THREE.Vector3();
    this.resize();
  }

  attachSurfaces(surfaces) {
    this.surfaces = surfaces;
  }

  makeWater() {
    const c = noiseCanvas(256, 8, 4242, 4, (v, x, y) => {
      return [128 + Math.round((v - 0.5) * 120), 128 + Math.round(Math.sin((x + y * 0.5) * 0.09) * 30 + (v - 0.5) * 60), 255, 255];
    });
    const normal = new THREE.CanvasTexture(c);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.colorSpace = THREE.NoColorSpace;
    normal.repeat.set(160, 160);
    this.waterNormal = normal;
    const mat = new THREE.MeshStandardMaterial({ color: 0x24404c, roughness: 0.08, metalness: 0.15, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9 });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 2;
    this.water.receiveShadow = this.quality.shadows > 0;
    this.scene.add(this.water);
  }

  resize() {
    const w = this.renderer.domElement.parentElement?.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.parentElement?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt, focus) {
    this.focus.copy(focus);
    this.env.update(dt);
    const cam = this.camera;
    this.sky.mesh.position.copy(cam.position);
    this.sky.uniforms.uTime.value += dt;
    // fog distance follows weather smoothly
    this.scene.fog.far = damp(this.scene.fog.far, this.fogFarTarget, 0.8, dt);
    this.scene.fog.near = Math.min(120, this.scene.fog.far * 0.08);
    this.water.position.x = Math.round(cam.position.x / 64) * 64;
    this.water.position.z = Math.round(cam.position.z / 64) * 64;
    this.waterNormal.offset.x += dt * 0.004;
    this.waterNormal.offset.y += dt * 0.0025;
    this.surfaces?.setOrigin(cam.position.x, cam.position.z);
    // sun shadow camera follows the focus point, snapped to texels to avoid shimmering
    const sd = this.env.sunDir;
    const lightDir = sd.y > 0.05 ? sd : this.moon.position.clone().normalize();
    const snap = 140 / (this.quality.shadows || 1024);
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 250, focus.y + Math.max(0.15, lightDir.y) * 250, fz + lightDir.z * 250);
    this.sun.castShadow = this.quality.shadows > 0 && sd.y > 0.02;
    if (this.environmentDirty) {
      this.environmentDirty = false;
      const old = this.envTarget;
      this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 1100);
      this.scene.environment = this.envTarget.texture;
      old?.dispose();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
