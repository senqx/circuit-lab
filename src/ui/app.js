import { glyph, gateDrawing } from './symbols.mjs';
import { routeWire, createWireRouter } from './wire-router.mjs';
import { FlowLayer } from './flow-layer.mjs';
import { bindInventoryDrag } from './inventory-drag.mjs';
import { handbookSpreads } from './handbook.mjs';
import { BLOCK_SIZE, GRID, MAX_COORDINATE, onGrid, portPoint, snapPosition } from './board-geometry.mjs';
import { layout as arrangeCircuit } from './circuit-layout.mjs';
import { wireKey, nodeSelection, wireSelection, selectionBox, objectsInBox } from './selection.mjs';
import { engine } from './engine/client.mjs';
import { platform } from './platform.mjs';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (x) => structuredClone(x);
const icons = {
  star:'<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9Z"/>',
  chevronUp:'<path d="m6 15 6-6 6 6"/>',
  play:'<path d="m8 5 11 7-11 7Z"/>', check:'<path d="m5 12 4 4L19 6"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2-2.7 4m0 3h.01"/>',
  book:'<path d="M12 6v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  undo:'<path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12"/>', redo:'<path d="m15 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>',
  share:'<circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4m-6 8 6 4"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m-6-12 3 4-3 4"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  fit:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M8 8h8v8H8Z"/>',
  align:'<path d="M3 4v16M7 5h13v5H7zm0 9h8v5H7z"/>',
  spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  bulb:'<path d="M9 18h6m-6 3h6M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  expectation:'<path d="M9 3a6 6 0 0 0-3.7 10.7C6.5 14.6 7 15.5 7 17h4c0-1.5.5-2.4 1.7-3.3A6 6 0 0 0 9 3ZM7 20h4m-3 2h2"/><circle cx="18" cy="6" r="5" fill="currentColor" stroke="none"/><path class="expectation-question" stroke-width="1.3" d="M16.5 4.5a1.5 1.5 0 1 1 2.5 1.1c-.7.5-1 .8-1 1.4m0 2h.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  step:'<path d="m5 5 10 7L5 19Zm14 0v14"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
  leaf:'<path d="M5 19C-1 5 15 3 21 3c0 15-8 22-16 16Zm0 0L16 8"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.chip}</svg>`;
let catalog, parts, current, graph, inputs=[], memory={}, signals={}, contacts={}, lastResult=null;
let mode='journey', hints=0, ticks=0, practice=false, selected=new Set(), pending=null, drag=null, hoverPoint=null;
let history=[], future=[], revision=0, simTicket=0, queue=Promise.resolve(), checking=false;
let camera={x:0,y:0,scale:1}, lastJourney=1, progress={completed:{}}, openChapters=new Set([0]);
const STORAGE='signal-garden-v2';
let geometryDirty=true, boardFrame=0, cameraDirty=false, explored=false, showInside=false;
const DEFAULT_ZOOM=.9;
const TEST_PAGE_SIZE=16;
// Below this width, the task book would leave too little room for the workbench.
const taskSheet=matchMedia('(max-width:1000px)');
let taskOpen=true, taskAnimation=null;
let hoverWire=null,tracedWire=null,routeOrder=[];
let hoverPin=null, inventoryActive=false, testPage=0, expectedPage=0, pinch=null, spaceDown=false;
const pointers=new Map();
let showPath=readStorage('path-visible',false);
let nodeMap=new Map(), incoming=new Map(), nodeElements=new Map(), wireElements=new Map(), obstacleRects=[];
let routeBoardWire=createWireRouter();
let saveTimer, simulationScheduled=false, cancelInventoryDrag=()=>{};
const canvas=$('canvas');
const flow=new FlowLayer($('signal-flow'));
const lessonIndex=(id=current.id)=>catalog.levels.findIndex(l=>l.id===Number(id));
const lessonNumber=(id=current.id)=>lessonIndex(id)+1;
const nextLevel=()=>catalog.levels[lessonIndex()+1];
const activeKey=()=>mode==='sandbox'?'sandbox':String(current.id);
const valueText=(v)=>v===-2?'Z':v===-3?'!':v===undefined||v<0?'?':String(v);
const signalClass=(v)=>v===-2?'floating':v===-3?'conflict':v===undefined||v<0?'unknown':v===0?'low':'high';
const terminal=(n)=>n.kind==='INPUT'||n.kind==='OUTPUT';
const isLamp=(n)=>n.kind==='OUTPUT'&&n.width===1;
const sortedInputs=()=>graph.nodes.filter(n=>n.kind==='INPUT').sort((a,b)=>a.id-b.id);
const sortedOutputs=()=>graph.nodes.filter(n=>n.kind==='OUTPUT').sort((a,b)=>a.id-b.id);
function readStorage(key, fallback) { try { return JSON.parse(platform.readText(`${STORAGE}:${key}`))??fallback; } catch { return fallback; } }
function writeStorage(key,value) {
  try { platform.writeText(`${STORAGE}:${key}`,JSON.stringify(value)); $('saved-label').textContent='Saved on this device'; }
  catch { $('saved-label').textContent='Save unavailable · export to keep'; }
}
function persist() {
  writeStorage(`circuit:${activeKey()}`,{version:2,level:activeKey(),circuit:graph,inputs,practice,hints,explored});
  writeStorage('progress',progress);
  writeStorage('last',mode==='sandbox'?'sandbox':current.id);
}
function save() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(persist,180);
}
function flushSave() {clearTimeout(saveTimer);if(graph)persist();}
function toast(message,type='') {
  $('toast').textContent=message; $('toast').className=`toast ${type}`; $('toast').hidden=false;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').hidden=true,4500);
}
function status(message,error=false) { $('status-message').innerHTML=`<span class="status-dot" style="${error?'background:#cf825b':''}"></span>${esc(message)}`; }
function snap(geometryOnly=false) { return {graph:clone(graph),inputs:[...inputs],practice,geometryOnly}; }
function remember(geometryOnly=false) { history.push(snap(geometryOnly)); if(history.length>80) history.shift(); future=[]; }
function restore(s) { graph=clone(s.graph); if(!s.geometryOnly){inputs=[...s.inputs];practice=s.practice;} selected.clear(); pending=null; changed(!s.geometryOnly); renderLearn(); }
function undo() { cancelGesture();if(!history.length)return;const s=history.pop();future.push(snap(s.geometryOnly));restore(s); }
function redo() { cancelGesture();if(!future.length)return;const s=future.pop();history.push(snap(s.geometryOnly));restore(s); }
function changed(resetState=true) {
  geometryDirty=true;
  if(!resetState){save();renderBoard();return;}
  ++revision; ++simTicket; lastResult=null;
  if(resetState) { memory={}; ticks=0; signals={}; contacts={}; }
  const valid=new Set([...graph.nodes.map(n=>nodeSelection(n.id)),...graph.wires.map(wireSelection)]);
  selected=new Set([...selected].filter(key=>valid.has(key)));
  save(); renderBoard(); renderTest(); renderClock(); scheduleSimulation();
}
function portsFor(n,output) {
  if(n.kind==='INPUT') return output?[{name:'Q',width:n.width}]:[];
  if(n.kind==='OUTPUT') return [{name:output?'Q':'D',width:n.width}];
  return parts[n.kind][output?'outputs':'inputs'];
}
const size=()=>BLOCK_SIZE;
function pinPoint(n,index,output) {
  return portPoint(n,index,portsFor(n,output).length,n.kind==='OUTPUT'?'bottom':output?'right':'left');
}
function terminalName(n) {
  if(n.name)return n.name;
  if(mode==='sandbox')return `${n.kind==='INPUT'?'I':'Q'}${(n.kind==='INPUT'?sortedInputs():sortedOutputs()).findIndex(p=>p.id===n.id)+1}`;
  const spec=parts[current.target];
  return n.kind==='INPUT'?spec.inputs[n.id-1]?.name||'IN':spec.outputs[n.id-50]?.name||'OUT';
}
function pinValue(n,index,output) {
  if(output)return signals[n.id]?.[index];
  const w=incoming.get(`${n.id}:${index}`);
  return w?signals[w.from]?.[w.output]:undefined;
}
function pin(n,index,output) {
  const p=pinPoint(n,index,output), value=pinValue(n,index,output);
  const name=portsFor(n,output)[index].name;
  const isPending=pending&&pending.id===n.id&&pending.index===index&&pending.output===output;
  const label=`${terminal(n)?terminalName(n):parts[n.kind].name} ${output?'output':'input'} ${name}, ${p.side} dot, ${portsFor(n,output)[index].width} bit`;
  return `<g class="pin ${signalClass(value)} ${isPending?'pending':''}" data-pin="${n.id}:${index}:${output?1:0}" tabindex="0" role="button" aria-label="${esc(label)}"><circle class="pin-hit" cx="${p.x}" cy="${p.y}" r="13"/><circle class="pin-dot" cx="${p.x}" cy="${p.y}" r="4.5"/><title>${esc(label)} · ${valueText(value)}</title></g>`;
}
function rectangles() {
  return graph.nodes.map(n=>({id:n.id,x:n.x,y:n.y,...BLOCK_SIZE}));
}
function bulbDrawing() {
  return `<path class="bulb-lead" d="M51 85V110"/>
    <path class="bulb-rays" d="M17 9l-5-5M85 9l5-5M9 36H2M93 36h7"/>
    <path class="bulb-glass" d="M51 5C34 5 24 17 24 32c0 15 12 20 15 31h24c3-11 15-16 15-31C78 17 68 5 51 5Z"/>
    <path class="bulb-filament" d="m43 61-5-27 9 5 8-5 9 5-5 22"/>
    <path class="bulb-shine" d="M34 29c0-8 5-14 12-15"/>
    <path class="bulb-base" d="M38 64h26v14H38Zm5 14h16l-4 7h-8Z"/>
    <path class="bulb-thread" d="m38 67 26 3m-26 2 26 3"/>`;
}
function switchContact(n) {
  return contacts[n.id]??(incoming.has(`${n.id}:1`)?-1:parts[n.kind].defaultContact??-1);
}
const contactPath=contact=>contact===1?'M42 60H94':contact===0?'M42 60 80 40':'M42 60 78 49';
const contactCaption=(contact,data)=>contact===1?`Closed · passes ${valueText(data)}`:contact===0?'Open gap · Q=0':'Contact unknown';
function drawNode(original) {
  const n={...original,x:0,y:0}, {w,h}=size(n);
  const footprint=`<rect class="node-footprint" width="144" height="144" rx="6"/>`;
  if(terminal(n)) {
    const input=n.kind==='INPUT',lamp=isLamp(n);
    if(lamp)return `<g class="node lamp" data-node="${n.id}" transform="translate(${original.x} ${original.y})" tabindex="0" role="group" aria-label="Light bulb ${esc(terminalName(n))}">
      ${footprint}
      <text class="terminal-name" x="72" y="12" text-anchor="middle">${esc(terminalName(n))}</text>
      <g transform="translate(10.8 12) scale(1.2)">${bulbDrawing()}</g><text class="terminal-value bulb-value" x="129" y="35" text-anchor="middle">?</text>
      <text class="input-caption" x="138" y="136" text-anchor="end"></text>
      <text class="terminal-title output-caption" x="6" y="136">BULB</text>${pin(n,0,false)}</g>`;
    if(!input)return `<g class="node bus-output" data-node="${n.id}" transform="translate(${original.x} ${original.y})" tabindex="0" role="group" aria-label="Four-bit LED display ${esc(terminalName(n))}">
      ${footprint}<rect class="terminal-body output" x="6" y="16" width="132" height="112" rx="16"/>
      <text class="terminal-name" x="72" y="32" text-anchor="middle">${esc(terminalName(n))}</text>
      ${[3,2,1,0].map((bit,i)=>`<g class="bit-led" data-bit="${bit}" transform="translate(${12+i*31} 46)"><text class="bit-weight" x="13" y="-5" text-anchor="middle">${1<<bit}</text><rect width="26" height="26" rx="3"/><text class="led-value" x="13" y="20" text-anchor="middle">?</text></g>`).join('')}
      <text class="terminal-value" x="72" y="102" text-anchor="middle">?</text><text class="input-caption" x="72" y="119" text-anchor="middle"></text>
      <path class="output-lead" d="M72 128V144"/><text class="terminal-title output-caption" x="8" y="141">4-BIT</text>${pin(n,0,false)}</g>`;
    return `<g class="node input-node" data-node="${n.id}" transform="translate(${original.x} ${original.y})" tabindex="0" role="group" aria-label="Input ${esc(terminalName(n))}">
      <g data-toggle="${n.id}" tabindex="0" role="button" aria-label="Change ${esc(terminalName(n))}" class="input-toggle">
      ${footprint}<path class="terminal-body" d="M10 16H111L138 72 111 128H10Q4 128 4 122V22Q4 16 10 16Z"/>
      <rect class="input-control" x="23" y="43" width="75" height="54" rx="6"/>
      <text class="terminal-value" x="60" y="78" text-anchor="middle">?</text>
      <text class="input-caption" x="60" y="113" text-anchor="middle"></text></g>
      <path class="input-lead" d="M138 72H144"/><text class="terminal-name" x="60.5" y="29.5" text-anchor="middle" dominant-baseline="central">${esc(terminalName(n))}</text>
      <text class="terminal-title" x="60" y="143" text-anchor="middle">${n.width===4?'4-BIT INPUT':'INPUT'}</text>${pin(n,0,true)}</g>`;
  }
  const spec=parts[n.kind],gate=['GATE','CLOSED_GATE'].includes(n.kind);
  if(gate) {
    const contact=switchContact(n);
    return `<g class="node switch-node" data-node="${n.id}" data-contact="${contact}" transform="translate(${original.x} ${original.y})" tabindex="0" role="group" aria-label="${esc(spec.name)}. EN enables the data path from D to Q.">
    ${footprint}<rect class="node-body" width="${w}" height="${h}" rx="5"/>
    <text class="switch-rule" x="72" y="20" text-anchor="middle">${n.kind==='GATE'?'EN=1 CONNECTS':'EN=0 CONNECTS'}</text>
    <g class="switch-inside"><path class="inside-source" d="M0 60H42"/><path class="inside-output" d="M94 60H114V72H144"/>
      <path class="inside-control" d="M0 84H64V72m-3 4 3-4 3 4"/>
      <path class="inside-contact" d="${contactPath(contact)}"/><circle class="contact-dot" cx="42" cy="60" r="3"/><circle class="contact-dot" cx="94" cy="60" r="3"/>
      <text class="node-pin-label" x="8" y="52">D</text><text class="node-pin-label" x="8" y="99">EN</text><text class="contact-caption" x="72" y="106" text-anchor="middle">${contactCaption(contact,pinValue(n,0,false))}</text><text class="enable-caption" x="72" y="119" text-anchor="middle">${incoming.has(`${n.id}:1`)?'Reading EN…':'EN ? · defaults to 0'}</text>
    </g>
    <text class="node-subtitle" x="72" y="131" text-anchor="middle">${esc(spec.name)}</text>${spec.inputs.map((_,i)=>pin(n,i,false)).join('')}${pin(n,0,true)}</g>`;
  }
  const shape=gateDrawing(n.kind);
  if(shape)return `<g class="node logic-gate" data-node="${n.id}" transform="translate(${original.x} ${original.y})" tabindex="0" role="group" aria-label="${esc(spec.name)}. Drag or use arrow keys to move.">
    ${footprint}${shape}<text class="node-subtitle" x="72" y="136" text-anchor="middle">${esc(spec.name)}</text>
    ${spec.inputs.map((p,i)=>{const pt=pinPoint(n,i,false);return `<text class="node-pin-label" x="8" y="${pt.y-8}">${esc(p.name)}</text>`}).join('')}
    ${spec.inputs.map((_,i)=>pin(n,i,false)).join('')}${spec.outputs.map((_,i)=>pin(n,i,true)).join('')}</g>`;
  const constant=n.kind==='HIGH'||n.kind==='LOW';
  const g=constant?null:glyph(n.kind);
  return `<g class="node ${constant?'constant-node':'module-node'}" data-node="${n.id}" transform="translate(${original.x} ${original.y})" tabindex="0" role="group" aria-label="${esc(spec.name)}. Drag or use arrow keys to move.">
    ${footprint}${constant?'<path class="node-body" d="M20 24H114L138 72 114 120H20Z"/><path class="input-lead" d="M138 72H144"/>':`<rect class="node-body" width="${w}" height="${h}" rx="8"/>`}
    ${constant?'':'<rect class="node-type-bar" x="14" y="10" width="21" height="2" rx="1"/>'}
    ${g?`<svg class="node-symbol" x="${w/2-22}" y="${h/2-14}" width="44" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${g.replace(/<svg[^>]*>|<\/svg>/g,'')}</svg>`:`<text class="node-title ${constant?'constant-value':''}" x="${w/2}" y="${h/2+7}" text-anchor="middle">${esc(spec.symbol)}</text>`}
    ${spec.inputs.map((p,i)=>{const pt=pinPoint(n,i,false);return `<text class="node-pin-label" x="11" y="${pt.y+3}">${esc(p.name)}</text>`}).join('')}
    ${spec.outputs.map((p,i)=>{const pt=pinPoint(n,i,true);return `<text class="node-pin-label" x="${w-11}" y="${pt.y+3}" text-anchor="end">${esc(p.name)}</text>`}).join('')}
    <text class="node-subtitle" x="${w/2}" y="${h-4}" text-anchor="middle">${esc(spec.name)}</text>
    ${spec.inputs.map((_,i)=>pin(n,i,false)).join('')}${spec.outputs.map((_,i)=>pin(n,i,true)).join('')}</g>`;
}
function setClass(el,value) {if(el.getAttribute('class')!==value)el.setAttribute('class',value);}
function setText(el,value) {if(el.textContent!==value)el.textContent=value;}
function wireDescription(w) {
  const from=nodeMap.get(w.from),to=nodeMap.get(w.to);
  const name=n=>terminal(n)?terminalName(n):parts[n.kind].name;
  return `${name(from)}${terminal(from)?'':` · ${portsFor(from,true)[w.output].name}`} → ${name(to)}${terminal(to)?'':` · ${portsFor(to,false)[w.input].name}`}`;
}
function renderWireTrace() {
  if(!graph)return;
  const selectedWire=selected.size===1?graph.wires.find(w=>selected.has(wireSelection(w))):null;
  const key=hoverWire||(selectedWire?wireKey(selectedWire):null),el=wireElements.get(key);
  if(tracedWire===el)return;
  tracedWire?.classList.remove('traced');
  document.querySelectorAll('[data-traced]').forEach(pin=>delete pin.dataset.traced);
  tracedWire=el;
  $('wire-trace').hidden=!el;
  $('wire-highlight').setAttribute('visibility',el?'visible':'hidden');
  if(!el)return;
  el.classList.add('traced');drawWireHighlight(el);
  const w=graph.wires[Number(el.dataset.wire)];
  $('wire-trace').textContent=wireDescription(w);
  for(const info of [`${w.from}:${w.output}:1`,`${w.to}:${w.input}:0`])document.querySelector(`[data-pin="${info}"]`)?.setAttribute('data-traced','true');
}
function drawWireHighlight(el) {
  for(const path of $('wire-highlight').children)path.setAttribute('d',el.routePath);
}
function wireAt(e) {
  const hit=document.elementFromPoint(e.clientX,e.clientY);
  if(!hit||!canvas.contains(hit)||hit.closest('[data-node]'))return null;
  const point=worldPoint(e);let closest=null,distance=8/camera.scale;
  for(const el of wireElements.values()) {
    if(el.classList.contains('rerouting'))continue;
    const points=el.route?.points||[];
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      const x=Math.max(Math.min(a.x,b.x),Math.min(Math.max(a.x,b.x),point.x));
      const y=Math.max(Math.min(a.y,b.y),Math.min(Math.max(a.y,b.y),point.y));
      const d=Math.hypot(point.x-x,point.y-y);
      if(d<distance){closest=el;distance=d;}
    }
  }
  return closest;
}
function wireSource(el) {
  const w=graph.wires[Number(el.dataset.wire)];
  return `${w.from}:${w.output}:1`;
}
function routeElement(w,el) {
  const from=nodeMap.get(w.from),to=nodeMap.get(w.to);
  if(!from||!to)return;
  const route=routeBoardWire(pinPoint(from,w.output,true),pinPoint(to,w.input,false),el.route,`${w.from}:${w.output}`);
  const width=portsFor(from,true)[w.output].width===4?4:2.5;
  if(el.routePath===route.path&&el.routeWidth===width)return;
  el.route=route;
  el.routePath=route.path;el.routeWidth=width;el.classList.toggle('bus-wire',width===4);
  for(const path of el.querySelectorAll('path'))path.setAttribute('d',route.path);
  if(tracedWire===el)drawWireHighlight(el);
  flow.setRoute(wireKey(w),route,width);
}
function renderBoard() {
  if(!graph)return;
  nodeMap=new Map(graph.nodes.map(n=>[n.id,n]));
  incoming=new Map(graph.wires.map(w=>[`${w.to}:${w.input}`,w]));
  if(geometryDirty){obstacleRects=rectangles();routeBoardWire=createWireRouter(obstacleRects,{separate:true});routeOrder=[...graph.wires].sort((a,b)=>a.from-b.from||a.output-b.output||a.to-b.to||a.input-b.input);}
  for(const [id,el] of nodeElements)if(!nodeMap.has(id)){el.remove();nodeElements.delete(id);}
  for(const n of graph.nodes) {
    let el=nodeElements.get(n.id);
    const shape=`${n.kind}:${n.width}:${terminal(n)?terminalName(n):''}:${isLamp(n)}`;
    if(!el||el.dataset.shape!==shape){
      el?.remove();$('nodes').insertAdjacentHTML('beforeend',drawNode(n));
      el=$('nodes').lastElementChild;el.dataset.shape=shape;nodeElements.set(n.id,el);
    }
    el.setAttribute('transform',`translate(${n.x} ${n.y})`);
  }
  // Later nodes paint above earlier nodes, including after undo/import replaces elements.
  const layer=$('nodes');
  graph.nodes.forEach((n,index)=>{
    const el=nodeElements.get(n.id),at=layer.children[index];
    if(at!==el)layer.insertBefore(el,at||null);
  });
  const keys=new Set(graph.wires.map(wireKey));
  for(const [key,el] of wireElements)if(!keys.has(key)){el.remove();wireElements.delete(key);flow.remove(key);}
  graph.wires.forEach((w,index)=>{
    const key=wireKey(w);let el=wireElements.get(key);
    if(!el){
      $('wires').insertAdjacentHTML('beforeend',`<g class="wire-group" tabindex="0" role="button"><path class="wire-casing"/><path class="wire-hit"/><path class="wire"/><title></title></g>`);
      el=$('wires').lastElementChild;wireElements.set(key,el);
    }
    el.dataset.wire=index;el.dataset.key=key;
    el.dataset.selection=wireSelection(w);
  });
  if(geometryDirty)for(const w of routeOrder)routeElement(w,wireElements.get(wireKey(w)));
  geometryDirty=false;
  updateSignals();updateSelection();
  $('part-count').textContent=`${graph.nodes.filter(n=>!terminal(n)).length} parts · ${graph.wires.length} wires`;
  $('undo-button').disabled=!history.length;$('redo-button').disabled=!future.length;
}
function updateSignals() {
  document.querySelectorAll('[data-inputs]').forEach(el=>el.classList.toggle('current',JSON.parse(el.dataset.inputs).every((v,i)=>v===inputs[i])));
  const inputValues=new Map(sortedInputs().map((n,i)=>[n.id,inputs[i]]));
  for(const n of graph.nodes) {
    const el=nodeElements.get(n.id);if(!el)continue;
    const input=n.kind==='INPUT',v=input?inputValues.get(n.id):signals[n.id]?.[0];
    el.dataset.value=valueText(v);
    if(el.classList.contains('switch-node')) {
      const contact=switchContact(n);
      if(el.dataset.contact!==String(contact)) {
        el.dataset.contact=contact;
        el.querySelector('.inside-contact').setAttribute('d',contactPath(contact));
      }
      const data=pinValue(n,0,false),enable=pinValue(n,1,false),wired=incoming.has(`${n.id}:1`);
      setText(el.querySelector('.contact-caption'),contactCaption(contact,data));
      setText(el.querySelector('.enable-caption'),wired?`EN=${valueText(enable)}`:'EN ? · defaults to 0');
      const label=`${parts[n.kind].name}. ${wired?`EN=${valueText(enable)}`:'EN is unwired and defaults to 0'}. ${contact===1?'Closed contact':contact===0?'Open contact':'Unknown contact'}. D=${valueText(data)}, Q=${valueText(v)}.`;
      if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
      setClass(el.querySelector('.inside-source'),`inside-source ${signalClass(data)}`);
      setClass(el.querySelector('.inside-contact'),`inside-contact ${contact===1?signalClass(data):'unknown'}`);
      setClass(el.querySelector('.inside-control'),`inside-control ${signalClass(enable)}`);
      setClass(el.querySelector('.inside-output'),`inside-output ${signalClass(v)}`);
    }
    if(terminal(n)) {
      const value=el.querySelector('.terminal-value'),caption=el.querySelector('.input-caption');
      const text=valueText(v);setText(value,text);
      setClass(value,`terminal-value ${isLamp(n)?'bulb-value ':''}${signalClass(v)}`);
      const captionText=n.width===4&&v>=0?input?Number(v).toString(2).padStart(4,'0'):'DECIMAL':input?'click to change':v===undefined||v<0?isLamp(n)?'needs wire':'not connected':v===1?'on':'off';
      setText(caption,captionText);
      for(const bit of el.querySelectorAll('[data-bit]')){const text=v>=0?String((v>>Number(bit.dataset.bit))&1):valueText(v);bit.dataset.value=text;bit.querySelector('.led-value').textContent=text;}
      if(isLamp(n))el.setAttribute('aria-label',`Light bulb ${terminalName(n)}, ${captionText}, value ${text}`);
      el.querySelector('[data-toggle]')?.setAttribute('aria-label',`Change ${terminalName(n)}, currently ${valueText(v)}`);
    }
    for(const pinEl of el.querySelectorAll('[data-pin]')) {
      const [,index,out]=pinEl.dataset.pin.split(':').map(Number),value=pinValue(n,index,!!out);
      const currentPin=pending&&pending.id===n.id&&pending.index===index&&pending.output===!!out;
      const compatible=pending&&pending.output!==!!out&&portsFor(n,!!out)[index].width===portsFor(nodeMap.get(pending.id),pending.output)[pending.index].width;
      const connected=!out&&incoming.has(`${n.id}:${index}`);
      setClass(pinEl,`pin ${signalClass(value)} ${connected?'connected':''} ${currentPin?'pending':''} ${compatible?'compatible':''} ${hoverPin===pinEl.dataset.pin?'snap-target':''}`);
    }
  }
  graph.wires.forEach((w,i)=>{
    const el=wireElements.get(wireKey(w));if(!el)return;
    const value=signals[w.from]?.[w.output],bus=portsFor(nodeMap.get(w.from),true)[w.output]?.width===4;
    setClass(el.querySelector('.wire'),`wire ${signalClass(value)} ${bus?'bus':''} ${selected.has(wireSelection(w))?'selected':''}`);
    const rerouting=pending?.wire===w;
    el.classList.toggle('rerouting',rerouting);
    flow.setActive(wireKey(w),value>0&&!rerouting);
    const description=`${wireDescription(w)} · ${valueText(value)}`;
    el.setAttribute('aria-label',description+'. Select to trace; drag to connect from its source; Delete to remove.');
    el.querySelector('title').textContent=description;
  });
  renderGuidance();renderWireTrace();
}
function updateSelection() {
  for(const [id,el] of nodeElements)el.classList.toggle('selected',selected.has(nodeSelection(id)));
  for(const el of wireElements.values())el.querySelector('.wire').classList.toggle('selected',selected.has(el.dataset.selection));
  $('selection-tools').hidden=!selected.size;
  if(selected.size) {
    const nodes=selectedNodes(),wires=graph.wires.filter(w=>selected.has(wireSelection(w))),n=selected.size===1?nodes[0]:null;
    const protectedCount=mode==='journey'?nodes.filter(terminal).length:0;
    const counts=[nodes.length?`${nodes.length} block${nodes.length===1?'':'s'}`:'',wires.length?`${wires.length} wire${wires.length===1?'':'s'}`:''].filter(Boolean).join(' · ');
    $('selection-name').textContent=(n?terminal(n)?terminalName(n):parts[n.kind].name:selected.size===1?wireDescription(wires[0]):counts)+(protectedCount?' · lesson terminals stay':'');
    $('delete-button').disabled=selected.size===protectedCount;
    $('delete-button').innerHTML=icon('trash')+`<span>${!nodes.length&&wires.length===1?'Remove wire':'Delete'}</span>`;
  }
  document.body.classList.toggle('connecting',!!pending);
  renderNodeDetail();renderWireTrace();
}
function selectedNodes() { return graph.nodes.filter(n=>selected.has(nodeSelection(n.id))); }
function selectObject(key,toggle=false) {
  if(!toggle)selected.clear();
  if(toggle&&selected.has(key))selected.delete(key);else selected.add(key);
  updateSelection();
}
function renderGuidance() {
  const ready=graph.wires.length>0&&sortedOutputs().every(n=>signals[n.id]?.[0]>=0),passed=!!lastResult?.passed;
  document.querySelectorAll('.guided').forEach(el=>el.classList.remove('guided'));
  if(mode==='journey'&&['signal','power'].includes(current.scene)&&!passed) {
    if(!ready&&!pending)document.querySelector(`[data-pin="${current.scene==='signal'?1:100}:0:1"]`)?.classList.add('guided');
    else if(pending?.output)document.querySelector('[data-pin="50:0:0"]')?.classList.add('guided');
    else if(ready&&!explored&&current.scene==='signal')document.querySelector('[data-toggle="1"]')?.classList.add('guided');
  }
  $('check-button').classList.toggle('suggested',mode==='journey'&&ready&&explored&&!passed);
  document.body.classList.toggle('connecting',!!pending);
  drawPreview();renderGesture();
}
const parsePin=info=>{const [id,index,out]=info.split(':').map(Number);return {id,index,output:!!out};};
function nearestPin(event,opposite=false) {
  const r=canvas.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)return null;
  const point=worldPoint(event);
  const hit=document.elementFromPoint(event.clientX,event.clientY);
  const owner=hit?.closest('[data-node]');
  if(hit&&!canvas.contains(hit))return null;
  let nearest=null,distance=(event.pointerType==='touch'?20:15)/camera.scale;
  for(const n of [...graph.nodes].reverse())for(const output of [false,true]) {
    if(owner&&Number(owner.dataset.node)!==n.id)continue;
    if((n.kind==='INPUT'&&!output)||(n.kind==='OUTPUT'&&output)||(opposite&&pending?.output===output))continue;
    portsFor(n,output).forEach((_,index)=>{
      const p=pinPoint(n,index,output),d=Math.hypot(p.x-point.x,p.y-point.y);
      const matrix=nodeElements.get(n.id)?.getScreenCTM();
      if(!matrix)return;
      const screen=new DOMPoint(p.x-n.x,p.y-n.y).matrixTransform(matrix);
      const visible=document.elementFromPoint(screen.x,screen.y)?.closest('[data-node]');
      if(!visible||Number(visible.dataset.node)!==n.id)return;
      if(d<distance){distance=d;nearest=`${n.id}:${index}:${output?1:0}`;}
    });
  }
  return nearest;
}
function connectionTarget(event) {
  const pin=nearestPin(event,true);
  const wire=pin||pending?.output?null:wireAt(event);
  return {pin:pin||(wire?wireSource(wire):null),wire};
}
function setHoverPin(info) {
  if(info!==hoverPin){
    if(hoverPin)document.querySelector(`[data-pin="${hoverPin}"]`)?.classList.remove('snap-target');
    hoverPin=info;
    if(hoverPin)document.querySelector(`[data-pin="${hoverPin}"]`)?.classList.add('snap-target');
  }
  renderGesture();
}
function renderGesture() {
  const moving=drag?.type==='node'&&drag.moved;
  $('gesture-tools').hidden=!inventoryActive&&!pending&&!moving;
  let message;
  if(inventoryActive)message='Drop on the board. Outside cancels.';
  else if(moving)message=`Move ${drag.originals.length===1?'the block':'the group'}. Esc puts it back.`;
  else if(pending?.wire)message='Move the wire to a receiving dot. Esc or an empty drop puts it back.';
  else if(hoverPin)message=hoverWire?'Connect to this wire’s sending dot.':'Connect to the highlighted dot.';
  else {
    const target=pending?.output?'a receiving dot':'a sending dot or wire';
    message=drag?.moved?`Release near ${target}. Elsewhere cancels.`:`Choose ${target}. Click empty board to cancel.`;
  }
  if($('gesture-message').textContent!==message)$('gesture-message').textContent=message;
}
function cancelGesture() {
  cancelInventoryDrag();
  const action=drag;drag=null;pinch=null;hoverWire=null;
  for(const id of pointers.keys())if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  pointers.clear();pending=null;hoverPoint=null;setHoverPin(null);
  if(action?.type==='node'&&action.moved) {
    for(const original of action.originals)Object.assign(nodeMap.get(original.id),original);
    history.pop();future=action.futureBefore;changed(false);
    if(action.whole)renderCamera();
  }
  if(action?.type==='marquee')selected=action.before;
  $('selection-box').setAttribute('visibility','hidden');
  spaceDown=false;canvas.classList.remove('pan-ready','panning');
  if(graph){updateSignals();updateSelection();}
  renderGesture();
}
function drawPreview() {
  if(!pending){$('wire-preview').replaceChildren();return;}
  const n=nodeMap.get(pending.id);if(!n)return;
  const point=pinPoint(n,pending.index,pending.output),target=hoverPin?parsePin(hoverPin):null;
  const end=target?pinPoint(nodeMap.get(target.id),target.index,target.output):hoverPoint||{x:point.x+(point.side==='bottom'?0:pending.output?48:-48),y:point.y+(point.side==='bottom'?48:0)};
  let path=$('wire-preview').firstElementChild;
  if(!path){$('wire-preview').innerHTML='<path class="wire-preview"/>';path=$('wire-preview').firstElementChild;}
  const signature=`${pending.id}:${pending.index}:${pending.output}:${hoverPin}:${end.x}:${end.y}`;
  if(path.dataset.route===signature)return;
  const obstacles=target?obstacleRects:[{id:n.id,x:n.x,y:n.y,...BLOCK_SIZE}];
  const route=pending.output?routeWire(point,end,obstacles):routeWire(end,point,obstacles);
  path.setAttribute('d',route.path);path.dataset.route=signature;
  const invalid=target&&portsFor(n,pending.output)[pending.index].width!==portsFor(nodeMap.get(target.id),target.output)[target.index].width;
  path.classList.toggle('invalid',!!invalid);
}
function queueBoardFrame() {
  if(!boardFrame)boardFrame=requestAnimationFrame(flushBoardFrame);
}
function flushBoardFrame() {
  if(!boardFrame)return;
  boardFrame=0;
  if(drag?.type==='node'&&drag.moved&&!drag.whole){
    for(const {id} of drag.originals){const n=nodeMap.get(id);nodeElements.get(id).setAttribute('transform',`translate(${n.x} ${n.y})`);}
    obstacleRects=rectangles();routeBoardWire=createWireRouter(obstacleRects,{separate:true});
    for(const w of routeOrder)routeElement(w,wireElements.get(wireKey(w)));
  }
  // A whole-circuit translation preserves every relative obstacle and route.
  if(drag?.type==='node'&&drag.moved&&drag.whole)cameraDirty=true;
  if(drag?.type==='marquee'&&drag.moved)renderMarquee(drag);
  if(pending)drawPreview();
  if(cameraDirty){cameraDirty=false;renderCamera();}
}
function finishNodeDrag(action) {
  const n=nodeMap.get(action.id),connections=[];
  const moving=new Set(action.originals.map(n=>n.id));
  for(const w of graph.wires) {
    if(w.from===n.id&&!moving.has(w.to))connections.push({moving:pinPoint(n,w.output,true),fixed:pinPoint(nodeMap.get(w.to),w.input,false)});
    if(w.to===n.id&&!moving.has(w.from))connections.push({moving:pinPoint(n,w.input,false),fixed:pinPoint(nodeMap.get(w.from),w.output,true)});
  }
  const position=snapPosition(n,connections,8/camera.scale),dx=position.x-n.x,dy=position.y-n.y;
  for(const {id} of action.originals){const node=nodeMap.get(id);node.x+=dx;node.y+=dy;}
  changed(false);
  if(action.whole)renderCamera();
}
function renderMarquee(action) {
  const box=selectionBox(action.start,action.end),rect=$('selection-box');
  for(const [key,value] of Object.entries({x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top,visibility:'visible'}))rect.setAttribute(key,value);
  const hits=objectsInBox(graph,w=>wireElements.get(wireKey(w))?.route,box);
  const next=action.additive?new Set([...action.before,...hits]):hits;
  if(next.size!==selected.size||[...next].some(key=>!selected.has(key))){selected=next;updateSelection();}
}
function applyCamera() {cameraDirty=true;queueBoardFrame();}
function renderCamera() {
  const r=$('canvas-wrap').getBoundingClientRect();
  const display={...camera};
  if(drag?.type==='node'&&drag.moved&&drag.whole) {
    const original=drag.originals[0],n=nodeMap.get(original.id);
    display.x-=n.x-original.x;display.y-=n.y-original.y;
  }
  $('diagram').style.transform=`translate(${-display.x*display.scale}px,${-display.y*display.scale}px) scale(${display.scale})`;
  flow.setCamera(display,r.width,r.height);
  $('zoom-value').textContent=`${Math.round(camera.scale/DEFAULT_ZOOM*100)}%`;
}
function fit() {
  if(!graph.nodes.length){camera={x:0,y:0,scale:DEFAULT_ZOOM};applyCamera();return;}
  const r=$('canvas-wrap').getBoundingClientRect(),bounds=$('nodes').getBBox();
  // Fit the complete drawing, while keeping phone margins compact.
  const x1=bounds.x,y1=bounds.y-30,x2=bounds.x+bounds.width,y2=bounds.y+bounds.height+30;
  const padding=r.width<400?32:70;
  const scale=Math.min(DEFAULT_ZOOM,Math.max(.15,Math.min((r.width-padding)/(x2-x1),(r.height-115)/(y2-y1))));
  camera={scale,x:(x1+x2)/2-r.width/scale/2,y:(y1+y2)/2-r.height/scale/2};
  applyCamera();
}
function zoom(factor,point) {
  const r=$('canvas-wrap').getBoundingClientRect();
  const px=point?point.x-r.left:r.width/2,py=point?point.y-r.top:r.height/2;
  const world={x:camera.x+px/camera.scale,y:camera.y+py/camera.scale};
  camera.scale=Math.max(.15,Math.min(2,camera.scale*factor));
  camera.x=world.x-px/camera.scale; camera.y=world.y-py/camera.scale;applyCamera();
}
function worldPoint(e) {
  const r=canvas.getBoundingClientRect();
  return {x:camera.x+(e.clientX-r.left)/camera.scale,y:camera.y+(e.clientY-r.top)/camera.scale};
}
const layout=circuit=>arrangeCircuit(circuit,parts);
function starter() {
  const g=clone(current.starter);
  g.nodes.forEach(n=>{n.x=n.kind==='INPUT'?120:648;n.y=168+((n.kind==='INPUT'?n.id-1:n.id-50))*192;});
  if(current.scene==='power')g.nodes.push({id:100,kind:'HIGH',width:1,x:168,y:168});
  if(current.scene==='rail') {
    g.nodes.push({id:100,kind:'GATE',width:1,x:384,y:264});
    g.nodes.find(n=>n.kind==='OUTPUT').y=264;
  }
  // Start small screens with readable blocks. Saved layouts are never rearranged.
  if(current.scene&&matchMedia('(max-width:640px)').matches) {
    if(current.scene==='rail') {
      const positions={1:[36,72],2:[36,264],100:[240,156],50:[240,432]};
      for(const n of g.nodes)[n.x,n.y]=positions[n.id];
    } else {
      for(const n of g.nodes)n.x=n.kind==='OUTPUT'?252:36;
    }
  }
  if(['signal','power'].includes(current.scene)) {
    const source=g.nodes.find(n=>n.kind!=='OUTPUT'),light=g.nodes.find(n=>n.kind==='OUTPUT');
    light.y=source.y+(size(source).h-size(light).h)/2;
  }
  return g;
}
function validGraph(g) {
  if(!g||!Array.isArray(g.nodes)||!Array.isArray(g.wires)||g.nodes.length>512||g.wires.length>4096)throw new Error('This file does not contain a supported circuit.');
  const nodes=new Map(),receivers=new Set();
  for(const n of g.nodes) {
    if(!n||!Object.hasOwn(parts,n.kind)||!Number.isInteger(n.id)||n.id<1||n.id>1000000||nodes.has(n.id))throw new Error('Invalid or duplicate part in file.');
    if(n.width!==1&&n.width!==4)throw new Error('Invalid bus width in file.');
    if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||Math.abs(n.x)>MAX_COORDINATE||Math.abs(n.y)>MAX_COORDINATE)throw new Error('Invalid part position in file.');
    if(n.name!==undefined&&(typeof n.name!=='string'||n.name.length>128))throw new Error('Invalid terminal name.');
    nodes.set(n.id,n);
  }
  if(g.nodes.filter(n=>n.kind==='INPUT').length>32)throw new Error('This workbench supports up to 32 inputs.');
  for(const w of g.wires) {
    if(!w||!['from','to','output','input'].every(k=>Number.isInteger(w[k]))||!nodes.has(w.from)||!nodes.has(w.to))throw new Error('Invalid wire in file.');
    const from=nodes.get(w.from),to=nodes.get(w.to);
    if(from.kind==='OUTPUT'||to.kind==='INPUT'||w.output<0||w.input<0||!portsFor(from,true)[w.output]||!portsFor(to,false)[w.input])throw new Error('Invalid wire port in file.');
    if(portsFor(from,true)[w.output].width!==portsFor(to,false)[w.input].width)throw new Error('Wire widths differ. Use Split bus or Join bus.');
    const receiver=`${w.to}:${w.input}`;
    if(receivers.has(receiver))throw new Error('An input can receive only one wire.');
    receivers.add(receiver);
  }
  return g;
}
function loadLevel(id) {
  cancelGesture();flushSave();
  clearTimeout(toast.timer);$('toast').hidden=true;
  mode=id==='sandbox'?'sandbox':'journey';
  if(mode==='journey'){current=catalog.levels.find(l=>l.id===Number(id))||catalog.levels[0];lastJourney=current.id;writeStorage('last-lesson',lastJourney);openChapters.add(current.chapter);}
  const saved=readStorage(`circuit:${activeKey()}`,null);
  const fallback=()=>mode==='journey'?starter():{nodes:[{id:1,kind:'INPUT',width:1,x:72,y:168,name:'A'},{id:2,kind:'INPUT',width:1,x:72,y:360,name:'B'},{id:50,kind:'OUTPUT',width:1,x:648,y:264,name:'Q'}],wires:[]};
  try{graph=saved?validGraph(saved.circuit):fallback();}catch{graph=fallback();}
  inputs=sortedInputs().map((n,i)=>Number.isInteger(saved?.inputs?.[i])?Math.max(0,Math.min((1<<n.width)-1,saved.inputs[i])):0);
  hints=Math.max(0,Math.min(3,Number(saved?.hints)||0)); practice=!!saved?.practice;
  geometryDirty=true;explored=!!saved?.explored;
  history=[];future=[];memory={};signals={};contacts={};ticks=0;lastResult=null;selected.clear();pending=null;hoverPoint=null;hoverPin=null;testPage=0;
  ++revision;++simTicket;
  toggleJourney(false);
  renderLevel();save();fit();scheduleSimulation();
  if(mode==='journey'&&current.nandChallenge&&readStorage('welcome',false)&&!readStorage('ppa-introduced',false))showPpaIntroduction();
  $('learning-path').querySelector('[aria-current]')?.scrollIntoView({block:'nearest',inline:'center'});
}
function renderSidebar() {
  const completed=Object.keys(progress.completed).length;
  $('progress-fraction').textContent=`${completed} / ${catalog.levels.length}`;
  $('nav-progress').textContent=`${completed} / ${catalog.levels.length}`;
  $('progress-bar').style.width=`${completed/catalog.levels.length*100}%`;
  const next=catalog.levels.find(l=>!progress.completed[l.id]);
  $('continue-journey').textContent=next?`Next: ${next.title} →`:'All experiments complete · Free play mode →';
  $('continue-journey').onclick=()=>loadLevel(next?next.id:'sandbox');
  $('learning-path').hidden=mode==='sandbox'||!showPath;
  $('path-toggle').checked=showPath;
  $('learning-path').innerHTML= `<div class="path-track">${catalog.chapters.map((chapter,index)=>{
      const lessons=catalog.levels.filter(l=>l.chapter===index),count=lessons.filter(l=>progress.completed[l.id]).length;
      return `<button data-path="${index}" class="path-stop ${current.chapter===index?'active':''} ${count===lessons.length?'done':''}" ${current.chapter===index?'aria-current="step"':''} title="${esc(chapter.goal)}"><span>${count===lessons.length?'✓':index+1}</span><b>${esc(chapter.name)}</b><small>${count}/${lessons.length}</small></button>${index<catalog.chapters.length-1?'<span class="path-arrow" aria-hidden="true">→</span>':''}`;
    }).join('')}</div><button id="hide-path" class="icon-button" aria-label="Hide chapter path" title="Hide chapter path">${icon('close')}</button>`;
  $('task-navigation').innerHTML=mode==='sandbox'
    ? `<button data-return>← Back to experiment ${lessonNumber(lastJourney)}</button>`
    : `<button data-previous ${lessonIndex()===0?'disabled':''} title="Reopen the previous experiment with your saved circuit">← Previous</button><span>${lessonNumber()} / ${catalog.levels.length}</span><button data-forward>${progress.completed[current.id]?(!nextLevel()?'Free play mode':'Next'):'Skip'} →</button>`;
  $('lesson-list').innerHTML=catalog.chapters.map((chapter,index)=>{
    const lessons=catalog.levels.filter(l=>l.chapter===index),allDone=lessons.every(l=>progress.completed[l.id]);
    return `<section class="chapter"><button class="chapter-toggle" data-chapter="${index}" aria-expanded="${openChapters.has(index)}"><span class="chapter-number">${String(index+1).padStart(2,'0')}</span>${esc(chapter.name)}<span class="${allDone?'chapter-check':'chevron'}">${allDone?'✓':openChapters.has(index)?'−':'+'}</span></button><div ${openChapters.has(index)?'':'hidden'}><p class="chapter-goal">${esc(chapter.goal)}</p>${lessons.map(l=>`<button class="lesson-link ${progress.completed[l.id]?'done':''} ${isMastered(l.id)?'mastered':''} ${mode==='journey'&&current.id===l.id?'active':''}" data-level="${l.id}" ${mode==='journey'&&current.id===l.id?'aria-current="step"':''}><span class="lesson-bullet">${progress.completed[l.id]?icon(isMastered(l.id)?'star':'check'):String(lessonNumber(l.id)).padStart(2,'0')}</span><span>${esc(l.title)}</span>${progress.completed[l.id]&&l.nandChallenge?`<span class="journey-stars" aria-label="${earnedStars(l.id)} of 3 stars">${earnedStars(l.id)}/3 ${icon('star')}</span>`:''}${mode==='journey'&&current.id===l.id?'<span class="current-arrow">›</span>':''}</button>`).join('')}</div></section>`;
  }).join('');
}
function renderLevel() {
  document.body.classList.toggle('free-play',mode==='sandbox');
  $('journey-nav').classList.toggle('active',mode==='journey'); $('sandbox-nav').classList.toggle('active',mode==='sandbox');
  $('chapter-label').textContent=mode==='journey'?catalog.chapters[current.chapter].name.toUpperCase():'LET YOUR CURIOSITY LEAD';
  $('lesson-number').textContent=mode==='journey'?`EXPERIMENT ${String(lessonNumber()).padStart(2,'0')} / ${catalog.levels.length}`:'FREE PLAY MODE';
  $('lesson-title').innerHTML=esc(mode==='journey'?current.title:'Room to experiment')+'<span class="title-dot">.</span>';
  $('lesson-subtitle').textContent=mode==='journey'?current.subtitle:'Your ideas. Your rules. All the building blocks.';
  $('check-button').innerHTML=icon(mode==='journey'?'check':'spark')+(mode==='journey'?'Check circuit':'Run circuit');
  $('expected-button').hidden=mode==='sandbox';
  document.title=`${mode==='journey'?current.title:'Free play mode'} — CircuIT Lab`;
  $('clear-button').innerHTML=icon(mode==='journey'?'reset':'trash');
  $('clear-button').title=mode==='journey'?'Reset experiment':'Clear workbench';
  $('clear-button').setAttribute('aria-label',$('clear-button').title);
  renderSidebar();renderParts();renderLearn();renderTest();renderClock();renderBoard();
  setTaskVisible(taskSheet.matches?mode==='journey':taskOpen,false);
  status('A space to experiment. Mistakes welcome.');
}
function renderParts() {
  const keys=mode==='journey'?current.allowed:Object.keys(parts).filter(k=>!['INPUT','OUTPUT','RELAY','BEACON'].includes(k)&&(showInside||!parts[k].inside));
  const items=keys.map(key=>({key,width:1,name:parts[key].name}));
  if(mode==='sandbox')items.unshift({key:'INPUT',width:1,name:'Signal'},{key:'OUTPUT',width:1,name:'Light bulb'},{key:'INPUT',width:4,name:'4-bit input'},{key:'OUTPUT',width:4,name:'4-bit LEDs'});
  $('parts').innerHTML=items.length?items.map(({key,width,name})=>`<button class="part-button" data-part="${key}" data-width="${width}" data-name="${esc(name)}" title="Drag onto the board, or click to add. ${esc(parts[key].description)}" aria-label="Add ${esc(name)}"><span class="part-glyph">${glyph(key)||esc(parts[key].symbol)}</span><span class="part-name">${esc(name)}</span></button>`).join(''):`<div class="no-parts">${icon('arrow')}Already on the board. Connect the dots →</div>`;

}
function renderLearn() {
  if(mode==='sandbox') {
    $('learn-panel').innerHTML=`<span class="lesson-tag">ROOM FOR YOUR IDEAS</span><h2>What will you make?</h2><p>Mix the building blocks. Invent a puzzle, make a calculator, or give a number somewhere to live.</p><label class="inside-option"><input id="inside-toggle" type="checkbox" ${showInside?'checked':''}> Peek inside: transistor parts</label><div id="node-detail"></div>`;
    return;
  }
  $('learn-panel').innerHTML=`<span class="task-section-label">YOUR MISSION</span><p class="mission-rule">${esc(current.goal)}</p><p class="task-build">You’re building: <strong>${esc(parts[current.target].name)}</strong>.</p>
    ${progress.completed[current.id]?`<div class="lesson-complete-badge">✓ You've completed this experiment.</div><p class="revisit-note">Your circuit is saved. Keep exploring here, or use Next below.</p>`:''}${challengeMarkup()}
    ${practice?'<div class="preview-banner">You are exploring a worked example. Try it, then build your own to complete the experiment. <button id="start-fresh" class="text-button">Start my own circuit →</button></div>':''}
    <div class="hint-area"><div class="hint-top"><div class="section-label">${icon('bulb')}Stuck? Take a hint.</div><span>${hints} / ${current.hints.length}</span></div>${current.hints.slice(0,hints).map((h,i)=>`<div class="hint"><strong>${i+1}.</strong> ${esc(h)}</div>`).join('')}<button id="hint-button" class="button" ${hints>=current.hints.length?'disabled':''}>${hints?'Give me the next hint':'Give me a hint'} ${icon('arrow')}</button><button id="example-button" class="example-button">See a working example</button></div>
    <div id="node-detail"></div>`;
  renderNodeDetail();renderGuidance();
}
function bestNands(id=current.id) {
  const best=progress.completed[id]?.bestNands;
  return Number.isInteger(best)&&best>=0&&best<=512?best:null;
}
const starKeys=['areaStar','depthStar','powerStar'];
function earnedStars(id=current.id){return starKeys.filter(key=>progress.completed[id]?.stars?.[key]===true).length;}
function isMastered(id=current.id) {
  return !!progress.completed[id]&&(!catalog.levels.find(l=>l.id===Number(id))?.nandChallenge||earnedStars(id)===3);
}
function completionStars() {
  const count=earnedStars();
  return `<span class="completion-stars" role="img" aria-label="${count} of 3 optimization stars earned">${starKeys.map(key=>`<span class="${progress.completed[current.id]?.stars?.[key]?'earned':''}">${icon('star')}</span>`).join('')}<span class="star-count">${count}/3</span></span>`;
}
function showPpaIntroduction() {
  modal(`<span class="lesson-tag">FROM BUILDING TO ENGINEERING</span><h2>A working circuit is just the beginning.</h2><p>You know how to make signals work. Now the challenge grows: build a correct circuit, then explore how efficiently it works.</p><div class="ppa-introduction"><p><strong>Power</strong> · Make fewer gates switch.</p><p><strong>Performance</strong> · Shorten the longest gate path.</p><p><strong>Area</strong> · Use less gate logic.</p></div><p>A working circuit still completes each task. These challenges add three stars, one per target. Every current PPA challenge has a circuit that meets all three targets together. You can also earn stars with different working designs; earned stars stay yours.</p><p>Real engineers balance these goals: improving one can cost another. Our scores are simplified estimates to help you explore that tradeoff.</p><div class="modal-actions"><button id="start-ppa" class="button primary">Let’s engineer it ${icon('arrow')}</button></div>`, 'ppa-introduction');
  writeStorage('ppa-introduced',true);
  $('start-ppa').onclick=()=>$('modal').close();
}
function challengeMarkup(result=null) {
  const goal=current.nandChallenge;if(!goal)return '';
  const score=result?.designScore,earned=progress.completed[current.id]?.stars||{};
  const meanSwitching=value=>Number.isInteger(score?.switchingTransitions)&&score.switchingTransitions>0?(value/score.switchingTransitions).toFixed(2):'—';
  const labels=[['areaStar','Area',`≤ ${goal.target} NAND equivalents`,score?.area],
    ['depthStar','Performance',`≤ ${goal.depthTarget} NAND stages`,score?.depth],
    ['powerStar','Power','Switch fewer gates · average ≤ reference',score?meanSwitching(score.switching):null]];
  return `<section class="nand-challenge ${earnedStars()===3?'achieved':''}" aria-label="Optional PPA targets"><h3>PPA targets · ${earnedStars()}/3 ★</h3><p>Power, Performance and Area use simplified estimates to teach circuit design tradeoffs, not real chip measurements.</p><p>A working circuit wins. All three targets can be met in one circuit. You can also earn stars across different working designs; earlier stars stay earned.</p>${labels.map(([key,label,target,value])=>`<p class="ppa-target ${earned[key]?'earned':''}"><span aria-label="${earned[key]?'Earned':'Not earned'}">${earned[key]?'★':'☆'}</span> <strong>${label}</strong>: ${esc(target)}${score&&result.passed?` · this circuit: ${value}${key==='powerStar'?` / ${meanSwitching(score.switchingTarget)} gate outputs per input change`:''}${score[key]?' ✓':''}`:''}</p>`).join('')}${score&&result.passed&&!score.supported?'<p>This design works, but contains parts outside the scoring library.</p>':''}<details><summary>How the game estimates PPA</summary><p>Area counts NAND equivalents inside all placed blocks: NOT costs 1, AND costs 2. Performance is estimated from the longest NAND path to an output: fewer stages mean a faster circuit. Power estimates the average number of internal gate outputs that switch when one input changes. Switching uses energy: try to make fewer gates switch. The average must be no higher than the reference circuit. We test every single-input change equally and give each internal NAND-equivalent gate output equal weight; transient glitches are ignored. Wires are free. These are teaching estimates, not physical chip measurements or proven minimums.</p><p>Reduce repeated logic for area, shorten paths for performance, and reduce switching for power. Improving one can cost another, but sometimes simplification improves all three.</p></details><button class="text-button" data-design-notes>Explore circuit design →</button></section>`;
}
function renderNodeDetail() {
  const el=$('node-detail'); if(!el)return;
  const n=selected.size===1?selectedNodes()[0]:null;
  if(!n||terminal(n)){el.innerHTML='';return;}
  const s=parts[n.kind];
  el.innerHTML=`<div class="node-detail"><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><div class="port-description">${s.inputs.map(p=>`${esc(p.name)}: ${p.width} bit input`).join('<br>')}<br>${s.outputs.map(p=>`${esc(p.name)}: ${p.width} bit output`).join('<br>')}</div></div>`;
}
function tableMarkup(rows,actual=false) {
  const spec=parts[current.target],sequential=current.sequential;
  return `<div class="test-table-wrap"><table class="truth-table"><thead><tr>${sequential?'<th scope="col" title="Capture on this clock step">Clock</th>':''}${spec.inputs.map(p=>`<th scope="col">${esc(p.name)}</th>`).join('')}${spec.outputs.map(p=>`<th scope="col">${esc(p.name)}<br>expected</th>`).join('')}${actual?spec.outputs.map(p=>`<th scope="col">${esc(p.name)}<br>got</th>`).join(''):''}</tr></thead><tbody>${rows.map((r,i)=>`<tr ${sequential?'':`data-row="${i}" data-inputs="${esc(JSON.stringify(r.inputs))}" tabindex="0" role="button" aria-label="Try inputs ${r.inputs.join(', ')}; expect ${r.expected.join(', ')}"`} class="${actual&&!r.passed?'failed':!sequential&&r.inputs.every((v,i)=>v===inputs[i])?'current':''}">${sequential?`<td>${r.tick?'↦':'–'}</td>`:''}${r.inputs.map(v=>`<td>${valueText(v)}</td>`).join('')}${r.expected.map(v=>`<td class="expected">${valueText(v)}</td>`).join('')}${actual?r.actual.map(v=>`<td>${valueText(v)}</td>`).join(''):''}</tr>`).join('')}</tbody></table></div>`;
}
function renderTest() {
  if(mode==='sandbox')return;
  const result=lastResult,rows=result?.rows?.length?result.rows:current.tests;
  testPage=Math.min(testPage,Math.max(0,Math.ceil(rows.length/TEST_PAGE_SIZE)-1));
  const banner=result?`<div class="test-badge ${result.passed?'success':'failure'}">${result.passed?`✓ ${result.correct} of ${result.total} checks passed.`:esc(result.error||'Keep experimenting.')} ${!result.passed&&result.total?`(${result.correct}/${result.total} passed)`:''}</div>`:'';
  $('test-panel').innerHTML=`<div class="test-intro"><h2>${current.sequential?'Expected sequence':'Check results'}</h2><p>${expectationInstructions()}</p></div>${banner}${result?challengeMarkup(result):''}${casesMarkup(rows,testPage,!!result?.rows?.length)}<p class="test-note">? = unknown or unwired · Z = high impedance · ! = conflicting drivers</p>`;
}
function expectationInstructions() {
  return current.sequential?'Each row continues from the previous memory state. ↦ = clock step; – = no clock.':'Click a row to set its inputs and watch your circuit. These are the outputs to aim for.';
}
function casesMarkup(rows,page,actual=false) {
  const pages=Math.ceil(rows.length/TEST_PAGE_SIZE);
  return `${tableMarkup(rows.slice(page*TEST_PAGE_SIZE,(page+1)*TEST_PAGE_SIZE),actual)}${pages>1?`<nav class="table-paging" aria-label="Test cases"><button data-test-page="${page-1}" ${page===0?'disabled':''}>← Previous rows</button><span>${page+1} / ${pages}</span><button data-test-page="${page+1}" ${page===pages-1?'disabled':''}>Next rows →</button></nav>`:''}<p class="test-note">${current.testCount} ${current.sequential?'steps in order · memory begins at 0':'input combinations'}.</p>`;
}
function renderExpected() {
  $('expected-panel').innerHTML=`<p class="expected-lesson">${esc(current.title)}</p><p class="test-intro">${expectationInstructions()}</p>${casesMarkup(current.tests,expectedPage)}`;
}
function showExpected() {
  cancelGesture();expectedPage=0;renderExpected();
  $('expected-dialog').showModal();$('expected-panel').scrollTop=0;
  $('expected-button').setAttribute('aria-expanded','true');
}
function tryTableRow(event) {
  const el=event.target.closest('[data-inputs]');if(!el)return;
  const fromExpected=$('expected-dialog').contains(el);
  if($('results-dialog').contains(el))$('results-dialog').close();
  inputs=JSON.parse(el.dataset.inputs);explored=true;save();updateSignals();renderTest();scheduleSimulation();
  if(fromExpected)$('expected-dialog').close();
  if(taskSheet.matches||fromExpected){returnToBoard();toast(`Inputs set to ${inputs.join(', ')}. Watch the circuit respond.`);}
}
function renderClock() {
  const hasMemory=mode==='sandbox'?graph.nodes.some(n=>parts[n.kind]?.sequential):current.sequential;
  $('clock-bar').hidden=!hasMemory; $('tick-count').textContent=`Step ${ticks}`;
}
function scheduleSimulation() {if(simulationScheduled)return;simulationScheduled=true;queueMicrotask(()=>{simulationScheduled=false;runSimulation(false);});}
function runSimulation(tick=false) {
  const ticket=++simTicket,rev=revision,values=[...inputs];
  if(tick)$('tick-button').disabled=true;
  queue=queue.catch(()=>{}).then(async()=>{
    if(rev!==revision||(!tick&&ticket!==simTicket))return;
    // Inputs belong to the click; memory comes from the preceding clock step.
    const data=await engine.request('simulate',{circuit:graph,inputs:values,state:memory,tick});
    if(rev!==revision)return;
    if(data.error){signals={};contacts={};updateSignals();status(data.error,true);if(tick)toast(data.error,'error');return;}
    // Preserve a completed clock step even if a newer display refresh was queued.
    if(tick){memory=data.state;ticks++;}
    if(ticket===simTicket||tick){signals=data.signals;contacts=data.contacts||{};if(!tick)memory=data.state;updateSignals();renderClock();
      if(data.outputs.some(v=>v===-3))status('Two drivers disagree. Trace the red wire back to its Junction.',true);
      else if(data.outputs.some(v=>v<0))status('Your circuit is growing. Connect the remaining pins to see a result.');
      else status(tick?`Clock step ${ticks}. Every memory cell captured its input together.`:'Signals are live. Flip an input to see what changes.');
    }
  }).catch(e=>{if(rev===revision&&ticket===simTicket){status(e.message,true);toast('The engine could not finish. Your circuit is still here; try again.','error');}}).finally(()=>{if(tick)$('tick-button').disabled=false;});
  return queue;
}
function addPart(key,width=1,position=null) {
  if(graph.nodes.length>=512){toast('This workbench holds up to 512 parts.','error');return;}
  if(key==='INPUT'&&sortedInputs().length>=32){toast('This workbench supports up to 32 inputs.','error');return;}
  remember();
  const r=canvas.getBoundingClientRect();
  let id=100;while(graph.nodes.some(n=>n.id===id))id++;
  let x=position?.x??camera.x+r.width/camera.scale/2-BLOCK_SIZE.w/2,y=position?.y??camera.y+r.height/camera.scale/2-BLOCK_SIZE.h/2;
  while(!position&&graph.nodes.some(n=>Math.abs(n.x-x)<50&&Math.abs(n.y-y)<55)){x+=28;y+=25;}
  graph.nodes.push({id,kind:key,width,x:onGrid(x),y:onGrid(y)});
  if(key==='INPUT')inputs.push(0);
  selected=new Set([nodeSelection(id)]);pending=null;changed();renderNodeDetail();
}
function deleteSelected() {
  if(!selected.size)return;
  cancelGesture();
  const nodes=new Set(selectedNodes().filter(n=>mode==='sandbox'||!terminal(n)).map(n=>n.id));
  const wires=graph.wires.filter(w=>!nodes.has(w.from)&&!nodes.has(w.to)&&!selected.has(wireSelection(w)));
  if(!nodes.size&&wires.length===graph.wires.length){toast('The lesson’s input and output terminals stay on the board.');return;}
  remember();
  inputs=sortedInputs().flatMap((n,i)=>nodes.has(n.id)?[]:[inputs[i]]);
  graph.nodes=graph.nodes.filter(n=>!nodes.has(n.id));graph.wires=wires;
  selected.clear();pending=null;changed();renderClock();renderNodeDetail();
}
function selectPin(info) {
  const p=parsePin(info);
  selected.clear();
  hoverPoint=null;hoverWire=null;setHoverPin(null);
  if(!pending){pending=p;renderBoard();return;}
  if(p.id===pending.id&&p.index===pending.index&&p.output===pending.output){pending=null;renderBoard();return;}
  if(p.output===pending.output){pending=p;renderBoard();return;}
  const from=p.output?p:pending,to=p.output?pending:p;
  const a=graph.nodes.find(n=>n.id===from.id),b=graph.nodes.find(n=>n.id===to.id);
  if(portsFor(a,true)[from.index].width!==portsFor(b,false)[to.index].width){toast('These pins have different widths. Use Split bus or Join bus.','error');return;}
  remember();
  graph.wires=graph.wires.filter(w=>w!==pending.wire&&!(w.to===to.id&&w.input===to.index));
  graph.wires.push({from:from.id,output:from.index,to:to.id,input:to.index});
  pending=null;changed();
}
function changeInput(id) {
  const list=sortedInputs(),index=list.findIndex(n=>n.id===id),n=list[index];if(!n)return;
  if(n.width===1){inputs[index]=1-inputs[index];if(graph.wires.length)explored=true;save();updateSignals();renderTest();scheduleSimulation();return;}
  modal(`<span class="lesson-tag">FOUR BITS, SIXTEEN POSSIBILITIES</span><h2>Choose a number.</h2><p>Set ${esc(terminalName(n))} to a value from 0 to 15. Your four-bit bus carries the binary form.</p><form id="bus-form"><input class="bus-dialog-input" id="bus-value" type="number" min="0" max="15" step="1" value="${inputs[index]}" aria-label="Bus value, 0 to 15" required><div class="modal-actions"><button class="button primary" type="submit">Set input ${icon('arrow')}</button></div></form>`);
  $('bus-value').focus();$('bus-value').select();
  $('bus-form').onsubmit=e=>{e.preventDefault();const v=Number($('bus-value').value);if(!Number.isInteger(v)||v<0||v>15)return;inputs[index]=v;explored=true;$('modal').close();save();updateSignals();renderTest();scheduleSimulation();};
}
async function checkCircuit() {
  if(checking)return;
  if(mode==='sandbox'){await runSimulation();return;}
  checking=true;$('check-button').disabled=true;$('check-button').innerHTML=icon('clock')+'Testing…';
  const rev=revision,id=current.id;
  try {
    const r=await engine.request('check',{circuit:graph,level:id});
    if(rev!==revision)return;
    lastResult=r;testPage=Math.max(0,Math.floor((r.rows||[]).findIndex(row=>!row.passed)/TEST_PAGE_SIZE));
    renderTest();renderGuidance();
    if(!r.passed||practice)$('results-dialog').showModal();
    if(r.passed) {
      if(practice){toast('The worked circuit passes every check. Start fresh when you’re ready to build it.','success');return;}
      const record={...progress.completed[id],parts:graph.nodes.filter(n=>!terminal(n)).length};
      record.stars=Object.fromEntries(starKeys.map(key=>[key,record.stars?.[key]===true||r.designScore?.[key]===true]));
      progress.completed[id]=record;save();renderSidebar();renderLearn();renderTest();showCompletion(r);
    } else {toast(r.total?`${r.correct} of ${r.total} checks passed. Let’s find the missing piece.`:r.error,'error');status(r.error,true);}
  } catch(e){toast(e.message,'error');}
  finally{checking=false;$('check-button').disabled=false;$('check-button').innerHTML=icon(mode==='journey'?'play':'spark')+(mode==='journey'?'Check circuit':'Run circuit');}
}
function modal(content,kind='') { cancelGesture();$('modal').dataset.kind=kind;$('modal-content').innerHTML=content;if(!$('modal').open)$('modal').showModal(); }
function revealHint() {
  hints=Math.min(current.hints.length,hints+1);save();renderLearn();
  $('hint-button').scrollIntoView({block:'nearest',behavior:'smooth'});
}
const skipMessages=[
  'One small connection can make the idea click. Try following a single signal from its input to the light.',
  'You don’t have to see the whole answer yet. Change one input and watch what happens.',
  'Every circuit starts with a bit of experimenting. A hint can help you find your next step.',
  'Getting stuck is part of finding something new. Try a different connection—you can always undo.',
  'A fresh look can help. Explore a working example, or come back when you’re curious again.'
];
function showSkip() {
  const index=Math.max(0,Number(readStorage('skip-message',0))|0)%skipMessages.length;
  writeStorage('skip-message',(index+1)%skipMessages.length);
  const next=nextLevel()?.id||'sandbox';
  modal(`<span class="lesson-tag">COME BACK WITH FRESH EYES</span><h2>Skip this experiment?</h2><p class="skip-message">${skipMessages[index]}</p><p class="skip-note">Your circuit stays saved, and this experiment stays unfinished. Previous or Your journey will bring you back.</p><div class="modal-actions"><button id="keep-trying" class="button primary">Keep trying</button><button id="skip-hint" class="button" ${hints>=current.hints.length?'disabled':''}>Get a hint</button><button id="confirm-skip" class="text-button">Skip for now →</button></div>`, 'skip');
  $('keep-trying').onclick=()=>$('modal').close();
  $('skip-hint').onclick=()=>{$('modal').close();openTask();revealHint();};
  $('confirm-skip').onclick=()=>{$('modal').close();loadLevel(next);};
  $('keep-trying').focus();
}
function showCompletion(r) {
  const s=parts[current.target],next=nextLevel();
  modal(`<span class="lesson-tag">${current.id===catalog.levels.length?'FROM A SPARK TO A COMPUTER':'ANOTHER DISCOVERY MADE'}</span><div class="completion-heading"><h2>${current.id===catalog.levels.length?'You built a computer.':'You made it work.'}</h2>${current.nandChallenge?completionStars():''}</div><p>${current.id===catalog.levels.length?'From sending your first message to a working instruction-driven processor. That whole journey is here, in your circuit. Keep exploring in free play.':`Your ${esc(s.name.toLowerCase())} works. Every ${current.sequential?'step in the test sequence':'input combination'} passed. Take a moment — you made this.`}</p><div class="completion-stats"><div><strong>${r.total}</strong><span>checks passed</span></div><div><strong>${graph.nodes.filter(n=>!terminal(n)).length}</strong><span>blocks on board</span></div><div><strong>${Object.keys(progress.completed).length}/${catalog.levels.length}</strong><span>ideas discovered</span></div></div>${challengeMarkup(r)}<div class="chip-unlock"><span class="chip-symbol">${esc(s.symbol)}</span><div><strong>Your new building block</strong><p>${esc(s.name)} is ready for bigger ideas.</p></div></div><div class="modal-actions"><button id="next-lesson" class="button primary">${next?`Next: ${esc(next.title)}`:'Explore free play'} ${icon('arrow')}</button><button id="stay-button" class="button">${current.nandChallenge&&earnedStars()<3?'Explore design targets':'Review my circuit'}</button></div>`);
  $('next-lesson').onclick=()=>{$('modal').close();loadLevel(next?next.id:'sandbox');};$('stay-button').onclick=()=>{$('modal').close();if(taskSheet.matches)returnToBoard();};
}
const singleGuidePage=matchMedia('(max-width:760px)');
const handbookPages=handbookSpreads.flatMap(spread=>spread.pages);
let guidePage=0, guideTurning=false;
const guideStep=()=>singleGuidePage.matches?1:2;
const guideStart=()=>guidePage-guidePage%guideStep();
const guideNeighbour=direction=>guideStart()+direction*guideStep();
function showGuide(page=guidePage) {
  guidePage=Math.max(0,Math.min(handbookPages.length-1,page));
  const start=guideStart(),count=guideStep(),spreadIndex=Math.floor(start/2);
  const spread=handbookSpreads[spreadIndex],totalPages=handbookPages.length;
  const previous=guideNeighbour(-1),next=guideNeighbour(1);
  const neighbourTitle=index=>singleGuidePage.matches
    ? handbookPages[index]?.title.replace(/<br\s*\/?\s*>/g,' ')
    : handbookSpreads[Math.floor(index/2)]?.title;
  const previousTitle=neighbourTitle(previous)||'First page',nextTitle=neighbourTitle(next)||'Last page';
  const turnArrow=`<svg viewBox="0 0 64 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 30C9 7 51 6 51 28m-10-7 10 9 9-11"/></svg>`;
  modal(`<div class="book-index"><span>LAB HANDBOOK</span><strong>${spread.title}</strong><nav class="book-contents" aria-label="Handbook contents">${handbookSpreads.map((item,i)=>`<button data-guide-spread="${i}" ${i===spreadIndex?'aria-current="page"':''} ${guideTurning?'disabled':''}>${item.title}</button>`).join('')}</nav></div>
    <div id="book-spread" class="book-spread">${handbookPages.slice(start,start+count).map((page,i)=>`<article class="book-page"><span class="book-eyebrow">PAGE ${String(start+i+1).padStart(2,'0')} / ${totalPages}</span><h2>${page.title}</h2>${page.body}</article>`).join('')}</div>
    <div class="book-footer handbook-footer"><button id="guide-previous" class="page-turn previous" ${previous<0||guideTurning?'disabled':''} aria-label="Previous ${count===1?'page':'pages'}: ${esc(previousTitle)}">${turnArrow}<span>${esc(previousTitle)}</span></button><div class="book-return"><span aria-live="polite">${start+1}${count===2?'–'+Math.min(start+count,totalPages):''} / ${totalPages}</span><button id="close-guide" class="${readStorage('welcome',false)?'text-button':'button primary'}">${readStorage('welcome',false)?'Back to experiment':'Start building'}</button><button id="guide-home" class="text-button" ${start===0?'hidden':''}>How to play</button></div><button id="guide-next" class="page-turn next" ${next>=totalPages||guideTurning?'disabled':''} aria-label="Next ${count===1?'page':'pages'}: ${esc(nextTitle)}">${turnArrow}<span>${esc(nextTitle)}</span></button></div>`, 'handbook');
  bindGuideSwipe($('book-spread'));
  $('guide-previous').onclick=()=>turnGuide(-1);
  $('guide-next').onclick=()=>turnGuide(1);
  document.querySelectorAll('[data-guide-spread]').forEach(button=>button.onclick=()=>{
    if(guideTurning)return;
    showGuide(Number(button.dataset.guideSpread)*2);
    document.querySelector('.book-contents [aria-current="page"]').focus({preventScroll:true});
  });
  $('modal').scrollTop=0;
  $('close-guide').onclick=()=>$('modal').close();
  $('guide-home').onclick=()=>showGuide(0);
}
function bindGuideSwipe(spread) {
  let gesture=null;
  spread.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.pointerType==='mouse'||event.target.closest('button,a,input'))return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
    spread.setPointerCapture(event.pointerId);
  });
  spread.addEventListener('pointerup',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,elapsed=performance.now()-gesture.time;
    gesture=null;
    if(Math.abs(dx)>=55&&Math.abs(dx)>Math.abs(dy)*1.5&&elapsed<1000)turnGuide(dx<0?1:-1);
  });
  spread.addEventListener('pointercancel',()=>{gesture=null;});
}
async function turnGuide(direction) {
  const next=guideNeighbour(direction);
  if(guideTurning||next<0||next>=handbookPages.length)return;
  const dialog=$('modal'),spread=$('book-spread'),singleColumn=singleGuidePage.matches;
  const focusArrow=()=>{
    if(dialog.open&&dialog.dataset.kind==='handbook')
      $(guideNeighbour(-1)<0?'guide-next':guideNeighbour(1)>=handbookPages.length?'guide-previous':direction>0?'guide-next':'guide-previous')?.focus({preventScroll:true});
  };
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){showGuide(next);focusArrow();return;}
  guideTurning=true;dialog.dataset.turning='true';
  $('guide-previous').disabled=true;$('guide-next').disabled=true;
  document.querySelectorAll('[data-guide-spread]').forEach(button=>button.disabled=true);
  let animation;
  try {
    // Single pages slide gently; two-page spreads turn around their spine.
    const outgoing=spread.children[singleColumn?0:direction>0?1:0];
    outgoing.style.transformOrigin=direction>0?'left center':'right center';
    animation=outgoing.animate(singleColumn
      ? [{transform:'translateX(0)',opacity:1},{transform:`translateX(${-direction*24}px)`,opacity:0}]
      : [{transform:'rotateY(0deg)'},{transform:`rotateY(${-direction*90}deg)`}],{duration:singleColumn?110:170,easing:'ease-in',fill:'forwards'});
    await animation.finished;
    if(!dialog.open||!spread.isConnected)return;
    showGuide(next);
    const incoming=$('book-spread').children[singleColumn?0:direction>0?0:1];
    incoming.style.transformOrigin=direction>0?'right center':'left center';
    animation=incoming.animate(singleColumn
      ? [{transform:`translateX(${direction*24}px)`,opacity:0},{transform:'translateX(0)',opacity:1}]
      : [{transform:`rotateY(${direction*90}deg)`},{transform:'rotateY(0deg)'}],{duration:singleColumn?150:190,easing:'ease-out'});
    await animation.finished;
  } catch { /* Closing the handbook cancels its animation. */ }
  finally {
    animation?.cancel();guideTurning=false;delete dialog.dataset.turning;
    if($('guide-previous'))$('guide-previous').disabled=guideNeighbour(-1)<0;
    if($('guide-next'))$('guide-next').disabled=guideNeighbour(1)>=handbookPages.length;
    document.querySelectorAll('[data-guide-spread]').forEach(button=>button.disabled=false);
    focusArrow();
  }
}

function setTaskVisible(visible,animate=true) {
  const panel=$('inspector'),changed=visible!==taskOpen,hadFocus=panel.contains(document.activeElement);
  const toggle=$('task-toggle'),compact=taskSheet.matches,toggleFocused=document.activeElement===toggle;
  taskAnimation?.cancel();taskAnimation=null;
  taskOpen=visible;
  document.body.classList.toggle('task-hidden',!visible);
  panel.hidden=!visible;panel.inert=!visible;
  $('task-scrim').hidden=!taskSheet.matches||!visible;
  document.querySelector('.workbench').inert=taskSheet.matches&&visible;
  const taskLabel=icon('book')+`<span class="task-toggle-label"><span>${mode==='journey'?`Task · ${lessonNumber()} / ${catalog.levels.length}`:'Free play mode'}</span><strong>${esc(mode==='journey'?current.title:'Your workspace')}</strong></span>`;
  toggle.setAttribute('aria-expanded',String(visible));
  toggle.hidden=compact&&visible;
  $('task-label').hidden=!compact||!visible;
  $('task-label').innerHTML=taskLabel;
  toggle.innerHTML=compact
    ? taskLabel+icon('chevronUp').replace('<svg ','<svg class="task-chevron" ')
    : icon('panel')+`<span>${visible?'Hide task':'Show task'}</span>`;
  toggle.setAttribute('aria-label',`${visible&&!compact?'Hide':'Show'} ${mode==='journey'?'task: '+current.title:'workspace notes'}`);
  if(changed&&taskSheet.matches&&animate&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    panel.hidden=false;
    const frames=[{transform:'translateY(calc(100% + 8px))',opacity:0},{transform:'translateY(0)',opacity:1}];
    const animation=panel.animate(visible?frames:frames.reverse(),{duration:180,easing:'ease-out'});
    taskAnimation=animation;
    animation.finished.then(()=>{panel.hidden=!taskOpen;if(taskAnimation===animation)taskAnimation=null;}).catch(()=>{});
  }
  if(!visible&&hadFocus)toggle.focus({preventScroll:true});
  if(visible&&compact&&toggleFocused)$('lesson-title').focus({preventScroll:true});
  applyCamera();
}
function openTask() {
  cancelGesture();setTaskVisible(true);
  if(taskSheet.matches)$('lesson-title').focus({preventScroll:true});
}
function returnToBoard() {
  if(taskSheet.matches)setTaskVisible(false);
  canvas.focus({preventScroll:true});
}
function setPathVisible(visible) {
  showPath=visible;writeStorage('path-visible',visible);renderSidebar();applyCamera();
}
function clearBoard() {
  const lesson=mode==='journey';
  modal(`<span class="lesson-tag">A LITTLE ROOM TO START AGAIN</span><h2>${lesson?'Reset this experiment?':'Clear the workbench?'}</h2><p>${lesson?'Restore the starting blocks and remove your added parts and wires. Your completed lessons stay saved.':'Remove all blocks and wires, including inputs and outputs.'} You can undo this.</p><div class="modal-actions"><button id="confirm-clear" class="button primary">${lesson?'Reset experiment':'Clear workbench'}</button><button id="cancel-clear" class="button">Keep building</button></div>`);
  $('confirm-clear').onclick=()=>{
    cancelGesture();remember();graph=lesson?starter():{nodes:[],wires:[]};
    inputs=sortedInputs().map(()=>0);practice=false;selected.clear();pending=null;hints=0;explored=false;
    changed();renderLearn();fit();$('modal').close();if(taskSheet.matches)returnToBoard();
  };
  $('cancel-clear').onclick=()=>$('modal').close();
}
function showExample() {
  modal(`<span class="lesson-tag">LEARN BY LOOKING INSIDE</span><h2>Explore a worked circuit.</h2><p>A working example replaces the board so you can trace every wire. Your current design is one Undo away. Exploring the example doesn’t mark the lesson complete.</p><div class="modal-actions"><button id="load-example" class="button primary">Show me how it works</button><button id="cancel-example" class="button">Keep exploring</button></div>`);
  $('cancel-example').onclick=()=>$('modal').close();
  $('load-example').onclick=async()=>{
    const id=current.id,rev=revision;
    try{const g=await engine.request('reference',{level:id});if(g.error)throw new Error(g.error);if(rev!==revision)return;remember();graph=layout(g);practice=true;selected.clear();pending=null;changed();renderLearn();fit();$('modal').close();if(taskSheet.matches)returnToBoard();toast('Follow a signal through the circuit. Undo returns to your design.');}catch(e){toast(e.message,'error');}
  };
}
async function exportCircuit(share=false) {
  const data={version:2,level:activeKey(),circuit:graph,inputs,practice};
  try {if(await (share?platform.shareFile:platform.exportFile)(`circuit-${activeKey()}.json`,JSON.stringify(data,null,2)))toast(share?'Circuit shared.':'Circuit exported. A little idea to keep.');}
  catch(e){toast(e.message||'This circuit could not be exported.','error');}
}
async function importCircuit(file) {
  if(!file)return;
  const rev=revision;
  try {
    if(file.size>1000000)throw new Error('Circuit files must be smaller than 1 MB.');
    const data=JSON.parse(await file.text());
    if(rev!==revision)return;
    if(![1,2].includes(data.version))throw new Error('This circuit uses an unsupported file version.');
    if(data.version===1){if(mode==='sandbox')data.level='sandbox';else if(Number(data.level)>=5)data.level=Number(data.level)+2;else throw new Error('Open Free play mode to explore a circuit from the old opening lessons.');}
    const g=validGraph(data.circuit);
    if(String(data.level)!==activeKey())throw new Error('Open the matching lesson (or Free play mode for sandbox files) before importing this circuit.');
    cancelGesture();remember();graph=clone(g);inputs=sortedInputs().map((n,i)=>Number.isInteger(data.inputs?.[i])?Math.max(0,Math.min((1<<n.width)-1,data.inputs[i])):0);practice=!!data.practice;selected.clear();pending=null;changed();renderLearn();renderClock();fit();toast('Your circuit is home.');
  } catch(e){toast(e.message||'This circuit file could not be read.','error');}
}

export function handleBack() {
  const dialogs=[...document.querySelectorAll('dialog[open]')];
  if(dialogs.length){dialogs.at(-1).close();return true;}
  if($('journey-sidebar').classList.contains('open')){toggleJourney(false);return true;}
  if(pending||drag||inventoryActive){cancelGesture();return true;}
  if(taskSheet.matches&&taskOpen){setTaskVisible(false);return true;}
  return false;
}
function bindEvents() {
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-design-notes]'))showGuide(handbookSpreads.findIndex(spread=>spread.id==='design')*2);
  });
  const buttons={'undo-button':'undo','redo-button':'redo','arrange-button':'align','export-button':'download','import-button':'upload','clear-button':'trash','delete-button':'trash','fit-button':'fit','flow-button':'arrow'};
  for(const [id,name] of Object.entries(buttons))$(id).innerHTML=icon(name);
  document.querySelector('.modal-close').innerHTML=icon('close');
  document.querySelector('.clock-icon').innerHTML=icon('clock');
  $('tick-button').innerHTML=icon('step')+'Step clock';
  $('guide-button').innerHTML=icon('book')+'<span>Lab handbook</span>';
  $('guide-button').onclick=()=>showGuide();
  $('back-to-board').onclick=returnToBoard;
  $('task-scrim').onclick=()=>setTaskVisible(false);
  $('expected-button').innerHTML=icon('expectation')+'<span>Expected results</span>';
  $('expected-button').onclick=showExpected;
  $('close-expected').innerHTML=icon('close');
  $('close-expected').onclick=()=>$('expected-dialog').close();
  $('expected-done').onclick=()=>{$('expected-dialog').close();returnToBoard();};
  $('expected-dialog').addEventListener('close',()=>$('expected-button').setAttribute('aria-expanded','false'));
  singleGuidePage.addEventListener('change',()=>{
    if($('modal').open&&$('modal').dataset.kind==='handbook'){
      $('modal').getAnimations({subtree:true}).forEach(animation=>animation.cancel());
      showGuide();
    }
  });
  $('modal').addEventListener('close',()=>{
    if($('modal').dataset.kind==='handbook')writeStorage('welcome',true);
    $('modal').getAnimations({subtree:true}).forEach(animation=>animation.cancel());
  });
  $('undo-button').onclick=undo;$('redo-button').onclick=redo;$('fit-button').onclick=fit;
  $('arrange-button').innerHTML=icon('align')+'<span>Tidy circuit</span>';
  $('arrange-button').onclick=()=>{
    cancelGesture();
    const arranged=layout(graph);
    if(arranged.nodes.some((n,i)=>n.x!==graph.nodes[i].x||n.y!==graph.nodes[i].y)){remember(true);graph=arranged;changed(false);}
    fit();toast('Circuit tidied from inputs to outputs. Undo restores your layout.');
  };
  $('check-button').onclick=checkCircuit;$('clear-button').onclick=clearBoard;
  $('delete-button').onclick=deleteSelected;
  $('export-button').onclick=()=>exportCircuit();
  $('share-button').hidden=!platform.shareFile;
  $('share-button').innerHTML=icon('share');
  $('share-button').onclick=()=>exportCircuit(true);$('import-button').onclick=platform.bindFileImport(importCircuit);
  $('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);
  $('tick-button').onclick=()=>runSimulation(true);
  $('reset-clock').onclick=()=>{memory={};ticks=0;++revision;renderClock();runSimulation();toast('Memory reset to zero.');};
  $('journey-nav').onclick=()=>toggleJourney();$('sandbox-nav').onclick=()=>loadLevel('sandbox');
  $('close-journey').onclick=()=>toggleJourney(false);$('journey-scrim').onclick=()=>toggleJourney(false);
  $('task-toggle').onclick=()=>{
    if(taskOpen)setTaskVisible(false);else openTask();
  };
  taskSheet.addEventListener('change',()=>setTaskVisible(taskOpen,false));
  $('path-toggle').onchange=e=>setPathVisible(e.target.checked);
  $('flow-button').onclick=()=>{const off=$('flow-button').getAttribute('aria-pressed')==='true';$('flow-button').setAttribute('aria-pressed',String(!off));flow.setPaused(off);};
  document.querySelector('.brand').onclick=e=>{e.preventDefault();loadLevel(1);};
  $('learning-path').onclick=e=>{
    if(e.target.closest('#hide-path')){setPathVisible(false);$('journey-nav').focus();return;}
    const stop=e.target.closest('[data-path]');if(!stop)return;const chapter=Number(stop.dataset.path);openChapters.add(chapter);renderSidebar();toggleJourney(true);document.querySelector(`[data-chapter="${chapter}"]`).scrollIntoView({block:'start'});};
  $('task-navigation').onclick=e=>{
    if(e.target.closest('[data-return]'))loadLevel(lastJourney);
    if(e.target.closest('[data-previous]:not(:disabled)'))loadLevel(catalog.levels[lessonIndex()-1].id);
    if(e.target.closest('[data-forward]')){if(progress.completed[current.id])loadLevel(nextLevel()?.id||'sandbox');else showSkip();}
  };
  $('close-results').onclick=()=>$('results-dialog').close();
  $('lesson-list').onclick=e=>{
    const lesson=e.target.closest('[data-level]'),chapter=e.target.closest('[data-chapter]');
    if(lesson)loadLevel(Number(lesson.dataset.level));
    if(chapter){const i=Number(chapter.dataset.chapter);openChapters.has(i)?openChapters.delete(i):openChapters.add(i);renderSidebar();}
  };
  $('parts').onclick=e=>{const el=e.target.closest('[data-part]');if(el)addPart(el.dataset.part,Number(el.dataset.width));};
  const dropPosition=e=>{
    const world=worldPoint(e);
    return {x:onGrid(world.x-BLOCK_SIZE.w/2),y:onGrid(world.y-BLOCK_SIZE.h/2)};
  };
  cancelInventoryDrag=bindInventoryDrag($('parts'),{
    board:$('canvas-wrap'),
    onActive:active=>{inventoryActive=active;if(active){pending=null;setHoverPin(null);updateSignals();}renderGesture();},
    preview:button=>`<svg viewBox="0 0 144 144" width="144" height="144">${drawNode({id:0,kind:button.dataset.part,width:Number(button.dataset.width),name:button.dataset.name,x:0,y:0})}</svg>`,
    position:e=>{
      const r=canvas.getBoundingClientRect(),valid=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
      const p=dropPosition(e),scale=camera.scale;
      return {valid,scale,x:valid?r.left+(p.x-camera.x)*scale:e.clientX-72*scale,y:valid?r.top+(p.y-camera.y)*scale:e.clientY-72*scale};
    },
    place:(button,e)=>addPart(button.dataset.part,Number(button.dataset.width),dropPosition(e))
  });
  $('learn-panel').onclick=e=>{
    if(e.target.closest('[data-inputs]'))tryTableRow(e);
    if(e.target.closest('[data-all-cases]'))showExpected();
    if(e.target.id==='inside-toggle'){showInside=e.target.checked;renderParts();}
    if(e.target.closest('#hint-button'))revealHint();
    if(e.target.closest('#example-button'))showExample();
    if(e.target.closest('#start-fresh'))clearBoard();
  };
  $('test-panel').onclick=e=>{const page=e.target.closest('[data-test-page]');if(page){testPage=Number(page.dataset.testPage);renderTest();}else tryTableRow(e);};
  $('expected-panel').onclick=e=>{const page=e.target.closest('[data-test-page]');if(page){expectedPage=Number(page.dataset.testPage);renderExpected();$('expected-panel').scrollTop=0;}else tryTableRow(e);};
  for(const panel of [$('learn-panel'),$('test-panel'),$('expected-panel')])panel.onkeydown=e=>{if(e.target.closest('[data-inputs]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();tryTableRow(e);}};
  document.querySelector('.modal-close').onclick=()=>$('modal').close();
  for(const dialog of document.querySelectorAll('dialog'))dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}};
  $('cancel-gesture').onclick=cancelGesture;
  window.addEventListener('blur',cancelGesture);
  document.addEventListener('contextmenu',e=>{if(pending||inventoryActive||drag){e.preventDefault();e.stopPropagation();cancelGesture();}},true);
  const pinchPoints=()=>[...pointers.values()];
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==1)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){
      const savedPointers=[...pointers];cancelGesture();
      for(const [id,p] of savedPointers){pointers.set(id,p);canvas.setPointerCapture(id);}
      const [a,b]=pinchPoints(),rect=canvas.getBoundingClientRect();
      const mid={x:(a.x+b.x)/2-rect.left,y:(a.y+b.y)/2-rect.top};
      pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:camera.scale,world:{x:camera.x+mid.x/camera.scale,y:camera.y+mid.y/camera.scale}};
      return;
    }
    e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    hoverWire=null;renderWireTrace();
    const point=worldPoint(e),modifier=e.shiftKey||e.ctrlKey||e.metaKey;
    const pan=()=>{drag={type:'pan',pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,x:camera.x,y:camera.y};canvas.classList.add('panning');};
    if(e.button===1||spaceDown){pan();return;}
    const nodeEl=e.target.closest('[data-node]'),wireEl=wireAt(e);
    const pinInfo=nearestPin(e)||(pending&&wireEl?wireSource(wireEl):null);
    if(pinInfo&&!modifier){
      const p=parsePin(pinInfo),wire=!pending&&!p.output?incoming.get(`${p.id}:${p.index}`):null;
      drag={type:'pin',pointerId:e.pointerId,start:pinInfo,wire,clientX:e.clientX,clientY:e.clientY,moved:false};
      selectPin(pinInfo);return;
    }
    if(pending){cancelGesture();return;}
    if(nodeEl){
      const id=Number(nodeEl.dataset.node),key=nodeSelection(id),wasGroup=selected.size>1&&selected.has(key);
      if(modifier||!selected.has(key))selectObject(key,modifier);
      if(!selected.has(key))return;
      drag={type:'node',pointerId:e.pointerId,id,start:point,originals:selectedNodes().map(({id,x,y})=>({id,x,y})),moved:false,
        collapse:!modifier&&wasGroup,toggle:!modifier&&!wasGroup&&!!e.target.closest('[data-toggle]')};
      drag.whole=drag.originals.length===graph.nodes.length;
      return;
    }
    if(wireEl){
      selectObject(wireEl.dataset.selection,modifier);
      if(!modifier)drag={type:'wire',pointerId:e.pointerId,start:wireSource(wireEl),clientX:e.clientX,clientY:e.clientY,moved:false};
      return;
    }
    if(e.pointerType==='touch'){pan();return;}
    drag={type:'marquee',pointerId:e.pointerId,start:point,end:point,before:new Set(selected),additive:modifier,moved:false};
    if(!modifier){selected.clear();updateSelection();}
  });
  canvas.addEventListener('pointermove',e=>{
    if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size===2){
      const [a,b]=pinchPoints(),rect=canvas.getBoundingClientRect();
      camera.scale=Math.max(.15,Math.min(2,pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance)));
      camera.x=pinch.world.x-((a.x+b.x)/2-rect.left)/camera.scale;
      camera.y=pinch.world.y-((a.y+b.y)/2-rect.top)/camera.scale;
      applyCamera();return;
    }
    const point=worldPoint(e);
    if(!drag&&!pending){hoverWire=wireAt(e)?.dataset.key||null;renderWireTrace();}
    if(drag&&drag.pointerId!==e.pointerId)return;
    if((drag?.type==='pin'||drag?.type==='wire')&&!drag.moved&&Math.hypot(e.clientX-drag.clientX,e.clientY-drag.clientY)>4){
      drag.moved=true;
      if(drag.type==='wire'){drag.type='pin';selectPin(drag.start);}
      if(drag.wire&&pending){
        const w=drag.wire;
        // Keep the circuit intact until drop; reuse the normal connection preview.
        pending={id:w.from,index:w.output,output:true,wire:w};
        updateSignals();
      }
    }
    hoverPoint=point;
    if(pending){
      const target=connectionTarget(e);
      hoverWire=target.wire?.dataset.key||null;renderWireTrace();
      setHoverPin(target.pin);queueBoardFrame();
    }
    if(!drag)return;
    if(drag.type==='pan'){camera.x=drag.x-(e.clientX-drag.clientX)/camera.scale;camera.y=drag.y-(e.clientY-drag.clientY)/camera.scale;applyCamera();}
    if(drag.type==='marquee'){
      drag.end=point;
      if(Math.hypot(point.x-drag.start.x,point.y-drag.start.y)*camera.scale>=4)drag.moved=true;
      queueBoardFrame();
    }
    if(drag.type==='node'){
      const dx=point.x-drag.start.x,dy=point.y-drag.start.y;
      if(!drag.moved&&Math.hypot(dx,dy)*camera.scale<5)return;
      if(!drag.moved){drag.futureBefore=future;remember(true);drag.moved=true;renderGesture();}
      for(const original of drag.originals){const n=nodeMap.get(original.id);n.x=original.x+dx;n.y=original.y+dy;}
      queueBoardFrame();
    }
  });
  canvas.addEventListener('pointerup',e=>{
    pointers.delete(e.pointerId);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(pinch){if(pointers.size<2)pinch=null;drag=null;return;}
    if(!drag||drag.pointerId!==e.pointerId)return;
    const action=drag;drag=null;
    if(action.type==='pin'){
      const target=connectionTarget(e).pin;
      if(pending&&action.moved){if(target&&target!==action.start)selectPin(target);if(pending)cancelGesture();}
    }
    if(action.type==='node'){
      if(action.moved)finishNodeDrag(action);
      else if(action.collapse)selectObject(nodeSelection(action.id));
      else if(action.toggle)changeInput(action.id);
    }
    if(action.type==='marquee'){
      if(action.moved){action.end=worldPoint(e);renderMarquee(action);}
      $('selection-box').setAttribute('visibility','hidden');
    }
    canvas.classList.remove('panning');renderGesture();
  });
  canvas.addEventListener('pointercancel',cancelGesture);
  canvas.addEventListener('pointerleave',()=>{hoverWire=null;renderWireTrace();});
  canvas.addEventListener('focusin',e=>{hoverWire=e.target.closest('[data-wire]')?.dataset.key||null;renderWireTrace();});
  canvas.addEventListener('focusout',()=>{hoverWire=null;renderWireTrace();});
  canvas.addEventListener('contextmenu',e=>{const wire=wireAt(e);if(wire){e.preventDefault();if(!selected.has(wire.dataset.selection))selectObject(wire.dataset.selection);deleteSelected();}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX,y:e.clientY});},{passive:false});
  document.addEventListener('keyup',e=>{if(e.code==='Space'||e.key===' '){spaceDown=false;canvas.classList.remove('pan-ready');}});
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;
    if(e.key==='?' ){e.preventDefault();showGuide();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&e.target.closest('.workbench')){
      e.preventDefault();cancelGesture();selected=new Set([...graph.nodes.map(n=>nodeSelection(n.id)),...graph.wires.map(wireSelection)]);updateSelection();return;
    }
    if(e.key==='Escape'){
      if(taskSheet.matches&&taskOpen&&!$('journey-sidebar').classList.contains('open')){e.preventDefault();setTaskVisible(false);return;}
      e.preventDefault();toggleJourney(false);const active=pending||drag||inventoryActive;cancelGesture();if(!active)selected.clear();updateSelection();return;
    }
    if(taskSheet.matches&&taskOpen)return;
    if(e.key.toLowerCase()==='f'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();fit();return;}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();return;}
    const pinEl=e.target.closest('[data-pin]'),nodeEl=e.target.closest('[data-node]'),toggle=e.target.closest('[data-toggle]'),wire=e.target.closest('[data-wire]');
    if(e.key==='Enter'||e.key===' '){
      if(pinEl){e.preventDefault();selectPin(pinEl.dataset.pin);}
      else if(toggle&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();changeInput(Number(toggle.dataset.toggle));}
      else if(nodeEl){e.preventDefault();selectObject(nodeSelection(Number(nodeEl.dataset.node)),e.shiftKey||e.ctrlKey||e.metaKey);}
      else if(wire){
        e.preventDefault();
        if(pending&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey)selectPin(wireSource(wire));
        else selectObject(wire.dataset.selection,e.shiftKey||e.ctrlKey||e.metaKey);
      }
      else if(e.key===' '&&e.target===canvas){e.preventDefault();spaceDown=true;canvas.classList.add('pan-ready');}
    }
    if(!pinEl&&(nodeEl||e.target===canvas)&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();
      if(nodeEl&&!selected.has(nodeSelection(Number(nodeEl.dataset.node))))selectObject(nodeSelection(Number(nodeEl.dataset.node)));
      const nodes=selectedNodes();if(!nodes.length)return;remember(true);
      const d=e.shiftKey?GRID*4:GRID;
      for(const n of nodes){n.x+=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0;n.y+=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;}
      changed(false);
    }
  });
  new ResizeObserver(()=>{if(graph)applyCamera();}).observe($('canvas-wrap'));
}
function toggleJourney(open) {
  const show=open??!$('journey-sidebar').classList.contains('open');
  $('journey-sidebar').classList.toggle('open',show);
  $('journey-sidebar').inert=!show;$('journey-scrim').hidden=!show;
  $('journey-nav').setAttribute('aria-expanded',String(show));
  if(show)$('lesson-list').querySelector('[aria-current]')?.scrollIntoView({block:'center'});
}
function migrateProgress() {
  if(readStorage('progress',null))return;
  try {
    const old=JSON.parse(platform.readText('signal-garden-v1:progress')||'null');
    if(!old)return;
    const completed={};
    for(const [id,value] of Object.entries(old.completed||{})){
      const number=Number(id),mapped={2:4,3:6,4:5}[number]||(number>=5?number+2:null);
      if(mapped)completed[mapped]=value;
    }
    writeStorage('progress',{completed});
    for(let id=5;id<=22;id++){
      const legacy=JSON.parse(platform.readText(`signal-garden-v1:circuit:${id}`)||'null');
      if(legacy){legacy.version=2;legacy.level=String(id+2);writeStorage(`circuit:${id+2}`,legacy);}
    }
    const free=JSON.parse(platform.readText('signal-garden-v1:circuit:sandbox')||'null');
    if(free){free.version=2;writeStorage('circuit:sandbox',free);}
    // The old workspace remains intact, including the retired transistor lessons.
  } catch { /* A damaged old save must not prevent a new journey. */ }
}
async function boot() {
  try {
    status('Opening your circuit lab…');
    catalog=await engine.request('catalog');if(catalog.error)throw new Error(catalog.error);
    parts=Object.fromEntries(catalog.components.map(c=>[c.key,c]));current=catalog.levels[0];
    migrateProgress();
    const saved=readStorage('progress',{completed:{}});
    progress={completed:Object.fromEntries(Object.entries(saved.completed||{}).filter(([id])=>catalog.levels.some(l=>String(l.id)===id)))};
    lastJourney=Number(readStorage('last-lesson',1));if(!catalog.levels.some(l=>l.id===lastJourney))lastJourney=1;
    bindEvents();loadLevel(readStorage('last',1));
    if(!readStorage('welcome',false))showGuide(0);
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,1100-performance.now())));
    document.body.classList.remove('app-opening');$('opening').remove();
    platform.onSuspend(flushSave);
    platform.bindBack(handleBack);
    const restoreImport=()=>{
      const data=platform.restoredImport;if(!data)return;
      platform.restoredImport=null;
      importCircuit(new File([data.contents],data.name||'circuit.json',{type:'application/json'}));
    };
    document.addEventListener('circuit-restored-import',restoreImport);restoreImport();
    platform.prepareOffline().catch(()=>{ /* Online play remains available if caching is unavailable. */ });
  } catch(e) {
    document.body.classList.remove('app-opening');$('opening').remove();
    document.querySelector('main').innerHTML=`<div class="error-state"><span class="lesson-tag">THE LAB IS ALMOST READY</span><h1>Let’s reopen the lab.</h1><p>The circuit engine couldn’t start. Reload to try again. Your saved circuits stay on this device.</p><p>${esc(e.message)}</p><button id="retry-button" class="button primary">Try again</button></div>`;
    $('retry-button').onclick=()=>location.reload();
  }
}
boot();
