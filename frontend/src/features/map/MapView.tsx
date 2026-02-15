import React, { useEffect, useMemo, useRef, useState } from "react";

import type { Map as MlMap, Marker as MlMarker, NavigationControl } from "maplibre-gl";
import type { LngLat, MapMarker, MapViewOptions } from "./map.types";

type MapStatus = { kind: "ready" } | { kind: "error"; message: string };

type MapLibreRuntime = {
  Map: new (options: Record<string, unknown>) => MlMap;
  Marker: new (options: Record<string, unknown>) => MlMarker;
  NavigationControl: new (options: Record<string, unknown>) => NavigationControl;
  Popup: new (options: Record<string, unknown>) => any;
};

async function loadMapLibre(): Promise<MapLibreRuntime> {
  // Keep the map library out of the initial module graph to avoid blank-screen failures on load.
  const mod = (await import("maplibre-gl")) as unknown;
  const candidate = (mod as { default?: unknown }).default ?? mod;
  return candidate as MapLibreRuntime;
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

function defaultRasterStyle(): Record<string, unknown> {
  // Keyless token-free basemap prioritized for reliability across environments.
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO"
      }
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap"
      }
    ]
  };
}

function markerEl(m: MapMarker): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", m.label ?? "Presence marker");
  el.style.width = "36px";
  el.style.height = "36px";
  el.style.borderRadius = "999px";
  el.style.border = `2px solid ${m.color}`;
  if (m.markerType === "spot") {
    el.style.background = "radial-gradient(circle at 30% 30%, #ff4f60, #a70013)";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.color = "#ffffff";
    el.style.fontWeight = "700";
    el.style.fontSize = "13px";
    el.textContent = typeof m.markerGlyph === "string" && m.markerGlyph.trim() ? m.markerGlyph.trim().slice(0, 2) : "SP";
  } else if (typeof m.imageUrl === "string" && m.imageUrl.trim() !== "") {
    el.style.backgroundImage = `url("${m.imageUrl}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  } else {
    el.style.background = "#000000";
  }
  el.style.padding = "0";
  el.style.cursor = typeof m.onClick === "function" ? "pointer" : "default";
  return el;
}

export function MapView({
  initialView,
  markers,
  interactive,
  visible
}: Readonly<{
  initialView: MapViewOptions;
  markers: ReadonlyArray<MapMarker>;
  interactive?: boolean;
  visible?: boolean;
}>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<MapLibreRuntime | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Array<MlMarker>>([]);

  const [status, setStatus] = useState<MapStatus>({ kind: "ready" });

  const initialCenter: LngLat = useMemo(() => initialView.center, [initialView.center]);
  const isInteractive = interactive !== false;
  const isVisible = visible !== false;

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let resizeHandler: (() => void) | null = null;
    let rafId: number | null = null;

    async function init(): Promise<void> {
      if (!containerRef.current) return;
      if (mapRef.current) return;

      try {
        if (!runtimeRef.current) {
          runtimeRef.current = await loadMapLibre();
        }
        const ml = runtimeRef.current;

        const map = new ml.Map({
          container: containerRef.current,
          style: defaultRasterStyle(),
          center: [initialCenter.lng, initialCenter.lat],
          zoom: initialView.zoom,
          interactive: isInteractive
        });

        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;

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
          // Tile/source request failures can be transient; keep the map mounted.
          if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network")) {
            return;
          }
          setStatus({ kind: "error", message });
        });

        map.once("load", () => {
          if (cancelled) return;
          setStatus({ kind: "ready" });
        });
      } catch (e) {
        if (cancelled) return;
        setStatus({ kind: "error", message: e instanceof Error ? e.message : "Map error." });
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      ro?.disconnect();
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [isInteractive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isVisible) return;
    map.resize();
    map.setCenter([initialView.center.lng, initialView.center.lat]);
    map.setZoom(initialView.zoom);
  }, [initialView.center.lat, initialView.center.lng, initialView.zoom, isVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isVisible) return;
    map.resize();
  }, [isVisible]);

  useEffect(() => {
    const map = mapRef.current;
    const ml = runtimeRef.current;
    if (!map || !ml) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

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
      if (typeof m.onClick === "function") {
        markerButton.addEventListener("click", (evt) => {
          evt.preventDefault();
          m.onClick?.();
        });
      }
      const marker = new ml.Marker({ element: markerButton } as unknown as Record<string, unknown>)
        .setLngLat([m.position.lng, m.position.lat]);
      if (popup) marker.setPopup(popup);
      marker.addTo(map);
      markersRef.current.push(marker);
    }
  }, [markers]);

  if (status.kind === "error") {
    return (
      <div
        style={{
          background: "#000000",
          color: "#F22F2F",
          border: "2px solid #C00000",
          borderRadius: 8,
          padding: 12,
          fontFamily: "var(--ui)",
          fontSize: 14,
          lineHeight: 1.4
        }}
        role="alert"
        aria-live="polite"
      >
        Map error: {status.message}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rd-maplibre"
      style={{
        width: "100%",
        height: "100%",
        background: "#000000",
        borderRadius: 8,
        overflow: "hidden"
      }}
      aria-label="Cruise map"
    />
  );
}
