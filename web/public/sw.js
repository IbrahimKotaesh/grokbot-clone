const CACHE = 'grokbot-public-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('grokbot-public-') && key !== CACHE).map(key => caches.delete(key))))]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache account data, chat, OAuth callbacks, or API responses.
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(async cache => {
          await cache.put(event.request, copy);
          const keys = await cache.keys();
          for (const key of keys.filter(k => new URL(k.url).pathname.startsWith('/assets/')).slice(0, -30)) await cache.delete(key);
        }));
      }
      return response;
    })));
  }
});

// Every received push displays a visible notification, including when Fino is closed.
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()??{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Fino',{
  body:data.body||'Open Fino to read your update.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
  tag:data.tag||'fino-update',data:{url:data.url||'/'},timestamp:Date.now(),
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let target=new URL(event.notification.data?.url||'/',self.location.origin);
  if(target.origin!==self.location.origin)target=new URL('/',self.location.origin);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(new URL(client.url).origin===target.origin){client.postMessage({type:'fino-open-notification',url:target.href});return client.focus();}
  return self.clients.openWindow(target.href);
 })());
});
