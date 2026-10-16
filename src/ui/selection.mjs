import {BLOCK_SIZE} from './board-geometry.mjs';

export const wireKey=w=>`${w.from}:${w.output}:${w.to}:${w.input}`;
export const nodeSelection=id=>`node:${id}`;
export const wireSelection=w=>`wire:${wireKey(w)}`;
export const selectionBox=(a,b)=>({left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)});
const intersects=(a,b)=>a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;

// Use actual orthogonal segments, not the bounding box of a winding wire.
export function objectsInBox(graph,routeFor,box) {
  const keys=new Set();
  for(const n of graph.nodes)if(intersects(box,{left:n.x,top:n.y,right:n.x+BLOCK_SIZE.w,bottom:n.y+BLOCK_SIZE.h}))keys.add(nodeSelection(n.id));
  for(const w of graph.wires) {
    const points=routeFor(w)?.points||[];
    if(points.some((p,i)=>i&&intersects(box,selectionBox(points[i-1],p))))keys.add(wireSelection(w));
  }
  return keys;
}
