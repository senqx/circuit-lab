import { bindEngine } from './bindings.mjs';

let engine;
self.onmessage=async({data:{id,method,data}})=>{
  try {
    // Lazy initialization also lets loading failures return through the protocol.
    engine??=import('./generated/engine.mjs').then(({default:create})=>create()).then(bindEngine);
    const execute=await engine;
    self.postMessage({id,result:execute(method,data)});
  } catch(error) {
    self.postMessage({id,error:error.message||'The circuit engine could not complete this request.'});
  }
};
