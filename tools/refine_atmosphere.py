from pathlib import Path

base = Path(__file__).resolve().parents[1]
path = base / 'game/src/view.js'
source = path.read_text(encoding='utf-8')
for before, after in {
    'new THREE.HemisphereLight(0xd4e4de,0x5e6650,2.15)': 'new THREE.HemisphereLight(0xbdd4ec,0x5e6650,2.15)',
    'mix(.09,.6,day)': 'mix(.09,.5,day)',
    'mix(.88,.64,sunset),mix(.7,.37,sunset)': 'mix(.84,.64,sunset),mix(.62,.37,sunset)',
    "this.scene.fog.far=weather.fog*(this.quality==='low'?.65:1)*(day<.15?.65:1);": "const cityHaze=d.weather==='clear'&&this.quality==='high'?clamp(1-Math.hypot(t.x-CITIES[0].x,t.z-CITIES[0].z)/500,0,1):0;this.scene.fog.far=weather.fog*(1+cityHaze*.7)*(this.quality==='low'?.65:1)*(day<.15?.65:1);"
}.items():
    assert source.count(before) == 1, before
    source = source.replace(before, after)
path.write_text(source, encoding='utf-8')
path = base / 'game/src/scenery.js'
source = path.read_text(encoding='utf-8')
before = 'const width=size*(pine?.90:.64);'
assert source.count(before) == 1
path.write_text(source.replace(before, 'const width=size*(pine?.42:.64);'), encoding='utf-8')
print('Narrow spruce crowns; cool fill and warmer key; distant Moscow skyline fades continuously outside the city.')
