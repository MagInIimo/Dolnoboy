import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/assets/manifest.json'
m = json.loads(p.read_text(encoding='utf-8'))
m['materials']['asphalt']['map'] = 'asphalt-fine.png'
p.write_text(json.dumps(m, separators=(',', ':')), encoding='utf-8')
p = root / 'tools/prepare_assets.py'
s = p.read_text(encoding='utf-8')
s = s.replace("manifest['materials']['green']['map'] = 'grass-ground.png'", "manifest['materials']['green']['map'] = 'grass-ground.png'\nmanifest['materials']['asphalt']['map'] = 'asphalt-fine.png'")
p.write_text(s, encoding='utf-8')
p = root / 'tools/build.mjs'
s = p.read_text(encoding='utf-8').replace('grass and cloud textures', 'grass, asphalt and cloud textures')
p.write_text(s, encoding='utf-8')
p = root / 'game/src/scenery.js'
s = p.read_text(encoding='utf-8')
s = s.replace('roughness:.93,color:0xbdb7ac,normalScale:new THREE.Vector2(.4,.4)', 'roughness:.93,color:0xbdb7ac,normalScale:new THREE.Vector2(.10,.10)')
old = "else if(c.index===6){b(0xc4b08a,0,1,0,40,2,30);cy(0xe1ddd1,0,13,0,2.5,23);batch.add(coneGeo,material(0xe3e3d5),x,26,z,2.5,5,2.5);for(const xx of [-4,4]){cy(0xdbd1ba,xx,7,0,1.3,11);batch.add(coneGeo,material(0xdeaa62),x+xx,14,z,1.3,3,1.3);}b(0x899288,0,2,0,18,2,10);}"
new = "else if(c.index===6){b(0xc4b08a,0,.5,0,40,1,30);const sail=new THREE.Shape();sail.moveTo(-8,4);sail.bezierCurveTo(-1,9,1,20,3,29);sail.bezierCurveTo(3.9,29,5.5,26,5.8,22);sail.bezierCurveTo(6.8,15,6,9,9,4);sail.closePath();const sailGeo=new THREE.ExtrudeGeometry(sail,{depth:1.6,bevelEnabled:true,bevelThickness:.18,bevelSize:.18,bevelSegments:3,curveSegments:24,steps:1});batch.add(sailGeo,material(0xe1ddd1),x,0,z-.8,1,1,1);const hull=new THREE.Shape();hull.moveTo(-18,4.5);hull.quadraticCurveTo(-12,1.4,9,2.8);hull.lineTo(18,6.5);hull.quadraticCurveTo(-2,4.8,-18,4.5);const hullGeo=new THREE.ExtrudeGeometry(hull,{depth:5,bevelEnabled:true,bevelThickness:.16,bevelSize:.16,bevelSegments:2,curveSegments:20});batch.add(hullGeo,material(0xe1ddd1),x,0,z-2.5,1,1,1);b(0x899288,0,1.1,0,24,1.2,9);}"
assert old in s
s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
