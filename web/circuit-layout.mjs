import {BLOCK_SIZE,GRID,MAX_COORDINATE,onGrid} from './board-geometry.mjs';

// Presentation only: group feedback loops, layer their acyclic dependencies,
// then order each column by its neighbours. No circuit evaluation happens here.
export function layout(circuit,parts) {
  const graph=structuredClone(circuit);
  if(!graph.nodes.length)return graph;
  const nodes=[...graph.nodes].sort((a,b)=>a.id-b.id);
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const outgoing=new Map(nodes.map(n=>[n.id,new Set()]));
  const incoming=new Map(nodes.map(n=>[n.id,new Set()]));
  for(const w of graph.wires) {
    outgoing.get(w.from).add(w.to);
    incoming.get(w.to).add(w.from);
  }

  // Tarjan's strongly connected components keep even unfinished feedback
  // circuits compact, without a depth limit or an ever-growing cycle.
  const index=new Map(),low=new Map(),stack=[],active=new Set(),groupOf=new Map(),groups=[];
  function visit(id) {
    index.set(id,index.size);low.set(id,index.get(id));stack.push(id);active.add(id);
    for(const next of outgoing.get(id)) {
      if(!index.has(next)){visit(next);low.set(id,Math.min(low.get(id),low.get(next)));}
      else if(active.has(next))low.set(id,Math.min(low.get(id),index.get(next)));
    }
    if(low.get(id)!==index.get(id))return;
    const group={nodes:[],next:new Set(),degree:0,depth:0};
    let member;
    do{member=stack.pop();active.delete(member);group.nodes.push(byId.get(member));groupOf.set(member,groups.length);}while(member!==id);
    groups.push(group);
  }
  nodes.forEach(n=>{if(!index.has(n.id))visit(n.id);});
  groups.forEach(g=>g.depth=g.nodes.every(n=>n.kind==='INPUT'||parts[n.kind].inputs.length===0)?0:1);
  for(const w of graph.wires) {
    const from=groupOf.get(w.from),to=groupOf.get(w.to);
    if(from!==to&&!groups[from].next.has(to)){groups[from].next.add(to);groups[to].degree++;}
  }
  const queue=groups.filter(g=>!g.degree);
  for(let i=0;i<queue.length;i++)for(const next of queue[i].next) {
    const g=groups[next];g.depth=Math.max(g.depth,queue[i].depth+1);
    if(!--g.degree)queue.push(g);
  }

  const last=Math.max(0,...nodes.filter(n=>n.kind!=='OUTPUT').map(n=>groups[groupOf.get(n.id)].depth))+1;
  const rank=n=>n.kind==='OUTPUT'?last:groups[groupOf.get(n.id)].depth;
  const columns=new Map();
  for(const n of nodes){const d=rank(n);if(!columns.has(d))columns.set(d,[]);columns.get(d).push(n);}
  const ordered=[...columns].sort((a,b)=>a[0]-b[0]).map(([,column])=>column);
  const rowHeight=BLOCK_SIZE.h+48,height=Math.max(...ordered.map(col=>col.length))*rowHeight;
  const columnWidth=Math.min(BLOCK_SIZE.w+96,Math.floor((MAX_COORDINATE-72)/Math.max(1,ordered.length-1)/GRID)*GRID);
  function place(column,x) {
    column.forEach((n,i)=>{n.x=72+x*columnWidth;n.y=72+onGrid((height-column.length*rowHeight)/2+i*rowHeight);});
  }
  ordered.forEach(place);
  for(let pass=0;pass<4;pass++) {
    const forward=pass%2===0,neighbours=forward?incoming:outgoing;
    for(const column of forward?ordered:[...ordered].reverse()) {
      const center=new Map(column.map(n=>{
        const peers=[...neighbours.get(n.id)].map(id=>byId.get(id)).filter(other=>rank(other)!==rank(n));
        return [n.id,peers.length?peers.reduce((sum,p)=>sum+p.y,0)/peers.length:n.y];
      }));
      // Keep the order of labelled lesson inputs and outputs familiar.
      if(!column.every(n=>n.kind==='INPUT'||n.kind==='OUTPUT'))column.sort((a,b)=>center.get(a.id)-center.get(b.id)||a.y-b.y||a.id-b.id);
      place(column,ordered.indexOf(column));
    }
  }
  return graph;
}
