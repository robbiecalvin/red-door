import type { apiClient, Session } from "./api";
type Api=ReturnType<typeof apiClient>;
export async function pushRegistration() { if(!("serviceWorker" in navigator) || !("PushManager" in window))throw new Error("This browser does not support push. On iPhone or iPad, add Red Door to your Home Screen first.");return navigator.serviceWorker.register(new URL("sw.js",document.baseURI).href,{scope:new URL("./",document.baseURI).pathname}); }
export async function enablePush(api:Api,session:Session) {
  if(!session.userId)throw new Error("Create an account to enable closed-app notifications.");
  const config=await api.memberRequest<{publicKey:string;configured:boolean}>(session.sessionToken,"/notifications/push");if(!config.configured)throw new Error("Closed-app notifications are not available until the app’s public URL is configured.");
  const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Allow notifications in your browser’s site settings to continue.");
  const registration=await pushRegistration();await navigator.serviceWorker.ready;
  const key=config.publicKey.replace(/-/g,"+").replace(/_/g,"/");const bytes=Uint8Array.from(atob(key+"=".repeat((4-key.length%4)%4)),c=>c.charCodeAt(0));
  const subscription=await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  try {await api.memberRequest(session.sessionToken,"/notifications/push",subscription.toJSON());}catch(e){await subscription.unsubscribe();throw e;}
  return subscription;
}
export async function disablePush(api:Api,session:Session) {
  if(!("serviceWorker" in navigator))return;const registration=await navigator.serviceWorker.getRegistration(new URL("./",document.baseURI).href),subscription=await registration?.pushManager.getSubscription();if(!subscription)return;
  await api.memberRequest(session.sessionToken,"/notifications/push",{endpoint:subscription.endpoint},"DELETE");await subscription.unsubscribe();
}
