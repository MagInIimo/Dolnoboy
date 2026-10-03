import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeNode, vehicleMaterial } from '../traffic/car-models.js';

// Hero landmarks modelled in Blender (tools/blender/landmarks.py → assets/models/landmarks.glb).
// [colour, roughness, metalness]
const ROLES = {
  stone: [[0.8, 0.79, 0.74], 0.8, 0],
  stoneDark: [[0.62, 0.61, 0.57], 0.85, 0],
  brick: [[0.47, 0.19, 0.12], 0.85, 0],
  plaster: [[0.84, 0.74, 0.52], 0.8, 0],
  trim: [[0.9, 0.89, 0.85], 0.7, 0],
  roofGreen: [[0.1, 0.32, 0.24], 0.45, 0.35],
  domeBlue: [[0.08, 0.36, 0.58], 0.28, 0.55],
  domeTeal: [[0.08, 0.45, 0.46], 0.28, 0.55],
  gold: [[0.85, 0.64, 0.26], 0.22, 1],
  window: [[0.03, 0.035, 0.045], 0.15, 0.3],
  glass: [[0.08, 0.14, 0.19], 0.05, 0.7],
  lattice: [[0.88, 0.88, 0.86], 0.4, 0.3],
  grass: [[0.16, 0.26, 0.08], 0.95, 0],
  paving: [[0.45, 0.44, 0.41], 0.85, 0],
  concrete: [[0.58, 0.58, 0.56], 0.85, 0],
  steel: [[0.52, 0.54, 0.57], 0.4, 0.8],
  redBrick: [[0.46, 0.13, 0.09], 0.85, 0],
  glassBlue: [[0.14, 0.26, 0.4], 0.08, 0.7],
  glassGold: [[0.5, 0.36, 0.16], 0.12, 0.85],
  glassDark: [[0.05, 0.07, 0.09], 0.08, 0.6],
  glassGreen: [[0.12, 0.28, 0.27], 0.08, 0.7],
  red: [[0.62, 0.08, 0.06], 0.6, 0.1],
  white: [[0.86, 0.86, 0.84], 0.6, 0],
  yellow: [[0.8, 0.64, 0.32], 0.8, 0],
  green: [[0.1, 0.38, 0.2], 0.4, 0.3],
};

let models = {};
let material = null;

export async function loadLandmarkModels(url = 'assets/models/landmarks.glb') {
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    for (const node of gltf.scene.children) {
      const raw = node.userData?.landmark;
      if (!raw) continue;
      const geo = mergeNode(node, ROLES, /^lm_/);
      geo.computeBoundingSphere();
      models[node.name] = { geo, spec: typeof raw === 'string' ? JSON.parse(raw) : raw };
    }
  } catch (e) {
    console.warn('landmark models unavailable, using simple shapes', e);
    models = {};
  }
  return models;
}

export const landmarkModel = (id) => models[id] ?? null;

export function landmarkMaterial() {
  if (!material) material = vehicleMaterial(false);
  return material;
}
