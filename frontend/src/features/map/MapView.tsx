import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { Map as MlMap, Marker as MlMarker, NavigationControl } from "maplibre-gl";
import type { LngLat, MapMarker, MapViewOptions } from "./map.types";

import { MapRecovery, type MapState } from "./mapRecovery";
import { mapStyleUrl } from "./mapConfig";
declare const __DUALMODE_MAP_STYLE_URL__: string | undefined;

type MapLibreRuntime = {
  setWorkerUrl(url: string): void;
  Map: new (options: Record<string, unknown>) => MlMap;
  Marker: new (options: Record<string, unknown>) => MlMarker;
  NavigationControl: new (options: Record<string, unknown>) => NavigationControl;
  Popup: new (options: Record<string, unknown>) => any;
};

async function loadMapLibre(): Promise<MapLibreRuntime> {
  // Keep the map library out of the initial module graph to avoid blank-screen failures on load.
  const mod = (await import("maplibre-gl")) as unknown;
  const candidate = (mod as { default?: unknown }).default ?? mod;
  const runtime=candidate as MapLibreRuntime;
  runtime.setWorkerUrl(mapWorkerUrl);
  return runtime;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

function markerEl(m: MapMarker): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", m.label ?? "Presence marker");
  el.style.width = "40px";
  el.style.height = "40px";
  el.style.borderRadius = "999px";
  el.style.border = `2px solid ${m.color}`;
  el.style.touchAction = "manipulation";
  el.style.userSelect = "none";
  if (m.markerType === "spot" || m.markerType === "group") {
    if (typeof m.imageUrl === "string" && m.imageUrl.trim() !== "") {
      el.style.backgroundImage = `url("${m.imageUrl}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
    } else {
      el.style.background = "radial-gradient(circle at 30% 30%, #ff4f60, #a70013)";
      el.style.display = "grid";
      el.style.placeItems = "center";
      el.style.color = "#ffffff";
      el.style.fontWeight = "700";
      el.style.fontSize = "13px";
      const fallback = m.markerType === "group" ? "GR" : "SP";
      el.textContent = typeof m.markerGlyph === "string" && m.markerGlyph.trim() ? m.markerGlyph.trim().slice(0, 2) : fallback;
    }
  } else if (typeof m.imageUrl === "string" && m.imageUrl.trim() !== "") {
    el.style.backgroundImage = `url("${m.imageUrl}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  } else {
    el.style.background = "#000000";
  }
  el.style.padding = "0";
  el.style.cursor = typeof m.onClick === "function" ? "pointer" : "default";
  el.style.pointerEvents = "auto";
  return el;
}

export function MapView({
  initialView,
  markers,
  interactive,
  visible,
  onMapClick,
  cursor
}: Readonly<{
  initialView: MapViewOptions;
  markers: ReadonlyArray<MapMarker>;
  interactive?: boolean;
  visible?: boolean;
  onMapClick?: (position: LngLat) => void;
  cursor?: "default" | "crosshair";
}>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<MapLibreRuntime | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Array<MlMarker>>([]);
  const onMapClickRef = useRef<typeof onMapClick>(onMapClick);
  const userAdjustedViewRef = useRef<boolean>(false);

  const [status, setStatus] = useState<MapState>("loading");
  const [mapVersion, setMapVersion] = useState(0);
  const recoveryRef=useRef<MapRecovery|null>(null);

  const initialCenter: LngLat = useMemo(() => initialView.center, [initialView.center]);
  const isInteractive = interactive !== false;
  const isVisible = visible !== false;

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let resizeHandler: (() => void) | null = null;
    let rafId: number | null = null;
    let mapClickHandler: ((evt: unknown) => void) | null = null;
    let onDragStart: (() => void) | null = null;
    let onZoomStart: (() => void) | null = null;

    let resourceFailed=false;
    const controller=new MapRecovery(setStatus,()=>{
      resourceFailed=false;
      const map=mapRef.current;
      if(map)map.setStyle(mapStyleUrl(typeof __DUALMODE_MAP_STYLE_URL__==="string"?__DUALMODE_MAP_STYLE_URL__:undefined));
    });
    recoveryRef.current=controller;
    const online=()=>controller.connectivity(navigator.onLine);
    window.addEventListener("online",online); window.addEventListener("offline",online);
    let resume: (()=>void)|undefined;
    let contextLost: ((e:Event)=>void)|undefined;
    let contextRestored: (()=>void)|undefined;

    async function init(): Promise<void> {
      if (!containerRef.current) return;
      if (mapRef.current) return;

      try {
        if (!runtimeRef.current) {
          runtimeRef.current = await loadMapLibre();
        }
        // A route change or StrictMode cleanup can run while the import awaits.
        // Only the current effect may create a map in this container.
        if (cancelled || !containerRef.current || mapRef.current) return;
        const ml = runtimeRef.current;

        const map = new ml.Map({
          container: containerRef.current,
          style: mapStyleUrl(typeof __DUALMODE_MAP_STYLE_URL__ === "string" ? __DUALMODE_MAP_STYLE_URL__ : undefined),
          center: [initialCenter.lng, initialCenter.lat],
          zoom: initialView.zoom,
          attributionControl: { compact: false },
          interactive: isInteractive
        });

        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;
        setMapVersion(n=>n+1);
        contextLost=(e)=>{e.preventDefault();controller.error();};
        contextRestored=()=>{map.resize();controller.retry();};
        map.getCanvas().addEventListener("webglcontextlost",contextLost);
        map.getCanvas().addEventListener("webglcontextrestored",contextRestored);
        resume=()=>{if(document.visibilityState==="visible"){map.resize();if(!resourceFailed && map.areTilesLoaded())controller.ready();else controller.error();}};
        document.addEventListener("visibilitychange",resume);
        window.addEventListener("pageshow",resume);
        window.addEventListener("orientationchange",resume);
        if(!navigator.onLine)controller.connectivity(false);

        const resize = () => {
          map.resize();
        };
        resizeHandler = resize;
        rafId = window.requestAnimationFrame(resize);
        window.addEventListener("resize", resize);
        ro = new ResizeObserver(() => resize());
        ro.observe(containerRef.current);

        map.on("error", (evt: unknown) => {
          const message = (evt as { error?: { message?: string } }).error?.message ?? "Map error.";
          if (cancelled) return;
          resourceFailed=true;
          controller.error(/webgl|shader|context.*(create|initializ)|invalid style/i.test(message));
        });
        map.on("idle",()=>{if(!cancelled && !resourceFailed && map.isStyleLoaded() && map.areTilesLoaded())controller.ready();});
        map.on("load",()=>{if(!cancelled && !resourceFailed && map.areTilesLoaded())controller.ready();});

        mapClickHandler = (evt: unknown) => {
          const handler = onMapClickRef.current;
          if (typeof handler !== "function") return;
          const lng = (evt as { lngLat?: { lng?: unknown; lat?: unknown } }).lngLat?.lng;
          const lat = (evt as { lngLat?: { lng?: unknown; lat?: unknown } }).lngLat?.lat;
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
          handler({ lng: lng as number, lat: lat as number });
        };
        map.on("click", mapClickHandler);
        onDragStart = () => {
          userAdjustedViewRef.current = true;
        };
        onZoomStart = () => {
          userAdjustedViewRef.current = true;
        };
        map.on("dragstart", onDragStart);
        map.on("zoomstart", onZoomStart);
      } catch (e) {
        if (cancelled) return;
        controller.error(true);
      }
    }

    void init();

    return () => {
      cancelled = true;
      controller.dispose(); recoveryRef.current=null;
      window.removeEventListener("online",online);window.removeEventListener("offline",online);
      if(resume){document.removeEventListener("visibilitychange",resume);window.removeEventListener("pageshow",resume);window.removeEventListener("orientationchange",resume);}
      if(mapRef.current && contextLost)mapRef.current.getCanvas().removeEventListener("webglcontextlost",contextLost);
      if(mapRef.current && contextRestored)mapRef.current.getCanvas().removeEventListener("webglcontextrestored",contextRestored);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      ro?.disconnect();
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      if (mapClickHandler && mapRef.current) {
        mapRef.current.off("click", mapClickHandler);
      }
      if (onDragStart && mapRef.current) {
        mapRef.current.off("dragstart", onDragStart);
      }
      if (onZoomStart && mapRef.current) {
        mapRef.current.off("zoomstart", onZoomStart);
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [isInteractive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isVisible) return;
    map.resize();
    // Some mobile webviews need a post-layout tick before the map paints tiles.
    const t = window.setTimeout(() => {
      map.resize();
      if (userAdjustedViewRef.current) return;
      map.setCenter([initialView.center.lng, initialView.center.lat]);
      map.setZoom(initialView.zoom);
    }, 80);
    return () => window.clearTimeout(t);
  }, [initialView.center.lat, initialView.center.lng, initialView.zoom, isVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isVisible) return;
    map.resize();
    const t = window.setTimeout(() => map.resize(), 120);
    return () => window.clearTimeout(t);
  }, [isVisible]);

  useEffect(() => {
    const map = mapRef.current;
    const ml = runtimeRef.current;
    if (!map || !ml) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    const badgeTimers: number[] = [];
    for (const m of markers) {
      const popup =
        typeof m.label === "string" && m.label.trim() !== ""
          ? new ml.Popup({ closeButton: false, closeOnClick: true }).setHTML(
              `<div style="font-family: var(--ui); font-size: 12px; line-height: 1.35;">
                 <div style="font-weight: 600;">${escapeHtml(m.label)}</div>
               </div>`
            )
          : undefined;

      const markerButton = markerEl(m);
      const remaining = (m.rightNowExpiresAtMs ?? 0) - Date.now();
      if (remaining > 0) {
        const badge = document.createElement("span");
        badge.className = "rd-map-right-now";
        badge.setAttribute("aria-hidden", "true");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        const bolt = document.createElementNS(svg.namespaceURI, "path");
        bolt.setAttribute("d", "m13 2-9 12h7l-1 8 10-12h-7l1-8Z");
        svg.append(bolt);
        badge.append(svg);
        markerButton.append(badge);
        const label = markerButton.getAttribute("aria-label") ?? "Member";
        markerButton.setAttribute("aria-label", `${label}, Right Now`);
        badgeTimers.push(window.setTimeout(() => {
          badge.remove();
          markerButton.setAttribute("aria-label", label);
        }, remaining));
      }
      if (typeof m.onClick === "function") {
        const trigger = (evt: Event): void => {
          evt.preventDefault();
          evt.stopPropagation();
          m.onClick?.();
        };
        // Native button clicks follow a completed tap, while MapLibre handles pans and drags.
        markerButton.addEventListener("click", trigger);
      }
      const marker = new ml.Marker({ 
        element: markerButton,
        draggable: m.draggable === true
      } as unknown as Record<string, unknown>)
        .setLngLat([m.position.lng, m.position.lat]);
      if (popup) marker.setPopup(popup);
      
      if (m.draggable && typeof m.onDragEnd === "function") {
        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          m.onDragEnd?.({ lng: lngLat.lng, lat: lngLat.lat });
        });
      }
      
      marker.addTo(map);
      markersRef.current.push(marker);
    }
    return () => badgeTimers.forEach(timer => window.clearTimeout(timer));
  }, [markers, mapVersion]);

  const messages:Record<MapState,string>={loading:"Loading dark map…",ready:"",degraded:"Map coverage is incomplete. People and chat are still available.",offline:"You are offline. Map tiles may be unavailable.",fatal:"Map rendering is unavailable on this device. Use People to continue."};
  return <div style={{position:"relative",width:"100%",height:"100%",background:"#141418"}}>
    <div ref={containerRef} className="rd-maplibre" style={{width:"100%",height:"100%",background:"#141418",borderRadius:8,overflow:"hidden",cursor:cursor==="crosshair"?"crosshair":"default"}} aria-label="Cruise map"/>
    {status!=="ready"?<div className="rd-map-status" role="status" aria-live="polite"><span>{messages[status]}</span>{status!=="loading" && status!=="fatal"?<button className="rd-btn" onClick={()=>recoveryRef.current?.retry()} disabled={status==="offline"}>Retry map</button>:null}<button className="rd-btn" onClick={()=>{window.location.hash="#/discover-chat";window.dispatchEvent(new CustomEvent("rd:discover-control",{detail:{action:"show_people"}}));}}>Open People</button></div>:null}
  </div>;
}
