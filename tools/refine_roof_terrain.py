from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'game/src/scenery.js'
t = p.read_text(encoding='utf-8')
def change(old, new):
    global t
    assert t.count(old) == 1, (old[:70], t.count(old))
    t = t.replace(old, new)

change('const materialCache=new Map();', '''const materialCache=new Map();
const hillGeo=(()=>{const g=new THREE.PlaneGeometry(2,2,24,20);g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),r=(x*x+z*z)/.92,h=Math.pow(Math.max(0,1-r),1.5)*(.67+.17*Math.sin(x*3.5)+.13*Math.cos(z*4.2));p.setY(i,h);}g.computeVertexNormals();return g;})();
function triangles(points){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.computeVertexNormals();return g;}
const pitchedRoof=triangles([-.5,0,-.5,0,1,-.5,-.5,0,.5,0,1,-.5,0,1,.5,-.5,0,.5,0,1,-.5,.5,0,-.5,0,1,.5,.5,0,-.5,.5,0,.5,0,1,.5]);
const gableEnds=triangles([-.5,0,.5,.5,0,.5,0,1,.5,.5,0,-.5,-.5,0,-.5,0,1,-.5]);
''')
change('put(roof,w*.22,h+.65,-d*.2,2.2,1.1,1.7);', '''const pitched=Math.abs(Math.floor(x*1.7+z*.8))%4===0;
 if(pitched){const metal=material(0x8b8c7b,.58,1);batch.add(pitchedRoof,metal,x,h+.44,z,w+.7,3.3,d+.7,yaw);batch.add(gableEnds,material(color),x,h+.44,z,w+.2,3.26,d+.2,yaw);for(let j=-4;j<=4;j++){const zz=j*(d+.7)/9;for(const side of [-1,1]){const lx=side*(w+.7)/4;batch.add(unitBox,material(0x69716a,.56,1),x+lx*Math.cos(yaw)+zz*Math.sin(yaw),h+2.10,z-lx*Math.sin(yaw)+zz*Math.cos(yaw),Math.hypot((w+.7)/2,3.3),.04,.06,yaw);}}}
 const rooftop=pitched?3.3:0;
 put(roof,w*.22,h+.65+rooftop,-d*.2,2.2,1.1,1.7);''')
change('put(stone,-w*.24,h+.8,d*.17,.9,1.7,.9);put(material(0x778376),0,h+2.4,0,.038,4.5,.038);put(material(0x778376),0,h+3.2,0,2,.035,.035);', 'put(stone,-w*.24,h+.8+rooftop,d*.17,.9,1.7,.9);put(material(0x778376),0,h+2.4+rooftop,0,.038,4.5,.038);put(material(0x778376),0,h+3.2+rooftop,0,2,.035,.035);')
change('batch.add(sphereGeo,material(road.id<6?0x7e8a57:0xb3a76e)', 'batch.add(hillGeo,material(road.id<6?0x7e8a57:0xb3a76e)')
p.write_text(t,encoding='utf-8')
print('Continuous rolling terrain and pitched regional roofs added.')
