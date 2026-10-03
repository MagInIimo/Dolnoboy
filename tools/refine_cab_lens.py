from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'game/src/view.js'
source = path.read_text(encoding='utf-8')
before = 'target.set(t.x+Math.sin(t.yaw+this.look)*70,2.85,t.z+Math.cos(t.yaw+this.look)*70);this.camera.fov=60;'
after = 'target.set(t.x+Math.sin(t.yaw+this.look)*35,.5,t.z+Math.cos(t.yaw+this.look)*35);this.camera.fov=42;'
assert source.count(before) == 1
path.write_text(source.replace(before, after), encoding='utf-8')
print('Cab lens: 42 degrees vertical, approximately 68 degrees horizontal at 16:9; slight downward eye line.')
