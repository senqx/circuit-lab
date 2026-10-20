import {connectBrowser} from './cdp.mjs';
const b=await connectBrowser(process.argv[3]);const {send,js,wait,assert,click,key}=b;
try {
 await send('Page.enable');await send('Runtime.enable');
 await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Storage.clearDataForOrigin',{origin:new URL(process.argv[2]).origin,storageTypes:'service_workers,cache_storage'});
 await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
 const fixture={version:2,level:'sandbox',inputs:[],circuit:{nodes:[{id:100,kind:'AND',width:1,x:0,y:0},{id:101,kind:'NOT',width:1,x:0,y:0}],wires:[]}};
 const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:welcome','true');localStorage.setItem('signal-garden-v2:last','"sandbox"');localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(fixture))});`});
 await send('Page.navigate',{url:process.argv[2]});
 await wait("document.body && !document.body.classList.contains('app-opening') && document.querySelector('[data-node=\"101\"]')");
 const point=async(x,y)=>js(`(()=>{const p=new DOMPoint(${x},${y}).matrixTransform(document.querySelector('[data-node="101"]').getScreenCTM());return {x:p.x,y:p.y}})()`);
 const tap=async(x,y)=>{const p=await point(x,y);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
 await tap(72,72);
 await assert("document.querySelector('[data-node=\"101\"]').classList.contains('selected') && !document.querySelector('[data-node=\"100\"]').classList.contains('selected')",'Overlapping bodies select the topmost block');
 await tap(0,72);
 await assert("document.querySelector('[data-pin=\"101:0:0\"]').classList.contains('pending') && !document.querySelector('[data-pin=\"100:0:0\"]').classList.contains('pending')",'Overlapping pin hit areas choose the upper block');
 await key('Escape');
 await tap(0,60);
 await assert("!document.querySelector('[data-node=\"100\"] [data-pin].pending')",'A hidden lower pin cannot steal a click on the upper footprint');
 await key('Escape');await tap(72,72);await key('Delete');await key('z','KeyZ',2);
 await wait("document.querySelector('[data-node=\"101\"]')");
 await assert("document.querySelector('#nodes').lastElementChild.dataset.node==='101'",'Undo preserves visual layer order');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...await point(0,72),id:1}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await assert("document.querySelector('[data-pin=\"101:0:0\"]').classList.contains('pending')",'Touch targeting also chooses the topmost pin');
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
 await assert(`${b.errors.length}===0`,'No browser runtime errors');
} finally{b.close();}
