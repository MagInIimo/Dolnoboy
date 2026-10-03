from pathlib import Path

root = Path(__file__).resolve().parents[1]
for name, pairs in {
    'game/src/physics.js': [
        ('this.types=new Map();', 'this.types=new Map();this.cameraBlocks=[];'),
        ('obstacle(x,z,w,l,yaw=0){', 'obstacle(x,z,w,l,yaw=0,cameraHeight=0){if(cameraHeight>0)this.cameraBlocks.push({x,z,w,l,yaw,height:cameraHeight});'),
    ],
    'game/src/scenery.js': [
        ('physics.obstacle(x,z,w,d,yaw);', 'physics.obstacle(x,z,w,d,yaw,h+3.4);'),
        ('physics.obstacle(srv.x+27,srv.z+32,15,26);', 'physics.obstacle(srv.x+27,srv.z+32,15,26,0,7);'),
    ],
    'game/src/city-horizon.js': [
        ('physics.obstacle(tx,tz,w+3,d+3);', 'physics.obstacle(tx,tz,w+3,d+3,0,h);'),
    ],
    'game/src/view.js': [
        ("import * as THREE from 'three';", "import * as THREE from 'three';\nimport {cameraPosition} from './camera-obstacles.js';"),
        ('this.camera.lookAt(target);', 'if(this.mode!==1||this.menu)this.camera.position.copy(cameraPosition(this.physics.cameraBlocks,{x:t.x,y:3.2,z:t.z},this.camera.position));this.camera.lookAt(target);'),
    ],
}.items():
    p = root / name
    s = p.read_text(encoding='utf-8')
    for old, new in pairs:
        assert old in s, (name, old)
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
