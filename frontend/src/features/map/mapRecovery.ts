export type MapState = "loading" | "ready" | "degraded" | "offline" | "fatal";
export const MAP_LOAD_TIMEOUT_MS = 12000;
export const MAP_RETRY_DELAYS_MS = [1000, 3000, 8000] as const;

// One controller per mounted map. It never recreates the renderer or changes its camera.
export class MapRecovery {
  private watchdog?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private disposed = false;
  private fatal = false;
  private online = true;
  constructor(private publish: (state: MapState) => void, private reload: () => void) { this.loading(); }
  private clear() { clearTimeout(this.watchdog); clearTimeout(this.retryTimer); this.watchdog=undefined; this.retryTimer=undefined; }
  loading() {
    if(this.disposed || this.fatal)return;
    this.clear(); this.publish("loading");
    this.watchdog=setTimeout(()=>this.error(),MAP_LOAD_TIMEOUT_MS);
  }
  ready() { if(this.disposed || this.fatal || !this.online)return; this.clear(); this.publish("ready"); }
  error(fatal=false) {
    if(this.disposed || this.fatal)return;
    if(fatal){this.fatal=true;this.clear();this.publish("fatal");return;}
    this.publish(this.online?"degraded":"offline");
    if(!this.online || this.retryTimer || this.attempts>=MAP_RETRY_DELAYS_MS.length)return;
    clearTimeout(this.watchdog);
    this.retryTimer=setTimeout(()=>{this.retryTimer=undefined;this.loading();try{this.reload();}catch{this.error(true);}},MAP_RETRY_DELAYS_MS[this.attempts++]);
  }
  connectivity(online:boolean){if(this.disposed)return;this.online=online;if(!online){this.clear();this.publish("offline");}else if(!this.fatal)this.retry();}
  retry(){if(this.disposed || !this.online || this.fatal)return;this.attempts=0;this.loading();try{this.reload();}catch{this.error(true);}}
  dispose(){this.disposed=true;this.clear();}
}
