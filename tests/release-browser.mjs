// Regression checks for saved/imported circuits and asynchronous engine requests.
export async function releaseChecks({send,js,wait,assert,click}) {
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
  const fixture={version:2,level:'sandbox',inputs:[0],circuit:{nodes:[
    {id:1,kind:'INPUT',width:1,x:72,y:168},
    {id:100,kind:'DFF',width:1,x:312,y:168},
    {id:50,kind:'OUTPUT',width:1,x:552,y:168}
  ],wires:[{from:1,output:0,to:100,input:0},{from:100,output:0,to:50,input:0}]}};
  const value="document.querySelector('[data-node=\"50\"] .terminal-value')?.textContent";
  const saved="JSON.parse(localStorage.getItem('signal-garden-v2:circuit:sandbox')).circuit";
  async function reload(data) {
    const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(data))});localStorage.setItem('signal-garden-v2:last','"sandbox"');localStorage.setItem('signal-garden-v2:welcome','true');`});
    await js('window.__oldDocument=true');await send('Page.reload');
    await wait(`!window.__oldDocument && document.querySelector('[data-node]') && ${value}==='0'`);
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
  }
  await reload(fixture);
  await js(`window.__nativeFetch=window.fetch;window.__requests=[];window.__release=[];
    window.fetch=async(url,options)=>{
      if(String(url).endsWith('/simulate')){
        window.__requests.push(JSON.parse(options.body));
        if(window.__requests.length<=2)await new Promise(resolve=>window.__release.push(resolve));
      }
      return window.__nativeFetch(url,options);
    };`);
  await click('[data-toggle="1"] rect');await wait('window.__requests.length===1');
  await click('#tick-button');await click('[data-toggle="1"] rect');
  await assert("document.getElementById('tick-button').disabled",'An in-flight clock step stays disabled while inputs change');
  await js('window.__release.shift()()');await wait('window.__requests.length===2');
  await assert('window.__requests[1].tick && window.__requests[1].inputs[0]===1','A queued clock captures the input at the time of the click');
  await assert("document.getElementById('tick-button').disabled",'Finishing an earlier display request does not unlock the pending clock');
  await js('window.__release.shift()()');await wait(`window.__requests.length===3 && ${value}==='1' && !document.getElementById('tick-button').disabled`);
  await assert("document.querySelector('[data-node=\"1\"] .terminal-value').textContent==='0' && document.getElementById('tick-count').textContent==='Step 1'",'The later input refresh preserves captured memory and counts one step');
  await js('window.fetch=window.__nativeFetch');

  // Import through the actual file input, keeping the existing board on failure.
  await js('window.dispatchEvent(new Event("beforeunload"))');
  const before=await js(`JSON.stringify(${saved})`);
  const invalid=[];
  for(const kind of ['toString','__proto__']){const f=structuredClone(fixture);f.circuit.nodes[1].kind=kind;invalid.push(f);}
  const duplicate=structuredClone(fixture);duplicate.circuit.wires.push(duplicate.circuit.wires[0]);invalid.push(duplicate);
  const bus=structuredClone(fixture);bus.circuit.nodes[0].width=4;invalid.push(bus);
  const missing=structuredClone(fixture);missing.circuit.wires[0].from=999;invalid.push(missing);
  for(const data of invalid) {
    await js(`(()=>{const input=document.getElementById('import-file'),transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(data))}],'bad.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
    await wait("document.getElementById('toast').classList.contains('error')");
    await assert(`JSON.stringify(${saved})===${JSON.stringify(before)} && document.querySelectorAll('[data-node]').length===3`,'An invalid imported graph leaves the saved circuit intact');
    await js("document.getElementById('toast').className='toast'");
  }
  // Old files can legally use the largest node ID. Insertion must still work.
  const highId=structuredClone(fixture);highId.circuit.nodes[1].id=1000000;
  highId.circuit.wires[0].to=1000000;highId.circuit.wires[1].from=1000000;
  await reload(highId);await click('[data-part="NOT"]');
  await wait("document.querySelector('[data-node=\"100\"]')");
  await js('window.dispatchEvent(new Event("beforeunload"))');
  await assert(`${saved}.nodes.every(n=>n.id<=1000000) && ${value}==='0'`,'Adding to an imported circuit reuses an available valid ID');

  // Malformed saves recover to a playable starter, without a blank screen.
  const damaged=structuredClone(fixture);damaged.circuit.nodes[1].kind='toString';
  const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(damaged))});`});
  await js('window.__oldDocument=true');await send('Page.reload');
  await wait('!window.__oldDocument && document.querySelectorAll("[data-toggle]").length===2');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
  await assert("!document.querySelector('.error-state') && document.querySelectorAll('[data-wire]').length===0",'A damaged workspace recovers to a playable starter');
}
