const replies=new Map<string,string>();
export function queueReply(peerKey:string,excerpt:string){const quote=excerpt.slice(0,220);replies.set(peerKey,quote);window.dispatchEvent(new CustomEvent("rd:compose-reply",{detail:{peerKey,quote}}));}
export function peekReply(peerKey:string){return replies.get(peerKey) ?? "";}
export function clearReply(peerKey:string){replies.delete(peerKey);}
