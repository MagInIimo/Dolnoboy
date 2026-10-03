from pathlib import Path

p=Path(__file__).resolve().parents[1]/'game/src/scenery.js'
t=p.read_text(encoding='utf-8')
a=t.index('for(let j=-4;j<=4;j++){const zz=j*(d+.7)/9;')
b=t.index('\n const rooftop=',a)
t=t[:a]+"for(let j=-4;j<=4;j++){const zz=j*(d+.7)/9;batch.add(pitchedRoof,material(0x69716a,.56,1),x+zz*Math.sin(yaw),h+.465,z+zz*Math.cos(yaw),w+.7,3.3,.065,yaw);}}"+t[b:]
p.write_text(t,encoding='utf-8')
print('Roof seams now follow the roof slopes.')
