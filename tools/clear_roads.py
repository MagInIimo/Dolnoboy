import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
p = root / 'game/src/scenery.js'
t = p.read_text(encoding='utf-8')
marker='function building(batch,physics,x,z,w,d,h,color,yaw=0){'
assert marker in t
t=t.replace(marker,marker+"\n if(!siteClear(x,z,w,d,yaw))return;")
start="batch.box(0x6f8280,yard.x-31,5,yard.z+6,25,10,35);physics.obstacle(yard.x-31,yard.z+6,25,35);"
assert start in t
t=t.replace(start,"const warehouse=warehouseAt(yard);if(warehouse)warehouseDetails(batch,physics,warehouse);")
t=t.replace("batch.box(0xc7cdc0,yard.x-18.45,3.1,yard.z-5+j*10,.07,5.8,6.7);",'')
service="batch.box(0xb3b59d,srv.x+27,3.5,srv.z+4,15,7,26);physics.obstacle(srv.x+27,srv.z+4,15,26);"
assert service in t
t=t.replace(service,"if(siteClear(srv.x+27,srv.z+32,15,26)){batch.box(0xb3b59d,srv.x+27,3.5,srv.z+32,15,7,26);physics.obstacle(srv.x+27,srv.z+32,15,26);}")
a=t.index(' for(let j=0;j<17;j++)batch.add(unitBox,metal,')
b=t.index(' for(let i=0;i<5;i++){batch.add(unitBox,crate',a)
t=t[:a]+t[b:]
t=t.replace('for(const offset of [-20,20]){batch.add(', 'for(const offset of [-20,20]){if(!siteClear(x+offset,z+side*27,18,.2,0,2))continue;batch.add(')
helper="""const roadSamples=[...ROADS,...LOCAL_ROADS].flatMap(r=>r.samples.map(p=>({...p,width:r.width??14})));
function siteClear(x,z,w,d,yaw=0,extra=2){const c=Math.cos(yaw),s=Math.sin(yaw),radius=Math.hypot(w,d)/2+15;for(const p of roadSamples){if(Math.abs(p.x-x)>radius||Math.abs(p.z-z)>radius)continue;const dx=p.x-x,dz=p.z-z,lx=dx*c-dz*s,lz=dx*s+dz*c;if(Math.abs(lx)<w/2+p.width/2+extra&&Math.abs(lz)<d/2+p.width/2+extra)return false;}return true;}
function warehouseAt(yard){for(const [dx,dz] of [[-31,11],[-36,33],[42,35],[-52,-9],[-42,53]]){const p={x:yard.x+dx,z:yard.z+dz};if(siteClear(p.x,p.z,25,35))return p;}return null;}
function warehouseDetails(batch,physics,p){const x=p.x,z=p.z,metal=material(0xa6aca3,.48,1),dark=material(0x33433f);batch.box(0x6f8280,x,5,z,25,10,35);physics.obstacle(x,z,25,35);for(let j=0;j<17;j++)batch.add(unitBox,metal,x+12.6,4.9,z-16+j*2,.085,9.1,.09);for(const side of [-1,1]){batch.add(unitBox,dark,x,9.85,z+side*17.5,26,.16,.18);batch.add(unitBox,metal,x,10.2,z+side*14,22,.12,2.6);}for(let j=-1;j<=1;j++){const zz=z+j*10;batch.add(unitBox,dark,x+12.63,3.05,zz,.08,5.8,6.7);for(let k=0;k<12;k++)batch.add(unitBox,metal,x+12.72,.7+k*.43,zz,.08,.04,6.5);batch.add(unitBox,dark,x+13.5,6.18,zz,1.8,.13,7.8);for(const sign of [-1,1])batch.add(unitBox,material(0xeac37e),x+12.76,2.8,zz+sign*3.7,.13,5.6,.24);}}
"""
t=t.replace('function decorateDepot(',helper+'function decorateDepot(')
p.write_text(t,encoding='utf-8')
print('road footprints cleared')
