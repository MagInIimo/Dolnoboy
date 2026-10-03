import * as THREE from 'three';

const vertex = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragment = `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform float uCloud;
uniform float uTime;
uniform float uNight;
uniform float uOvercast;
varying vec3 vDir;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  if (h < 0.0) col = mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  // sun glow and disc
  col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.5) * (1.0 - uOvercast * 0.7);
  col += uSunColor * smoothstep(0.9995, 0.99975, sd) * 6.0 * (1.0 - uOvercast);
  // stars
  if (uNight > 0.01 && h > 0.0) {
    vec2 sp = d.xz / (d.y + 0.35) * 220.0;
    float star = step(0.9975, h12(floor(sp))) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
    col += vec3(star) * uNight * (1.0 - uOvercast) * 1.4;
  }
  // clouds on a virtual plane
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.08) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(cp * 1.4);
    float cover = mix(0.62, 0.22, uCloud);
    float dens = smoothstep(cover, cover + 0.28, c);
    float shade = fbm(cp * 1.4 + vec2(0.06, 0.04));
    vec3 lit = mix(uHorizon * 1.05 + uSunColor * 0.25, vec3(1.0), 0.55 - uNight * 0.5);
    vec3 dark = mix(uHorizon, uZenith, 0.4) * (0.62 - uOvercast * 0.15);
    vec3 ccol = mix(lit, dark, clamp((shade - c) * 4.0 + 0.45, 0.0, 1.0));
    ccol += uSunColor * pow(sd, 8.0) * 0.35 * (1.0 - dens * 0.5);
    float fade = smoothstep(0.0, 0.18, h);
    col = mix(col, ccol, dens * fade * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  constructor() {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color(0x3d6fb8) },
      uHorizon: { value: new THREE.Color(0xb9cfe0) },
      uGround: { value: new THREE.Color(0x5a6152) },
      uSunColor: { value: new THREE.Color(0xfff1d8) },
      uCloud: { value: 0.4 },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uOvercast: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.BackSide, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
}
