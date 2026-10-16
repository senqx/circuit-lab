// Real worker + offline reload, served under a subdirectory with no API backend.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {connectBrowser} from './cdp.mjs';

const root=path.resolve('dist/app'),requests=[];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');requests.push(url.pathname);
  const file=path.resolve(root,decodeURIComponent(url.pathname.slice('/lab/'.length))||'index.html');
  if(!url.pathname.startsWith('/lab/')||!file.startsWith(root+path.sep)){response.writeHead(404).end();return;}
  try {response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');response.end(await readFile(file));}
  catch {response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/lab/`;
const {send,js,wait,click,pin,assert:check,close,errors}=await connectBrowser(process.argv[2]);
const expected="document.querySelector('[data-node=\"50\"] .terminal-value')?.textContent";
try {
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await send('Page.navigate',{url});await wait("document.querySelector('[data-node]')");
  await click('#close-guide');
  await pin(1,0,1);await pin(50,0,0);await click('[data-toggle="1"] rect');
  await wait(`${expected}==='1'`);
  await check("location.pathname==='/lab/'",'The application and worker load under a subdirectory');
  await js('window.dispatchEvent(new Event("pagehide"))');
  await check("JSON.parse(localStorage.getItem('signal-garden-v2:circuit:1')).inputs[0]===1",'Suspending immediately flushes the current circuit');
  await wait('navigator.serviceWorker.controller');
  await check("(async()=>{const cache=await caches.open((await caches.keys()).find(k=>k.startsWith('circuit-lab:')));return !!(await cache.match(new URL('engine/generated/engine.wasm',location.href).href));})()",'Offline cache includes the compiled engine');
  const manifest=await js("fetch('manifest.webmanifest').then(r=>r.json())");
  assert.equal(manifest.start_url,'./');assert.equal(manifest.icons.length,2);
  assert(!requests.some(p=>p.includes('/api/')),'The app never requested a server-side simulation');
  // Stop the actual server as well as disabling networking: no network fallback can pass.
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await js('window.__oldDocument=true');await send('Page.reload');
  await wait(`!window.__oldDocument && ${expected}==='1'`);
  await check('!document.querySelector(".error-state")','A fresh page and worker start offline with saved progress');
  await click('[data-toggle="1"] rect');await wait(`${expected}==='0'`);
  await click('#check-button');await wait("document.querySelector('dialog[open]')");
  await wait("JSON.parse(localStorage.getItem('signal-garden-v2:progress'))?.completed?.['1']!==undefined");
  await check("JSON.parse(localStorage.getItem('signal-garden-v2:progress'))?.completed?.['1']!==undefined",'A lesson can be completed with the server stopped');
  const results=await js(`(async()=>{
    const {engine}=await import(new URL('engine/client.mjs',document.baseURI));
    const catalog=await engine.request('catalog');let rows=0;
    for(const level of catalog.levels){
      const circuit=await engine.request('reference',{level:level.id});
      const result=await engine.request('check',{circuit,level:level.id});
      if(!result.passed)throw Error(level.title+': '+result.error);
      rows+=result.total;
    }
    const circuit=await engine.request('reference',{level:24});
    let frames=0,active=true;
    const frame=()=>{if(active){frames++;requestAnimationFrame(frame);}};requestAnimationFrame(frame);
    for(let i=0;i<5;i++)await engine.request('check',{circuit,level:24});
    active=false;
    return {lessons:catalog.levels.length,rows,frames};
  })()`);
  assert.equal(results.lessons,24);assert.equal(results.rows,2458);assert(results.frames>0,'The UI continues scheduling frames while the worker checks circuits');
  console.log('PASS Offline worker checks all 24 lessons / 2458 cases; UI remains responsive during checking');
  assert.deepEqual(errors,[]);
} finally {
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});
  server.closeAllConnections();server.close();close();
}
