// The build inserts a content version and the complete application asset list.
const BUILD='__BUILD_ID__';
const ASSETS=__ASSET_LIST__;
const PREFIX=`circuit-lab:${self.registration.scope}:`;
const CACHE=PREFIX+BUILD;
const urls=ASSETS.map(path=>new URL(path,self.registration.scope).href);
const assets=new Set(urls);
self.addEventListener('install',event=>{
  // An update waits for existing tabs to close, keeping each engine/UI build together.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(urls.map(url=>new Request(url,{cache:'reload'})))));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  url.search='';
  if(url.href===self.registration.scope)url.pathname+='index.html';
  if(!assets.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
});
