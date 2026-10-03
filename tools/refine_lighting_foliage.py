from pathlib import Path

root=Path(__file__).resolve().parents[1]
def change(file,old,new):
    p=root/file;t=p.read_text(encoding='utf-8');assert t.count(old)==1,(file,old[:60],t.count(old));p.write_text(t.replace(old,new),encoding='utf-8')

change('game/src/view.js','desired.set(t.x-cos*18+sin*12,5.6,t.z+sin*18+cos*12);target.set(t.x-sin*3,1.7,t.z-cos*3);','desired.set(t.x-cos*13-sin*11,4.4,t.z+sin*13-cos*11);target.set(t.x+sin*5,2.5,t.z+cos*5);')
change('game/src/view.js','this.sun.position.set(t.x-75,50+day*65,t.z-55);','this.sun.position.set(t.x-75,50+day*65,t.z+55);')
change('game/src/view.js','createSky(environment){const m=', 'createSky(environment){const panorama=environment.clone();panorama.flipY=false;panorama.needsUpdate=true;const m=')
change('game/src/view.js','skyMap:{value:environment}', 'skyMap:{value:panorama}')
change('game/src/view.js','vec2(fract(vSkyUv.x+.28),vSkyUv.y)', 'vec2(fract(vSkyUv.x+.08),1.0-clamp(.5+(vSkyUv.y-.5)*1.45,.002,.998))')
change('game/src/scenery.js','const bladeMat=new THREE.MeshStandardMaterial({color:0x687344,roughness:1,side:THREE.DoubleSide});','const bladeMat=new THREE.MeshStandardMaterial({color:0xb2b27e,roughness:1,side:THREE.DoubleSide,emissive:0x30451e,emissiveIntensity:.15});')
change('game/src/scenery.js','for(let i=0;i<160;i++)','for(let i=0;i<540;i++)')
change('game/src/scenery.js',"if(nearestRoad(px,z-19).distance>10)tree(batch,px,z-19,11+random()*4,false);", "if(nearestRoad(px,z-19).distance>10){tree(batch,px,z-19,11+random()*4,false);for(let k=0;k<4;k++)tree(batch,px-5+k*3.3,z-18+random()*3,1.4+random()*.9,false);}")
change('game/src/scenery.js','g.setAttribute(\'normal\',new THREE.Float32BufferAttribute(n,3));return g;', "g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.computeVertexNormals();return g;")
print('Reference framing, daylight, real sky mapping and layered roadside greenery updated.')
