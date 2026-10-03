import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Traffic vehicles modelled in Blender (tools/blender/cars.py → assets/models/cars.glb).
// Every kind is merged into one geometry with per-vertex colour and material parameters so a whole
// kind draws as a single InstancedMesh: aMat = (roughness, metalness, paint, lamp id).
// Lamp ids: 1 head, 2 tail, 3 indicator left, 4 indicator right, 5 beacon blue, 6 beacon red, 7 side marker.

const ROLES = {
  paint: [[1, 1, 1], 0.3, 0.4, 1],
  glass: [[0.02, 0.025, 0.03], 0.04, 0.15],
  trim: [[0.018, 0.018, 0.02], 0.3, 0.2],
  plastic: [[0.035, 0.035, 0.038], 0.72, 0],
  grille: [[0.014, 0.014, 0.015], 0.5, 0.2],
  chrome: [[0.8, 0.8, 0.82], 0.12, 1],
  under: [[0.02, 0.02, 0.02], 0.95, 0],
  arch: [[0.012, 0.012, 0.012], 0.95, 0],
  tyre: [[0.03, 0.03, 0.03], 0.9, 0],
  rim: [[0.58, 0.59, 0.61], 0.32, 0.9],
  rimdark: [[0.035, 0.035, 0.04], 0.6, 0.3],
  steel: [[0.33, 0.34, 0.35], 0.5, 0.6],
  plate: [[0.8, 0.8, 0.78], 0.55, 0],
  white: [[0.8, 0.81, 0.8], 0.5, 0.05],
  box: [[0.83, 0.84, 0.84], 0.55, 0.1],
  blue: [[0.03, 0.12, 0.42], 0.35, 0.2],
  seam: [[0.015, 0.015, 0.015], 0.8, 0],
  head: [[0.62, 0.64, 0.68], 0.08, 0.7, 0, 1],
  tail: [[0.32, 0.015, 0.012], 0.12, 0.2, 0, 2],
  amber: [[0.6, 0.3, 0.03], 0.15, 0.2, 0, 3],
  beacon_blue: [[0.05, 0.1, 0.5], 0.2, 0, 0, 5],
  beacon_red: [[0.5, 0.03, 0.03], 0.2, 0, 0, 6],
  marker: [[0.6, 0.3, 0.03], 0.15, 0.2, 0, 7],
  alu: [[0.6, 0.62, 0.64], 0.35, 0.8],
};

let models = null;

export async function loadCarModels(url = 'assets/models/cars.glb') {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const out = { kinds: {}, wheels: {} };
    for (const node of gltf.scene.children) {
      const raw = node.userData?.vehicle;
      if (!raw) continue;
      const spec = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const geo = mergeNode(node);
      if (node.name.startsWith('wheel_')) out.wheels[node.name.slice(6)] = { geo, spec };
      else {
        const lo = node.name.endsWith('_lo');
        const kind = lo ? node.name.slice(0, -3) : node.name;
        out.kinds[kind] = out.kinds[kind] ?? { spec: null };
        out.kinds[kind][lo ? 'lo' : 'hi'] = geo;
        if (!lo) out.kinds[kind].spec = spec;
      }
    }
    models = out;
  } catch (e) {
    console.warn('vehicle models unavailable, using simple bodies', e);
    models = null;
  }
  return !!models;
}

export const carModels = () => models;

function mergeNode(node) {
  const parts = [];
  node.traverse((o) => {
    if (o.isMesh) parts.push(o);
  });
  let count = 0;
  let icount = 0;
  for (const m of parts) {
    count += m.geometry.attributes.position.count;
    icount += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  }
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const mat = new Float32Array(count * 4);
  const idx = new Uint32Array(icount);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let base = 0;
  let ib = 0;
  for (const m of parts) {
    const g = m.geometry;
    const role = ROLES[(m.material.name || '').replace(/^car_/, '').replace(/\.\d+$/, '')] ?? ROLES.plastic;
    const [rgb, rough, metal, paint = 0, lamp = 0] = role;
    nm.getNormalMatrix(m.matrixWorld);
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
      const k = base + i;
      pos[k * 3] = v.x;
      pos[k * 3 + 1] = v.y;
      pos[k * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nrm[k * 3] = v.x;
      nrm[k * 3 + 1] = v.y;
      nrm[k * 3 + 2] = v.z;
      col[k * 3] = rgb[0];
      col[k * 3 + 1] = rgb[1];
      col[k * 3 + 2] = rgb[2];
      mat[k * 4] = rough;
      mat[k * 4 + 1] = metal;
      mat[k * 4 + 2] = paint;
      // indicators split by side: +x is the left side of the vehicle
      mat[k * 4 + 3] = lamp === 3 && pos[k * 3] < 0 ? 4 : lamp;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[ib++] = g.index.getX(i) + base;
    else for (let i = 0; i < P.count; i++) idx[ib++] = base + i;
    base += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
  geo.setIndex(new THREE.BufferAttribute(count > 65535 ? idx : new Uint16Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

// Shared material: per-vertex roughness/metalness, per-instance paint, lamps as emissive.
export function vehicleMaterial(physical) {
  const params = { vertexColors: true, roughness: 1, metalness: 1 };
  const m = physical ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 1, clearcoatRoughness: 0.05 }) : new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aMat;
#ifdef USE_INSTANCING_COLOR
attribute vec4 aLamp;
attribute vec2 aBeacon;
#endif
varying vec4 vMat;
varying vec3 vGlow;`
      )
      .replace(
        '#include <color_vertex>',
        `vColor = vec3(1.0);
#ifdef USE_COLOR
vColor *= color;
#endif
vMat = aMat;
vGlow = vec3(0.0);
#ifdef USE_INSTANCING_COLOR
vColor = mix(vColor, vColor * instanceColor, aMat.z);
float lampId = aMat.w;
if (lampId > 0.5) {
  if (lampId < 1.5) vGlow = vec3(1.0, 0.92, 0.8) * aLamp.x;
  else if (lampId < 2.5) vGlow = vec3(1.0, 0.04, 0.02) * aLamp.y;
  else if (lampId < 3.5) vGlow = vec3(1.0, 0.42, 0.03) * aLamp.z;
  else if (lampId < 4.5) vGlow = vec3(1.0, 0.42, 0.03) * aLamp.w;
  else if (lampId < 5.5) vGlow = vec3(0.08, 0.25, 1.0) * aBeacon.x;
  else if (lampId < 6.5) vGlow = vec3(1.0, 0.05, 0.03) * aBeacon.y;
  else vGlow = vec3(1.0, 0.42, 0.03) * aLamp.x * 0.3;
}
#endif`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vMat;\nvarying vec3 vGlow;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMat.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMat.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;')
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= step(0.5, vMat.z);
#endif`
      );
  };
  m.customProgramCacheKey = () => 'vehicle-' + (physical ? 'p' : 's');
  return m;
}
