from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'game/src/scenery.js'
s = p.read_text(encoding='utf-8')
s = s.replace("color===0xb3a76e?0xd0c4a4:0xffffff", "color===0xb3a76e?0xd0c4a4:0xb4bda8")
s = s.replace("color:surface.green?0xffffff:0x829574", "color:surface.green?0xb4bda8:0x829574")
s = s.replace("if(nearestRoad(x,z).distance>10)batch.add(unitBox,concrete,x,.045,z,5.8,.08,2.6);", "if(nearestRoad(x,z).distance>10){batch.add(unitBox,concrete,x,.075,z,5.8,.15,2.6);batch.add(unitBox,concrete,x,.085,z+1.35,5.85,.2,.17);}")
needle="decorateDepot(batch,physics,yard);const colors="
insert="decorateDepot(batch,physics,yard);const rail=material(0x54635e,.63,.7);for(let i=0;i<58;i++){const rx=x-174+i*6,rz=z-11.9;if(nearestRoad(rx,rz).distance<10.8)continue;batch.add(unitBox,rail,rx,1.02,rz,5.8,.04,.05);batch.add(unitBox,rail,rx,.42,rz,5.8,.035,.05);for(let j=-3;j<=3;j++)batch.add(unitBox,rail,rx+j*.84,.67,rz,.035,.72,.035);physics.obstacle(rx,rz,5.8,.10);}const colors="
assert needle in s
s = s.replace(needle,insert)
p.write_text(s,encoding='utf-8')
