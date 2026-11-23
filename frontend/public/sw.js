/* Only generated, public build files are cached. Never cache API/user data or media. */
const VERSION = '__RED_DOOR_BUILD__';
const PUBLIC_FILES = /*__RED_DOOR_PUBLIC_FILES__*/[];
const CACHE_PREFIX = 'reddoor-public-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const PUBLIC_URLS = new Set(PUBLIC_FILES.map(path => new URL(path, self.registration.scope).href));
const OFFLINE_URL = new URL('offline.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)));
  // Updates wait for explicit user consent. No automatic skipWaiting.
});
self.addEventListener('message', event => {
  if (event.data?.type === 'RED_DOOR_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the previous public build for open tabs loading older lazy chunks.
    try {
      const names = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX));
      const previous = names.filter(name => name !== CACHE_NAME).slice(-1);
      await Promise.all(names.filter(name => name !== CACHE_NAME && !previous.includes(name)).map(name => caches.delete(name)));
    } catch {
      // Cache cleanup can be retried during the next update.
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request=event.request, url=new URL(request.url), scope=new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || request.headers.has('authorization') || request.headers.has('x-session-token')) return;
  if (request.mode === 'navigate') {
    // Never persist navigations, query tokens or authenticated pages.
    const relative=url.pathname.slice(scope.pathname.length);
    const publicAppQuery = (relative === '' || relative === 'index.html') &&
      /^\?(?:app=1|city=[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(url.search);
    if (url.search && !publicAppQuery) return;
    if (relative !== '' && !/^(index|discover|threads|public|profile|settings|submissions|promoted)\.html$/.test(relative)) return;
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),8000);
    event.respondWith(fetch(request,{signal:controller.signal,cache:'no-cache'}).catch(async () => (await caches.open(CACHE_NAME)).match(OFFLINE_URL).then(response => response ?? new Response('Reconnect to use Badehaus X.', {status:503,headers:{'content-type':'text/plain'}}))).finally(()=>clearTimeout(timer)));
    return;
  }
  if (url.search) return;
  const hashedAsset = /^assets\/[A-Za-z0-9_./-]+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|svg|webp|jpg)$/.test(url.pathname.slice(scope.pathname.length));
  if (!PUBLIC_URLS.has(url.href) && !hashedAsset) return;
  event.respondWith((async () => {
    // Only read our public caches; other apps on this origin remain isolated.
    const names=(await caches.keys()).filter(name=>name.startsWith(CACHE_PREFIX));
    for (const name of [CACHE_NAME,...names.filter(name=>name!==CACHE_NAME).reverse()]) {
      const response=await (await caches.open(name)).match(request);
      if(response)return response;
    }
    // Do not add arbitrary runtime URLs, even if they resemble static assets.
    return fetch(request);
  })());
});
self.addEventListener('push', event => {
  let data={};try{data=event.data.json();}catch{}
  let url=self.registration.scope;
  try{const target=new URL(data.url);if(target.origin===self.location.origin && target.pathname.startsWith(new URL(self.registration.scope).pathname) && !target.search)url=target.href;}catch{}
  event.waitUntil(self.registration.showNotification('Badehaus X',{body:'You have a new message.',tag:'reddoor-messages',icon:new URL('icons/icon-192.png',self.registration.scope).href,badge:new URL('icons/icon-192.png',self.registration.scope).href,data:{url}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{let target=self.registration.scope;try{const url=new URL(event.notification.data?.url);if(url.origin===self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname) && !url.search)target=url.href;}catch{}for(const window of windows){if(window.url.startsWith(self.registration.scope)){await window.focus();await window.navigate(target);return;}}return clients.openWindow(target);}));
});
