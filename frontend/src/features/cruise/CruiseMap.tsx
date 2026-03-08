import React, { useEffect, useMemo, useState } from "react";

import { useCruisePresence } from "./CruisePresence";
import type { CruisePresenceUpdate } from "./cruise.types";
import { MapView } from "../map/MapView";
import type { LngLat, MapMarker, MapViewOptions } from "../map/map.types";
import placeholderA from "../../assets/reddoor-placeholder-1.svg";
import placeholderB from "../../assets/reddoor-placeholder-2.svg";
import placeholderC from "../../assets/reddoor-placeholder-3.svg";

type GeoStatus =
  | { kind: "pending" }
  | { kind: "granted"; center: LngLat }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

const AVATARS = [placeholderA, placeholderB, placeholderC] as const;

function hashKey(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function avatarForKey(key: string): string {
  return AVATARS[hashKey(key) % AVATARS.length];
}

function toMarkers(
  presence: ReadonlyArray<CruisePresenceUpdate>,
  avatarByKey?: Readonly<Record<string, string>>,
  onMarkerSelect?: (key: string) => void
): ReadonlyArray<MapMarker> {
  return presence.map((p) => ({
    id: p.key,
    position: { lat: p.lat, lng: p.lng },
    color: "#C00000",
    label: p.status ? `Presence: ${p.status}` : "Presence",
    imageUrl: avatarByKey?.[p.key] ?? avatarForKey(p.key),
    onClick: onMarkerSelect ? () => onMarkerSelect(p.key) : undefined
  }));
}

export function CruiseMap({
  wsUrl,
  sessionToken,
  jwt,
  defaultCenter,
  defaultZoom,
  presenceUpdates,
  realtimeErrorMessage,
  onMarkerSelect,
  avatarByKey,
  additionalMarkers,
  height,
  visible,
  travelPickerArmed,
  onToggleTravelPicker,
  onTravelLocationSelected
}: Readonly<{
  wsUrl: string;
  sessionToken?: string;
  jwt?: string;
  // Binding requirement: when geolocation is denied, map must still render centered on a default city.
  // This center is provided by the app (do not infer a city here).
  defaultCenter: LngLat;
  defaultZoom?: number;
  presenceUpdates?: ReadonlyArray<CruisePresenceUpdate>;
  realtimeErrorMessage?: string | null;
  onMarkerSelect?: (key: string) => void;
  avatarByKey?: Readonly<Record<string, string>>;
  additionalMarkers?: ReadonlyArray<MapMarker>;
  height?: number | string;
  visible?: boolean;
  travelPickerArmed?: boolean;
  onToggleTravelPicker?: () => void;
  onTravelLocationSelected?: (coords: LngLat) => void;
}>): React.ReactElement {
  const live = useCruisePresence({ wsUrl, sessionToken, jwt, disabled: Array.isArray(presenceUpdates) });
  const state = presenceUpdates ? { byKey: new Map(presenceUpdates.map((p) => [p.key, p])) as ReadonlyMap<string, CruisePresenceUpdate> } : live.state;
  const lastErrorMessage = realtimeErrorMessage ?? live.lastErrorMessage;

  const [geo, setGeo] = useState<GeoStatus>({ kind: "pending" });

  useEffect(() => {
    if (!("geolocation" in navigator) || !navigator.geolocation) {
      setGeo({ kind: "unavailable" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          kind: "granted",
          center: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeo({ kind: "denied" });
          return;
        }
        if (err.code === err.TIMEOUT) {
          setGeo({ kind: "error", message: "Timed out while trying to read your location. Showing the default map view." });
          return;
        }
        setGeo({ kind: "error", message: err.message || "Geolocation error." });
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 30_000 }
    );
  }, []);

  const presenceArray = useMemo(() => Array.from(state.byKey.values()), [state.byKey]);
  const markers = useMemo(
    () => [...toMarkers(presenceArray, avatarByKey, onMarkerSelect), ...(additionalMarkers ?? [])],
    [additionalMarkers, avatarByKey, onMarkerSelect, presenceArray]
  );

  const view: MapViewOptions = useMemo(() => {
    const zoom = typeof defaultZoom === "number" && Number.isFinite(defaultZoom) ? defaultZoom : 13;
    if (geo.kind === "granted") return { center: geo.center, zoom };
    return { center: defaultCenter, zoom };
  }, [defaultCenter, defaultZoom, geo]);

  const banner: React.ReactNode = useMemo(() => {
    if (geo.kind === "denied") {
      return "Location permission denied. Showing the default map view.";
    }
    if (geo.kind === "unavailable") {
      return "Geolocation is unavailable. Showing the default map view.";
    }
    if (geo.kind === "error") {
      return `Geolocation error: ${geo.message}`;
    }
    return null;
  }, [geo]);

  return (
    <section aria-label="Cruise mode map" style={{ background: "#000000", color: "#FFFFFF", fontFamily: "var(--ui)", display: "grid", gap: 8, height: "100%" }}>
      {banner ? (
        <div
          role="alert"
          aria-live="polite"
          style={{
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,58,77,0.45)",
            borderRadius: 0,
            padding: 8,
            color: "#AAAAAA",
            fontSize: 12,
            lineHeight: 1.4
          }}
        >
          {banner}
        </div>
      ) : null}

      {lastErrorMessage ? (
        <div
          role="alert"
          aria-live="polite"
          style={{
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,58,77,0.45)",
            borderRadius: 0,
            padding: 8,
            color: "#F22F2F",
            fontSize: 12,
            lineHeight: 1.4
          }}
        >
          {lastErrorMessage}
        </div>
      ) : null}

      <div style={{ background: "#111111", border: 0, borderRadius: 0, overflow: "hidden", height: typeof height === "number" || typeof height === "string" ? height : 520, position: "relative" }}>
        <MapView
          initialView={view}
          markers={markers}
          visible={visible}
          onMapClick={onTravelLocationSelected}
          cursor={travelPickerArmed ? "crosshair" : "default"}
        />
        {typeof onToggleTravelPicker === "function" ? (
          <button
            type="button"
            onClick={onToggleTravelPicker}
            aria-label={travelPickerArmed ? "Disable travel mode picker" : "Enable travel mode picker"}
            title={travelPickerArmed ? "Travel picker enabled: click map to set location" : "Enable travel picker"}
            style={{
              position: "absolute",
              left: 10,
              top: 10,
              width: 42,
              height: 42,
              borderRadius: 12,
              border: travelPickerArmed ? "1px solid rgba(63,223,255,0.95)" : "1px solid rgba(255,95,110,0.45)",
              background: travelPickerArmed
                ? "linear-gradient(180deg, rgba(13,78,94,0.95), rgba(5,41,55,0.98))"
                : "linear-gradient(180deg, rgba(25,8,12,0.9), rgba(8,5,8,0.95))",
              color: travelPickerArmed ? "#9ef4ff" : "#ffd4d8",
              fontSize: 20,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
              boxShadow: travelPickerArmed ? "0 0 0 2px rgba(63,223,255,0.2)" : "0 8px 18px rgba(0,0,0,0.3)",
              zIndex: 3,
              cursor: "pointer"
            }}
          >
            ✈
          </button>
        ) : null}
      </div>
      {travelPickerArmed ? <div style={{ color: "#9ef4ff", fontSize: 12 }}>Travel picker is active. Click a map point to set your location.</div> : null}
    </section>
  );
}
