// One grid, block footprint, and pin-placement rule for every editor component.
export const GRID=12;
export const MAX_COORDINATE=100000;
export const BLOCK_SIZE=Object.freeze({w:144,h:144});
export function portPoint(node,index,count,side) {
  const {w,h}=BLOCK_SIZE,offset=(index-(count-1)/2)*24;
  if(side==='bottom'||side==='top')return {x:node.x+w/2+offset,y:node.y+(side==='bottom'?h:0),side};
  return {x:node.x+(side==='right'?w:0),y:node.y+h/2+offset,side};
}
export const onGrid=value=>Math.round(value/GRID)*GRID;

// Snap only when a drag ends. Prefer a nearby connected pin over the grid.
export function snapPosition(node,connections,tolerance) {
  let x=onGrid(node.x),y=onGrid(node.y),bestX=tolerance,bestY=tolerance;
  for(const {moving,fixed} of connections) {
    if(['left','right'].includes(moving.side)&&['left','right'].includes(fixed.side)) {
      const delta=fixed.y-moving.y;
      if(Math.abs(delta)<bestY){bestY=Math.abs(delta);y=fixed.y-Math.round(moving.y-node.y);}
    }
    if(['top','bottom'].includes(moving.side)&&['top','bottom'].includes(fixed.side)) {
      const delta=fixed.x-moving.x;
      if(Math.abs(delta)<bestX){bestX=Math.abs(delta);x=fixed.x-Math.round(moving.x-node.x);}
    }
  }
  return {x,y};
}
