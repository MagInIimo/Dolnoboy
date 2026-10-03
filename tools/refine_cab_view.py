from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'game/src/view.js'
source = path.read_text(encoding='utf-8')
before = 'desired.set(t.x+sin*2.48+cos*.57,3.02,t.z+cos*2.48-sin*.57);target.set(t.x+Math.sin(t.yaw+this.look)*70,3.00,t.z+Math.cos(t.yaw+this.look)*70);this.camera.fov=57;'
after = 'desired.set(t.x+sin*1.70+cos*.57,2.98,t.z+cos*1.70-sin*.57);target.set(t.x+Math.sin(t.yaw+this.look)*70,2.85,t.z+Math.cos(t.yaw+this.look)*70);this.camera.fov=60;'
assert source.count(before) == 1
path.write_text(source.replace(before, after), encoding='utf-8')
print('Driver eye moved in front of headrest; dashboard lies inside the visible cone.')
