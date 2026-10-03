from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/src/view.js'
s = p.read_text(encoding='utf-8')
replacements = [
    ('this.renderer.shadowMap.enabled=true;', 'this.renderer.info.autoReset=false;this.renderer.shadowMap.enabled=true;'),
    ('this.renderer.render(this.scene,this.camera);', 'this.renderer.info.reset();this.renderer.render(this.scene,this.camera);'),
    ('this.renderer.render(this.scene,this.mirrorCamera);', 'const shadowUpdate=this.renderer.shadowMap.autoUpdate;this.renderer.shadowMap.autoUpdate=false;this.renderer.render(this.scene,this.mirrorCamera);this.renderer.shadowMap.autoUpdate=shadowUpdate;'),
]
for old, new in replacements:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
