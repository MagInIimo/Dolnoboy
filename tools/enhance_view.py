import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
p = root / 'game/src/view.js'
t = p.read_text(encoding='utf-8')
t = t.replace('constructor(frame,model,physics,onContext){','constructor(frame,model,physics,onContext,assets){')
t = t.replace('this.scene.environment=this.environment();', 'this.scene.environment=assets.environment;this.scene.background=assets.environment;this.scene.backgroundIntensity=.7;')
t = t.replace('buildScenery(this.scene,physics)', 'buildScenery(this.scene,physics,assets)')
t = t.replace('createTruck(model.data.paint)', 'createTruck(model.data.paint,assets)')
t = t.replace('this.sun.shadow.mapSize.set(1024,1024)', 'this.sun.shadow.mapSize.set(2048,2048)')
t = t.replace('this.clouds=this.createClouds();this.scene.add(this.clouds);', 'this.clouds=this.createClouds();this.clouds.visible=false;this.sky.visible=false;this.scene.add(this.clouds);')
t = t.replace('this.resize();this.setQuality(model.data.settings.quality);', "this.materials=new Set();this.collectMaterials(this.scene);this.streetPool=Array.from({length:5},()=>{const l=new THREE.PointLight(0xffd6a2,0,24,2);this.scene.add(l);return l;});this.contactShadow=this.shadowDecal();this.scene.add(this.contactShadow);this.resize();this.setQuality(model.data.settings.quality);")
t = t.replace('this.scene.add(this.trailer.group);', 'this.scene.add(this.trailer.group);this.collectMaterials(this.trailer.group);')
t = t.replace('this.truck.cab.rotation.x=Math.sin(this.clock*6)*Math.abs(speed)*.0006;', 'this.truck.cab.rotation.x=Math.sin(this.clock*6)*Math.abs(speed)*.0003;')
t = t.replace('wh.rotation.x+=speed*dt/.53', 'wh.rotation.x+=running?speed*dt/.53:0')
t = t.replace('this.hemi.intensity=mix(.4,2.0,day)', 'this.hemi.intensity=mix(.09,.85,day)')
t = t.replace('this.sun.intensity=mix(.09,3.0,day)', 'this.sun.intensity=mix(.015,3.1,day)')
t = t.replace('this.sunDisc.visible=day>.2&&wet<.4;', 'this.sunDisc.visible=false;this.scene.backgroundIntensity=mix(.008,.8,day)*(1-wet*.3);const ibl=mix(.016,.63,day)*(1-wet*.25);if(Math.abs((this.ibl??-1)-ibl)>.015){this.ibl=ibl;for(const m of this.materials)if(m.isMeshStandardMaterial)m.envMapIntensity=ibl;}this.contactShadow.position.set(t.x,.072,t.z);this.contactShadow.rotation.z=-t.yaw;const nearby=this.env.streetlights.filter(p=>Math.hypot(p.x-t.x,p.z-t.z)<125).sort((a,b)=>Math.hypot(a.x-t.x,a.z-t.z)-Math.hypot(b.x-t.x,b.z-t.z));this.streetPool.forEach((l,i)=>{const p=nearby[i];l.intensity=p?mix(110,0,day):0;if(p)l.position.set(p.x,6.5,p.z);});')
t = t.replace('a.array[i*3+1]-=dt*26;', 'if(running)a.array[i*3+1]-=dt*26;')
t = t.replace('this.env.asphalt.roughness=wet>.5?.52:.88;', 'this.env.asphalt.roughness=wet>.5?.36:.91;')
t = t.replace('environment(){', "collectMaterials(root){root.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])this.materials.add(m);});}\n shadowDecal(){const c=document.createElement('canvas');c.width=64;c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(32,64,4,32,64,60);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(.55,'rgba(0,0,0,.25)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,128);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(3.6,7.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));mesh.rotation.x=-Math.PI/2;return mesh;}\n environment(){")
p.write_text(t, encoding='utf-8')
print('view enhanced')
