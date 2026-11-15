import { useEffect, useState } from "react";
import type { Session } from "./api";
declare const __DUALMODE_WS_URL__: string;
export function useLiveInbox(session:Session|null,apiBase:string): string {
  const [status,setStatus]=useState("Connecting…");
  useEffect(()=>{
    if(!session?.ageVerified || apiBase.startsWith("local:")){setStatus("Messages refresh automatically");return;}
    const configured=typeof __DUALMODE_WS_URL__==="string"?__DUALMODE_WS_URL__.trim():"";
    if(configured==="__disabled__"){setStatus("Messages refresh automatically");return;}
    const url=new URL(configured || new URL(apiBase,window.location.href).origin+"/ws",window.location.href);url.protocol=url.protocol==="https:" || url.protocol==="wss:"?"wss:":"ws:";
    let stopped=false,socket:WebSocket|null=null,timer:number|undefined,heartbeat:number|undefined,attempts=0;
    function connect(){if(stopped)return;setStatus(attempts?"Reconnecting · messages still refresh":"Connecting…");socket=new WebSocket(url);socket.onopen=()=>{attempts=0;socket?.send(JSON.stringify({type:"auth",payload:{sessionToken:session!.sessionToken}}));heartbeat=window.setInterval(()=>{if(socket?.readyState===1)socket.send(JSON.stringify({type:"heartbeat",payload:{}}));},15000);};socket.onmessage=event=>{try{const data=JSON.parse(String(event.data));if(data.type==="auth_ok" || data.type==="auth_success")setStatus("Live messages connected");if(data.type==="md_message")window.dispatchEvent(new Event("rd:md-inbox-update"));if(["chat_message","chat_read"].includes(data.type)){setStatus("Live messages connected");window.dispatchEvent(new CustomEvent("rd:inbox-update",{detail:data}));}if(data.type==="presence_removed")window.dispatchEvent(new CustomEvent("rd:presence-removed",{detail:data.payload}));}catch{}};socket.onerror=()=>{};socket.onclose=()=>{clearInterval(heartbeat);if(stopped)return;setStatus("Reconnecting · messages still refresh");timer=window.setTimeout(connect,Math.min(15000,500*2**Math.min(++attempts,5)));};}
    const focus=()=>window.dispatchEvent(new Event("rd:inbox-update"));window.addEventListener("focus",focus);const visibility=()=>{if(!document.hidden)focus();};document.addEventListener("visibilitychange",visibility);connect();
    return()=>{stopped=true;clearTimeout(timer);clearInterval(heartbeat);socket?.close(1000,"Session changed");window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility);};
  },[session?.sessionToken,session?.ageVerified,apiBase]);
  return status;
}
