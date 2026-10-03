import {RGBELoader} from './node_modules/three/examples/jsm/loaders/RGBELoader.js';
import {FloatType} from './node_modules/three/build/three.module.js';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(path.join(root,'game/assets/manifest.json'),'utf8'));
const file=await readFile(path.join(root,'game/assets',manifest.environment));
const hdr=new RGBELoader().setDataType(FloatType).parse(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength));
const out=new Uint8Array(hdr.width*hdr.height*3),cols=[];
const tone=v=>{v*=.8*1.1;v=Math.max(0,Math.min(1,v*(2.51*v+.03)/(v*(2.43*v+.59)+.14)));return v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;};
for(let y=0;y<hdr.height;y++)for(let x=0;x<hdr.width;x++)for(let c=0;c<3;c++)out[(y*hdr.width+x)*3+c]=Math.round(tone(hdr.data[(y*hdr.width+x)*4+c])*255);
for(let col=0;col<16;col++){let blue=0;for(let y=40;y<210;y++)for(let x=col*64;x<(col+1)*64;x++){const a=(y*hdr.width+x)*3;blue+=out[a+2]-out[a];}cols.push({u:(col+.5)/16,blue:blue/(170*64)});}
await writeFile(path.join(root,'tmp/qa/sky-preview.rgb'),out);
console.log(JSON.stringify({width:hdr.width,height:hdr.height,cols}));
