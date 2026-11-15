import webpush from "web-push";
import type { AuthService } from "./authService";
import type { CommunityRepository } from "../repositories/communityRepository";
export function validPushSubscription(value: unknown): value is webpush.PushSubscription {
  if(!value || typeof value!=="object")return false;
  const v=value as webpush.PushSubscription;
  try {const url=new URL(v.endpoint);return url.protocol==="https:" && url.port==="" && !url.username && !url.password && /(^|\.)(push\.services\.mozilla\.com|fcm\.googleapis\.com|web\.push\.apple\.com|notify\.windows\.com)$/.test(url.hostname) && v.endpoint.length<2048 && /^[\w-]{87,88}$/.test(v.keys.p256dh) && /^[\w-]{22,24}$/.test(v.keys.auth);}catch{return false;}
}
export async function createPushService(repo:CommunityRepository,auth:AuthService,appUrl:string) {
  const keys=await repo.setting("vapid",()=>webpush.generateVAPIDKeys());
  let origin: URL | null=null;try {origin=new URL(appUrl);}catch{}
  const configured=Boolean(origin && (origin.protocol==="https:" || origin.hostname==="localhost"));
  const contact=origin ? `https://${origin.host}/` : "https://example.invalid/";
  return {publicKey:keys.publicKey,configured,async notify(userId:string) {
    const user=auth.getUser(userId);if(!configured || !user || user.bannedAtMs)return;
    for(const subscription of user.plusData?.pushSubscriptions ?? []) {
      try {await webpush.sendNotification(subscription,JSON.stringify({title:"Red Door",body:"You have a new message.",url:new URL("#/threads",appUrl).href}),{vapidDetails:{subject:contact,publicKey:keys.publicKey,privateKey:keys.privateKey},TTL:300,timeout:5000});}
      catch(e){if([404,410].includes((e as {statusCode:number}).statusCode)){const current=auth.getUser(userId);if(current)auth.updatePlus(userId,{plusData:{...current.plusData,pushSubscriptions:current.plusData?.pushSubscriptions?.filter(s=>s.endpoint!==subscription.endpoint)}});}}
    }
  }};
}
