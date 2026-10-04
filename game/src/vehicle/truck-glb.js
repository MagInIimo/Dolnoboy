import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { canvas } from '../render/textures.js';

// Tractor lineup modelled in Blender (tools/blender/tractors.py → assets/trucks/<id>.glb), loaded on demand.
// Each file holds the body (cab, chassis), the interior, wheel_* nodes, the steering wheel, the instrument
// cluster quad and the mirror glass quads. The body's extras carry the layout (wheel centres, eye point,
// mirror planes, fifth wheel). glTF frame: +y up, +z forward, +x the driver's (left) side, origin under
// the rear axle or the middle of the tandem.
const assets = new Map();

export function loadTruckAsset(id) {
  let a = assets.get(id);
  if (!a) {
    a = { scene: null, promise: null };
    a.promise = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(`assets/trucks/${id}.glb`)
      .then((g) => (a.scene = g.scene))
      .catch((e) => {
        console.warn('truck model unavailable', id, e);
        return null;
      });
    assets.set(id, a);
  }
  return a.promise;
}

export const hasTruckAsset = (id) => !!assets.get(id)?.scene;

// role → [colour (null keeps the modelled one), roughness, metalness]
const LOOK = {
  paint2: [null, 0.42, 0.25],
  trim: [null, 0.5, 0.05],
  plastic: [null, 0.8, 0],
  grille: [null, 0.5, 0.2],
  chrome: [0xe8eaec, 0.07, 1],
  darkchrome: [0x4a4d52, 0.16, 1],
  frit: [0x060708, 0.14, 0],
  rubber: [0x0b0b0b, 0.85, 0],
  alu: [0xc9cdd1, 0.24, 0.95],
  rim: [0xd8dadd, 0.2, 0.95],
  badge: [0xe6e8eb, 0.1, 1],
  steel: [null, 0.62, 0.35],
  tyre: [0x111111, 0.92, 0],
};
const INTERIOR = ['dash', 'dash2', 'dashtrim', 'panel', 'headliner', 'seat', 'seat2', 'leather', 'carpet', 'curtain', 'button', 'display'];
const GLOW = { head: 0xfff3dc, drl: 0xeef4ff, reverse: 0xffffff, tail: 0xff1408, ind_L: 0xff8a10, ind_R: 0xff8a10, marker: 0xff9418 };

const roleOf = (m) => (m?.name ?? '').replace(/^MAT-/, '').replace(/\.\d+$/, '');

export function buildTruckModel(id, { color = 0xe9ebe8, lightBar = false } = {}) {
  const src = assets.get(id).scene.clone(true);
  const body = src.getObjectByName(id) ?? src.children[0];
  const spec = JSON.parse(body.userData.truck ?? '{}');
  const mats = new Map();
  const paintColor = new THREE.Color(color);
  const materialFor = (m) => {
    const r = roleOf(m);
    if (mats.has(r)) return mats.get(r);
    let out;
    if (r === 'paint') {
      out = new THREE.MeshPhysicalMaterial({ color: paintColor, roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
    } else if (r === 'glass') {
      out = new THREE.MeshPhysicalMaterial({ color: 0x141b21, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.8, envMapIntensity: 1.5 });
    } else if (r === 'lens') {
      out = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 2, depthWrite: false });
    } else {
      out = new THREE.MeshStandardMaterial({ color: m.color?.clone() ?? new THREE.Color(0x777777), roughness: m.roughness ?? 0.6, metalness: m.metalness ?? 0 });
      const look = LOOK[r];
      if (look) {
        if (look[0] !== null) out.color.setHex(look[0]);
        out.roughness = look[1];
        out.metalness = look[2];
      }
      if (INTERIOR.includes(r)) out.envMapIntensity = 0.35;
      if (r === 'mirror_glass') {
        out.color.setHex(0x9aa6b0);
        out.roughness = 0.05;
        out.metalness = 1;
      }
      if (GLOW[r] !== undefined) {
        out.emissive = new THREE.Color(GLOW[r]);
        out.emissiveIntensity = 0;
      }
      if (r === 'head') {
        out.color.setHex(0xd9dde2);
        out.metalness = 0.6;
        out.roughness = 0.12;
      }
    }
    out.name = r;
    mats.set(r, out);
    return out;
  };
  const interiorNode = src.getObjectByName('interior');
  src.traverse((o) => {
    if (!o.isMesh) return;
    o.material = materialFor(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  if (interiorNode) interiorNode.traverse((o) => o.isMesh && (o.castShadow = false));
  const lamp = (...names) => names.map((n) => mats.get(n)).filter(Boolean);
  const lamps = { head: lamp('head'), drl: lamp('drl'), reverse: lamp('reverse'), tail: lamp('tail'), left: lamp('ind_L'), right: lamp('ind_R'), marker: lamp('marker') };
  // pivots at the wheel centres (meshopt quantization moves the nodes' own transforms, so keep them as offsets)
  const pivot = (node, at) => {
    const p = new THREE.Group();
    p.position.copy(at);
    node.parent.add(p);
    node.position.sub(at);
    p.add(node);
    return p;
  };
  const wheels = [];
  const frontWheels = [];
  for (const [x, y, z, front, name] of spec.wheels ?? []) {
    const node = src.getObjectByName(name);
    if (!node) continue;
    const steer = pivot(node, new THREE.Vector3(x, y, z));
    const spin = new THREE.Group();
    steer.add(spin);
    spin.add(node);
    wheels.push(spin);
    if (front) frontWheels.push(steer);
  }
  const steeringNode = src.getObjectByName('steering');
  const steering = steeringNode && spec.wheelC ? pivot(steeringNode, new THREE.Vector3(...spec.wheelC)) : null;
  // instrument cluster: a canvas texture drawn by the truck each few frames
  const gauges = src.getObjectByName('gauges');
  const panel = canvas(1024, 320);
  const gaugeTex = new THREE.CanvasTexture(panel);
  gaugeTex.colorSpace = THREE.SRGBColorSpace;
  gaugeTex.anisotropy = 4;
  gaugeTex.flipY = false; // glTF texture coordinates start at the top of the image
  if (gauges) {
    const m = new THREE.MeshBasicMaterial({ map: gaugeTex, toneMapped: false });
    gauges.traverse((o) => o.isMesh && (o.material = m));
  }
  // mirrors
  const mirror = (name, info) => {
    const o = src.getObjectByName(name);
    if (!o) return null;
    const mesh = o.isMesh ? o : o.getObjectByProperty('isMesh', true);
    if (info) mesh.userData.mirror = info;
    return mesh;
  };
  const windows = [];
  src.traverse((o) => o.isMesh && o.material.name === 'glass' && windows.push(o));
  const glassOutside = mats.get('glass');
  const glassInside = new THREE.MeshBasicMaterial({ color: 0xa8bcc8, transparent: true, opacity: 0.05, depthWrite: false });
  const root = new THREE.Group();
  root.add(src);
  if (lightBar) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.6, roughness: 0.3, emissive: 0xfff2dc, emissiveIntensity: 0 }));
    bar.position.set(0, spec.top + 0.12, spec.cabRear + 1.1);
    root.add(bar);
    lamps.head.push(bar.material);
  }
  return {
    glb: true,
    lineup: true,
    id,
    spec,
    root,
    body: src,
    wheels,
    frontWheels,
    lamps,
    windows,
    glassOutside,
    glassInside,
    steering,
    steerAxis: new THREE.Vector3(...(spec.steerAxis ?? [0, 0, -1])),
    interiorNode,
    interior: { group: new THREE.Group(), wheel: null, gauges: { canvas: panel, ctx: panel.getContext('2d') }, gaugeTex, cluster: true },
    eye: new THREE.Vector3(...spec.eye),
    mirrorL: mirror('mirror_L', spec.mirror_L),
    mirrorR: mirror('mirror_R', spec.mirror_R),
    mirrorWL: mirror('mirrorw_L', spec.mirrorw_L),
    mirrorWR: mirror('mirrorw_R', spec.mirrorw_R),
    hitchZ: spec.king,
    wheelbase: spec.wheelbase,
    length: spec.length,
    rear: spec.rear,
    cabFront: spec.cabFront,
    cabTop: spec.top,
    lampY: spec.lampY,
  };
}
