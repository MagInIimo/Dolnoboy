from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'game/src/view.js'
t = p.read_text(encoding='utf-8')
def replace(old, new):
    global t
    assert t.count(old) == 1, (old[:70], t.count(old))
    t = t.replace(old, new)

replace('this.scene.background=assets.environment;', 'this.scene.background=null;')
start=t.index('this.sky=this.createSky();')
end=t.index('this.rain=this.createRain();',start)
t=t[:start]+"this.sky=this.createSky(assets.environment);this.scene.add(this.sky);"+t[end:]
start=t.index(' environment(){')
end=t.index(' createRain(){',start)
t=t[:start]+''' createSky(environment){const m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{skyMap:{value:environment},brightness:{value:.8},horizon:{value:new THREE.Color(0xc4d1c3)},haze:{value:0},tint:{value:new THREE.Color(0xffffff)}},vertexShader:'varying vec2 vSkyUv;varying vec3 vSkyP;void main(){vSkyUv=uv;vSkyP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D skyMap;uniform float brightness;uniform vec3 horizon;uniform float haze;uniform vec3 tint;varying vec2 vSkyUv;varying vec3 vSkyP;void main(){vec3 sky=texture2D(skyMap,vec2(fract(vSkyUv.x+.28),vSkyUv.y)).rgb*brightness*tint;float low=pow(1.0-clamp(normalize(vSkyP).y,0.0,1.0),6.0);sky=mix(sky,horizon,low*.18+haze);gl_FragColor=vec4(sky,1.0);\\n#include <tonemapping_fragment>\\n#include <colorspace_fragment>\\n}'});const mesh=new THREE.Mesh(new THREE.SphereGeometry(2100,48,24),m);mesh.frustumCulled=false;return mesh;}
'''+t[end:]
replace('this.sky.material.uniforms.top.value.setHex(day>.3?0x7ba7b9:0x122933);', "this.sky.material.uniforms.brightness.value=mix(.008,.8,day)*(1-wet*.3);this.sky.material.uniforms.haze.value=wet*.28;this.sky.material.uniforms.tint.value.setRGB(1,mix(1,.79,sunset*.55),mix(1,.61,sunset*.55));")
start=t.index('this.sunDisc.position.set(')
end=t.index('const ibl=',start)
t=t[:start]+t[end:]
start=t.index('this.clouds.position.set(')
end=t.index('this.env.asphalt.roughness=',start)
t=t[:start]+t[end:]
p.write_text(t,encoding='utf-8')
print('Real HDR sky now has a controlled panorama direction and day/weather exposure.')
