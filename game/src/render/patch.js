// Injects custom code into three.js built-in materials while keeping their lighting, shadows and fog.
export function patchMaterial(material, opts) {
  const uniforms = opts.uniforms ?? {};
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n' + (opts.vertexHead ?? ''));
    if (opts.vertexBegin) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + opts.vertexBegin);
    vs = vs.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          wn = mat3(instanceMatrix) * wn;
        #endif
        vWorldPos = (modelMatrix * wp).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * wn);
      }
      ${opts.vertexBody ?? ''}`
    );
    fs = fs.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n' + (opts.fragmentHead ?? ''));
    if (opts.fragmentMap) fs = fs.replace('#include <map_fragment>', opts.fragmentMap);
    if (opts.fragmentRoughness) fs = fs.replace('#include <roughnessmap_fragment>', opts.fragmentRoughness);
    if (opts.fragmentMetalness) fs = fs.replace('#include <metalnessmap_fragment>', opts.fragmentMetalness);
    if (opts.fragmentNormal) fs = fs.replace('#include <normal_fragment_maps>', opts.fragmentNormal);
    if (opts.fragmentEmissive) fs = fs.replace('#include <emissivemap_fragment>', opts.fragmentEmissive);
    if (opts.fragmentEnd) fs = fs.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + opts.fragmentEnd);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => opts.key ?? 'patched';
  return material;
}

// Shared GLSL helpers
export const GLSL_HASH = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// Perturbs the view-space normal with a tangent-space sample for mostly horizontal surfaces mapped by world XZ.
export const GLSL_WORLD_NORMAL = `
vec3 perturbWorldNormal(vec3 wn, vec3 sampleTS, float strength) {
  vec3 t = normalize(vec3(1.0, 0.0, 0.0) - wn * wn.x);
  vec3 b = normalize(cross(t, wn));
  vec3 ts = sampleTS * 2.0 - 1.0;
  ts.xy *= strength;
  return normalize(t * ts.x + b * ts.y + wn * ts.z);
}
`;
