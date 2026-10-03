from pathlib import Path

root = Path(__file__).resolve().parents[1]


def change(name, replacements):
    p = root / name
    s = p.read_text(encoding='utf-8')
    for old, new in replacements:
        assert old in s, (name, old)
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')


change('game/src/view.js', [
    ('this.createSky(assets.environment)', 'this.createSky(assets.sky)'),
    ('skyRotation:{value:.55}', 'skyRotation:{value:.55}'),
    ('gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', 'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w*.99999;}'),
    ('1.0-clamp(.5+(vSkyUv.y-.5)*1.8,.002,.998)', 'clamp(.58-(vSkyUv.y-.5)*1.16,.002,.998)'),
    ("this.camera.updateProjectionMatrix();this.sky.position.copy", "this.camera.far=this.scene.fog.far*1.1;this.camera.updateProjectionMatrix();this.sky.position.copy"),
])
change('game/src/scenery.js', [
    ('distance(c,p)<90', 'distance(c,p)<160'),
    ('for(let i=0;i<2100;i++){const x=c.x-180+random()*360,z=c.z+(random()>.5?1:-1)*(9.3+random()*21);', 'for(let i=0;i<5200;i++){const x=c.x-180+random()*360,z=c.z+(random()>.5?1:-1)*(9.3+random()*(i<3000?6:21));'),
])
change('tools/build.mjs', [
    ('The vehicle geometry, foliage cutout, interface and synthesized sounds are original works', 'The vehicle and architecture geometry, foliage cutout, grass and cloud textures, interface and synthesized sounds are original works'),
    ('Surface materials and sky panorama from Poly Haven', 'Surface materials and reflection panorama from Poly Haven'),
])
change('tools/package_runtime.py', [
    ("'assets/grass-ground.png', 'assets/models/tractor.glb'", "'assets/grass-ground.png', 'assets/sky-cumulus.png', 'assets/models/tractor.glb'"),
])
