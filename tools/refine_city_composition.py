from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/src/scenery.js'
s = p.read_text(encoding='utf-8')
s = "import {addCityHorizon} from './city-horizon.js';\n" + s
for old, new in [
    ("*(9.3+random()*(i<3000?6:21));if(nearestRoad(x,z).distance<8.8)", "*(14.4+random()*(i<3000?6:15));if(nearestRoad(x,z).distance<14.2)"),
    ('for(const c of CITIES){for(let i=0;i<5200;', 'for(const road of LOCAL_ROADS)strip(scene,road.samples,road.width+12,0,.027,shoulder);for(const c of CITIES){for(let i=0;i<5200;'),
    ('const water=new THREE.MeshStandardMaterial', 'for(const c of CITIES)addCityHorizon(batch,physics,c,tree,material,building,concrete);const water=new THREE.MeshStandardMaterial'),
]:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
