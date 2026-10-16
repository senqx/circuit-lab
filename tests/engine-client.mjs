import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EngineClient} from '../src/ui/engine/client.mjs';

function setup(timeout=1000){
  const workers=[];
  const client=new EngineClient({timeout,createWorker:()=>{
    const worker={messages:[],postMessage(message){this.messages.push(structuredClone(message));},terminate(){this.terminated=true;},reply(message){this.onmessage({data:message});}};
    workers.push(worker);return worker;
  }});
  return {client,workers};
}
test('requests snapshot input data and match replies by ID',async()=>{
  const {client,workers}=setup(),data={inputs:[0]};
  const first=client.request('simulate',data),second=client.request('catalog');
  data.inputs[0]=1;
  const worker=workers[0];assert.equal(worker.messages[0].data.inputs[0],0);
  worker.reply({id:2,result:'catalog'});worker.reply({id:1,result:'simulation'});
  assert.deepEqual(await Promise.all([first,second]),['simulation','catalog']);client.close();
});
test('request errors preserve the worker; worker failures reject every waiter and allow restart',async()=>{
  const {client,workers}=setup();
  const bad=assert.rejects(client.request('bad'),/Unknown/);
  workers[0].reply({id:1,error:'Unknown operation'});await bad;
  assert(!workers[0].terminated);
  const one=assert.rejects(client.request('catalog'),/could not start/),two=assert.rejects(client.request('catalog'),/could not start/);
  workers[0].onerror({preventDefault(){}});await Promise.all([one,two]);
  assert(workers[0].terminated);
  const next=client.request('catalog');workers[1].reply({id:4,result:'restarted'});
  assert.equal(await next,'restarted');client.close();
});
test('a timeout terminates stalled calculation and rejects queued requests',async()=>{
  const {client,workers}=setup(20);
  await Promise.all([assert.rejects(client.request('check'),/too long/),assert.rejects(client.request('simulate'),/too long/)]);
  assert(workers[0].terminated);assert.equal(client.pending.size,0);
});
test('uncloneable input rejects without leaving a pending request',async()=>{
  const {client,workers}=setup();
  await assert.rejects(client.request('simulate',{bad:()=>{}}));
  assert.equal(client.pending.size,0);assert(!workers[0].terminated);client.close();
});
