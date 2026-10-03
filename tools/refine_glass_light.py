from pathlib import Path

base = Path(__file__).resolve().parents[1]
path = base / 'game/src/scenery.js'
source = path.read_text(encoding='utf-8')
for before, after in {
    'options.roughness=.095;options.metalness=1;options.color=0x4d6879;': 'options.roughness=.12;options.metalness=.72;options.color=0x83a4be;',
    'm.userData.envBoost=1.25;m.userData.localReflection=true;': 'm.userData.envBoost=1.75;m.userData.localReflection=true;',
    'hh=22+random()*28,hd=65+random()*60': 'hh=7+random()*9,hd=65+random()*60'
}.items():
    assert source.count(before) == 1, before
    source = source.replace(before, after)
path.write_text(source, encoding='utf-8')
path = base / 'game/src/reflections.js'
source = path.read_text(encoding='utf-8')
before = 'cube.position.set(city.x+110,18,city.z-65);'
assert source.count(before) == 1
path.write_text(source.replace(before, 'cube.position.set(city.x+110,42,city.z-65);'), encoding='utf-8')
print('Brighter mixed glass reflections; country slopes lowered; probe raised above apartment roofs.')
