import * as THREE from 'three';
import { rng } from '../core/util.js';

// Rain streaks in a box that wraps around the camera; the shader moves them, the CPU only sets uniforms.
const BOX = 46;
const HEIGHT = 26;

const vertex = `
uniform vec3 uCam;
uniform float uTime;
uniform vec2 uWind;
uniform float uNearCut;
attribute float aEnd;
attribute float aSpeed;
varying float vAlpha;
void main() {
  vec3 p = position;
  float fall = uTime * aSpeed;
  p.y = mod(p.y - fall, ${HEIGHT.toFixed(1)});
  vec2 drift = uWind * (${HEIGHT.toFixed(1)} - p.y) * 0.05;
  vec2 xz = mod(p.xz + drift - uCam.xz + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
  vec3 w = vec3(uCam.x + xz.x, uCam.y - ${(HEIGHT / 2).toFixed(1)} + p.y, uCam.z + xz.y);
  // streak: the lower end lags along the fall direction
  w.y -= aEnd * 0.55;
  w.xz -= aEnd * uWind * 0.03;
  vAlpha = (1.0 - aEnd * 0.7) * smoothstep(${(BOX / 2).toFixed(1)}, ${(BOX / 4).toFixed(1)}, length(xz));
  // no drops inside the cab
  vAlpha *= smoothstep(uNearCut, uNearCut + 1.5, length(w - uCam));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const fragment = `
uniform float uOpacity;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vAlpha);
}
`;

export class Rain {
  constructor(engine, quality) {
    this.engine = engine;
    const count = quality.shadows === 0 ? 2500 : quality.trees >= 1 ? 9000 : 6000;
    this.count = count;
    const r = rng(77);
    const pos = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    const speed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = r() * BOX;
      const y = r() * HEIGHT;
      const z = r() * BOX;
      const v = 9 + r() * 4;
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        speed[i * 2 + k] = v;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    this.uniforms = {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(1.5, 0.6) },
      uOpacity: { value: 0 },
      uNearCut: { value: 0 },
      uColor: { value: new THREE.Color(0xb8c4cf) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    engine.scene.add(this.mesh);
  }

  update(dt, camera, intensity, interior = false) {
    this.uniforms.uNearCut.value = interior ? 3.2 : 0;
    const on = intensity > 0.03;
    this.mesh.visible = on;
    if (!on) return;
    this.uniforms.uTime.value += dt;
    this.uniforms.uCam.value.copy(camera.position);
    this.uniforms.uOpacity.value = 0.32 * Math.min(1, intensity);
    // fewer drops in light rain; the night tints them darker
    const night = this.engine.env.nightFactor;
    this.uniforms.uColor.value.setRGB(0.72 - night * 0.45, 0.77 - night * 0.45, 0.82 - night * 0.42);
    this.mesh.geometry.setDrawRange(0, Math.floor(this.count * 2 * Math.min(1, intensity)));
  }
}
