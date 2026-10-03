from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/src/view.js'
s = p.read_text(encoding='utf-8')
for old, new in [
    ('this.renderer.compile(this.scene,this.camera);', 'this.scene.updateMatrixWorld(true);this.scene.matrixWorldAutoUpdate=false;this.renderer.compile(this.scene,this.camera);'),
    ('desired.set(t.x+sin*1.88+cos*.57,3.08,t.z+cos*1.88-sin*.57);target.set(t.x+Math.sin(t.yaw+this.look)*70,2.9,', 'desired.set(t.x+sin*2.48+cos*.57,3.02,t.z+cos*2.48-sin*.57);target.set(t.x+Math.sin(t.yaw+this.look)*70,3.00,'),
    ('this.renderer.info.reset();this.renderer.render(this.scene,this.camera);', 'for(const o of [this.truck.group,this.trailer?.group,this.sky,this.sun,this.sun.target,this.rain,this.parking,this.navigation,this.fuelMarker,this.contactShadow,...this.streetPool,...this.cars,...this.pedestrians.map(p=>p.g)])if(o)o.updateMatrixWorld(true);this.renderer.info.reset();this.renderer.render(this.scene,this.camera);'),
]:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
p = root / 'game/src/scenery.js'
s = p.read_text(encoding='utf-8')
assert 'const chunk=geo.userData.lodGeometry?80:240' in s
s = s.replace('const chunk=geo.userData.lodGeometry?80:240', 'const chunk=geo.userData.lodDistance?160:240')
p.write_text(s, encoding='utf-8')
p = root / 'game/src/vehicles.js'
s = p.read_text(encoding='utf-8')
assert "if(m.name==='MAT-glass')m.depthWrite=false;" in s
s = s.replace("if(m.name==='MAT-glass')m.depthWrite=false;", "if(m.name==='MAT-glass')m.depthWrite=false;if(m.name==='MAT-dashboard_screen')m.emissiveIntensity=1.2;if(m.name==='MAT-lamp_front')m.emissiveIntensity=.5;")
p.write_text(s, encoding='utf-8')
