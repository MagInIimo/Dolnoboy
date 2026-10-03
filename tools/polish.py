import pathlib

src = pathlib.Path(__file__).resolve().parents[1] / 'game' / 'src'

def replace(file, old, new, count=1):
    path = src / file
    text = path.read_text(encoding='utf-8')
    assert text.count(old) == count, (file, old[:80], text.count(old), count)
    path.write_text(text.replace(old, new), encoding='utf-8')

replace('view.js', "this.scene=new THREE.Scene();this.scene.fog", "this.scene=new THREE.Scene();this.scene.environment=this.environment();this.scene.fog")
replace('view.js', 'desired.set(p.x-17,7.2,p.z-20);target.set(p.x+1.6,1.65,p.z-1.5);this.camera.fov=48;', 'desired.set(p.x-24,8.6,p.z+24);target.set(p.x+8,1.9,p.z-10);this.camera.fov=49;')
replace('view.js', 'this.clock+=dt;const d=', 'if(running)this.clock+=dt;const d=')
replace('view.js', 'wh.rotation.y=i<2?', 'wh.rotation.y=i===0||i===3?')
replace('view.js', 'const a=this.model.data.active,kind=a&&a.stage===\'loaded\'?this.model.cargo.type:\'\';', "const a=this.model.data.active,kind=a?this.model.cargo.type:'';")
replace('view.js', "if(this.trailer&&this.model.data.trailer){const t=this.model.data.trailer;", "if(this.trailer&&a?.stage==='pickup'){const p=depot(CITIES[a.from]);this.trailer.group.position.set(p.x,.1,p.z+9.9);this.trailer.group.rotation.y=Math.PI;}if(this.trailer&&this.model.data.trailer){const t=this.model.data.trailer;")
replace('view.js', "const w=Math.min(218,this.width*.30),h=w/3.3,x=(this.width-w)/2,y=this.height-h-12;", "const w=Math.min(218,this.width*.30),h=w/3.3,x=(this.width-w)/2,top=this.width<600&&this.height>500?129:12,y=this.height-h-top;const label=this.frame.querySelector('#mirror-label');label.style.top=top+'px';label.style.height=h+'px';")
replace('physics.js', 'pointAt(road,s,3*dir)', 'pointAt(road,s,-3*dir)')
replace('physics.js', 'pointAt(car.road,car.s,3*car.dir)', 'pointAt(car.road,car.s,-3*car.dir)', 2)
replace('data.js', 'closest.s+leg.direction*65,3*leg.direction', 'closest.s+leg.direction*65,-3*leg.direction')
replace('vehicles.js', "box(cab,label('V \u00b7 6'),'0'", "box(cab,label('V \u00b7 6'),0")
replace('vehicles.js', 'VOLGA \u00b7 HAUL', 'VH \u00b7 01', 2)
replace('model.js', 'hour:17.1', 'hour:16.2')
replace('model.js', 'this.data.money-=Math.ceil(litres*55);', 'this.data.money=Math.max(0,this.data.money-Math.ceil(litres*55));')
replace('platform.js', "this.sdk.on('game_api_resume',()=>this.pause('platform',false));", "this.sdk.on('game_api_resume',()=>{this.pause('platform',false);this.pause('ad-wait',false);});")
replace('main.js', 'model.data.money+=5000;model.commit();sound.chime();', 'model.data.money+=5000;model.commit();')
replace('main.js', "ui.toast(ok?'earned':'rewardUnavailable'", "if(ok&&model.data.settings.sound&&!document.hidden&&platform.pauses.size===0)sound.chime();ui.toast(ok?'earned':'rewardUnavailable'")
replace('main.js', "ui.result=record;ui.show('result');sound.chime();", "ui.result=record;ui.show('result');if(model.data.settings.sound&&!document.hidden&&platform.pauses.size===0)sound.chime();")
print('polish edits applied')
