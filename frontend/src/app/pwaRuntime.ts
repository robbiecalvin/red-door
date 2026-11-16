export function appScopeUrl(): URL { return new URL('./', document.baseURI); }
export async function registerAppWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('App installation needs a secure browser connection.');
  const scope=appScopeUrl();
  return navigator.serviceWorker.register(new URL('sw.js',scope).href,{scope:scope.pathname,updateViaCache:'none'});
}
export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone===true;
}
export function isAppleMobile(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}
