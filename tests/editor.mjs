import assert from 'node:assert/strict';
import {layout} from '../web/circuit-layout.mjs';
import {objectsInBox,nodeSelection,wireSelection} from '../web/selection.mjs';
import {BLOCK_SIZE,GRID,MAX_COORDINATE} from '../web/board-geometry.mjs';

// Geometry fixtures use port counts only; signal behavior belongs to C++.
const parts={INPUT:{inputs:[]},OUTPUT:{inputs:[{}]},GATE:{inputs:[{}]},HIGH:{inputs:[]}};
const node=(id,kind='GATE')=>({id,kind,width:1,x:id%3*17,y:id%5*19});
const wire=(from,to,input=0)=>({from,output:0,to,input});
const topology=g=>({...g,nodes:g.nodes.map(({x,y,...n})=>n)});
function check(graph) {
  const before=structuredClone(graph),result=layout(graph,parts);
  assert.deepEqual(graph,before,'Layout does not mutate its input');
  assert.deepEqual(topology(result),topology(graph),'Layout preserves every node property, wire and port');
  assert.deepEqual(layout(result,parts),result,'Tidying twice does not shuffle the circuit');
  const shuffled={nodes:[...graph.nodes].reverse(),wires:[...graph.wires].reverse()};
  assert.deepEqual(layout(shuffled,parts).nodes.sort((a,b)=>a.id-b.id),[...result.nodes].sort((a,b)=>a.id-b.id),'Storage order does not affect layout');
  for(const n of result.nodes) {
    assert(Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.x%GRID===0&&n.y%GRID===0,'Every position is on the grid');
    assert(Math.abs(n.x)<=MAX_COORDINATE&&Math.abs(n.y)<=MAX_COORDINATE,'Tidied positions remain valid for saved and exported circuits');
    for(const other of result.nodes)if(n.id!==other.id)assert(Math.abs(n.x-other.x)>=BLOCK_SIZE.w+48||Math.abs(n.y-other.y)>=BLOCK_SIZE.h+48,'Every pair has room for wires');
  }
  return result;
}
check({nodes:[],wires:[]});
check({nodes:[node(1,'INPUT')],wires:[]});
check({nodes:[node(1,'INPUT'),node(2,'OUTPUT'),node(3),node(4),node(5,'HIGH')],wires:[]});
const chain=check({nodes:[node(1,'INPUT'),...Array.from({length:24},(_,i)=>node(i+2)),node(26,'OUTPUT')],wires:Array.from({length:25},(_,i)=>wire(i+1,i+2))});
assert(chain.nodes.every((n,i)=>!i||n.x>chain.nodes[i-1].x),'Long circuits keep their full dependency depth');
const branching=check({nodes:[node(1,'INPUT'),node(2,'INPUT'),node(10),node(11),node(12),node(50,'OUTPUT')],wires:[wire(1,11),wire(2,10),wire(11,12),wire(10,12,1),wire(12,50)]});
assert(branching.nodes.find(n=>n.id===11).y<branching.nodes.find(n=>n.id===10).y,'Crossed branches reorder to follow their inputs');
check({nodes:[node(1,'INPUT'),node(2,'OUTPUT'),node(3),node(4),node(5)],wires:[wire(1,3),wire(3,4),wire(4,3,1),wire(4,2),wire(5,5)]});
check({nodes:Array.from({length:512},(_,i)=>node(i+1)),wires:Array.from({length:511},(_,i)=>wire(i+1,i+2))});

const graph={nodes:[{...node(1),x:0,y:0},{...node(2),x:400,y:300}],wires:[wire(1,2)]};
const route={points:[{x:144,y:72},{x:300,y:72},{x:300,y:372},{x:400,y:372}]};
const hits=box=>objectsInBox(graph,()=>route,box);
assert.deepEqual(hits({left:-10,top:-10,right:500,bottom:500}),new Set([nodeSelection(1),nodeSelection(2),wireSelection(graph.wires[0])]),'Marquee can select blocks and wires together');
assert.deepEqual(hits({left:290,top:160,right:310,bottom:190}),new Set([wireSelection(graph.wires[0])]),'Marquee selects a crossing wire segment');
assert.equal(hits({left:190,top:200,right:210,bottom:220}).size,0,'Empty space inside a bent wire’s bounds does not select it');
assert.deepEqual(hits({left:130,top:130,right:150,bottom:150}),new Set([nodeSelection(1)]),'Partial block intersections follow desktop selection');
console.log('Editor geometry checks passed: topology, deep chains, feedback, deterministic layout, spacing and marquee hit testing.');
