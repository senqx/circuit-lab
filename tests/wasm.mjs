import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import create from '../dist/app/engine/generated/engine.mjs';
import {bindEngine} from '../src/ui/engine/bindings.mjs';

let input='';for await(const chunk of process.stdin)input+=chunk;
const native=JSON.parse(input),module=await create(),run=bindEngine(module);
assert.deepEqual(run('catalog'),native.catalog,'Catalogs and every expected row match');
let rows=0;
for(const lesson of native.lessons){
  const level=native.catalog.levels.find(l=>l.id===lesson.id),circuit=run('reference',{level:lesson.id});
  assert.deepEqual(circuit,lesson.circuit,level.title+' recipe');
  assert.deepEqual(run('check',{circuit,level:lesson.id}),lesson.check,level.title+' checker');
  let state={};
  for(const [i,row] of level.tests.entries()){
    const actual=run('simulate',{circuit,inputs:row.inputs,tick:row.tick,state});
    assert.deepEqual(actual,lesson.simulations[i],`${level.title}, step ${i}: outputs, internal signals, contacts, and memory`);
    state=actual.state;rows++;
  }
}
for(const {method,data,expected} of native.cases)assert.deepEqual(run(method,data),expected,'Switch defaults and optional challenge parity');
const circuit=run('reference',{level:1});
for(const bad of [NaN,Infinity,1.5,2147483648,'1',null])assert.throws(()=>run('simulate',{circuit,inputs:[bad]}));
for(const tick of [1,'false',null])assert.throws(()=>run('simulate',{circuit,inputs:[0],tick}));
for(const state of [null,[],1])assert.throws(()=>run('simulate',{circuit,inputs:[0],state}));
assert.throws(()=>run('reference',{level:2**32+1}));
assert.throws(()=>run('simulate',{circuit,inputs:Array(33).fill(0)}));
assert.throws(()=>run('simulate',{circuit:{nodes:[{id:1,kind:'INPUT\0NOT'}],wires:[]},inputs:[0]}));
assert(run('reference',{level:-1}).error,'A caught C++ exception returns a diagnostic');
assert(run('simulate',{circuit:{nodes:[{id:1,kind:'INPUT'},{id:1,kind:'OUTPUT'}],wires:[]},inputs:[0]}).error);
for(let i=0;i<200;i++){
  assert.throws(()=>run('simulate',{circuit:{nodes:[{id:1,kind:'MISSING'}],wires:[]}}));
  assert.equal(run('simulate',{circuit,inputs:[1]}).outputs[0],1,'A failed request does not poison the next handle');
}
const report={};
for(const id of [1,20,24]){
  const level=native.catalog.levels.find(l=>l.id===id),graph=run('reference',{level:id});
  const values=level.tests[0].inputs,times=[];
  for(let i=0;i<35;i++){
    const start=performance.now();run('simulate',{circuit:graph,inputs:values});
    if(i>=5)times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);
  report[id]={title:level.title,wasmMedianMs:times[15],wasmP95Ms:times[28]};
}
await mkdir('test-artifacts',{recursive:true});
await writeFile('test-artifacts/wasm-engine.json',JSON.stringify(report,null,2)+'\n');
console.log(`Native/WebAssembly parity: ${native.lessons.length} lessons, ${rows} rows; signal/contact/memory parity and invalid-input recovery passed.`);
