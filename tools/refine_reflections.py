from pathlib import Path

root = Path(__file__).resolve().parents[1]
for name, pairs in {
    'game/src/scenery.js': [
        ('options.color=0x719fbc;', 'options.color=0x4d6879;'),
        ('if(glassColors.has(color))m.userData.envBoost=2.1;', 'if(glassColors.has(color)){m.userData.envBoost=1.25;m.userData.localReflection=true;}'),
        ('tree(batch,px,z+34,18+random()*4,false)', 'tree(batch,px,z+28,18+random()*4,false)'),
    ],
    'game/src/vehicles.js': [
        ("paintMat.color.setHex(PAINT[paint]??PAINT.teal);", "paintMat.color.setHex(PAINT[paint]??PAINT.teal);paintMat.userData.localReflection=true;"),
    ],
    'game/src/view.js': [
        ("import {cameraPosition} from './camera-obstacles.js';", "import {cameraPosition} from './camera-obstacles.js';\nimport {CityReflections} from './reflections.js';"),
        ('this.renderer.compile(this.scene,this.camera);', 'this.renderer.compile(this.scene,this.camera);this.reflections=new CityReflections(this.renderer,this.scene);'),
        ('this.renderer.render(this.scene,this.camera);', 'this.renderer.render(this.scene,this.camera);this.reflections.update(t,this.materials,this.quality,d.hour,d.weather,[this.truck.group,this.trailer?.group]);'),
    ],
}.items():
    p = root / name
    s = p.read_text(encoding='utf-8')
    for old, new in pairs:
        assert old in s, (name, old)
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
