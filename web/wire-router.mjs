// Geometry only. Signal values are supplied by the C++ engine.
const EPS=1e-7, CLEARANCE=8, LEAD=24;
const directions=[[1,0],[0,1],[-1,0],[0,-1]];
const sides={right:0,bottom:1,left:2,top:3};
const same=(a,b)=>a.x===b.x&&a.y===b.y;
export function crosses(a,b,r) {
  if(a.x===b.x)return a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom;
  if(a.y===b.y)return a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right;
  return true;
}
function compact(points) {
  const result=[];
  for(const p of points) {
    if(result.length&&same(result.at(-1),p))continue;
    while(result.length>1) {
      const a=result.at(-2),b=result.at(-1);
      if(!((a.x===b.x&&b.x===p.x&&(b.y-a.y)*(p.y-b.y)>=0)||(a.y===b.y&&b.y===p.y&&(b.x-a.x)*(p.x-b.x)>=0)))break;
      result.pop();
    }
    result.push(p);
  }
  return result;
}
const better=(a,b)=>!b||(a.cost??a.length)<(b.cost??b.length)-EPS||(Math.abs((a.cost??a.length)-(b.cost??b.length))<EPS&&a.bends<b.bends);
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const ordered=(a,b)=>a.f!==b.f?a.f<b.f:a.bends!==b.bends?a.bends<b.bends:a.key<b.key;
class Heap {
  items=[];
  push(item) {
    let i=this.items.length;this.items.push(item);
    while(i>0){const parent=(i-1)>>1;if(!ordered(item,this.items[parent]))break;this.items[i]=this.items[parent];i=parent;}this.items[i]=item;
  }
  pop() {
    const first=this.items[0],last=this.items.pop();
    if(this.items.length){let i=0;while(i*2+1<this.items.length){let child=i*2+1;if(child+1<this.items.length&&ordered(this.items[child+1],this.items[child]))child++;if(!ordered(this.items[child],last))break;this.items[i]=this.items[child];i=child;}this.items[i]=last;}
    return first;
  }
}
export function createWireRouter(rectangles=[],{separate=false}={}) {
  const boxes=rectangles.map(r=>({left:r.x,right:r.x+r.w,top:r.y,bottom:r.y+r.h}));
  // Leave a visible gap around parts, shrinking it where parts sit close together.
  const obstacles=boxes.map((r,i)=>{
    let pad=CLEARANCE;
    boxes.forEach((s,j)=>{if(i!==j)pad=Math.min(pad,Math.max(0,r.left-s.right,s.left-r.right,r.top-s.bottom,s.top-r.bottom)/3);});
    return {left:r.left-pad,right:r.right+pad,top:r.top-pad,bottom:r.bottom+pad};
  });
  const unique=values=>[...new Set(values)].sort((a,b)=>a-b);
  const columns=unique(obstacles.flatMap(r=>[r.left,r.right])),rows=unique(obstacles.flatMap(r=>[r.top,r.bottom]));
  const edges=new Map();
  const occupied=[],LANE=10;
  const segments=points=>points.slice(1).map((p,i)=>{
    const a=points[i],horizontal=a.y===p.y;
    return {horizontal,axis:horizontal?a.y:a.x,lo:Math.min(horizontal?a.x:a.y,horizontal?p.x:p.y),hi:Math.max(horizontal?a.x:a.y,horizontal?p.x:p.y)};
  });
  const clear=(a,b)=>{
    const key=a.x===b.x?`v:${a.x}:${Math.min(a.y,b.y)}:${Math.max(a.y,b.y)}`:`h:${a.y}:${Math.min(a.x,b.x)}:${Math.max(a.x,b.x)}`;
    if(!edges.has(key))edges.set(key,!obstacles.some(r=>crosses(a,b,r)));
    return edges.get(key);
  };
  const lead=(p,d)=>{
    const [dx,dy]=directions[d];let length=LEAD;
    for(const r of obstacles) {
      let gap=Infinity;
      if(dx&&p.y>r.top&&p.y<r.bottom)gap=dx>0?r.left-p.x:p.x-r.right;
      if(dy&&p.x>r.left&&p.x<r.right)gap=dy>0?r.top-p.y:p.y-r.bottom;
      if(gap>0)length=Math.min(length,gap/2);
    }
    return {x:p.x+dx*length,y:p.y+dy*length};
  };
  return (a,b,previous=null,net=Symbol())=>{
    const from=sides[a.side||'right'],to=sides[b.side||'left'];
    const start=lead(a,from),end=lead(b,to),fixed=distance(a,start)+distance(end,b);
    let best=null,separating=false;
    const others=separate?occupied.filter(s=>s.net!==net):[];
    const overlap=points=>segments(points).reduce((sum,s)=>sum+others.reduce((total,o)=>{
      const gap=Math.abs(s.axis-o.axis);
      return total+(s.horizontal===o.horizontal&&gap<LANE?Math.max(0,Math.min(s.hi,o.hi)-Math.max(s.lo,o.lo))*(1-gap/LANE):0);
    },0),0);
    const choose=middle=>{
      if(middle.some((p,i)=>i&&!clear(middle[i-1],p)))return;
      if(boxes.some(r=>crosses(a,start,r)||crosses(end,b,r)))return;
      const points=compact([a,...middle,b]);
      for(let i=2;i<points.length;i++) {
        const p=points[i-2],q=points[i-1],r=points[i];
        if((q.x-p.x)*(r.x-q.x)+(q.y-p.y)*(r.y-q.y)<0)return;
      }
      const candidate={points,length:points.reduce((sum,p,i)=>sum+(i?distance(points[i-1],p):0),0),bends:Math.max(0,points.length-2)};
      if(separating)candidate.cost=candidate.length+6*overlap(points);
      if(better(candidate,best))best=candidate;
    };
    const result=()=>{
      // Start with the shortest obstacle-free route. Small local lane choices
      // separate unrelated signals without making the global search more costly.
      if(others.length&&overlap(best.points)>EPS) {
        separating=true;best.cost=best.length+6*overlap(best.points);
        if(previous&&same(previous.points[0],a)&&same(previous.points.at(-1),b))choose([start,...previous.points.slice(1,-1),end]);
        for(let pass=0;pass<3&&overlap(best.points)>EPS;pass++) {
          const before=best,points=compact([start,...best.points.slice(1,-1),end]);
          for(const offset of [-LANE,LANE,-2*LANE,2*LANE,-3*LANE,3*LANE]) {
            // Ordinary Z routes can move an entire run into a parallel lane.
            for(const x of new Set([start.x,end.x,(start.x+end.x)/2]))choose([start,{x:x+offset,y:start.y},{x:x+offset,y:end.y},end]);
            for(const y of new Set([start.y,end.y,(start.y+end.y)/2]))choose([start,{x:start.x,y:y+offset},{x:end.x,y:y+offset},end]);
            // For routes with several turns, shift only the congested segment.
            for(let i=1;i<points.length;i++) {
              const p=points[i-1],q=points[i];
              if(overlap([p,q])<=EPS)continue;
              const delta=p.x===q.x?{x:offset,y:0}:{x:0,y:offset};
              choose([...points.slice(0,i),{x:p.x+delta.x,y:p.y+delta.y},{x:q.x+delta.x,y:q.y+delta.y},...points.slice(i)]);
            }
          }
          if(best===before)break;
        }
      }
      const route={points:best.points,path:best.points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')};
      if(separate)occupied.push(...segments(route.points).map(s=>({...s,net})));
      return route;
    };
    const lowerBound=fixed+distance(start,end);
    // A still-valid route at the distance/bend lower bound cannot be improved.
    // Retain it while another part moves, without rebuilding its path or dots.
    if(previous&&same(previous.points[0],a)&&same(previous.points.at(-1),b)&&previous.points[0].side===a.side&&previous.points.at(-1).side===b.side) {
      choose([start,...previous.points.slice(1,-1),end]);
      if(best&&Math.abs(best.length-lowerBound)<EPS&&best.bends<=2)return separate?result():previous;
    }
    if(start.x===end.x||start.y===end.y)choose([start,end]);
    choose([start,{x:end.x,y:start.y},end]);
    choose([start,{x:start.x,y:end.y},end]);
    // Center ordinary forward wires. Search all detours if this cannot attain
    // the Manhattan lower bound; the first usable route is not always shortest.
    choose([start,{x:(start.x+end.x)/2,y:start.y},{x:(start.x+end.x)/2,y:end.y},end]);
    choose([start,{x:start.x,y:(start.y+end.y)/2},{x:end.x,y:(start.y+end.y)/2},end]);
    if(best&&Math.abs(best.length-lowerBound)<EPS&&best.bends<=2)return result();
    const xs=unique([start.x,end.x,Math.min(start.x,end.x)-LEAD,Math.max(start.x,end.x)+LEAD,...columns]);
    const ys=unique([start.y,end.y,Math.min(start.y,end.y)-LEAD,Math.max(start.y,end.y)+LEAD,...rows]);
    for(const x of xs)choose([start,{x,y:start.y},{x,y:end.y},end]);
    for(const y of ys)choose([start,{x:start.x,y},{x:end.x,y},end]);
    if(best&&Math.abs(best.length-lowerBound)<EPS)return result();
    // A* on the rectilinear visibility grid: length first, bends only as a tie
    // breaker. Block edges and pin leads contain every necessary turning lane.
    const key=(x,y,d)=>(x*ys.length+y)*4+d;
    const sx=xs.indexOf(start.x),sy=ys.indexOf(start.y),tx=xs.indexOf(end.x),ty=ys.indexOf(end.y);
    const initial={x:sx,y:sy,d:from,length:0,bends:0,f:lowerBound,key:key(sx,sy,from),parent:null};
    const heap=new Heap(),scores=new Map([[initial.key,initial]]);heap.push(initial);
    while(heap.items.length) {
      const u=heap.pop();
      if(scores.get(u.key)!==u)continue;
      if(best&&u.f>best.length+EPS)break;
      if(u.x===tx&&u.y===ty&&u.d!==to) {
        const points=[];for(let v=u;v;v=v.parent)points.push({x:xs[v.x],y:ys[v.y]});
        choose(points.reverse());continue;
      }
      for(let d=0;d<4;d++) {
        if(d===(u.d+2)%4)continue;
        const [dx,dy]=directions[d],x=u.x+dx,y=u.y+dy;
        if(x<0||y<0||x>=xs.length||y>=ys.length)continue;
        const p={x:xs[u.x],y:ys[u.y]},q={x:xs[x],y:ys[y]};
        if(!clear(p,q))continue;
        const v={x,y,d,length:u.length+distance(p,q),bends:u.bends+(d!==u.d?1:0),key:key(x,y,d),parent:u};
        v.f=fixed+v.length+distance(q,end);
        if((best&&v.f>best.length+EPS)||!better(v,scores.get(v.key)))continue;
        scores.set(v.key,v);heap.push(v);
      }
    }
    // A block dragged directly over a pin leaves no clear route. Keep the
    // shortest connected preview until the pin is uncovered, without huge loops.
    if(!best)return createWireRouter([])(a,b);
    return result();
  };
}
export function routeWire(a,b,rectangles=[]) {return createWireRouter(rectangles)(a,b);}
