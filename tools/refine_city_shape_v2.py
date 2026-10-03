from pathlib import Path

root = Path(__file__).resolve().parents[1]
for name, pairs in {
    'game/src/scenery.js': [
        ('road.width+12,0,.027,shoulder', 'road.width+8,0,.027,shoulder'),
        ('*(14.4+random()*(i<3000?6:15));if(nearestRoad(x,z).distance<14.2)', '*(11.4+random()*(i<3000?6:15));if(nearestRoad(x,z).distance<11.2)'),
        ('color:0xffffff,roughness:1,side:THREE.DoubleSide,alphaTest:.55', 'color:0xb6c09f,roughness:1,side:THREE.DoubleSide,alphaTest:.35'),
        ('0xb4bda8', '0x90977d'),
        ('color:0xc3cad0', 'color:0xbdb7ac'),
        ('tree(batch,px,z+48,9+random()*4,false)', 'tree(batch,px,z+34,18+random()*4,false)'),
    ],
    'game/src/city-horizon.js': [
        ('hx=x+1000,hz=z-310,hw=660,hd=240,hh=154', 'hx=x+850,hz=z-265,hw=500,hd=190,hh=128'),
        ('for(let i=0;i<650;i++)', 'for(let i=0;i<1600;i++)'),
    ],
    'game/src/view.js': [
        ('this.sun.shadow.camera.left=-65;this.sun.shadow.camera.right=65;this.sun.shadow.camera.top=65;this.sun.shadow.camera.bottom=-65;', 'this.sun.shadow.camera.left=-95;this.sun.shadow.camera.right=95;this.sun.shadow.camera.top=95;this.sun.shadow.camera.bottom=-95;'),
        ('30+day*45,t.z+65', '25+day*30,t.z+65'),
        ('this.camera.fov=68;', 'this.camera.fov=57;'),
    ],
}.items():
    p = root / name
    s = p.read_text(encoding='utf-8')
    for old, new in pairs:
        assert old in s, (name, old)
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
