import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
p = root / 'game/src/ui.js'
t = p.read_text(encoding='utf-8')
t = t.replace("this.previous='home';", "this.previous='home';this.history=[];")
old="show(screen,previous=null){if(previous!==null)this.previous=previous;else if(screen&&screen!==this.screen)this.previous=this.screen||'pause';this.screen=screen;this.draw();}"
new="show(screen,previous=null,remember=true){if(screen!==this.screen&&remember&&screen)this.history.push(previous??this.screen);if(!screen||screen==='home')this.history=[];this.previous=this.history.at(-1)??'home';this.screen=screen;this.draw();}\n goBack(started){const target=this.history.pop()??(started?'':'home');this.show(target==='pause'&&!started?'home':target,null,false);}"
assert old in t
t = t.replace(old,new)
t = t.replace("copyright:'Geometry, textures and sounds were made for this game. Three.js — MIT; Rapier — Apache-2.0.'", "copyright:'Original vehicles and sounds. Surface materials and sky: Poly Haven, CC0. Three.js — MIT; Rapier — Apache-2.0.'")
p.write_text(t,encoding='utf-8')
p = root / 'game/src/main.js'
t = p.read_text(encoding='utf-8')
old="if(type==='back'){const previous=ui.previous;ui.show(previous==='home'&&!started?'home':previous==='pause'?started?'':'home':previous||'');setMode();return;}"
assert old in t
t = t.replace(old,"if(type==='back'){ui.goBack(started);setMode();return;}")
p.write_text(t,encoding='utf-8')
print('screen history fixed')
