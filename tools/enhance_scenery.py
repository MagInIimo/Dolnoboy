import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
p = root / 'game/src/scenery.js'
text = p.read_text(encoding='utf-8')
old = "export function buildScenery(scene,physics){const batch=new Batch(scene),random=rng(19476),signs=[],pedestrians=[],streetlights=[];const groundTex=texture('ground');groundTex.repeat.set(2200,2200);const ground=new THREE.Mesh(new THREE.PlaneGeometry(26000,26000),new THREE.MeshStandardMaterial({map:groundTex,color:0xb0b18b,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(4500,-.055,4300);ground.receiveShadow=true;scene.add(ground);const asphalt=new THREE.MeshStandardMaterial({map:texture('road'),roughness:.88,color:0xb3b9b6});const shoulder=material(0xa79f7c);const white=material(0xddd7bd);"
new = """export function buildScenery(scene,physics,assets){
 surface=assets.materials;
 for(const name of ['brick','plaster'])for(const t of Object.values(surface[name]))t.repeat.set(6,6);
 trees={birch:{...foliageGeometry(false),bark:new THREE.MeshStandardMaterial({map:barkTexture(),roughness:1}),leaf:leafMaterial(assets.foliage,0xc7d2ad)},pine:{...foliageGeometry(true),bark:material(0x786b53),leaf:leafMaterial(assets.foliage,0x6f8963)}};
 const batch=new Batch(scene),random=rng(19476),signs=[],pedestrians=[],streetlights=[];
 const green=surface.green??surface.grass,groundOptions={};for(const [k,t] of Object.entries(green)){groundOptions[k]=t.clone();groundOptions[k].repeat.set(8700,8700);}
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(26000,26000),new THREE.MeshStandardMaterial({...groundOptions,color:surface.green?0xb2c898:0x829574,roughness:1,normalScale:new THREE.Vector2(.4,.4)}));ground.rotation.x=-Math.PI/2;ground.position.set(4500,-.055,4300);ground.receiveShadow=true;scene.add(ground);
 const asphalt=new THREE.MeshStandardMaterial({...surface.asphalt,roughness:.93,color:0xffffff,normalScale:new THREE.Vector2(.4,.4)});
 const shoulder=new THREE.MeshStandardMaterial({...surface.gravel,color:0xe0d7c2,roughness:1,normalScale:new THREE.Vector2(.5,.5)}),concrete=new THREE.MeshStandardMaterial({...surface.concrete,color:0xc8c8bc,roughness:1,normalScale:new THREE.Vector2(.35,.35)});
 const white=material(0xe6e2cf);"""
assert old in text
text = text.replace(old, new)
text = text.replace("const fieldMat=new THREE.MeshStandardMaterial({map:texture('field'),roughness:1});", "const fieldOptions={};for(const [k,t] of Object.entries(surface.grass)){fieldOptions[k]=t.clone();fieldOptions[k].repeat.set(42,42);}const fieldMat=new THREE.MeshStandardMaterial({...fieldOptions,color:0xc8c09d,roughness:1});")
text = text.replace('for(let s=100;s<road.length-90;s+=18)', 'for(let s=100;s<road.length-90;s+=13)')
text = text.replace("tree(batch,x,z,5+random()*8,road.id<5?random()>.38:random()>.8);", "tree(batch,x,z,7+random()*9,road.id<5?random()>.65:random()>.8);if(road.id<6){const off2=side*(85+random()*85);tree(batch,p.x+Math.cos(p.heading)*off2,p.z-Math.sin(p.heading)*off2,9+random()*10,random()>.65);}")
text = text.replace('batch.box(0xb2b5a0,x,-.005,z,355,.06,225);', '')
text = text.replace('material(0xbfc0ad)', 'concrete')
text = text.replace('batch.box(0x8b928a,yard.x,.032,yard.z,60,.035,57);', 'batch.add(unitBox,concrete,yard.x,.022,yard.z,60,.022,57);')
text = text.replace('batch.box(0x8a9386,srv.x,.026,srv.z,44,.04,45);', 'batch.add(unitBox,concrete,srv.x,.015,srv.z,44,.022,45);')
text = text.replace('const colors=[', 'decorateDepot(batch,physics,yard);const colors=[')
text = text.replace("for(let j=0;j<20;j++){const px=x-155+j*16;lamp(batch,px,z-11);tree(batch,px,z+21,6+random()*3,false);}", "for(let j=0;j<20;j++){const px=x-155+j*16;lamp(batch,px,z-11);streetlights.push({x:px+1.9,z:z-11});tree(batch,px,z+21,9+random()*4,false);if(j%2===0)tree(batch,px+8,z+24,5+random()*3,false);}for(let j=0;j<32;j++){const a=j/32*Math.PI*2;const tx=x+Math.cos(a)*205,tz=z+Math.sin(a)*170;if(distance(nearestRoad({x:tx,z:tz}),{x:tx,z:tz})>20)tree(batch,tx,tz,11+random()*7,j%4===0);}")
text = text.replace('46,0x589c9b,-.02', '46,0x589c9b,.031').replace('51,0xb8b7a0,-.04', '51,0xb8b7a0,.029').replace('42,0x5b9691,-.025', '42,0x5b9691,.022').replace('55,0x568e88,-.025', '55,0x568e88,.022')
text = text.replace('strip(scene,s,32,0,-.025,water)', 'strip(scene,s,45,0,-.005,water)')
text = text.replace('return {signs,pedestrians,asphalt,streetlights,ground}', 'return {signs,pedestrians,asphalt,streetlights,ground,water}')
helper = """function decorateDepot(batch,physics,yard){
 const x=yard.x,z=yard.z,metal=material(0xa6aca3,.48,1),dark=material(0x33433f),crate=material(0x8a7658);
 for(let j=0;j<17;j++)batch.add(unitBox,metal,x-18.39,4.9,z-10+j*2,.085,9.1,.09);
 for(const side of [-1,1]){batch.add(unitBox,dark,x-31,9.85,z+6+side*17.5,26,.16,.18);batch.add(unitBox,metal,x-31,10.2,z+6+side*14,22,.12,2.6);}
 for(let j=0;j<3;j++){const zz=z-5+j*10;batch.add(unitBox,dark,x-18.37,3.05,zz,.08,5.8,6.7);for(let k=0;k<12;k++)batch.add(unitBox,metal,x-18.28,.7+k*.43,zz,.08,.04,6.5);batch.add(unitBox,dark,x-17.5,6.18,zz,1.8,.13,7.8);batch.add(unitBox,material(0xeac37e),x-18.24,2.8,zz+3.7,.13,5.6,.24);batch.add(unitBox,material(0xeac37e),x-18.24,2.8,zz-3.7,.13,5.6,.24);}
 for(let i=0;i<5;i++){batch.add(unitBox,crate,x+22,.3,z-15+i*4.5,3,.15,2.6);for(let j=0;j<3;j++)batch.add(unitBox,material(0xb59e79),x+22,.8+j*.85,z-15+i*4.5,2.8,.75,2.4);}
 for(const side of [-1,1])for(const offset of [-20,20]){batch.add(unitBox,metal,x+offset,1.15,z+side*27,18,.045,.08);batch.add(unitBox,metal,x+offset,.65,z+side*27,18,.045,.08);for(let k=-4;k<=4;k++)batch.add(unitBox,metal,x+offset+k*2.1,.7,z+side*27,.06,1.4,.06);physics.obstacle(x+offset,z+side*27,18,.2);}
}
"""
text = text.replace('export function buildScenery(', helper + 'export function buildScenery(')
p.write_text(text, encoding='utf-8')
print('scenery enhanced')
