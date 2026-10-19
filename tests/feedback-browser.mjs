// Exercise visually crowded wires and the mode-specific clear action.
export async function feedbackChecks({send,js,wait,assert,click,key,screenshot}) {
  const circuit={nodes:[
    {id:1,kind:'INPUT',width:1,name:'A',x:0,y:0},
    {id:2,kind:'INPUT',width:1,name:'B',x:0,y:192},
    {id:100,kind:'NOT',width:1,x:480,y:0},
    {id:101,kind:'NOT',width:1,x:480,y:192}
  ],wires:[{from:1,output:0,to:101,input:0},{from:2,output:0,to:100,input:0}]};
  const fixture={version:2,level:'sandbox',inputs:[1,0],circuit};
  const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('signal-garden-v2:last','"sandbox"');localStorage.setItem('signal-garden-v2:welcome','true');`});
  await js('window.__oldDocument=true');await send('Page.reload');
  await wait("!window.__oldDocument && document.body?.classList.contains('free-play') && document.querySelectorAll('.wire').length===2 && document.querySelector('.wire.high')");
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
  await assert("document.title.includes('Free play mode') && document.getElementById('clear-button').getAttribute('aria-label')==='Clear workbench'",'Free play mode uses its own title and trash action');
  await assert("document.querySelectorAll('.wire.high').length===1 && document.querySelectorAll('.wire.low').length===1",'Parallel routing preserves the distinct live signals');
  await assert(`(()=>{
    const routes=[...document.querySelectorAll('.wire')].map(w=>{const v=w.getAttribute('d').match(/-?\\d+(?:\\.\\d+)?/g).map(Number);return Array.from({length:v.length/2},(_,i)=>({x:v[2*i],y:v[2*i+1]}))});
    const [a,b]=routes;
    for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
      const p=a[i-1],q=a[i],r=b[j-1],s=b[j];
      if(p.x===q.x&&r.x===s.x&&p.x===r.x&&Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y))>Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y)))return false;
      if(p.y===q.y&&r.y===s.y&&p.y===r.y&&Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x))>Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x)))return false;
    }return true;
  })()`,'Unrelated crossing wires use separate parallel runs on the actual board');
  await assert("[...document.querySelectorAll('.wire-group')].every(g=>g.querySelector('.wire-casing').getAttribute('d')===g.querySelector('.wire').getAttribute('d') && parseFloat(getComputedStyle(g.querySelector('.wire-casing')).strokeWidth)>parseFloat(getComputedStyle(g.querySelector('.wire')).strokeWidth))",'Crossings have a visible overpass gap using the same route geometry');
  const wirePoint=async(index,distance)=>js(`(()=>{const w=document.querySelector('[data-wire="${index}"] .wire'),p=w.getPointAtLength(${distance}),screen=new DOMPoint(p.x,p.y).matrixTransform(w.getScreenCTM());return {x:screen.x,y:screen.y}})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...await wirePoint(0,100)});
  await assert("document.querySelector('[data-wire=\"0\"]').classList.contains('traced') && document.querySelector('[data-pin=\"1:0:1\"]').dataset.traced==='true' && document.querySelector('[data-pin=\"101:0:0\"]').dataset.traced==='true' && document.getElementById('wire-trace').textContent==='A → NOT gate · A'",'Hovering traces one wire and names its exact endpoints');
  await screenshot('18-wire-tracing.png');
  await js("document.querySelector('[data-wire=\"1\"]').focus()");
  await assert("document.activeElement.dataset.wire==='1' && document.querySelector('[data-pin=\"2:0:1\"]').dataset.traced==='true'",'Keyboard focus traces a wire without losing focus');
  await key('Enter');await key('Delete');
  await assert("document.querySelectorAll('.wire').length===1 && document.querySelectorAll('#nodes>.node').length===4",'Deleting a traced wire leaves other wires and blocks intact');
  await click('#undo-button');await wait("document.querySelectorAll('.wire').length===2 && document.querySelector('.wire.high')");
  await click('#clear-button');
  await assert("document.getElementById('modal-content').textContent.includes('including inputs and outputs') && document.getElementById('confirm-clear').textContent==='Clear workbench'",'The trash action explains that Free play mode clears everything');
  await click('#confirm-clear');await assert("document.querySelectorAll('#nodes>.node').length===0 && document.querySelectorAll('.wire').length===0",'Free play clear removes every block and wire');
  await click('#undo-button');await wait("document.querySelectorAll('#nodes>.node').length===4 && document.querySelectorAll('.wire').length===2 && document.querySelector('[data-node=\"1\"] .terminal-value').textContent==='1'");
  await assert("document.querySelector('[data-node=\"2\"] .terminal-value').textContent==='0'",'Undo restores all cleared blocks, connections and input values');
  await click('#arrange-button');await screenshot('19-tidy-parallel-wires.png');
  await click('#journey-nav');
  await assert("document.getElementById('journey-sidebar').classList.contains('open') && document.body.classList.contains('free-play')",'The journey map opens from Free play mode without changing the circuit');
  await click('#close-journey');
  for(const width of [390,320]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    if(await js("document.getElementById('task-toggle').getAttribute('aria-expanded')==='true'"))await click('#back-to-board');
    await wait("document.getElementById('inspector').hidden");
    await click('#fit-button');await js('window.scrollTo(0,0)');
    await assert("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('.topbar button,.zoom-controls button')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})",`Free play navigation and board controls fit a ${width}px phone`);
    await click('#task-toggle');
    await wait("!document.getElementById('inspector').getAnimations().length");
    await assert("!document.getElementById('inspector').hidden",`Workspace notes open within a ${width}px phone`);
    await click('#back-to-board');await wait("document.getElementById('inspector').hidden");
    await assert("document.getElementById('inspector').hidden && document.documentElement.scrollWidth<=innerWidth",`The folded task controls fit a ${width}px phone`);
    if(width===320)await screenshot('20-small-phone.png');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
  await js('window.scrollTo(0,0)');await click('#fit-button');
}
