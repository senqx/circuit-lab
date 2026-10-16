// Measures browser frame cadence while dragging real circuits and engine latency.
import fs from 'node:fs/promises';
import {connectBrowser} from './cdp.mjs';
const url=process.argv[2]||'http://127.0.0.1:18437';
const {send,js,wait,click,delay,key,screenshot,close}=await connectBrowser(process.argv[3]);
const report={};
try {
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Performance.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});await wait("document.querySelector('[data-node]')");
  if(await js("document.getElementById('modal').open"))await click('.modal-close');
  if(await js("document.body.classList.contains('free-play')"))await click('[data-return]');
  for(const [id,values] of [[3,[1,1]],[20,[15,1]],[24,[15,0,0,1,0]]]) {
    const times=await js(`(async()=>{
      const {engine}=await import(new URL('engine/client.mjs',document.baseURI));
      const circuit=await engine.request('reference',{level:${id}}),times=[];
      for(let i=0;i<25;i++){
        const start=performance.now();
        const result=await engine.request('simulate',{circuit,inputs:${JSON.stringify(values)}});
        if(result.error)throw Error(result.error);
        if(i>=5)times.push(performance.now()-start);
      }
      return times;
    })()`);
    await click('#journey-nav');
    if(await js(`document.querySelector('[data-level="${id}"]').getClientRects().length===0`))await click(`[data-chapter="${id===3?0:id===20?4:5}"]`);
    await click(`[data-level="${id}"]`);await click('#example-button');await click('#load-example');
    await wait("document.querySelector('.preview-banner') && !document.getElementById('modal').open");await delay(200);
    for(let i=0;i<values.length;i++) {
      const nodeId=i+1,value=values[i];
      if(await js(`document.querySelector('[data-node="${nodeId}"] .terminal-value').textContent===String(${value})`))continue;
      await click(`[data-toggle="${nodeId}"] rect`);
      if(await js("document.getElementById('modal').open")) {
        await js(`document.getElementById('bus-value').value=${value}`);await click('#bus-form button');
      }
    }
    if(id!==3)await click('#tick-button');
    await delay(150);
    const round=n=>Math.round(n*100)/100;
    report[id]={engineWithWorkerMedianMs:round(times.sort((a,b)=>a-b)[10]),flowingWires:await js("document.querySelectorAll('.wire.high').length"),gestures:{}};
    const metrics=async()=>Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    for(const gesture of ['drag','group','pan','zoom','wire','select']) {
      await click('#fit-button');await delay(60);
      if(gesture==='group'){await js("document.getElementById('canvas').focus()");await key('a','KeyA',2);}else await key('Escape');
      const point=await js(`(()=>{const r=document.querySelector('${['drag','group'].includes(gesture)?'.node-body':gesture==='wire'?'[data-pin="1:0:1"] .pin-dot':'#canvas'}').getBoundingClientRect();return ${gesture==='select'?'{x:r.x+25,y:r.y+25}':'{x:r.x+r.width/2,y:r.y+r.height/2}'}})()`);
      await js("(async()=>{window.__engine=(await import(new URL('engine/client.mjs',document.baseURI))).engine;window.__simRequests=0;window.__request=window.__engine.request.bind(window.__engine);window.__engine.request=(...args)=>{if(args[0]==='simulate')window.__simRequests++;return window.__request(...args)};window.__wireChanges=0;window.__routeObserver=new MutationObserver(m=>window.__wireChanges+=m.filter(c=>c.attributeName==='d').length);window.__routeObserver.observe(document.getElementById('wires'),{subtree:true,attributes:true});})()");
      const before=await metrics();
      const frames=js(`new Promise(resolve=>{const intervals=[];let previous;function frame(t){if(previous!==undefined)intervals.push(t-previous);previous=t;if(intervals.length<120)requestAnimationFrame(frame);else resolve(intervals);}requestAnimationFrame(frame);})`);
      const button=gesture==='pan'?'middle':'left',buttons=gesture==='pan'?4:1;
      if(gesture!=='zoom')await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button,clickCount:1});
      for(let i=0;i<100;i++) {
        if(gesture==='zoom')await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:i<50?-3:3});
        else await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+Math.sin(i/16)*55,y:point.y+Math.cos(i/16)*45,button,buttons});
        await delay(16);
      }
      if(gesture!=='zoom') {
        const end=gesture==='wire'?await js("(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return {x:r.left+8,y:r.bottom-55}})()"):point;
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button,clickCount:1});
      }
      const samples=await frames,sorted=[...samples].sort((a,b)=>a-b),after=await metrics();
      const data={rafCadencePerSecond:round(1000/(samples.reduce((a,b)=>a+b)/samples.length)),frameP95Ms:round(sorted[Math.floor(sorted.length*.95)]),framesOver25Ms:samples.filter(n=>n>25).length,mainThreadMsPerInput:round((after.TaskDuration-before.TaskDuration)*1000/100),simulationRequests:await js('window.__simRequests'),existingWirePathChanges:await js('window.__wireChanges')};
      await js('window.__engine.request=window.__request;window.__routeObserver.disconnect()');
      if(data.simulationRequests!==0)throw Error(gesture+' requested a simulation');
      if(!['drag','group'].includes(gesture)&&data.existingWirePathChanges!==0)throw Error(gesture+' rerouted existing wires');
      if(gesture==='wire')await key('Escape');
      report[id].gestures[gesture]=data;console.log(`Lesson ${id}, ${gesture}:`,data);
    }
    if(id===24){await click('#fit-button');await screenshot('13-processor.png');}

  }
  await fs.writeFile('test-artifacts/performance.json',JSON.stringify(report,null,2)+'\n');
} finally {close();}
