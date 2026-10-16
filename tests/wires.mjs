import assert from 'node:assert/strict';
import {routeWire,createWireRouter,crosses} from '../src/ui/wire-router.mjs';
import {BLOCK_SIZE,portPoint,snapPosition} from '../src/ui/board-geometry.mjs';
const rect=(id,x,y,w=120,h=90)=>({id,x,y,w,h});
let checks=0;
function verify(a,b,boxes,label,route=routeWire(a,b,boxes)) {
  const {points,path}=route;
  assert.deepEqual(points[0],a,label+' starts at the sending pin');
  assert.deepEqual(points.at(-1),b,label+' ends at the receiving pin');
  assert(!/NaN|Infinity/.test(path),label+' has finite path coordinates');
  assert.equal((path.match(/M/g)||[]).length,1,label+' is one continuous stroke');
  for(let i=1;i<points.length;i++) {
    const p=points[i-1],q=points[i];
    assert(p.x===q.x||p.y===q.y,label+' contains only orthogonal segments');
    if(i>1){const r=points[i-2];assert((p.x-r.x)*(q.x-p.x)+(p.y-r.y)*(q.y-p.y)>=0,label+' never doubles back');}
  }
  for(let i=1;i<points.length;i++)for(const r of boxes)
    assert(!crosses(points[i-1],points[i],{left:r.x,right:r.x+r.w,top:r.y,bottom:r.y+r.h}),label+' avoids block '+r.id);
  checks++;
  return {points,path};
}
verify({x:120,y:45},{x:500,y:45},[rect(1,0,0),rect(2,500,0)],'straight');
verify({x:120,y:45},{x:500,y:245},[rect(1,0,0),rect(2,500,200)],'downward');
verify({x:120,y:245},{x:500,y:45},[rect(1,0,200),rect(2,500,0)],'upward');
verify({x:620,y:45},{x:0,y:245},[rect(1,500,0),rect(2,0,200)],'backward');
verify({x:120,y:45},{x:0,y:65},[rect(1,0,0)],'feedback');
verify({x:120,y:45},{x:600,y:45},[rect(1,0,0),rect(2,600,0),rect(3,300,-20)],'intervening block');
verify({x:120,y:245},{x:680,y:45},[rect(1,0,200),rect(2,680,0),rect(3,240,160),rect(4,430,-40),rect(5,430,180)],'several obstacles');
// Repeat across locations rather than relying on a particular screenshot layout.
for(let y=-250;y<=250;y+=50)verify({x:120,y:45},{x:700,y:y+45},[rect(1,0,0),rect(2,700,y),rect(3,300,y/2)],'offset '+y);
verify({x:144,y:72,side:'right'},{x:552,y:144,side:'bottom'},[rect(1,0,0,144,144),rect(2,480,0,144,144)],'bulb base');
verify({x:144,y:72,side:'right'},{x:72,y:384,side:'bottom'},[rect(1,0,0,144,144),rect(2,0,240,144,144)],'bulb below source');
verify({x:624,y:72,side:'right'},{x:72,y:144,side:'bottom'},[rect(1,480,0,144,144),rect(2,0,0,144,144)],'bulb behind source');
verify({x:72,y:144,side:'bottom'},{x:552,y:0,side:'top'},[rect(1,0,0,144,144),rect(2,480,0,144,144)],'vertical ports');
for(const gap of [6,12,24,36])for(const y of [-12,0,12,72])verify({x:144,y:72,side:'right'},{x:144+gap,y:72+y,side:'left'},[rect(1,0,0,144,144),rect(2,144+gap,y,144,144)],`tight gap ${gap}, offset ${y}`);
for(const from of ['left','right','top','bottom'])for(const to of ['left','right','top','bottom']) {
  const a=portPoint({x:0,y:0},0,1,from),b=portPoint({x:288,y:192},0,1,to);
  verify(a,b,[rect(1,0,0,144,144),rect(2,288,192,144,144)],`${from} to ${to}`);
}
const direct=routeWire({x:144,y:72},{x:480,y:72},[rect(1,0,0,144,144),rect(2,480,0,144,144)]);
assert.equal(direct.points.length,2,'Aligned pins give a completely straight line');
const source={x:144,y:72},destination={x:480,y:72},ends=[rect(1,0,0,144,144),rect(2,480,0,144,144)];
assert.equal(createWireRouter([...ends,rect(3,288,288,144,144)])(source,destination,direct),direct,'An unrelated movement retains an already optimal route');
const blocked=createWireRouter([...ends,rect(3,240,0,144,144)])(source,destination,direct);
assert.notEqual(blocked.path,direct.path,'A retained route is invalidated when a moving part blocks it');
assert.equal(createWireRouter(ends)(source,destination,blocked).path,direct.path,'Removing the blocker replaces a cached detour with the shortest path');
const length=route=>route.points.reduce((sum,p,i)=>sum+(i?Math.abs(p.x-route.points[i-1].x)+Math.abs(p.y-route.points[i-1].y):0),0);
const detour=verify({x:120,y:45},{x:600,y:45},[rect(1,0,0),rect(2,600,0),rect(3,300,-20)],'shorter lower detour');
assert.equal(length(detour),546,'Chooses the shorter side of a blocker, including eight units of clearance');
// Independent oracle: breadth-first search one eight-unit step at a time,
// rather than the router's visibility graph and candidate paths. These fixtures
// have eight-unit coordinates and enough room for the full clearance and leads.
function shortestOnGrid(a,b,boxes) {
  const dirs=[[1,0],[0,1],[-1,0],[0,-1]],side={right:0,bottom:1,left:2,top:3};
  const from=side[a.side||'right'],to=side[b.side||'left'];
  const start=[a.x/8+dirs[from][0]*3,a.y/8+dirs[from][1]*3];
  const end=[b.x/8+dirs[to][0]*3,b.y/8+dirs[to][1]*3];
  const bounds=boxes.map(r=>({left:r.x/8-1,right:(r.x+r.w)/8+1,top:r.y/8-1,bottom:(r.y+r.h)/8+1}));
  const x0=Math.min(start[0],end[0],...bounds.map(r=>r.left))-4,x1=Math.max(start[0],end[0],...bounds.map(r=>r.right))+4;
  const y0=Math.min(start[1],end[1],...bounds.map(r=>r.top))-4,y1=Math.max(start[1],end[1],...bounds.map(r=>r.bottom))+4;
  const queue=[[...start,from,0]],seen=new Set([`${start[0]},${start[1]},${from}`]);
  for(let i=0;i<queue.length;i++) {
    const [x,y,heading,steps]=queue[i];
    if(x===end[0]&&y===end[1]&&heading!==to)return steps*8+48;
    dirs.forEach(([dx,dy],d)=>{
      const nx=x+dx,ny=y+dy,key=`${nx},${ny},${d}`;
      if(d===(heading+2)%4||nx<x0||nx>x1||ny<y0||ny>y1||seen.has(key))return;
      const mx=(x+nx)/2,my=(y+ny)/2;
      if(bounds.some(r=>mx>r.left&&mx<r.right&&my>r.top&&my<r.bottom))return;
      seen.add(key);queue.push([nx,ny,d,steps+1]);
    });
  }
  throw Error('Oracle fixture has no path');
}
for(let i=0;i<18;i++) {
  const a={x:144,y:72,side:'right'},target={x:768,y:(i%3)*48};
  const b=portPoint(target,0,1,i%2?'left':'bottom');
  const boxes=[rect(1,0,0,144,144),rect(2,target.x,target.y,144,144),rect(3,288,(i%6)*48-96,96,96),rect(4,528,((i+2)%5)*48-96,96,96)];
  const route=verify(a,b,boxes,'moving obstacle '+i);
  assert.equal(length(route),shortestOnGrid(a,b,boxes),'Matches the independent shortest-path oracle at position '+i);
  assert.equal(route.path,routeWire(a,b,[...boxes].reverse()).path,'Equal-length choices do not depend on block insertion order');
}
const tied=verify({x:144,y:72},{x:768,y:216},[rect(1,0,0,144,144),rect(2,768,144,144,144)],'fewest bends');
assert.equal(tied.points.length-2,2,'Among shortest forward paths, two bends suffice');
// Independent signals get separate lanes; fan-out from one pin may share a
// trunk. Compare collinear intersections directly, independently of route cost.
function sharedLength(a,b) {
  let length=0;
  for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++) {
    const p=a.points[i-1],q=a.points[i],r=b.points[j-1],s=b.points[j];
    if(p.y===q.y&&r.y===s.y&&p.y===r.y)length+=Math.max(0,Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x))-Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x)));
    if(p.x===q.x&&r.x===s.x&&p.x===r.x)length+=Math.max(0,Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y))-Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y)));
  }
  return length;
}
const laneBoxes=[rect(1,0,0,144,144),rect(2,0,192,144,144),rect(3,480,0,144,144),rect(4,480,192,144,144)];
const lanePins=[{x:144,y:72,side:'right'},{x:480,y:264,side:'left'},{x:144,y:264,side:'right'},{x:480,y:72,side:'left'}];
const crowded=[routeWire(lanePins[0],lanePins[1],laneBoxes),routeWire(lanePins[2],lanePins[3],laneBoxes)];
assert(sharedLength(...crowded)>100,'Fixture has a shared run');
const lanes=createWireRouter(laneBoxes,{separate:true});
const separated=[lanes(lanePins[0],lanePins[1],null,'a'),lanes(lanePins[2],lanePins[3],null,'b')];
separated.forEach((r,i)=>verify(lanePins[i*2],lanePins[i*2+1],laneBoxes,'separated signal '+i,r));
assert.equal(sharedLength(...separated),0,'Independent signals do not hide on the same run');
assert(length(separated[1])<=length(crowded[1])+40,'Lane separation uses a short detour');
const cachedLanes=createWireRouter(laneBoxes,{separate:true});
separated.forEach((r,i)=>assert.equal(cachedLanes(lanePins[i*2],lanePins[i*2+1],r,['a','b'][i]).path,r.path,'Unchanged lane routes are stable'));
const fanout=createWireRouter(laneBoxes,{separate:true});
const trunk=fanout(lanePins[0],lanePins[1],null,'source'),branch=fanout(lanePins[0],lanePins[1],null,'source');
assert.equal(trunk.path,branch.path,'Copies of one signal can share their trunk');
for(let i=0;i<12;i++) {
  const shifted=laneBoxes.map(b=>b.id===4?{...b,y:192+i*12}:b),pins=lanePins.map((p,j)=>j===1?{...p,y:264+i*12}:p);
  const router=createWireRouter(shifted,{separate:true});
  verify(pins[0],pins[1],shifted,'moving lane a '+i,router(pins[0],pins[1],null,'a'));
  verify(pins[2],pins[3],shifted,'moving lane b '+i,router(pins[2],pins[3],null,'b'));
}
const lamp=portPoint({x:480,y:0},0,1,'bottom');
assert.deepEqual(lamp,{x:552,y:BLOCK_SIZE.h,side:'bottom'},'Bulb connector is centered at the base');
for(let count=1;count<=5;count++)for(let index=0;index<count;index++) {
  const p=portPoint({x:0,y:0},index,count,'left');
  assert.equal(p.y%12,0,'Every pin uses the same alignment grid');
  assert(p.y>0&&p.y<BLOCK_SIZE.h,'All supported ports fit inside the shared footprint');
}
assert.deepEqual(snapPosition({x:101.4,y:203.6},[{moving:{x:245.4,y:275.6,side:'right'},fixed:{x:480,y:278,side:'left'}}],8),{x:96,y:206},'Release aligns a nearby connected pin exactly');
const start=performance.now();
for(let i=0;i<1000;i++)routeWire({x:120,y:45},{x:600,y:245},[rect(1,0,0),rect(2,600,200),rect(3,300,90)]);
console.log(`PASS ${checks} routing cases: endpoints, finite curves, and block avoidance.`);
console.log(`Routing average: ${((performance.now()-start)/1000).toFixed(3)} ms.`);
