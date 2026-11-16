import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { isAppleMobile, isInstalled, registerAppWorker } from './pwaRuntime';
import './pwa.css';
declare const __DUALMODE_PWA_ENABLED__: boolean | undefined;
type InstallPrompt=Event & {prompt():Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type Context={installed:boolean;prompt:InstallPrompt|null;error:string;install():Promise<void>};
const PwaContext=createContext<Context>({installed:false,prompt:null,error:'',async install(){}});
export function PwaProvider({children}:{children:React.ReactNode}) {
  const [installed,setInstalled]=useState(isInstalled),[prompt,setPrompt]=useState<InstallPrompt|null>(null),[error,setError]=useState('');
  const [online,setOnline]=useState(navigator.onLine),[update,setUpdate]=useState(false),[updating,setUpdating]=useState(false);
  const registration=useRef<ServiceWorkerRegistration|null>(null),reloadRequested=useRef(false),updateTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(updateTimer.current),[]);
  useEffect(()=>{
    const before=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt);};
    const installedNow=()=>{setInstalled(true);setPrompt(null);};
    const mode=window.matchMedia('(display-mode: standalone)');
    const modeChanged=()=>setInstalled(isInstalled());
    const network=()=>setOnline(navigator.onLine);
    window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',installedNow);
    window.addEventListener('online',network);window.addEventListener('offline',network);mode.addEventListener('change',modeChanged);
    return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',installedNow);window.removeEventListener('online',network);window.removeEventListener('offline',network);mode.removeEventListener('change',modeChanged);};
  },[]);
  useEffect(()=>{
    if(typeof __DUALMODE_PWA_ENABLED__==='undefined' || !__DUALMODE_PWA_ENABLED__ || !('serviceWorker' in navigator))return;
    let disposed=false,reg:ServiceWorkerRegistration|null=null,installing:ServiceWorker|null=null;
    let controllerSeen=Boolean(navigator.serviceWorker.controller);
    const state=()=>{if(!disposed && installing?.state==='installed' && reg?.active)setUpdate(true);};
    const found=()=>{installing?.removeEventListener('statechange',state);installing=reg?.installing??null;installing?.addEventListener('statechange',state);};
    const changed=()=>{if(disposed)return;if(!controllerSeen){controllerSeen=true;return;}if(reloadRequested.current)window.location.reload();else if(registration.current?.active)setUpdate(true);};
    const check=()=>{if(document.visibilityState==='visible')void registration.current?.update().catch(()=>{});};
    navigator.serviceWorker.addEventListener('controllerchange',changed);
    document.addEventListener('visibilitychange',check);
    void registerAppWorker().then(result=>{if(disposed)return;reg=result;registration.current=result;if(result.waiting)setUpdate(true);result.addEventListener('updatefound',found);if(result.installing)found();}).catch(()=>{if(!disposed)setError('Installation support is temporarily unavailable. You can keep using Red Door in this browser.');});
    return()=>{disposed=true;reg?.removeEventListener('updatefound',found);installing?.removeEventListener('statechange',state);navigator.serviceWorker.removeEventListener('controllerchange',changed);document.removeEventListener('visibilitychange',check);};
  },[]);
  async function install(){if(!prompt)return;setError('');try{await prompt.prompt();await prompt.userChoice;}catch{setError('Use your browser’s menu to install Red Door.');}finally{setPrompt(null);}}
  function activate(){
    setUpdating(true);
    if(registration.current?.waiting){reloadRequested.current=true;registration.current.waiting.postMessage({type:'RED_DOOR_ACTIVATE_UPDATE'});
      updateTimer.current=setTimeout(()=>{reloadRequested.current=false;setUpdating(false);setError('The update has not activated yet. Check your connection and try Reload again.');},10000);}
    else window.location.reload();
  }
  return <PwaContext.Provider value={{installed,prompt,error,install}}>{children}{!online || update?<aside className="rd-pwa-status" aria-label="App connection and updates"><div role="status">{!online?'You’re offline. Messages and changes need a connection.': error || 'A Red Door update is ready. Finish your message before reloading.'}</div>{online && update?<button className="rd-btn" disabled={updating} onClick={activate}>{updating?'Updating…':'Reload app'}</button>:null}</aside>:null}</PwaContext.Provider>;
}
export function InstallApp(){
  const {installed,prompt,error,install}=useContext(PwaContext),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  if(installed)return null;
  const apple=isAppleMobile();
  return <><button type="button" className="rd-btn rd-install-app" onClick={()=>setOpen(true)}>Install Red Door</button>{open?<Sheet title="Install Red Door" eyebrow="YOUR OWN DOOR. ONE TAP AWAY." onClose={()=>setOpen(false)}><div className="rd-install-guide"><img src="./icons/icon-192.png" width="72" height="72" alt="Red Door app icon"/><p>Add Red Door to your Home Screen. Open it like an app, with no app store download.</p>{prompt && !apple?<button className="rd-btn primary" disabled={busy} onClick={()=>{setBusy(true);void install().finally(()=>setBusy(false));}}>{busy?'Opening installation…':'Install app'}</button>:apple?<ol><li>Open this website in Safari.</li><li>Tap Share, then choose <strong>Add to Home Screen</strong>. You may need to scroll down.</li><li>If offered, enable <strong>Open as Web App</strong>, then tap Add.</li></ol>:<p>Open your browser’s menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. On a computer, look for the install icon in the address bar. If those options aren’t available, open this site in Safari on iPhone or Chrome on Android.</p>}<p className="rd-caption">An internet connection is needed for people, messages, photos and payments. Notifications are optional and can be enabled after installation. Support depends on your device and browser.</p>{error?<p role="alert">{error}</p>:null}</div></Sheet>:null}</>;
}
