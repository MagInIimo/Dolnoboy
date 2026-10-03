from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/src/scenery.js'
s = p.read_text(encoding='utf-8')
s = s.replace('collectApartmentGeometries(assets.apartment)', 'collectApartmentGeometries(assets.apartment,assets.apartmentLod)')
s = s.replace('lod.addLevel(low,115,.15)', 'lod.addLevel(low,geo.userData.lodDistance??115,.15)')
s = s.replace('function tree(batch,x,z,size,pine=true){', 'function tree(batch,x,z,size,pine=true,groundY=0){')
s = s.replace('t.bark,x,0,z,size,size,size,yaw', 't.bark,x,groundY,z,size,size,size,yaw')
s = s.replace('t.leaf,x,0,z,size,size,size,yaw', 't.leaf,x,groundY,z,size,size,size,yaw')
s = s.replace('tree(batch,px,z+21,9+random()*4,false)', 'tree(batch,px,z+48,9+random()*4,false)')
s = s.replace('tree(batch,px+8,z+24,5+random()*3,false)', 'tree(batch,px+8,z+50,5+random()*3,false)')
a='batch.add(hillGeo,material(road.id<6?0x7e8a57:0xb3a76e),p.x+Math.cos(p.heading)*off,-3,p.z-Math.sin(p.heading)*off,70+random()*50,22+random()*28,65+random()*60,p.heading);'
b='const hx=p.x+Math.cos(p.heading)*off,hz=p.z-Math.sin(p.heading)*off,hw=70+random()*50,hh=22+random()*28,hd=65+random()*60;batch.add(hillGeo,material(road.id<6?0x7e8a57:0xb3a76e),hx,-3,hz,hw,hh,hd,p.heading);for(let k=0;k<10;k++){const a=random()*6.28,r=.15+random()*.64,lx=Math.cos(a)*r,lz=Math.sin(a)*r,y=-3+hh*Math.pow(Math.max(0,1-(lx*lx+lz*lz)/.92),1.5)*(.67+.17*Math.sin(lx*3.5)+.13*Math.cos(lz*4.2)),tx=hx+lx*hw*Math.cos(p.heading)+lz*hd*Math.sin(p.heading),tz=hz-lx*hw*Math.sin(p.heading)+lz*hd*Math.cos(p.heading);if(nearestRoad(tx,tz).distance>24)tree(batch,tx,tz,8+random()*10,road.id<6?random()>.5:random()>.8,y-.15);}'
assert a in s
s=s.replace(a,b)
a='if(entry.tag===\'glass\'){entry.material.vertexColors=true;entry.material.color.setHex(0xffffff);entry.material.userData.envBoost=1.8;}'
b='if(entry.tag===\'glass\'){entry.material.vertexColors=true;entry.material.color.setHex(0xffffff);entry.material.userData.envBoost=1.8;lightWindows(entry.geometry,entry.material);}'
assert a in s
s=s.replace(a,b)
pos=s.index('export function buildScenery')
helper="""function lightWindows(geometry,mat){for(const g of [geometry,geometry.userData.lodGeometry].filter(Boolean)){const p=g.attributes.position,a=new Float32Array(p.count);for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),side=Math.abs(x)>12,row=Math.floor(p.getY(i)/3.1),col=Math.floor(side?(z+9)/4.5:(x+12.5)/(25/6)),face=side?(x>0?2:3):(z>0?0:1);a[i]=(row*73+col*31+face*11)%5<2?1:0;}g.setAttribute('roomLight',new THREE.BufferAttribute(a,1));}mat.emissive.setHex(0xffc16a);mat.emissiveIntensity=0;mat.userData.windowLight=true;mat.onBeforeCompile=shader=>{shader.vertexShader='attribute float roomLight;varying float vRoomLight;\\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\\nvRoomLight=roomLight;');shader.fragmentShader='varying float vRoomLight;\\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\\ntotalEmissiveRadiance*=vRoomLight;');};mat.customProgramCacheKey=()=>\"lit-apartment-rooms\";}
"""
s=s[:pos]+helper+s[pos:]
p.write_text(s,encoding='utf-8')
p=root / 'game/src/view.js'
s=p.read_text(encoding='utf-8')
s=s.replace("const ibl=mix(.016,.63,day)","for(const m of this.materials){if(m.userData.windowLight)m.emissiveIntensity=(1-day)*.5;}const ibl=mix(.016,.63,day)")
p.write_text(s,encoding='utf-8')
