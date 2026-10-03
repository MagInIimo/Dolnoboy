from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'game/src/view.js'
source = path.read_text(encoding='utf-8')
for before, after in {
    'this.sun.shadow.camera.left=-95;this.sun.shadow.camera.right=95;this.sun.shadow.camera.top=95;this.sun.shadow.camera.bottom=-95;': 'this.sun.shadow.camera.left=-130;this.sun.shadow.camera.right=130;this.sun.shadow.camera.top=130;this.sun.shadow.camera.bottom=-130;this.sun.shadow.autoUpdate=false;',
    'this.sun.position.set(t.x-95,25+day*30,t.z+65);': 'this.sun.position.set(t.x+70,25+day*15,t.z+95);updateInstruments(this.truck.instruments,speed,t.fuel,this.model.capacity,day);',
    'this.renderer.info.reset();this.renderer.render(this.scene,this.camera);': 'this.renderer.info.reset();this.sun.shadow.needsUpdate=!this.sun.shadow.map||(this.shadowFrame=(this.shadowFrame??0)+1)%2===0;this.renderer.render(this.scene,this.camera);'
}.items():
    assert source.count(before) == 1, before
    source = source.replace(before, after)
path.write_text(source, encoding='utf-8')
print('Warm key from screen right, lower sun and broad shadows; cached alternate frames; working speed/fuel needles.')
