const CACHE="kakeibokun-v2";
const ASSETS=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cached=await caches.match(request);
    // Retrieve the newest UI when online; retain the cached copy when offline.
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),1800);
    try{
      const response=await fetch(request,{signal:ctrl.signal,cache:"no-cache"});
      if(!response.ok)throw Error("Network "+response.status);
      const store=await caches.open(CACHE);
      await store.put(request,response.clone());
      return response;
    }catch(e){
      if(cached)return cached;
      return new Response("オフラインで利用できません。再接続してください。",{status:503,headers:{"Content-Type":"text/plain;charset=utf-8"}});
    }finally{clearTimeout(timer);}
  })());
});
