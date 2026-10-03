from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'game/src/scenery.js'
s = p.read_text(encoding='utf-8')
def swap(a, b):
    global s
    assert a in s, a[:120]
    s = s.replace(a, b)

swap("mesh.castShadow=true;mesh.computeBoundingSphere()", "mesh.castShadow=!geo.userData.noCast;mesh.computeBoundingSphere()")
swap("if(ground)options.color=color===0xb3a76e?0xbdb793:0xb4c79b;", "if(ground)options.color=color===0xb3a76e?0xd0c4a4:0xffffff;")
swap("options.roughness=.18;options.metalness=1;options.color=0xb5c8cb;", "options.roughness=.095;options.metalness=1;options.color=0x719fbc;")
swap("const m=new THREE.MeshStandardMaterial(options);materialCache.set", "const m=new THREE.MeshStandardMaterial(options);if(glassColors.has(color))m.userData.envBoost=2.1;materialCache.set")
swap("const bladeMat=new THREE.MeshStandardMaterial({color:0xb2b27e,roughness:1,side:THREE.DoubleSide,emissive:0x30451e,emissiveIntensity:.15});", "const bladeMat=new THREE.MeshStandardMaterial({map:assets.grass,color:0xffffff,roughness:1,side:THREE.DoubleSide,alphaTest:.55,alphaToCoverage:true,emissive:0x151d09,emissiveIntensity:.1});const shrubMat=leafMaterial(assets.foliage,0xc4d5a5);")
swap("color:surface.green?0xb2c898:0x829574", "color:surface.green?0xffffff:0x829574")
swap("roughness:.93,color:0xffffff", "roughness:.93,color:0xc3cad0")
swap("color:0xe0d7c2,roughness:1", "color:0xbdbcb5,roughness:1")
swap("for(let i=0;i<540;i++){const x=c.x-178+random()*356,z=c.z+(random()>.5?1:-1)*(9.2+random()*2.7);if(nearestRoad(x,z).distance<8.7)continue;batch.add(grassGeo,bladeMat,x,.02,z,.8+random()*.7,.65+random()*.7,.8+random()*.7,random()*6.28);}", "for(let i=0;i<2100;i++){const x=c.x-180+random()*360,z=c.z+(random()>.5?1:-1)*(9.3+random()*21);if(nearestRoad(x,z).distance<8.8)continue;const size=.7+random()*.95;batch.add(grassGeo,bladeMat,x,.012,z,size,.7+random()*.65,size,random()*6.28);}")
swap("if(CITIES.some(c=>distance(c,p)<210))continue;", "if(CITIES.some(c=>distance(c,p)<90))continue;")
swap("for(let k=0;k<4;k++)tree(batch,px-5+k*3.3,z-18+random()*3,1.4+random()*.9,false);", "for(let k=0;k<6;k++){const bx=px-7+k*2.6,bz=z-18+random()*2;if(nearestRoad(bx,bz).distance>11)batch.add(shrubGeo,shrubMat,bx,.05,bz,1.3+random()*.5,1.1+random()*.5,1.3+random()*.5,random()*6.28);}")
swap("for(let j=0;j<32;j++){const a=j/32*Math.PI*2;", "for(let j=0;j<60;j++){const a=j/60*Math.PI*2;")
swap("for(let j=0;j<12;j++){const py=z-12,px=x-135+j*23;", "for(let j=0;j<170;j++){const side=j%2?1:-1,tx=x+side*(172+random()*195),tz=z-120+random()*310;if(nearestRoad(tx,tz).distance>19){tree(batch,tx,tz,9+random()*12,j%4===0);if(j%5===0)batch.add(shrubGeo,shrubMat,tx+3,.05,tz+4,2,1.5,2,random()*6.28);}}for(let j=0;j<12;j++){const py=z-12,px=x-135+j*23;")
swap("b(0x9babaf,xx,j,zz", "b(0x536a78,xx,j,zz")
swap("b(0x9babaf,xx+ox*Math.cos(a)", "b(0x536a78,xx+ox*Math.cos(a)")
p.write_text(s, encoding='utf-8')

p = root / 'game/src/view.js'
s = p.read_text(encoding='utf-8')
s = s.replace("brightness:{value:.8}", "brightness:{value:1.25},skyRotation:{value:.55}")
s = s.replace("uniform float brightness;uniform vec3 horizon;", "uniform float brightness;uniform float skyRotation;uniform vec3 horizon;")
s = s.replace("fract(vSkyUv.x+.55)", "fract(vSkyUv.x+skyRotation)")
s = s.replace("0xc4d1c3", "0xc2d3e5")
s = s.replace("mix(.008,.8,day)", "mix(.008,1.25,day)")
s = s.replace("m.envMapIntensity=ibl;", "m.envMapIntensity=ibl*(m.userData.envBoost??1);")
p.write_text(s, encoding='utf-8')
