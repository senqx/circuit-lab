// Dependency-free browser acceptance test using Chrome's DevTools protocol.
// Start a headless Chrome on --remote-debugging-port=18438, and the game first.
import fs from 'node:fs/promises';
import {connectBrowser} from './cdp.mjs';
import {editorChecks} from './editor-browser.mjs';
import {feedbackChecks} from './feedback-browser.mjs';
import {rewireChecks} from './rewire-browser.mjs';
import {releaseChecks} from './release-browser.mjs';
import path from 'node:path';
const url=process.argv[2]?.startsWith('http')?process.argv[2]:'http://127.0.0.1:18437';
const debug=process.argv[3]||'http://127.0.0.1:18438';
const out=path.resolve('test-artifacts');await fs.mkdir(out,{recursive:true});
const {send,js,delay,wait,assert,click,mouse,key,pin,screenshot,errors,close}=await connectBrowser(debug,out);
const routingFixture={version:2,level:'sandbox',inputs:[1],circuit:{nodes:[
   {id:1,kind:'INPUT',width:1,x:0,y:144},{id:100,kind:'NAND',width:1,x:432,y:144},
   {id:50,kind:'OUTPUT',width:1,x:864,y:144},{id:101,kind:'NOT',width:1,x:216,y:432}
 ],wires:[{from:1,output:0,to:100,input:0},{from:1,output:0,to:100,input:1},{from:100,output:0,to:50,input:0}]}};
const storage='signal-garden-v2';
async function flowMotion(moving,label) {
 await delay(60);
 await assert(`new Promise(resolve=>{const positions=()=>JSON.stringify([...document.querySelectorAll('.flow-dot')].map(e=>getComputedStyle(e).transform)),before=positions();setTimeout(()=>resolve((positions()!==before)===${moving}),100)})`,label);
}
const saved=(id=1)=>`JSON.parse(localStorage.getItem('${storage}:circuit:${id}'))`;
async function choose(id,chapter){
 await click('#journey-nav');
 if(await js(`document.querySelector('[data-level="${id}"]').getClientRects().length===0`))await click(`[data-chapter="${chapter}"]`);
 await click(`[data-level="${id}"]`);
}
async function example(){await click('#example-button');await click('#load-example');await wait("document.querySelector('.preview-banner')");}
async function reload(ready){await js('window.__oldDocument=true');await send('Page.reload');await wait(`!window.__oldDocument && (${ready})`);}
async function turnPage(selector){await click(selector);await wait("!document.getElementById('modal').dataset.turning");}
try {
 await send('Page.enable');await send('Runtime.enable');
 await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url});await wait("document.querySelector('[data-node]')");
 if(process.argv.includes('--editor')) {
   const setup=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(routingFixture))});localStorage.setItem('signal-garden-v2:last','\"sandbox\"');localStorage.setItem('signal-garden-v2:welcome','true');`});
   await reload("document.querySelector('[data-shape^=NAND]') && document.body.classList.contains('free-play')");
   await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.identifier});
   await editorChecks({send,js,wait,assert,click,mouse,key,screenshot});
 } else if(process.argv.includes('--feedback')) {
   await feedbackChecks({send,js,wait,assert,click,key,screenshot});
 } else if(process.argv.includes('--release')) {
   await releaseChecks({send,js,wait,assert,click});
   await assert(`${JSON.stringify(errors)}.length===0`,'No browser runtime errors during release checks');
 } else if(process.argv.includes('--rewire')) {
   await rewireChecks({send,js,wait,assert,click,key,screenshot});
   await assert(`${JSON.stringify(errors)}.length===0`,'No browser runtime errors during wire rerouting');
 } else if(process.argv.includes('--preview')){
   await delay(300);await screenshot('v2-preview.png');console.log(await js("({title:document.title,status:document.getElementById('status-message').textContent,area:(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return {w:r.width,h:r.height,share:r.width*r.height/(innerWidth*innerHeight)}})()})"));
 } else {
 const reset=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();localStorage.setItem('signal-garden-v1:progress',JSON.stringify({completed:{5:{parts:3}}}));window.__freshGarden=true;`});
 await send('Page.reload');await wait("window.__freshGarden && document.querySelector('[data-node]')");
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:reset.identifier});
 await wait("document.querySelector('dialog[data-kind=handbook]')?.open");
 await assert("document.querySelector('.book-index strong').textContent==='How to play' && document.getElementById('modal-content').textContent.includes('Build a computer, one discovery at a time')",'First launch opens How to play in the lab handbook');
 await assert("document.getElementById('book-spread').textContent.includes('Place and connect') && document.getElementById('book-spread').textContent.includes('Esc or right-click')",'The first pages explain building, wiring, and cancellation');
 await screenshot('00-how-to-play.png');await click('#close-guide');
 await assert("JSON.parse(localStorage.getItem('signal-garden-v2:welcome'))===true",'Closing the handbook remembers that the introduction was shown');
 await reload("document.querySelector('[data-node]')");
 await assert("!document.getElementById('modal').open",'Returning players go straight to their circuit');
 await assert("JSON.parse(localStorage.getItem('signal-garden-v2:progress')).completed['7']",'Old progress follows the reordered journey');
 await assert("localStorage.getItem('signal-garden-v1:progress')!==null",'Original saved data is retained');
 await assert("!document.body.textContent.match(/nMOS|pull-down|voltage/i)",'First discovery needs no electronics vocabulary');
 await assert("document.querySelectorAll('[data-part]').length===0",'First discovery needs just one connection');
 await assert("document.title.includes('CircuIT Lab') && document.querySelector('.brand').textContent==='CircuIT Lab'",'CircuIT Lab branding retains saved progress');
 await assert("document.querySelector('.task-actions').contains(document.getElementById('check-button')) && document.getElementById('check-button').getBoundingClientRect().top>=document.getElementById('inspector').getBoundingClientRect().bottom",'Check circuit stays below the instruction book');
 await assert("document.querySelector('[data-previous]').disabled && document.querySelector('[data-forward]').textContent.includes('Skip')",'An unfinished first experiment offers Skip, not Next');
 await assert("(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return r.width*r.height/(innerWidth*innerHeight)>.48})()",'Board keeps more than 48% of the desktop viewport');
 await assert("document.querySelectorAll('[data-path]').length===6 && !document.querySelector('.task-steps') && !document.getElementById('learn-panel').textContent.includes('HOW TO DO IT')",'The task keeps its mission without repeated playing instructions');
 await assert("document.querySelector('.task-build strong').textContent==='Signal link'",'The task names the block being built using the engine catalog');
 await assert("document.querySelectorAll('.path-arrow').length===5 && document.querySelector('[data-forward]')",'The learning path has arrows and a direct next step');
 await assert("document.querySelector('.parts-tray').getBoundingClientRect().right<=document.getElementById('canvas').getBoundingClientRect().left+1",'Building blocks are beside the board on the left');
 await assert("document.querySelector('[data-pin=\"1:0:1\"]').classList.contains('guided')",'First instruction points to the sending dot');
 await assert("!!document.querySelector('[data-node=\"50\"].lamp .bulb-glass')",'The Light output is a recognizable bulb');
 await delay(200);await screenshot('01-first-lesson.png');
 await assert("document.getElementById('inspector').contains(document.getElementById('lesson-title')) && !document.querySelector('.lab-notes') && document.querySelectorAll('.task-expectation tbody tr').length===2",'Task title and expected outputs are visible in the task book, without lab notes');
 await assert("document.getElementById('inspector').getBoundingClientRect().width>=310 && document.querySelector('#nodes .node-footprint').getBoundingClientRect().width<135",'The compact task panel keeps readable workbench parts');
 await assert("!document.getElementById('learning-path').querySelector('h1,[data-forward],[data-previous]')",'The learning path contains only the path');
 await assert("!document.getElementById('help-footer') && !document.getElementById('coach') && !document.getElementById('canvas-tip')",'Task and workbench omit redundant help panels');
 await assert("document.querySelector('.zoom-controls').contains(document.getElementById('arrange-button')) && document.getElementById('arrange-button').textContent.includes('Tidy circuit')",'Tidy circuit has a visible name beside zoom');
 await assert("document.getElementById('learning-path').hidden && !document.getElementById('path-toggle').checked",'The chapter path is hidden by default');
 await assert("(()=>{const n=document.querySelector('[data-node=\"1\"]'),label=n.querySelector('.terminal-name'),r=label.getBoundingClientRect(),b=n.querySelector('.terminal-body').getBoundingClientRect(),v=n.querySelector('.input-control').getBoundingClientRect();return parseFloat(getComputedStyle(label).fontSize)>=20&&r.top>b.top&&r.bottom<v.top&&Math.abs(r.y+r.height/2-(b.top+v.top)/2)<1&&Math.abs(r.x+r.width/2-v.x-v.width/2)<1})()",'Input names are centered inside the gap above the value box');
 await assert("document.getElementById('sandbox-nav').textContent.includes('Free play mode') && document.getElementById('sandbox-nav').classList.contains('free-mode-button') && document.getElementById('clear-button').getAttribute('aria-label')==='Reset experiment'",'Free play mode stands out, and lessons use Reset');
 await click('#journey-nav');await click('#path-toggle');await click('#close-journey');
 await assert("!document.getElementById('learning-path').hidden",'The journey map can make the chapter path visible');
 await reload("document.querySelector('[data-node]')");
 await assert("!document.getElementById('learning-path').hidden",'The chapter path preference survives reload');
 await click('#hide-path');
 await assert("document.getElementById('learning-path').hidden && !JSON.parse(localStorage.getItem('signal-garden-v2:path-visible'))",'The visible chapter path can be hidden directly');
 await pin(1,0,1);await assert("!document.getElementById('gesture-tools').hidden",'Starting a wire displays cancellation controls');await click('#cancel-gesture');
 await assert("!document.querySelector('.wire-preview') && !document.querySelector('[data-wire]')",'The Cancel button abandons a wire without changing the circuit');
 const blankPoint=await js("(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return {x:r.left+70,y:r.top+r.height*.7}})()");
 await pin(1,0,1);await mouse(blankPoint);await assert("!document.querySelector('.wire-preview')",'Clicking empty board cancels a wire');
 const sourcePoint=await js("(()=>{const r=document.querySelector('[data-pin=\"1:0:1\"] .pin-dot').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 for(const cancel of ['release','escape','right']) {
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...sourcePoint,button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',...blankPoint,button:'left',buttons:1});
   if(cancel==='escape')await key('Escape');
   if(cancel==='right'){await send('Input.dispatchMouseEvent',{type:'mousePressed',...blankPoint,button:'right',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...blankPoint,button:'right',clickCount:1});}
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...blankPoint,button:'left',clickCount:1});
   await assert("!document.querySelector('.wire-preview') && !document.querySelector('[data-wire]')",`Dragged wire cancels with ${cancel}`);
 }
 // Drag one wire, then immediately play with its value.
 const points=await js(`['1:0:1','50:0:0'].map(v=>{const r=document.querySelector('[data-pin="'+v+'"] .pin-dot').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...points[0],button:'left',clickCount:1});
 await assert("document.querySelector('[data-pin=\"50:0:0\"]').classList.contains('guided')",'Next instruction points to the receiving dot');
 const magneticEnd={x:points[1].x+10,y:points[1].y+4};
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',...magneticEnd,button:'left',buttons:1});
 await wait("document.querySelector('[data-pin=\"50:0:0\"].snap-target')");
 await assert("(()=>{const w=document.querySelector('.wire-preview'),p=w.getPointAtLength(w.getTotalLength()),pin=document.querySelector('[data-pin=\"50:0:0\"] .pin-dot'),n=pin.closest('[data-node]').transform.baseVal.consolidate().matrix;return Math.hypot(p.x-pin.cx.baseVal.value-n.e,p.y-pin.cy.baseVal.value-n.f)<.1})()",'Wire preview snaps to the actual bottom connector');
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...magneticEnd,button:'left',clickCount:1});
 await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='0'");
 await wait(`${saved()}.circuit.wires.length===1`);
 await flowMotion(false,'Zero wires stay still');
 await assert("document.getElementById('signal-flow').getAnimations({subtree:true}).length===0",'Zero wires create no animations');
 await js("window.__offGlass=getComputedStyle(document.querySelector('.bulb-glass')).fill");
 await assert("document.querySelector('[data-toggle=\"1\"]').classList.contains('guided')",'The input is highlighted to invite trying both values');
 await js(`window.__latencies=[];window.__lastValue=document.querySelector('[data-node="50"] .terminal-value').textContent;
 document.getElementById('canvas').addEventListener('pointerdown',e=>{if(e.target.closest('[data-toggle]'))window.__clickTime=performance.now()},true);
 new MutationObserver(()=>{const value=document.querySelector('[data-node="50"] .terminal-value').textContent;if(value!==window.__lastValue){if(window.__clickTime)window.__latencies.push(performance.now()-window.__clickTime);window.__lastValue=value;window.__clickTime=0}}).observe(document.querySelector('[data-node="50"] .terminal-value'),{childList:true});
 window.__node=document.querySelector('[data-node="1"]');window.__wire=document.querySelector('[data-wire="0"]');`);
 for(let i=0;i<9;i++){await click('[data-toggle="1"] rect');await wait(`document.querySelector('[data-node="50"] .terminal-value').textContent==='${i%2===0?1:0}'`);}
 await assert("window.__node===document.querySelector('[data-node=\"1\"]') && window.__wire===document.querySelector('[data-wire=\"0\"]')",'Changing a signal preserves SVG elements');
 const latencies=await js('window.__latencies');
 console.log('Input-to-output timings (ms):',latencies.map(n=>Math.round(n)));
 if(latencies.length!==9)throw Error('Missing input timing samples');
 if([...latencies].sort((a,b)=>a-b)[4]>80)throw Error('Median input latency still exceeds the former artificial delay');
 await flowMotion(true,'Only a wire carrying 1 shows flow');
 await assert("getComputedStyle(document.querySelector('.bulb-glass')).fill!==window.__offGlass && document.querySelector('.lamp').dataset.value==='1'",'The bulb lights up from the engine output');
 await assert("document.getElementById('check-button').classList.contains('suggested')",'The final instruction points to Check circuit');
 await click('#flow-button');await flowMotion(false,'Signal motion can be paused');await click('#flow-button');
 await screenshot('02-live-circuit.png');
 await click('#guide-button');await assert("document.querySelectorAll('.book-page').length===2",'Help opens as a two-page lab handbook');
 await assert("document.querySelector('#guide-next svg path') && document.querySelector('#guide-next span').textContent==='Gates & numbers'",'Handbook page arrows name the neighbouring pages');
 await click('.book-page h2');await assert("document.getElementById('guide-previous').disabled",'Clicking the page content does not turn pages');
 await screenshot('09-handbook.png');
 await click('#guide-next');
 await assert("document.getElementById('modal').dataset.turning==='true' && document.getElementById('book-spread').getAnimations({subtree:true}).some(a=>a.playState==='running')",'Handbook pages physically rotate when turning');
 await wait("!document.getElementById('modal').dataset.turning");
 await assert("document.querySelector('.book-page').textContent.includes('Small rules') && document.querySelector('.binary-example')",'Handbook turns to gates and binary LEDs');
 await turnPage('#guide-next');await assert("document.getElementById('guide-next').disabled && document.querySelector('.book-page').textContent.includes('Remember')",'The last handbook spread explains memory and tools');
 await turnPage('#guide-previous');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await turnPage('#guide-previous');
 await assert("document.getElementById('modal').getAnimations({subtree:true}).length===0",'Reduced motion changes handbook pages immediately');
 await send('Emulation.setEmulatedMedia',{features:[]});
 await assert("document.getElementById('guide-previous').disabled",'Curved page arrows return to the first spread');
 await click('#guide-next');await click('#close-guide');await delay(400);
 await assert("!document.getElementById('modal').open && !document.getElementById('modal').dataset.turning",'Closing during a page turn cancels it without reopening the handbook');
 await click('#guide-button');await assert("document.getElementById('modal').open",'The header handbook button stays available');await click('#close-guide');
 // Let Chrome update hit testing after removing the modal's top layer.
 await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await flowMotion(true,'Flow resumes after returning from the handbook');
 await assert("document.querySelectorAll('[data-wire]').length===1",'Reopening How to play preserves the current circuit');
 await assert("document.querySelectorAll('#nodes .node-footprint').length===document.querySelectorAll('#nodes .node').length && [...document.querySelectorAll('#nodes .node-footprint')].every(e=>e.width.baseVal.value===144&&e.height.baseVal.value===144)",'All blocks share one footprint');
 await assert("(()=>{const p=document.querySelector('[data-pin=\"50:0:0\"] .pin-dot');return p.cx.baseVal.value===72&&p.cy.baseVal.value===144})()",'The bulb connects at the center of its base');
 // One-pixel pointer steps must remain one-pixel movement before release.
 const smoothStart=await js("(()=>{const r=document.querySelector('[data-node=\"50\"] .node-footprint').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...smoothStart,button:'left',clickCount:1});
 await assert("document.querySelector('[data-node=\"50\"]').classList.contains('selected')",'The drag starts on the bulb');
 const positions=[];
 for(let i=0;i<6;i++) {
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:smoothStart.x+8+i,y:smoothStart.y,button:'left',buttons:1});
   await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   positions.push(await js("document.querySelector('[data-node=\"50\"]').getBoundingClientRect().x"));
 }
 if(!positions.slice(1).every((x,i)=>Math.abs(x-positions[i]-1)<.05))throw Error(`Dragging still jumps between grid positions: ${positions.join(', ')}`);
 console.log('PASS Dragging follows one-pixel movements smoothly');
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:smoothStart.x+13,y:smoothStart.y,button:'left',clickCount:1});
 await wait(`${saved()}.circuit.nodes.find(n=>n.id===50).x%12===0`);await click('#undo-button');
 // Reversing the vertical relationship must preserve path endpoints and nodes.
 const dragPoints=await js(`(()=>{const r=document.querySelector('[data-node="50"] rect').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await js("window.__outputNode=document.querySelector('[data-node=\"50\"]');window.__rebuilds=0;window.__dragObserver=new MutationObserver(m=>window.__rebuilds+=m.length);window.__dragObserver.observe(document.getElementById('nodes'),{childList:true});");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...dragPoints,button:'left',clickCount:1});
 for(let i=1;i<=24;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dragPoints.x-i*12,y:dragPoints.y+Math.sin(i/4)*105,button:'left',buttons:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:dragPoints.x-288,y:dragPoints.y+Math.sin(6)*105,button:'left',clickCount:1});
 await assert("window.__outputNode===document.querySelector('[data-node=\"50\"]') && window.__rebuilds===0",'Dragging never rebuilds the board');
 await assert(`(()=>{const wire=document.querySelector('.wire'),start=wire.getPointAtLength(0),end=wire.getPointAtLength(wire.getTotalLength());const p=(id)=>{const e=document.querySelector('[data-pin="'+id+'"] .pin-dot'),n=e.closest('[data-node]').transform.baseVal.consolidate().matrix;return {x:e.cx.baseVal.value+n.e,y:e.cy.baseVal.value+n.f}};const a=p('1:0:1'),b=p('50:0:0');return Math.hypot(a.x-start.x,a.y-start.y)<.1&&Math.hypot(b.x-end.x,b.y-end.y)<.1})()`,'Routed wire stays attached at both ends after dragging');
 await click('#undo-button');
 await js("document.querySelector('[data-wire=\"0\"]').focus()");await key('Enter');await key('Delete');
 await wait(`${saved()}.circuit.wires.length===0`);await click('#undo-button');await wait(`${saved()}.circuit.wires.length===1`);
 console.log('PASS Delete and undo restore the connection');
 const wireMiddle=await js("(()=>{const w=document.querySelector('.wire'),p=w.getPointAtLength(w.getTotalLength()/2),s=new DOMPoint(p.x,p.y).matrixTransform(w.getScreenCTM());return {x:s.x,y:s.y}})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...wireMiddle,button:'right',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...wireMiddle,button:'right',clickCount:1});
 await wait(`${saved()}.circuit.wires.length===0`);await click('#undo-button');await wait(`${saved()}.circuit.wires.length===1`);
 console.log('PASS Right-click removes a wire and Undo restores it');
 await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:out});
 const exported=path.join(out,'circuit-1.json');await fs.rm(exported,{force:true});await click('#export-button');
 for(let i=0;i<50;i++){try{await fs.access(exported);break;}catch{await delay(100);}}
 const exportedData=JSON.parse(await fs.readFile(exported,'utf8'));
 if(exportedData.version!==2||exportedData.circuit.wires.length!==1)throw Error('Export lost circuit data');
 await click('#clear-button');await click('#confirm-clear');
 const dom=await send('DOM.getDocument'),file=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#import-file'});
 await send('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[exported]});await wait(`${saved()}.circuit.wires.length===1`);
 console.log('PASS Export/import round trip');
 await click('#check-button');await wait("document.getElementById('modal').open");
 await assert("document.getElementById('modal-content').textContent.includes('You made it work')",'First lesson is solvable');
 await screenshot('03-completion.png');await click('#next-lesson');
 await wait("document.querySelector('[data-part=HIGH]')");
 await click('[data-previous]');await wait("document.getElementById('lesson-number').textContent.includes('01')");
 await assert("document.querySelectorAll('[data-wire]').length===1 && document.querySelector('[data-forward]').textContent.includes('Next') && document.querySelector('.lesson-complete-badge')",'Previous reopens the completed circuit and Next remains unlocked');
 await click('[data-forward]');await wait("document.querySelector('[data-part=HIGH]')");
 await assert("!document.body.textContent.match(/nMOS|pull-down|voltage/i)",'Constant lesson stays about 0 and 1');
 await pin(100,0,1);await pin(50,0,0);await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='1'");
 await click('[data-forward]');await wait("document.querySelector('dialog[data-kind=skip]').open");
 const encouragement=await js("document.querySelector('.skip-message').textContent");
 await click('#keep-trying');await assert("document.getElementById('lesson-number').textContent.includes('02')",'Keep trying stays on the experiment');
 await click('[data-forward]');await assert(`document.querySelector('.skip-message').textContent!==${JSON.stringify(encouragement)}`,'Skip confirmations rotate encouragement');
 await click('#skip-hint');await assert("document.querySelectorAll('.hint').length===1 && !document.getElementById('modal').open",'Skip confirmation can reveal a hint instead');
 await click('[data-forward]');await click('#confirm-skip');await wait("document.getElementById('lesson-number').textContent.includes('03')");
 await assert("!JSON.parse(localStorage.getItem('signal-garden-v2:progress')).completed['2']",'Skipping keeps the experiment unfinished');
 await click('[data-previous]');await wait("document.getElementById('lesson-number').textContent.includes('02')");
 await assert("document.querySelectorAll('[data-wire]').length===1 && document.querySelector('[data-forward]').textContent.includes('Skip')",'Returning after skipping restores the circuit without unlocking Next');
 await click('#check-button');await wait("document.getElementById('modal').open");await click('#next-lesson');
 await wait("document.querySelector('[data-part=GATE]')");
 await pin(1,0,1);await pin(100,0,0);await pin(2,0,1);await pin(100,1,0);await pin(100,0,1);await pin(50,0,0);
 await click('[data-toggle="1"] rect');await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='0'");
 await wait("document.querySelector('.wire.high')",'The engine has applied the changed data input');
 await assert("document.querySelectorAll('.wire.high').length===1 && document.querySelectorAll('.wire.low').length===2",'A stopped railway switch has flow only on its active incoming wire');
 await assert("document.querySelector('.switch-node').dataset.contact==='0' && document.querySelector('.contact-caption').textContent.includes('Gap')",'The normal switch shows an open bridge at EN=0');
 await click('[data-toggle="2"] rect');await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='1'");
 await assert("[...document.querySelectorAll('.switch-inside .node-pin-label')].map(e=>e.textContent).join(',')==='D,EN' && document.querySelector('.switch-rule').textContent.includes('EN')",'Switches use standard data and enable names');
 await assert("document.querySelector('.switch-node').dataset.contact==='1'",'The normal bridge closes at EN=1');
 await assert("getComputedStyle(document.querySelector('.switch-inside')).display!=='none'",'Switch contacts are always visible');
 await screenshot('04-railway.png');
 await pin(100,0,1);await pin(100,0,0);await wait("document.getElementById('status-message').textContent.includes('feedback loop')");
 await assert("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='?'",'Invalid feedback clears old values');
 await click('#undo-button');await click('#check-button');await wait("document.getElementById('modal').open");await click('#next-lesson');
 await click('#hint-button');await assert("document.querySelectorAll('.hint').length===1",'Hints reveal one nudge at a time');
 await example();await click('#undo-button');await assert("!document.querySelector('.preview-banner')",'Undo leaves example mode');
 await click('#redo-button');await click('#check-button');await wait("document.querySelector('.test-badge.success')");
 await assert("!JSON.parse(localStorage.getItem('signal-garden-v2:progress')).completed['6']",'Examples do not claim a completed discovery');
 await delay(250);await reload("document.querySelector('.preview-banner')");
 await assert("document.querySelectorAll('[data-wire]').length===5",'NAND circuit survives reload with its stable lesson ID');
 await wait("document.querySelector('[data-shape^=CLOSED_GATE]').dataset.contact==='1'");
 await assert("document.querySelector('[data-shape^=CLOSED_GATE]').dataset.contact==='1'",'The reverse bridge closes at EN=0');
 await click('[data-toggle="1"] rect');await click('[data-toggle="2"] rect');await wait("document.querySelector('[data-shape^=CLOSED_GATE]').dataset.contact==='0'");
 console.log('PASS Reverse switch opens at EN=1');
 await assert("document.getElementById('lesson-number').textContent.includes('04') && document.getElementById('lesson-title').textContent.includes('universal')",'NAND comes first while keeping its saved lesson ID');
 await choose(7,1);await assert("document.querySelector('.task-build strong').textContent==='OR gate'",'The OR task explicitly names the gate after describing its behavior');
 await choose(5,1);
 await assert("document.getElementById('lesson-number').textContent.includes('06')",'AND follows NAND and NOT in the journey');
 await click('[data-part=NAND]');await click('[data-part=NAND]');await click('[data-part=NOT]');await click('#arrange-button');
 await pin(1,0,1);await pin(100,0,0);await pin(2,0,1);await pin(100,1,0);await pin(100,0,1);await pin(101,0,0);await pin(100,0,1);await pin(101,1,0);await pin(101,0,1);await pin(50,0,0);
 await assert("[...document.querySelectorAll('.task-expectation .expected')].map(e=>e.textContent).join('')==='0001'",'AND task shows its complete expected truth table');
 await click('#check-button');await wait("document.getElementById('modal').open");
 await assert("document.getElementById('modal-content').textContent.includes('You made it work')",'AND made with two NANDs passes, even with an unused unwired NOT');
 await click('#stay-button');await screenshot('14-and-from-nand.png');
 await click('[data-previous]');await assert("document.getElementById('lesson-number').textContent.includes('05') && !!document.querySelector('[data-part=NAND]')",'Previous follows journey order to the NOT experiment');
 await click('[data-part=NAND]');await click('#arrange-button');
 await pin(1,0,1);await pin(100,0,0);await pin(1,0,1);await pin(100,1,0);await pin(100,0,1);await pin(50,0,0);
 await click('#check-button');await wait("document.getElementById('modal').open");await assert("document.getElementById('modal-content').textContent.includes('You made it work')",'NOT built from NAND passes through the browser');await click('#stay-button');

 await choose(14,2);await example();
 await assert("document.querySelector('.task-expectation h2').textContent==='Expected numbers' && document.querySelector('[data-inputs=\"[10,12]\"] .expected').textContent==='8'",'Bus expectations include mixed inputs with decimal results');
 await click('[data-inputs="[10,12]"]');await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='8'");
 await click('[data-all-cases]');await assert("document.querySelectorAll('#test-panel tbody tr').length===16 && document.querySelector('.test-note').textContent.includes('256')",'Every bus case is available through a paginated table');
 await click('[data-test-page="1"]');await assert("document.querySelector('.table-paging span').textContent==='2 / 16'",'Expected case pages are navigable');
 await pin(1,0,1);await pin(50,0,0);await click('#check-button');await wait("document.querySelector('.test-badge.failure')");
 await assert("document.querySelector('.table-paging span').textContent==='2 / 16' && document.querySelector('#test-panel [data-inputs=\"[1,0]\"]').classList.contains('failed')",'A failed bus check opens the page containing its first mismatch');
 await click('#learn-tab');await click('[data-all-cases]');
 await assert("document.querySelector('.table-paging span').textContent==='1 / 16'",'All expected cases remain available after checking a circuit');
 await choose(15,2);
 await assert("document.getElementById('learn-panel').scrollTop===0",'Changing experiments opens the task at its mission');
 await assert("[...document.querySelector('[data-inputs=\"[15,1,0]\"]').querySelectorAll('.expected')].map(e=>e.textContent).join(',')==='0,1'",'Adder examples explicitly show the wrapped sum and carry');
 await screenshot('15-number-expectations.png');
 await choose(20,4);await example();
 await assert("[...document.querySelectorAll('.task-expectation .expected')].map(e=>e.textContent).join(',')==='0,7,7,7,3,3' && !document.querySelector('.task-expectation [data-inputs]')",'Memory expectations show consecutive capture and hold steps');
 await click('[data-toggle="1"] rect');await js("document.getElementById('bus-value').value='9'");await click('#bus-form button');await click('[data-toggle="2"] rect');
 await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='0'");
 await click('#tick-button');await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='9'");
 await assert("document.getElementById('tick-count').textContent==='Step 1'",'Clocked memory still captures together');
 await assert("[...document.querySelectorAll('[data-node=\"50\"] .bit-led')].map(e=>e.dataset.value).join('')==='1001' && [...document.querySelectorAll('[data-node=\"50\"] .led-value')].map(e=>e.textContent).join('')==='1001'",'Four-bit outputs show binary as four square LEDs with readable digits');
 await js("document.querySelector('.module-node').focus()");await key('Enter');await key('ArrowDown');
 const registerPosition=await js("document.querySelector('.module-node').getAttribute('transform')");
 await click('#arrange-button');await assert("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='9' && document.getElementById('tick-count').textContent==='Step 1'",'Arranging an existing circuit preserves memory');
 await click('#undo-button');
 await assert(`document.querySelector('.module-node').getAttribute('transform')===${JSON.stringify(registerPosition)} && document.querySelector('[data-node="50"] .terminal-value').textContent==='9' && document.getElementById('tick-count').textContent==='Step 1'`,'Undoing Tidy restores the layout while preserving captured memory');
 await click('#redo-button');
 await assert("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='9'",'Redoing Tidy preserves captured memory');
 await screenshot('05-register.png');await click('#reset-clock');await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='0'");
 await click('#check-button');await wait("document.querySelector('.test-badge.success')");
 await click('#task-toggle');await assert("document.querySelector('.workbench').getBoundingClientRect().width>innerWidth-40 && document.getElementById('inspector').hidden",'Hide task gives the workbench the full width');
 await assert("document.getElementById('task-toggle').textContent.includes('Show task') && document.getElementById('check-button').getClientRects().length && !document.getElementById('focus-button') && !document.getElementById('learn-toggle')",'One visible toggle replaces Focus and Task while Check stays available');
 await click('#check-button');await wait("!document.getElementById('inspector').hidden && document.querySelector('.test-badge.success')");
 await assert("document.getElementById('task-toggle').getAttribute('aria-expanded')==='true'",'Checking while the task is hidden opens the results');
 await click('#task-toggle');await click('#task-toggle');
 await assert("!document.getElementById('inspector').hidden",'Show task restores the same panel');
 await click('#sandbox-nav');await assert("!document.querySelector('[data-part=NMOS]')",'Free play keeps transistor details optional');
 await click('#inside-toggle');await assert("!!document.querySelector('[data-part=NMOS]')",'The underlying transistor parts remain available');
 await click('[data-part="INPUT"][data-width="4"]');await assert("document.querySelectorAll('[data-toggle]').length===3",'Free play adds bus inputs');
 await assert("document.body.classList.contains('free-play') && document.querySelector('[data-return]')",'Free play has its own theme and a visible way back');
 // Drag from the tray without adding or simulating until release.
 const countParts=()=>js("document.querySelectorAll('#nodes .node').length");
 const partStart=async selector=>js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const destination=await js("(()=>{const r=document.getElementById('canvas').getBoundingClientRect();return {x:r.left+r.width*.62,y:r.top+r.height*.3}})()");
 const dragPart=async(end='drop')=>{
   const start=await partStart('[data-part=NOT]');
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
   for(let i=1;i<=8;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+(destination.x-start.x)*i/8,y:start.y+(destination.y-start.y)*i/8,button:'left',buttons:1});
   await wait("document.querySelector('.inventory-ghost.valid')");
   await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop}`,'Inventory preview leaves the circuit untouched');
   if(end==='escape')await key('Escape');
   if(end==='right'){await send('Input.dispatchMouseEvent',{type:'mousePressed',...destination,button:'right',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...destination,button:'right',clickCount:1});}
   const release=end==='outside'?{x:800,y:90}:destination;
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...release,button:'left',clickCount:1});
   await wait("!document.querySelector('.inventory-ghost')");
 };
 let beforeDrop=await countParts();await dragPart();
 await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop+1} && document.querySelector('.logic-gate .gate-body')`,'Dropping adds exactly one gate with a gate silhouette');
 await delay(250);
 await assert(`(()=>{const n=${saved('sandbox')}.circuit.nodes.at(-1);return n.kind==='NOT'&&n.x%12===0&&n.y%12===0})()`,'Dropped gates land on the common grid');
 await assert(`(()=>{const e=document.querySelector('#nodes .logic-gate:last-child .node-footprint'),r=e.getBoundingClientRect();return Math.abs(r.x+r.width/2-${destination.x})<16 && Math.abs(r.y+r.height/2-${destination.y})<16})()`,'Drop location accounts for the workbench camera');
 await click('#undo-button');await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop}`,'One Undo removes the dropped part');
 await dragPart('outside');await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop}`,'Dropping outside the board adds nothing');
 await dragPart('escape');await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop}`,'Escape cancels the drag without a phantom click');
 await dragPart('right');await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop}`,'Right-click cancels an inventory drag');
 await click('[data-part=NOT]');await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop+1}`,'Click-to-add still works after cancelling a drag');
 await js("document.querySelector('[data-part=NOT]').focus()");await key('Enter');
 await assert(`document.querySelectorAll('#nodes .node').length===${beforeDrop+2}`,'Keyboard Enter still adds a part from the inventory');
 await click('#fit-button');
 await screenshot('12-free-play.png');
 await delay(250);await reload("document.querySelector('[data-return]')");
 await click('[data-return]');await wait("document.getElementById('lesson-number').textContent.includes('20')");
 await assert("!document.body.classList.contains('free-play')",'Return from free play restores the remembered experiment after reload');
 await choose(1,0);await click('#journey-nav');
 await js("document.getElementById('lesson-list').scrollTop=10000");
 await assert("(()=>{const r=document.getElementById('close-journey').getBoundingClientRect();return r.top>0&&r.bottom<innerHeight&&document.getElementById('journey-sidebar').scrollTop===0})()",'Journey navigation stays visible when its lessons scroll');
 await click('#close-journey');await click('#journey-nav');await screenshot('06-journey-map.png');await click('#close-journey');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('#fit-button');await delay(200);
 await assert("document.documentElement.scrollWidth<=innerWidth",'Phone layout has no horizontal overflow');
 await assert("document.getElementById('canvas').getBoundingClientRect().height>=400",'Phone board stays large');
 await click('#guide-button');
 await assert("(()=>{const r=document.getElementById('close-guide').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()",'Phone handbook keeps its return button visible');
 await screenshot('10-mobile-handbook.png');await turnPage('#guide-next');
 await assert("document.querySelector('.binary-example') && document.getElementById('modal').scrollWidth<=document.getElementById('modal').clientWidth",'Phone handbook turns pages without horizontal overflow');
 await click('#guide-home');await assert("document.querySelector('.book-index strong').textContent==='How to play'",'The phone handbook returns to How to play');await click('#close-guide');
 await click('#task-toggle');await click('#task-toggle');await wait("(()=>{const r=document.getElementById('inspector').getBoundingClientRect();return r.top>=0&&r.top<innerHeight/3})()");
 await assert("!document.getElementById('inspector').hidden",'Phone Task button takes the player to the experiment card');
 await click('#back-to-board');await wait("scrollY<1");
 await click('#clear-button');await click('#confirm-clear');
 await assert("document.querySelector('[data-node=\"1\"] rect').getBoundingClientRect().width>85",'Fresh phone discoveries start with readable blocks');
 await pin(1,0,1);await pin(50,0,0);
 if(await js("document.querySelector('[data-node=\"1\"] .terminal-value').textContent==='0'"))await click('[data-toggle="1"] rect');
 await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='1'");
 await screenshot('07-mobile.png');
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const before=await js("document.getElementById('zoom-value').textContent");
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:370,id:1},{x:230,y:370,id:2}]});
 await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:370,id:1},{x:280,y:370,id:2}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await assert(`document.getElementById('zoom-value').textContent!==${JSON.stringify(before)}`,'Two-finger zoom still works');
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await flowMotion(false,'Reduced-motion preference disables flow animation');
 await send('Emulation.setEmulatedMedia',{features:[]});
 await choose(3,0);await click('#clear-button');await click('#confirm-clear');
 await pin(1,0,1);await pin(100,0,0);await pin(2,0,1);await pin(100,1,0);await pin(100,0,1);
 await assert("(()=>{const pin=document.querySelector('[data-pin=\"50:0:0\"] .pin-dot'),r=pin.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-pin]')===pin.parentElement})()",'Phone cancellation controls leave the destination pin reachable');
 await pin(50,0,0);
 await assert("document.querySelector('[data-node=\"1\"] rect').getBoundingClientRect().width>75",'Phone railway lesson keeps its signals readable');
 for(const id of [1,2])if(await js(`document.querySelector('[data-node="${id}"] .terminal-value').textContent==='0'`))await click(`[data-toggle="${id}"] rect`);
 await wait("document.querySelector('[data-node=\"50\"] .terminal-value').textContent==='1'");
 await screenshot('08-mobile-railway.png');
 await choose(6,1);
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const touchStart=await partStart('[data-part=HIGH]'),touchCount=await countParts();
 const touchEnd={x:touchStart.x+190,y:touchStart.y+20};
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchStart,id:1}]});
 for(let i=1;i<=8;i++)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchStart.x+(touchEnd.x-touchStart.x)*i/8,y:touchStart.y+(touchEnd.y-touchStart.y)*i/8,id:1}]});
 await wait("document.querySelector('.inventory-ghost.valid')");
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await assert(`document.querySelectorAll('#nodes .node').length===${touchCount+1}`,'Touch can drag a block out of the inventory');
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await send('Emulation.setDeviceMetricsOverride',{width:1512,height:982,deviceScaleFactor:1,mobile:false});await click('#fit-button');
 // A deterministic circuit makes shortest-path lengths independently measurable
 // while a real pointer moves connected parts and unrelated obstacles.
 const fixtureScript=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('signal-garden-v2:circuit:sandbox',${JSON.stringify(JSON.stringify(routingFixture))});localStorage.setItem('signal-garden-v2:last','"sandbox"');`});
 await reload("document.querySelector('[data-shape^=NAND]') && document.body.classList.contains('free-play')");
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixtureScript.identifier});
 const screenPoint=async(x,y)=>js(`(()=>{const p=new DOMPoint(${x},${y}).matrixTransform(document.querySelector('.circuit-svg').getScreenCTM());return {x:p.x,y:p.y}})()`);
 const pathPoints=()=>js("document.querySelector('[data-wire=\"0\"] .wire').getAttribute('d').match(/[-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?/g).map(Number)");
 const dragStart=await screenPoint(504,216);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...dragStart,button:'left',clickCount:1});
 for(const [x,y] of [[432,180],[480,216],[360,192],[288,96],[432,144]]) {
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',...await screenPoint(x+72,y+72),button:'left',buttons:1});
   await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await assert(`Math.abs(document.querySelector('[data-wire="0"] .wire').getTotalLength()-${Math.abs(x-144)+Math.abs(y+60-216)})<.1`,'A connected gate keeps the shortest clear path while moving');
 }
 const movingPath=await pathPoints();
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...dragStart,button:'left',clickCount:1});
 await assert(`(()=>{const a=${JSON.stringify(movingPath)},b=document.querySelector('[data-wire="0"] .wire').getAttribute('d').match(/[-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?/g).map(Number);return a.length===b.length&&a.every((n,i)=>Math.abs(n-b[i])<.1)})()`,'Releasing an aligned gate does not switch routing rules');
 for(const [fromY,toY,expected] of [[432,144,436],[144,432,300]]) {
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...await screenPoint(288,fromY+72),button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',...await screenPoint(288,toY+72),button:'left',buttons:1});
   await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await assert(`Math.abs(document.querySelector('[data-wire="0"] .wire').getTotalLength()-${expected})<.1`,toY===144?'Moving an unwired block into a wire chooses the shorter clear detour':'Moving an obstacle away immediately shortens the existing wire');
   await assert("(()=>{const boxes=[...document.querySelectorAll('#nodes>.node')].map(e=>e.transform.baseVal.consolidate().matrix);return [...document.querySelectorAll('.wire')].every(w=>{for(let s=1;s<w.getTotalLength();s+=2){const p=w.getPointAtLength(s);if(boxes.some(b=>p.x>b.e+.01&&p.x<b.e+143.99&&p.y>b.f+.01&&p.y<b.f+143.99))return false;}return true;})})()",'During dragging, wires avoid every block on the board');
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...await screenPoint(288,toY+72),button:'left',clickCount:1});
   await assert(`Math.abs(document.querySelector('[data-wire="0"] .wire').getTotalLength()-${expected})<.1`,'The same shortest route remains after releasing the obstacle');
 }
 await editorChecks({send,js,wait,assert,click,mouse,key,screenshot});
 await choose(3,0);await example();
 const protectedCount=await js("document.querySelectorAll('#nodes>.node').length"),protectedWires=await js("document.querySelectorAll('.wire').length");
 await js("document.getElementById('canvas').focus()");await key('a','KeyA',4);await key('Delete');
 await assert("document.querySelectorAll('#nodes>.node').length===3 && document.querySelectorAll('.wire').length===0",'Group deletion protects required lesson inputs and outputs');
 await click('#undo-button');
 await assert(`document.querySelectorAll('#nodes>.node').length===${protectedCount} && document.querySelectorAll('.wire').length===${protectedWires}`,'One Undo restores a mixed deletion around protected lesson terminals');
 await feedbackChecks({send,js,wait,assert,click,key,screenshot});
 await rewireChecks({send,js,wait,assert,click,key,screenshot});
 await releaseChecks({send,js,wait,assert,click});
 await assert(`${JSON.stringify(errors)}.length===0`,'No browser runtime errors');
 console.log('Browser acceptance checks passed.');
 }
} catch(error) {console.log(await js("({scrollY,inspectorTop:document.getElementById('inspector')?.getBoundingClientRect().top,headingTop:document.querySelector('.task-heading')?.getBoundingClientRect().top,errors:document.querySelector('.error-state')?.textContent})"));await screenshot('failure.png');throw error;} finally {close();}
