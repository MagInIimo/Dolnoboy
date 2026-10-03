import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { canvas } from '../render/textures.js';

// The detailed 6x4 tractor modelled in Blender for this game (assets/models/tractor.glb).
// glTF frame: +y up, +z forward, +x the driver's (left) side. The tandem centre sits 1.95 m behind
// the model origin; we shift it onto the physics reference point.
const SHIFT = 1.95;
let template = null;

export async function loadTractorAsset(url = 'assets/models/tractor.glb') {
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    template = gltf.scene;
  } catch (e) {
    console.warn('tractor model unavailable, using the procedural cab', e);
    template = null;
  }
  return !!template;
}

export const hasTractorAsset = () => !!template;

// Splits a mesh into parts by a predicate on each triangle's centroid (model space); returns meshes per key.
function splitMesh(mesh, keyOf) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const index = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const parts = new Map();
  const v = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, index[t + k]));
    v.multiplyScalar(1 / 3).applyMatrix4(mesh.matrix);
    const key = keyOf(v);
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(index[t], index[t + 1], index[t + 2]);
  }
  const out = {};
  for (const [key, idx] of parts) {
    const geo = g.clone();
    geo.setIndex(idx);
    // bounds of this part only (computeBoundingBox would include every vertex of the source)
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (const i of idx) box.expandByPoint(p.fromBufferAttribute(pos, i));
    geo.boundingBox = box;
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(geo, mesh.material.clone());
    // the same bounds in the parent's frame (quantized meshes carry a scale and offset)
    mesh.updateMatrix();
    m.userData.box = box.clone().applyMatrix4(mesh.matrix);
    m.position.copy(mesh.position);
    m.quaternion.copy(mesh.quaternion);
    m.scale.copy(mesh.scale);
    m.castShadow = mesh.castShadow;
    m.receiveShadow = mesh.receiveShadow;
    mesh.parent.add(m);
    out[key] = m;
  }
  mesh.parent.remove(mesh);
  return out;
}

function gaugePanel() {
  const c = canvas(512, 192);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.55 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), mat);
  return { mesh, gauges: { canvas: c, ctx: c.getContext('2d') }, gaugeTex: tex };
}

export function buildTractorGlb({ color = 0xe9ebe8, lightBar = false } = {}) {
  const src = template.clone(true);
  // per-truck materials so paint and lamps can change independently
  const clones = new Map();
  src.traverse((o) => {
    if (!o.isMesh) return;
    if (!clones.has(o.material)) clones.set(o.material, o.material.clone());
    o.material = clones.get(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  src.updateMatrixWorld(true);
  const find = (name) => src.getObjectByName(name);
  const byMaterial = (name) => {
    const list = [];
    src.traverse((o) => o.isMesh && o.material.name === name && list.push(o));
    return list;
  };
  // paint
  for (const m of byMaterial('MAT-paint')) m.material.color.setHex(color);
  // the cab interior sits in the shade of the roof: less sky light and reflections
  for (const name of ['MAT-interior', 'MAT-cockpit_polymer', 'MAT-steering_leather']) {
    for (const m of byMaterial(name)) {
      const c = m.material.color;
      const grey = (c.r + c.g + c.b) / 3;
      c.setRGB(grey * 1.15, grey * 1.1, grey * 1.05);
      m.material.envMapIntensity = 0.6;
    }
  }
  // lamps split into the parts that light up separately
  const lamps = { head: [], reverse: [], tail: [], left: [], right: [], marker: [] };
  for (const m of byMaterial('MAT-lamp_front')) {
    const p = splitMesh(m, (c) => (c.z > 0 ? 'head' : 'reverse'));
    if (p.head) lamps.head.push(p.head.material);
    if (p.reverse) lamps.reverse.push(p.reverse.material);
  }
  for (const m of byMaterial('MAT-reflector_red')) {
    const p = splitMesh(m, (c) => (c.z < -3.0 ? 'tail' : 'line'));
    if (p.tail) lamps.tail.push(p.tail.material);
  }
  for (const m of byMaterial('MAT-reflector_amber')) {
    const p = splitMesh(m, (c) => (c.y > 3.2 && Math.abs(c.x) < 1.2 ? 'marker' : c.x > 0 ? 'left' : 'right'));
    if (p.left) lamps.left.push(p.left.material);
    if (p.right) lamps.right.push(p.right.material);
    if (p.marker) lamps.marker.push(p.marker.material);
  }
  for (const list of Object.values(lamps)) for (const mat of list) mat.emissive = mat.emissive ?? new THREE.Color();
  for (const mat of lamps.head) mat.emissive.setHex(0xfff2dc);
  for (const mat of lamps.reverse) mat.emissive.setHex(0xffffff);
  for (const mat of lamps.tail) mat.emissive.setHex(0xff1a0a);
  for (const mat of [...lamps.left, ...lamps.right, ...lamps.marker]) mat.emissive.setHex(0xff9010);
  // mirrors: the modelled glass sits inside its housing, so each side gets its own pane facing the driver
  let mirrorL = null;
  let mirrorR = null;
  for (const m of byMaterial('MAT-mirror')) {
    const p = splitMesh(m, (c) => (c.x > 0 ? 'L' : 'R'));
    for (const [side, mesh] of Object.entries(p)) {
      const bb = mesh.userData.box;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.2, bb.max.x - bb.min.x) * 0.8, (bb.max.y - bb.min.y) * 0.86), mesh.material);
      pane.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.min.z - 0.025);
      pane.rotation.y = Math.PI;
      mesh.parent.add(pane);
      if (side === 'L') mirrorL = pane;
      else mirrorR = pane;
    }
  }
  // glass: tinted from outside, nearly clear from the driver's seat
  const windows = byMaterial('MAT-glass');
  const glassOutside = windows[0]?.material;
  const glassInside = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c2, roughness: 0.05, transparent: true, opacity: 0.07, depthWrite: false });
  // rig: shift the model so the tandem centre is at the physics origin
  const root = new THREE.Group();
  src.position.z = SHIFT;
  root.add(src);
  const body = find('cab');
  const wheelNames = ['wheel_FL', 'wheel_FR', 'wheel_ML', 'wheel_MR', 'wheel_RL', 'wheel_RR'];
  const wheels = wheelNames.map(find).filter(Boolean);
  const frontWheels = [find('wheel_FL'), find('wheel_FR')].filter(Boolean);
  // steering wheel turns about the column (the node's local z axis)
  const steering = find('steering');
  const steeringBase = steering ? steering.quaternion.clone() : null;
  // live instrument panel at the gauge anchor
  const panel = gaugePanel();
  const anchor = find('gauge_display');
  if (anchor) {
    panel.mesh.position.set(0, 0, -0.012);
    anchor.add(panel.mesh);
  }
  // optional roof light bar
  if (lightBar) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.6, roughness: 0.3, emissive: 0xfff2dc, emissiveIntensity: 0 }));
    bar.position.set(0, 4.12, 3.25);
    body.add(bar);
    lamps.head.push(bar.material);
  }
  return {
    glb: true,
    root,
    body,
    wheels,
    frontWheels,
    lamps,
    windows,
    glassOutside,
    glassInside,
    steering,
    steeringBase,
    interior: { group: new THREE.Group(), wheel: null, gauges: panel.gauges, gaugeTex: panel.gaugeTex },
    eye: new THREE.Vector3(0.57, 3.02, 1.92 + SHIFT),
    mirrorL,
    mirrorR,
    hitchZ: 0.35,
    wheelbase: 2.65 + SHIFT,
    length: 3.8 + SHIFT + 1.5,
    cabFront: 3.75 + SHIFT,
    cabTop: 4.05,
    lampY: 1.05,
  };
}
