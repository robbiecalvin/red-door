import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  apiClient,
  uploadToLocalSignedUrl,
  type MediaKind,
  type ProfileCutStatus,
  type ProfilePosition,
  type AdminUserSummary,
  type PublicProfile,
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
import mapSpotIcon from "../assets/map-spot-icon.svg";
import mapGroupIcon from "../assets/map-group-icon.svg";
import iconChatGrid from "../assets/icons/chatgrid.png";
import iconInbox from "../assets/icons/inbox.png";
import iconFavorites from "../assets/icons/favorites.png";
import iconSpots from "../assets/icons/cruisingspots.png";
import iconGroups from "../assets/icons/groups.png";

type Api = ReturnType<typeof apiClient>;

type Settings = Readonly<{
  defaultCenterLat: number;
  defaultCenterLng: number;
}>;

type TopTab = "discover" | "threads" | "ads" | "groups" | "cruise" | "profile" | "settings" | "submissions" | "promoted";
type DiscoverFilter = "all" | "online" | "favorites";
type MobileCruiseTab = "map" | "chat";
type DiscoverScreen = MobileCruiseTab;
type MobileInboxTab = "chat-grid" | "threads" | "pinned" | "spots" | "groups";
type MessageChannel = "instant" | "direct";
const FIRE_SIGNAL_TEXT = "FIRE_SIGNAL|1";
const PROFILE_MEDIA_UPDATED_EVENT = "rd:profile-media-updated";
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
      "radial-gradient(560px 240px at 10% 0%, rgba(255,46,63,0.24), transparent 58%), radial-gradient(460px 200px at 100% 0%, rgba(162,20,35,0.2), transparent 58%), linear-gradient(180deg, rgba(15,4,7,0.86), rgba(5,3,6,0.9))",
    border: "1px solid rgba(255,70,90,0.34)",
    borderRadius: 20,
    padding: 16,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,36,56,0.14), 0 18px 34px rgba(0,0,0,0.42)"
  };
}

function buttonPrimary(disabled: boolean): React.CSSProperties {
  return {
    background: disabled
      ? "linear-gradient(180deg, rgba(92, 92, 92, 0.7), rgba(60, 60, 60, 0.7))"
      : "linear-gradient(180deg, #ff4c60 0%, #f1102b 45%, #c60017 100%)",
    border: "1px solid rgba(255,95,110,0.64)",
    color: disabled ? "#999999" : "#FFFFFF",
    padding: "12px 20px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    boxShadow: disabled
      ? "none"
      : "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -10px 16px rgba(120,0,18,0.26), 0 12px 24px rgba(198,0,24,0.32)"
  };
}

function buttonSecondary(disabled: boolean): React.CSSProperties {
  return {
    background: "linear-gradient(180deg, rgba(20, 8, 12, 0.88), rgba(8, 5, 8, 0.9))",
    border: "1px solid rgba(255,95,110,0.36)",
    color: "#3fdfff",
    padding: "12px 18px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.05em",
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    opacity: disabled ? 0.6 : 1,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 18px rgba(0,0,0,0.28)"
  };
}

function fieldStyle(): React.CSSProperties {
  return {
    background: "linear-gradient(180deg, rgba(8,8,12,0.96), rgba(4,4,8,0.98))",
    color: "#ffffff",
    border: "1px solid rgba(255,80,98,0.22)",
    borderRadius: 14,
    padding: "13px 14px",
    fontSize: 17,
    lineHeight: 1.25,
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -10px 18px rgba(0,0,0,0.2), 0 7px 14px rgba(0,0,0,0.22)"
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

function formatEventDate(eventStartAtMs?: number): string {
  if (typeof eventStartAtMs !== "number" || !Number.isFinite(eventStartAtMs) || eventStartAtMs <= 0) return "Date TBD";
  return new Date(eventStartAtMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatEventTime(eventStartAtMs?: number): string {
  if (typeof eventStartAtMs !== "number" || !Number.isFinite(eventStartAtMs) || eventStartAtMs <= 0) return "Time TBD";
  return new Date(eventStartAtMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatRelativeTime(timestampMs: number): string {
  const deltaMs = Math.max(0, Date.now() - timestampMs);
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 10) return "a few seconds ago";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

function emitProfileMediaUpdated(profile: UserProfile): void {
  window.dispatchEvent(
    new CustomEvent(PROFILE_MEDIA_UPDATED_EVENT, {
      detail: { userId: profile.userId, profile }
    })
  );
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

function chatMessagesEqual(a: ReadonlyArray<ChatMessage>, b: ReadonlyArray<ChatMessage>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].messageId !== b[i].messageId) return false;
    if (a[i].readAtMs !== b[i].readAtMs) return false;
    if (a[i].deliveredAtMs !== b[i].deliveredAtMs) return false;
  }
  return true;
}

function threadRowsEqual(
  a: ReadonlyArray<{ key: string; chatKind: "cruise" | "date"; displayName: string; preview: string; at: number; unreadCount: number; avatarUrl?: string }>,
  b: ReadonlyArray<{ key: string; chatKind: "cruise" | "date"; displayName: string; preview: string; at: number; unreadCount: number; avatarUrl?: string }>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x.key !== y.key) return false;
    if (x.chatKind !== y.chatKind) return false;
    if (x.displayName !== y.displayName) return false;
    if (x.preview !== y.preview) return false;
    if (x.at !== y.at) return false;
    if (x.unreadCount !== y.unreadCount) return false;
    if ((x.avatarUrl ?? "") !== (y.avatarUrl ?? "")) return false;
  }
  return true;
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

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no-op for strict privacy mode
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
  const [mediaFetchedAtById, setMediaFetchedAtById] = useState<Record<string, number>>({});
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
  const [cruisingSpots, setCruisingSpots] = useState<ReadonlyArray<CruisingSpot>>([]);
  const [groupPostings, setGroupPostings] = useState<ReadonlyArray<PublicPosting>>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [mapVisibility, setMapVisibility] = useState<{ people: boolean; spots: boolean; groups: boolean }>({
    people: true,
    spots: true,
    groups: true
  });
  const [travelCenter, setTravelCenter] = useState<{ lat: number; lng: number } | null>(() => readTravelCenter());
  const [travelPickerArmed, setTravelPickerArmed] = useState<boolean>(false);
  const { state: presenceState, lastErrorMessage: realtimeError } = useCruisePresence({ wsUrl: wsProxyUrl(), sessionToken: session.sessionToken });
  const presence = useMemo(() => Array.from(presenceState.byKey.values()), [presenceState.byKey]);
  const mediaUrlFreshForMs = 8 * 60_000;
  const profileRequestSeqRef = useRef<number>(0);
  const selectedProfileKeyRef = useRef<string | null>(null);

  function applyResolvedMediaRows(
    rows: ReadonlyArray<{ mediaId: string; downloadUrl?: string; url?: string } | null>
  ): void {
    const resolved: Array<{ mediaId: string; value: string }> = [];
    for (const row of rows) {
      if (!row || typeof row.mediaId !== "string" || !row.mediaId.trim()) continue;
      const value = typeof row.downloadUrl === "string" ? row.downloadUrl : row.url;
      if (typeof value !== "string" || value.trim().length === 0) continue;
      resolved.push({ mediaId: row.mediaId, value });
    }
    if (resolved.length === 0) return;
    const now = Date.now();
    setMediaUrlById((prev) => {
      const next = { ...prev };
      for (const row of resolved) {
        next[row.mediaId] = row.value;
      }
      return next;
    });
    setMediaFetchedAtById((prev) => {
      const next = { ...prev };
      for (const row of resolved) next[row.mediaId] = now;
      return next;
    });
    setMediaRetryAfterById((prev) => {
      const next = { ...prev };
      for (const row of resolved) {
        if (typeof next[row.mediaId] === "number") delete next[row.mediaId];
      }
      return next;
    });
  }

  function invalidateMediaUrl(mediaId: string): void {
    if (!mediaId.trim()) return;
    setMediaUrlById((prev) => {
      if (!(mediaId in prev)) return prev;
      const next = { ...prev };
      delete next[mediaId];
      return next;
    });
    setMediaFetchedAtById((prev) => {
      if (!(mediaId in prev)) return prev;
      const next = { ...prev };
      delete next[mediaId];
      return next;
    });
    setMediaRetryAfterById((prev) => ({ ...prev, [mediaId]: Date.now() + 30_000 }));
  }

  useEffect(() => {
    setMobileTab(discoverScreen);
  }, [discoverScreen]);

  useEffect(() => {
    selectedProfileKeyRef.current = selectedProfileKey;
  }, [selectedProfileKey]);

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
    const onMapLayerFilter = (evt: Event): void => {
      const custom = evt as CustomEvent<{ people?: boolean; spots?: boolean; groups?: boolean }>;
      setMapVisibility({
        people: custom.detail?.people !== false,
        spots: custom.detail?.spots !== false,
        groups: custom.detail?.groups !== false
      });
    };
    window.addEventListener("rd:map-layer-filter", onMapLayerFilter as EventListener);
    return () => window.removeEventListener("rd:map-layer-filter", onMapLayerFilter as EventListener);
  }, []);

  useEffect(() => {
    const onOpenSelfProfile = (): void => {
      void openProfileByKey(meKey);
    };
    window.addEventListener("rd:open-self-profile", onOpenSelfProfile as EventListener);
    return () => window.removeEventListener("rd:open-self-profile", onOpenSelfProfile as EventListener);
  }, [meKey]);

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
        const list = await api.getPublicProfiles();
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
  }, [api, session.sessionToken, session.userType]);

  useEffect(() => {
    const onProfileMediaUpdated = (evt: Event): void => {
      const detail = (evt as CustomEvent<{ userId?: string; profile?: UserProfile }>).detail;
      const userId = typeof detail?.userId === "string" ? detail.userId : "";
      const profile = detail?.profile;
      if (!userId || !profile) return;

      setPublicProfiles((prev) =>
        prev.map((row) =>
          row.userId === userId
            ? ({
                ...row,
                displayName: profile.displayName,
                age: profile.age,
                bio: profile.bio,
                stats: profile.stats,
                discreetMode: profile.discreetMode,
                mainPhotoMediaId: profile.mainPhotoMediaId,
                galleryMediaIds: profile.galleryMediaIds,
                videoMediaId: profile.videoMediaId
              } as typeof row)
            : row
        )
      );
      setSelectedPublicProfile((prev) =>
        prev && prev.userId === userId
          ? {
              ...prev,
              displayName: profile.displayName,
              age: profile.age,
              bio: profile.bio,
              stats: profile.stats,
              discreetMode: profile.discreetMode,
              mainPhotoMediaId: profile.mainPhotoMediaId,
              galleryMediaIds: profile.galleryMediaIds,
              videoMediaId: profile.videoMediaId
            }
          : prev
      );

      const mediaIds = [profile.mainPhotoMediaId, ...(profile.galleryMediaIds ?? []), profile.videoMediaId].filter(
        (id): id is string => typeof id === "string" && id.length > 0
      );
      if (mediaIds.length > 0) {
        void Promise.all(
          mediaIds.map(async (mediaId) => {
            try {
              const res = await api.getPublicMediaUrl(mediaId);
              return { mediaId, url: res.downloadUrl };
            } catch {
              return null;
            }
          })
        ).then((rows) => applyResolvedMediaRows(rows));
      }
    };

    window.addEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    return () => {
      window.removeEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    async function refreshMapListings(): Promise<void> {
      try {
        const [spotsRes, groupsRes] = await Promise.all([
          api.listCruisingSpots(session.sessionToken),
          api.listPublicPostings("event", session.sessionToken)
        ]);
        if (!cancelled) {
          setCruisingSpots(spotsRes.spots);
          setGroupPostings(groupsRes.postings);
        }
      } catch {
        if (!cancelled) {
          setCruisingSpots([]);
          setGroupPostings([]);
        }
      }
    }
    void refreshMapListings();
    const id = window.setInterval(() => {
      void refreshMapListings();
    }, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, session.sessionToken]);

  useEffect(() => {
    const now = Date.now();
    const pendingMediaIds = publicProfiles
      .flatMap((p) => {
        const ids: string[] = [];
        if (p.mainPhotoMediaId) ids.push(p.mainPhotoMediaId);
        if (Array.isArray((p as any).galleryMediaIds)) ids.push(...((p as any).galleryMediaIds as string[]));
        if ((p as any).videoMediaId) ids.push((p as any).videoMediaId as string);
        return ids;
      })
      .filter(
        (id): id is string =>
          typeof id === "string" &&
          id.length > 0 &&
          now >= (mediaRetryAfterById[id] ?? 0) &&
          (!mediaUrlById[id] || now - (mediaFetchedAtById[id] ?? 0) >= mediaUrlFreshForMs)
      )
      .slice(0, 6);
    if (pendingMediaIds.length === 0) return;
    void Promise.all(
      pendingMediaIds.map(async (mediaId) => {
        try {
          const r = await api.getPublicMediaUrl(mediaId);
          return { mediaId, url: r.downloadUrl };
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      applyResolvedMediaRows(rows);
      setMediaRetryAfterById((prev) => {
        const next = { ...prev };
        for (let i = 0; i < pendingMediaIds.length; i += 1) {
          const mediaId = pendingMediaIds[i];
          if (!rows[i]) {
            next[mediaId] = Date.now() + 30_000;
          } else if (next[mediaId]) {
            delete next[mediaId];
          }
        }
        return next;
      });
    });
  }, [api, mediaFetchedAtById, mediaRetryAfterById, mediaUrlById, mediaUrlFreshForMs, publicProfiles]);

  async function openProfileByKey(key: string): Promise<void> {
    const keyChanged = selectedProfileKeyRef.current !== key;
    if (keyChanged) {
      setSelectedPublicProfile(null);
      setSelectedMediaIndex(0);
    }
    setSelectedProfileKey((prev) => (prev === key ? prev : key));
    const profileId = profileIdFromPresenceKey(key);
    if (!profileId) {
      setSelectedPublicProfile(null);
      return;
    }
    const requestSeq = ++profileRequestSeqRef.current;
    try {
      if (key === meKey) {
        const meProfile = await api.getMyProfile(session.sessionToken);
        if (requestSeq !== profileRequestSeqRef.current) return;
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
          if (requestSeq !== profileRequestSeqRef.current) return;
          applyResolvedMediaRows(rows);
        }
        if (requestSeq !== profileRequestSeqRef.current) return;
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
        if (requestSeq !== profileRequestSeqRef.current) return;
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
          if (requestSeq !== profileRequestSeqRef.current) return;
          applyResolvedMediaRows(rows);
        }
        if (requestSeq !== profileRequestSeqRef.current) return;
        setSelectedPublicProfile(res.profile as any);
      }
    } catch (e) {
      if (requestSeq !== profileRequestSeqRef.current) return;
      const err = e as ServiceError;
      if (err?.code === "PROFILE_HIDDEN") {
        setSelectedProfileKey(null);
        setSelectedPublicProfile(null);
        return;
      }
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

  async function handleTravelLocationSelected(coords: { lat: number; lng: number }): Promise<void> {
    if (!travelPickerArmed) return;
    setTravelPickerArmed(false);
    const lat = Number(coords.lat.toFixed(6));
    const lng = Number(coords.lng.toFixed(6));

    try {
      localStorage.setItem("reddoor_travel_center", JSON.stringify({ enabled: true, lat, lng }));
    } catch {
      // ignore storage restrictions
    }
    window.dispatchEvent(new CustomEvent("rd:location-updated", { detail: { lat, lng } }));
    try {
      await api.updatePresence(session.sessionToken, lat, lng, "online");
    } catch {
      // presence update is best effort
    }

    if (session.userType === "guest") return;
    try {
      const me = await api.getMyProfile(session.sessionToken);
      await api.upsertMyProfile(session.sessionToken, {
        displayName: me.profile.displayName,
        age: me.profile.age,
        bio: me.profile.bio,
        stats: me.profile.stats,
        discreetMode: me.profile.discreetMode,
        travelMode: { enabled: true, lat, lng }
      });
    } catch {
      // profile travel persistence is best effort
    }
  }

  const mapPresence = useMemo(() => {
    const hasSelf = mergedPresence.some((p) => p.key === meKey);
    const filteredPresence = mapVisibility.people ? mergedPresence : mergedPresence.filter((row) => row.key === meKey);
    if (hasSelf) return filteredPresence;
    const fallbackCenter = selfCoords ?? travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng };
    const syntheticSelf: CruisePresenceUpdate = {
      key: meKey,
      userType: session.userType,
      lat: fallbackCenter.lat,
      lng: fallbackCenter.lng,
      status: "online",
      updatedAtMs: Date.now()
    };
    return [syntheticSelf, ...filteredPresence];
  }, [mapVisibility.people, meKey, mergedPresence, selfCoords, session.userType, settings.defaultCenterLat, settings.defaultCenterLng, travelCenter]);

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
        imageUrl: mapSpotIcon,
        label: `${spot.name} | check-ins: ${spot.checkInCount ?? 0} | action: ${spot.actionCount ?? 0}`,
        onClick: () => setSelectedSpotId(spot.spotId)
      })),
    [cruisingSpots]
  );
  const groupMarkers = useMemo(() => {
    const presenceByUserId = new Map<string, { lat: number; lng: number }>();
    for (const row of mergedPresence) {
      const userId = userIdFromPresenceKey(row.key);
      if (!userId) continue;
      presenceByUserId.set(userId, { lat: row.lat, lng: row.lng });
    }
    return groupPostings
      .filter((posting) => posting.type === "event")
      .map((posting) => {
        const lat = typeof posting.lat === "number" && Number.isFinite(posting.lat) ? posting.lat : presenceByUserId.get(posting.authorUserId)?.lat;
        const lng = typeof posting.lng === "number" && Number.isFinite(posting.lng) ? posting.lng : presenceByUserId.get(posting.authorUserId)?.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: `group:${posting.postingId}`,
          position: { lat: lat as number, lng: lng as number },
          color: "#26d5ff",
          markerType: "group" as const,
          imageUrl: mapGroupIcon,
          label: `Group: ${posting.title}`,
          onClick: () => {
            window.location.hash = "#/groups";
          }
        };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  }, [groupPostings, mergedPresence]);
  const mapOverlayMarkers = useMemo(() => {
    const next: Array<(typeof spotMarkers)[number] | (typeof groupMarkers)[number]> = [];
    if (mapVisibility.spots) next.push(...spotMarkers);
    if (mapVisibility.groups) next.push(...groupMarkers);
    return next;
  }, [groupMarkers, mapVisibility.groups, mapVisibility.spots, spotMarkers]);

  const mapPanel = (
    <CruiseMap
      wsUrl={wsProxyUrl()}
      sessionToken={session.sessionToken}
      presenceUpdates={mapPresence}
      realtimeErrorMessage={realtimeError}
      onMarkerSelect={(key) => void openProfileByKey(key)}
      avatarByKey={avatarUrlByKey}
      additionalMarkers={mapOverlayMarkers}
      defaultCenter={travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng }}
      height={isMobile ? "calc(100vh - 340px)" : "calc(100dvh - 62px)"}
      visible
      travelPickerArmed={travelPickerArmed}
      onToggleTravelPicker={() => setTravelPickerArmed((prev) => !prev)}
      onTravelLocationSelected={(coords) => void handleTravelLocationSelected(coords)}
    />
  );

  const mobileMapPanel = (
    <div style={{ background: "#000", marginInline: -10 }}>
      <CruiseMap
        wsUrl={wsProxyUrl()}
        sessionToken={session.sessionToken}
        presenceUpdates={mapPresence}
        realtimeErrorMessage={realtimeError}
        onMarkerSelect={(key) => void openProfileByKey(key)}
        avatarByKey={avatarUrlByKey}
        additionalMarkers={mapOverlayMarkers}
        defaultCenter={travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng }}
        height={"calc(100dvh - 220px)"}
        visible={mobileTab === "map"}
        travelPickerArmed={travelPickerArmed}
        onToggleTravelPicker={() => setTravelPickerArmed((prev) => !prev)}
        onTravelLocationSelected={(coords) => void handleTravelLocationSelected(coords)}
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
      onAvatarLoadError={invalidateMediaUrl}
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
                    onError={() => {
                      if (selectedPublicProfile?.mainPhotoMediaId) invalidateMediaUrl(selectedPublicProfile.mainPhotoMediaId);
                    }}
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
                                onError={() => invalidateMediaUrl(activeId)}
                                style={{ width: "100%", maxHeight: 260, borderRadius: 10, background: "#000" }}
                              />
                            ) : (
                              <img
                                src={activeUrl ?? avatarForKey(selectedProfileKey ?? selectedPublicProfile.userId)}
                                onError={() => invalidateMediaUrl(activeId)}
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
                                        <video
                                          src={thumb}
                                          muted
                                          playsInline
                                          onError={() => invalidateMediaUrl(mediaId)}
                                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                        />
                                      ) : (
                                        "VIDEO"
                                      )}
                                    </div>
                                  ) : (
                                    <img
                                      src={thumb ?? avatarForKey(selectedProfileKey ?? selectedPublicProfile.userId)}
                                      onError={() => invalidateMediaUrl(mediaId)}
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
              const res = await api.listCruisingSpots(session.sessionToken);
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
  onAvatarLoadError,
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
  onAvatarLoadError?(mediaId: string): void;
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
  const [hasChatHistoryOnly, setHasChatHistoryOnly] = useState<boolean>(false);
  const [hasPicturesOnly, setHasPicturesOnly] = useState<boolean>(false);
  const [mapShowPeople, setMapShowPeople] = useState<boolean>(true);
  const [mapShowSpots, setMapShowSpots] = useState<boolean>(true);
  const [mapShowGroups, setMapShowGroups] = useState<boolean>(true);
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
            mainPhotoMediaId: p.mainPhotoMediaId,
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
      if (hasChatHistoryOnly && !conversationMetaByPeerKey[p.key]) return false;
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
    hasChatHistoryOnly,
    hasPicturesOnly,
    onlineStatusFilter,
    conversationMetaByPeerKey
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

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("rd:map-layer-filter", {
        detail: { people: mapShowPeople, spots: mapShowSpots, groups: mapShowGroups }
      })
    );
  }, [mapShowGroups, mapShowPeople, mapShowSpots]);

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
    setHasChatHistoryOnly(false);
    setHasPicturesOnly(false);
    setMapShowPeople(true);
    setMapShowSpots(true);
    setMapShowGroups(true);
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
        return;
      }
      if (action === "close_filters") {
        setFiltersOpen(false);
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

  const chatGridColumns = isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fill, minmax(170px, 210px))";

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
      {filtersOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 82,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            alignItems: "start",
            justifyItems: "center",
            padding: "calc(env(safe-area-inset-top, 0px) + 62px) 10px 10px"
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Discover filters"
          onClick={() => setFiltersOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...cardStyle(),
              width: "min(860px, 100%)",
              maxHeight: "calc(100dvh - 90px)",
              overflow: "auto",
              border: "1px solid rgba(255,95,110,0.56)",
              background: "linear-gradient(180deg, rgba(20,6,11,0.98), rgba(8,3,5,0.98))"
            }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>FILTER USERS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
                  Favorites only
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={hasChatHistoryOnly} onChange={(e) => setHasChatHistoryOnly(e.target.checked)} />
                  Has chat history
                </label>
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
              <div style={{ display: "grid", gap: 6 }}>
                <div className="rd-label">Map Layers</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={mapShowPeople} onChange={(e) => setMapShowPeople(e.target.checked)} />
                    People
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={mapShowSpots} onChange={(e) => setMapShowSpots(e.target.checked)} />
                    Places
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={mapShowGroups} onChange={(e) => setMapShowGroups(e.target.checked)} />
                    Groups
                  </label>
                </div>
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
          <div style={{ display: "grid", gap: 0, gridTemplateColumns: chatGridColumns, justifyContent: isMobile ? "stretch" : "space-between" }}>
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
                      onError={() => {
                        if (typeof p.mainPhotoMediaId === "string" && p.mainPhotoMediaId.trim() && onAvatarLoadError) {
                          onAvatarLoadError(p.mainPhotoMediaId);
                        }
                      }}
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
  isMobile,
  onUnreadCountChange,
  mode = "all",
  compact = false
}: Readonly<{
  api: Api;
  session: Session;
  setLastError(value: string | null): void;
  openThreadRequest?: { key: string; nonce: number } | null;
  onThreadRequestConsumed?: () => void;
  isMobile: boolean;
  onUnreadCountChange?(count: number): void;
  mode?: "all" | "pinned";
  compact?: boolean;
}>): React.ReactElement {
  const [rows, setRows] = useState<ReadonlyArray<{ key: string; chatKind: "cruise" | "date"; displayName: string; preview: string; at: number; unreadCount: number; avatarUrl?: string }>>(
    []
  );
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [selectedPeerKey, setSelectedPeerKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [threadView, setThreadView] = useState<"messages" | "profile">("messages");
  const [threadProfile, setThreadProfile] = useState<UserProfile | null>(null);
  const [threadProfileLoading, setThreadProfileLoading] = useState<boolean>(false);
  const [thirdCandidateKey, setThirdCandidateKey] = useState<string>("");
  const [thirdMemberKey, setThirdMemberKey] = useState<string | null>(null);
  const [pendingSentInvites, setPendingSentInvites] = useState<Record<string, { candidateKey: string }>>({});
  const [groupStatus, setGroupStatus] = useState<string | null>(null);
  const [pinnedKeys, setPinnedKeys] = useState<ReadonlySet<string>>(new Set());
  const [deletedKeys, setDeletedKeys] = useState<ReadonlySet<string>>(new Set());
  const avatarUrlByMediaIdRef = useRef<Record<string, string>>({});
  const avatarFetchedAtByMediaIdRef = useRef<Record<string, number>>({});
  const avatarUrlFreshForMs = 8 * 60_000;
  const deletedStorageKey = `reddoor:threads:deleted:${session.sessionToken}`;
  const pinnedStorageKey = `reddoor:threads:pinned:${session.sessionToken}`;

  const meKey = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
  const [threadKindByPeerKey, setThreadKindByPeerKey] = useState<Record<string, "cruise" | "date">>({});

  const visibleRows = useMemo(() => {
    const byPinned = mode === "pinned" ? rows.filter((row) => pinnedKeys.has(row.key)) : rows;
    const byDeleted = byPinned.filter((row) => !deletedKeys.has(row.key));
    return unreadOnly ? byDeleted.filter((row) => row.unreadCount > 0) : byDeleted;
  }, [deletedKeys, mode, pinnedKeys, rows, unreadOnly]);
  const thirdCandidates = useMemo(
    () => visibleRows.filter((row) => row.key !== selectedPeerKey && row.chatKind === "cruise").map((row) => ({ key: row.key, label: row.displayName })),
    [visibleRows, selectedPeerKey]
  );
  const activeRow = useMemo(() => rows.find((row) => row.key === selectedPeerKey) ?? null, [rows, selectedPeerKey]);
  const selectedChatKind: "cruise" | "date" = selectedPeerKey ? threadKindByPeerKey[selectedPeerKey] ?? "cruise" : "cruise";

  useEffect(() => {
    const parseSet = (raw: string | null): ReadonlySet<string> => {
      if (!raw) return new Set();
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0));
      } catch {
        return new Set();
      }
    };
    setPinnedKeys(parseSet(safeLocalStorageGet(pinnedStorageKey)));
    setDeletedKeys(parseSet(safeLocalStorageGet(deletedStorageKey)));
  }, [deletedStorageKey, pinnedStorageKey]);

  useEffect(() => {
    safeLocalStorageSet(pinnedStorageKey, JSON.stringify(Array.from(pinnedKeys.values()).sort()));
  }, [pinnedKeys, pinnedStorageKey]);

  useEffect(() => {
    safeLocalStorageSet(deletedStorageKey, JSON.stringify(Array.from(deletedKeys.values()).sort()));
  }, [deletedKeys, deletedStorageKey]);

  useEffect(() => {
    if (thirdCandidates.length === 0) {
      setThirdCandidateKey("");
      return;
    }
    setThirdCandidateKey((prev) => (prev && thirdCandidates.some((c) => c.key === prev) ? prev : thirdCandidates[0].key));
  }, [thirdCandidates]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function safeListThreads(chatKind: "cruise" | "date"): Promise<ReadonlyArray<Readonly<{ otherKey: string; lastMessage: ChatMessage }>>> {
      try {
        const result = await api.listChatThreads(session.sessionToken, chatKind);
        return Array.isArray(result.threads) ? result.threads : [];
      } catch {
        return [];
      }
    }

    async function refresh(): Promise<void> {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const [profilesRes, cruiseThreadsRes, dateThreadsRes] = await Promise.all([
          api.getPublicProfiles(),
          safeListThreads("cruise"),
          safeListThreads("date")
        ]);
        const nameByKey: Record<string, string> = {};
        const photoMediaIdByKey: Record<string, string> = {};
        for (const p of profilesRes.profiles) {
          nameByKey[chatKeyFromProfileUserId(p.userId)] = p.displayName;
          if (typeof p.mainPhotoMediaId === "string" && p.mainPhotoMediaId.trim() !== "") {
            photoMediaIdByKey[chatKeyFromProfileUserId(p.userId)] = p.mainPhotoMediaId;
          }
        }
        const nextByKey = new Map<string, { key: string; chatKind: "cruise" | "date"; displayName: string; preview: string; at: number; avatarUrl?: string }>();
        const kinds: Array<"cruise" | "date"> = ["cruise", "date"];
        for (const kind of kinds) {
          const source = kind === "cruise" ? cruiseThreadsRes : dateThreadsRes;
          for (const thread of source ?? []) {
            const normalizedKey = normalizePeerKey(thread?.otherKey ?? "");
            if (!normalizedKey || normalizedKey === meKey || normalizedKey.startsWith("spot:")) continue;
            const last = thread?.lastMessage as ChatMessage | undefined;
            if (!last || typeof last.createdAtMs !== "number" || !Number.isFinite(last.createdAtMs)) continue;
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
            const existing = nextByKey.get(normalizedKey);
            if (!existing || last.createdAtMs >= existing.at) {
              nextByKey.set(normalizedKey, {
                key: normalizedKey,
                chatKind: kind,
                displayName: nameByKey[normalizedKey] ?? normalizedKey,
                preview,
                at: last.createdAtMs
              });
            }
          }
        }
        const next = Array.from(nextByKey.values());
        const now = Date.now();
        for (const row of next) {
          const mediaId = photoMediaIdByKey[row.key];
          if (!mediaId) continue;
          const cachedUrl = avatarUrlByMediaIdRef.current[mediaId];
          const cachedAt = avatarFetchedAtByMediaIdRef.current[mediaId] ?? 0;
          if (cachedUrl && now - cachedAt < avatarUrlFreshForMs) {
            row.avatarUrl = cachedUrl;
          }
        }
        const missingMediaIds = Array.from(
          new Set(
            next
              .map((row) => photoMediaIdByKey[row.key])
              .filter(
                (mediaId): mediaId is string =>
                  typeof mediaId === "string" &&
                  mediaId.length > 0 &&
                  (!avatarUrlByMediaIdRef.current[mediaId] ||
                    now - (avatarFetchedAtByMediaIdRef.current[mediaId] ?? 0) >= avatarUrlFreshForMs)
              )
          )
        ).slice(0, 12);
        if (missingMediaIds.length > 0) {
          const mediaRows = await Promise.all(
            missingMediaIds.map(async (mediaId) => {
              try {
                const res = await api.getPublicMediaUrl(mediaId);
                return { mediaId, url: res.downloadUrl };
              } catch {
                return null;
              }
            })
          );
          const fetchedAt = Date.now();
          for (const media of mediaRows) {
            if (!media) continue;
            avatarUrlByMediaIdRef.current[media.mediaId] = media.url;
            avatarFetchedAtByMediaIdRef.current[media.mediaId] = fetchedAt;
          }
          for (const row of next) {
            const mediaId = photoMediaIdByKey[row.key];
            if (!mediaId) continue;
            const cachedUrl = avatarUrlByMediaIdRef.current[mediaId];
            if (cachedUrl) row.avatarUrl = cachedUrl;
          }
        }
        const unreadCounts = await Promise.all(
          next.map(async (row) => {
            try {
              const chat = await api.listChat(session.sessionToken, row.chatKind, row.key);
              const messages = ((chat as { messages?: ChatMessage[] }).messages ?? []) as ChatMessage[];
              let unread = 0;
              for (const message of messages) {
                if (message.fromKey === row.key && message.toKey === meKey && typeof message.readAtMs !== "number") unread += 1;
              }
              return unread;
            } catch {
              return 0;
            }
          })
        );
        if (cancelled) return;
        const nextWithUnread = next
          .map((row, index) => ({
            ...row,
            unreadCount: unreadCounts[index] ?? 0
          }))
          .sort((a, b) => b.at - a.at);
        setRows((prev) => (threadRowsEqual(prev, nextWithUnread) ? prev : nextWithUnread));
        const nextKinds = nextWithUnread.reduce<Record<string, "cruise" | "date">>((acc, row) => {
          acc[row.key] = row.chatKind;
          return acc;
        }, {});
        setThreadKindByPeerKey((prev) => {
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(nextKinds);
          if (prevKeys.length === nextKeys.length && prevKeys.every((key) => prev[key] === nextKinds[key])) {
            return prev;
          }
          return nextKinds;
        });
        if (typeof onUnreadCountChange === "function") {
          onUnreadCountChange(unreadCounts.reduce((sum, count) => sum + count, 0));
        }
      } catch (e) {
        if (!cancelled) setLastError(normalizeErrorMessage(e));
      } finally {
        inFlight = false;
      }
    }

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, meKey, onUnreadCountChange, session.sessionToken, session.userId, setLastError]);

  useEffect(() => {
    if (!openThreadRequest?.key) return;
    setSelectedPeerKey(normalizePeerKey(openThreadRequest.key));
    setThreadView("messages");
    if (typeof onThreadRequestConsumed === "function") onThreadRequestConsumed();
  }, [onThreadRequestConsumed, openThreadRequest]);

  useEffect(() => {
    if (!selectedPeerKey) return;
    if (deletedKeys.has(selectedPeerKey)) {
      setSelectedPeerKey(null);
      setThreadView("messages");
    }
  }, [deletedKeys, selectedPeerKey]);

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
          const safeList = Array.isArray(list) ? list : [];
          setMessages((prev) => (chatMessagesEqual(prev, safeList) ? prev : safeList));
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
  }, [api, selectedChatKind, selectedPeerKey, session.sessionToken, setLastError]);

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

  function togglePinThread(key: string): void {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function deleteSelectedThreads(): void {
    if (selectedKeys.size === 0) return;
    const toDelete = new Set(selectedKeys);
    setDeletedKeys((prev) => {
      const next = new Set(prev);
      for (const key of toDelete) next.add(key);
      return next;
    });
    if (selectedPeerKey && toDelete.has(selectedPeerKey)) {
      setSelectedPeerKey(null);
      setThreadView("messages");
    }
    setSelectedKeys(new Set());
    setSelectMode(false);
  }

  function deleteAllVisibleThreads(): void {
    if (visibleRows.length === 0) return;
    const toDelete = new Set(visibleRows.map((row) => row.key));
    setDeletedKeys((prev) => {
      const next = new Set(prev);
      for (const key of toDelete) next.add(key);
      return next;
    });
    setSelectedPeerKey(null);
    setThreadView("messages");
    setSelectedKeys(new Set());
    setSelectMode(false);
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
            chatKind={selectedChatKind}
            peerKey={selectedPeerKey}
            currentUserKey={meKey}
            messages={messages}
            client={client}
            title={`${selectedChatKind === "cruise" ? "INSTANT" : "DIRECT"} THREAD: ${peerLabel}`}
            peerSummary={{ displayName: peerLabel }}
            thirdParty={
              selectedChatKind === "cruise"
                ? {
                    candidates: thirdCandidates,
                    selectedKey: thirdCandidateKey,
                    onSelect: (key) => setThirdCandidateKey(key),
                    onAdd: () => void sendThirdInvite(),
                    disabled: false
                  }
                : undefined
            }
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
      <div style={{ position: compact ? "sticky" : "static", top: 0, zIndex: 3, background: "rgba(6,9,20,0.94)", borderBottom: "1px solid rgba(91,139,255,0.24)", padding: "8px 10px" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={unreadOnly ? buttonPrimary(false) : buttonSecondary(false)} onClick={() => setUnreadOnly((prev) => !prev)}>
              Unread
            </button>
            <button
              type="button"
              style={selectMode ? buttonPrimary(false) : buttonSecondary(false)}
              onClick={() => {
                setSelectMode((prev) => !prev);
                setSelectedKeys(new Set());
              }}
            >
              Select
            </button>
          </div>
          {selectMode ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" style={buttonSecondary(selectedKeys.size === 0)} disabled={selectedKeys.size === 0} onClick={deleteSelectedThreads}>
                Delete Selected
              </button>
              <button type="button" style={buttonSecondary(visibleRows.length === 0)} disabled={visibleRows.length === 0} onClick={deleteAllVisibleThreads}>
                Delete All
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {visibleRows.length === 0 ? (
        <div style={{ color: "#b9bec9", fontSize: 14, padding: 14 }}>
          {mode === "pinned" ? "No pinned conversations yet." : "No conversations yet."}
        </div>
      ) : (
        visibleRows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => {
              if (selectMode) {
                setSelectedKeys((prev) => {
                  const next = new Set(prev);
                  if (next.has(row.key)) next.delete(row.key);
                  else next.add(row.key);
                  return next;
                });
                return;
              }
              setSelectedPeerKey(row.key);
            }}
            style={{
              border: 0,
              borderBottom: "1px solid rgba(255,58,77,0.24)",
              borderRadius: 0,
              padding: "10px 12px",
              background: selectMode && selectedKeys.has(row.key) ? "rgba(14,58,111,0.55)" : "rgba(0,0,0,0.2)",
              textAlign: "left",
              color: "#fff",
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "52px 1fr auto",
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
            <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
              {row.unreadCount > 0 ? (
                <span
                  style={{
                    minWidth: 20,
                    height: 20,
                    borderRadius: 999,
                    paddingInline: 6,
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(180deg, #ff8a00 0%, #ff5d1f 100%)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  {row.unreadCount > 99 ? "99+" : row.unreadCount}
                </span>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  togglePinThread(row.key);
                }}
                style={{ border: 0, background: "transparent", color: pinnedKeys.has(row.key) ? "#8ec7ff" : "#7384a0", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}
                aria-label={pinnedKeys.has(row.key) ? "Unpin thread" : "Pin thread"}
              >
                {pinnedKeys.has(row.key) ? "📌" : "•"}
              </button>
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
  screen,
  setLastError,
  compact = false,
  onOpenThreadRequested
}: Readonly<{
  api: Api;
  session: Session;
  isMobile: boolean;
  screen: "ads" | "groups" | "cruise";
  setLastError(value: string | null): void;
  compact?: boolean;
  onOpenThreadRequested?(key: string): void;
}>): React.ReactElement {
  const [ads, setAds] = useState<ReadonlyArray<PublicPosting>>([]);
  const [events, setEvents] = useState<ReadonlyArray<PublicPosting>>([]);
  const [adTitle, setAdTitle] = useState<string>("");
  const [adBody, setAdBody] = useState<string>("");
  const [eventTitle, setEventTitle] = useState<string>("");
  const [eventBody, setEventBody] = useState<string>("");
  const [eventDate, setEventDate] = useState<string>("");
  const [eventTime, setEventTime] = useState<string>("");
  const [eventGroupDetails, setEventGroupDetails] = useState<string>("");
  const [eventLocationInstructions, setEventLocationInstructions] = useState<string>("");
  const [spots, setSpots] = useState<ReadonlyArray<CruisingSpot>>([]);
  const [spotName, setSpotName] = useState<string>("");
  const [spotAddress, setSpotAddress] = useState<string>("");
  const [spotDescription, setSpotDescription] = useState<string>("");
  const [adPhotoFile, setAdPhotoFile] = useState<File | null>(null);
  const [eventPhotoFile, setEventPhotoFile] = useState<File | null>(null);
  const [spotPhotoFile, setSpotPhotoFile] = useState<File | null>(null);
  const [adPhotoMediaId, setAdPhotoMediaId] = useState<string>("");
  const [eventPhotoMediaId, setEventPhotoMediaId] = useState<string>("");
  const [spotPhotoMediaId, setSpotPhotoMediaId] = useState<string>("");
  const [mediaUrlById, setMediaUrlById] = useState<Record<string, string>>({});
  const [publicProfilesByUserId, setPublicProfilesByUserId] = useState<Record<string, PublicProfile>>({});
  const [uploadingKind, setUploadingKind] = useState<"ad" | "event" | "spot" | null>(null);
  const [eventInvites, setEventInvites] = useState<ReadonlyArray<PublicPosting>>([]);
  const [inviteTargetByEventId, setInviteTargetByEventId] = useState<Record<string, string>>({});
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [adThreadMessages, setAdThreadMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [adThreadLoading, setAdThreadLoading] = useState<boolean>(false);
  const [groupThreadMessages, setGroupThreadMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [groupThreadLoading, setGroupThreadLoading] = useState<boolean>(false);
  const [spotThreadMessages, setSpotThreadMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [spotThreadLoading, setSpotThreadLoading] = useState<boolean>(false);
  const [createPanelOpen, setCreatePanelOpen] = useState<boolean>(!compact);
  const [boardInput, setBoardInput] = useState<string>("");
  const [boardPosting, setBoardPosting] = useState<boolean>(false);
  const [boardProfileUserId, setBoardProfileUserId] = useState<string | null>(null);
  const [presenceByKey, setPresenceByKey] = useState<Record<string, { lat: number; lng: number }>>({});
  const refreshSeqRef = useRef<number>(0);

  const canPostAds = true;
  const canPostEvents = session.userType !== "guest";
  const canCreateSpots = true;
  const gridColumns = isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))";
  const myActorKey = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
  const selectedAd = useMemo(() => ads.find((ad) => ad.postingId === selectedAdId) ?? null, [ads, selectedAdId]);
  const selectedGroup = useMemo(() => events.find((event) => event.postingId === selectedGroupId) ?? null, [events, selectedGroupId]);
  const selectedSpot = useMemo(() => spots.find((spot) => spot.spotId === selectedSpotId) ?? null, [selectedSpotId, spots]);
  const selectedAdThreadKey = selectedAd?.authorUserId ? `user:${selectedAd.authorUserId}` : "";
  const selectedGroupThreadKey = selectedGroup ? `event:${selectedGroup.postingId}` : "";
  const selectedSpotThreadKey = selectedSpotId ? `spot:${selectedSpotId}` : "";
  const meKey = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
  const selfCoords = presenceByKey[meKey] ?? null;

  useEffect(() => {
    if (!compact) return;
    setCreatePanelOpen(false);
  }, [compact, screen]);

  function combineEventDateTimeToEpochMs(dateText: string, timeText: string): number | null {
    const d = dateText.trim();
    const t = timeText.trim();
    if (!d || !t) return null;
    const composed = new Date(`${d}T${t}`);
    if (!Number.isFinite(composed.getTime())) return null;
    return composed.getTime();
  }

  function displayNameForUserId(userId: string): string {
    const profile = publicProfilesByUserId[userId];
    if (profile && profile.displayName.trim().length > 0) return profile.displayName.trim();
    return userId;
  }

  function displayNameForActorKey(actorKey: string): string {
    const key = actorKey.trim();
    if (!key) return "Member";
    if (key.startsWith("user:")) {
      return displayNameForUserId(key.slice("user:".length).trim());
    }
    if (key.startsWith("session:")) {
      return "Guest";
    }
    return key;
  }

  function avatarForUserId(userId: string): string {
    const profile = publicProfilesByUserId[userId];
    if (profile?.mainPhotoMediaId && mediaUrlById[profile.mainPhotoMediaId]) return mediaUrlById[profile.mainPhotoMediaId];
    return avatarForKey(`user:${userId}`);
  }

  function attendeeIdsForEvent(event: PublicPosting): ReadonlyArray<string> {
    const attendeeSet = new Set((event.acceptedUserIds ?? []).filter((id) => id && id !== event.authorUserId));
    return [event.authorUserId, ...Array.from(attendeeSet.values()).sort()];
  }

  function userCanSeeLocationInstructions(event: PublicPosting): boolean {
    if (!session.userId) return false;
    if (event.authorUserId === session.userId) return true;
    return (event.acceptedUserIds ?? []).includes(session.userId);
  }

  async function resolveMediaUrls(mediaIds: ReadonlyArray<string>): Promise<void> {
    const unique = Array.from(new Set(mediaIds.map((id) => id.trim()).filter((id) => id.length > 0)));
    if (unique.length === 0) return;
    const missing = unique.filter((id) => !mediaUrlById[id]);
    if (missing.length === 0) return;
    const rows = await Promise.all(
      missing.map(async (mediaId) => {
        try {
          const media = await api.getPublicMediaUrl(mediaId);
          return { mediaId, url: media.downloadUrl };
        } catch {
          return null;
        }
      })
    );
    setMediaUrlById((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!row) continue;
        next[row.mediaId] = row.url;
      }
      return next;
    });
  }

  async function refresh(): Promise<void> {
    const requestSeq = ++refreshSeqRef.current;
    try {
      const [adsRes, eventsRes, spotsRes, invitesRes, profilesRes] = await Promise.all([
        api.listPublicPostings("ad", session.sessionToken),
        api.listPublicPostings("event", session.sessionToken),
        api.listCruisingSpots(session.sessionToken),
        session.userType === "guest" ? Promise.resolve({ postings: [] as ReadonlyArray<PublicPosting> }) : api.listEventInvites(session.sessionToken),
        api.getPublicProfiles()
      ]);
      if (requestSeq !== refreshSeqRef.current) return;
      // Public postings should render oldest -> newest so new posts land at the bottom.
      setAds([...adsRes.postings].sort((a, b) => a.createdAtMs - b.createdAtMs));
      setEvents([...eventsRes.postings].sort((a, b) => a.createdAtMs - b.createdAtMs));
      setSpots(spotsRes.spots);
      setEventInvites(invitesRes.postings);
      setPublicProfilesByUserId(
        profilesRes.profiles.reduce<Record<string, PublicProfile>>((acc, profile) => {
          acc[profile.userId] = profile;
          return acc;
        }, {})
      );
      await resolveMediaUrls([
        ...adsRes.postings.map((p) => p.photoMediaId ?? ""),
        ...eventsRes.postings.map((p) => p.photoMediaId ?? ""),
        ...spotsRes.spots.map((p) => p.photoMediaId ?? ""),
        ...profilesRes.profiles.map((p) => p.mainPhotoMediaId ?? "")
      ]);
    } catch (e) {
      if (requestSeq !== refreshSeqRef.current) return;
      setLastError(normalizeErrorMessage(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (cancelled) return;
      await refresh();
    };
    void run();
    const id = window.setInterval(() => {
      void run();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, session.sessionToken, session.userType]);

  useEffect(() => {
    const onProfileMediaUpdated = (): void => {
      void refresh();
    };
    window.addEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    return () => {
      window.removeEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    };
  }, [api, session.sessionToken, session.userType]);

  useEffect(() => {
    let cancelled = false;
    const pollPresence = async (): Promise<void> => {
      try {
        const res = await api.listActivePresence(session.sessionToken);
        if (cancelled) return;
        const next: Record<string, { lat: number; lng: number }> = {};
        for (const row of res.presence ?? []) {
          if (!row || typeof row.key !== "string") continue;
          if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
          if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue;
          next[row.key] = { lat: row.lat, lng: row.lng };
        }
        setPresenceByKey(next);
      } catch {
        if (!cancelled) setPresenceByKey({});
      }
    };
    void pollPresence();
    const id = window.setInterval(() => {
      void pollPresence();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, session.sessionToken]);

  useEffect(() => {
    if (isMobile || screen !== "ads") return;
    setSelectedAdId((prev) => (prev && ads.some((item) => item.postingId === prev) ? prev : ads[0]?.postingId ?? null));
  }, [ads, isMobile, screen]);

  useEffect(() => {
    if (isMobile || screen !== "groups") return;
    setSelectedGroupId((prev) => (prev && events.some((item) => item.postingId === prev) ? prev : events[0]?.postingId ?? null));
  }, [events, isMobile, screen]);

  useEffect(() => {
    if (isMobile || screen !== "cruise") return;
    setSelectedSpotId((prev) => (prev && spots.some((item) => item.spotId === prev) ? prev : spots[0]?.spotId ?? null));
  }, [isMobile, screen, spots]);

  async function submit(type: "ad" | "event"): Promise<void> {
    setLastError(null);
    if (type === "event" && !canPostEvents) {
      setLastError("Anonymous users cannot create groups.");
      return;
    }
    const title = type === "ad" ? adTitle : eventTitle;
    const body = type === "ad" ? adBody : eventBody;
    if (title.trim().length === 0) {
      setLastError("Title is required.");
      return;
    }
    if (body.trim().length === 0) {
      setLastError("Body is required.");
      return;
    }
    const photoMediaId = type === "ad" ? adPhotoMediaId : eventPhotoMediaId;
    const eventStartAtMs = type === "event" ? combineEventDateTimeToEpochMs(eventDate, eventTime) : null;
    if (type === "event" && eventStartAtMs === null) {
      setLastError("Group date and time are required.");
      return;
    }
    if (type === "event" && eventLocationInstructions.trim().length === 0) {
      setLastError("Location instructions are required.");
      return;
    }
    if (type === "event" && eventGroupDetails.trim().length === 0) {
      setLastError("Group details are required.");
      return;
    }
    try {
      const created = await api.createPublicPosting(session.sessionToken, {
        type,
        title,
        body,
        photoMediaId: photoMediaId || undefined,
        eventStartAtMs: eventStartAtMs ?? undefined,
        locationInstructions: type === "event" ? eventLocationInstructions.trim() : undefined,
        groupDetails: type === "event" ? eventGroupDetails.trim() : undefined
      });
      if (type === "ad" && created?.posting) {
        setAds((prev) => [...prev, created.posting].sort((a, b) => a.createdAtMs - b.createdAtMs));
      } else if (type === "event" && created?.posting) {
        setEvents((prev) => [...prev, created.posting].sort((a, b) => a.createdAtMs - b.createdAtMs));
      }
      if (type === "ad") {
        setAdTitle("");
        setAdBody("");
        setAdPhotoFile(null);
        setAdPhotoMediaId("");
      } else {
        setEventTitle("");
        setEventBody("");
        setEventDate("");
        setEventTime("");
        setEventGroupDetails("");
        setEventLocationInstructions("");
        setEventPhotoFile(null);
        setEventPhotoMediaId("");
      }
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function inviteToEvent(postingId: string): Promise<void> {
    if (!canPostEvents) {
      setLastError("Anonymous users cannot invite to groups.");
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
      setLastError("Anonymous users cannot respond to group invites.");
      return;
    }
    try {
      await api.respondToEventInvite(session.sessionToken, { postingId, accept });
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function requestToJoin(postingId: string): Promise<void> {
    if (session.userType === "guest") {
      setLastError("Anonymous users cannot request to join groups.");
      return;
    }
    try {
      await api.requestToJoinEvent(session.sessionToken, { postingId });
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function respondToJoinRequest(postingId: string, targetUserId: string, accept: boolean): Promise<void> {
    if (session.userType === "guest") {
      setLastError("Anonymous users cannot manage join requests.");
      return;
    }
    try {
      await api.respondToEventJoinRequest(session.sessionToken, { postingId, targetUserId, accept });
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function createSpot(): Promise<void> {
    setLastError(null);
    if (spotName.trim().length === 0) {
      setLastError("Spot name is required.");
      return;
    }
    if (spotAddress.trim().length === 0) {
      setLastError("Spot address is required.");
      return;
    }
    if (spotDescription.trim().length === 0) {
      setLastError("Spot description is required.");
      return;
    }
    try {
      const created = await api.createCruisingSpot(session.sessionToken, {
        name: spotName,
        address: spotAddress,
        description: spotDescription,
        photoMediaId: spotPhotoMediaId || undefined
      });
      if (created?.spot) {
        setSpots((prev) => {
          const next = [created.spot, ...prev.filter((row) => row.spotId !== created.spot.spotId)];
          return next.sort((a, b) => b.createdAtMs - a.createdAtMs);
        });
      }
      setSpotName("");
      setSpotAddress("");
      setSpotDescription("");
      setSpotPhotoFile(null);
      setSpotPhotoMediaId("");
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

  async function uploadGridPhoto(kind: "ad" | "event" | "spot"): Promise<void> {
    const file = kind === "ad" ? adPhotoFile : kind === "event" ? eventPhotoFile : spotPhotoFile;
    if (!file) {
      setLastError("Choose a photo before uploading.");
      return;
    }
    if (session.userType === "guest") {
      setLastError("Guests cannot upload media.");
      return;
    }
    setUploadingKind(kind);
    try {
      const initiated = await api.initiateMediaUpload(session.sessionToken, {
        kind: "photo_gallery",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size
      });
      const handledLocally = await uploadToLocalSignedUrl(initiated.uploadUrl, file, file.type || "application/octet-stream");
      if (!handledLocally) {
        const uploadRes = await fetch(initiated.uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file
        });
        if (!uploadRes.ok) throw { message: `Upload failed (${uploadRes.status}).` };
      }
      await api.completeMediaUpload(session.sessionToken, initiated.mediaId);
      await resolveMediaUrls([initiated.mediaId]);
      if (kind === "ad") setAdPhotoMediaId(initiated.mediaId);
      if (kind === "event") setEventPhotoMediaId(initiated.mediaId);
      if (kind === "spot") setSpotPhotoMediaId(initiated.mediaId);
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    } finally {
      setUploadingKind(null);
    }
  }

  const adBoardRows = useMemo(() => {
    const maxAgeMs = 12 * 60 * 60 * 1000;
    const now = Date.now();
    const recentAds = ads
      .filter((row) => now - row.createdAtMs <= maxAgeMs)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    const grouped = new Map<
      string,
      {
        authorUserId: string;
        latestAtMs: number;
        bubbles: Array<{ postingId: string; text: string; atMs: number }>;
      }
    >();
    for (const row of recentAds) {
      const existing = grouped.get(row.authorUserId);
      const bubble = { postingId: row.postingId, text: row.body, atMs: row.createdAtMs };
      if (!existing) {
        grouped.set(row.authorUserId, {
          authorUserId: row.authorUserId,
          latestAtMs: row.createdAtMs,
          bubbles: [bubble]
        });
        continue;
      }
      existing.bubbles.push(bubble);
      existing.latestAtMs = Math.max(existing.latestAtMs, row.createdAtMs);
    }
    return Array.from(grouped.values()).sort((a, b) => a.latestAtMs - b.latestAtMs);
  }, [ads]);

  async function submitBoardAd(): Promise<void> {
    const message = boardInput.trim();
    if (!message) {
      setLastError("Ad message is required.");
      return;
    }
    setBoardPosting(true);
    try {
      await api.createPublicPosting(session.sessionToken, {
        type: "ad",
        title: "Cruising Update",
        body: message,
        lat: selfCoords?.lat,
        lng: selfCoords?.lng
      });
      setBoardInput("");
      await refresh();
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    } finally {
      setBoardPosting(false);
    }
  }

  async function loadSpotThread(spotId: string): Promise<void> {
    const threadKey = `spot:${spotId}`;
    try {
      const res = await api.listChat(session.sessionToken, "cruise", threadKey);
      const list = Array.isArray((res as { messages?: unknown }).messages) ? ((res as { messages: ChatMessage[] }).messages ?? []) : [];
      setSpotThreadMessages([...list].sort((a, b) => a.createdAtMs - b.createdAtMs));
      void api.markChatRead(session.sessionToken, "cruise", threadKey).catch(() => {});
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function loadAdThread(posting: PublicPosting): Promise<void> {
    const threadKey = `user:${posting.authorUserId}`;
    try {
      const res = await api.listChat(session.sessionToken, "date", threadKey);
      const list = Array.isArray((res as { messages?: unknown }).messages) ? ((res as { messages: ChatMessage[] }).messages ?? []) : [];
      setAdThreadMessages([...list].sort((a, b) => a.createdAtMs - b.createdAtMs));
      void api.markChatRead(session.sessionToken, "date", threadKey).catch(() => {});
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function loadGroupThread(posting: PublicPosting): Promise<void> {
    const threadKey = `event:${posting.postingId}`;
    try {
      const res = await api.listChat(session.sessionToken, "date", threadKey);
      const list = Array.isArray((res as { messages?: unknown }).messages) ? ((res as { messages: ChatMessage[] }).messages ?? []) : [];
      setGroupThreadMessages([...list].sort((a, b) => a.createdAtMs - b.createdAtMs));
      void api.markChatRead(session.sessionToken, "date", threadKey).catch(() => {});
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  const postingChatClient: ChatApiClient = useMemo(
    () => ({
      async sendMessage(chatKind, toKey, text, media) {
        const res = await api.sendChat(session.sessionToken, chatKind, toKey, text, media);
        const msg = (res as { message?: ChatMessage }).message;
        if (!msg) {
          throw { code: "UNAUTHORIZED_ACTION", message: "Message rejected." } as ServiceError;
        }
        if (toKey.startsWith("spot:")) {
          setSpotThreadMessages((prev) => [...prev, msg].sort((a, b) => a.createdAtMs - b.createdAtMs));
        } else if (toKey.startsWith("event:")) {
          setGroupThreadMessages((prev) => [...prev, msg].sort((a, b) => a.createdAtMs - b.createdAtMs));
        } else {
          setAdThreadMessages((prev) => [...prev, msg].sort((a, b) => a.createdAtMs - b.createdAtMs));
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
    [api, session.sessionToken]
  );

  useEffect(() => {
    if (!selectedAd || screen !== "ads") return;
    let cancelled = false;
    let timer: number | null = null;
    setAdThreadLoading(true);

    const poll = async (): Promise<void> => {
      if (cancelled) return;
      await loadAdThread(selectedAd);
      if (cancelled) return;
      setAdThreadLoading(false);
      timer = window.setTimeout(() => {
        void poll();
      }, 1500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [screen, selectedAd]);

  useEffect(() => {
    if (!selectedGroup || screen !== "groups") return;
    let cancelled = false;
    let timer: number | null = null;
    setGroupThreadLoading(true);

    const poll = async (): Promise<void> => {
      if (cancelled) return;
      await loadGroupThread(selectedGroup);
      if (cancelled) return;
      setGroupThreadLoading(false);
      timer = window.setTimeout(() => {
        void poll();
      }, 1500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [screen, selectedGroup]);

  useEffect(() => {
    if (!selectedSpotId || screen !== "cruise") return;
    let cancelled = false;
    let timer: number | null = null;
    setSpotThreadLoading(true);

    const poll = async (): Promise<void> => {
      if (cancelled) return;
      await loadSpotThread(selectedSpotId);
      if (cancelled) return;
      setSpotThreadLoading(false);
      timer = window.setTimeout(() => {
        void poll();
      }, 1500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [screen, selectedSpotId]);

  const panel = (kind: "ads" | "groups", showGrid = true): React.ReactElement => {
    const title = kind === "ads" ? "ADS" : "GROUPS";
    const list = kind === "ads" ? ads : events;
    const draftTitle = kind === "ads" ? adTitle : eventTitle;
    const draftBody = kind === "ads" ? adBody : eventBody;
    const setTitle = kind === "ads" ? setAdTitle : setEventTitle;
    const setBody = kind === "ads" ? setAdBody : setEventBody;
    const photoFile = kind === "ads" ? adPhotoFile : eventPhotoFile;
    const setPhotoFile = kind === "ads" ? setAdPhotoFile : setEventPhotoFile;
    const photoMediaId = kind === "ads" ? adPhotoMediaId : eventPhotoMediaId;
    const setPhotoMediaId = kind === "ads" ? setAdPhotoMediaId : setEventPhotoMediaId;
    const submitKind: "ad" | "event" = kind === "ads" ? "ad" : "event";
    const canPostThis = kind === "ads" ? canPostAds : canPostEvents;
    const isUploading = uploadingKind === submitKind;

    return (
      <div style={{ border: "1px solid rgba(255,58,77,0.38)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.2)" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
            {compact ? (
              <button type="button" style={buttonSecondary(false)} onClick={() => setCreatePanelOpen((prev) => !prev)}>
                {createPanelOpen ? "Close" : kind === "groups" ? "Add Group +" : "Add Ad +"}
              </button>
            ) : null}
          </div>
          {createPanelOpen ? (
            <>
              <input value={draftTitle} onChange={(e) => setTitle(e.target.value)} placeholder={`${title} title`} style={fieldStyle()} aria-label={`${title} title`} disabled={!canPostThis} />
              <textarea value={draftBody} onChange={(e) => setBody(e.target.value)} placeholder={`Write ${title.toLowerCase()} details`} style={{ ...fieldStyle(), minHeight: 86, resize: "vertical" }} aria-label={`${title} details`} disabled={!canPostThis} />
              {kind === "groups" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                    <input
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      type="date"
                      style={fieldStyle()}
                      aria-label="Group date"
                      disabled={!canPostThis}
                    />
                    <input
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      type="time"
                      style={fieldStyle()}
                      aria-label="Group time"
                      disabled={!canPostThis}
                    />
                  </div>
                  <textarea
                    value={eventGroupDetails}
                    onChange={(e) => setEventGroupDetails(e.target.value)}
                    placeholder="Detailed group profile description"
                    style={{ ...fieldStyle(), minHeight: 74, resize: "vertical" }}
                    aria-label="Group details"
                    disabled={!canPostThis}
                  />
                  <textarea
                    value={eventLocationInstructions}
                    onChange={(e) => setEventLocationInstructions(e.target.value)}
                    placeholder="Location instructions (shown only to attendees)"
                    style={{ ...fieldStyle(), minHeight: 68, resize: "vertical" }}
                    aria-label="Location instructions"
                    disabled={!canPostThis}
                  />
                </div>
              ) : null}
              <div style={{ display: "grid", gap: 8 }}>
                <input className="rd-input" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} disabled={!canPostThis} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => void uploadGridPhoto(submitKind)} style={canPostThis ? buttonSecondary(isUploading) : buttonSecondary(true)} disabled={!canPostThis || isUploading}>
                    {isUploading ? "UPLOADING..." : "UPLOAD PHOTO"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoMediaId("");
                      setPhotoFile(null);
                    }}
                    style={buttonSecondary(false)}
                  >
                    CLEAR PHOTO
                  </button>
                </div>
                {photoMediaId ? (
                  <img
                    src={mediaUrlById[photoMediaId] ?? avatarForKey(photoMediaId)}
                    alt={`${title} photo preview`}
                    style={{ width: "100%", maxWidth: 240, aspectRatio: "1 / 1", objectFit: "cover", border: "1px solid rgba(255,58,77,0.4)" }}
                  />
                ) : null}
                {!photoMediaId && photoFile ? <div style={{ color: "#b9bec9", fontSize: 12 }}>Photo selected. Upload to attach.</div> : null}
              </div>
              <button type="button" onClick={() => void submit(submitKind)} style={canPostThis ? buttonPrimary(false) : buttonSecondary(true)} disabled={!canPostThis}>
                POST {title}
              </button>
              {!canPostThis ? <div style={{ color: "#b9bec9", fontSize: 13 }}>Guests can view groups but cannot post groups.</div> : null}
            </>
          ) : null}

          {showGrid ? (
            <div style={{ display: "grid", gap: 0, marginTop: 6 }}>
              {list.length === 0 ? (
                <div style={{ color: "#b9bec9", fontSize: 14 }}>No {title.toLowerCase()} yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 0, gridTemplateColumns: gridColumns }}>
                  {list.map((p) => {
                    const isHost = !!session.userId && session.userId === p.authorUserId;
                    const isInvited = !!session.userId && (p.invitedUserIds ?? []).includes(session.userId);
                    const isAttending = !!session.userId && (p.authorUserId === session.userId || (p.acceptedUserIds ?? []).includes(session.userId));
                    const hasRequested = !!session.userId && (p.joinRequestUserIds ?? []).includes(session.userId);
                    const canRequestJoin = kind === "groups" && session.userType !== "guest" && !!session.userId && !isHost && !isAttending && !hasRequested;
                    return (
                      <div
                        key={p.postingId}
                        style={{
                          background: "rgba(0,0,0,0.5)",
                          border: "1px solid rgba(255,58,77,0.35)",
                          borderRadius: 0,
                          display: "grid",
                          gap: 0
                        }}
                      >
                        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                          <img
                            src={p.photoMediaId ? (mediaUrlById[p.photoMediaId] ?? avatarForKey(p.postingId)) : avatarForKey(p.postingId)}
                            alt={`${title} posting`}
                            style={{ width: "100%", height: "100%", borderRadius: 0, objectFit: "cover", border: "1px solid #0fd9ff" }}
                          />
                        </div>
                        <div style={{ padding: 8, display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                          {kind === "groups" ? (
                            <div style={{ color: "#9fb6bf", fontSize: 12 }}>
                              {formatEventDate(p.eventStartAtMs)} at {formatEventTime(p.eventStartAtMs)}
                            </div>
                          ) : null}
                          <div style={{ color: "#9fb6bf", fontSize: 12 }}>Host: {displayNameForUserId(p.authorUserId)}</div>
                          <div style={{ color: "#ced3dc", fontSize: 13, whiteSpace: "pre-wrap" }}>{p.body}</div>
                          {kind === "groups" ? (
                            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                              <div style={{ color: "#9fb6bf", fontSize: 12 }}>
                                Invited: {p.invitedUserIds?.length ?? 0} | Attending: {(p.acceptedUserIds?.length ?? 0) + 1}
                              </div>
                              {isHost ? (
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
                              {session.userType !== "guest" && isInvited ? (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <button type="button" style={buttonPrimary(false)} onClick={() => void respondToInvite(p.postingId, true)}>
                                    ACCEPT INVITE
                                  </button>
                                  <button type="button" style={buttonSecondary(false)} onClick={() => void respondToInvite(p.postingId, false)}>
                                    DECLINE
                                  </button>
                                </div>
                              ) : null}
                              {canRequestJoin ? (
                                <button type="button" style={buttonSecondary(false)} onClick={() => void requestToJoin(p.postingId)}>
                                  REQUEST TO JOIN
                                </button>
                              ) : null}
                              {hasRequested ? <div style={{ color: "#b9bec9", fontSize: 12 }}>Join request pending host approval.</div> : null}
                              <button
                                type="button"
                                style={selectedGroupId === p.postingId ? buttonPrimary(false) : buttonSecondary(false)}
                                onClick={() => setSelectedGroupId((prev) => (prev === p.postingId ? null : p.postingId))}
                              >
                                {selectedGroupId === p.postingId ? "HIDE GROUP PROFILE" : "VIEW GROUP PROFILE"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const spotsPanel = selectedSpot ? (
    <div
      style={{
        display: "grid",
        gap: 0,
        minHeight: isMobile ? "calc(100dvh - 150px)" : undefined,
        marginInline: isMobile ? -10 : 0,
        marginBlock: 0
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 46,
          background: "rgba(8,8,12,0.96)",
          borderBottom: "1px solid rgba(255,58,77,0.35)",
          padding: "6px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8
        }}
      >
        <button type="button" style={{ ...buttonSecondary(false), padding: "6px 10px", fontSize: 12 }} onClick={() => setSelectedSpotId(null)}>
          BACK TO SPOTS
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#ced3dc" }}>{selectedSpot.name}</div>
        <button type="button" style={{ ...buttonSecondary(false), padding: "6px 10px", fontSize: 12 }} onClick={() => void checkInSpot(selectedSpot.spotId)}>
          CHECK IN
        </button>
      </div>
      {spotThreadLoading ? <div style={{ color: "#9fb6bf", fontSize: 13, padding: "8px 10px" }}>Loading thread...</div> : null}
      <ChatWindow
        chatKind="cruise"
        peerKey={selectedSpotThreadKey}
        currentUserKey={myActorKey}
        messages={spotThreadMessages}
        client={postingChatClient}
        title={`${selectedSpot.name} Board`}
        showHeader={false}
        edgeToEdge={isMobile}
        fillHeight={isMobile}
        presentation="board"
        authorLabelForKey={displayNameForActorKey}
      />
    </div>
  ) : (
    <div style={{ border: "1px solid rgba(255,58,77,0.38)", borderRadius: 0, padding: 10, background: "rgba(0,0,0,0.2)" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>CRUISE</div>
          {compact ? (
            <button type="button" style={buttonSecondary(false)} onClick={() => setCreatePanelOpen((prev) => !prev)}>
              {createPanelOpen ? "Close" : "Add Spot +"}
            </button>
          ) : null}
        </div>
        {createPanelOpen ? (
          <>
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
            <div style={{ display: "grid", gap: 8 }}>
              <input className="rd-input" type="file" accept="image/*" onChange={(e) => setSpotPhotoFile(e.target.files?.[0] ?? null)} disabled={!canCreateSpots} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={canCreateSpots ? buttonSecondary(uploadingKind === "spot") : buttonSecondary(true)} disabled={!canCreateSpots || uploadingKind === "spot"} onClick={() => void uploadGridPhoto("spot")}>
                  {uploadingKind === "spot" ? "UPLOADING..." : "UPLOAD PHOTO"}
                </button>
                <button
                  type="button"
                  style={buttonSecondary(false)}
                  onClick={() => {
                    setSpotPhotoFile(null);
                    setSpotPhotoMediaId("");
                  }}
                >
                  CLEAR PHOTO
                </button>
              </div>
              {spotPhotoMediaId ? (
                <img
                  src={mediaUrlById[spotPhotoMediaId] ?? avatarForKey(spotPhotoMediaId)}
                  alt="Cruising spot preview"
                  style={{ width: "100%", maxWidth: 240, aspectRatio: "1 / 1", objectFit: "cover", border: "1px solid rgba(255,58,77,0.4)" }}
                />
              ) : null}
              {!spotPhotoMediaId && spotPhotoFile ? <div style={{ color: "#b9bec9", fontSize: 12 }}>Photo selected. Upload to attach.</div> : null}
            </div>
            <button type="button" style={canCreateSpots ? buttonPrimary(false) : buttonSecondary(true)} disabled={!canCreateSpots} onClick={() => void createSpot()}>
              CREATE SPOT
            </button>
            {!canCreateSpots ? <div style={{ color: "#b9bec9", fontSize: 13 }}>Guests can check in but cannot create cruise spots.</div> : null}
          </>
        ) : null}
        <div style={{ display: "grid", gap: 10 }}>
          {spots.length === 0 ? (
            <div style={{ color: "#b9bec9", fontSize: 14 }}>No cruise spots yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {spots.map((spot) => (
                <button
                  key={spot.spotId}
                  type="button"
                  onClick={() => setSelectedSpotId(spot.spotId)}
                  style={{
                    border: "1px solid rgba(255,58,77,0.35)",
                    background: "rgba(0,0,0,0.5)",
                    borderRadius: 0,
                    display: "grid",
                    gap: 0,
                    textAlign: "left",
                    color: "#fff",
                    cursor: "pointer",
                    width: "100%",
                    padding: 0
                  }}
                >
                  <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 6" }}>
                    <img
                      src={spot.photoMediaId ? (mediaUrlById[spot.photoMediaId] ?? avatarForKey(spot.spotId)) : avatarForKey(spot.spotId)}
                      alt="Cruising spot"
                      style={{ width: "100%", height: "100%", borderRadius: 0, objectFit: "cover", border: "1px solid #0fd9ff" }}
                    />
                  </div>
                  <div style={{ padding: "10px 12px", display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>{spot.name}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: "#9fb6bf", fontSize: 12 }}>Check-ins: {spot.checkInCount ?? 0}</span>
                      <button
                        type="button"
                        style={buttonSecondary(false)}
                        onClick={(event) => {
                          event.stopPropagation();
                          void checkInSpot(spot.spotId);
                        }}
                      >
                        CHECK IN
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (compact && isMobile && screen === "ads") {
    const profileForBoardUser = boardProfileUserId ? publicProfilesByUserId[boardProfileUserId] ?? null : null;
    const boardUserKey = boardProfileUserId ? chatKeyFromProfileUserId(boardProfileUserId) : "";
    const boardUserPresence = boardUserKey ? presenceByKey[boardUserKey] : null;
    const boardDistance =
      selfCoords && boardUserPresence
        ? formatDistanceLabel(distanceMeters(selfCoords, boardUserPresence))
        : "-";

    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ border: "1px solid rgba(255,122,131,0.45)", background: "rgba(17,6,10,0.84)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,122,131,0.28)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: 13 }}>
            Public Ads Board
          </div>
          <div style={{ maxHeight: "calc(100dvh - 260px)", overflowY: "auto", padding: 8, display: "grid", gap: 10 }}>
            {adBoardRows.length === 0 ? (
              <div style={{ color: "#9eb0c9", fontSize: 14 }}>No ads in the last 12 hours.</div>
            ) : (
              adBoardRows.map((row) => {
                const profile = publicProfilesByUserId[row.authorUserId];
                const actorKey = chatKeyFromProfileUserId(row.authorUserId);
                const actorPresence = presenceByKey[actorKey];
                const actorDistance = selfCoords && actorPresence ? formatDistanceLabel(distanceMeters(selfCoords, actorPresence)) : "-";
                const metaStats = profile
                  ? `${profile.age}y, ${profile.stats?.heightInches ?? "-"}in, ${profile.stats?.weightLbs ?? "-"}lb, ${profile.stats?.position ?? "-"}`
                  : row.authorUserId;
                return (
                  <div key={row.authorUserId} style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 10, alignItems: "start" }}>
                    <button
                      type="button"
                      onClick={() => setBoardProfileUserId(row.authorUserId)}
                      style={{ border: 0, background: "transparent", padding: 0, width: 48, height: 48, borderRadius: "50%", overflow: "hidden", cursor: "pointer" }}
                      aria-label="Open poster profile"
                    >
                      <img
                        src={profile?.mainPhotoMediaId ? (mediaUrlById[profile.mainPhotoMediaId] ?? avatarForKey(actorKey)) : avatarForKey(actorKey)}
                        alt="Poster profile"
                        style={{ width: "100%", height: "100%", objectFit: "cover", border: "2px solid rgba(108,150,255,0.8)", borderRadius: "50%" }}
                      />
                    </button>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#c9b7bf", fontSize: 11, minWidth: 0 }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{metaStats}</span>
                        <span style={{ whiteSpace: "nowrap", fontStyle: "italic", flexShrink: 0 }}>
                          {formatRelativeTime(row.latestAtMs)}, {actorDistance}
                        </span>
                      </div>
                      {row.bubbles.map((bubble) => (
                        <div
                          key={bubble.postingId}
                          style={{
                            background: "linear-gradient(180deg, rgba(49,17,24,0.95), rgba(26,9,14,0.95))",
                            border: "1px solid rgba(255,122,131,0.45)",
                            borderRadius: 14,
                            padding: "8px 10px",
                            color: "#ffeef2",
                            fontSize: 14,
                            lineHeight: 1.35
                          }}
                        >
                          {bubble.text}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,122,131,0.28)", padding: 8, display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input
              value={boardInput}
              onChange={(event) => setBoardInput(event.target.value)}
              placeholder="Post a cruising update..."
              style={fieldStyle()}
              maxLength={220}
            />
            <button type="button" style={buttonPrimary(boardPosting)} disabled={boardPosting} onClick={() => void submitBoardAd()}>
              {boardPosting ? "..." : "Send"}
            </button>
          </div>
        </div>
        {boardProfileUserId ? (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setBoardProfileUserId(null)}
            style={{ position: "fixed", inset: 0, zIndex: 75, background: "rgba(0,0,0,0.74)", display: "grid", placeItems: "center", padding: 14 }}
          >
            <div onClick={(event) => event.stopPropagation()} style={{ ...cardStyle(), width: "min(560px, 100%)", display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "74px 1fr", gap: 10, alignItems: "center" }}>
                <img
                  src={profileForBoardUser?.mainPhotoMediaId ? (mediaUrlById[profileForBoardUser.mainPhotoMediaId] ?? avatarForKey(boardUserKey)) : avatarForKey(boardUserKey)}
                  alt="Profile"
                  style={{ width: 74, height: 74, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(109,149,255,0.75)" }}
                />
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{profileForBoardUser?.displayName ?? boardProfileUserId}</div>
                  <div style={{ color: "#9bc2ff", fontSize: 13 }}>Distance: {boardDistance}</div>
                </div>
              </div>
              <div style={{ color: "#d9e7ff", fontSize: 14, lineHeight: 1.45 }}>
                <div>Age: {profileForBoardUser?.age ?? "-"}</div>
                <div>Race: {profileForBoardUser?.stats?.race ?? "-"}</div>
                <div>Height: {profileForBoardUser?.stats?.heightInches ?? "-"}</div>
                <div>Weight: {profileForBoardUser?.stats?.weightLbs ?? "-"}</div>
                <div>Position: {profileForBoardUser?.stats?.position ?? "-"}</div>
                <div style={{ marginTop: 6 }}>Bio: {profileForBoardUser?.bio ?? "-"}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={buttonPrimary(false)}
                  onClick={() => {
                    if (boardUserKey && typeof onOpenThreadRequested === "function") {
                      onOpenThreadRequested(boardUserKey);
                    }
                    setBoardProfileUserId(null);
                  }}
                >
                  Chat
                </button>
                <button type="button" style={buttonSecondary(false)} onClick={() => setBoardProfileUserId(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (!isMobile) {
    const shellStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.05fr 1.25fr", gap: 10, alignItems: "start" };
    const gridStyle: React.CSSProperties = {
      display: "grid",
      gap: 0,
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      border: "1px solid rgba(255,58,77,0.35)",
      background: "rgba(0,0,0,0.45)"
    };
    if (screen === "ads") {
      return (
        <div style={shellStyle}>
          <div style={gridStyle}>
            {ads.map((p) => (
              <button
                key={p.postingId}
                type="button"
                onClick={() => setSelectedAdId(p.postingId)}
                style={{ border: "1px solid rgba(255,58,77,0.35)", background: selectedAdId === p.postingId ? "rgba(255,32,48,0.08)" : "rgba(0,0,0,0.5)", padding: 0, color: "#fff", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                  <img src={p.photoMediaId ? (mediaUrlById[p.photoMediaId] ?? avatarForKey(p.postingId)) : avatarForKey(p.postingId)} alt="Ad media" style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid #0fd9ff" }} />
                </div>
                <div style={{ padding: 8, display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: "#b9bec9" }}>Host: {displayNameForUserId(p.authorUserId)}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {panel("ads", false)}
            {selectedAd ? (
              <div style={{ ...cardStyle(), display: "grid", gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedAd.title}</div>
                <div style={{ color: "#9fb6bf", fontSize: 13 }}>Host: {displayNameForUserId(selectedAd.authorUserId)}</div>
                <div style={{ color: "#ced3dc", whiteSpace: "pre-wrap", fontSize: 14 }}>{selectedAd.body}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Ad favoriting is available from profile actions.")}>FAVORITE</button>
                  <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Ad blocking is available from profile actions.")}>BLOCK</button>
                  <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Thanks. Report logged for admin review.")}>REPORT</button>
                  <button type="button" style={buttonPrimary(false)} onClick={() => void loadAdThread(selectedAd)}>CHAT</button>
                </div>
                {adThreadLoading ? <div style={{ color: "#9fb6bf", fontSize: 13 }}>Loading chat...</div> : null}
                <ChatWindow
                  chatKind="date"
                  peerKey={selectedAdThreadKey}
                  currentUserKey={myActorKey}
                  messages={adThreadMessages}
                  client={postingChatClient}
                  title="Ad Chat"
                  peerSummary={{ displayName: displayNameForUserId(selectedAd.authorUserId), avatarUrl: avatarForUserId(selectedAd.authorUserId) }}
                  showHeader={false}
                />
              </div>
            ) : (
              <div style={cardStyle()}>
                <div style={{ color: "#b9bec9", fontSize: 14 }}>Select an ad to view details and chat with the publisher.</div>
              </div>
            )}
          </div>
        </div>
      );
    }
    if (screen === "groups") {
      return (
        <div style={shellStyle}>
          <div style={gridStyle}>
            {events.map((p) => (
              <button
                key={p.postingId}
                type="button"
                onClick={() => setSelectedGroupId(p.postingId)}
                style={{ border: "1px solid rgba(255,58,77,0.35)", background: selectedGroupId === p.postingId ? "rgba(255,32,48,0.08)" : "rgba(0,0,0,0.5)", padding: 0, color: "#fff", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                  <img src={p.photoMediaId ? (mediaUrlById[p.photoMediaId] ?? avatarForKey(p.postingId)) : avatarForKey(p.postingId)} alt="Group media" style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid #0fd9ff" }} />
                </div>
                <div style={{ padding: 8, display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: "#b9bec9" }}>{formatEventDate(p.eventStartAtMs)}</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {panel("groups", false)}
            {selectedGroup ? (
              <div style={{ ...cardStyle(), display: "grid", gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedGroup.title}</div>
                <div style={{ color: "#9fb6bf", fontSize: 13 }}>
                  {formatEventDate(selectedGroup.eventStartAtMs)} at {formatEventTime(selectedGroup.eventStartAtMs)}
                </div>
                <div style={{ color: "#ced3dc", whiteSpace: "pre-wrap", fontSize: 14 }}>{selectedGroup.groupDetails ?? selectedGroup.body}</div>
                {groupThreadLoading ? <div style={{ color: "#9fb6bf", fontSize: 13 }}>Loading board...</div> : null}
                <ChatWindow
                  chatKind="date"
                  peerKey={selectedGroupThreadKey}
                  currentUserKey={myActorKey}
                  messages={groupThreadMessages}
                  client={postingChatClient}
                  title="Group Board"
                  presentation="board"
                  authorLabelForKey={displayNameForActorKey}
                  showHeader={false}
                />
              </div>
            ) : (
              <div style={cardStyle()}>
                <div style={{ color: "#b9bec9", fontSize: 14 }}>Select a group to view details and message board.</div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div style={shellStyle}>
        <div style={gridStyle}>
          {spots.map((spot) => (
            <button
              key={spot.spotId}
              type="button"
              onClick={() => setSelectedSpotId(spot.spotId)}
              style={{ border: "1px solid rgba(255,58,77,0.35)", background: selectedSpotId === spot.spotId ? "rgba(255,32,48,0.08)" : "rgba(0,0,0,0.5)", padding: 0, color: "#fff", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                <img src={spot.photoMediaId ? (mediaUrlById[spot.photoMediaId] ?? avatarForKey(spot.spotId)) : avatarForKey(spot.spotId)} alt="Cruising spot" style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid #0fd9ff" }} />
              </div>
              <div style={{ padding: 8, display: "grid", gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spot.name}</div>
                <div style={{ fontSize: 11, color: "#b9bec9" }}>Check-ins: {spot.checkInCount ?? 0}</div>
              </div>
            </button>
          ))}
        </div>
        <div>{spotsPanel}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, marginInline: isMobile ? -10 : 0 }}>
      {screen === "ads" ? panel("ads") : null}
      {screen === "groups" ? panel("groups") : null}
      {screen === "groups" && selectedGroup ? (
        <div style={{ border: "1px solid rgba(63,223,255,0.45)", background: "rgba(0,0,0,0.45)", padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedGroup.title}</div>
            <div style={{ color: "#9fb6bf", fontSize: 13 }}>
              {formatEventDate(selectedGroup.eventStartAtMs)} at {formatEventTime(selectedGroup.eventStartAtMs)}
            </div>
            <div style={{ color: "#9fb6bf", fontSize: 13 }}>Host: {displayNameForUserId(selectedGroup.authorUserId)}</div>
          </div>
          <img
            src={selectedGroup.photoMediaId ? (mediaUrlById[selectedGroup.photoMediaId] ?? avatarForKey(selectedGroup.postingId)) : avatarForKey(selectedGroup.postingId)}
            alt="Group photo"
            style={{ width: "100%", maxHeight: 280, objectFit: "cover", border: "1px solid rgba(63,223,255,0.55)" }}
          />
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 13, color: "#9fb6bf" }}>Summary</div>
            <div style={{ color: "#d2d8e2", fontSize: 14, whiteSpace: "pre-wrap" }}>{selectedGroup.body}</div>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 13, color: "#9fb6bf" }}>Group details</div>
            <div style={{ color: "#d2d8e2", fontSize: 14, whiteSpace: "pre-wrap" }}>{selectedGroup.groupDetails ?? "No extra details provided."}</div>
          </div>
          {userCanSeeLocationInstructions(selectedGroup) ? (
            <div style={{ display: "grid", gap: 4, border: "1px solid rgba(63,223,255,0.45)", padding: 8 }}>
              <div style={{ fontSize: 13, color: "#9fb6bf" }}>Attendee-only location instructions</div>
              <div style={{ color: "#d2d8e2", fontSize: 14, whiteSpace: "pre-wrap" }}>{selectedGroup.locationInstructions ?? "None provided."}</div>
            </div>
          ) : (
            <div style={{ color: "#9fb6bf", fontSize: 12 }}>Location instructions are only visible to attendees.</div>
          )}
          {session.userId === selectedGroup.authorUserId && (selectedGroup.joinRequestUserIds?.length ?? 0) > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: "#9fb6bf" }}>Pending join requests</div>
              {(selectedGroup.joinRequestUserIds ?? []).map((userId) => (
                <div key={userId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#d2d8e2", fontSize: 14 }}>{displayNameForUserId(userId)}</div>
                  <button type="button" style={buttonPrimary(false)} onClick={() => void respondToJoinRequest(selectedGroup.postingId, userId, true)}>
                    APPROVE
                  </button>
                  <button type="button" style={buttonSecondary(false)} onClick={() => void respondToJoinRequest(selectedGroup.postingId, userId, false)}>
                    DECLINE
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 13, color: "#9fb6bf" }}>Host and attendees</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {attendeeIdsForEvent(selectedGroup).map((userId, idx) => (
                <div key={userId} style={{ display: "grid", gap: 6, justifyItems: "center", width: 74 }}>
                  <img
                    src={avatarForUserId(userId)}
                    alt={`${displayNameForUserId(userId)} profile`}
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: idx === 0 ? "2px solid #88d6ff" : "1px solid rgba(255,58,77,0.5)"
                    }}
                  />
                  <div style={{ color: "#c7d0de", fontSize: 11, textAlign: "center", lineHeight: 1.2 }}>
                    {displayNameForUserId(userId)}
                    {idx === 0 ? " (Host)" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {screen === "cruise" ? spotsPanel : null}
      {screen === "groups" && session.userType !== "guest" && eventInvites.length > 0 ? (
        <div style={{ border: "1px solid rgba(255,58,77,0.25)", display: "grid", gap: 8, padding: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>GROUP INVITES</div>
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
  }, [api]);

  useEffect(() => {
    const onProfileMediaUpdated = (): void => {
      void refresh();
    };
    window.addEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    return () => {
      window.removeEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    };
  }, [api]);

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
  isMobile,
  setLastError
}: Readonly<{ api: Api; session: Session; isMobile: boolean; setLastError(value: string | null): void }>): React.ReactElement {
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
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [promotedMessages, setPromotedMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [promotedThreadLoading, setPromotedThreadLoading] = useState<boolean>(false);
  const refreshSeqRef = useRef<number>(0);

  const canPost = session.userType !== "guest";
  const myActorKey = session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
  const selectedListing = useMemo(() => listings.find((item) => item.listingId === selectedListingId) ?? null, [listings, selectedListingId]);

  async function refresh(): Promise<void> {
    const requestSeq = ++refreshSeqRef.current;
    try {
      const res = await api.listPromotedProfiles();
      if (requestSeq !== refreshSeqRef.current) return;
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
      if (requestSeq !== refreshSeqRef.current) return;
      const next: Record<string, string> = {};
      for (const row of rows) {
        if (!row) continue;
        next[row.userId] = row.url;
      }
      setAvatarUrlByUserId(next);
    } catch (e) {
      if (requestSeq !== refreshSeqRef.current) return;
      setLastError(normalizeErrorMessage(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (cancelled) return;
      await refresh();
    };
    void run();
    const id = window.setInterval(() => {
      void run();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, session.sessionToken]);

  useEffect(() => {
    const onProfileMediaUpdated = (): void => {
      void refresh();
    };
    window.addEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    return () => {
      window.removeEventListener(PROFILE_MEDIA_UPDATED_EVENT, onProfileMediaUpdated as EventListener);
    };
  }, [api, session.sessionToken]);

  useEffect(() => {
    if (isMobile) return;
    setSelectedListingId((prev) => (prev && listings.some((item) => item.listingId === prev) ? prev : listings[0]?.listingId ?? null));
  }, [isMobile, listings]);

  async function loadPromotedThread(listing: { userId: string }): Promise<void> {
    const threadKey = `user:${listing.userId}`;
    try {
      const res = await api.listChat(session.sessionToken, "date", threadKey);
      const list = Array.isArray((res as { messages?: unknown }).messages) ? ((res as { messages: ChatMessage[] }).messages ?? []) : [];
      setPromotedMessages([...list].sort((a, b) => a.createdAtMs - b.createdAtMs));
      void api.markChatRead(session.sessionToken, "date", threadKey).catch(() => {});
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  const promotedChatClient: ChatApiClient = useMemo(
    () => ({
      async sendMessage(chatKind, toKey, text, media) {
        const res = await api.sendChat(session.sessionToken, chatKind, toKey, text, media);
        const msg = (res as { message?: ChatMessage }).message;
        if (!msg) throw { code: "UNAUTHORIZED_ACTION", message: "Message rejected." } as ServiceError;
        setPromotedMessages((prev) => [...prev, msg].sort((a, b) => a.createdAtMs - b.createdAtMs));
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
        if (!res.ok) throw { code: "MEDIA_UPLOAD_INCOMPLETE", message: "Upload failed." } as ServiceError;
      },
      async getMediaUrl(objectKey) {
        const res = await api.getChatMediaUrl(session.sessionToken, objectKey);
        return res.downloadUrl;
      }
    }),
    [api, session.sessionToken]
  );

  useEffect(() => {
    if (!selectedListing) return;
    let cancelled = false;
    let timer: number | null = null;
    setPromotedThreadLoading(true);
    const poll = async (): Promise<void> => {
      if (cancelled) return;
      await loadPromotedThread(selectedListing);
      if (cancelled) return;
      setPromotedThreadLoading(false);
      timer = window.setTimeout(() => {
        void poll();
      }, 1500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [selectedListing]);

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
      const created = await api.createPromotedProfile(session.sessionToken, { paymentToken, title, body, displayName });
      if (created?.listing) {
        setListings((prev) => {
          const next = [created.listing, ...prev.filter((item) => item.listingId !== created.listing.listingId)];
          return next.sort((a, b) => b.createdAtMs - a.createdAtMs);
        });
        setSelectedListingId(created.listing.listingId);
      }
      setTitle("");
      setBody("");
      setDisplayName("");
      setPaymentToken("");
      setStatus("Promoted profile published.");
      void refresh();
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

  if (!isMobile) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1.25fr", gap: 10, alignItems: "start" }}>
        <div
          style={{
            display: "grid",
            gap: 0,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            border: "1px solid rgba(255,58,77,0.35)",
            background: "rgba(0,0,0,0.45)"
          }}
        >
          {listings.map((listing) => (
            <button
              key={listing.listingId}
              type="button"
              onClick={() => setSelectedListingId(listing.listingId)}
              style={{ border: "1px solid rgba(255,58,77,0.35)", background: selectedListingId === listing.listingId ? "rgba(255,32,48,0.08)" : "rgba(0,0,0,0.5)", padding: 0, color: "#fff", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                <img src={avatarUrlByUserId[listing.userId] ?? avatarForKey(`user:${listing.userId}`)} alt={`${listing.displayName} profile`} style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid #0fd9ff" }} />
              </div>
              <div style={{ padding: 8, display: "grid", gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listing.title}</div>
                <div style={{ fontSize: 11, color: "#b9bec9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listing.displayName}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
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
            </div>
          </div>
          {selectedListing ? (
            <div style={{ ...cardStyle(), display: "grid", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedListing.title}</div>
              <div style={{ color: "#9fb6bf", fontSize: 13 }}>{selectedListing.displayName}</div>
              <div style={{ color: "#ced3dc", fontSize: 14, whiteSpace: "pre-wrap" }}>{selectedListing.body}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={buttonSecondary(false)} onClick={() => void openListingProfile(selectedListing.userId)}>VIEW PROFILE</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Use profile actions to favorite promoted users.")}>FAVORITE</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Use profile actions to block promoted users.")}>BLOCK</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Thanks. Report logged for admin review.")}>REPORT</button>
              </div>
              {promotedThreadLoading ? <div style={{ color: "#9fb6bf", fontSize: 13 }}>Loading chat...</div> : null}
              <ChatWindow
                chatKind="date"
                peerKey={`user:${selectedListing.userId}`}
                currentUserKey={myActorKey}
                messages={promotedMessages}
                client={promotedChatClient}
                title="Promoted Chat"
                peerSummary={{ displayName: selectedListing.displayName, avatarUrl: avatarUrlByUserId[selectedListing.userId] ?? avatarForKey(`user:${selectedListing.userId}`) }}
                showHeader={false}
              />
            </div>
          ) : (
            <div style={cardStyle()}>
              <div style={{ color: "#b9bec9", fontSize: 14 }}>Select a promoted profile to open details and chat.</div>
            </div>
          )}
        </div>
      </div>
    );
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

function StyledFilePicker({
  label,
  accept,
  file,
  inputRef,
  disabled,
  onSelect
}: Readonly<{
  label: string;
  accept: string;
  file: File | null;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  disabled: boolean;
  onSelect(file: File | null): void;
}>): React.ReactElement {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span className="rd-label">{label}</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 10,
          alignItems: "center",
          border: "1px solid rgba(255,58,77,0.35)",
          borderRadius: 12,
          padding: 8,
          background: "linear-gradient(180deg, rgba(8,8,12,0.96), rgba(4,4,8,0.98))"
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
          disabled={disabled}
        />
        <button type="button" style={buttonSecondary(disabled)} disabled={disabled} onClick={() => inputRef.current?.click()}>
          CHOOSE FILE
        </button>
        <div style={{ color: "#ced3dc", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file ? file.name : "No file selected"}
        </div>
      </div>
    </label>
  );
}

function SettingsProfile({ api, session, setLastError }: Readonly<{ api: Api; session: Session; setLastError(value: string | null): void }>): React.ReactElement {
  const profileIsMobile = useIsMobile();
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mediaPreviewUrlById, setMediaPreviewUrlById] = useState<Record<string, string>>({});
  const [showMyProfile, setShowMyProfile] = useState<boolean>(false);

  async function refreshProfile(options?: Readonly<{ silent?: boolean }>): Promise<UserProfile | null> {
    setLoading(true);
    try {
      const res = await api.getMyProfile(session.sessionToken);
      setProfile(res.profile);
      setDraft(toProfileDraft(res.profile));
      if (!options?.silent) setStatus("Profile loaded.");
      return res.profile;
    } catch (e) {
      const err = e as ServiceError;
      if (err?.code === "PROFILE_NOT_FOUND") {
        setProfile(null);
        setDraft((prev) => ({ ...prev, age: prev.age || "18" }));
        if (!options?.silent) setStatus("No profile yet. Fill out the form and save.");
        return null;
      }
      if (!options?.silent) setStatus(normalizeErrorMessage(e));
      return null;
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
      ...(profile?.galleryMediaIds ?? []),
      profile?.videoMediaId
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
  }, [api, mediaPreviewUrlById, profile?.galleryMediaIds, profile?.mainPhotoMediaId, profile?.videoMediaId]);

  async function saveProfile(): Promise<void> {
    setSaving(true);
    setLastError(null);
    try {
      const ageNum = Number(draft.age);
      const mergedBio = buildProfileBio(draft.bio, draft.lookingForMore);
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
        travelMode: profile?.travelMode
      };

      const res = await api.upsertMyProfile(session.sessionToken, payload);
      setProfile(res.profile);
      setDraft(toProfileDraft(res.profile));
      emitProfileMediaUpdated(res.profile);
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
    if (!profile) {
      const msg = "Save your profile details first, then upload media.";
      setStatus(msg);
      setLastError(msg);
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
      const nextProfile = await refreshProfile({ silent: true });
      if (nextProfile) emitProfileMediaUpdated(nextProfile);
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
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  async function removeGalleryMedia(mediaId: string): Promise<void> {
    if (!profile) return;
    setSaving(true);
    try {
      const nextGallery = (profile.galleryMediaIds ?? []).filter((id) => id !== mediaId);
      const res = await api.updateProfileMediaReferences(session.sessionToken, { galleryMediaIds: nextGallery });
      setProfile(res.profile);
      emitProfileMediaUpdated(res.profile);
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
      emitProfileMediaUpdated(res.profile);
      setStatus("Main photo updated.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setStatus(msg);
      setLastError(msg);
    } finally {
      setSaving(false);
    }
  }

  const galleryIds = profile?.galleryMediaIds ?? [];
  const mainPhotoUrl =
    profile?.mainPhotoMediaId && mediaPreviewUrlById[profile.mainPhotoMediaId]
      ? mediaPreviewUrlById[profile.mainPhotoMediaId]
      : profile?.mainPhotoMediaId
        ? avatarForKey(profile.mainPhotoMediaId)
        : undefined;

  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: profileIsMobile ? "1fr" : "1fr 1fr", alignItems: "start" }}>
      <div style={profileIsMobile ? cardStyle() : { ...cardStyle(), gridColumn: "1" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>PROFILE SETTINGS</div>
          {session.userType === "guest" ? (
            <div style={{ color: "#b9bec9", fontSize: 13 }}>
              Guest profile data is temporary and clears on logout.
            </div>
          ) : null}
          {status ? <div style={{ color: "#b9bec9", fontSize: 14 }}>{status}</div> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void saveProfile()} style={buttonPrimary(saving)} disabled={saving}>
              SAVE PROFILE
            </button>
            <button type="button" onClick={() => void refreshProfile()} style={buttonSecondary(loading)} disabled={loading}>
              REFRESH
            </button>
            <button
              type="button"
              onClick={() => setShowMyProfile((v) => !v)}
              style={buttonSecondary(false)}
              disabled={!profile}
            >
              {showMyProfile ? "HIDE MY PROFILE" : "VIEW MY PROFILE"}
            </button>
          </div>
        </div>
      </div>

      <div style={profileIsMobile ? cardStyle() : { ...cardStyle(), gridColumn: "1" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>ABOUT YOU</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
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
        </div>
      </div>

      <div style={profileIsMobile ? cardStyle() : { ...cardStyle(), gridColumn: "1" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>PROFILE DETAILS</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Height (in)</span>
              <input value={draft.heightInches} onChange={(e) => setDraft((d) => ({ ...d, heightInches: e.target.value }))} style={fieldStyle()} inputMode="numeric" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Weight (lbs)</span>
              <input value={draft.weightLbs} onChange={(e) => setDraft((d) => ({ ...d, weightLbs: e.target.value }))} style={fieldStyle()} inputMode="numeric" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Race</span>
              <input value={draft.race} onChange={(e) => setDraft((d) => ({ ...d, race: e.target.value }))} style={fieldStyle()} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Cock Size (in)</span>
              <input value={draft.cockSizeInches} onChange={(e) => setDraft((d) => ({ ...d, cockSizeInches: e.target.value }))} style={fieldStyle()} inputMode="decimal" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Cut / Uncut</span>
              <select value={draft.cutStatus} onChange={(e) => setDraft((d) => ({ ...d, cutStatus: e.target.value as "" | ProfileCutStatus }))} style={fieldStyle()}>
                <option value="">Select</option>
                <option value="cut">Cut</option>
                <option value="uncut">Uncut</option>
              </select>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={draft.discreetMode} onChange={(e) => setDraft((d) => ({ ...d, discreetMode: e.target.checked }))} />
              <span className="rd-label" style={{ margin: 0 }}>Discreet Mode</span>
            </label>
          </div>
          <div style={{ color: "#b9bec9", fontSize: 13 }}>Travel mode is controlled from the Discover map via the ✈ picker.</div>
        </div>
      </div>

      <div style={profileIsMobile ? cardStyle() : { ...cardStyle(), gridColumn: "2", gridRow: "1 / span 3" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>MEDIA</div>
          <div style={{ color: "#b9bec9", fontSize: 14 }}>Upload and manage your photos and video.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)", background: "rgba(0,0,0,0.42)" }}>
              <StyledFilePicker
                label="Main Photo"
                accept="image/*"
                file={mainFile}
                inputRef={mainFileInputRef}
                disabled={saving}
                onSelect={setMainFile}
              />
              <button type="button" style={buttonPrimary(saving)} disabled={saving} onClick={() => void upload("photo_main", mainFile)}>
                UPLOAD MAIN PHOTO
              </button>
            </div>
            <div style={{ display: "grid", gap: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)", background: "rgba(0,0,0,0.42)" }}>
              <StyledFilePicker
                label="Gallery Photo"
                accept="image/*"
                file={galleryFile}
                inputRef={galleryFileInputRef}
                disabled={saving}
                onSelect={setGalleryFile}
              />
              <button type="button" style={buttonPrimary(saving)} disabled={saving} onClick={() => void upload("photo_gallery", galleryFile)}>
                UPLOAD GALLERY PHOTO
              </button>
            </div>
            <div style={{ display: "grid", gap: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)", background: "rgba(0,0,0,0.42)" }}>
              <StyledFilePicker
                label="Video"
                accept="video/*"
                file={videoFile}
                inputRef={videoFileInputRef}
                disabled={saving}
                onSelect={setVideoFile}
              />
              <button type="button" style={buttonPrimary(saving)} disabled={saving} onClick={() => void upload("video", videoFile)}>
                UPLOAD VIDEO
              </button>
            </div>
          </div>
          <div style={{ color: "#b9bec9", fontSize: 13 }}>
            Main photo media id: {profile?.mainPhotoMediaId ?? "-"}
            <br />
            Gallery count: {galleryIds.length}
            <br />
            Video media id: {profile?.videoMediaId ?? "-"}
          </div>
          {!galleryIds.length ? (
            <div style={{ color: "#b9bec9", fontSize: 13 }}>No gallery photos uploaded yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
              {galleryIds.map((mediaId) => (
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div style={{ border: "1px solid rgba(255,58,77,0.45)", borderRadius: 10, padding: 8, display: "grid", gap: 8 }}>
              <div className="rd-label" style={{ margin: 0 }}>Main Photo Thumbnail</div>
              <img
                src={profile?.mainPhotoMediaId ? (mediaPreviewUrlById[profile.mainPhotoMediaId] ?? avatarForKey(profile.mainPhotoMediaId)) : avatarForKey("main-photo")}
                alt="Main photo thumbnail"
                style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,58,77,0.4)" }}
              />
            </div>
            <div style={{ border: "1px solid rgba(255,58,77,0.45)", borderRadius: 10, padding: 8, display: "grid", gap: 8 }}>
              <div className="rd-label" style={{ margin: 0 }}>Video Thumbnail</div>
              {profile?.videoMediaId ? (
                <video
                  src={mediaPreviewUrlById[profile.videoMediaId]}
                  controls
                  preload="metadata"
                  style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,58,77,0.4)" }}
                />
              ) : (
                <img
                  src={avatarForKey("video-media")}
                  alt="Video thumbnail placeholder"
                  style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,58,77,0.4)" }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {showMyProfile && profile ? (
        <div style={cardStyle()}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>MY PROFILE PREVIEW</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) 1fr", gap: 12, alignItems: "start" }}>
              <img
                src={mainPhotoUrl ?? avatarForKey(profile.userId)}
                alt="My profile"
                style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)" }}
              />
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{profile.displayName}</div>
                <div style={{ color: "#ced3dc", fontSize: 14 }}>Age: {profile.age}</div>
                <div style={{ color: "#ced3dc", fontSize: 14 }}>Race: {profile.stats.race ?? "-"}</div>
                <div style={{ color: "#ced3dc", fontSize: 14 }}>Height: {profile.stats.heightInches ?? "-"}</div>
                <div style={{ color: "#ced3dc", fontSize: 14 }}>Weight: {profile.stats.weightLbs ?? "-"}</div>
                <div style={{ color: "#ced3dc", fontSize: 14 }}>Cock Size: {profile.stats.cockSizeInches ?? "-"}</div>
                <div style={{ color: "#ced3dc", fontSize: 14 }}>Cut / Uncut: {profile.stats.cutStatus ?? "-"}</div>
                <div style={{ color: "#ced3dc", fontSize: 14 }}>Position: {profile.stats.position ?? "-"}</div>
                <div style={{ color: "#ced3dc", fontSize: 14, whiteSpace: "pre-wrap" }}>{profile.bio || "-"}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
  const [draft, setDraft] = useState<{ discreetMode: boolean }>({
    discreetMode: false
  });
  const [status, setStatus] = useState<string>("Loading settings...");
  const [blockedUsers, setBlockedUsers] = useState<ReadonlyArray<string>>([]);
  const [adminStatus, setAdminStatus] = useState<string>("");
  const [adminBusy, setAdminBusy] = useState<boolean>(false);
  const [adminUsers, setAdminUsers] = useState<ReadonlyArray<AdminUserSummary>>([]);
  const [adminSpots, setAdminSpots] = useState<ReadonlyArray<CruisingSpot>>([]);
  const [adminPostings, setAdminPostings] = useState<ReadonlyArray<PublicPosting>>([]);
  const [adminSubmissions, setAdminSubmissions] = useState<ReadonlyArray<Submission>>([]);

  async function refreshAdmin(): Promise<void> {
    if (session.role !== "admin") {
      setAdminUsers([]);
      setAdminSpots([]);
      setAdminPostings([]);
      setAdminSubmissions([]);
      setAdminStatus("");
      return;
    }
    setAdminBusy(true);
    try {
      const [usersRes, spotsRes, postingsRes, submissionsRes] = await Promise.all([
        api.adminListUsers(session.sessionToken),
        api.adminListCruisingSpots(session.sessionToken),
        api.adminListPublicPostings(session.sessionToken),
        api.adminListSubmissions(session.sessionToken)
      ]);
      setAdminUsers(usersRes.users);
      setAdminSpots(spotsRes.spots);
      setAdminPostings(postingsRes.postings);
      setAdminSubmissions(submissionsRes.submissions);
      setAdminStatus("Admin data loaded.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setAdminStatus(msg);
      setLastError(msg);
    } finally {
      setAdminBusy(false);
    }
  }

  async function refresh(): Promise<void> {
    try {
      const profileRes = await api.getMyProfile(session.sessionToken);
      setDraft({
        discreetMode: profileRes.profile.discreetMode === true
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
      if (session.role === "admin") {
        await refreshAdmin();
      } else {
        setAdminUsers([]);
        setAdminSpots([]);
        setAdminPostings([]);
        setAdminSubmissions([]);
        setAdminStatus("");
      }
    } catch (e) {
      setStatus(normalizeErrorMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, [session.sessionToken, session.userType]);

  async function savePrivacy(): Promise<void> {
    try {
      const base = await api.getMyProfile(session.sessionToken);
      await api.upsertMyProfile(session.sessionToken, {
        displayName: base.profile.displayName,
        age: base.profile.age,
        bio: base.profile.bio,
        stats: base.profile.stats,
        discreetMode: draft.discreetMode,
        travelMode: base.profile.travelMode
      });
      setStatus("Privacy settings saved.");
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

  async function banUser(userId: string): Promise<void> {
    const reason = window.prompt("Ban reason (optional):", "") ?? "";
    setAdminBusy(true);
    try {
      await api.adminBanUser(session.sessionToken, userId, reason);
      await refreshAdmin();
      setAdminStatus("User banned.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setAdminStatus(msg);
      setLastError(msg);
    } finally {
      setAdminBusy(false);
    }
  }

  async function unbanUser(userId: string): Promise<void> {
    setAdminBusy(true);
    try {
      await api.adminUnbanUser(session.sessionToken, userId);
      await refreshAdmin();
      setAdminStatus("User unbanned.");
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setAdminStatus(msg);
      setLastError(msg);
    } finally {
      setAdminBusy(false);
    }
  }

  async function moderateSpot(spotId: string, action: "approve" | "reject" | "delete"): Promise<void> {
    const reason = action === "delete" ? undefined : (window.prompt(`${action === "approve" ? "Approval" : "Rejection"} reason (optional):`, "") ?? "");
    setAdminBusy(true);
    try {
      if (action === "approve") await api.adminApproveCruisingSpot(session.sessionToken, spotId, reason);
      if (action === "reject") await api.adminRejectCruisingSpot(session.sessionToken, spotId, reason);
      if (action === "delete") await api.adminDeleteCruisingSpot(session.sessionToken, spotId);
      await refreshAdmin();
      setAdminStatus(`Spot ${action}d.`);
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setAdminStatus(msg);
      setLastError(msg);
    } finally {
      setAdminBusy(false);
    }
  }

  async function moderatePosting(postingId: string, action: "approve" | "reject" | "delete"): Promise<void> {
    const reason = action === "delete" ? undefined : (window.prompt(`${action === "approve" ? "Approval" : "Rejection"} reason (optional):`, "") ?? "");
    setAdminBusy(true);
    try {
      if (action === "approve") await api.adminApprovePublicPosting(session.sessionToken, postingId, reason);
      if (action === "reject") await api.adminRejectPublicPosting(session.sessionToken, postingId, reason);
      if (action === "delete") await api.adminDeletePublicPosting(session.sessionToken, postingId);
      await refreshAdmin();
      setAdminStatus(`Posting ${action}d.`);
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setAdminStatus(msg);
      setLastError(msg);
    } finally {
      setAdminBusy(false);
    }
  }

  async function moderateSubmission(submissionId: string, action: "approve" | "reject" | "delete"): Promise<void> {
    const reason = action === "delete" ? undefined : (window.prompt(`${action === "approve" ? "Approval" : "Rejection"} reason (optional):`, "") ?? "");
    setAdminBusy(true);
    try {
      if (action === "approve") await api.adminApproveSubmission(session.sessionToken, submissionId, reason);
      if (action === "reject") await api.adminRejectSubmission(session.sessionToken, submissionId, reason);
      if (action === "delete") await api.adminDeleteSubmission(session.sessionToken, submissionId);
      await refreshAdmin();
      setAdminStatus(`Submission ${action}d.`);
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setAdminStatus(msg);
      setLastError(msg);
    } finally {
      setAdminBusy(false);
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
          <div style={{ color: "#b9bec9", fontSize: 13 }}>Travel mode is controlled from the Discover map using the ✈ picker.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={buttonPrimary(false)} onClick={() => void savePrivacy()}>SAVE PRIVACY</button>
            <button type="button" style={buttonSecondary(false)} onClick={() => onLogout?.()}>LOGOUT</button>
          </div>
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
      {session.role === "admin" ? (
        <div style={cardStyle()}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>ADMIN CONTROL</div>
            <div style={{ color: "#b9bec9", fontSize: 13 }}>{adminStatus || "Moderator tools ready."}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void refreshAdmin()}>
                REFRESH ADMIN DATA
              </button>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>USERS</div>
              {adminUsers.slice(0, 10).map((user) => (
                <div key={user.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#ced3dc", fontSize: 13 }}>
                    {user.email} {user.bannedAtMs ? "(banned)" : ""}
                  </div>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy || !!user.bannedAtMs} onClick={() => void banUser(user.id)}>
                    BAN
                  </button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy || !user.bannedAtMs} onClick={() => void unbanUser(user.id)}>
                    UNBAN
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>PENDING CRUISE SPOTS</div>
              {adminSpots.filter((spot) => spot.moderationStatus === "pending").slice(0, 10).map((spot) => (
                <div key={spot.spotId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#ced3dc", fontSize: 13 }}>{spot.name}</div>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSpot(spot.spotId, "approve")}>APPROVE</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSpot(spot.spotId, "reject")}>REJECT</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSpot(spot.spotId, "delete")}>DELETE</button>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>PENDING POSTS</div>
              {adminPostings.filter((posting) => posting.moderationStatus === "pending").slice(0, 10).map((posting) => (
                <div key={posting.postingId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#ced3dc", fontSize: 13 }}>{posting.title}</div>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderatePosting(posting.postingId, "approve")}>APPROVE</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderatePosting(posting.postingId, "reject")}>REJECT</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderatePosting(posting.postingId, "delete")}>DELETE</button>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>PENDING SUBMISSIONS</div>
              {adminSubmissions.filter((submission) => submission.moderationStatus === "pending").slice(0, 10).map((submission) => (
                <div key={submission.submissionId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#ced3dc", fontSize: 13 }}>{submission.title}</div>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSubmission(submission.submissionId, "approve")}>APPROVE</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSubmission(submission.submissionId, "reject")}>REJECT</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSubmission(submission.submissionId, "delete")}>DELETE</button>
                </div>
              ))}
            </div>
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
  const [mobileInboxTab, setMobileInboxTab] = useState<MobileInboxTab>("threads");
  const isMobileInboxOpen = isMobile && activeTab === "threads";
  const isMobileAdsOpen = isMobile && activeTab === "ads";

  const unifiedSettingsSurface = (
    <div style={{ display: "grid", gap: 12 }}>
      <SettingsProfile api={api} session={session} setLastError={setLastError} />
      <SettingsPanel api={api} session={session} setLastError={setLastError} onLogout={onLogout} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!hideModeCard ? null : null}

      <div style={{ display: activeTab === "discover" || isMobileInboxOpen || isMobileAdsOpen ? "block" : "none" }}>
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
      {activeTab === "threads" && !isMobile ? (
        <ThreadsPanel
          api={api}
          session={session}
          setLastError={setLastError}
          openThreadRequest={externalOpenThreadRequest}
          onThreadRequestConsumed={() => setExternalOpenThreadRequest(null)}
          isMobile={isMobile}
          onUnreadCountChange={onUnreadCountChange}
        />
      ) : null}
      {isMobileInboxOpen ? (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 0,
            bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
            zIndex: 51,
            borderTop: "1px solid rgba(255, 95, 104, 0.48)",
            background: "linear-gradient(180deg, rgba(24, 3, 8, 0.98), rgba(7, 2, 5, 0.98))",
            boxShadow: "0 -14px 34px rgba(0,0,0,0.55)",
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)"
          }}
        >
          <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)", borderBottom: "1px solid rgba(255, 95, 104, 0.28)" }}>
            <div style={{ width: 44, height: 4, borderRadius: 999, margin: "0 auto 8px", background: "rgba(255, 129, 138, 0.7)" }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, overflowX: "hidden", padding: "0 10px 8px" }}>
              {[
                { id: "chat-grid" as const, label: "Chat Grid", icon: iconChatGrid },
                { id: "threads" as const, label: "Inbox Threads", icon: iconInbox },
                { id: "pinned" as const, label: "Pinned Chats", icon: iconFavorites },
                { id: "spots" as const, label: "Cruising Spots", icon: iconSpots },
                { id: "groups" as const, label: "Groups", icon: iconGroups }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-label={tab.label}
                  style={{
                    border: 0,
                    background: "transparent",
                    borderRadius: 0,
                    padding: "6px 4px",
                    cursor: "pointer",
                    flex: "1 1 calc(50% - 6px)",
                    minWidth: 0,
                    minHeight: 44,
                    display: "grid",
                    placeItems: "center",
                    filter: mobileInboxTab === tab.id ? "drop-shadow(0 0 8px rgba(255, 118, 129, 0.65))" : "none",
                    opacity: mobileInboxTab === tab.id ? 1 : 0.9
                  }}
                  onClick={() => setMobileInboxTab(tab.id)}
                >
                  <img src={tab.icon} alt="" className="rd-ui-icon" style={{ width: 34, height: 34 }} />
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowY: "auto", minHeight: 0, padding: 8 }}>
            {mobileInboxTab === "chat-grid" ? (
              <CruiseSurface
                api={api}
                session={session}
                settings={settings}
                discoverFilter={discoverFilter}
                busy={busy}
                setBusy={setBusy}
                setLastError={setLastError}
                isMobile={isMobile}
                discoverScreen={"chat"}
                onDiscoverScreenChange={() => {}}
                onOpenThreadRequested={(key) => {
                  setExternalOpenThreadRequest({ key: normalizePeerKey(key), nonce: Date.now() });
                  setMobileInboxTab("threads");
                }}
                onUnreadCountChange={onUnreadCountChange}
              />
            ) : null}
            {mobileInboxTab === "threads" ? (
              <ThreadsPanel
                api={api}
                session={session}
                setLastError={setLastError}
                openThreadRequest={externalOpenThreadRequest}
                onThreadRequestConsumed={() => setExternalOpenThreadRequest(null)}
                isMobile={isMobile}
                onUnreadCountChange={onUnreadCountChange}
                compact={true}
              />
            ) : null}
            {mobileInboxTab === "pinned" ? (
              <ThreadsPanel
                api={api}
                session={session}
                setLastError={setLastError}
                openThreadRequest={externalOpenThreadRequest}
                onThreadRequestConsumed={() => setExternalOpenThreadRequest(null)}
                isMobile={isMobile}
                onUnreadCountChange={onUnreadCountChange}
                mode="pinned"
                compact={true}
              />
            ) : null}
            {mobileInboxTab === "spots" ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="cruise" setLastError={setLastError} compact={true} /> : null}
            {mobileInboxTab === "groups" ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="groups" setLastError={setLastError} compact={true} /> : null}
          </div>
        </div>
      ) : null}
      {isMobileAdsOpen ? (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 0,
            bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
            zIndex: 51,
            borderTop: "1px solid rgba(255, 95, 104, 0.48)",
            background: "linear-gradient(180deg, rgba(24, 3, 8, 0.98), rgba(7, 2, 5, 0.98))",
            boxShadow: "0 -14px 34px rgba(0,0,0,0.55)",
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)"
          }}
        >
          <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)", borderBottom: "1px solid rgba(255, 95, 104, 0.28)" }}>
            <div style={{ width: 44, height: 4, borderRadius: 999, margin: "0 auto 8px", background: "rgba(255, 129, 138, 0.7)" }} />
          </div>
          <div style={{ overflowY: "auto", minHeight: 0, padding: 8 }}>
            <PublicPostings
              api={api}
              session={session}
              isMobile={isMobile}
              screen="ads"
              setLastError={setLastError}
              compact={true}
              onOpenThreadRequested={(key) => {
                setExternalOpenThreadRequest({ key: normalizePeerKey(key), nonce: Date.now() });
                setActiveTab("threads");
              }}
            />
          </div>
        </div>
      ) : null}
      {activeTab === "ads" && !isMobile ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="ads" setLastError={setLastError} /> : null}
      {activeTab === "groups" ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="groups" setLastError={setLastError} /> : null}
      {activeTab === "cruise" ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="cruise" setLastError={setLastError} /> : null}
      {activeTab === "profile" || activeTab === "settings" ? unifiedSettingsSurface : null}
      {activeTab === "submissions" ? <SubmissionsPanel api={api} session={session} setLastError={setLastError} /> : null}
      {activeTab === "promoted" ? <PromotedProfilesPanel api={api} session={session} isMobile={isMobile} setLastError={setLastError} /> : null}
    </div>
  );
}
