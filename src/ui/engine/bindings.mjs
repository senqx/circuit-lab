// Argument conversion only. All circuit behavior and validation live in C++.
export function bindEngine(module) {
  const wrap=(name,result,args=[])=>module.cwrap(`circuit_${name}`,result,args);
  const catalog=wrap('catalog','string'),reference=wrap('reference','string',['number']);
  const create=wrap('create','number'),destroy=wrap('destroy',null,['number']);
  const node=wrap('node','number',['number','number','string','number']);
  const wire=wrap('wire','number',Array(5).fill('number'));
  const state=wrap('state','number',['number','string','number']);
  const simulate=wrap('simulate','string',Array(4).fill('number'));
  const check=wrap('check','string',['number','number']);
  function integer(value) {
    if(!Number.isInteger(value)||value < -2147483648||value > 2147483647)throw Error('Expected a 32-bit integer.');
    return value;
  }
  function text(value,limit) {
    if(typeof value!=='string'||!value.length||value.length>limit||value.includes('\0'))throw Error('Invalid text argument.');
    return value;
  }
  return (method,data={})=>{
    if(method==='catalog')return JSON.parse(catalog());
    if(method==='reference')return JSON.parse(reference(integer(data.level)));
    if(method!=='simulate'&&method!=='check')throw Error('Unknown engine operation.');
    const graph=data.circuit;
    if(!Array.isArray(graph?.nodes)||!Array.isArray(graph?.wires))throw Error('Expected lists of parts and wires.');
    if(graph.nodes.length>512||graph.wires.length>4096)throw Error('Circuit exceeds the editor’s size limit.');
    const handle=create();
    if(!handle)throw Error('Could not create a circuit.');
    let buffer=0;
    try {
      for(const n of graph.nodes)if(!node(handle,integer(n.id),text(n.kind,32),integer(n.width===undefined?1:n.width)))throw Error('Invalid part in circuit.');
      for(const w of graph.wires)if(!wire(handle,...['from','output','to','input'].map(k=>integer(w[k]))))throw Error('Invalid wire in circuit.');
      if(method==='check')return JSON.parse(check(handle,integer(data.level)));
      const {state:memory={},inputs:values=[],tick=false}=data;
      if(!memory||typeof memory!=='object'||Array.isArray(memory)||Object.keys(memory).length>32768)throw Error('Invalid memory state.');
      for(const [key,value] of Object.entries(memory))if(!state(handle,text(key,256),integer(value)))throw Error('Invalid memory state.');
      if(!Array.isArray(values)||values.length>32)throw Error('Expected at most 32 input values.');
      if(typeof tick!=='boolean')throw Error('Clock tick must be true or false.');
      const inputs=values.map(integer);
      if(inputs.length){
        buffer=module._malloc(inputs.length*4);
        if(!buffer)throw Error('Could not allocate circuit inputs.');
        inputs.forEach((value,index)=>module.setValue(buffer+index*4,value,'i32'));
      }
      // Copy the result before another C call can replace its string buffer.
      return JSON.parse(simulate(handle,buffer,inputs.length,tick?1:0));
    } finally {
      if(buffer)module._free(buffer);
      destroy(handle);
    }
  };
}
