import fs from 'node:fs/promises';
import path from 'node:path';
export async function connectBrowser(debug='http://127.0.0.1:18438',out=path.resolve('test-artifacts')) {
  await fs.mkdir(out,{recursive:true});
  const pages=await (await fetch(`${debug}/json/list`,{signal:AbortSignal.timeout(10000)})).json();
  const page=pages.find(p=>p.type==='page');
  if(!page)throw new Error('The test browser has no open page.');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.close();reject(new Error('Test browser connection timed out.'));},10000);
    ws.onopen=()=>{clearTimeout(timer);resolve();};
    ws.onerror=()=>{clearTimeout(timer);reject(new Error('Could not connect to the test browser.'));};
  });
  let id=0;const pending=new Map(),errors=[],listeners=new Map();
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+' '+(m.params.exceptionDetails.exception?.description||''));
    for(const listener of listeners.get(m.method)||[])listener(m.params);
  };
  function disconnected(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('The test browser disconnected.'));}pending.clear();}
  ws.onclose=disconnected;ws.onerror=disconnected;
  function send(method,params={}){return new Promise((resolve,reject)=>{
    if(ws.readyState!==WebSocket.OPEN){reject(new Error('The test browser is not connected.'));return;}
    const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(new Error(`Browser command timed out: ${method}`));},30000);
    pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));
  });}
  async function js(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  async function wait(expression,label=expression){for(let i=0;i<100;++i){if(await js(expression))return;await delay(100);}throw new Error(`Timed out: ${label}`);}
  async function assert(expression,label){if(!await js(expression))throw new Error(label);console.log('PASS',label);}
  async function click(selector){await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});})()`);await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await mouse(p);await js('new Promise(resolve=>requestAnimationFrame(resolve))');}
  async function mouse(p){await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  async function key(key,code=key,modifiers=0){const windowsVirtualKeyCode=({Enter:13,' ':32,Tab:9,Escape:27,Delete:46,Backspace:8})[key];const params={key,code,modifiers,windowsVirtualKeyCode};await send('Input.dispatchKeyEvent',{type:'keyDown',...params,text:key==='Enter'?'\r':key===' '?' ':undefined});await send('Input.dispatchKeyEvent',{type:'keyUp',...params});}
  async function pin(id,port,out){await click(`[data-pin="${id}:${port}:${out}"] .pin-dot`);}
  async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(out,name),Buffer.from(r.data,'base64'));}
  function on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);return ()=>listeners.get(method).delete(listener);}
  return {send,js,delay,wait,assert,click,mouse,key,pin,screenshot,errors,on,close:()=>ws.close()};
}
