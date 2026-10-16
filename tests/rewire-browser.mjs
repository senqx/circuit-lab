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
  const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('signal-garden-v2:last','"sandbox"');localStorage.setItem('signal-garden-v2:welcome','true');`});
  await js('window.__oldDocument=true');await send('Page.reload');
  await wait("!window.__oldDocument && document.querySelector('[data-node=\"50\"] .terminal-value')?.textContent==='1' && document.querySelector('[data-node=\"53\"] .terminal-value')?.textContent==='5'");
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
  const frame=()=>js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const point=(id,index=0,output=0)=>js(`(()=>{const r=document.querySelector('[data-pin="${id}:${index}:${output}"] .pin-dot').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const press=p=>send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
  const move=async p=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p,button:'left',buttons:1});await frame();};
  const release=p=>send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
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

  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
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
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
  await js('window.scrollTo(0,0);window.__engine.request=window.__rewireRequest');await click('#fit-button');
}
