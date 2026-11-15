/* Notification worker only. Private API responses and media are never cached. */
self.addEventListener('push', event => {
  let data={};try{data=event.data.json();}catch{}
  let url=self.registration.scope;try{const target=new URL(data.url);if(target.origin===self.location.origin)url=target.href;}catch{}
  event.waitUntil(self.registration.showNotification('Red Door',{body:'You have a new message.',tag:'reddoor-messages',data:{url}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const target=event.notification.data?.url || self.registration.scope;for(const window of windows){if(window.url.startsWith(self.registration.scope)){await window.focus();await window.navigate(target);return;}}return clients.openWindow(target);}));
});
