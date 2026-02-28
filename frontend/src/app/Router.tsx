import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  apiClient,
  uploadToLocalSignedUrl,
  type MediaKind,
  type ProfileCutStatus,
  type ProfilePosition,
  type PublicPosting,
  type CruisingSpot,
  type Session,
  type ServiceError,
  type Submission,
  type UserProfile
} from "./api";
import type { DatingProfile } from "./api";
import { CruiseMap } from "../features/cruise/CruiseMap";
import { useCruisePresence } from "../features/cruise/CruisePresence";
import type { CruisePresenceUpdate } from "../features/cruise/cruise.types";
import { createMatchEngine } from "../features/dating/MatchEngine";
import { DatingFeed } from "../features/dating/DatingFeed";
import { ChatWindow, type ChatApiClient } from "../features/chat/ChatWindow";
import type { ChatMessage } from "../features/chat/chat.types";
import placeholderA from "../assets/reddoor-placeholder-1.svg";
import placeholderB from "../assets/reddoor-placeholder-2.svg";
import placeholderC from "../assets/reddoor-placeholder-3.svg";

type Api = ReturnType<typeof apiClient>;

type Settings = Readonly<{
  defaultCenterLat: number;
  defaultCenterLng: number;
}>;

type TopTab = "discover" | "threads" | "public" | "profile" | "settings" | "submissions" | "promoted";
type DiscoverFilter = "all" | "online" | "favorites";
type MobileCruiseTab = "map" | "chat";
type DiscoverScreen = MobileCruiseTab;
type MobilePublicTab = "ads" | "events" | "spots";
type MessageChannel = "instant" | "direct";
const FIRE_SIGNAL_TEXT = "FIRE_SIGNAL|1";
declare const __DUALMODE_WS_URL__: string | undefined;

type ProfileDraft = Readonly<{
  displayName: string;
  age: string;
  bio: string;
  heightInches: string;
  race: string;
  cockSizeInches: string;
  cutStatus: "" | ProfileCutStatus;
  weightLbs: string;
  position: "" | ProfilePosition;
  discreetMode: boolean;
  travelEnabled: boolean;
  travelLat: string;
  travelLng: string;
  lookingForMore: string;
}>;

function cardStyle(): React.CSSProperties {
  return {
    background:
      "radial-gradient(500px 220px at 10% 0%, rgba(255,28,46,0.15), transparent 58%), linear-gradient(180deg, rgba(8,8,10,0.88), rgba(4,4,5,0.9))",
    border: "1px solid rgba(255,56,74,0.56)",
    borderRadius: 20,
    padding: 14,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(0,0,0,0.28), 0 16px 32px rgba(0,0,0,0.42)"
  };
}

function buttonPrimary(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? "rgba(90,90,90,0.55)" : "linear-gradient(180deg, #ff2136, #c60012)",
    border: "1px solid rgba(255,70,90,0.68)",
    color: disabled ? "#999999" : "#FFFFFF",
    padding: "10px 18px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.04em",
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    boxShadow: disabled ? "none" : "inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 22px rgba(198,0,18,0.34)"
  };
}

function buttonSecondary(disabled: boolean): React.CSSProperties {
  return {
    background: "rgba(0,0,0,0.58)",
    border: "1px solid rgba(255,58,77,0.62)",
    color: "#3fdfff",
    padding: "10px 18px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.03em",
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    opacity: disabled ? 0.6 : 1
  };
}

function fieldStyle(): React.CSSProperties {
  return {
    background: "rgba(6,7,10,0.92)",
    color: "#ffffff",
    border: "1px solid rgba(255,64,82,0.48)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 15
  };
}

function toUserKey(userId: string): string {
  return `user:${userId}`;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function normalizeErrorMessage(e: unknown): string {
  const err = e as ServiceError;
  return isString(err?.message) ? err.message : "Action rejected.";
}

function wsProxyUrl(): string {
  const configured = typeof __DUALMODE_WS_URL__ === "string" ? __DUALMODE_WS_URL__.trim() : "";
  if (configured === "__disabled__") return "";
  if (configured !== "") {
    if (configured.startsWith("ws://") || configured.startsWith("wss://")) return configured;
    try {
      const fromHttp = new URL(configured);
      fromHttp.protocol = fromHttp.protocol === "https:" ? "wss:" : "ws:";
      return fromHttp.toString();
    } catch {
      if (configured.startsWith("/")) {
        const rel = new URL(configured, window.location.origin);
        rel.protocol = rel.protocol === "https:" ? "wss:" : "ws:";
        return rel.toString();
      }
    }
  }
  const u = new URL("/ws", window.location.origin);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

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

function userIdFromPresenceKey(key: string): string | null {
  if (!key.startsWith("user:")) return null;
  const id = key.slice("user:".length).trim();
  return id.length > 0 ? id : null;
}

function profileIdFromPresenceKey(key: string): string | null {
  if (key.startsWith("user:")) {
    const id = key.slice("user:".length).trim();
    return id.length > 0 ? id : null;
  }
  if (key.startsWith("session:")) {
    const token = key.slice("session:".length).trim();
    return token.length > 0 ? `guest:${token}` : null;
  }
  return null;
}

function chatKeyFromProfileUserId(userId: string): string {
  if (userId.startsWith("guest:")) {
    const token = userId.slice("guest:".length).trim();
    return token ? `session:${token}` : `user:${userId}`;
  }
  return `user:${userId}`;
}

function normalizePeerKey(rawKey: string): string {
  const key = rawKey.trim();
  if (!key) return key;
  if (key.startsWith("user:guest:")) {
    const token = key.slice("user:guest:".length).trim();
    return token ? `session:${token}` : key;
  }
  if (key.startsWith("guest:")) {
    const token = key.slice("guest:".length).trim();
    return token ? `session:${token}` : key;
  }
  return key;
}

function isFireSignalText(text: string): boolean {
  return text.trim() === FIRE_SIGNAL_TEXT;
}

function displayMessageText(text: string): string {
  return isFireSignalText(text) ? "🔥 I'm into you" : text;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function formatDistanceLabel(distanceInMeters: number): string {
  if (!Number.isFinite(distanceInMeters) || distanceInMeters < 0) return "-";
  if (distanceInMeters < 1_000) return `${Math.round(distanceInMeters)} m`;
  if (distanceInMeters < 10_000) return `${(distanceInMeters / 1_000).toFixed(1)} km`;
  return `${Math.round(distanceInMeters / 1_000)} km`;
}

function readTravelCenter(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem("reddoor_travel_center");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { enabled?: unknown; lat?: unknown; lng?: unknown };
    if (parsed.enabled !== true) return null;
    if (typeof parsed.lat === "number" && Number.isFinite(parsed.lat) && typeof parsed.lng === "number" && Number.isFinite(parsed.lng)) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
    return null;
  } catch {
    return null;
  }
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => window.matchMedia("(max-width: 900px)").matches);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 900px)");
    const onChange = () => setIsMobile(m.matches);
    onChange();
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

function channelToChatKind(channel: MessageChannel): "cruise" | "date" {
  return channel === "instant" ? "cruise" : "date";
}

function CruiseSurface({
  api,
  session,
  settings,
  discoverFilter,
  busy,
  setBusy,
  setLastError,
  isMobile,
  discoverScreen,
  onDiscoverScreenChange,
  onOpenThreadRequested,
  onUnreadCountChange
}: Readonly<{
  api: Api;
  session: Session;
  settings: Settings;
  discoverFilter: DiscoverFilter;
  busy: boolean;
  setBusy(value: boolean): void;
  setLastError(value: string | null): void;
  isMobile: boolean;
  discoverScreen: DiscoverScreen;
  onDiscoverScreenChange(value: DiscoverScreen): void;
  onOpenThreadRequested(key: string): void;
  onUnreadCountChange?(count: number): void;
}>): React.ReactElement {
  const [mobileTab, setMobileTab] = useState<MobileCruiseTab>(discoverScreen);
  const [selectedPeerKey, setSelectedPeerKey] = useState<string | null>(null);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null);
  const [selfCoords, setSelfCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [snapshotPresence, setSnapshotPresence] = useState<ReadonlyArray<CruisePresenceUpdate>>([]);
  const [peerProfileByKey, setPeerProfileByKey] = useState<Record<string, { displayName?: string; age?: number }>>({});
  const [publicProfiles, setPublicProfiles] = useState<ReadonlyArray<{
    userId: string;
    displayName: string;
    age: number;
    bio: string;
    stats?: {
      race?: string;
      heightInches?: number;
      weightLbs?: number;
      cockSizeInches?: number;
      cutStatus?: "cut" | "uncut";
      position?: "top" | "bottom" | "side";
    };
    discreetMode?: boolean;
    mainPhotoMediaId?: string;
  }>>([]);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());
  const [blockedKeys, setBlockedKeys] = useState<ReadonlySet<string>>(new Set());
  const [mediaUrlById, setMediaUrlById] = useState<Record<string, string>>({});
  const [mediaRetryAfterById, setMediaRetryAfterById] = useState<Record<string, number>>({});
  const [selectedPublicProfile, setSelectedPublicProfile] = useState<{
    userId: string;
    displayName: string;
    age: number;
    bio: string;
    stats?: {
      race?: string;
      heightInches?: number;
      weightLbs?: number;
      cockSizeInches?: number;
      cutStatus?: "cut" | "uncut";
      position?: "top" | "bottom" | "side";
    };
    discreetMode?: boolean;
    mainPhotoMediaId?: string;
    galleryMediaIds?: ReadonlyArray<string>;
    videoMediaId?: string;
  } | null>(null);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number>(0);
  const [seedAttempted, setSeedAttempted] = useState<boolean>(false);
  const [cruisingSpots, setCruisingSpots] = useState<ReadonlyArray<CruisingSpot>>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [travelCenter, setTravelCenter] = useState<{ lat: number; lng: number } | null>(() => readTravelCenter());
  const { state: presenceState, lastErrorMessage: realtimeError } = useCruisePresence({ wsUrl: wsProxyUrl(), sessionToken: session.sessionToken });
  const presence = useMemo(() => Array.from(presenceState.byKey.values()), [presenceState.byKey]);

  useEffect(() => {
    setMobileTab(discoverScreen);
  }, [discoverScreen]);

  useEffect(() => {
    const refreshTravelCenter = (): void => {
      setTravelCenter(readTravelCenter());
    };
    const onStorage = (evt: StorageEvent): void => {
      if (evt.key === null || evt.key === "reddoor_travel_center") {
        refreshTravelCenter();
      }
    };
    refreshTravelCenter();
    window.addEventListener("rd:location-updated", refreshTravelCenter as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("rd:location-updated", refreshTravelCenter as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const meKey = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
  const mergedPresence = useMemo(() => {
    const byKey = new Map<string, CruisePresenceUpdate>();
    for (const p of snapshotPresence) byKey.set(p.key, p);
    for (const p of presence) {
      const existing = byKey.get(p.key);
      if (!existing || p.updatedAtMs >= existing.updatedAtMs) byKey.set(p.key, p);
    }
    return Array.from(byKey.values());
  }, [presence, snapshotPresence]);
  const onlinePeers = useMemo(() => mergedPresence.filter((p) => p.key !== meKey), [meKey, mergedPresence]);
  const sortedPeers = useMemo(() => {
    if (!selfCoords) return onlinePeers;
    return [...onlinePeers].sort((a, b) => distanceMeters(selfCoords, { lat: a.lat, lng: a.lng }) - distanceMeters(selfCoords, { lat: b.lat, lng: b.lng }));
  }, [onlinePeers, selfCoords]);
  const selectedProfileDistanceLabel = useMemo(() => {
    if (!selectedProfileKey) return null;
    if (selectedProfileKey === meKey) return "0 m";
    if (!selfCoords) return null;
    const target = mergedPresence.find((p) => p.key === selectedProfileKey);
    if (!target) return null;
    return formatDistanceLabel(distanceMeters(selfCoords, { lat: target.lat, lng: target.lng }));
  }, [meKey, mergedPresence, selectedProfileKey, selfCoords]);

  useEffect(() => {
    let cancelled = false;
    async function refreshPresenceSnapshot(): Promise<void> {
      try {
        const res = await api.listActivePresence(session.sessionToken);
        if (cancelled) return;
        const rows = Array.isArray(res.presence) ? res.presence : [];
        setSnapshotPresence(rows as ReadonlyArray<CruisePresenceUpdate>);
      } catch {
        if (!cancelled) setSnapshotPresence([]);
      }
    }
    void refreshPresenceSnapshot();
    const id = window.setInterval(() => {
      void refreshPresenceSnapshot();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, session.sessionToken]);

  useEffect(() => {
    if (selectedPeerKey) return;
    if (sortedPeers.length > 0) setSelectedPeerKey(sortedPeers[0].key);
  }, [selectedPeerKey, sortedPeers]);

  useEffect(() => {
    const missing = sortedPeers
      .filter((p) => !peerProfileByKey[p.key])
      .map((p) => ({ key: p.key, profileId: profileIdFromPresenceKey(p.key) }))
      .filter((row): row is { key: string; profileId: string } => typeof row.profileId === "string");
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (row) => {
        try {
          const res = await api.getPublicProfile(row.profileId);
          return { key: row.key, displayName: res.profile?.displayName as string | undefined, age: res.profile?.age as number | undefined };
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      setPeerProfileByKey((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (!row) continue;
          next[row.key] = { displayName: row.displayName, age: row.age };
        }
        return next;
      });
    });
  }, [api, peerProfileByKey, sortedPeers]);

  useEffect(() => {
    void (async () => {
      try {
        let list = await api.getPublicProfiles();
        if (list.profiles.length === 0 && !seedAttempted) {
          setSeedAttempted(true);
          try {
            const center = selfCoords ?? travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng };
            await api.seedFakeUsers(12, center.lat, center.lng);
            list = await api.getPublicProfiles();
          } catch {
            // keep empty list if seed endpoint fails
          }
        }
        setPublicProfiles(list.profiles as any);
      } catch {
        setPublicProfiles([]);
      }
      if (session.userType === "guest") {
        setFavorites(new Set());
        setBlockedKeys(new Set());
        return;
      }
      try {
        const fav = await api.getFavorites(session.sessionToken);
        setFavorites(new Set(fav.favorites));
      } catch {
        setFavorites(new Set());
      }
      try {
        const blocked = await api.listBlocked(session.sessionToken);
        setBlockedKeys(new Set(blocked.blocked));
      } catch {
        setBlockedKeys(new Set());
      }
    })();
  }, [api, seedAttempted, selfCoords, session.sessionToken, session.userType, settings.defaultCenterLat, settings.defaultCenterLng, travelCenter]);

  useEffect(() => {
    let cancelled = false;
    async function refreshCruisingSpots(): Promise<void> {
      try {
        const res = await api.listCruisingSpots();
        if (!cancelled) setCruisingSpots(res.spots);
      } catch {
        if (!cancelled) setCruisingSpots([]);
      }
    }
    void refreshCruisingSpots();
    const id = window.setInterval(() => {
      void refreshCruisingSpots();
    }, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api]);

  useEffect(() => {
    const now = Date.now();
    const missing = publicProfiles
      .flatMap((p) => {
        const ids: string[] = [];
        if (p.mainPhotoMediaId) ids.push(p.mainPhotoMediaId);
        if (Array.isArray((p as any).galleryMediaIds)) ids.push(...((p as any).galleryMediaIds as string[]));
        if ((p as any).videoMediaId) ids.push((p as any).videoMediaId as string);
        return ids;
      })
      .filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && !mediaUrlById[id] && now >= (mediaRetryAfterById[id] ?? 0)
      )
      .slice(0, 6);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (mediaId) => {
        try {
          const r = await api.getPublicMediaUrl(mediaId);
          return { mediaId, url: r.downloadUrl };
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      setMediaUrlById((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (!row) continue;
          next[row.mediaId] = row.url;
        }
        return next;
      });
      setMediaRetryAfterById((prev) => {
        const next = { ...prev };
        for (let i = 0; i < missing.length; i += 1) {
          const mediaId = missing[i];
          if (!rows[i]) {
            next[mediaId] = Date.now() + 30_000;
          } else if (next[mediaId]) {
            delete next[mediaId];
          }
        }
        return next;
      });
    });
  }, [api, mediaRetryAfterById, mediaUrlById, publicProfiles]);

  async function openProfileByKey(key: string): Promise<void> {
    setSelectedProfileKey(key);
    setSelectedMediaIndex(0);
    const profileId = profileIdFromPresenceKey(key);
    if (!profileId) {
      setSelectedPublicProfile(null);
      return;
    }
    try {
      if (key === meKey) {
        const meProfile = await api.getMyProfile(session.sessionToken);
        if (typeof meProfile.profile.mainPhotoMediaId === "string" && meProfile.profile.mainPhotoMediaId) {
          // handled below with unified media id loading
        }
        const mediaIds = [
          meProfile.profile.mainPhotoMediaId,
          ...(meProfile.profile.galleryMediaIds ?? []),
          meProfile.profile.videoMediaId
        ].filter((id): id is string => typeof id === "string" && id.length > 0);
        if (mediaIds.length > 0) {
          const rows = await Promise.all(
            mediaIds.map(async (mediaId) => {
              try {
                const media = await api.getPublicMediaUrl(mediaId);
                return { mediaId, downloadUrl: media.downloadUrl };
              } catch {
                return null;
              }
            })
          );
          setMediaUrlById((prev) => {
            const next = { ...prev };
            for (const row of rows) {
              if (!row) continue;
              next[row.mediaId] = row.downloadUrl;
            }
            return next;
          });
        }
        setSelectedPublicProfile({
          userId: meProfile.profile.userId,
          displayName: meProfile.profile.displayName,
          age: meProfile.profile.age,
          bio: meProfile.profile.bio,
          stats: meProfile.profile.stats as any,
          discreetMode: meProfile.profile.discreetMode,
          mainPhotoMediaId: meProfile.profile.mainPhotoMediaId,
          galleryMediaIds: meProfile.profile.galleryMediaIds,
          videoMediaId: meProfile.profile.videoMediaId
        });
      } else {
        const res = await api.getPublicProfile(profileId);
        const mediaIds = [
          res.profile.mainPhotoMediaId,
          ...(res.profile.galleryMediaIds ?? []),
          res.profile.videoMediaId
        ].filter((id): id is string => typeof id === "string" && id.length > 0);
        if (mediaIds.length > 0) {
          const rows = await Promise.all(
            mediaIds.map(async (mediaId) => {
              try {
                const media = await api.getPublicMediaUrl(mediaId);
                return { mediaId, downloadUrl: media.downloadUrl };
              } catch {
                return null;
              }
            })
          );
          setMediaUrlById((prev) => {
            const next = { ...prev };
            for (const row of rows) {
              if (!row) continue;
              next[row.mediaId] = row.downloadUrl;
            }
            return next;
          });
        }
        setSelectedPublicProfile(res.profile as any);
      }
    } catch (e) {
      const err = e as ServiceError;
      if (err?.code === "PROFILE_HIDDEN") {
        setSelectedProfileKey(null);
        setSelectedPublicProfile(null);
        return;
      }
      setSelectedPublicProfile(null);
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function toggleFavoriteFromProfile(userId: string): Promise<void> {
    if (session.userType === "guest") {
      setLastError("Guests cannot star users. Register to save favorites.");
      return;
    }
    if (!session.userId || session.userId === userId) return;
    try {
      const res = await api.toggleFavorite(session.sessionToken, userId);
      setFavorites(new Set(res.favorites));
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function sendFireFromProfile(targetKey: string): Promise<void> {
    const normalizedTarget = normalizePeerKey(targetKey);
    if (!normalizedTarget || normalizedTarget === meKey) return;
    try {
      await api.sendChat(session.sessionToken, "cruise", normalizedTarget, FIRE_SIGNAL_TEXT);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function toggleBlockFromProfile(profileChatKey: string): Promise<void> {
    if (!profileChatKey.trim() || profileChatKey === meKey) return;
    if (session.userType === "guest") {
      setLastError("Anonymous users cannot block users.");
      return;
    }
    try {
      if (blockedKeys.has(profileChatKey)) {
        await api.unblock(session.sessionToken, profileChatKey);
      } else {
        await api.block(session.sessionToken, profileChatKey);
      }
      const refreshed = await api.listBlocked(session.sessionToken);
      setBlockedKeys(new Set(refreshed.blocked));
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function updatePresenceFromGeo(): Promise<void> {
    const fallbackCenter = travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng };
    if (!navigator.geolocation) {
      setSelfCoords(fallbackCenter);
      try {
        await api.updatePresence(session.sessionToken, fallbackCenter.lat, fallbackCenter.lng, "online");
      } catch {
        // best-effort fallback
      }
      return;
    }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 15_000,
          maximumAge: 30_000
        });
      });
      setSelfCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      await api.updatePresence(session.sessionToken, pos.coords.latitude, pos.coords.longitude, "online");
    } catch (e) {
      setSelfCoords(fallbackCenter);
      try {
        await api.updatePresence(session.sessionToken, fallbackCenter.lat, fallbackCenter.lng, "online");
      } catch {
        const msg =
          e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
            ? (e as { message: string }).message
            : null;
        setLastError(msg ?? normalizeErrorMessage(e));
      }
    }
  }

  useEffect(() => {
    void updatePresenceFromGeo();
    const id = window.setInterval(() => {
      void updatePresenceFromGeo();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [session.sessionToken]);

  useEffect(() => {
    const onLocationUpdated = (evt: Event): void => {
      const custom = evt as CustomEvent<{ lat?: number; lng?: number }>;
      const lat = custom.detail?.lat;
      const lng = custom.detail?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setSelfCoords({ lat: lat as number, lng: lng as number });
      void api.updatePresence(session.sessionToken, lat as number, lng as number, "online").catch(() => {});
    };
    window.addEventListener("rd:location-updated", onLocationUpdated as EventListener);
    return () => window.removeEventListener("rd:location-updated", onLocationUpdated as EventListener);
  }, [api, session.sessionToken]);

  const mapPresence = useMemo(() => {
    const hasSelf = mergedPresence.some((p) => p.key === meKey);
    if (hasSelf) return mergedPresence;
    const fallbackCenter = selfCoords ?? travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng };
    const syntheticSelf: CruisePresenceUpdate = {
      key: meKey,
      userType: session.userType,
      lat: fallbackCenter.lat,
      lng: fallbackCenter.lng,
      status: "online",
      updatedAtMs: Date.now()
    };
    return [syntheticSelf, ...mergedPresence];
  }, [meKey, mergedPresence, selfCoords, session.userType, settings.defaultCenterLat, settings.defaultCenterLng, travelCenter]);

  const avatarUrlByKey = useMemo(() => {
    const next: Record<string, string> = {};
    for (const p of publicProfiles) {
      if (!p.mainPhotoMediaId) continue;
      const url = mediaUrlById[p.mainPhotoMediaId];
      if (!url) continue;
      next[chatKeyFromProfileUserId(p.userId)] = url;
    }
    return next;
  }, [mediaUrlById, publicProfiles]);
  const spotMarkers = useMemo(
    () =>
      cruisingSpots.map((spot) => ({
        id: `spot:${spot.spotId}`,
        position: { lat: spot.lat, lng: spot.lng },
        color: "#26d5ff",
        markerType: "spot" as const,
        markerGlyph: "CS",
        label: `${spot.name} | check-ins: ${spot.checkInCount ?? 0} | action: ${spot.actionCount ?? 0}`,
        onClick: () => setSelectedSpotId(spot.spotId)
      })),
    [cruisingSpots]
  );

  const setDiscoverTab = (next: MobileCruiseTab): void => {
    setMobileTab(next);
    onDiscoverScreenChange(next);
  };

  const mapPanel = (
    <CruiseMap
      wsUrl={wsProxyUrl()}
      sessionToken={session.sessionToken}
      presenceUpdates={mapPresence}
      realtimeErrorMessage={realtimeError}
      onMarkerSelect={(key) => void openProfileByKey(key)}
      avatarByKey={avatarUrlByKey}
      additionalMarkers={spotMarkers}
      defaultCenter={travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng }}
      height={isMobile ? "calc(100vh - 340px)" : "calc(100dvh - 62px)"}
      visible
    />
  );

  const mobileMapPanel = (
    <div style={{ background: "#000", marginInline: -10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "8px 10px", borderBottom: "1px solid rgba(255,58,77,0.25)" }}>
        <button
          type="button"
          style={buttonSecondary(false)}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("rd:discover-control", { detail: { action: "reset" } }));
          }}
        >
          GUYS
        </button>
        <button
          type="button"
          style={buttonSecondary(false)}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("rd:discover-control", { detail: { action: "toggle_favorites" } }));
          }}
          aria-label="Toggle favorites only"
        >
          ★
        </button>
        <button
          type="button"
          style={buttonSecondary(false)}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("rd:discover-control", { detail: { action: "open_filters" } }));
            setDiscoverTab("chat");
          }}
        >
          FILTER
        </button>
      </div>
      <CruiseMap
        wsUrl={wsProxyUrl()}
        sessionToken={session.sessionToken}
        presenceUpdates={mapPresence}
        realtimeErrorMessage={realtimeError}
        onMarkerSelect={(key) => void openProfileByKey(key)}
        avatarByKey={avatarUrlByKey}
        additionalMarkers={spotMarkers}
        defaultCenter={travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng }}
        height={"calc(100dvh - 220px)"}
        visible={mobileTab === "map"}
      />
    </div>
  );

  const chatPanel = (
    <CruiseChat
      api={api}
      session={session}
      busy={busy}
      setBusy={setBusy}
      setLastError={setLastError}
      onlinePeers={sortedPeers}
      selectedPeerKey={selectedPeerKey}
      setSelectedPeerKey={setSelectedPeerKey}
      onOpenProfile={(key) => void openProfileByKey(key)}
      isMobile={isMobile}
      selfCoords={selfCoords}
      peerProfileByKey={peerProfileByKey}
      discoverFilter={discoverFilter}
      publicProfiles={publicProfiles}
      favorites={favorites}
      mediaUrlById={mediaUrlById}
      onUnreadCountChange={onUnreadCountChange}
    />
  );

  return (
    <div style={!isMobile && mobileTab === "map" ? { height: "100%" } : { display: "grid", gap: 8 }}>
      {isMobile ? (
        <>
          {mobileTab === "map" ? mobileMapPanel : chatPanel}
        </>
      ) : (
        <div style={mobileTab === "map" ? { display: "grid", height: "100%", alignItems: "stretch" } : { display: "grid", gap: 12, alignItems: "start" }}>
          {mobileTab === "map" ? mapPanel : chatPanel}
        </div>
      )}

      {selectedProfileKey ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            placeItems: isMobile ? "stretch" : "center",
            padding: isMobile ? 0 : 14
          }}
          role="dialog"
          aria-modal="true"
          aria-label="User profile"
          onClick={() => setSelectedProfileKey(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={
              isMobile
                ? {
                    width: "100%",
                    height: "100dvh",
                    overflow: "auto",
                    background: "linear-gradient(180deg, rgba(7,8,10,0.98), rgba(2,2,4,0.98))",
                    borderRadius: 0,
                    border: "none",
                    padding: "calc(env(safe-area-inset-top, 0px) + 56px) 12px calc(env(safe-area-inset-bottom, 0px) + 20px)"
                  }
                : { ...cardStyle(), width: "min(680px, 100%)", maxHeight: "86vh", overflow: "auto" }
            }
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "106px 1fr auto", gap: 12, alignItems: "center" }}>
                <div style={{ position: "relative", width: 106, height: 106 }}>
                  <img
                    src={
                      selectedPublicProfile?.mainPhotoMediaId && mediaUrlById[selectedPublicProfile.mainPhotoMediaId]
                        ? mediaUrlById[selectedPublicProfile.mainPhotoMediaId]
                        : avatarForKey(selectedProfileKey)
                    }
                    alt="Profile avatar"
                    style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #ff3047" }}
                  />
                  <span style={{ position: "absolute", right: 4, bottom: 4, width: 14, height: 14, borderRadius: "50%", background: "#26d5ff", border: "2px solid #000" }} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedPublicProfile?.displayName ?? selectedProfileKey}</div>
                  <div style={{ color: "#26d5ff", fontSize: 14 }}>Instant Messaging Available</div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {selectedPublicProfile && selectedPublicProfile.userId !== (session.userId ?? "") ? (
                    <button
                      type="button"
                      style={{
                        ...buttonSecondary(false),
                        color: "#26d5ff",
                        borderColor: "rgba(38,213,255,0.62)",
                        minWidth: 126
                      }}
                      onClick={() => void toggleFavoriteFromProfile(selectedPublicProfile.userId)}
                    >
                      {favorites.has(selectedPublicProfile.userId) ? "★ STARRED" : "☆ STAR"}
                    </button>
                  ) : null}
                  {selectedPublicProfile && selectedPublicProfile.userId !== (session.userId ?? "") ? (
                    <button
                      type="button"
                      style={{
                        ...buttonSecondary(false),
                        color: "#ffb347",
                        borderColor: "rgba(255,179,71,0.65)",
                        minWidth: 126
                      }}
                      onClick={() => void sendFireFromProfile(chatKeyFromProfileUserId(selectedPublicProfile.userId))}
                    >
                      🔥 FIRE
                    </button>
                  ) : null}
                  {selectedPublicProfile && selectedPublicProfile.userId !== (session.userId ?? "") ? (
                    <button
                      type="button"
                      style={{
                        ...buttonSecondary(false),
                        color: blockedKeys.has(chatKeyFromProfileUserId(selectedPublicProfile.userId)) ? "#ff9aa3" : "#ffd4d8",
                        borderColor: "rgba(255,120,130,0.62)",
                        minWidth: 126
                      }}
                      onClick={() => void toggleBlockFromProfile(chatKeyFromProfileUserId(selectedPublicProfile.userId))}
                    >
                      {blockedKeys.has(chatKeyFromProfileUserId(selectedPublicProfile.userId)) ? "UNBLOCK" : "BLOCK"}
                    </button>
                  ) : null}
                  <button type="button" style={buttonSecondary(false)} onClick={() => setSelectedProfileKey(null)}>CLOSE</button>
                </div>
              </div>
              <div style={{ color: "#ced3dc", fontSize: 14, lineHeight: 1.5 }}>
                <div>Age: {selectedPublicProfile?.age ?? "-"}</div>
                <div>Distance: {selectedProfileDistanceLabel ?? "-"}</div>
                <div>Race: {selectedPublicProfile?.stats?.race ?? "-"}</div>
                <div>Height: {selectedPublicProfile?.stats?.heightInches ?? "-"}</div>
                <div>Weight: {selectedPublicProfile?.stats?.weightLbs ?? "-"}</div>
                <div>Cock Size: {selectedPublicProfile?.stats?.cockSizeInches ?? "-"}</div>
                <div>Cut / Uncut: {selectedPublicProfile?.stats?.cutStatus ?? "-"}</div>
                <div>Position: {selectedPublicProfile?.stats?.position ?? "-"}</div>
                <div style={{ marginTop: 8 }}>Bio: {selectedPublicProfile?.bio ?? "-"}</div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>MEDIA</div>
                {selectedPublicProfile ? (
                  <>
                    {(() => {
                      const mediaIds = [
                        selectedPublicProfile.mainPhotoMediaId,
                        ...(selectedPublicProfile.galleryMediaIds ?? []),
                        selectedPublicProfile.videoMediaId
                      ].filter((id): id is string => typeof id === "string" && id.length > 0);
                      if (mediaIds.length === 0) {
                        return <div style={{ color: "#b9bec9", fontSize: 13 }}>No uploaded media.</div>;
                      }
                      const boundedIndex = Math.max(0, Math.min(selectedMediaIndex, mediaIds.length - 1));
                      const activeId = mediaIds[boundedIndex];
                      const activeUrl = mediaUrlById[activeId];
                      const isVideo = activeId === selectedPublicProfile.videoMediaId;
                      return (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,58,77,0.4)", borderRadius: 12, padding: 8 }}>
                            {isVideo ? (
                              <video
                                controls
                                playsInline
                                src={activeUrl}
                                style={{ width: "100%", maxHeight: 260, borderRadius: 10, background: "#000" }}
                              />
                            ) : (
                              <img
                                src={activeUrl ?? avatarForKey(selectedProfileKey ?? selectedPublicProfile.userId)}
                                alt="Profile media"
                                style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10 }}
                              />
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {mediaIds.map((mediaId, idx) => {
                              const thumb = mediaUrlById[mediaId];
                              const thumbIsVideo = mediaId === selectedPublicProfile.videoMediaId;
                              return (
                                <button
                                  key={mediaId}
                                  type="button"
                                  onClick={() => setSelectedMediaIndex(idx)}
                                  style={{
                                    width: 64,
                                    height: 64,
                                    padding: 0,
                                    borderRadius: 8,
                                    overflow: "hidden",
                                    border: idx === boundedIndex ? "2px solid #26d5ff" : "1px solid rgba(255,58,77,0.4)",
                                    background: "#000",
                                    cursor: "pointer",
                                    color: "#fff",
                                    fontSize: 10
                                  }}
                                  aria-label={thumbIsVideo ? "Open video" : "Open photo"}
                                >
                                  {thumbIsVideo ? (
                                    <div style={{ display: "grid", placeItems: "center", width: "100%", height: "100%" }}>
                                      {thumb ? (
                                        <video src={thumb} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                      ) : (
                                        "VIDEO"
                                      )}
                                    </div>
                                  ) : (
                                    <img
                                      src={thumb ?? avatarForKey(selectedProfileKey ?? selectedPublicProfile.userId)}
                                      alt="Media thumbnail"
                                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={buttonPrimary(false)}
                  onClick={() => {
                    if (selectedProfileKey) {
                      onOpenThreadRequested(selectedProfileKey);
                    }
                    setSelectedProfileKey(null);
                    setSelectedMediaIndex(0);
                  }}
                >
                  CHAT
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selectedSpotId ? (
        <CruisingSpotModal
          api={api}
          session={session}
          spot={cruisingSpots.find((s) => s.spotId === selectedSpotId) ?? null}
          onClose={() => setSelectedSpotId(null)}
          onUpdated={async () => {
            try {
              const res = await api.listCruisingSpots();
              setCruisingSpots(res.spots);
            } catch {
              // no-op
            }
          }}
          setLastError={setLastError}
        />
      ) : null}
    </div>
  );
}

function CruisingSpotModal({
  api,
  session,
  spot,
  onClose,
  onUpdated,
  setLastError
}: Readonly<{
  api: Api;
  session: Session;
  spot: CruisingSpot | null;
  onClose(): void;
  onUpdated(): Promise<void>;
  setLastError(value: string | null): void;
}>): React.ReactElement | null {
  if (!spot) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(0,0,0,0.72)",
        display: "grid",
        placeItems: "center",
        padding: 14
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Cruising spot"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle(), width: "min(520px, 100%)", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{spot.name}</div>
        <div style={{ color: "#9fb6bf", fontSize: 13 }}>{spot.address}</div>
        <div style={{ color: "#ced3dc", fontSize: 14, whiteSpace: "pre-wrap" }}>{spot.description}</div>
        <div style={{ color: "#9fb6bf", fontSize: 13 }}>
          Check-ins: {spot.checkInCount ?? 0} | I got action there: {spot.actionCount ?? 0}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={buttonPrimary(false)}
            onClick={async () => {
              try {
                await api.checkInCruisingSpot(session.sessionToken, spot.spotId);
                await onUpdated();
              } catch (e) {
                setLastError(normalizeErrorMessage(e));
              }
            }}
          >
            CHECK IN
          </button>
          <button
            type="button"
            style={buttonSecondary(false)}
            onClick={async () => {
              try {
                await api.markCruisingSpotAction(session.sessionToken, spot.spotId);
                await onUpdated();
              } catch (e) {
                setLastError(normalizeErrorMessage(e));
              }
            }}
          >
            I GOT ACTION THERE
          </button>
          <button type="button" style={buttonSecondary(false)} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

function CruiseChat({
  api,
  session,
  busy,
  setBusy,
  setLastError,
  onlinePeers,
  selectedPeerKey,
  setSelectedPeerKey,
  onOpenProfile,
  openThreadRequest,
  onThreadRequestConsumed,
  isMobile,
  selfCoords,
  peerProfileByKey,
  discoverFilter,
  publicProfiles,
  favorites,
  mediaUrlById,
  onUnreadCountChange
}: Readonly<{
  api: Api;
  session: Session;
  busy: boolean;
  setBusy(value: boolean): void;
  setLastError(value: string | null): void;
  onlinePeers: ReadonlyArray<CruisePresenceUpdate>;
  selectedPeerKey: string | null;
  setSelectedPeerKey(value: string | null): void;
  onOpenProfile(key: string): void;
  openThreadRequest?: { key: string; nonce: number } | null;
  onThreadRequestConsumed?: () => void;
  isMobile: boolean;
  selfCoords: { lat: number; lng: number } | null;
  peerProfileByKey: Record<string, { displayName?: string; age?: number }>;
  discoverFilter: DiscoverFilter;
  publicProfiles: ReadonlyArray<{
    userId: string;
    displayName: string;
    age: number;
    bio: string;
    stats?: {
      race?: string;
      heightInches?: number;
      weightLbs?: number;
      cockSizeInches?: number;
      cutStatus?: "cut" | "uncut";
      position?: "top" | "bottom" | "side";
    };
    discreetMode?: boolean;
    mainPhotoMediaId?: string;
  }>;
  favorites: ReadonlySet<string>;
  mediaUrlById: Record<string, string>;
  onUnreadCountChange?(count: number): void;
}>): React.ReactElement {
  const [messagesByPeerKey, setMessagesByPeerKey] = useState<Record<string, ReadonlyArray<ChatMessage>>>({});
  const [conversationMetaByPeerKey, setConversationMetaByPeerKey] = useState<Record<string, { lastAt: number; lastText: string }>>({});
  const [channel, setChannel] = useState<MessageChannel>("instant");
  const [view, setView] = useState<"grid" | "thread">("grid");
  const [threadPeerKey, setThreadPeerKey] = useState<string | null>(null);
  const [thirdCandidateKey, setThirdCandidateKey] = useState<string>("");
  const [thirdMemberKey, setThirdMemberKey] = useState<string | null>(null);
  const [pendingInviteNotifs, setPendingInviteNotifs] = useState<
    Array<{ inviteId: string; inviterKey: string; primaryPeerKey: string; createdAtMs: number }>
  >([]);
  const [pendingSentInvites, setPendingSentInvites] = useState<Record<string, { candidateKey: string; primaryPeerKey: string }>>({});
  const [groupStatus, setGroupStatus] = useState<string | null>(null);
  const [unreadByPeerKey, setUnreadByPeerKey] = useState<Record<string, number>>({});
  const [lastSeenByPeerKey, setLastSeenByPeerKey] = useState<Record<string, number>>({});
  const [videoCallOpen, setVideoCallOpen] = useState<boolean>(false);
  const [videoCallPeerLabel, setVideoCallPeerLabel] = useState<string>("");
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const unreadInFlightRef = useRef<boolean>(false);
  const conversationSyncInFlightRef = useRef<boolean>(false);
  const lastThreadRequestNonceRef = useRef<number>(0);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsHeartbeatRef = useRef<number | null>(null);
  const wsReconnectRef = useRef<number | null>(null);
  const wsFailuresRef = useRef<number>(0);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const activeCallPeerRef = useRef<string | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(discoverFilter === "favorites");
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [onlineStatusFilter, setOnlineStatusFilter] = useState<"all" | "online" | "offline">(
    discoverFilter === "online" ? "online" : "all"
  );
  const [hasPicturesOnly, setHasPicturesOnly] = useState<boolean>(false);
  const [filterMinAge, setFilterMinAge] = useState<string>("");
  const [filterMaxAge, setFilterMaxAge] = useState<string>("");
  const [filterRace, setFilterRace] = useState<string>("");
  const [filterMinHeight, setFilterMinHeight] = useState<string>("");
  const [filterMaxHeight, setFilterMaxHeight] = useState<string>("");
  const [filterMinWeight, setFilterMinWeight] = useState<string>("");
  const [filterMaxWeight, setFilterMaxWeight] = useState<string>("");
  const [filterMinCockSize, setFilterMinCockSize] = useState<string>("");
  const [filterMaxCockSize, setFilterMaxCockSize] = useState<string>("");
  const [filterCutStatus, setFilterCutStatus] = useState<"" | "cut" | "uncut">("");
  const [filterPosition, setFilterPosition] = useState<"" | "top" | "bottom" | "side">("");

  const me = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
  const peerKey = threadPeerKey ?? selectedPeerKey ?? "";
  const messages = peerKey ? messagesByPeerKey[peerKey] ?? [] : [];

  const onlinePeerByKey = useMemo(() => new Map(onlinePeers.map((p) => [p.key, p])), [onlinePeers]);
  const displayNameByKey = useMemo(() => {
    const next: Record<string, string> = {};
    for (const p of publicProfiles) {
      if (typeof p.displayName === "string" && p.displayName.trim()) {
        next[chatKeyFromProfileUserId(p.userId)] = p.displayName;
      }
    }
    for (const [key, profile] of Object.entries(peerProfileByKey)) {
      if (typeof profile.displayName === "string" && profile.displayName.trim()) {
        next[key] = profile.displayName;
      }
    }
    return next;
  }, [peerProfileByKey, publicProfiles]);

  const baseCards = useMemo(
    () =>
      publicProfiles
        .filter((p) => p.userId !== (session.userId ?? ""))
        .map((p) => {
          const key = chatKeyFromProfileUserId(p.userId);
          const online = onlinePeerByKey.get(key);
          return {
            key,
            userId: p.userId,
            displayName: p.displayName,
            age: p.age,
            stats: p.stats,
            meters: online && selfCoords ? Math.round(distanceMeters(selfCoords, { lat: online.lat, lng: online.lng })) : null,
            isOnline: Boolean(online),
            hasPicture: typeof p.mainPhotoMediaId === "string" && p.mainPhotoMediaId.trim().length > 0,
            avatarUrl: p.mainPhotoMediaId ? mediaUrlById[p.mainPhotoMediaId] : undefined
          };
        }),
    [mediaUrlById, onlinePeerByKey, publicProfiles, selfCoords, session.userId]
  );

  const gridCards = useMemo(() => {
    const minAge = filterMinAge.trim() ? Number(filterMinAge) : undefined;
    const maxAge = filterMaxAge.trim() ? Number(filterMaxAge) : undefined;
    const minHeight = filterMinHeight.trim() ? Number(filterMinHeight) : undefined;
    const maxHeight = filterMaxHeight.trim() ? Number(filterMaxHeight) : undefined;
    const minWeight = filterMinWeight.trim() ? Number(filterMinWeight) : undefined;
    const maxWeight = filterMaxWeight.trim() ? Number(filterMaxWeight) : undefined;
    const minCock = filterMinCockSize.trim() ? Number(filterMinCockSize) : undefined;
    const maxCock = filterMaxCockSize.trim() ? Number(filterMaxCockSize) : undefined;

    const filtered = baseCards.filter((p) => {
      if (favoritesOnly && !favorites.has(p.userId)) return false;
      if (onlineStatusFilter === "online" && !p.isOnline) return false;
      if (onlineStatusFilter === "offline" && p.isOnline) return false;
      if (hasPicturesOnly && !p.hasPicture) return false;
      if (Number.isFinite(minAge) && (typeof p.age !== "number" || p.age < (minAge as number))) return false;
      if (Number.isFinite(maxAge) && (typeof p.age !== "number" || p.age > (maxAge as number))) return false;

      const race = typeof p.stats?.race === "string" ? p.stats.race : "";
      if (filterRace.trim() && race.toLowerCase() !== filterRace.trim().toLowerCase()) return false;

      if (Number.isFinite(minHeight) && (typeof p.stats?.heightInches !== "number" || p.stats.heightInches < (minHeight as number))) return false;
      if (Number.isFinite(maxHeight) && (typeof p.stats?.heightInches !== "number" || p.stats.heightInches > (maxHeight as number))) return false;
      if (Number.isFinite(minWeight) && (typeof p.stats?.weightLbs !== "number" || p.stats.weightLbs < (minWeight as number))) return false;
      if (Number.isFinite(maxWeight) && (typeof p.stats?.weightLbs !== "number" || p.stats.weightLbs > (maxWeight as number))) return false;
      if (Number.isFinite(minCock) && (typeof p.stats?.cockSizeInches !== "number" || p.stats.cockSizeInches < (minCock as number))) return false;
      if (Number.isFinite(maxCock) && (typeof p.stats?.cockSizeInches !== "number" || p.stats.cockSizeInches > (maxCock as number))) return false;
      if (filterCutStatus && p.stats?.cutStatus !== filterCutStatus) return false;
      if (filterPosition && p.stats?.position !== filterPosition) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aMeters = typeof a.meters === "number" && Number.isFinite(a.meters) ? a.meters : Number.POSITIVE_INFINITY;
      const bMeters = typeof b.meters === "number" && Number.isFinite(b.meters) ? b.meters : Number.POSITIVE_INFINITY;
      if (aMeters !== bMeters) return aMeters - bMeters;
      const nameCmp = a.displayName.localeCompare(b.displayName);
      if (nameCmp !== 0) return nameCmp;
      return a.key.localeCompare(b.key);
    });
  }, [
    baseCards,
    favorites,
    favoritesOnly,
    filterCutStatus,
    filterMaxAge,
    filterMaxCockSize,
    filterMaxHeight,
    filterMaxWeight,
    filterMinAge,
    filterMinCockSize,
    filterMinHeight,
    filterMinWeight,
    filterPosition,
    filterRace,
    hasPicturesOnly,
    onlineStatusFilter
  ]);
  const unreadCandidateKeys = useMemo(
    () => Array.from(new Set(gridCards.map((c) => c.key).filter((k) => k.trim().length > 0))).slice(0, 8),
    [gridCards]
  );
  const unreadCandidateSignature = unreadCandidateKeys.join("|");
  const conversationKeys = useMemo(() => {
    const keys = new Set<string>(Object.keys(conversationMetaByPeerKey));
    if (peerKey.trim()) keys.add(peerKey);
    return Array.from(keys).sort((a, b) => (conversationMetaByPeerKey[b]?.lastAt ?? 0) - (conversationMetaByPeerKey[a]?.lastAt ?? 0));
  }, [conversationMetaByPeerKey, peerKey]);
  const unreadTotal = useMemo(
    () => Object.values(unreadByPeerKey).reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0),
    [unreadByPeerKey]
  );
  const activePeerLabel = useMemo(
    () => (peerKey ? displayNameByKey[peerKey] ?? peerProfileByKey[peerKey]?.displayName ?? peerKey : ""),
    [displayNameByKey, peerKey, peerProfileByKey]
  );
  const activePeerAvatarUrl = useMemo(() => {
    if (!peerKey) return undefined;
    const gridMatch = gridCards.find((c) => c.key === peerKey);
    return gridMatch?.avatarUrl;
  }, [gridCards, peerKey]);
  const spokenThirdCandidates = useMemo(
    () =>
      conversationKeys
        .filter((key) => key !== peerKey && key !== me && Boolean(conversationMetaByPeerKey[key]))
        .map((key) => ({
          key,
          label: displayNameByKey[key] ?? peerProfileByKey[key]?.displayName ?? key
        })),
    [conversationKeys, conversationMetaByPeerKey, displayNameByKey, me, peerKey, peerProfileByKey]
  );

  useEffect(() => {
    if (typeof onUnreadCountChange === "function") onUnreadCountChange(unreadTotal);
  }, [onUnreadCountChange, unreadTotal]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;
    video.srcObject = localVideoStream;
  }, [localVideoStream]);
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = remoteVideoStream;
  }, [remoteVideoStream]);

  useEffect(
    () => () => {
      if (!localVideoStream) return;
      for (const track of localVideoStream.getTracks()) track.stop();
      if (remoteVideoStream) {
        for (const track of remoteVideoStream.getTracks()) track.stop();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    },
    [localVideoStream, remoteVideoStream]
  );

  useEffect(() => {
    if (spokenThirdCandidates.length === 0) {
      setThirdCandidateKey("");
      return;
    }
    setThirdCandidateKey((prev) => (prev && spokenThirdCandidates.some((p) => p.key === prev) ? prev : spokenThirdCandidates[0].key));
  }, [spokenThirdCandidates]);

  const client: ChatApiClient = useMemo(
    () => ({
      async sendMessage(chatKind, toKey, text, media) {
        const normalizedToKey = normalizePeerKey(toKey);
        const res = await api.sendChat(session.sessionToken, chatKind, normalizedToKey, text, media);
        const msg = (res as any)?.message as ChatMessage;
        const next: ChatMessage[] = [msg];
        if (chatKind === "cruise" && thirdMemberKey) {
          try {
            const copy = await api.sendChat(session.sessionToken, chatKind, normalizePeerKey(thirdMemberKey), text, media);
            const copyMsg = (copy as any)?.message as ChatMessage;
            next.push(copyMsg);
          } catch (e) {
            setLastError(normalizeErrorMessage(e));
          }
        }
        for (const message of next) {
          upsertIncomingMessage(message);
        }
        return msg;
      },
      async initiateMediaUpload(mimeType, sizeBytes) {
        const res = await api.initiateChatMediaUpload(session.sessionToken, { mimeType, sizeBytes });
        return { objectKey: res.objectKey, uploadUrl: res.uploadUrl };
      },
      async uploadToSignedUrl(uploadUrl, file, mimeType) {
        if (await uploadToLocalSignedUrl(uploadUrl, file, mimeType)) return;
        const res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": mimeType },
          body: file
        });
        if (!res.ok) {
          throw { code: "MEDIA_UPLOAD_INCOMPLETE", message: "Upload failed." } as ServiceError;
        }
      },
      async getMediaUrl(objectKey) {
        const res = await api.getChatMediaUrl(session.sessionToken, objectKey);
        return res.downloadUrl;
      }
    }),
    [api, me, session.sessionToken, setLastError, thirdMemberKey]
  );

  function messagePreview(message: ChatMessage): string {
    if (message.text && message.text.trim()) return displayMessageText(message.text);
    if (message.media?.kind === "image") return "[Photo]";
    if (message.media?.kind === "video") return "[Video]";
    if (message.media?.kind === "audio") return "[Voice]";
    return "";
  }

  function markMessageSeen(messageId: string): boolean {
    if (!messageId) return false;
    if (seenMessageIdsRef.current.has(messageId)) return false;
    seenMessageIdsRef.current.add(messageId);
    if (seenMessageIdsRef.current.size > 5000) {
      const keep = Array.from(seenMessageIdsRef.current).slice(-2500);
      seenMessageIdsRef.current = new Set(keep);
    }
    return true;
  }

  function notifyIncoming(message: ChatMessage, otherKey: string): void {
    const peerLabel = displayNameByKey[otherKey] ?? peerProfileByKey[otherKey]?.displayName ?? otherKey;
    const body = messagePreview(message) || "New activity";
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      try {
        void new Notification(`${peerLabel}`, { body });
      } catch {
        // best effort
      }
      return;
    }
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  function parseGroupInviteRequest(text: string): { inviteId: string; inviterKey: string; primaryPeerKey: string } | null {
    if (!text.startsWith("GROUP_INVITE_REQUEST|")) return null;
    const [, inviteId, inviterKey, primaryPeerKey] = text.split("|");
    if (!inviteId || !inviterKey || !primaryPeerKey) return null;
    return { inviteId, inviterKey, primaryPeerKey };
  }

  function parseGroupInviteAccept(text: string): { inviteId: string; candidateKey: string } | null {
    if (!text.startsWith("GROUP_INVITE_ACCEPT|")) return null;
    const [, inviteId, candidateKey] = text.split("|");
    if (!inviteId || !candidateKey) return null;
    return { inviteId, candidateKey };
  }

  function upsertIncomingMessage(message: ChatMessage): void {
    if (!markMessageSeen(message.messageId)) return;
    const other = message.fromKey === me ? message.toKey : message.fromKey;
    setMessagesByPeerKey((prev) => {
      const list = prev[other] ?? [];
      if (list.some((m) => m.messageId === message.messageId)) return prev;
      return { ...prev, [other]: [...list, message].sort((a, b) => a.createdAtMs - b.createdAtMs) };
    });
    setConversationMetaByPeerKey((prev) => ({
      ...prev,
      [other]: { lastAt: message.createdAtMs, lastText: messagePreview(message) }
    }));
    if (message.fromKey !== me) {
      const isOpenThread = view === "thread" && normalizePeerKey(peerKey) === normalizePeerKey(other);
      if (isOpenThread) {
        setLastSeenByPeerKey((prev) => ({ ...prev, [other]: Math.max(prev[other] ?? 0, message.createdAtMs) }));
        setUnreadByPeerKey((prev) => {
          const next = { ...prev };
          delete next[other];
          return next;
        });
      } else {
        setUnreadByPeerKey((prev) => ({ ...prev, [other]: (prev[other] ?? 0) + 1 }));
      }
      notifyIncoming(message, other);
    }
    const request = parseGroupInviteRequest(message.text ?? "");
    if (request && message.toKey === me) {
      setPendingInviteNotifs((prev) => (prev.some((n) => n.inviteId === request.inviteId) ? prev : [...prev, { ...request, createdAtMs: message.createdAtMs }]));
    }
    const accept = parseGroupInviteAccept(message.text ?? "");
    if (accept && message.toKey === me) {
      const pending = pendingSentInvites[accept.inviteId];
      if (pending) {
        setThirdMemberKey(normalizePeerKey(accept.candidateKey));
        setGroupStatus(`Invite accepted by ${displayNameByKey[accept.candidateKey] ?? accept.candidateKey}.`);
        setPendingSentInvites((prev) => {
          const next = { ...prev };
          delete next[accept.inviteId];
          return next;
        });
      }
    }
  }

  async function loadThreadMessages(targetPeerKey: string): Promise<void> {
    const normalizedTargetPeerKey = normalizePeerKey(targetPeerKey);
    if (!normalizedTargetPeerKey) return;
    try {
      const res = await api.listChat(session.sessionToken, channelToChatKind(channel), normalizedTargetPeerKey);
      const list = (res as any)?.messages as ChatMessage[];
      const safeList = Array.isArray(list) ? list : [];
      void api.markChatRead(session.sessionToken, channelToChatKind(channel), normalizedTargetPeerKey).catch(() => {});
      setMessagesByPeerKey((prev) => ({ ...prev, [normalizedTargetPeerKey]: safeList }));
      const last = safeList.length > 0 ? safeList[safeList.length - 1] : null;
      if (last) {
        setConversationMetaByPeerKey((prev) => ({
          ...prev,
          [normalizedTargetPeerKey]: { lastAt: last.createdAtMs, lastText: messagePreview(last) }
        }));
      }
      let maxIncoming = 0;
      for (const m of safeList) {
        if (m.fromKey === normalizedTargetPeerKey && m.createdAtMs > maxIncoming) maxIncoming = m.createdAtMs;
      }
      if (maxIncoming > 0) {
        setLastSeenByPeerKey((prev) => ({
          ...prev,
          [normalizedTargetPeerKey]: Math.max(prev[normalizedTargetPeerKey] ?? 0, maxIncoming)
        }));
      }
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  useEffect(() => {
    if (view !== "thread" || !peerKey.trim()) return;
    let cancelled = false;
    let inFlight = false;
    let timer: number | null = null;

    const poll = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await loadThreadMessages(peerKey);
      } finally {
        inFlight = false;
      }
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void poll();
      }, 1200);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [channel, peerKey, view]);

  useEffect(() => {
    if (view !== "grid") return;
    if (unreadCandidateKeys.length === 0) {
      setUnreadByPeerKey({});
      return;
    }

    let cancelled = false;
    async function refreshUnreadCounts(): Promise<void> {
      if (unreadInFlightRef.current) return;
      if (document.hidden) return;
      unreadInFlightRef.current = true;
      try {
        const chatKind = channelToChatKind(channel);
        const rows: Array<readonly [string, number]> = [];
        const metaRows: Array<readonly [string, { lastAt: number; lastText: string }]> = [];
        for (const key of unreadCandidateKeys) {
          if (cancelled) break;
          try {
            const normalizedKey = normalizePeerKey(key);
            if (!normalizedKey) continue;
            const res = await api.listChat(session.sessionToken, chatKind, normalizedKey);
            const list = ((res as any)?.messages ?? []) as ChatMessage[];
            if (list.length > 0) {
              const last = list[list.length - 1];
              metaRows.push([normalizedKey, { lastAt: last.createdAtMs, lastText: messagePreview(last) }]);
            }
            let count = 0;
            const seenAfter = lastSeenByPeerKey[normalizedKey] ?? 0;
            for (const m of list) {
              if (m.fromKey === normalizedKey && m.createdAtMs > seenAfter) count += 1;
            }
            rows.push([normalizedKey, count]);
          } catch {
            const normalizedKey = normalizePeerKey(key);
            if (normalizedKey) rows.push([normalizedKey, 0]);
          }
        }
        if (cancelled) return;
        if (metaRows.length > 0) {
          setConversationMetaByPeerKey((prev) => {
            const next = { ...prev };
            for (const [key, meta] of metaRows) next[key] = meta;
            return next;
          });
        }
        const next: Record<string, number> = {};
        for (const [key, count] of rows) {
          if (count > 0) next[key] = count;
        }
        setUnreadByPeerKey(next);
      } finally {
        unreadInFlightRef.current = false;
      }
    }

    const kick = window.setTimeout(() => {
      void refreshUnreadCounts();
    }, 1200);
    const id = window.setInterval(() => {
      void refreshUnreadCounts();
    }, 15_000);

    return () => {
      cancelled = true;
      unreadInFlightRef.current = false;
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [api, channel, lastSeenByPeerKey, session.sessionToken, unreadCandidateSignature, view]);

  useEffect(() => {
    const keys = Array.from(
      new Set<string>([...conversationKeys, ...unreadCandidateKeys, peerKey].map((k) => normalizePeerKey(k)).filter((k) => k.length > 0))
    ).slice(0, 10);
    if (keys.length === 0) return;

    let cancelled = false;
    const run = async (): Promise<void> => {
      if (cancelled || document.hidden || conversationSyncInFlightRef.current) return;
      conversationSyncInFlightRef.current = true;
      try {
        const chatKind = channelToChatKind(channel);
        const rows: Array<readonly [string, { lastAt: number; lastText: string }]> = [];
        for (const key of keys) {
          if (cancelled) break;
          try {
            const res = await api.listChat(session.sessionToken, chatKind, key);
            const list = ((res as any)?.messages ?? []) as ChatMessage[];
            if (list.length === 0) continue;
            const last = list[list.length - 1];
            rows.push([key, { lastAt: last.createdAtMs, lastText: messagePreview(last) }]);
          } catch {
            // ignore per-key failures; keep loop deterministic and resilient
          }
        }
        if (cancelled || rows.length === 0) return;
        setConversationMetaByPeerKey((prev) => {
          const next = { ...prev };
          for (const [key, meta] of rows) next[key] = meta;
          return next;
        });
      } finally {
        conversationSyncInFlightRef.current = false;
      }
    };

    const kick = window.setTimeout(() => {
      void run();
    }, 1000);
    const id = window.setInterval(() => {
      void run();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [api, channel, conversationKeys, peerKey, session.sessionToken, unreadCandidateSignature]);

  async function ensureLocalCallStream(): Promise<MediaStream> {
    if (localVideoStream) return localVideoStream;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw { code: "UNAUTHORIZED_ACTION", message: "Camera access is not available in this browser." } as ServiceError;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalVideoStream(stream);
    return stream;
  }

  function createPeerConnection(targetPeerKey: string, callId: string): RTCPeerConnection {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peerConnectionRef.current = pc;
    activeCallIdRef.current = callId;
    activeCallPeerRef.current = targetPeerKey;
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) setRemoteVideoStream(stream);
    };
    pc.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (!candidate) return;
      const toKey = activeCallPeerRef.current;
      const currentCallId = activeCallIdRef.current;
      if (!toKey || !currentCallId) return;
      void api.sendCallSignal(session.sessionToken, {
        toKey,
        callId: currentCallId,
        signalType: "ice",
        candidate: JSON.stringify(candidate.toJSON())
      }).catch(() => {});
    };
    return pc;
  }

  async function startVideoCall(): Promise<void> {
    if (!peerKey.trim()) {
      setLastError("Select a user first.");
      return;
    }
    try {
      const normalizedPeerKey = normalizePeerKey(peerKey);
      const stream = await ensureLocalCallStream();
      const callId = crypto.randomUUID();
      const pc = createPeerConnection(normalizedPeerKey, callId);
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await api.sendCallSignal(session.sessionToken, {
        toKey: normalizedPeerKey,
        callId,
        signalType: "offer",
        sdp: offer.sdp ?? ""
      });
      setVideoCallPeerLabel(activePeerLabel || normalizedPeerKey);
      setVideoCallOpen(true);
      await api.sendChat(session.sessionToken, channelToChatKind(channel), normalizedPeerKey, "Started a video call.");
      await loadThreadMessages(normalizedPeerKey);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function endVideoCall(notifyPeer = true): Promise<void> {
    const toKey = activeCallPeerRef.current;
    const callId = activeCallIdRef.current;
    if (notifyPeer && toKey && callId) {
      try {
        await api.sendCallSignal(session.sessionToken, {
          toKey,
          callId,
          signalType: "hangup"
        });
      } catch {
        // Best effort.
      }
    }
    if (localVideoStream) {
      for (const track of localVideoStream.getTracks()) track.stop();
    }
    if (remoteVideoStream) {
      for (const track of remoteVideoStream.getTracks()) track.stop();
    }
    setLocalVideoStream(null);
    setRemoteVideoStream(null);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    activeCallIdRef.current = null;
    activeCallPeerRef.current = null;
    setVideoCallOpen(false);
  }

  useEffect(() => {
    let stopped = false;
    const wsUrl = wsProxyUrl();
    if (!wsUrl) return;

    const clearTimers = (): void => {
      if (wsHeartbeatRef.current !== null) {
        window.clearInterval(wsHeartbeatRef.current);
        wsHeartbeatRef.current = null;
      }
      if (wsReconnectRef.current !== null) {
        window.clearTimeout(wsReconnectRef.current);
        wsReconnectRef.current = null;
      }
    };

    const connect = (): void => {
      if (stopped) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        wsFailuresRef.current = 0;
        ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: session.sessionToken } }));
        wsHeartbeatRef.current = window.setInterval(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "heartbeat", payload: {} }));
        }, 15000);
      };

      ws.onmessage = (event) => {
        let envelope: { type?: string; payload?: unknown } | null = null;
        try {
          envelope = JSON.parse(String(event.data)) as { type?: string; payload?: unknown };
        } catch {
          return;
        }
        if (!envelope || typeof envelope.type !== "string") return;
        if (envelope.type === "chat_message") {
          const payload = envelope.payload as { message?: ChatMessage } | undefined;
          const message = payload?.message;
          if (!message) return;
          if (message.fromKey !== me && message.toKey !== me) return;
          upsertIncomingMessage(message);
          return;
        }
        if (envelope.type !== "call_signal") return;
        const p = envelope.payload as
          | {
              fromKey?: string;
              toKey?: string;
              callId?: string;
              signalType?: "offer" | "answer" | "ice" | "hangup";
              sdp?: string;
              candidate?: string;
            }
          | undefined;
        if (!p || p.toKey !== me || typeof p.fromKey !== "string" || !p.callId || !p.signalType) return;
        const fromKey = normalizePeerKey(p.fromKey);
        if (p.signalType === "hangup") {
          void endVideoCall(false);
          return;
        }
        if (p.signalType === "offer") {
          void (async () => {
            try {
              openThread(fromKey);
              setVideoCallPeerLabel(fromKey);
              const stream = await ensureLocalCallStream();
              const pc = createPeerConnection(fromKey, p.callId as string);
              for (const track of stream.getTracks()) pc.addTrack(track, stream);
              await pc.setRemoteDescription({ type: "offer", sdp: p.sdp ?? "" });
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await api.sendCallSignal(session.sessionToken, {
                toKey: fromKey,
                callId: p.callId as string,
                signalType: "answer",
                sdp: answer.sdp ?? ""
              });
              setVideoCallOpen(true);
            } catch (e) {
              setLastError(normalizeErrorMessage(e));
            }
          })();
          return;
        }
        if (p.signalType === "answer") {
          void (async () => {
            try {
              if (!peerConnectionRef.current) return;
              if (activeCallIdRef.current !== p.callId) return;
              await peerConnectionRef.current.setRemoteDescription({ type: "answer", sdp: p.sdp ?? "" });
            } catch (e) {
              setLastError(normalizeErrorMessage(e));
            }
          })();
          return;
        }
        if (p.signalType === "ice") {
          void (async () => {
            try {
              if (!peerConnectionRef.current) return;
              if (activeCallIdRef.current !== p.callId) return;
              if (!p.candidate) return;
              const parsed = JSON.parse(p.candidate) as RTCIceCandidateInit;
              await peerConnectionRef.current.addIceCandidate(parsed);
            } catch {
              // ignore invalid transient candidate
            }
          })();
        }
      };

      ws.onclose = () => {
        clearTimers();
        if (stopped) return;
        wsFailuresRef.current += 1;
        const delay = Math.min(8000, 500 * 2 ** Math.min(wsFailuresRef.current, 4));
        wsReconnectRef.current = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {};
    };

    connect();

    return () => {
      stopped = true;
      clearTimers();
      wsRef.current?.close(1000, "chat cleanup");
      wsRef.current = null;
    };
  }, [api, me, session.sessionToken]);

  async function addThirdMember(): Promise<void> {
    if (!thirdCandidateKey.trim()) return;
    if (!peerKey.trim()) {
      setLastError("Select a user first.");
      return;
    }
    try {
      const normalizedThird = normalizePeerKey(thirdCandidateKey);
      if (!normalizedThird) return;
      if (!spokenThirdCandidates.some((candidate) => candidate.key === normalizedThird)) {
        setLastError("You can only add a third user you have previously messaged.");
        return;
      }
      const inviteId = crypto.randomUUID();
      await api.sendChat(
        session.sessionToken,
        "cruise",
        normalizedThird,
        `GROUP_INVITE_REQUEST|${inviteId}|${me}|${peerKey.trim()}`
      );
      setPendingSentInvites((prev) => ({ ...prev, [inviteId]: { candidateKey: normalizedThird, primaryPeerKey: peerKey.trim() } }));
      setGroupStatus(`Invite sent to ${displayNameByKey[normalizedThird] ?? normalizedThird}. Waiting for acceptance.`);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function acceptInvite(inviteId: string, inviterKey: string, primaryPeerKey: string): Promise<void> {
    try {
      await api.sendChat(session.sessionToken, "cruise", inviterKey, `GROUP_INVITE_ACCEPT|${inviteId}|${me}`);
      setPendingInviteNotifs((prev) => prev.filter((n) => n.inviteId !== inviteId));
      setGroupStatus("Group invite accepted.");
      openThread(primaryPeerKey);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  function declineInvite(inviteId: string): void {
    setPendingInviteNotifs((prev) => prev.filter((n) => n.inviteId !== inviteId));
  }

  function openThread(nextPeerKey: string): void {
    const normalizedNextPeerKey = normalizePeerKey(nextPeerKey);
    setSelectedPeerKey(normalizedNextPeerKey);
    setThreadPeerKey(normalizedNextPeerKey);
    setUnreadByPeerKey((prev) => {
      const next = { ...prev };
      delete next[normalizedNextPeerKey];
      return next;
    });
    setLastSeenByPeerKey((prev) => ({ ...prev, [normalizedNextPeerKey]: Date.now() }));
    setView("thread");
  }

  function clearGridFilters(): void {
    setFavoritesOnly(false);
    setOnlineStatusFilter("all");
    setHasPicturesOnly(false);
    setFilterMinAge("");
    setFilterMaxAge("");
    setFilterRace("");
    setFilterMinHeight("");
    setFilterMaxHeight("");
    setFilterMinWeight("");
    setFilterMaxWeight("");
    setFilterMinCockSize("");
    setFilterMaxCockSize("");
    setFilterCutStatus("");
    setFilterPosition("");
    setFiltersOpen(false);
  }

  useEffect(() => {
    const onDiscoverControl = (evt: Event): void => {
      const custom = evt as CustomEvent<{ action?: string }>;
      const action = custom.detail?.action;
      if (action === "reset") {
        clearGridFilters();
        setView("grid");
        return;
      }
      if (action === "toggle_favorites") {
        setFavoritesOnly((v) => !v);
        setView("grid");
        return;
      }
      if (action === "open_filters") {
        setFiltersOpen(true);
        setView("grid");
      }
    };
    window.addEventListener("rd:discover-control", onDiscoverControl as EventListener);
    return () => window.removeEventListener("rd:discover-control", onDiscoverControl as EventListener);
  }, []);

  useEffect(() => {
    if (!openThreadRequest) return;
    if (openThreadRequest.nonce === lastThreadRequestNonceRef.current) return;
    lastThreadRequestNonceRef.current = openThreadRequest.nonce;
    openThread(openThreadRequest.key);
    if (typeof onThreadRequestConsumed === "function") onThreadRequestConsumed();
  }, [onThreadRequestConsumed, openThreadRequest]);

  useEffect(() => {
    const onTabSelect = (evt: Event): void => {
      const custom = evt as CustomEvent<{ tab?: TopTab }>;
      if (custom.detail?.tab !== "discover") return;
      setView("grid");
      setThreadPeerKey(null);
      setFiltersOpen(false);
    };
    window.addEventListener("rd:tab-select", onTabSelect as EventListener);
    return () => window.removeEventListener("rd:tab-select", onTabSelect as EventListener);
  }, []);

  if (view === "thread" && peerKey.trim()) {
    const peerLabel = displayNameByKey[peerKey] ?? peerProfileByKey[peerKey]?.displayName ?? peerKey;
    return (
      <div style={{ display: "grid", gap: 0, marginInline: isMobile ? -10 : 0 }}>
        {pendingInviteNotifs.length > 0 ? (
          <div style={{ ...cardStyle(), display: "grid", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>INVITE REQUESTS</div>
            {pendingInviteNotifs.map((invite) => (
              <div key={invite.inviteId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                <div style={{ color: "#ced3dc", fontSize: 13 }}>
                  {displayNameByKey[invite.inviterKey] ?? invite.inviterKey} invited you to join a conversation.
                </div>
                <button type="button" style={buttonPrimary(false)} onClick={() => void acceptInvite(invite.inviteId, invite.inviterKey, invite.primaryPeerKey)}>
                  ACCEPT
                </button>
                <button type="button" style={buttonSecondary(false)} onClick={() => declineInvite(invite.inviteId)}>
                  DECLINE
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {groupStatus ? <div style={{ color: "#26d5ff", fontSize: 12 }}>{groupStatus}</div> : null}
        <ChatWindow
          chatKind={channelToChatKind(channel)}
          peerKey={peerKey}
          currentUserKey={me}
          messages={messages}
          client={client}
          title={`INSTANT THREAD: ${peerLabel}`}
          peerSummary={{ displayName: peerLabel, avatarUrl: activePeerAvatarUrl }}
          thirdParty={{
            candidates: spokenThirdCandidates,
            selectedKey: thirdCandidateKey,
            onSelect: (key) => setThirdCandidateKey(key),
            onAdd: () => void addThirdMember(),
            disabled: busy
          }}
          showHeader={false}
          edgeToEdge={isMobile}
          fillHeight={isMobile}
        />
        {videoCallOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Video call"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 60,
              background: "rgba(0,0,0,0.82)",
              display: "grid",
              placeItems: "center",
              padding: 16
            }}
          >
            <div style={{ ...cardStyle(), width: "min(720px, 100%)", display: "grid", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>VIDEO CALL: {videoCallPeerLabel}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "100%", maxHeight: "52vh", borderRadius: 12, background: "#000" }} />
                <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", maxHeight: "52vh", borderRadius: 12, background: "#000" }} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" style={buttonSecondary(false)} onClick={() => void endVideoCall()}>END CALL</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 0, marginInline: isMobile ? -10 : 0 }}>
      {pendingInviteNotifs.length > 0 ? (
        <div style={{ ...cardStyle(), display: "grid", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>INVITE REQUESTS</div>
          {pendingInviteNotifs.map((invite) => (
            <div key={invite.inviteId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
              <div style={{ color: "#ced3dc", fontSize: 13 }}>
                {displayNameByKey[invite.inviterKey] ?? invite.inviterKey} invited you to join a conversation.
              </div>
              <button type="button" style={buttonPrimary(false)} onClick={() => void acceptInvite(invite.inviteId, invite.inviterKey, invite.primaryPeerKey)}>
                ACCEPT
              </button>
              <button type="button" style={buttonSecondary(false)} onClick={() => declineInvite(invite.inviteId)}>
                DECLINE
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {groupStatus ? <div style={{ color: "#26d5ff", fontSize: 12 }}>{groupStatus}</div> : null}
      <div style={{ padding: 10, borderBottom: "1px solid rgba(255,58,77,0.28)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <button type="button" style={buttonSecondary(false)} onClick={clearGridFilters}>
            GUYS
          </button>
          <button
            type="button"
            style={favoritesOnly ? buttonPrimary(false) : buttonSecondary(false)}
            onClick={() => setFavoritesOnly((v) => !v)}
            aria-label="Toggle favorites only"
          >
            ★
          </button>
          <button type="button" style={buttonSecondary(false)} onClick={() => setFiltersOpen(true)}>
            FILTER
          </button>
        </div>
      </div>
      {filtersOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            placeItems: "center",
            padding: 14
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Discover filters"
          onClick={() => setFiltersOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle(), width: "min(760px, 100%)", maxHeight: "86vh", overflow: "auto" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>FILTER USERS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={hasPicturesOnly} onChange={(e) => setHasPicturesOnly(e.target.checked)} />
                  Has pictures
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span className="rd-label">Online status</span>
                  <select style={fieldStyle()} value={onlineStatusFilter} onChange={(e) => setOnlineStatusFilter(e.target.value as "all" | "online" | "offline")}>
                    <option value="all">All</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                  </select>
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <input style={fieldStyle()} placeholder="Min age" value={filterMinAge} onChange={(e) => setFilterMinAge(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max age" value={filterMaxAge} onChange={(e) => setFilterMaxAge(e.target.value)} />
                <input style={fieldStyle()} placeholder="Race" value={filterRace} onChange={(e) => setFilterRace(e.target.value)} />
                <select style={fieldStyle()} value={filterCutStatus} onChange={(e) => setFilterCutStatus(e.target.value as "" | "cut" | "uncut")}>
                  <option value="">Cut / Uncut</option>
                  <option value="cut">Cut</option>
                  <option value="uncut">Uncut</option>
                </select>
                <input style={fieldStyle()} placeholder="Min height (in)" value={filterMinHeight} onChange={(e) => setFilterMinHeight(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max height (in)" value={filterMaxHeight} onChange={(e) => setFilterMaxHeight(e.target.value)} />
                <input style={fieldStyle()} placeholder="Min weight (lbs)" value={filterMinWeight} onChange={(e) => setFilterMinWeight(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max weight (lbs)" value={filterMaxWeight} onChange={(e) => setFilterMaxWeight(e.target.value)} />
                <input style={fieldStyle()} placeholder="Min cock size (in)" value={filterMinCockSize} onChange={(e) => setFilterMinCockSize(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max cock size (in)" value={filterMaxCockSize} onChange={(e) => setFilterMaxCockSize(e.target.value)} />
                <select style={fieldStyle()} value={filterPosition} onChange={(e) => setFilterPosition(e.target.value as "" | "top" | "bottom" | "side")}>
                  <option value="">Position</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="side">Side</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" style={buttonSecondary(false)} onClick={clearGridFilters}>RESET</button>
                <button type="button" style={buttonPrimary(false)} onClick={() => setFiltersOpen(false)}>DONE</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 0 }}>
          <div style={{ display: "grid", gap: 0, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {gridCards.length === 0 ? (
              <div style={{ color: "#b9bec9", fontSize: 13, padding: 12, gridColumn: "1 / -1" }}>No users match current filters.</div>
            ) : (
              gridCards.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onOpenProfile(p.key)}
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(255,58,77,0.35)",
                    borderRadius: 0,
                    padding: 0,
                    display: "grid",
                    gap: 0,
                    color: "#fff",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                    <img
                      src={p.avatarUrl ?? avatarForKey(p.key)}
                      alt="User avatar"
                      style={{ width: "100%", height: "100%", borderRadius: 0, objectFit: "cover", border: "1px solid #0fd9ff" }}
                    />
                    {p.isOnline ? <span style={{ position: "absolute", top: 4, left: 4, width: 10, height: 10, borderRadius: "50%", background: "#26d5ff", border: "2px solid #000" }} /> : null}
                  </div>
                </button>
              ))
            )}
          </div>
      </div>
    </div>
  );
}

function DateSurface({
  api,
  session,
  busy,
  setBusy,
  setLastError
}: Readonly<{
  api: Api;
  session: Session;
  busy: boolean;
  setBusy(value: boolean): void;
  setLastError(value: string | null): void;
}>): React.ReactElement {
  const [profiles, setProfiles] = useState<ReadonlyArray<DatingProfile>>([]);
  const [selectedMatchPeer, setSelectedMatchPeer] = useState<string | null>(null);
  const [matches, setMatches] = useState<ReadonlyArray<{ matchId: string; userA: string; userB: string }>>([]);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());

  const [filterMinAge, setFilterMinAge] = useState<string>("");
  const [filterMaxAge, setFilterMaxAge] = useState<string>("");
  const [filterRace, setFilterRace] = useState<string>("");
  const [filterMinHeight, setFilterMinHeight] = useState<string>("");
  const [filterMaxHeight, setFilterMaxHeight] = useState<string>("");
  const [filterMinWeight, setFilterMinWeight] = useState<string>("");
  const [filterMaxWeight, setFilterMaxWeight] = useState<string>("");
  const [filterMinCockSize, setFilterMinCockSize] = useState<string>("");
  const [filterMaxCockSize, setFilterMaxCockSize] = useState<string>("");
  const [filterCutStatus, setFilterCutStatus] = useState<"" | "cut" | "uncut">("");
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);

  const engine = useMemo(
    () =>
      createMatchEngine({
        async recordSwipe(toUserId, direction) {
          const res = await api.swipe(session.sessionToken, toUserId, direction);
          return { matchCreated: res.matchCreated, matchId: res.match?.matchId };
        }
      }),
    [api, session.sessionToken]
  );

  async function loadFeed(): Promise<void> {
    setBusy(true);
    setLastError(null);
    try {
      const res = await api.getDatingFeed(session.sessionToken);
      setProfiles(res.profiles);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
      setProfiles([]);
    } finally {
      setBusy(false);
    }
  }

  async function loadMatches(): Promise<void> {
    setBusy(true);
    setLastError(null);
    try {
      const res = await fetch("/api/matching/matches", {
        method: "GET",
        headers: { "x-session-token": session.sessionToken }
      });
      const json = await res.json();
      if (!res.ok) throw json;
      setMatches((json.matches ?? []) as any);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
      setMatches([]);
    } finally {
      setBusy(false);
    }
  }

  async function loadFavorites(): Promise<void> {
    try {
      const res = await api.getFavorites(session.sessionToken);
      setFavorites(new Set(res.favorites));
    } catch {
      setFavorites(new Set());
    }
  }

  useEffect(() => {
    void loadFeed();
    void loadMatches();
    void loadFavorites();
  }, [api, session.sessionToken]);

  async function toggleFavorite(userId: string): Promise<void> {
    try {
      const res = await api.toggleFavorite(session.sessionToken, userId);
      setFavorites(new Set(res.favorites));
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  const filteredProfiles = useMemo(() => {
    const minAge = filterMinAge.trim() ? Number(filterMinAge) : undefined;
    const maxAge = filterMaxAge.trim() ? Number(filterMaxAge) : undefined;
    const minHeight = filterMinHeight.trim() ? Number(filterMinHeight) : undefined;
    const maxHeight = filterMaxHeight.trim() ? Number(filterMaxHeight) : undefined;
    const minWeight = filterMinWeight.trim() ? Number(filterMinWeight) : undefined;
    const maxWeight = filterMaxWeight.trim() ? Number(filterMaxWeight) : undefined;
    const minCock = filterMinCockSize.trim() ? Number(filterMinCockSize) : undefined;
    const maxCock = filterMaxCockSize.trim() ? Number(filterMaxCockSize) : undefined;

    return profiles.filter((p) => {
      if (favoritesOnly && !favorites.has(p.id)) return false;
      if (Number.isFinite(minAge) && (typeof p.age !== "number" || p.age < (minAge as number))) return false;
      if (Number.isFinite(maxAge) && (typeof p.age !== "number" || p.age > (maxAge as number))) return false;
      if (filterRace.trim() && (!p.race || p.race.toLowerCase() !== filterRace.trim().toLowerCase())) return false;
      if (Number.isFinite(minHeight) && (typeof p.heightInches !== "number" || p.heightInches < (minHeight as number))) return false;
      if (Number.isFinite(maxHeight) && (typeof p.heightInches !== "number" || p.heightInches > (maxHeight as number))) return false;
      if (Number.isFinite(minWeight) && (typeof p.weightLbs !== "number" || p.weightLbs < (minWeight as number))) return false;
      if (Number.isFinite(maxWeight) && (typeof p.weightLbs !== "number" || p.weightLbs > (maxWeight as number))) return false;
      if (Number.isFinite(minCock) && (typeof p.cockSizeInches !== "number" || p.cockSizeInches < (minCock as number))) return false;
      if (Number.isFinite(maxCock) && (typeof p.cockSizeInches !== "number" || p.cockSizeInches > (maxCock as number))) return false;
      if (filterCutStatus && p.cutStatus !== filterCutStatus) return false;
      return true;
    });
  }, [favorites, favoritesOnly, filterCutStatus, filterMaxAge, filterMaxCockSize, filterMaxHeight, filterMaxWeight, filterMinAge, filterMinCockSize, filterMinHeight, filterMinWeight, filterRace, profiles]);

  const meUserId = session.userId ?? "";
  const meKey = toUserKey(meUserId);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>DATE</div>
          <div style={{ color: "#b9bec9", fontSize: 14 }}>Feed-only discovery. Presence is forbidden. Date chat requires mutual match.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button type="button" onClick={() => void loadFeed()} disabled={busy} style={buttonSecondary(busy)} aria-label="Refresh feed">REFRESH FEED</button>
            <button type="button" onClick={() => void loadMatches()} disabled={busy} style={buttonSecondary(busy)} aria-label="Refresh matches">REFRESH MATCHES</button>
          </div>
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>FILTERS</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /> Favorites only
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            <input style={fieldStyle()} placeholder="Min age" value={filterMinAge} onChange={(e) => setFilterMinAge(e.target.value)} />
            <input style={fieldStyle()} placeholder="Max age" value={filterMaxAge} onChange={(e) => setFilterMaxAge(e.target.value)} />
            <input style={fieldStyle()} placeholder="Race" value={filterRace} onChange={(e) => setFilterRace(e.target.value)} />
            <input style={fieldStyle()} placeholder="Min height" value={filterMinHeight} onChange={(e) => setFilterMinHeight(e.target.value)} />
            <input style={fieldStyle()} placeholder="Max height" value={filterMaxHeight} onChange={(e) => setFilterMaxHeight(e.target.value)} />
            <input style={fieldStyle()} placeholder="Min weight" value={filterMinWeight} onChange={(e) => setFilterMinWeight(e.target.value)} />
            <input style={fieldStyle()} placeholder="Max weight" value={filterMaxWeight} onChange={(e) => setFilterMaxWeight(e.target.value)} />
            <input style={fieldStyle()} placeholder="Min cock size" value={filterMinCockSize} onChange={(e) => setFilterMinCockSize(e.target.value)} />
            <input style={fieldStyle()} placeholder="Max cock size" value={filterMaxCockSize} onChange={(e) => setFilterMaxCockSize(e.target.value)} />
            <select style={fieldStyle()} value={filterCutStatus} onChange={(e) => setFilterCutStatus(e.target.value as "" | "cut" | "uncut")}>
              <option value="">Cut or uncut</option>
              <option value="cut">Cut</option>
              <option value="uncut">Uncut</option>
            </select>
          </div>
        </div>
      </div>

      <DatingFeed profiles={filteredProfiles} engine={engine} favoriteUserIds={favorites} onToggleFavorite={(userId) => void toggleFavorite(userId)} />

      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>MATCHES</div>
          {matches.length === 0 ? (
            <div style={{ color: "#b9bec9", fontSize: 14 }}>No matches.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {matches.map((m) => {
                const peer = m.userA === meUserId ? m.userB : m.userA;
                const fav = favorites.has(peer);
                return (
                  <div key={m.matchId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button type="button" onClick={() => void toggleFavorite(peer)} style={buttonSecondary(false)} aria-label="Toggle favorite">
                      {fav ? "★" : "☆"}
                    </button>
                    <button type="button" onClick={() => setSelectedMatchPeer(peer)} style={buttonSecondary(false)} aria-label={`Open chat with ${peer}`}>
                      CHAT: {peer}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedMatchPeer ? <DateChat api={api} session={session} meKey={meKey} peerUserId={selectedMatchPeer} setLastError={setLastError} /> : null}
    </div>
  );
}

function DateChat({
  api,
  session,
  meKey,
  peerUserId,
  setLastError
}: Readonly<{
  api: Api;
  session: Session;
  meKey: string;
  peerUserId: string;
  setLastError(value: string | null): void;
}>): React.ReactElement {
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [channel, setChannel] = useState<MessageChannel>("direct");
  const [videoCallOpen, setVideoCallOpen] = useState<boolean>(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerKey = toUserKey(peerUserId);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;
    video.srcObject = localVideoStream;
  }, [localVideoStream]);

  useEffect(
    () => () => {
      if (!localVideoStream) return;
      for (const track of localVideoStream.getTracks()) track.stop();
    },
    [localVideoStream]
  );

  const client: ChatApiClient = useMemo(
    () => ({
      async sendMessage(chatKind, toKey, text, media) {
        const res = await api.sendChat(session.sessionToken, chatKind, toKey, text, media);
        const msg = (res as any)?.message as ChatMessage;
        setMessages((prev) => [...prev, msg]);
        return msg;
      },
      async initiateMediaUpload(mimeType, sizeBytes) {
        const res = await api.initiateChatMediaUpload(session.sessionToken, { mimeType, sizeBytes });
        return { objectKey: res.objectKey, uploadUrl: res.uploadUrl };
      },
      async uploadToSignedUrl(uploadUrl, file, mimeType) {
        if (await uploadToLocalSignedUrl(uploadUrl, file, mimeType)) return;
        const res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": mimeType },
          body: file
        });
        if (!res.ok) {
          throw { code: "MEDIA_UPLOAD_INCOMPLETE", message: "Upload failed." } as ServiceError;
        }
      },
      async getMediaUrl(objectKey) {
        const res = await api.getChatMediaUrl(session.sessionToken, objectKey);
        return res.downloadUrl;
      }
    }),
    [api, session.sessionToken]
  );

  async function load(): Promise<void> {
    try {
      const res = await api.listChat(session.sessionToken, channelToChatKind(channel), peerKey);
      const list = (res as any)?.messages as ChatMessage[];
      setMessages(Array.isArray(list) ? list : []);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
      setMessages([]);
    }
  }

  useEffect(() => {
    void load();
  }, [api, channel, peerKey, session.sessionToken]);

  async function startVideoCall(): Promise<void> {
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        setLastError("Camera access is not available in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalVideoStream(stream);
      setVideoCallOpen(true);
      await api.sendChat(session.sessionToken, channelToChatKind(channel), peerKey, "VIDEO CALL REQUEST");
      await load();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  function endVideoCall(): void {
    if (localVideoStream) {
      for (const track of localVideoStream.getTracks()) track.stop();
    }
    setLocalVideoStream(null);
    setVideoCallOpen(false);
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={cardStyle()}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button type="button" style={channel === "instant" ? buttonPrimary(false) : buttonSecondary(false)} onClick={() => setChannel("instant")}>INSTANT</button>
          <button type="button" style={channel === "direct" ? buttonPrimary(false) : buttonSecondary(false)} onClick={() => setChannel("direct")}>DIRECT</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" style={buttonSecondary(false)} onClick={() => void startVideoCall()}>VIDEO CALL</button>
        </div>
      </div>
      <ChatWindow
        chatKind={channelToChatKind(channel)}
        peerKey={peerKey}
        currentUserKey={meKey}
        messages={messages}
        client={client}
        title={`DATE ${channel.toUpperCase()} CHAT: ${peerUserId}`}
        peerSummary={{ displayName: peerUserId }}
      />
      {videoCallOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Video call"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.82)",
            display: "grid",
            placeItems: "center",
            padding: 16
          }}
        >
          <div style={{ ...cardStyle(), width: "min(720px, 100%)", display: "grid", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>VIDEO CALL: {peerUserId}</div>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "100%", maxHeight: "65vh", borderRadius: 12, background: "#000" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={buttonSecondary(false)} onClick={endVideoCall}>END CALL</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThreadsPanel({
  api,
  session,
  setLastError,
  openThreadRequest,
  onThreadRequestConsumed,
  isMobile
}: Readonly<{
  api: Api;
  session: Session;
  setLastError(value: string | null): void;
  openThreadRequest?: { key: string; nonce: number } | null;
  onThreadRequestConsumed?: () => void;
  isMobile: boolean;
}>): React.ReactElement {
  const [rows, setRows] = useState<ReadonlyArray<{ key: string; displayName: string; preview: string; at: number; avatarUrl?: string }>>(
    []
  );
  const [selectedPeerKey, setSelectedPeerKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [threadView, setThreadView] = useState<"messages" | "profile">("messages");
  const [threadProfile, setThreadProfile] = useState<UserProfile | null>(null);
  const [threadProfileLoading, setThreadProfileLoading] = useState<boolean>(false);
  const [thirdCandidateKey, setThirdCandidateKey] = useState<string>("");
  const [thirdMemberKey, setThirdMemberKey] = useState<string | null>(null);
  const [pendingSentInvites, setPendingSentInvites] = useState<Record<string, { candidateKey: string }>>({});
  const [groupStatus, setGroupStatus] = useState<string | null>(null);

  const meKey = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
  const selectedChatKind: "cruise" = "cruise";

  const thirdCandidates = useMemo(
    () => rows.filter((row) => row.key !== selectedPeerKey).map((row) => ({ key: row.key, label: row.displayName })),
    [rows, selectedPeerKey]
  );
  const activeRow = useMemo(() => rows.find((row) => row.key === selectedPeerKey) ?? null, [rows, selectedPeerKey]);

  useEffect(() => {
    if (thirdCandidates.length === 0) {
      setThirdCandidateKey("");
      return;
    }
    setThirdCandidateKey((prev) => (prev && thirdCandidates.some((c) => c.key === prev) ? prev : thirdCandidates[0].key));
  }, [thirdCandidates]);

  useEffect(() => {
    let cancelled = false;
    async function refresh(): Promise<void> {
      try {
        const meKey = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
        const [profilesRes, presenceRes] = await Promise.all([api.getPublicProfiles(), api.listActivePresence(session.sessionToken)]);
        const nameByKey: Record<string, string> = {};
        const photoMediaIdByKey: Record<string, string> = {};
        for (const p of profilesRes.profiles) {
          nameByKey[chatKeyFromProfileUserId(p.userId)] = p.displayName;
          if (typeof p.mainPhotoMediaId === "string" && p.mainPhotoMediaId.trim() !== "") {
            photoMediaIdByKey[chatKeyFromProfileUserId(p.userId)] = p.mainPhotoMediaId;
          }
        }
        const candidateKeys = Array.from(
          new Set<string>(
            [
              ...profilesRes.profiles.map((p) => chatKeyFromProfileUserId(p.userId)),
              ...presenceRes.presence.map((p) => normalizePeerKey(p.key))
            ].filter((k) => k && k !== meKey)
          )
        ).slice(0, 24);
        const next: Array<{ key: string; displayName: string; preview: string; at: number; avatarUrl?: string }> = [];
        for (const key of candidateKeys) {
          try {
            const res = await api.listChat(session.sessionToken, "cruise", key);
            const list = ((res as any)?.messages ?? []) as ChatMessage[];
            if (!Array.isArray(list) || list.length === 0) continue;
            const last = list[list.length - 1];
            const preview =
              typeof last.text === "string" && last.text.trim().length > 0
                ? displayMessageText(last.text)
                : last.media?.kind === "image"
                  ? "[Photo]"
                  : last.media?.kind === "video"
                    ? "[Video]"
                    : last.media?.kind === "audio"
                      ? "[Voice]"
                      : "";
            next.push({
              key,
              displayName: nameByKey[key] ?? key,
              preview,
              at: last.createdAtMs
            });
          } catch {
            // ignore per-peer failures
          }
        }
        const mediaRows = await Promise.all(
          next.map(async (row) => {
            const mediaId = photoMediaIdByKey[row.key];
            if (!mediaId) return null;
            try {
              const res = await api.getPublicMediaUrl(mediaId);
              return { key: row.key, url: res.downloadUrl };
            } catch {
              return null;
            }
          })
        );
        const mediaByKey: Record<string, string> = {};
        for (const media of mediaRows) {
          if (!media) continue;
          mediaByKey[media.key] = media.url;
        }
        for (const row of next) {
          row.avatarUrl = mediaByKey[row.key];
        }
        if (cancelled) return;
        next.sort((a, b) => b.at - a.at);
        setRows(next);
      } catch (e) {
        if (!cancelled) setLastError(normalizeErrorMessage(e));
      }
    }

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, selectedPeerKey, session.sessionToken, session.userId, setLastError]);

  useEffect(() => {
    if (!openThreadRequest?.key) return;
    setSelectedPeerKey(normalizePeerKey(openThreadRequest.key));
    setThreadView("messages");
    if (typeof onThreadRequestConsumed === "function") onThreadRequestConsumed();
  }, [onThreadRequestConsumed, openThreadRequest]);

  useEffect(() => {
    const onTabSelect = (evt: Event): void => {
      const custom = evt as CustomEvent<{ tab?: TopTab }>;
      if (custom.detail?.tab !== "threads") return;
      setSelectedPeerKey(null);
      setThreadView("messages");
    };
    window.addEventListener("rd:tab-select", onTabSelect as EventListener);
    return () => window.removeEventListener("rd:tab-select", onTabSelect as EventListener);
  }, []);

  useEffect(() => {
    if (!selectedPeerKey || threadView !== "profile") return;
    const profileId = profileIdFromPresenceKey(selectedPeerKey);
    if (!profileId) {
      setThreadProfile(null);
      return;
    }
    let cancelled = false;
    setThreadProfileLoading(true);
    void api
      .getPublicProfile(profileId)
      .then((res) => {
        if (!cancelled) setThreadProfile(res.profile);
      })
      .catch((e) => {
        if (!cancelled) {
          setThreadProfile(null);
          setLastError(normalizeErrorMessage(e));
        }
      })
      .finally(() => {
        if (!cancelled) setThreadProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selectedPeerKey, setLastError, threadView]);

  useEffect(() => {
    if (!selectedPeerKey) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await api.listChat(session.sessionToken, selectedChatKind, selectedPeerKey);
        const list = ((res as any)?.messages ?? []) as ChatMessage[];
        if (!cancelled) {
          setMessages(Array.isArray(list) ? list : []);
          void api.markChatRead(session.sessionToken, selectedChatKind, selectedPeerKey).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) setLastError(normalizeErrorMessage(e));
      }
    };
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, selectedPeerKey, session.sessionToken, setLastError]);

  function parseGroupInviteAccept(text: string): { inviteId: string; candidateKey: string } | null {
    if (!text.startsWith("GROUP_INVITE_ACCEPT|")) return null;
    const [, inviteId, candidateKey] = text.split("|");
    if (!inviteId || !candidateKey) return null;
    return { inviteId, candidateKey };
  }

  const client: ChatApiClient = useMemo(
    () => ({
      async sendMessage(chatKind, toKey, text, media) {
        const res = await api.sendChat(session.sessionToken, chatKind, toKey, text, media);
        const msg = (res as any)?.message as ChatMessage;
        const accept = parseGroupInviteAccept(msg.text ?? "");
        if (accept && msg.toKey === meKey) {
          const pending = pendingSentInvites[accept.inviteId];
          if (pending) {
            setThirdMemberKey(accept.candidateKey);
            setGroupStatus(`Invite accepted by ${accept.candidateKey}.`);
            setPendingSentInvites((prev) => {
              const next = { ...prev };
              delete next[accept.inviteId];
              return next;
            });
          }
        }
        setMessages((prev) => [...prev, msg].sort((a, b) => a.createdAtMs - b.createdAtMs));
        if (chatKind === "cruise" && thirdMemberKey) {
          try {
            const copy = await api.sendChat(session.sessionToken, chatKind, thirdMemberKey, text, media);
            const copyMsg = (copy as any)?.message as ChatMessage;
            setMessages((prev) => [...prev, copyMsg].sort((a, b) => a.createdAtMs - b.createdAtMs));
          } catch (e) {
            setLastError(normalizeErrorMessage(e));
          }
        }
        return msg;
      },
      async initiateMediaUpload(mimeType, sizeBytes) {
        const res = await api.initiateChatMediaUpload(session.sessionToken, { mimeType, sizeBytes });
        return { objectKey: res.objectKey, uploadUrl: res.uploadUrl };
      },
      async uploadToSignedUrl(uploadUrl, file, mimeType) {
        if (await uploadToLocalSignedUrl(uploadUrl, file, mimeType)) return;
        const res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": mimeType }, body: file });
        if (!res.ok) throw { code: "MEDIA_UPLOAD_INCOMPLETE", message: "Upload failed." } as ServiceError;
      },
      async getMediaUrl(objectKey) {
        const res = await api.getChatMediaUrl(session.sessionToken, objectKey);
        return res.downloadUrl;
      }
    }),
    [api, meKey, pendingSentInvites, session.sessionToken, setLastError, thirdMemberKey]
  );

  async function sendThirdInvite(): Promise<void> {
    if (!selectedPeerKey || !thirdCandidateKey) return;
    if (!rows.some((row) => row.key === thirdCandidateKey)) {
      setLastError("You can only add a third user you have previously messaged.");
      return;
    }
    try {
      const inviteId = crypto.randomUUID();
      await api.sendChat(
        session.sessionToken,
        "cruise",
        thirdCandidateKey,
        `GROUP_INVITE_REQUEST|${inviteId}|${meKey}|${selectedPeerKey}`
      );
      setPendingSentInvites((prev) => ({ ...prev, [inviteId]: { candidateKey: thirdCandidateKey } }));
      setGroupStatus(`Invite sent to ${rows.find((r) => r.key === thirdCandidateKey)?.displayName ?? thirdCandidateKey}.`);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function sendFireToSelectedPeer(): Promise<void> {
    if (!selectedPeerKey) return;
    try {
      await api.sendChat(session.sessionToken, "cruise", selectedPeerKey, FIRE_SIGNAL_TEXT);
      setGroupStatus("Fire sent.");
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  if (selectedPeerKey) {
    const peerLabel = activeRow?.displayName ?? selectedPeerKey;
    return (
      <div
        style={{
          display: "grid",
          gap: 0,
          minHeight: isMobile ? "calc(100dvh - 150px)" : undefined,
          marginInline: isMobile ? -10 : 0,
          marginBlock: 0
        }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 46, background: "rgba(8,8,12,0.96)", borderBottom: "1px solid rgba(255,58,77,0.35)", padding: "6px 10px", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setThreadView((prev) => (prev === "messages" ? "profile" : "messages"))}
            style={{ background: "transparent", border: 0, color: "#26d5ff", fontSize: 13, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", padding: 0, cursor: "pointer" }}
          >
            {threadView === "messages" ? "View Profile" : "Back to Thread"}
          </button>
        </div>
        {threadView === "messages" ? (
          <ChatWindow
            chatKind={"cruise"}
            peerKey={selectedPeerKey}
            currentUserKey={meKey}
            messages={messages}
            client={client}
            title={`INSTANT THREAD: ${peerLabel}`}
            peerSummary={{ displayName: peerLabel }}
            thirdParty={{
              candidates: thirdCandidates,
              selectedKey: thirdCandidateKey,
              onSelect: (key) => setThirdCandidateKey(key),
              onAdd: () => void sendThirdInvite(),
              disabled: false
            }}
            showHeader={false}
            edgeToEdge={true}
            fillHeight={isMobile}
          />
        ) : (
          <div style={{ padding: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 12, alignItems: "center" }}>
              <img
                src={activeRow?.avatarUrl ?? avatarForKey(selectedPeerKey)}
                alt="Profile avatar"
                style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "2px solid #ff3047" }}
              />
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{threadProfile?.displayName ?? peerLabel}</div>
                <div style={{ color: "#26d5ff", fontSize: 14 }}>Instant Messaging Available</div>
              </div>
            </div>
            {threadProfileLoading ? <div style={{ color: "#9fb6bf", fontSize: 14 }}>Loading profile...</div> : null}
            {!threadProfileLoading ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ color: "#ced3dc", fontSize: 14, lineHeight: 1.5 }}>
                  <div>Age: {threadProfile?.age ?? "-"}</div>
                  <div>Race: {threadProfile?.stats?.race ?? "-"}</div>
                  <div>Height: {threadProfile?.stats?.heightInches ?? "-"}</div>
                  <div>Weight: {threadProfile?.stats?.weightLbs ?? "-"}</div>
                  <div>Cock Size: {threadProfile?.stats?.cockSizeInches ?? "-"}</div>
                  <div>Cut / Uncut: {threadProfile?.stats?.cutStatus ?? "-"}</div>
                  <div>Position: {threadProfile?.stats?.position ?? "-"}</div>
                  <div style={{ marginTop: 8 }}>Bio: {threadProfile?.bio ?? "-"}</div>
                </div>
                <div>
                  <button
                    type="button"
                    style={{ ...buttonSecondary(false), color: "#ffb347", borderColor: "rgba(255,179,71,0.65)" }}
                    onClick={() => void sendFireToSelectedPeer()}
                  >
                    🔥 FIRE
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 0, marginInline: isMobile ? -10 : 0, marginBlock: 0 }}>
      {rows.length === 0 ? (
        <div style={{ color: "#b9bec9", fontSize: 14, padding: 14 }}>No conversations yet.</div>
      ) : (
        rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setSelectedPeerKey(row.key)}
            style={{
              border: 0,
              borderBottom: "1px solid rgba(255,58,77,0.24)",
              borderRadius: 0,
              padding: "10px 12px",
              background: "rgba(0,0,0,0.2)",
              textAlign: "left",
              color: "#fff",
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "52px 1fr",
              gap: 10,
              alignItems: "center",
              width: "100%"
            }}
          >
            <img
              src={row.avatarUrl ?? avatarForKey(row.key)}
              alt={`${row.displayName} avatar`}
              style={{ width: 52, height: 52, borderRadius: 6, objectFit: "cover", border: "1px solid rgba(38,213,255,0.9)" }}
            />
            <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{row.displayName}</div>
              <div style={{ color: "#b9bec9", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.preview}</div>
            </div>
          </button>
        ))
      )}
      {groupStatus ? <div style={{ color: "#26d5ff", fontSize: 12, padding: 10 }}>{groupStatus}</div> : null}
    </div>
  );
}

function PublicPostings({
  api,
  session,
  isMobile,
  setLastError
}: Readonly<{
  api: Api;
  session: Session;
  isMobile: boolean;
  setLastError(value: string | null): void;
}>): React.ReactElement {
  const [mobileTab, setMobileTab] = useState<MobilePublicTab>("ads");
  const [ads, setAds] = useState<ReadonlyArray<PublicPosting>>([]);
  const [events, setEvents] = useState<ReadonlyArray<PublicPosting>>([]);
  const [adTitle, setAdTitle] = useState<string>("");
  const [adBody, setAdBody] = useState<string>("");
  const [eventTitle, setEventTitle] = useState<string>("");
  const [eventBody, setEventBody] = useState<string>("");
  const [spots, setSpots] = useState<ReadonlyArray<CruisingSpot>>([]);
  const [spotName, setSpotName] = useState<string>("");
  const [spotAddress, setSpotAddress] = useState<string>("");
  const [spotDescription, setSpotDescription] = useState<string>("");
  const [eventInvites, setEventInvites] = useState<ReadonlyArray<PublicPosting>>([]);
  const [inviteTargetByEventId, setInviteTargetByEventId] = useState<Record<string, string>>({});

  const canPostAds = true;
  const canPostEvents = session.userType !== "guest";
  const canCreateSpots = true;

  async function refresh(): Promise<void> {
    try {
      const [adsRes, eventsRes, spotsRes, invitesRes] = await Promise.all([
        api.listPublicPostings("ad"),
        api.listPublicPostings("event"),
        api.listCruisingSpots(),
        session.userType === "guest" ? Promise.resolve({ postings: [] as ReadonlyArray<PublicPosting> }) : api.listEventInvites(session.sessionToken)
      ]);
      // Public postings should render oldest -> newest so new posts land at the bottom.
      setAds([...adsRes.postings].sort((a, b) => a.createdAtMs - b.createdAtMs));
      setEvents([...eventsRes.postings].sort((a, b) => a.createdAtMs - b.createdAtMs));
      setSpots(spotsRes.spots);
      setEventInvites(invitesRes.postings);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onTabSelect = (evt: Event): void => {
      const custom = evt as CustomEvent<{ tab?: TopTab }>;
      if (custom.detail?.tab !== "public") return;
      setMobileTab("ads");
    };
    window.addEventListener("rd:tab-select", onTabSelect as EventListener);
    return () => window.removeEventListener("rd:tab-select", onTabSelect as EventListener);
  }, []);

  async function submit(type: "ad" | "event"): Promise<void> {
    if (type === "event" && !canPostEvents) {
      setLastError("Anonymous users cannot create event postings.");
      return;
    }
    const title = type === "ad" ? adTitle : eventTitle;
    const body = type === "ad" ? adBody : eventBody;
    try {
      await api.createPublicPosting(session.sessionToken, { type, title, body });
      if (type === "ad") {
        setAdTitle("");
        setAdBody("");
      } else {
        setEventTitle("");
        setEventBody("");
      }
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function inviteToEvent(postingId: string): Promise<void> {
    if (!canPostEvents) {
      setLastError("Anonymous users cannot invite to events.");
      return;
    }
    const targetUserId = (inviteTargetByEventId[postingId] ?? "").trim();
    if (!targetUserId) {
      setLastError("Target user id is required.");
      return;
    }
    try {
      await api.inviteToEvent(session.sessionToken, { postingId, targetUserId });
      setInviteTargetByEventId((prev) => ({ ...prev, [postingId]: "" }));
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function respondToInvite(postingId: string, accept: boolean): Promise<void> {
    if (session.userType === "guest") {
      setLastError("Anonymous users cannot respond to event invites.");
      return;
    }
    try {
      await api.respondToEventInvite(session.sessionToken, { postingId, accept });
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function createSpot(): Promise<void> {
    try {
      await api.createCruisingSpot(session.sessionToken, { name: spotName, address: spotAddress, description: spotDescription });
      setSpotName("");
      setSpotAddress("");
      setSpotDescription("");
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function checkInSpot(spotId: string): Promise<void> {
    try {
      await api.checkInCruisingSpot(session.sessionToken, spotId);
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  const panel = (kind: "ads" | "events"): React.ReactElement => {
    const title = kind === "ads" ? "ADS" : "EVENTS";
    const list = kind === "ads" ? ads : events;
    const draftTitle = kind === "ads" ? adTitle : eventTitle;
    const draftBody = kind === "ads" ? adBody : eventBody;
    const setTitle = kind === "ads" ? setAdTitle : setEventTitle;
    const setBody = kind === "ads" ? setAdBody : setEventBody;
    const submitKind = kind === "ads" ? "ad" : "event";
    const canPostThis = kind === "ads" ? canPostAds : canPostEvents;

    return (
      <div style={{ border: "1px solid rgba(255,58,77,0.38)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.2)" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          <input value={draftTitle} onChange={(e) => setTitle(e.target.value)} placeholder={`${title} title`} style={fieldStyle()} aria-label={`${title} title`} disabled={!canPostThis} />
          <textarea value={draftBody} onChange={(e) => setBody(e.target.value)} placeholder={`Write ${title.toLowerCase()} details`} style={{ ...fieldStyle(), minHeight: 86, resize: "vertical" }} aria-label={`${title} details`} disabled={!canPostThis} />
          <button type="button" onClick={() => void submit(submitKind)} style={canPostThis ? buttonPrimary(false) : buttonSecondary(true)} disabled={!canPostThis}>
            POST {title}
          </button>
          {!canPostThis ? <div style={{ color: "#b9bec9", fontSize: 13 }}>Guests can view events but cannot post events.</div> : null}

          <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
            {list.length === 0 ? (
              <div style={{ color: "#b9bec9", fontSize: 14 }}>No {title.toLowerCase()} yet.</div>
            ) : (
              list.map((p) => (
                <div key={p.postingId} style={{ borderTop: "1px solid rgba(255,58,77,0.25)", paddingTop: 10, paddingBottom: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.title}</div>
                  <div style={{ color: "#9fb6bf", fontSize: 12, marginBottom: 6 }}>Host: {p.authorUserId}</div>
                  <div style={{ color: "#ced3dc", fontSize: 14, whiteSpace: "pre-wrap" }}>{p.body}</div>
                  {kind === "events" ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                      <div style={{ color: "#9fb6bf", fontSize: 12 }}>
                        Invited: {p.invitedUserIds?.length ?? 0} | Accepted: {p.acceptedUserIds?.length ?? 0}
                      </div>
                      {session.userId && session.userId === p.authorUserId ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                          <input
                            value={inviteTargetByEventId[p.postingId] ?? ""}
                            onChange={(e) => setInviteTargetByEventId((prev) => ({ ...prev, [p.postingId]: e.target.value }))}
                            placeholder="Invite user id"
                            style={fieldStyle()}
                          />
                          <button type="button" style={buttonSecondary(false)} onClick={() => void inviteToEvent(p.postingId)}>
                            INVITE
                          </button>
                        </div>
                      ) : null}
                      {session.userType !== "guest" &&
                      session.userId &&
                      Array.isArray(p.invitedUserIds) &&
                      p.invitedUserIds.includes(session.userId) ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" style={buttonPrimary(false)} onClick={() => void respondToInvite(p.postingId, true)}>
                            ACCEPT INVITE
                          </button>
                          <button type="button" style={buttonSecondary(false)} onClick={() => void respondToInvite(p.postingId, false)}>
                            DECLINE
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const spotsPanel = (
    <div style={{ border: "1px solid rgba(255,58,77,0.38)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.2)" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>CRUISING SPOTS</div>
        <input
          value={spotName}
          onChange={(e) => setSpotName(e.target.value)}
          placeholder="Spot name"
          style={fieldStyle()}
          disabled={!canCreateSpots}
        />
        <input
          value={spotAddress}
          onChange={(e) => setSpotAddress(e.target.value)}
          placeholder="Spot address"
          style={fieldStyle()}
          disabled={!canCreateSpots}
        />
        <textarea
          value={spotDescription}
          onChange={(e) => setSpotDescription(e.target.value)}
          placeholder="Spot description"
          style={{ ...fieldStyle(), minHeight: 80, resize: "vertical" }}
          disabled={!canCreateSpots}
        />
        <button type="button" style={canCreateSpots ? buttonPrimary(false) : buttonSecondary(true)} disabled={!canCreateSpots} onClick={() => void createSpot()}>
          CREATE SPOT
        </button>
        {!canCreateSpots ? <div style={{ color: "#b9bec9", fontSize: 13 }}>Guests can check in but cannot create spots.</div> : null}
        <div style={{ display: "grid", gap: 8 }}>
          {spots.length === 0 ? (
            <div style={{ color: "#b9bec9", fontSize: 14 }}>No cruising spots yet.</div>
          ) : (
            spots.map((spot) => (
              <div key={spot.spotId} style={{ borderTop: "1px solid rgba(255,58,77,0.25)", paddingTop: 10, paddingBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>{spot.name}</div>
                <div style={{ color: "#9fb6bf", fontSize: 12, marginTop: 4 }}>Created by: {spot.creatorUserId}</div>
                <div style={{ color: "#9fb6bf", fontSize: 12, marginTop: 2 }}>{spot.address}</div>
                <div style={{ color: "#ced3dc", fontSize: 14, whiteSpace: "pre-wrap", marginTop: 6 }}>{spot.description}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" style={buttonSecondary(false)} onClick={() => void checkInSpot(spot.spotId)}>
                    CHECK IN
                  </button>
                  <span style={{ color: "#9fb6bf", fontSize: 12 }}>Checked in: {spot.checkInCount ?? 0}</span>
                  <span style={{ color: "#9fb6bf", fontSize: 12 }}>Got action: {spot.actionCount ?? 0}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 8, marginInline: isMobile ? -10 : 0 }}>

      {isMobile ? (
        <>
          {mobileTab === "ads" ? panel("ads") : null}
          {mobileTab === "events" ? panel("events") : null}
          {mobileTab === "spots" ? spotsPanel : null}
          <div style={{ position: "sticky", bottom: "calc(86px + env(safe-area-inset-bottom, 0px))", zIndex: 31, background: "rgba(0,0,0,0.35)", padding: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <button type="button" style={mobileTab === "ads" ? buttonPrimary(false) : buttonSecondary(false)} onClick={() => setMobileTab("ads")}>ADS</button>
              <button type="button" style={mobileTab === "events" ? buttonPrimary(false) : buttonSecondary(false)} onClick={() => setMobileTab("events")}>EVENTS</button>
              <button type="button" style={mobileTab === "spots" ? buttonPrimary(false) : buttonSecondary(false)} onClick={() => setMobileTab("spots")}>SPOTS</button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {panel("ads")}
          {panel("events")}
          <div style={{ gridColumn: "1 / -1" }}>{spotsPanel}</div>
          {session.userType !== "guest" && eventInvites.length > 0 ? (
            <div style={{ border: "1px solid rgba(255,58,77,0.25)", gridColumn: "1 / -1", display: "grid", gap: 8, padding: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>EVENT INVITES</div>
              {eventInvites.map((event) => (
                <div key={event.postingId} style={{ display: "grid", gap: 6, border: "1px solid rgba(255,58,77,0.4)", borderRadius: 10, padding: 8 }}>
                  <div style={{ fontWeight: 700 }}>{event.title}</div>
                  <div style={{ color: "#b9bec9", fontSize: 13 }}>Host: {event.authorUserId}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={buttonPrimary(false)} onClick={() => void respondToInvite(event.postingId, true)}>ACCEPT</button>
                    <button type="button" style={buttonSecondary(false)} onClick={() => void respondToInvite(event.postingId, false)}>DECLINE</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SubmissionsPanel({ api, session, setLastError }: Readonly<{ api: Api; session: Session; setLastError(value: string | null): void }>): React.ReactElement {
  const [list, setList] = useState<ReadonlyArray<Submission>>([]);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");

  async function refresh(): Promise<void> {
    try {
      const res = await api.listSubmissions();
      // Submissions should render newest first.
      setList([...res.submissions].sort((a, b) => b.createdAtMs - a.createdAtMs));
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create(): Promise<void> {
    try {
      await api.createSubmission(session.sessionToken, { title, body });
      setTitle("");
      setBody("");
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function view(submissionId: string): Promise<void> {
    try {
      await api.recordSubmissionView(submissionId);
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function rate(submissionId: string, stars: number): Promise<void> {
    try {
      await api.rateSubmission(submissionId, stars);
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  const canCreate = session.userType !== "guest";

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ border: "1px solid rgba(255,58,77,0.35)", padding: 10, background: "rgba(0,0,0,0.2)" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={fieldStyle()} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Story title" disabled={!canCreate} />
          <textarea style={{ ...fieldStyle(), minHeight: 120 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your story" disabled={!canCreate} />
          <button type="button" style={canCreate ? buttonPrimary(false) : buttonSecondary(true)} disabled={!canCreate} onClick={() => void create()}>
            PUBLISH STORY
          </button>
          {!canCreate ? <div style={{ color: "#b9bec9", fontSize: 13 }}>Guests can read but cannot publish submissions.</div> : null}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {list.map((s) => {
          const avg = s.ratingCount > 0 ? (s.ratingSum / s.ratingCount).toFixed(2) : "0.00";
          return (
            <div key={s.submissionId} style={{ border: "1px solid rgba(255,58,77,0.28)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.22)" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{s.title}</div>
              <div style={{ color: "#ced3dc", whiteSpace: "pre-wrap", marginTop: 6 }}>{s.body}</div>
              <div style={{ color: "#b9bec9", fontSize: 13, marginTop: 8 }}>Views: {s.viewCount} | Rating: {avg} ({s.ratingCount})</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" style={buttonSecondary(false)} onClick={() => void view(s.submissionId)}>VIEW</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 1)}>★1</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 2)}>★2</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 3)}>★3</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 4)}>★4</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 5)}>★5</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromotedProfilesPanel({
  api,
  session,
  setLastError
}: Readonly<{ api: Api; session: Session; setLastError(value: string | null): void }>): React.ReactElement {
  const [listings, setListings] = useState<ReadonlyArray<{ listingId: string; userId: string; title: string; body: string; displayName: string; createdAtMs: number }>>([]);
  const [avatarUrlByUserId, setAvatarUrlByUserId] = useState<Record<string, string>>({});
  const [selectedProfile, setSelectedProfile] = useState<{
    userId: string;
    displayName: string;
    age: number;
    bio: string;
    stats?: {
      race?: string;
      heightInches?: number;
      weightLbs?: number;
      cockSizeInches?: number;
      cutStatus?: "cut" | "uncut";
      position?: "top" | "bottom" | "side";
    };
  } | null>(null);
  const [feeCents, setFeeCents] = useState<number>(2000);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [paymentToken, setPaymentToken] = useState<string>("");
  const [status, setStatus] = useState<string>("Ready.");

  const canPost = session.userType !== "guest";

  async function refresh(): Promise<void> {
    try {
      const res = await api.listPromotedProfiles();
      setListings([...res.listings].sort((a, b) => b.createdAtMs - a.createdAtMs));
      setFeeCents(res.feeCents);
      const uniqueUserIds = Array.from(new Set(res.listings.map((item) => item.userId))).filter((v) => v.trim().length > 0);
      const rows = await Promise.all(
        uniqueUserIds.map(async (userId) => {
          try {
            const profile = await api.getPublicProfile(userId);
            const mediaId = profile.profile.mainPhotoMediaId;
            if (!mediaId) return null;
            const media = await api.getPublicMediaUrl(mediaId);
            return { userId, url: media.downloadUrl };
          } catch {
            return null;
          }
        })
      );
      const next: Record<string, string> = {};
      for (const row of rows) {
        if (!row) continue;
        next[row.userId] = row.url;
      }
      setAvatarUrlByUserId(next);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function payAndUnlock(): Promise<void> {
    if (!canPost) {
      setLastError("Anonymous users cannot create promoted profiles.");
      return;
    }
    try {
      const started = await api.startPromotedPayment(session.sessionToken);
      const confirmed = await api.confirmPromotedPayment(session.sessionToken, started.payment.paymentToken);
      setPaymentToken(confirmed.payment.paymentToken);
      setStatus("Payment confirmed. You can now publish one promoted profile.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    }
  }

  async function publish(): Promise<void> {
    if (!canPost) {
      setLastError("Anonymous users cannot create promoted profiles.");
      return;
    }
    try {
      await api.createPromotedProfile(session.sessionToken, { paymentToken, title, body, displayName });
      setTitle("");
      setBody("");
      setDisplayName("");
      setPaymentToken("");
      setStatus("Promoted profile published.");
      await refresh();
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    }
  }

  async function openListingProfile(userId: string): Promise<void> {
    try {
      const res = await api.getPublicProfile(userId);
      setSelectedProfile(res.profile as any);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ border: "1px solid rgba(255,58,77,0.35)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.22)" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>PROMOTED PROFILES</div>
          <div style={{ color: "#b9bec9", fontSize: 14 }}>Publishing requires a ${Math.round(feeCents / 100)} fee per profile.</div>
          <div style={{ color: "#26d5ff", fontSize: 13 }}>{status}</div>
        </div>
      </div>

      <div style={{ border: "1px solid rgba(255,58,77,0.35)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.22)" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" style={fieldStyle()} disabled={!canPost} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" style={fieldStyle()} disabled={!canPost} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Profile description" style={{ ...fieldStyle(), minHeight: 92, resize: "vertical" }} disabled={!canPost} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={canPost ? buttonSecondary(false) : buttonSecondary(true)} disabled={!canPost} onClick={() => void payAndUnlock()}>
              PAY ${Math.round(feeCents / 100)}
            </button>
            <button type="button" style={canPost ? buttonPrimary(false) : buttonSecondary(true)} disabled={!canPost} onClick={() => void publish()}>
              PUBLISH PROFILE
            </button>
          </div>
          {!canPost ? <div style={{ color: "#b9bec9", fontSize: 13 }}>Guests can browse but cannot publish paid profiles.</div> : null}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {listings.length === 0 ? (
          <div style={{ color: "#b9bec9", fontSize: 14 }}>No promoted profiles yet.</div>
        ) : (
          listings.map((listing) => (
            <div key={listing.listingId} style={{ border: "1px solid rgba(255,58,77,0.25)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.22)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "start" }}>
                <img
                  src={avatarUrlByUserId[listing.userId] ?? avatarForKey(`user:${listing.userId}`)}
                  alt={`${listing.displayName} profile`}
                  style={{ width: 72, height: 72, borderRadius: 6, objectFit: "cover", border: "1px solid rgba(38,213,255,0.9)" }}
                />
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{listing.title}</div>
                  <div style={{ color: "#26d5ff", fontSize: 13 }}>{listing.displayName}</div>
                  <div style={{ color: "#ced3dc", whiteSpace: "pre-wrap", fontSize: 14 }}>{listing.body}</div>
                  <button
                    type="button"
                    style={buttonSecondary(false)}
                    onClick={() => void openListingProfile(listing.userId)}
                  >
                    VIEW PROFILE
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {selectedProfile ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            placeItems: "center",
            padding: 14
          }}
          onClick={() => setSelectedProfile(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ border: "1px solid rgba(255,58,77,0.35)", borderRadius: 0, padding: 12, width: "min(560px, 100%)", background: "rgba(0,0,0,0.88)" }}
          >
            <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedProfile.displayName}</div>
            <div style={{ color: "#ced3dc", marginTop: 6 }}>Age: {selectedProfile.age}</div>
            <div style={{ color: "#ced3dc", marginTop: 2 }}>Race: {selectedProfile.stats?.race ?? "-"}</div>
            <div style={{ color: "#ced3dc", marginTop: 2 }}>Height: {selectedProfile.stats?.heightInches ?? "-"}</div>
            <div style={{ color: "#ced3dc", marginTop: 2 }}>Weight: {selectedProfile.stats?.weightLbs ?? "-"}</div>
            <div style={{ color: "#ced3dc", marginTop: 2 }}>Cock Size: {selectedProfile.stats?.cockSizeInches ?? "-"}</div>
            <div style={{ color: "#ced3dc", marginTop: 2 }}>Cut / Uncut: {selectedProfile.stats?.cutStatus ?? "-"}</div>
            <div style={{ color: "#ced3dc", marginTop: 2 }}>Position: {selectedProfile.stats?.position ?? "-"}</div>
            <div style={{ color: "#ced3dc", marginTop: 10, whiteSpace: "pre-wrap" }}>{selectedProfile.bio}</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" style={buttonSecondary(false)} onClick={() => setSelectedProfile(null)}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function emptyProfileDraft(): ProfileDraft {
  return {
    displayName: "",
    age: "",
    bio: "",
    heightInches: "",
    race: "",
    cockSizeInches: "",
    cutStatus: "",
    weightLbs: "",
    position: "",
    discreetMode: false,
    travelEnabled: false,
    travelLat: "",
    travelLng: "",
    lookingForMore: ""
  };
}

function toProfileDraft(profile: UserProfile): ProfileDraft {
  const parsedBio = splitProfileBio(profile.bio);
  return {
    displayName: profile.displayName,
    age: String(profile.age),
    bio: parsedBio.bio,
    heightInches: profile.stats.heightInches !== undefined ? String(profile.stats.heightInches) : "",
    race: profile.stats.race ?? "",
    cockSizeInches: profile.stats.cockSizeInches !== undefined ? String(profile.stats.cockSizeInches) : "",
    cutStatus: profile.stats.cutStatus ?? "",
    weightLbs: profile.stats.weightLbs !== undefined ? String(profile.stats.weightLbs) : "",
    position: profile.stats.position ?? "",
    discreetMode: profile.discreetMode === true,
    travelEnabled: profile.travelMode?.enabled === true,
    travelLat: typeof profile.travelMode?.lat === "number" ? String(profile.travelMode.lat) : "",
    travelLng: typeof profile.travelMode?.lng === "number" ? String(profile.travelMode.lng) : "",
    lookingForMore: parsedBio.lookingForMore
  };
}

function splitProfileBio(rawBio: string): Readonly<{ bio: string; lookingForMore: string }> {
  const normalized = rawBio.replace(/\r\n/g, "\n").trim();
  const marker = "Looking For More:";
  const markerPattern = /Looking For More:\s*/g;
  const matches = Array.from(normalized.matchAll(markerPattern));
  if (matches.length === 0) {
    return { bio: normalized, lookingForMore: "" };
  }
  const firstMarker = matches[0];
  const lastMarker = matches[matches.length - 1];
  const markerStart = typeof firstMarker.index === "number" ? firstMarker.index : normalized.indexOf(marker);
  const markerEnd = (typeof lastMarker.index === "number" ? lastMarker.index : normalized.lastIndexOf(marker)) + lastMarker[0].length;
  const bio = normalized.slice(0, Math.max(0, markerStart)).trim();
  const lookingForMore = normalized.slice(Math.max(0, markerEnd)).trim();
  return { bio, lookingForMore };
}

function buildProfileBio(bio: string, lookingForMore: string): string {
  const parsedExisting = splitProfileBio(bio);
  const baseBio = parsedExisting.bio.trim();
  const looking = lookingForMore.trim();
  if (!looking) return baseBio;
  if (!baseBio) return `${looking}`;
  return `${baseBio}\n\nLooking For More: ${looking}`;
}

function parseOptionalInt(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function parseOptionalNumber(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function SettingsProfile({ api, session, setLastError }: Readonly<{ api: Api; session: Session; setLastError(value: string | null): void }>): React.ReactElement {
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mediaPreviewUrlById, setMediaPreviewUrlById] = useState<Record<string, string>>({});

  async function refreshProfile(): Promise<void> {
    setLoading(true);
    try {
      const res = await api.getMyProfile(session.sessionToken);
      setProfile(res.profile);
      setDraft(toProfileDraft(res.profile));
      setStatus("Profile loaded.");
    } catch (e) {
      const err = e as ServiceError;
      if (err?.code === "PROFILE_NOT_FOUND") {
        setProfile(null);
        setDraft((prev) => ({ ...prev, age: prev.age || "18" }));
        setStatus("No profile yet. Fill out the form and save.");
        return;
      }
      setStatus(normalizeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshProfile();
  }, [session.sessionToken, session.userType]);

  useEffect(() => {
    const ids = [
      profile?.mainPhotoMediaId,
      ...(profile?.galleryMediaIds ?? [])
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) return;
    const missing = ids.filter((id) => !mediaPreviewUrlById[id]);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (id) => {
        try {
          const res = await api.getPublicMediaUrl(id);
          return { id, url: res.downloadUrl };
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      setMediaPreviewUrlById((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (!row) continue;
          next[row.id] = row.url;
        }
        return next;
      });
    });
  }, [api, mediaPreviewUrlById, profile?.galleryMediaIds, profile?.mainPhotoMediaId]);

  async function saveProfile(): Promise<void> {
    setSaving(true);
    setLastError(null);
    try {
      const ageNum = Number(draft.age);
      const mergedBio = buildProfileBio(draft.bio, draft.lookingForMore);
      const travelLat = draft.travelLat.trim() ? Number(draft.travelLat) : undefined;
      const travelLng = draft.travelLng.trim() ? Number(draft.travelLng) : undefined;
      const payload = {
        displayName: draft.displayName,
        age: Math.trunc(ageNum),
        bio: mergedBio,
        stats: {
          heightInches: parseOptionalInt(draft.heightInches),
          race: draft.race.trim() || undefined,
          cockSizeInches: parseOptionalNumber(draft.cockSizeInches),
          cutStatus: draft.cutStatus || undefined,
          weightLbs: parseOptionalInt(draft.weightLbs),
          position: draft.position || undefined
        },
        discreetMode: draft.discreetMode,
        travelMode: {
          enabled: draft.travelEnabled,
          lat: Number.isFinite(travelLat) ? travelLat : undefined,
          lng: Number.isFinite(travelLng) ? travelLng : undefined
        }
      };

      const res = await api.upsertMyProfile(session.sessionToken, payload);
      setProfile(res.profile);
      setDraft(toProfileDraft(res.profile));
      try {
        localStorage.setItem(
          "reddoor_travel_center",
          JSON.stringify({
            enabled: res.profile.travelMode?.enabled === true,
            lat: res.profile.travelMode?.lat,
            lng: res.profile.travelMode?.lng
          })
        );
        window.dispatchEvent(
          new CustomEvent("rd:location-updated", {
            detail: { lat: res.profile.travelMode?.lat, lng: res.profile.travelMode?.lng }
          })
        );
      } catch {
        // ignore storage restrictions
      }
      setStatus("Profile saved.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: MediaKind, file: File | null): Promise<void> {
    if (!file) {
      setStatus("Choose a file first.");
      return;
    }
    if (session.userType === "guest") {
      setStatus("Guest sessions cannot upload media. Register to persist media.");
      return;
    }

    setSaving(true);
    setLastError(null);
    try {
      const initiated = await api.initiateMediaUpload(session.sessionToken, {
        kind,
        mimeType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
        sizeBytes: file.size
      });

      const handledLocally = await uploadToLocalSignedUrl(initiated.uploadUrl, file, file.type || "application/octet-stream");
      if (!handledLocally) {
        const uploadRes = await fetch(initiated.uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file
        });
        if (!uploadRes.ok) {
          throw { message: `Upload failed (${uploadRes.status}).` };
        }
      }

      await api.completeMediaUpload(session.sessionToken, initiated.mediaId);
      await refreshProfile();
      setStatus("Media uploaded.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    } finally {
      setSaving(false);
    }
  }

  const [mainFile, setMainFile] = useState<File | null>(null);
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  async function removeGalleryMedia(mediaId: string): Promise<void> {
    if (!profile) return;
    setSaving(true);
    try {
      const nextGallery = (profile.galleryMediaIds ?? []).filter((id) => id !== mediaId);
      const res = await api.updateProfileMediaReferences(session.sessionToken, { galleryMediaIds: nextGallery });
      setProfile(res.profile);
      setStatus("Gallery updated.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function setMainFromGallery(mediaId: string): Promise<void> {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await api.updateProfileMediaReferences(session.sessionToken, {
        galleryMediaIds: profile.galleryMediaIds,
        mainPhotoMediaId: mediaId
      });
      setProfile(res.profile);
      setStatus("Main photo updated.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>SETTINGS / PROFILE</div>
          {session.userType === "guest" ? (
            <div style={{ color: "#b9bec9", fontSize: 13 }}>
              Guest profile data is temporary for this session and is removed when you log out.
            </div>
          ) : null}
          {status ? <div style={{ color: "#b9bec9", fontSize: 14 }}>{status}</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Display Name</span>
              <input value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} style={fieldStyle()} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Age</span>
              <input value={draft.age} onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))} style={fieldStyle()} inputMode="numeric" />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span className="rd-label">Bio</span>
            <textarea value={draft.bio} onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))} style={{ ...fieldStyle(), minHeight: 88, resize: "vertical" }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className="rd-label">Looking For More (Optional)</span>
            <textarea
              value={draft.lookingForMore}
              onChange={(e) => setDraft((d) => ({ ...d, lookingForMore: e.target.value }))}
              style={{ ...fieldStyle(), minHeight: 72, resize: "vertical" }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={draft.discreetMode} onChange={(e) => setDraft((d) => ({ ...d, discreetMode: e.target.checked }))} />
              <span className="rd-label" style={{ margin: 0, fontSize: 13 }}>Discreet Mode (hide profile from others)</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={draft.travelEnabled} onChange={(e) => setDraft((d) => ({ ...d, travelEnabled: e.target.checked }))} />
              <span className="rd-label" style={{ margin: 0 }}>Travel Mode</span>
            </label>
          </div>

          {draft.travelEnabled ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="rd-label">Travel Lat</span>
                <input value={draft.travelLat} onChange={(e) => setDraft((d) => ({ ...d, travelLat: e.target.value }))} style={fieldStyle()} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="rd-label">Travel Lng</span>
                <input value={draft.travelLng} onChange={(e) => setDraft((d) => ({ ...d, travelLng: e.target.value }))} style={fieldStyle()} />
              </label>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Height (in)</span>
              <input value={draft.heightInches} onChange={(e) => setDraft((d) => ({ ...d, heightInches: e.target.value }))} style={fieldStyle()} inputMode="numeric" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Race</span>
              <input value={draft.race} onChange={(e) => setDraft((d) => ({ ...d, race: e.target.value }))} style={fieldStyle()} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Cock Size (in)</span>
              <input value={draft.cockSizeInches} onChange={(e) => setDraft((d) => ({ ...d, cockSizeInches: e.target.value }))} style={fieldStyle()} inputMode="decimal" />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Cut / Uncut</span>
              <select value={draft.cutStatus} onChange={(e) => setDraft((d) => ({ ...d, cutStatus: e.target.value as "" | ProfileCutStatus }))} style={fieldStyle()}>
                <option value="">Select</option>
                <option value="cut">Cut</option>
                <option value="uncut">Uncut</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Weight (lbs)</span>
              <input value={draft.weightLbs} onChange={(e) => setDraft((d) => ({ ...d, weightLbs: e.target.value }))} style={fieldStyle()} inputMode="numeric" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Position</span>
              <select value={draft.position} onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value as "" | ProfilePosition }))} style={fieldStyle()}>
                <option value="">Select</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="side">Side</option>
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void saveProfile()} style={buttonPrimary(saving)} disabled={saving}>SAVE PROFILE</button>
            <button type="button" onClick={() => void refreshProfile()} style={buttonSecondary(loading)} disabled={loading}>REFRESH</button>
          </div>
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>MEDIA</div>
          <div style={{ color: "#b9bec9", fontSize: 14 }}>Main profile photo, gallery photo, and video uploads.</div>

          <div style={{ display: "grid", gap: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)", background: "rgba(0,0,0,0.42)" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Main Photo</span>
              <input className="rd-input" type="file" accept="image/*" onChange={(e) => setMainFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" style={buttonPrimary(saving)} disabled={saving} onClick={() => void upload("photo_main", mainFile)}>UPLOAD MAIN PHOTO</button>
          </div>

          <div style={{ display: "grid", gap: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)", background: "rgba(0,0,0,0.42)" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Gallery Photo</span>
              <input className="rd-input" type="file" accept="image/*" onChange={(e) => setGalleryFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" style={buttonPrimary(saving)} disabled={saving} onClick={() => void upload("photo_gallery", galleryFile)}>UPLOAD GALLERY PHOTO</button>
          </div>

          <div style={{ display: "grid", gap: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)", background: "rgba(0,0,0,0.42)" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Video</span>
              <input className="rd-input" type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" style={buttonPrimary(saving)} disabled={saving} onClick={() => void upload("video", videoFile)}>UPLOAD VIDEO</button>
          </div>

          <div style={{ color: "#b9bec9", fontSize: 13 }}>
            Main photo media id: {profile?.mainPhotoMediaId ?? "-"}
            <br />
            Gallery count: {profile?.galleryMediaIds?.length ?? 0}
            <br />
            Video media id: {profile?.videoMediaId ?? "-"}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>YOUR GALLERY</div>
            {!profile?.galleryMediaIds?.length ? (
              <div style={{ color: "#b9bec9", fontSize: 13 }}>No gallery photos uploaded yet.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                {profile.galleryMediaIds.map((mediaId) => (
                  <div key={mediaId} style={{ border: "1px solid rgba(255,58,77,0.45)", borderRadius: 10, padding: 8, display: "grid", gap: 8 }}>
                    <img
                      src={mediaPreviewUrlById[mediaId] ?? avatarForKey(mediaId)}
                      alt="Gallery photo"
                      style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,58,77,0.4)" }}
                    />
                    <button type="button" style={buttonSecondary(saving)} disabled={saving} onClick={() => void setMainFromGallery(mediaId)}>
                      SET MAIN
                    </button>
                    <button type="button" style={buttonSecondary(saving)} disabled={saving} onClick={() => void removeGalleryMedia(mediaId)}>
                      REMOVE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  api,
  session,
  setLastError,
  onLogout
}: Readonly<{
  api: Api;
  session: Session;
  setLastError(value: string | null): void;
  onLogout?(): void;
}>): React.ReactElement {
  const [draft, setDraft] = useState<{ discreetMode: boolean; travelEnabled: boolean; travelLat: string; travelLng: string }>({
    discreetMode: false,
    travelEnabled: false,
    travelLat: "",
    travelLng: ""
  });
  const [status, setStatus] = useState<string>("Loading settings...");
  const [mediaConfigured, setMediaConfigured] = useState<boolean>(false);
  const [blockedUsers, setBlockedUsers] = useState<ReadonlyArray<string>>([]);

  async function refresh(): Promise<void> {
    try {
      const profileRes = await api.getMyProfile(session.sessionToken);
      setDraft({
        discreetMode: profileRes.profile.discreetMode === true,
        travelEnabled: profileRes.profile.travelMode?.enabled === true,
        travelLat: typeof profileRes.profile.travelMode?.lat === "number" ? String(profileRes.profile.travelMode.lat) : "",
        travelLng: typeof profileRes.profile.travelMode?.lng === "number" ? String(profileRes.profile.travelMode.lng) : ""
      });
      setStatus("Settings loaded.");
      if (session.userType !== "guest") {
        try {
          const blockedRes = await api.listBlocked(session.sessionToken);
          setBlockedUsers(blockedRes.blocked);
        } catch {
          setBlockedUsers([]);
        }
      } else {
        setBlockedUsers([]);
      }
    } catch (e) {
      setStatus(normalizeErrorMessage(e));
    }
  }

  async function refreshConfig(): Promise<void> {
    try {
      const res = await fetch("/api/config");
      const json = await res.json();
      if (!res.ok) throw json;
      setMediaConfigured(json.mediaStorageConfigured === true);
    } catch {
      setMediaConfigured(false);
    }
  }

  useEffect(() => {
    void refresh();
    void refreshConfig();
  }, [session.sessionToken, session.userType]);

  async function savePrivacy(): Promise<void> {
    try {
      const base = await api.getMyProfile(session.sessionToken);
      const travelLat = draft.travelLat.trim() ? Number(draft.travelLat) : undefined;
      const travelLng = draft.travelLng.trim() ? Number(draft.travelLng) : undefined;
      await api.upsertMyProfile(session.sessionToken, {
        displayName: base.profile.displayName,
        age: base.profile.age,
        bio: base.profile.bio,
        stats: base.profile.stats,
        discreetMode: draft.discreetMode,
        travelMode: {
          enabled: draft.travelEnabled,
          lat: Number.isFinite(travelLat) ? travelLat : undefined,
          lng: Number.isFinite(travelLng) ? travelLng : undefined
        }
      });
      setStatus("Privacy settings saved.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    }
  }

  async function detectActualLocation(): Promise<void> {
    if (!navigator.geolocation) {
      const msg = "Geolocation is unavailable on this device.";
      setStatus(msg);
      setLastError(msg);
      return;
    }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0
        });
      });
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      setDraft((prev) => ({ ...prev, travelEnabled: true, travelLat: String(lat), travelLng: String(lng) }));
      try {
        localStorage.setItem("reddoor_travel_center", JSON.stringify({ enabled: true, lat, lng }));
      } catch {
        // ignore storage limitations
      }
      try {
        await api.updatePresence(session.sessionToken, lat, lng, "online");
      } catch {
        // presence update is best-effort
      }
      window.dispatchEvent(new CustomEvent("rd:location-updated", { detail: { lat, lng } }));
      setStatus("Actual location detected. Save privacy settings to persist it.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    }
  }

  async function seedFakeUsers(): Promise<void> {
    try {
      const lat = draft.travelLat.trim() ? Number(draft.travelLat) : undefined;
      const lng = draft.travelLng.trim() ? Number(draft.travelLng) : undefined;
      const res = await api.seedFakeUsers(12, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined);
      setStatus(`Seeded ${res.seededCount} fake users for testing.`);
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    }
  }

  async function unblockUser(targetKey: string): Promise<void> {
    try {
      await api.unblock(session.sessionToken, targetKey);
      const blockedRes = await api.listBlocked(session.sessionToken);
      setBlockedUsers(blockedRes.blocked);
      setStatus("Blocked users updated.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>SETTINGS</div>
          <div style={{ color: "#b9bec9", fontSize: 14 }}>{status}</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={draft.discreetMode} onChange={(e) => setDraft((d) => ({ ...d, discreetMode: e.target.checked }))} />
            <span className="rd-label" style={{ margin: 0 }}>Discreet Mode (hide your profile)</span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={draft.travelEnabled} onChange={(e) => setDraft((d) => ({ ...d, travelEnabled: e.target.checked }))} />
            <span className="rd-label" style={{ margin: 0 }}>Travel Mode</span>
          </label>
          {draft.travelEnabled ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={draft.travelLat} onChange={(e) => setDraft((d) => ({ ...d, travelLat: e.target.value }))} style={fieldStyle()} placeholder="Travel lat" />
              <input value={draft.travelLng} onChange={(e) => setDraft((d) => ({ ...d, travelLng: e.target.value }))} style={fieldStyle()} placeholder="Travel lng" />
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={buttonPrimary(false)} onClick={() => void savePrivacy()}>SAVE PRIVACY</button>
            <button type="button" style={buttonSecondary(false)} onClick={() => void detectActualLocation()}>DETECT ACTUAL LOCATION</button>
            <button type="button" style={buttonSecondary(false)} onClick={() => void seedFakeUsers()}>SEED FAKE USERS</button>
            <button type="button" style={buttonSecondary(false)} onClick={() => onLogout?.()}>LOGOUT</button>
          </div>
        </div>
      </div>
      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>MEDIA STORAGE</div>
          <div style={{ color: mediaConfigured ? "#26d5ff" : "#ff8a95", fontSize: 14 }}>
            {mediaConfigured ? "Configured: uploads enabled." : "Not configured: set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY."}
          </div>
          <button type="button" style={buttonSecondary(false)} onClick={() => void refreshConfig()}>
            REFRESH STORAGE STATUS
          </button>
        </div>
      </div>
      {session.userType !== "guest" ? (
        <div style={cardStyle()}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>BLOCKED USERS</div>
            {blockedUsers.length === 0 ? (
              <div style={{ color: "#b9bec9", fontSize: 13 }}>No blocked users.</div>
            ) : (
              blockedUsers.map((targetKey) => (
                <div key={targetKey} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#ced3dc", fontSize: 14 }}>{targetKey}</div>
                  <button type="button" style={buttonSecondary(false)} onClick={() => void unblockUser(targetKey)}>
                    UNBLOCK
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Router({
  api,
  session,
  setSession,
  settings,
  activeTab,
  setActiveTab,
  discoverScreen,
  onDiscoverScreenChange,
  discoverFilter,
  busy,
  setBusy,
  setLastError,
  onUnreadCountChange,
  hideModeCard,
  onLogout
}: Readonly<{
  api: Api;
  session: Session;
  setSession(session: Session): void;
  settings: Settings;
  activeTab: TopTab;
  setActiveTab(tab: TopTab): void;
  discoverScreen: DiscoverScreen;
  onDiscoverScreenChange(value: DiscoverScreen): void;
  discoverFilter: DiscoverFilter;
  busy: boolean;
  setBusy(value: boolean): void;
  setLastError(value: string | null): void;
  onUnreadCountChange?(count: number): void;
  hideModeCard?: boolean;
  onLogout?(): void;
}>): React.ReactElement {
  const isMobile = useIsMobile();
  const [externalOpenThreadRequest, setExternalOpenThreadRequest] = useState<{ key: string; nonce: number } | null>(null);

  const unifiedSettingsSurface = (
    <div style={{ display: "grid", gap: 12 }}>
      <SettingsProfile api={api} session={session} setLastError={setLastError} />
      <SettingsPanel api={api} session={session} setLastError={setLastError} onLogout={onLogout} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!hideModeCard ? null : null}

      <div style={{ display: activeTab === "discover" ? "block" : "none" }}>
        <CruiseSurface
          api={api}
          session={session}
          settings={settings}
          discoverFilter={discoverFilter}
          busy={busy}
          setBusy={setBusy}
          setLastError={setLastError}
          isMobile={isMobile}
          discoverScreen={discoverScreen}
          onDiscoverScreenChange={onDiscoverScreenChange}
          onOpenThreadRequested={(key) => {
            setExternalOpenThreadRequest({ key: normalizePeerKey(key), nonce: Date.now() });
            setActiveTab("threads");
          }}
          onUnreadCountChange={onUnreadCountChange}
        />
      </div>
      {activeTab === "threads" ? (
        <ThreadsPanel
          api={api}
          session={session}
          setLastError={setLastError}
          openThreadRequest={externalOpenThreadRequest}
          onThreadRequestConsumed={() => setExternalOpenThreadRequest(null)}
          isMobile={isMobile}
        />
      ) : null}
      {activeTab === "public" ? <PublicPostings api={api} session={session} isMobile={isMobile} setLastError={setLastError} /> : null}
      {activeTab === "profile" || activeTab === "settings" ? unifiedSettingsSurface : null}
      {activeTab === "submissions" ? <SubmissionsPanel api={api} session={session} setLastError={setLastError} /> : null}
      {activeTab === "promoted" ? <PromotedProfilesPanel api={api} session={session} setLastError={setLastError} /> : null}
    </div>
  );
}
