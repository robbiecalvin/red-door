import { appScopeUrl, registerAppWorker } from "./pwaRuntime";
import type { apiClient, Session } from "./api";
type Api=ReturnType<typeof apiClient>;
export function supportsPush() {
  return window.isSecureContext && typeof Notification !== "undefined" &&
    "serviceWorker" in navigator && "PushManager" in window;
}
function assertPushSupported() {
  if (!supportsPush()) {
    throw new Error("This browser does not support push. On iPhone or iPad, add Badehaus X to your Home Screen first.");
  }
}
export async function getPushSubscription() {
  if (!supportsPush()) return null;
  const registration = await navigator.serviceWorker.getRegistration(appScopeUrl().href);
  return await registration?.pushManager.getSubscription() ?? null;
}
export async function pushRegistration() {
  assertPushSupported();
  return registerAppWorker();
}
export async function enablePush(api:Api,session:Session) {
  if(!session.userId)throw new Error("Create an account to enable closed-app notifications.");
  assertPushSupported();
  // Browsers such as Safari require the permission request to start during the tap.
  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission === "denied") throw new Error("Notifications are blocked. Allow them in your browser or device settings.");
  if (permission !== "granted") throw new Error("Notification permission was not granted. Try again when you’re ready.");
  const config=await api.memberRequest<{publicKey:string;configured:boolean}>(session.sessionToken,"/notifications/push");if(!config.configured)throw new Error("Closed-app notifications are not available until the app’s public URL is configured.");
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
