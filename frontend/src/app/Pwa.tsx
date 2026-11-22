import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Icon } from "./Icon";
import { isAppleMobile, isInstalled, registerAppWorker } from './pwaRuntime';
import './pwa.css';
declare const __DUALMODE_PWA_ENABLED__: boolean | undefined;
type InstallPrompt=Event & {prompt():Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type Context={installed:boolean;prompt:InstallPrompt|null;error:string;online?:boolean;update?:boolean;updating?:boolean;activate?():void;install():Promise<void>};
const PwaContext=createContext<Context>({installed:false,prompt:null,error:'',async install(){}});
export function PwaProvider({children}:{children:React.ReactNode}) {
  const [installed,setInstalled]=useState(isInstalled),[prompt,setPrompt]=useState<InstallPrompt|null>(null),[error,setError]=useState('');
  const [online,setOnline]=useState(navigator.onLine),[update,setUpdate]=useState(false),[updating,setUpdating]=useState(false);
  const registration=useRef<ServiceWorkerRegistration|null>(null);
  const pendingReload=useRef<(() => void) | null>(null);
  const cancelReload=useRef<(() => void) | null>(null);
  useEffect(()=>()=>cancelReload.current?.(),[]);
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
    const changed=()=>{
      if(disposed)return;
      if(pendingReload.current){pendingReload.current();return;}
      if(!controllerSeen){controllerSeen=true;return;}
      if(registration.current?.active)setUpdate(true);
    };
    const check=()=>{if(document.visibilityState==='visible')void registration.current?.update().catch(()=>{});};
    navigator.serviceWorker.addEventListener('controllerchange',changed);
    document.addEventListener('visibilitychange',check);
    void registerAppWorker().then(result=>{if(disposed)return;reg=result;registration.current=result;if(result.waiting)setUpdate(true);result.addEventListener('updatefound',found);if(result.installing)found();}).catch(()=>{if(!disposed)setError('Installation support is temporarily unavailable. You can keep using Badehaus X in this browser.');});
    return()=>{disposed=true;reg?.removeEventListener('updatefound',found);installing?.removeEventListener('statechange',state);navigator.serviceWorker.removeEventListener('controllerchange',changed);document.removeEventListener('visibilitychange',check);};
  },[]);
  async function install(){if(!prompt)return;setError('');try{await prompt.prompt();await prompt.userChoice;}catch{setError('Use your browser’s menu to install Badehaus X.');}finally{setPrompt(null);}}
  function activate() {
    if (pendingReload.current) return;
    const worker = registration.current?.waiting;
    if (!worker) {
      window.location.reload();
      return;
    }

    setError('');
    setUpdating(true);
    const stateChanged = () => {
      if (worker.state === 'activated' || worker.state === 'redundant') reload();
    };
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', stateChanged);
      cancelReload.current = null;
    };
    const reload = () => {
      if (!cancelReload.current) return;
      cleanup();
      if (navigator.onLine) window.location.reload();
      else {
        pendingReload.current = null;
        setUpdating(false);
      }
    };
    // Old workers and some browsers may never report activation. The user has
    // already requested a reload, so don't leave them on a stale page.
    const timer = setTimeout(reload, 10000);
    cancelReload.current = cleanup;
    pendingReload.current = reload;
    worker.addEventListener('statechange', stateChanged);
    try {
      worker.postMessage({ type: 'RED_DOOR_ACTIVATE_UPDATE' });
      stateChanged();
    } catch {
      reload();
    }
  }
  return <PwaContext.Provider value={{installed,prompt,error,online,update,updating,activate,install}}>{children}{!online || (update && !installed)?<aside className="rd-pwa-status" aria-label="App connection and updates"><div role="status">{!online?'You’re offline. Messages and changes need a connection.': error || 'A Badehaus X update is ready. Finish your message before reloading.'}</div>{online && update?<button className="rd-btn" disabled={updating} onClick={activate}><Icon name="update" /> {updating?'Updating…':'Reload app'}</button>:null}</aside>:null}</PwaContext.Provider>;
}
export function InstallApp({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const {installed,prompt,error,online,update,updating,activate,install}=useContext(PwaContext),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const buttonClass = iconOnly ? "rd-btn rd-install-app rd-topbar-icon" : "rd-btn rd-install-app";
  if (installed) {
    const label = updating ? "Updating…" : update ? "Update app" : "App installed";
    return <button type="button" className={buttonClass} aria-label={label} title={iconOnly ? label : undefined}
      disabled={!online || !update || updating} onClick={activate}>
      {iconOnly ? <Icon name={update || updating ? "update" : "check"} /> : label}
    </button>;
  }
  const apple=isAppleMobile();
  return <><button type="button" className={buttonClass} onClick={()=>setOpen(true)} aria-label="Install Badehaus X" title={iconOnly ? "Install Badehaus X" : undefined}>{iconOnly ? <Icon name="download" /> : <><span className="rd-install-full">Install Badehaus X</span><span className="rd-install-short" aria-hidden="true">Install app</span></>}</button>{open?<Sheet title="Install Badehaus X" eyebrow="YOUR OWN DOOR. ONE TAP AWAY." onClose={()=>setOpen(false)}><div className="rd-install-guide"><img src="./icons/icon-192.png" width="72" height="72" alt="Badehaus X app icon"/><p>Add Badehaus X to your Home Screen. Open it like an app, with no app store download.</p>{prompt && !apple?<button className="rd-btn primary" disabled={busy} onClick={()=>{setBusy(true);void install().finally(()=>setBusy(false));}}>{busy?'Opening installation…':'Install app'}</button>:apple?<ol><li>Open this website in Safari.</li><li>Tap Share, then choose <strong>Add to Home Screen</strong>. You may need to scroll down.</li><li>If offered, enable <strong>Open as Web App</strong>, then tap Add.</li></ol>:<p>Open your browser’s menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. On a computer, look for the install icon in the address bar. If those options aren’t available, open this site in Safari on iPhone or Chrome on Android.</p>}<p className="rd-caption">An internet connection is needed for people, messages, photos and payments. Notifications are optional and can be enabled after installation. Support depends on your device and browser.</p>{error?<p role="alert">{error}</p>:null}</div></Sheet>:null}</>;
}
