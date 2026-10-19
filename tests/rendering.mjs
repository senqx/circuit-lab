// Observe browser paint activity as well as actual compositor-driven movement.
import fs from 'node:fs/promises';
import {connectBrowser} from './cdp.mjs';
const {send,js,wait,click,delay,on,close}=await connectBrowser(process.argv[3]);
const positions="JSON.stringify([...document.querySelectorAll('.flow-dot')].map(e=>getComputedStyle(e).transform))";
const metric=async()=>Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
try {
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Performance.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:18437'});await wait("document.body && !document.body.classList.contains('app-opening') && document.querySelector('[data-node]')");
  if(await js("document.getElementById('modal').open"))await click('.modal-close');
  if(await js("document.body.classList.contains('free-play')"))await click('[data-return]');
  await click('#journey-nav');
  if(await js("document.querySelector('[data-level=\"1\"]').getClientRects().length===0"))await click('[data-chapter="0"]');
  await click('[data-level="1"]');await click('#example-button');await click('#load-example');
  await wait("document.querySelector('.preview-banner')");
  if(await js("document.querySelector('[data-node=\"1\"] .terminal-value').textContent==='0'"))await click('[data-toggle="1"] rect');
  await wait("document.querySelector('.flow-dot')");
  await send('DOM.enable');await send('LayerTree.enable');
  let layers=[],paints=[];
  on('LayerTree.layerTreeDidChange',e=>{layers=e.layers||[];});on('LayerTree.layerPainted',e=>paints.push(e));
  await send('Emulation.setDeviceMetricsOverride',{width:1513,height:982,deviceScaleFactor:1,mobile:false});await delay(300);
  await js("window.__staticMutations=0;window.__paintObserver=new MutationObserver(m=>window.__staticMutations+=m.length);window.__paintObserver.observe(document.getElementById('canvas'),{subtree:true,attributes:true,childList:true,characterData:true})");
  const start=await js(positions),before=await metric();paints=[];await delay(1000);
  const after=await metric(),activePaints=[...paints],moved=await js(positions)!==start;
  await click('#flow-button');await delay(150);const paused=await js(positions);
  paints=[];await delay(600);const pausedPaints=[...paints],still=await js(positions)===paused;
  const layerNames={};
  for(const layer of layers)if(layer.backendNodeId){const {node}=await send('DOM.describeNode',{backendNodeId:layer.backendNodeId});layerNames[layer.layerId]={node:node.localName||node.nodeName,attributes:node.attributes};}
  const summarize=events=>Object.fromEntries([...new Set(events.map(e=>e.layerId))].map(id=>[id,{...layerNames[id],paints:events.filter(e=>e.layerId===id).length}]));
  const report={activePaints:summarize(activePaints),pausedPaints:summarize(pausedPaints),staticDOMMutations:await js('window.__staticMutations'),flowMoves:moved,pausedFlowStaysStill:still,idleMainThreadMs:Math.round((after.TaskDuration-before.TaskDuration)*100000)/100};
  if(!moved||!still||report.staticDOMMutations!==0||activePaints.length)throw Error('Flow failed to animate independently of browser painting');
  await js('window.__paintObserver.disconnect()');await click('#flow-button');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await click('#fit-button');await delay(150);
  await js("document.querySelector('.studio').style.transform='translateY(-2000px)'");await wait("document.getElementById('canvas-wrap').getBoundingClientRect().bottom<=0");await click('#fit-button');await delay(150);
  report.stopsOffscreen=await js("document.getElementById('signal-flow').getAnimations({subtree:true}).every(a=>a.playState==='paused')");
  await js("document.querySelector('.studio').style.transform=''");await click('#fit-button');await delay(150);
  report.resumesOnReturn=await js("document.getElementById('signal-flow').getAnimations({subtree:true}).some(a=>a.playState==='running')");
  if(!report.stopsOffscreen||!report.resumesOnReturn)throw Error('Flow failed viewport visibility checks');
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});await click('#fit-button');
  console.log(JSON.stringify(report,null,2));await fs.writeFile('test-artifacts/rendering-after.json',JSON.stringify(report,null,2)+'\n');
} finally {close();}
