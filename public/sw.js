/* Madhuban Cricket PWA. Never cache authenticated /api data. */
const CACHE='madhuban-static-v3';
const STATIC=['/','/index.html','/style.css','/app.js','/firebase.js','/manifest.webmanifest','/logo-original.png','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/offline.html'];
self.addEventListener('install', e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const url=new URL(req.url);if(url.pathname.startsWith('/api/'))return;
 if(req.mode==='navigate'){
  e.respondWith(fetch(req).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put('/index.html',clone))}return r}).catch(async()=>(await caches.match('/index.html'))||(await caches.match('/offline.html'))));return;
 }
 if(STATIC.includes(url.pathname))e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(req,clone))}return r})));
});
