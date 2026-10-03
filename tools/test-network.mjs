import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {CITIES,ROADS,LOCAL_ROADS,route,pointAt,nearestRoad,navigation,distance,clamp,rng} from '../game/src/data.js';

const root=path.resolve(import.meta.dirname,'..'),results=[];
const test=(name,fn)=>{try{results.push({name,status:'PASS',metrics:fn()});}catch(error){results.push({name,status:'FAIL',error:error.stack});}};
const coordinates=JSON.parse(await readFile(path.join(root,'tmp/sources/city-coordinates.json'),'utf8'));
test('Ten geographic city centres unchanged',()=>{for(let i=0;i<CITIES.length;i++){assert.ok(Math.abs(CITIES[i].lat-coordinates[i].lat)<1e-5);assert.ok(Math.abs(CITIES[i].lon-coordinates[i].lon)<1e-5);}assert.equal(CITIES.length,10);});
test('17 intercity connections and 10 connected town ring roads',()=>{
 assert.equal(ROADS.length,17);assert.equal(LOCAL_ROADS.length,50);const degrees=CITIES.map(c=>ROADS.filter(r=>r.from===c.index||r.to===c.index).length);assert.ok(degrees.every(n=>n>=2));assert.ok(degrees.some(n=>n>=4));
 for(const city of CITIES){const local=LOCAL_ROADS.filter(r=>r.city===city.index),ring=local.find(r=>r.kind==='ring');assert.ok(ring);assert.ok(distance(ring.samples[0],ring.samples.at(-1))<1e-6);
  for(const r of local.filter(r=>r!==ring))for(const end of [r.samples[0],r.samples.at(-1)])assert.ok(Math.min(...ring.samples.map(p=>distance(p,end)))<1e-5);
 }return {cityDegrees:degrees,intercityConnections:ROADS.length,localRoads:LOCAL_ROADS.length};
});
test('Every shortest route matches independent all-pairs Floyd-Warshall distances',()=>{
 const n=CITIES.length,cost=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:Infinity));for(const road of ROADS)cost[road.from][road.to]=cost[road.to][road.from]=Math.min(cost[road.from][road.to],road.length);
 for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++)cost[i][j]=Math.min(cost[i][j],cost[i][k]+cost[k][j]);
 for(let from=0;from<n;from++)for(let to=0;to<n;to++){const r=route(from,to);assert.ok(Math.abs(cost[from][to]-r.length)<1e-7);let current=from,length=0;for(const leg of r.legs){assert.equal(current,leg.direction>0?leg.road.from:leg.road.to);current=leg.direction>0?leg.road.to:leg.road.from;length+=leg.road.length;}assert.equal(current,to);assert.ok(Math.abs(length-r.length)<1e-7);assert.ok(Math.abs(route(to,from).length-r.length)<1e-7);}
 return {cityPairs:n*n,moscowRostovKm:route(0,9).length*.1};
});
test('Any road can be bypassed; no single corridor traps a city',()=>{for(const blocked of ROADS)for(let city=0;city<CITIES.length;city++){const alternative=route(city,(city+1)%CITIES.length,new Set([blocked.id]));assert.ok(Number.isFinite(alternative.length));assert.ok(alternative.legs.every(l=>l.road!==blocked));}return {blockedRoadScenarios:ROADS.length*CITIES.length};});
function brute(p,intercity){let best=Infinity;for(const road of intercity?ROADS:[...ROADS,...LOCAL_ROADS])for(let i=0;i<road.samples.length-1;i++){const a=road.samples[i],b=road.samples[i+1],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz),0,1);best=Math.min(best,Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t));}return best;}
test('Spatial road lookup matches exhaustive nearest-segment search',()=>{
 const random=rng(43890);let maxError=0;const begin=performance.now();
 for(let i=0;i<220;i++){const r=ROADS[i%ROADS.length],on=pointAt(r,r.length*random()),p=i%3?{x:on.x+(random()-.5)*800,z:on.z+(random()-.5)*800}:{x:-1100+random()*11600,z:-1900+random()*13300};for(const intercity of [false,true]){const fast=nearestRoad(p.x,p.z,intercity),exact=brute(p,intercity),error=Math.abs(fast.distance-exact);maxError=Math.max(maxError,error);assert.ok(error<1e-7,JSON.stringify({p,intercity,error,fast,exact}));}}
 return {queries:440,maxDistanceError:maxError,elapsedMs:performance.now()-begin};
});
test('GPS follows either direction of each alternative road and distance decreases',()=>{
 const cases=[];for(const r of ROADS.filter(r=>r.alternative))for(const direction of [1,-1]){
  const destination=direction>0?r.to:r.from,from=direction>0?r.from:r.to,first=pointAt(r,r.length*(direction>0?.35:.65),-3*direction),second=pointAt(r,r.length*(direction>0?.55:.45),-3*direction);first.yaw=first.heading+(direction<0?Math.PI:0);second.yaw=second.heading+(direction<0?Math.PI:0);
  const a=navigation(first,from,destination),b=navigation(second,from,destination);assert.equal(a.road.id,r.id);assert.equal(b.road.id,r.id);assert.equal(a.legs[0].direction,direction);assert.ok(b.remaining<a.remaining);assert.ok(Number.isFinite(a.point.x)&&Number.isFinite(a.point.z));cases.push({road:r.id,direction,remainingBefore:a.remaining,remainingAfter:b.remaining});
 }return {cases};
});
const hashes=Object.fromEntries(await Promise.all(['data','road-network'].map(async name=>[name,createHash('sha256').update(await readFile(path.join(root,'game/src/'+name+'.js'))).digest('hex')])));
await writeFile(path.join(root,'tmp/qa/network-results.json'),JSON.stringify({date:'2026-09-30',hashes,results},null,2));console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,total:results.length,results}));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
