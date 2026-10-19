// Move a wire's receiving end with real pointer input, without editing the
// saved graph or simulating until the drop is committed.
export async function rewireChecks({send,js,wait,assert,click,key,screenshot}) {
  const circuit={nodes:[
    {id:1,kind:'INPUT',width:1,name:'A',x:0,y:0},
    {id:2,kind:'INPUT',width:1,name:'B',x:0,y:192},
    {id:3,kind:'INPUT',width:4,name:'Data',x:0,y:384},
    {id:50,kind:'OUTPUT',width:1,name:'Q1',x:480,y:0},
    {id:51,kind:'OUTPUT',width:1,name:'Q2',x:720,y:0},
    {id:52,kind:'OUTPUT',width:1,name:'Q3',x:720,y:192},
    {id:53,kind:'OUTPUT',width:4,name:'Bus1',x:720,y:384},
    {id:54,kind:'OUTPUT',width:4,name:'Bus2',x:480,y:384},
    {id:100,kind:'NAND',width:1,x:480,y:192}
  ],wires:[
    {from:1,output:0,to:50,input:0},{from:1,output:0,to:100,input:0},
    {from:2,output:0,to:51,input:0},{from:3,output:0,to:53,input:0}
  ]};
  const fixture={version:2,level:'sandbox',inputs:[1,0,5],circuit};
  async function loadFixture(data) {
    const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(data))});localStorage.setItem('signal-garden-v2:last','"sandbox"');localStorage.setItem('signal-garden-v2:welcome','true');`});
    await js('window.__oldDocument=true');await send('Page.reload');
    await wait("!window.__oldDocument && document.querySelector('[data-node=\"50\"] .terminal-value')");
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
  }
  await loadFixture(fixture);
  await wait("document.querySelector('[data-node=\"50\"] .terminal-value')?.textContent==='1' && document.querySelector('[data-node=\"53\"] .terminal-value')?.textContent==='5'");
  const frame=()=>js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const point=(id,index=0,output=0)=>js(`(()=>{const r=document.querySelector('[data-pin="${id}:${index}:${output}"] .pin-dot').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const press=p=>send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
  const move=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p,button:'left',buttons:1});await frame();};
  const release=p=>send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
  const wirePoint=(from,to,output=0)=>js(`(()=>{
    const wire=document.querySelector('[data-key="${from}:${output}:${to}:0"]'),path=wire.querySelector('.wire');
    const pins=[...document.querySelectorAll('.pin-dot')].map(pin=>pin.getBoundingClientRect());
    for(const fraction of [.5,.4,.6,.3,.7,.2,.8]){
      const p=path.getPointAtLength(path.getTotalLength()*fraction).matrixTransform(path.getScreenCTM());
      if(document.elementFromPoint(p.x,p.y)?.closest('[data-wire]')===wire&&pins.every(r=>Math.hypot(p.x-r.x-r.width/2,p.y-r.y-r.height/2)>25))return {x:p.x,y:p.y};
    }
    throw Error('No unobstructed wire segment for ${from}:${output}:${to}');
  })()`);
  const value=id=>`document.querySelector('[data-node="${id}"] .terminal-value').textContent`;
  const saved="JSON.parse(localStorage.getItem('signal-garden-v2:circuit:sandbox')).circuit";
  const connected=(from,to,input=0)=>`[...document.querySelectorAll('[data-wire]')].some(e=>e.dataset.key==='${from}:0:${to}:${input}')`;
  const origin=await point(50),blank=await js("(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return {x:r.left+25,y:r.top+25}})()");
  await js(`(async()=>{window.__engine=(await import(new URL('engine/client.mjs',document.baseURI))).engine;window.__rewireRequests=0;window.__rewireRequest=window.__engine.request.bind(window.__engine);
    window.__engine.request=(...args)=>{if(args[0]==='simulate')window.__rewireRequests++;return window.__rewireRequest(...args)};
    window.__originalWire=document.querySelector('[data-wire="0"]');
    window.__originalPaths=[...document.querySelectorAll('.wire')].map(e=>e.getAttribute('d'));
    window.__originalNodes=[...document.querySelectorAll('#nodes>.node')];
    window.__flowCount=document.querySelectorAll('.flow-dot').length;})()`);

  await press(origin);await move(blank);
  await assert("getComputedStyle(window.__originalWire).visibility==='hidden' && document.querySelector('.wire-preview') && document.querySelector('[data-pin=\"1:0:1\"]').classList.contains('pending')",'Dragging the bulb connector lifts that wire end while keeping its source fixed');
  await assert("document.querySelectorAll('.wire-group.rerouting').length===1 && document.querySelectorAll('.flow-dot').length<window.__flowCount && document.querySelectorAll('.flow-dot').length>0",'Only the lifted branch hides its old path and flow');
  await assert("(()=>{const w=document.querySelector('.wire-preview'),p=w.getPointAtLength(0),pin=document.querySelector('[data-pin=\"1:0:1\"] .pin-dot'),n=pin.closest('[data-node]').transform.baseVal.consolidate().matrix;return Math.hypot(p.x-pin.cx.baseVal.value-n.e,p.y-pin.cy.baseVal.value-n.f)<.1})()",'The reroute preview begins at the original sending pin');
  await js("window.dispatchEvent(new Event('beforeunload'))");
  await assert(`JSON.stringify(${saved})===${JSON.stringify(JSON.stringify(circuit))} && window.__rewireRequests===0 && document.getElementById('undo-button').disabled`,'An unfinished reroute does not alter the saved circuit, undo history or engine state');
  await assert("window.__originalNodes.every(n=>n.isConnected) && [...document.querySelectorAll('.wire')].every((e,i)=>e.getAttribute('d')===window.__originalPaths[i])",'Rerouting previews reuse the board and every existing wire path');
  await screenshot('21-wire-rerouting.png');
  await release(blank);

  for(const how of ['escape','right-click','outside','original-pin','wrong-width','cancel-button','blur']) {
    await press(origin);await move(blank);
    let end=blank;
    if(how==='escape')await key('Escape');
    if(how==='right-click') {
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...blank,button:'right',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...blank,button:'right',clickCount:1});
    }
    if(how==='outside')end={x:blank.x-60,y:blank.y};
    if(how==='original-pin')end=origin;
    if(how==='wrong-width') {
      end=await point(53);await move(end);
      await assert("document.querySelector('.wire-preview').classList.contains('invalid')",'A mismatched bus destination is marked invalid before dropping');
    }
    if(how==='cancel-button')await js("document.getElementById('cancel-gesture').click()");
    if(how==='blur')await js("window.dispatchEvent(new Event('blur'))");
    await release(end);await frame();
    await assert(`!document.querySelector('.wire-preview,.rerouting') && getComputedStyle(window.__originalWire).visibility==='visible' && ${value(50)}==='1' && window.__rewireRequests===0 && document.getElementById('undo-button').disabled && document.querySelectorAll('.flow-dot').length===window.__flowCount`,`Cancelling with ${how} restores the connection and flow without an edit`);
  }

  const target=await point(52),snap={x:target.x+7,y:target.y+4};
  await press(origin);await move(snap);
  await assert("document.querySelector('[data-pin=\"52:0:0\"]').classList.contains('snap-target')",'The loose wire end snaps to another bulb connector');
  await release(snap);await wait(`${value(52)}==='1' && ${value(50)}==='?'`);
  await wait(`${saved}.wires.some(w=>w.from===1&&w.to===52)`);
  await assert(`${connected(1,52)} && !(${connected(1,50)}) && ${connected(1,100)} && document.querySelectorAll('[data-wire]').length===4 && window.__rewireRequests===1`,'Dropping moves one branch, preserves fan-out and simulates only once');
  await click('#undo-button');await wait(`${value(50)}==='1' && ${value(52)}==='?'`);
  await assert(`${connected(1,50)} && document.getElementById('undo-button').disabled`,'One Undo restores the entire reroute');
  await press(origin);await move(blank);await release(blank);
  await assert("!document.getElementById('redo-button').disabled",'A cancelled reroute preserves Redo');
  await click('#redo-button');await wait(`${value(52)}==='1' && ${value(50)}==='?'`);
  await click('#undo-button');await wait(`${value(50)}==='1'`);

  const occupied=await point(51);
  await press(origin);await move(occupied);await release(occupied);
  await wait(`${value(51)}==='1' && ${value(50)}==='?'`);
  await assert(`!(${connected(2,51)}) && ${connected(1,51)} && document.querySelectorAll('[data-wire]').length===3`,'An occupied receiving pin replaces its previous wire');
  await click('#undo-button');await wait(`${value(50)}==='1' && ${value(51)}==='0'`);
  await assert(`${connected(1,50)} && ${connected(2,51)} && document.getElementById('undo-button').disabled`,'One Undo restores both wires after replacing an occupied connection');

  const gatePin=await point(100,1);
  await press(origin);await move(gatePin);await release(gatePin);
  await wait("document.querySelector('[data-node=\"100\"]').dataset.value==='0'");
  await assert(`${connected(1,100,1)} && ${connected(1,100,0)} && !(${connected(1,50)})`,'A bulb wire can be redirected to an individual gate input');
  await click('#undo-button');await wait(`${value(50)}==='1'`);

  const source=await point(1,0,1);
  await press(source);await move(target);await release(target);await wait(`${value(52)}==='1'`);
  await assert(`${connected(1,50)} && ${connected(1,52)} && document.querySelectorAll('[data-wire]').length===5`,'Dragging a sending pin still adds a branch without detaching existing wires');
  await click('#undo-button');await wait(`${value(52)}==='?'`);
  const otherSource=await point(2,0,1);
  await press(target);await move(otherSource);await release(otherSource);await wait(`${value(52)}==='0'`);
  await assert(`${connected(2,52)} && ${connected(1,50)}`,'An empty receiving pin can still start a new wire toward its source');
  await click('#undo-button');await wait(`${value(52)}==='?'`);
  await click('[data-pin="50:0:0"] .pin-dot');await click('[data-pin="2:0:1"] .pin-dot');
  await wait(`${value(50)}==='0'`);
  await assert(`${connected(2,50)}`,'Clicking a connected receiver still allows replacing its source');
  await click('#undo-button');await wait(`${value(50)}==='1'`);

  const busStart=await point(53),busEnd=await point(54);
  await press(busStart);await move(busEnd);await release(busEnd);await wait(`${value(54)}==='5' && ${value(53)}==='?'`);
  await assert(`${connected(3,54)} && !(${connected(3,53)})`,'Four-bit wires can move between LED outputs');
  await click('#undo-button');await wait(`${value(53)}==='5'`);

  const rootWire=await wirePoint(1,50),otherWire=await wirePoint(2,51),busWire=await wirePoint(3,53);
  await press(rootWire);await release(rootWire);
  await assert("!document.querySelector('.wire-preview') && !document.getElementById('selection-tools').hidden && document.querySelector('[data-key=\"1:0:50:0\"] .wire.selected')",'Clicking a wire still selects it for tracing and deletion');
  await key('Delete');await wait(`${value(50)}==='?'`);
  await assert(`${connected(1,100)} && !(${connected(1,50)})`,'Deleting a selected wire preserves the other connections from its source');
  await click('#undo-button');await wait(`${value(50)}==='1'`);
  await js('window.__rewireRequests=0');
  await press(target);await move(rootWire);
  await assert("document.querySelector('[data-pin=\"1:0:1\"].snap-target') && document.querySelector('[data-key=\"1:0:50:0\"].traced')",'Hovering an existing wire highlights that wire and its actual sending pin');
  await assert("(()=>{const path=document.querySelector('.wire-preview'),p=path.getPointAtLength(0).matrixTransform(path.getScreenCTM()),r=document.querySelector('[data-pin=\"1:0:1\"] .pin-dot').getBoundingClientRect();return Math.hypot(p.x-r.x-r.width/2,p.y-r.y-r.height/2)<.1})()",'The preview connects directly from the original output rather than the touched segment');
  await js("window.dispatchEvent(new Event('beforeunload'))");
  await assert(`JSON.stringify(${saved})===${JSON.stringify(JSON.stringify(circuit))} && window.__rewireRequests===0 && document.getElementById('undo-button').disabled`,'Targeting a wire leaves the graph, undo history and simulation unchanged until release');
  await release(rootWire);await wait(`${value(52)}==='1'`);
  await js("window.dispatchEvent(new Event('beforeunload'))");
  await assert(`${saved}.wires.some(w=>w.from===1&&w.output===0&&w.to===52&&w.input===0&&Object.keys(w).length===4) && ${saved}.nodes.length===${circuit.nodes.length} && ${connected(1,50)} && window.__rewireRequests===1`,'Dropping onto a wire saves one ordinary connection from its root and simulates once');
  await screenshot('26-wire-source-shortcut.png');
  await click('#undo-button');await wait(`${value(52)}==='?'`);
  await click('#redo-button');await wait(`${value(52)}==='1'`);
  await click('#undo-button');await wait(`${value(52)}==='?'`);

  await click('[data-pin="52:0:0"] .pin-dot');await press(otherWire);await release(otherWire);
  await wait(`${value(52)}==='0'`);
  await assert(`${connected(2,52)} && ${connected(1,50)}`,'Clicking an input followed by a wire uses the chosen wire’s source');
  await click('#undo-button');await wait(`${value(52)}==='?'`);
  await click('[data-pin="50:0:0"] .pin-dot');await press(otherWire);await release(otherWire);
  await wait(`${value(50)}==='0'`);
  await assert(`${connected(2,50)} && ${connected(2,51)} && !(${connected(1,50)})`,'A clicked occupied input can replace its source by choosing an existing wire');
  await click('#undo-button');await wait(`${value(50)}==='1'`);
  await click('[data-pin="52:0:0"] .pin-dot');
  await js("document.querySelector('[data-key=\"1:0:50:0\"]').focus()");await key('Enter');
  await wait(`${value(52)}==='1'`);
  await assert(`${connected(1,52)}`,'Keyboard activation can use a wire as the source of a pending input connection');
  await click('#undo-button');await wait(`${value(52)}==='?'`);

  for(const cancel of ['empty','escape','another-output']) {
    await js('window.__rewireRequests=0');
    await press(rootWire);await move(cancel==='another-output'?otherWire:blank);
    if(cancel==='escape')await key('Escape');
    await release(cancel==='another-output'?otherWire:blank);
    await assert(`${connected(1,50)} && ${connected(2,51)} && document.querySelectorAll('[data-wire]').length===4 && !document.querySelector('.wire-preview,.rerouting') && document.getElementById('undo-button').disabled && window.__rewireRequests===0`,`A wire-source drag cancelled by ${cancel} preserves both original connections`);
  }
  await press(rootWire);await move(target);await release(target);await wait(`${value(52)}==='1'`);
  await assert(`${connected(1,52)} && ${connected(1,50)}`,'Dragging from a wire creates a normal connection from its root without lifting the existing wire');
  await click('#undo-button');await wait(`${value(52)}==='?'`);
  await press(target);await move(busWire);
  await assert("document.querySelector('.wire-preview.invalid')",'Wire targets show width mismatches before release');
  await release(busWire);
  await assert(`!(${connected(3,52)}) && document.getElementById('undo-button').disabled`,'A four-bit wire cannot supply a one-bit input');
  await press(busEnd);await move(busWire);await release(busWire);await wait(`${value(54)}==='5'`);
  await assert(`${connected(3,54)} && ${connected(3,53)}`,'Four-bit wire targeting reuses the original bus output');
  await click('#undo-button');await wait(`${value(54)}==='?'`);

  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  if(await js("document.getElementById('task-toggle').getAttribute('aria-expanded')==='true'"))await click('#back-to-board');
  await wait("document.getElementById('inspector').hidden");
  await click('#fit-button');await js('window.scrollTo(0,0)');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const touchStart=await point(50),touchEnd=await point(52);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchStart,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touchEnd,id:1}]});await frame();
  await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await assert(`!document.querySelector('.wire-preview,.rerouting') && ${connected(1,50)} && document.getElementById('undo-button').disabled`,'A cancelled touch restores the original wire');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchStart,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touchEnd,id:1}]});await frame();
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await wait(`${value(52)}==='1' && ${value(50)}==='?'`);
  await assert(`${connected(1,52)} && !(${connected(1,50)})`,'Touch dragging reroutes a bulb connection on a phone');
  await click('#undo-button');await wait(`${value(50)}==='1' && ${value(52)}==='?'`);
  const touchWire=await wirePoint(1,50);
  for(const reverse of [false,true]) {
    const start=reverse?touchWire:touchEnd,end=reverse?touchEnd:touchWire;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await frame();
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await wait(`${value(52)}==='1'`);
    await assert(`${connected(1,52)} && ${connected(1,50)}`,`Touch dragging ${reverse?'from':'onto'} a wire uses its original source`);
    await click('#undo-button');await wait(`${value(52)}==='?'`);
  }
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
  await js('window.scrollTo(0,0);window.__engine.request=window.__rewireRequest');await click('#fit-button');

  await loadFixture({version:2,level:'sandbox',inputs:[5],circuit:{nodes:[
    {id:1,kind:'INPUT',width:4,x:0,y:0},{id:100,kind:'SPLIT4',width:1,x:300,y:0},
    {id:50,kind:'OUTPUT',width:1,x:650,y:0},{id:51,kind:'OUTPUT',width:1,x:650,y:210}
  ],wires:[{from:1,output:0,to:100,input:0},{from:100,output:1,to:50,input:0}]}});
  await wait(`${value(50)}==='0'`);
  const splitWire=await wirePoint(100,50,1),splitTarget=await point(51);
  await press(splitTarget);await move(splitWire);
  await assert("document.querySelector('[data-pin=\"100:1:1\"].snap-target')",'A multi-output wire resolves to the exact sending pin');
  await release(splitWire);await wait(`${value(51)}==='0'`);
  await js("window.dispatchEvent(new Event('beforeunload'))");
  await assert(`${saved}.wires.some(w=>w.from===100&&w.output===1&&w.to===51&&w.input===0)`,'The new connection preserves the source output index');
  const original=await wirePoint(100,50,1);
  await press(original);await release(original);await key('Delete');await wait(`${value(50)}==='?'`);
  await assert(`${value(51)}==='0' && document.querySelector('[data-key=\"100:1:51:0\"]')`,'The new connection works independently after the targeted wire is deleted');
  await js("window.dispatchEvent(new Event('beforeunload'));window.__oldDocument=true");await send('Page.reload');
  await wait(`!window.__oldDocument && document.querySelector('[data-node=\"51\"] .terminal-value')?.textContent==='0'`);
  await assert(`${value(50)}==='?' && document.querySelector('[data-key=\"100:1:51:0\"]')`,'The ordinary source connection survives saving and reloading');
}
