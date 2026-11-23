import { PrivateInbox } from "./PrivateInbox";
import { ProfileLike } from "./ProfileLike";
import classifiedExamples from "../../../shared/classifiedExamples.json";
import { AdultClassifiedPreviews, AdultLibrary, AdultProfileFavorites } from "./AdultLibrary";
import { adLifetimeMs, CLASSIFIED_CATEGORIES, isClassifiedCategory, type ClassifiedCategory } from "../../../shared/postingBoard";
import classifiedCities from "../../../shared/classifiedCities.json";
import { deletionPage } from "./AccountDeletion";
import { INTERESTS } from "../../../shared/member";
import { googlePlayEdition } from "./edition";
import { AdminAnalytics } from "./AdminAnalytics";
import { CustomerImport } from "./CustomerImport";
import { PrivateAlbumsSettings, RequestPrivateAlbum } from "./PrivateAlbums";
import { GrowthDashboard, MarketingPreferences } from "./GrowthPanels";
import { MembershipPrograms } from "./MembershipPrograms";
import { LiveContext } from "./liveState";
import { LivePanel } from "./LivePanel";
import { GroupConversations } from "./GroupConversations";
import { GroupDiscussion } from "./GroupDiscussion";
import { MAX_GROUP_OCCURRENCES, type GroupFormat, type GroupOccurrence } from "../../../shared/groupSchedule";
import { POSTING_AVAILABILITY } from "../../../shared/postingStatus";
import { groupIsFull, validGuestLimit } from "../../../shared/groupCapacity";
import { isRightNow } from "../../../shared/member";
import { ProfileDetailsEditor, ProfileDetailsView } from "./ProfileDetails";
import { parseProfileDetails, type ProfileDetails } from "../../../shared/profileDetails";
import { permittedLocation } from "./location";
import { AdminLaunchChecks } from "./AdminLaunchChecks";
import { BillingSettings, PromoCodeForm } from "./BillingSettings";
import { actorKey } from "../../../shared/identity";
import { MemberProfileLinks, MemberPrivacy, PrivacyBlockList, ReportMemberButton, ReportProfileMediaButton, SafetyReportQueue, IntentBadge, RightNowBadge, VerifiedBadge, ProfileConversation, PhotoVerificationPanel, PhotoReviewQueue, useMember } from "./MemberPanels";
import type { PublicMember } from "../../../shared/member";
import { queueReply } from "./replyDraft";
import { PlusMembershipCard } from "./PlusShowcase";
import { displayNameForIdentity, isAnonymousIdentity } from "../../../shared/identity";
import { Sheet } from "./Sheet";
import { NotificationSettings } from "./NotificationSettings";
import { MessageWorkspace } from "./MessageWorkspace";
import { PrivacySettings } from "./PrivacySettings";
import { hasPlus, limits } from "../../../shared/plus";
import { openPlus } from "./PlusPanel";
import { SavedSearches } from "./SavedSearches";
import { Icon } from "./Icon";
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

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
  type UserProfile,
  type ProfileUpdate
} from "./api";
import type { DatingProfile } from "./api";
import { CruiseMap } from "../features/cruise/CruiseMap";
import { useCruisePresence } from "../features/cruise/CruisePresence";
import type { CruisePresenceUpdate } from "../features/cruise/cruise.types";
import { createMatchEngine } from "../features/dating/MatchEngine";
import { DatingFeed } from "../features/dating/DatingFeed";
import { ChatWindow, type ChatApiClient } from "../features/chat/ChatWindow";
import type { ChatMessage } from "../features/chat/chat.types";
import { MapView } from "../features/map/MapView";
import placeholderA from "../assets/reddoor-placeholder-1.webp";
import placeholderB from "../assets/reddoor-placeholder-2.webp";
import placeholderC from "../assets/reddoor-placeholder-3.webp";
import mapSpotIcon from "../assets/map-spot-icon.svg";
import mapGroupIcon from "../assets/map-group-icon.svg";

type Api = ReturnType<typeof apiClient>;

type Settings = Readonly<{
  defaultCenterLat: number;
  defaultCenterLng: number;
}>;

type TopTab = "live" | "discover" | "threads" | "ads" | "groups" | "cruise" | "profile" | "settings" | "submissions" | "adult-library" | "private-inbox" | "promoted" | "md";
type DiscoverFilter = "all" | "online" | "favorites";
type MobileCruiseTab = "map" | "chat";
type DiscoverScreen = MobileCruiseTab;
type MobileInboxTab = "chat-grid" | "threads" | "pinned" | "spots" | "groups";
type MessageChannel = "instant" | "direct";
const FIRE_SIGNAL_TEXT = "FIRE_SIGNAL|1";
const GROUP_INVITE_REQUEST_PREFIX = "GROUP_INVITE_REQUEST|";
const GROUP_INVITE_ACCEPT_PREFIX = "GROUP_INVITE_ACCEPT|";
const GROUP_INVITE_DECLINE_PREFIX = "GROUP_INVITE_DECLINE|";
const GROUP_INVITE_STATUS_PREFIX = "GROUP_INVITE_STATUS|";
const PROFILE_MEDIA_UPDATED_EVENT = "rd:profile-media-updated";
const CHAT_READ_CURSOR_STORAGE_KEY = "reddoor:chat-read-cursors:v1";
declare const __DUALMODE_WS_URL__: string | undefined;
type RouterErrorScope = TopTab;

type ProfileDraft = Readonly<{
  displayName: string;
  member?: PublicMember;
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
  details: ProfileDetails;
}>;

function cardStyle(): React.CSSProperties {
  return { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, padding: 20, boxShadow: "0 16px 48px #0003" };
}

function buttonPrimary(disabled: boolean): React.CSSProperties {
  return { background: disabled ? "#303034" : "var(--rd-metal-red)", border: "1px solid transparent", color: "#fff", padding: "12px 18px", minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 650, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 };
}

function buttonSecondary(disabled: boolean): React.CSSProperties {
  return { ...buttonPrimary(disabled), background: "var(--surface-raised)", border: "1px solid var(--line)", color: "var(--ink)" };
}

function fieldStyle(): React.CSSProperties {
  return { background: "#0e0e10", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "13px 14px", fontSize: 16, lineHeight: 1.4, minHeight: 48, width: "100%", boxSizing: "border-box", minWidth: 0, boxShadow: "none" };
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

function displayNameForPeerKey(key: string): string {
  const normalized = normalizePeerKey(key);
  if (!normalized) return "Anon";
  if (normalized.startsWith("session:")) return "Anon";
  if (normalized.startsWith("guest:")) return "Anon";
  if (normalized.startsWith("user:guest:")) return "Anon";
  return "Member";
}

function isFireSignalText(text: string): boolean {
  return text.trim() === FIRE_SIGNAL_TEXT;
}

function displayMessageText(text: string): string {
  text = text.replace(/^Automatic replies are on for this conversation\.\r?\n\r?\n/, "");
  const trimmed = text.trim();
  if (trimmed.startsWith("LOCATION|")) return "Location Sent";
  if (trimmed.startsWith(GROUP_INVITE_REQUEST_PREFIX)) return "You’ve received a Chat Invite";
  if (trimmed.startsWith(GROUP_INVITE_ACCEPT_PREFIX)) return "Chat Invite Accepted";
  if (trimmed.startsWith(GROUP_INVITE_DECLINE_PREFIX)) return "Chat Invite Declined";
  const status = parseGroupInviteStatus(trimmed);
  if (status) return status.outcome === "accepted" ? "Chat Invite Accepted" : "Chat Invite Declined";
  return isFireSignalText(trimmed) ? "I'm into you" : text;
}

function parseGroupInviteStatus(text: string): {
  inviteId: string;
  outcome: "accepted" | "declined";
  inviterKey: string;
  primaryPeerKey: string;
  candidateKey: string;
} | null {
  if (!text.startsWith(GROUP_INVITE_STATUS_PREFIX)) return null;
  const [, inviteId, outcomeRaw, inviterKey, primaryPeerKey, candidateKey] = text.split("|");
  if (!inviteId || !inviterKey || !primaryPeerKey || !candidateKey) return null;
  const normalizedOutcome = outcomeRaw === "accepted" || outcomeRaw === "declined" ? outcomeRaw : null;
  if (!normalizedOutcome) return null;
  return {
    inviteId,
    outcome: normalizedOutcome,
    inviterKey: normalizePeerKey(inviterKey),
    primaryPeerKey: normalizePeerKey(primaryPeerKey),
    candidateKey: normalizePeerKey(candidateKey)
  };
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
  const meters = Math.max(50, Math.round(distanceInMeters / 50) * 50);
  return meters < 1_000 ? `≈${meters} m` : `≈${(meters / 1_000).toFixed(1)} km`;
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

function readChatReadCursorMap(): Record<string, number> {
  const raw = safeLocalStorageGet(CHAT_READ_CURSOR_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) next[key] = value;
    }
    return next;
  } catch {
    return {};
  }
}

function chatReadCursorKey(chatKind: "cruise" | "date", peerKey: string): string {
  return `${chatKind}|${normalizePeerKey(peerKey)}`;
}

function getChatReadCursor(chatKind: "cruise" | "date", peerKey: string): number {
  const key = chatReadCursorKey(chatKind, peerKey);
  const value = readChatReadCursorMap()[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function setChatReadCursor(chatKind: "cruise" | "date", peerKey: string, timestampMs: number): void {
  const safeTs = Number.isFinite(timestampMs) && timestampMs > 0 ? Math.floor(timestampMs) : 0;
  if (safeTs <= 0) return;
  const map = readChatReadCursorMap();
  const key = chatReadCursorKey(chatKind, peerKey);
  map[key] = Math.max(map[key] ?? 0, safeTs);
  safeLocalStorageSet(CHAT_READ_CURSOR_STORAGE_KEY, JSON.stringify(map));
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

type ThreadProfileRequest = {
  key: string;
  displayName: string;
  chatKind: "cruise" | "date";
  onMessage(): void;
  onError(message: string): void;
};

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
  mapControls,
  onOpenThreadRequested,
  threadProfileOpener,
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
  mapControls?: React.ReactNode;
  onOpenThreadRequested(key: string): void;
  threadProfileOpener?: React.Ref<(request: ThreadProfileRequest) => void>;
  onUnreadCountChange?(count: number): void;
}>): React.ReactElement {
  const [filteredPeopleKeys, setFilteredPeopleKeys] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => { const update = (event: Event) => { const keys=(event as CustomEvent<{keys:string[] | null}>).detail.keys; setFilteredPeopleKeys(keys ? new Set(keys) : null); }; window.addEventListener("rd:people-filter", update); return () => window.removeEventListener("rd:people-filter", update); }, []);
  const [mobileTab, setMobileTab] = useState<MobileCruiseTab>(discoverScreen);
  const [selectedPeerKey, setSelectedPeerKey] = useState<string | null>(null);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null);
  const [threadProfileRequest, setThreadProfileRequest] = useState<ThreadProfileRequest | null>(null);
  const [selfCoords, setSelfCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [priorityPlacement, setPriorityPlacement] = useState<Record<string, number>>({});
  const [activeGuestKeys, setActiveGuestKeys] = useState<ReadonlyArray<string>>([]);
  const [snapshotPresence, setSnapshotPresence] = useState<ReadonlyArray<CruisePresenceUpdate>>([]);
  useEffect(()=>{const remove=(event:Event)=>{const detail=(event as CustomEvent<{key:string;hideProfile?:boolean}>).detail,key=detail?.key;setSnapshotPresence(prev=>prev.filter(p=>p.key!==key));if(detail?.hideProfile)setPublicProfiles(prev=>prev.filter(p=>`user:${p.userId}`!==key));};window.addEventListener("rd:presence-removed",remove);return()=>window.removeEventListener("rd:presence-removed",remove);},[]);
  const [peerProfileByKey, setPeerProfileByKey] = useState<Record<string, { displayName?: string; age?: number }>>({});
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [publicProfiles, setPublicProfiles] = useState<ReadonlyArray<{
    userId: string;
    scheduledOnline?: boolean;
    recentlyActive?: boolean;
    displayName: string;
    member?: PublicMember;
    age: number;
    bio: string;
    stats?: ProfileDetails & {
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
    member?: PublicMember;
    adultVideoFavorites?: PublicProfile["adultVideoFavorites"];
    age: number;
    bio: string;
    stats?: ProfileDetails & {
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
  const [travelCenter, setTravelCenter] = useState<{ lat: number; lng: number } | null>(() => hasPlus(session) ? readTravelCenter() : null);
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

  const meKey = actorKey(session);
  const visibleGuestKeys = useMemo(
    () => activeGuestKeys.filter(key => key !== meKey && !blockedKeys.has(key)),
    [activeGuestKeys, blockedKeys, meKey]
  );
  const visiblePublicProfiles = useMemo(
    () => publicProfiles.filter((profile) => !blockedKeys.has(chatKeyFromProfileUserId(profile.userId))),
    [blockedKeys, publicProfiles]
  );
  const visibleProfileKeys = useMemo(
    () => new Set(visiblePublicProfiles.map((profile) => chatKeyFromProfileUserId(profile.userId))),
    [visiblePublicProfiles]
  );
  const discoveryOnlineKeys = useMemo(() => new Set(visiblePublicProfiles
    .filter(profile => profile.scheduledOnline !== false).map(profile => chatKeyFromProfileUserId(profile.userId))), [visiblePublicProfiles]);
  const mergedPresence = useMemo(() => {
    const byKey = new Map<string, CruisePresenceUpdate>();
    for (const p of snapshotPresence) byKey.set(p.key, p);
    for (const p of presence) {
      const existing = byKey.get(p.key);
      if (!existing || p.updatedAtMs >= existing.updatedAtMs) byKey.set(p.key, p);
    }
    return Array.from(byKey.values());
  }, [presence, snapshotPresence]);
  const onlinePeers = useMemo(
    () =>
      mergedPresence.filter((p) => {
        if (p.key === meKey) return false;
        if (blockedKeys.has(p.key)) return false;
        if (p.key.startsWith("user:")) return discoveryOnlineKeys.has(p.key);
        return true;
      }),
    [blockedKeys, meKey, mergedPresence, discoveryOnlineKeys]
  );
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
        setPriorityPlacement(res.priority ?? {});
        setActiveGuestKeys(res.guestKeys ?? []);
      } catch {
        if (!cancelled) { setSnapshotPresence([]); setPriorityPlacement({}); setActiveGuestKeys([]); }
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
    if (selectedPeerKey && !sortedPeers.some((peer) => peer.key === selectedPeerKey)) {
      setSelectedPeerKey(null);
    }
  }, [selectedPeerKey, sortedPeers]);

  useEffect(() => {
    if (!selectedProfileKey || selectedProfileKey === meKey) return;
    if (blockedKeys.has(selectedProfileKey) || (!threadProfileRequest && selectedProfileKey.startsWith("user:") && !visibleProfileKeys.has(selectedProfileKey))) {
      setSelectedProfileKey(null);
      setSelectedPublicProfile(null);
    }
  }, [blockedKeys, meKey, selectedProfileKey, threadProfileRequest, visibleProfileKeys]);

  useEffect(() => {
    const missing = sortedPeers
      .filter((p) => !peerProfileByKey[p.key])
      .map((p) => ({ key: p.key, profileId: profileIdFromPresenceKey(p.key) }))
      .filter((row): row is { key: string; profileId: string } => typeof row.profileId === "string");
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (row) => {
        try {
          const res = await api.getPublicProfile(row.profileId, session.sessionToken);
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
    let cancelled = false;
    async function refreshDiscoveryState(): Promise<void> {
      try {
        const list = await api.getPublicProfiles();
        if (!cancelled) setPublicProfiles(list.profiles as any);
      } catch {
        if (!cancelled) setPublicProfiles([]);
      } finally { if (!cancelled) setProfilesLoading(false); }
      if (session.userType === "guest") {
        if (!cancelled) {
          setFavorites(new Set());
          try { const blocked=await api.listBlocked(session.sessionToken);if(!cancelled)setBlockedKeys(new Set(blocked.blocked)); } catch { if(!cancelled)setBlockedKeys(new Set()); }
        }
        return;
      }
      try {
        const fav = await api.getFavorites(session.sessionToken);
        if (!cancelled) setFavorites(new Set(fav.favorites));
      } catch {
        if (!cancelled) setFavorites(new Set());
      }
      try {
        const blocked = await api.listBlocked(session.sessionToken);
        if (!cancelled) setBlockedKeys(new Set(blocked.blocked));
      } catch {
        if (!cancelled) setBlockedKeys(new Set());
      }
    }
    const live=()=>void refreshDiscoveryState();window.addEventListener("rd:member-updated",live);
    void refreshDiscoveryState();
    const id = window.setInterval(() => {
      void refreshDiscoveryState();
    }, 8_000);
    return () => {
      cancelled = true;window.removeEventListener("rd:member-updated",live);
      window.clearInterval(id);
    };
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
          googlePlayEdition ? Promise.resolve({ spots: [] }) : api.listCruisingSpots(session.sessionToken),
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

  async function openProfileByKey(key: string, request: ThreadProfileRequest | null = null): Promise<void> {
    setThreadProfileRequest(request);
    const keyChanged = selectedProfileKeyRef.current !== key;
    if (keyChanged) {
      setSelectedPublicProfile(null);
      setSelectedMediaIndex(0);
    }
    setSelectedProfileKey((prev) => (prev === key ? prev : key));
    const requestSeq = ++profileRequestSeqRef.current;
    const profileId = profileIdFromPresenceKey(key);
    if (!profileId) {
      setSelectedPublicProfile(null);
      return;
    }
    if (key !== meKey && isAnonymousIdentity(key)) return;
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
          videoMediaId: meProfile.profile.videoMediaId,
          adultVideoFavorites: meProfile.profile.adultVideoFavorites
        });
      } else {
        const res = await api.getPublicProfile(profileId, session.sessionToken);
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
      if (request) {
        setSelectedProfileKey(null);
        request.onError(normalizeErrorMessage(e));
      } else {
        setLastError(normalizeErrorMessage(e));
      }
    }
  }

  useImperativeHandle(threadProfileOpener, () => (request) => {
    void openProfileByKey(request.key, request);
  });

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

  async function toggleBlockFromProfile(profileChatKey: string): Promise<void> {
    if (!profileChatKey.trim() || profileChatKey === meKey) return;
    const wasBlocked = blockedKeys.has(profileChatKey);
    try {
      if (wasBlocked) {
        await api.unblock(session.sessionToken, profileChatKey);
      } else {
        await api.block(session.sessionToken, profileChatKey);
      }
      const refreshed = await api.listBlocked(session.sessionToken);
      setBlockedKeys(new Set(refreshed.blocked));
      if (!wasBlocked) {
        setSelectedPeerKey((prev) => (prev === profileChatKey ? null : prev));
        setSelectedProfileKey((prev) => (prev === profileChatKey ? null : prev));
        setSelectedPublicProfile((prev) => (prev && chatKeyFromProfileUserId(prev.userId) === profileChatKey ? null : prev));
      }
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function updatePresenceFromGeo(): Promise<void> {
    // A default camera position is never a presence assertion.
    if (travelCenter) {
      setSelfCoords(travelCenter);
      await api.updatePresence(session.sessionToken, travelCenter.lat, travelCenter.lng, "online").catch(e=>setLastError(normalizeErrorMessage(e)));
      return;
    }
    const coordinates=await permittedLocation();
    setSelfCoords(coordinates);
    if (!coordinates) return;
    try { await api.updatePresence(session.sessionToken, coordinates.lat, coordinates.lng, "online"); }
    catch(e) { setLastError(normalizeErrorMessage(e)); }
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
    if (!hasPlus(session)) { if (!session.userId) setLastError("Create an account to use travel mode."); else openPlus("travel"); return; }
    const lat = Number(coords.lat.toFixed(6));
    const lng = Number(coords.lng.toFixed(6));
    const confirmed = window.confirm(
      `Temporarily relocate to this location?\n\nLatitude: ${lat}\nLongitude: ${lng}`
    );
    if (!confirmed) return;
    setTravelPickerArmed(false);

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
    const peoplePresence = mergedPresence.filter((row) => {
      if (row.key === meKey) return true;
      if (filteredPeopleKeys && !filteredPeopleKeys.has(row.key)) return false;
      if (blockedKeys.has(row.key)) return false;
      if (row.key.startsWith("user:")) return discoveryOnlineKeys.has(row.key);
      return true;
    });
    const filteredPresence = mapVisibility.people ? peoplePresence : peoplePresence.filter((row) => row.key === meKey);
    return filteredPresence;
  }, [filteredPeopleKeys, blockedKeys, mapVisibility.people, meKey, mergedPresence, selfCoords, session.userType, settings.defaultCenterLat, settings.defaultCenterLng, travelCenter, discoveryOnlineKeys]);

  const avatarUrlByKey = useMemo(() => {
    const next: Record<string, string> = {};
    for (const p of visiblePublicProfiles) {
      if (!p.mainPhotoMediaId) continue;
      const url = mediaUrlById[p.mainPhotoMediaId];
      if (!url) continue;
      next[chatKeyFromProfileUserId(p.userId)] = url;
    }
    return next;
  }, [mediaUrlById, visiblePublicProfiles]);
  const spotMarkers = useMemo(
    () =>
      cruisingSpots.map((spot) => ({
        id: `spot:${spot.spotId}`,
        position: { lat: spot.lat, lng: spot.lng },
        color: "#ff7a88",
        markerType: "spot" as const,
        imageUrl: mapSpotIcon,
        label: `${spot.name} | check-ins: ${spot.checkInCount ?? 0} | action: ${spot.actionCount ?? 0}`,
        onClick: () => setSelectedSpotId(spot.spotId)
      })),
    [cruisingSpots]
  );
  const groupMarkers = useMemo(() => {
    return groupPostings
      .filter((posting) => posting.type === "event")
      .map((posting) => {
        const lat = typeof posting.lat === "number" && Number.isFinite(posting.lat) ? posting.lat : undefined;
        const lng = typeof posting.lng === "number" && Number.isFinite(posting.lng) ? posting.lng : undefined;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: `group:${posting.postingId}`,
          position: { lat: lat as number, lng: lng as number },
          color: "#ff7a88",
          markerType: "group" as const,
          imageUrl: mapGroupIcon,
          label: `Group: ${posting.title}`,
          onClick: () => {
            window.location.hash = "#/groups";
          }
        };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  }, [groupPostings]);
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
      rightNowExpiryByKey={Object.fromEntries(visiblePublicProfiles.map(profile => [
        chatKeyFromProfileUserId(profile.userId), profile.member?.rightNowExpiresAtMs
      ]))}
      additionalMarkers={mapOverlayMarkers}
      defaultCenter={travelCenter ?? { lat: settings.defaultCenterLat, lng: settings.defaultCenterLng }}
      height="100%"
      visible={mobileTab === "map"}
      travelPickerArmed={travelPickerArmed}
      onToggleTravelPicker={() => { if (!hasPlus(session)) { if (!session.userId) setLastError("Create an account to use travel mode."); else openPlus("travel"); return; } setTravelPickerArmed((prev) => !prev); }}
      onTravelLocationSelected={(coords) => void handleTravelLocationSelected(coords)}
    />
  );


  const [unreadByProfileKey, setUnreadByProfileKey] = useState<Record<string, number>>({});
  const chatPanel = (
    <CruiseChat
      priorityPlacement={priorityPlacement}
      onProfileUnreadChange={setUnreadByProfileKey}
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
      loading={profilesLoading}
      publicProfiles={visiblePublicProfiles}
      guestKeys={visibleGuestKeys}
      favorites={favorites}
      mediaUrlById={mediaUrlById}
      onAvatarLoadError={invalidateMediaUrl}
      onUnreadCountChange={onUnreadCountChange}
    />
  );

  return (
    <div className={`rd-explore-surface ${mobileTab === "map" ? "is-map" : "is-people"}`}>
      <div className="rd-explore-layout">
        <div className="rd-map-pane">
          {mobileTab === "map" && <>
            {mapPanel}
            {mapControls && <div className="rd-app-dock-context rd-map-actions">{mapControls}</div>}
          </>}
        </div>
        <div className="rd-people-pane">{chatPanel}</div>
      </div>

      {selectedProfileKey ? (() => {
        const profile = selectedPublicProfile;
        const liveProfile = visiblePublicProfiles.find(row => chatKeyFromProfileUserId(row.userId) === selectedProfileKey);
        const rightNowExpiresAtMs = (liveProfile ?? profile)?.member?.rightNowExpiresAtMs;
        const stats = profile?.stats;
        const isSelf = selectedProfileKey === meKey;
        const browseOnly = googlePlayEdition && !session.userId;
        const unreadCount = unreadByProfileKey[selectedProfileKey] ?? 0;
        const scheduled = visiblePublicProfiles.find(profile => chatKeyFromProfileUserId(profile.userId) === selectedProfileKey);
        const isOnline = isSelf || (scheduled?.scheduledOnline ?? (activeGuestKeys.includes(selectedProfileKey) || onlinePeers.some(peer => peer.key === selectedProfileKey)));
        const displayName = displayNameForIdentity(selectedProfileKey, profile?.displayName ?? threadProfileRequest?.displayName ?? peerProfileByKey[selectedProfileKey]?.displayName);
        const mediaIds = Array.from(new Set([
          profile?.mainPhotoMediaId, ...(profile?.galleryMediaIds ?? []), profile?.videoMediaId
        ].filter((id): id is string => Boolean(id))));
        const activeIndex = Math.min(selectedMediaIndex, Math.max(0, mediaIds.length - 1));
        const activeId = mediaIds[activeIndex];
        const activeUrl = mediaUrlById[activeId];
        const preview = avatarForKey(selectedProfileKey);
        const close = () => {
          profileRequestSeqRef.current += 1;
          setSelectedProfileKey(null);
        };
        const message = () => {
          if (threadProfileRequest) threadProfileRequest.onMessage();
          else onOpenThreadRequested(selectedProfileKey);
          close();
        };
        const reply = (excerpt: string) => {
          queueReply(selectedProfileKey, excerpt);
          message();
        };
        const basicStats = [
          profile?.age && `${profile.age} years old`,
          stats?.heightInches && `${Math.floor(stats.heightInches / 12)}′ ${stats.heightInches % 12}″`,
          stats?.weightLbs && `${stats.weightLbs} lbs`
        ].filter(Boolean);
        const sexualStats = googlePlayEdition ? [] : [stats?.cockSizeInches && `${stats.cockSizeInches}″`, stats?.cutStatus, stats?.position];
        const otherStats = [...sexualStats, stats?.race].filter(Boolean);

        return (
          <Sheet title={displayName} onClose={close} className="rd-member-profile">
            <div className="rd-member-profile-status">
              <span className={isOnline ? "is-online" : ""}>{isOnline ? "Online now" : scheduled?.recentlyActive ? "Recently active" : "Offline"}</span>
              {!googlePlayEdition && <RightNowBadge expiresAtMs={rightNowExpiresAtMs} />}
              {selectedProfileDistanceLabel ? <span>{selectedProfileDistanceLabel}</span> : null}
            </div>
            <div className="rd-member-profile-layout">
              <div className="rd-member-gallery">
                <div className="rd-member-hero">
                  {activeId && activeId === profile?.videoMediaId && activeUrl ? (
                    <video controls playsInline src={activeUrl} onError={() => invalidateMediaUrl(activeId)} />
                  ) : (
                    <img src={activeUrl ?? preview} alt={`${displayName}’s profile`}
                      onError={activeId && activeUrl ? () => invalidateMediaUrl(activeId) : undefined} />
                  )}
                </div>
                {googlePlayEdition && !isSelf && activeId && activeUrl &&
                  <ReportProfileMediaButton key={activeId} api={api} session={session} mediaId={activeId} video={activeId === profile?.videoMediaId} />}
                {mediaIds.length > 1 ? <div className="rd-member-thumbnails" aria-label="Profile gallery">
                  {mediaIds.map((mediaId, index) => {
                    const isVideo = mediaId === profile?.videoMediaId;
                    return (
                      <button key={mediaId} type="button" aria-pressed={index === activeIndex}
                        aria-label={isVideo ? "Show video" : `Show photo ${index + 1}`}
                        onClick={() => setSelectedMediaIndex(index)}>
                        {isVideo ? "Video" : <img src={mediaUrlById[mediaId] ?? preview} alt=""
                          onError={() => { if (mediaUrlById[mediaId]) invalidateMediaUrl(mediaId); }} />}
                      </button>
                    );
                  })}
                </div> : null}
              </div>
              {!isSelf ? <div className="rd-member-profile-actions">
                {profile ? <>
                  <button className="rd-btn" type="button" aria-label="Favorite" aria-pressed={favorites.has(profile.userId)}
                    onClick={() => void toggleFavoriteFromProfile(profile.userId)}><Icon name="star" active={favorites.has(profile.userId)} /></button>
                  {!googlePlayEdition && !browseOnly && <ProfileLike key={profile.userId} api={api} token={session.sessionToken} userId={profile.userId} own={false} />}
                </> : null}
                <button className="rd-btn" type="button" aria-label={blockedKeys.has(selectedProfileKey) ? "Unblock" : "Block"}
                  onClick={() => void toggleBlockFromProfile(selectedProfileKey)}><Icon name="block" /></button>
                <button className="rd-btn primary rd-member-message" type="button" onClick={message}>
                  {browseOnly ? "Create an account to message" : "Message"}{unreadCount > 0 ? <span className="rd-member-unread" aria-label={`${unreadCount} unread`}>{unreadCount}</span> : null}
                </button>
                {!googlePlayEdition && !browseOnly && profile?.userId && session.userId && <a className="rd-btn" href={`#/private-inbox/${encodeURIComponent(profile.userId)}`}>Send private message</a>}
              </div> : null}
              <div className="rd-member-profile-details">
                {!googlePlayEdition && isSelf && profile && <ProfileLike key={profile.userId} api={api} token={session.sessionToken} userId={profile.userId} own />}
                {[basicStats, otherStats].map((row, index) => row.length ? (
                  <ul className="rd-member-stats" key={index}>
                    {row.map((value, valueIndex) => <li key={valueIndex}>{value}</li>)}
                  </ul>
                ) : null)}
                <ProfileConversation member={profile?.member} onReply={browseOnly ? undefined : reply} />
                {!browseOnly && !isSelf && selectedProfileKey.startsWith("user:") ? <RequestPrivateAlbum key={selectedProfileKey} api={api} session={session} ownerId={selectedProfileKey.slice(5)} /> : null}
                <ProfileDetailsView stats={stats} />
                {profile?.bio ? <div className="rd-member-bio"><h3>Bio</h3><p>{profile.bio}</p></div> : null}
                {!googlePlayEdition && profile?.adultVideoFavorites && <AdultProfileFavorites videos={profile.adultVideoFavorites} />}
                {!isSelf ? <div className="rd-member-profile-secondary">
                  {!browseOnly && profile?.mainPhotoMediaId ? <button className="rd-btn" type="button" onClick={() => reply("Your profile photo")}>Reply to profile photo</button> : null}
                  <ReportMemberButton api={api} session={session} peerKey={selectedProfileKey} />
                </div> : null}
              </div>
            </div>
          </Sheet>
        );
      })() : null}
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
  priorityPlacement,
  loading = false,
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
  guestKeys,
  favorites,
  mediaUrlById,
  onAvatarLoadError,
  onUnreadCountChange,
  onProfileUnreadChange
}: Readonly<{
  priorityPlacement: Record<string, number>;
  onProfileUnreadChange(counts: Record<string, number>): void;
  loading?: boolean;
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
  guestKeys: ReadonlyArray<string>;
  publicProfiles: ReadonlyArray<{
    userId: string;
    scheduledOnline?: boolean;
    recentlyActive?: boolean;
    displayName: string;
    member?: PublicMember;
    foundingMember?: boolean;
    age?: number;
    bio: string;
    stats?: ProfileDetails & {
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
  const { broadcasts } = React.useContext(LiveContext);
  const liveKeys = new Set(broadcasts.filter(item => item.live).map(item => `user:${item.hostId}`));
  const [messagesByPeerKey, setMessagesByPeerKey] = useState<Record<string, ReadonlyArray<ChatMessage>>>({});
  const [conversationMetaByPeerKey, setConversationMetaByPeerKey] = useState<Record<string, { lastAt: number; lastText: string }>>({});
  const channel: MessageChannel = session.mode === "date" ? "direct" : "instant";
  const [view, setView] = useState<"grid" | "thread">("grid");
  const [threadPeerKey, setThreadPeerKey] = useState<string | null>(null);
  const [unreadByPeerKey, setUnreadByPeerKey] = useState<Record<string, number>>({});
  useEffect(() => onProfileUnreadChange(unreadByPeerKey), [onProfileUnreadChange, unreadByPeerKey]);
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
  const [distanceLimitKm, setDistanceLimitKm] = useState(0);
  const [interestFilter, setInterestFilter] = useState("");
  const [rightNowOnly, setRightNowOnly] = useState(false);
  const [discoveryNow,setDiscoveryNow]=useState(Date.now());
  useEffect(() => {
    const now = Date.now();
    const nextExpiry = publicProfiles.reduce((earliest, profile) => {
      const expiry = profile.member?.rightNowExpiresAtMs;
      return isRightNow(expiry, now) ? Math.min(earliest, expiry!) : earliest;
    }, Infinity);
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => setDiscoveryNow(Date.now()), nextExpiry - now);
    return () => window.clearTimeout(timer);
  }, [publicProfiles, discoveryNow]);
  useEffect(()=>{const id=window.setInterval(()=>setDiscoveryNow(Date.now()),30000);return()=>clearInterval(id);},[]);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [onlineStatusFilter, setOnlineStatusFilter] = useState<"all" | "online" | "offline">(
    discoverFilter === "online" ? "online" : "all"
  );
  const [hasChatHistoryOnly, setHasChatHistoryOnly] = useState<boolean>(false);
  const [hasPicturesOnly, setHasPicturesOnly] = useState<boolean>(false);
  const { data: memberSettings } = useMember({ api, session });
  const [photoReviewedOverride, setPhotoReviewedOnly] = useState<boolean>();
  const photoReviewedOnly = photoReviewedOverride ??
    (memberSettings?.plus === true && memberSettings.preferences.discovery?.verifiedOnly === true);
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

  const me = actorKey(session);
  const peerKey = threadPeerKey ?? selectedPeerKey ?? "";
  const messages = peerKey ? messagesByPeerKey[peerKey] ?? [] : [];

  const onlinePeerByKey = useMemo(() => new Map(onlinePeers.map((p) => [p.key, p])), [onlinePeers]);
  const displayNameByKey = useMemo(() => {
    const next: Record<string, string> = {};
    for (const p of publicProfiles) {
      if (typeof p.displayName === "string" && p.displayName.trim()) {
        next[chatKeyFromProfileUserId(p.userId)] = displayNameForIdentity(chatKeyFromProfileUserId(p.userId), p.displayName);
      }
    }
    for (const [key, profile] of Object.entries(peerProfileByKey)) {
      if (typeof profile.displayName === "string" && profile.displayName.trim()) {
        next[key] = displayNameForIdentity(key, profile.displayName);
      }
    }
    return next;
  }, [peerProfileByKey, publicProfiles]);

  const baseCards = useMemo(
    () =>
      publicProfiles.concat(guestKeys.map(key => ({
        userId: `guest:${key.slice("session:".length)}`,
        displayName: "Anon",
        bio: "",
        scheduledOnline: true
      })))
        .filter((p) => p.userId !== (session.userId ?? ""))
        .map((p) => {
          const key = chatKeyFromProfileUserId(p.userId);
          const online = onlinePeerByKey.get(key);
          return {
            key,
            userId: p.userId,
            displayName: displayNameForIdentity(chatKeyFromProfileUserId(p.userId), p.displayName),
            age: p.age,
            stats: p.stats,
            member: p.member,
            foundingMember: p.foundingMember,
            meters: online && selfCoords ? Math.round(distanceMeters(selfCoords, { lat: online.lat, lng: online.lng })) : null,
            isOnline: p.scheduledOnline ?? Boolean(online),
            recentlyActive: p.recentlyActive,
            hasPicture: typeof p.mainPhotoMediaId === "string" && p.mainPhotoMediaId.trim().length > 0,
            mainPhotoMediaId: p.mainPhotoMediaId,
            avatarUrl: p.mainPhotoMediaId ? mediaUrlById[p.mainPhotoMediaId] : undefined
          };
        }),
    [guestKeys, mediaUrlById, onlinePeerByKey, publicProfiles, selfCoords, session.userId]
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
      if (distanceLimitKm && (p.meters === null || p.meters > distanceLimitKm * 1000)) return false;
      if (interestFilter && !p.member?.interests?.includes(interestFilter)) return false;
      if (!googlePlayEdition && rightNowOnly && !isRightNow(p.member?.rightNowExpiresAtMs, discoveryNow)) return false;
      if (photoReviewedOnly && !p.member?.photoVerified) return false;
      if (favoritesOnly && !favorites.has(p.userId)) return false;
      if (onlineStatusFilter === "online" && !p.isOnline) return false;
      if (onlineStatusFilter === "offline" && p.isOnline) return false;
      if (hasChatHistoryOnly && !conversationMetaByPeerKey[p.key]) return false;
      if (hasPicturesOnly && !p.hasPicture) return false;
      if (!hasPlus(session)) return true;
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
      const priority = (priorityPlacement[b.key] ?? 0) - (priorityPlacement[a.key] ?? 0);
      if (priority !== 0) return priority;
      const aMeters = typeof a.meters === "number" && Number.isFinite(a.meters) ? a.meters : Number.POSITIVE_INFINITY;
      const bMeters = typeof b.meters === "number" && Number.isFinite(b.meters) ? b.meters : Number.POSITIVE_INFINITY;
      if (aMeters !== bMeters) return aMeters - bMeters;
      const nameCmp = a.displayName.localeCompare(b.displayName);
      if (nameCmp !== 0) return nameCmp;
      return a.key.localeCompare(b.key);
    });
  }, [
    photoReviewedOnly, discoveryNow, interestFilter, rightNowOnly, priorityPlacement, distanceLimitKm,
    session.tier, session.plusExpiresAtMs,
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
  const unreadCandidateKeys = useMemo(() => Array.from(new Set(gridCards.map((c) => c.key).filter((k) => k.trim().length > 0))), [gridCards]);
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
    () => (peerKey ? displayNameByKey[peerKey] ?? peerProfileByKey[peerKey]?.displayName ?? displayNameForPeerKey(peerKey) : ""),
    [displayNameByKey, peerKey, peerProfileByKey]
  );
  const activePeerAvatarUrl = useMemo(() => {
    if (!peerKey) return undefined;
    const gridMatch = gridCards.find((c) => c.key === peerKey);
    return gridMatch?.avatarUrl;
  }, [gridCards, peerKey]);
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
        upsertIncomingMessage(msg);
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
    [api, me, session.sessionToken, setLastError]
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
    const peerLabel = displayNameByKey[otherKey] ?? peerProfileByKey[otherKey]?.displayName ?? displayNameForPeerKey(otherKey);
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
        setChatReadCursor(channelToChatKind(channel), other, message.createdAtMs);
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

  }

  async function loadThreadMessages(targetPeerKey: string): Promise<void> {
    const normalizedTargetPeerKey = normalizePeerKey(targetPeerKey);
    if (!normalizedTargetPeerKey) return;
    try {
      const res = await api.listChat(session.sessionToken, channelToChatKind(channel), normalizedTargetPeerKey);
      const list = (res as any)?.messages as ChatMessage[];
      const safeList = Array.isArray(list) ? list : [];
      if(!document.hidden) void api.markChatRead(session.sessionToken, channelToChatKind(channel), normalizedTargetPeerKey).catch(() => {});
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
      if (!document.hidden && maxIncoming > 0) {
        setLastSeenByPeerKey((prev) => ({
          ...prev,
          [normalizedTargetPeerKey]: Math.max(prev[normalizedTargetPeerKey] ?? 0, maxIncoming)
        }));
        setChatReadCursor(channelToChatKind(channel), normalizedTargetPeerKey, maxIncoming);
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
            const seenAfter = Math.max(lastSeenByPeerKey[normalizedKey] ?? 0, getChatReadCursor(chatKind, normalizedKey));
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

    const live=()=>void refreshUnreadCounts();window.addEventListener("rd:inbox-update",live);
    const kick = window.setTimeout(() => {
      void refreshUnreadCounts();
    }, 1200);
    const id = window.setInterval(() => {
      void refreshUnreadCounts();
    }, 15_000);

    return () => {
      cancelled = true;window.removeEventListener("rd:inbox-update",live);
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

  function openThread(nextPeerKey: string): void {
    const normalizedNextPeerKey = normalizePeerKey(nextPeerKey);
    setSelectedPeerKey(normalizedNextPeerKey);
    setThreadPeerKey(normalizedNextPeerKey);
    setUnreadByPeerKey((prev) => {
      const next = { ...prev };
      delete next[normalizedNextPeerKey];
      return next;
    });
    const now = Date.now();
    setLastSeenByPeerKey((prev) => ({ ...prev, [normalizedNextPeerKey]: now }));
    setChatReadCursor(channelToChatKind(channel), normalizedNextPeerKey, now);
    setView("thread");
  }

  function clearGridFilters(): void {
    setPhotoReviewedOnly(false);
    setFavoritesOnly(false);
    setInterestFilter("");
    setRightNowOnly(false);
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

  const activeFilterCount = [googlePlayEdition ? Boolean(interestFilter) : rightNowOnly, Boolean(distanceLimitKm), photoReviewedOnly,favoritesOnly, hasChatHistoryOnly, hasPicturesOnly, onlineStatusFilter !== "all", ...(hasPlus(session) ? [filterMinAge, filterMaxAge, filterRace, filterCutStatus, filterMinHeight, filterMaxHeight, filterMinWeight, filterMaxWeight, filterMinCockSize, filterMaxCockSize, filterPosition].map(Boolean) : [])].filter(Boolean).length;
  useEffect(() => { window.dispatchEvent(new CustomEvent("rd:people-filter", {detail:{keys: activeFilterCount ? gridCards.map(card => card.key) : null}})); }, [activeFilterCount, gridCards]);

  if (view === "thread" && peerKey.trim()) {
    const peerLabel = displayNameByKey[peerKey] ?? peerProfileByKey[peerKey]?.displayName ?? displayNameForPeerKey(peerKey);
    return (
      <div style={{ display: "grid", gap: 0, marginInline: 0 }}>
        <ChatWindow
          reviewedPhotos={googlePlayEdition && session.userId ? { api, session } : undefined}
          readReceipts={hasPlus(session)}
          chatKind={channelToChatKind(channel)}
          peerKey={peerKey}
          currentUserKey={me}
          messages={messages}
          client={client}
          title={`INSTANT THREAD: ${peerLabel}`}
          peerSummary={{ displayName: peerLabel, avatarUrl: activePeerAvatarUrl }}
          showHeader={false}
          edgeToEdge={isMobile}
          fillHeight={isMobile}
        />
        {!googlePlayEdition && videoCallOpen ? (
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
    <div style={{ display: "grid", gap: 0, marginInline: 0 }}>
      {filtersOpen ? <Sheet title="Find your people" eyebrow="YOUR KIND OF COMPANY" onClose={() => setFiltersOpen(false)}><div className="rd-filter-fields">
              <label className="rd-field"><span>Distance</span>
                <select className="rd-input" value={distanceLimitKm} onChange={event => setDistanceLimitKm(Number(event.target.value))}>
                  <option value={0}>Any distance</option>
                  {[5, 10, 25, 50, 100].map(km => <option key={km} value={km}>Within {km} km</option>)}
                </select>
              </label>
              {googlePlayEdition ? <label className="rd-field"><span>Interest</span>
                <select className="rd-input" value={interestFilter} onChange={event => setInterestFilter(event.target.value)}>
                  <option value="">Any interest</option>
                  {INTERESTS.map(interest => <option key={interest}>{interest}</option>)}
                </select>
              </label> : <label className="rd-right-now-filter">
                <input type="checkbox" checked={rightNowOnly} onChange={event => setRightNowOnly(event.target.checked)} />
                <span className="rd-right-now-badge"><Icon name="lightning" active />Right Now only</span>
              </label>}
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
                  Has photos
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={photoReviewedOnly} onChange={e => setPhotoReviewedOnly(e.target.checked)} />
                  Photo-reviewed profiles only
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
                  {!googlePlayEdition && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={mapShowSpots} onChange={(e) => setMapShowSpots(e.target.checked)} />
                    Places
                  </label>}
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={mapShowGroups} onChange={(e) => setMapShowGroups(e.target.checked)} />
                    Groups
                  </label>
                </div>
              </div>
              <fieldset disabled={!hasPlus(session)} style={{ border: 0, padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, opacity: hasPlus(session) ? 1 : .45 }}><legend className="rd-label">Advanced filters{session.freePlus === false ? " · Plus" : ""}</legend>
                <input style={fieldStyle()} placeholder="Min age" value={filterMinAge} onChange={(e) => setFilterMinAge(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max age" value={filterMaxAge} onChange={(e) => setFilterMaxAge(e.target.value)} />
                <input style={fieldStyle()} placeholder="Race" value={filterRace} onChange={(e) => setFilterRace(e.target.value)} />
                {!googlePlayEdition && <><select style={fieldStyle()} value={filterCutStatus} onChange={(e) => setFilterCutStatus(e.target.value as "" | "cut" | "uncut")}>
                  <option value="">Cut / Uncut</option>
                  <option value="cut">Cut</option>
                  <option value="uncut">Uncut</option>
                </select></>}
                <input style={fieldStyle()} placeholder="Min height (in)" value={filterMinHeight} onChange={(e) => setFilterMinHeight(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max height (in)" value={filterMaxHeight} onChange={(e) => setFilterMaxHeight(e.target.value)} />
                <input style={fieldStyle()} placeholder="Min weight (lbs)" value={filterMinWeight} onChange={(e) => setFilterMinWeight(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max weight (lbs)" value={filterMaxWeight} onChange={(e) => setFilterMaxWeight(e.target.value)} />
                {!googlePlayEdition && <><input style={fieldStyle()} placeholder="Min cock size (in)" value={filterMinCockSize} onChange={(e) => setFilterMinCockSize(e.target.value)} />
                <input style={fieldStyle()} placeholder="Max cock size (in)" value={filterMaxCockSize} onChange={(e) => setFilterMaxCockSize(e.target.value)} />
                <select style={fieldStyle()} value={filterPosition} onChange={(e) => setFilterPosition(e.target.value as "" | "top" | "bottom" | "side")}>
                  <option value="">Position</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="side">Side</option>
                </select></>}
              </fieldset>
              {!googlePlayEdition && <SavedSearches api={api} session={session} filters={{ filterMinAge, filterMaxAge, filterRace, filterCutStatus, filterMinHeight, filterMaxHeight, filterMinWeight, filterMaxWeight, filterMinCockSize, filterMaxCockSize, filterPosition, favoritesOnly, hasChatHistoryOnly, hasPicturesOnly, photoReviewedOnly, onlineStatusFilter }} onApply={f => { setFilterMinAge((typeof f.filterMinAge === "string" ? f.filterMinAge : "")); setFilterMaxAge((typeof f.filterMaxAge === "string" ? f.filterMaxAge : "")); setFilterRace((typeof f.filterRace === "string" ? f.filterRace : "")); setFilterCutStatus((f.filterCutStatus === "cut" || f.filterCutStatus === "uncut" ? f.filterCutStatus : "")); setFilterMinHeight((typeof f.filterMinHeight === "string" ? f.filterMinHeight : "")); setFilterMaxHeight((typeof f.filterMaxHeight === "string" ? f.filterMaxHeight : "")); setFilterMinWeight((typeof f.filterMinWeight === "string" ? f.filterMinWeight : "")); setFilterMaxWeight((typeof f.filterMaxWeight === "string" ? f.filterMaxWeight : "")); setFilterMinCockSize((typeof f.filterMinCockSize === "string" ? f.filterMinCockSize : "")); setFilterMaxCockSize((typeof f.filterMaxCockSize === "string" ? f.filterMaxCockSize : "")); setFilterPosition((f.filterPosition === "top" || f.filterPosition === "bottom" || f.filterPosition === "side" ? f.filterPosition : "")); setFavoritesOnly(f.favoritesOnly === true); setHasChatHistoryOnly(f.hasChatHistoryOnly === true); setHasPicturesOnly(f.hasPicturesOnly === true); setPhotoReviewedOnly(f.photoReviewedOnly === true); setOnlineStatusFilter((f.onlineStatusFilter === "online" || f.onlineStatusFilter === "offline" ? f.onlineStatusFilter : "all")) }} />}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" style={buttonSecondary(false)} onClick={clearGridFilters}>Reset</button>
                <button type="button" style={buttonPrimary(false)} onClick={() => setFiltersOpen(false)}>Done</button>
              </div>
      </div></Sheet> : null}
      <div className="rd-discover-grid">
          <div className="rd-people-grid" aria-label="People to discover">
            {loading ? Array.from({length:6}, (_,i) => <div key={i} className="rd-profile-skeleton" aria-label="Loading profile" />) : gridCards.length === 0 ? (
              <div className="rd-empty-state"><span className="rd-empty-icon"><Icon name="user" /></span><h2>A little quiet here.</h2><p>No one matches your filters right now.<br />Try opening things up to find more connections.</p><div className="rd-row"><button type="button" className="rd-btn" onClick={clearGridFilters}>Clear filters</button><a className="rd-btn" href="#/groups">Browse private groups</a></div></div>
            ) : (
              gridCards.map((p) => {
                const name = displayNameForIdentity(p.key, p.displayName);
                const unread = unreadByPeerKey[p.key] ?? 0;
                const distance = p.meters === null ? null : formatDistanceLabel(p.meters);
                const rightNow = !googlePlayEdition && isRightNow(p.member?.rightNowExpiresAtMs, discoveryNow);
                const live = liveKeys.has(p.key) && !p.recentlyActive;
                const presence = p.isOnline ? "Online now" : p.recentlyActive ? "Recently active" : "Offline";
                const profileLabel = [
                  `View ${name}’s profile`, p.age, distance, presence, rightNow && "Right Now",
                  live && "Live now", unread > 0 && `${unread} unread`, p.foundingMember && "Founding Member"
                ].filter(Boolean).join(", ");
                return (
                  <button key={p.key} className={`rd-person-card ${unread > 0 ? "has-unread" : ""}`}
                    aria-label={profileLabel} type="button" onClick={() => onOpenProfile(p.key)}>
                    <div className="rd-person-photo">
                      <img src={p.avatarUrl ?? placeholderC} className={p.avatarUrl ? undefined : "rd-person-silhouette"}
                        alt="" loading="lazy" onError={() => {
                          if (p.mainPhotoMediaId && onAvatarLoadError) onAvatarLoadError(p.mainPhotoMediaId);
                        }} />
                    </div>
                    {p.isOnline && <span className="rd-person-online-dot" aria-hidden="true" />}
                    {distance && <span className="rd-person-distance" title={distance}>{distance}</span>}
                    <div className="rd-person-info">
                      <strong>{name}{p.age ? `, ${p.age}` : ""}</strong>
                      <span className="rd-person-indicators">
                        {rightNow && <Icon name="lightning" active />}
                        {live && <Icon name="live" active />}
                        {unread > 0 && <span className="rd-person-unread">
                          <Icon name="message" active />
                          <span>{unread > 99 ? "99+" : unread}</span>
                        </span>}
                      </span>
                    </div>
                  </button>
                );
              })
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
            {!googlePlayEdition && <><input style={fieldStyle()} placeholder="Min cock size" value={filterMinCockSize} onChange={(e) => setFilterMinCockSize(e.target.value)} />
            <input style={fieldStyle()} placeholder="Max cock size" value={filterMaxCockSize} onChange={(e) => setFilterMaxCockSize(e.target.value)} />
            <select style={fieldStyle()} value={filterCutStatus} onChange={(e) => setFilterCutStatus(e.target.value as "" | "cut" | "uncut")}>
              <option value="">Cut or uncut</option>
              <option value="cut">Cut</option>
              <option value="uncut">Uncut</option>
            </select></>}
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
                      <Icon name="star" active={fav} />
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
          {!googlePlayEdition && <button type="button" style={buttonSecondary(false)} onClick={() => void startVideoCall()}>VIDEO CALL</button>}
        </div>
      </div>
      <ChatWindow
          readReceipts={hasPlus(session)}
        chatKind={channelToChatKind(channel)}
        peerKey={peerKey}
        currentUserKey={meKey}
        messages={messages}
        client={client}
        title={`DATE ${channel.toUpperCase()} CHAT: ${peerUserId}`}
        peerSummary={{ displayName: peerUserId }}
      />
      {!googlePlayEdition && videoCallOpen ? (
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
  initialPeerKey,
  onCloseOverlay,
  onActiveThreadChange,
  onOpenProfile,
  api,
  session,
  setLastError,
  openThreadRequest,
  onThreadRequestConsumed,
  isMobile,
  onUnreadCountChange,
  mode = "all",
  compact = false,
  groupOnly = false
}: Readonly<{
  initialPeerKey?: string | null;
  onCloseOverlay?(): void;
  onActiveThreadChange?(key: string | null): void;
  onOpenProfile(request: ThreadProfileRequest): void;
  api: Api;
  session: Session;
  setLastError(value: string | null): void;
  openThreadRequest?: { key: string; nonce: number } | null;
  onThreadRequestConsumed?: () => void;
  isMobile: boolean;
  onUnreadCountChange?(count: number): void;
  mode?: "all" | "pinned";
  compact?: boolean;
  groupOnly?: boolean;
}>): React.ReactElement {
  const [rows, setRows] = useState<ReadonlyArray<{ key: string; chatKind: "cruise" | "date"; displayName: string; preview: string; at: number; unreadCount: number; avatarUrl?: string }>>(
    []
  );
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [groupView, setGroupView] = useState<{ peerId?: string } | null>(null);
  const [selectedPeerKey, setSelectedPeerKey] = useState<string | null>(initialPeerKey ?? null);
  useEffect(() => { onActiveThreadChange?.(selectedPeerKey); }, [selectedPeerKey, onActiveThreadChange]);
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [pinnedKeys, setPinnedKeys] = useState<ReadonlySet<string>>(new Set());
  const [deletedKeys, setDeletedKeys] = useState<ReadonlySet<string>>(new Set());
  const avatarUrlByMediaIdRef = useRef<Record<string, string>>({});
  const avatarFetchedAtByMediaIdRef = useRef<Record<string, number>>({});
  const avatarUrlFreshForMs = 8 * 60_000;
  const deletedStorageKey = `reddoor:threads:deleted:${session.sessionToken}`;
  const pinnedStorageKey = `reddoor:threads:pinned:${session.sessionToken}`;

  const meKey = actorKey(session);
  const [threadKindByPeerKey, setThreadKindByPeerKey] = useState<Record<string, "cruise" | "date">>({});

  const visibleRows = useMemo(() => {
    const byPinned = mode === "pinned" ? rows.filter((row) => pinnedKeys.has(row.key)) : rows;
    const byDeleted = byPinned.filter((row) => !deletedKeys.has(row.key));
    return unreadOnly ? byDeleted.filter((row) => row.unreadCount > 0) : byDeleted;
  }, [deletedKeys, mode, pinnedKeys, rows, unreadOnly]);
  const rowsUnreadTotal = useMemo(
    () => rows.filter((row) => !deletedKeys.has(row.key)).reduce((sum, row) => sum + (Number.isFinite(row.unreadCount) ? row.unreadCount : 0), 0),
    [deletedKeys, rows]
  );
  const activeRow = useMemo(() => rows.find((row) => row.key === selectedPeerKey) ?? null, [rows, selectedPeerKey]);
  const defaultChatKind = session.mode === "date" ? "date" : "cruise";
  const selectedChatKind = session.mode === "hybrid" && selectedPeerKey
    ? threadKindByPeerKey[selectedPeerKey] ?? defaultChatKind
    : defaultChatKind;

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
    if (session.userId) void api.getPlus(session.sessionToken).then(data => setPinnedKeys(new Set(data.pinnedKeys))).catch(() => {});
    setDeletedKeys(parseSet(safeLocalStorageGet(deletedStorageKey)));
  }, [deletedStorageKey, pinnedStorageKey]);

  useEffect(() => {
    safeLocalStorageSet(pinnedStorageKey, JSON.stringify(Array.from(pinnedKeys.values()).sort()));
  }, [pinnedKeys, pinnedStorageKey]);

  useEffect(() => {
    safeLocalStorageSet(deletedStorageKey, JSON.stringify(Array.from(deletedKeys.values()).sort()));
  }, [deletedKeys, deletedStorageKey]);

  useEffect(() => {
    if (typeof onUnreadCountChange === "function") onUnreadCountChange(rowsUnreadTotal);
  }, [onUnreadCountChange, rowsUnreadTotal]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function safeListThreads(chatKind: "cruise" | "date"): Promise<ReadonlyArray<Readonly<{ otherKey: string; peerDisplayName?: string; lastMessage: ChatMessage }>>> {
      if (session.mode !== "hybrid" && session.mode !== chatKind) return [];
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
          api.getPublicProfiles().catch(() => ({ profiles: [] })),
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
                displayName: thread.peerDisplayName || nameByKey[normalizedKey] || displayNameForPeerKey(normalizedKey),
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
        const unreadCounts: number[] = [];
        for (const row of next) {
          try {
            const chat = await api.listChat(session.sessionToken, row.chatKind, row.key);
            const messages = ((chat as { messages?: ChatMessage[] }).messages ?? []) as ChatMessage[];
            const cursor = getChatReadCursor(row.chatKind, row.key);
            let unread = 0;
            for (const message of messages) {
              if (
                message.fromKey === row.key &&
                message.toKey === meKey &&
                typeof message.readAtMs !== "number" &&
                (!Number.isFinite(message.createdAtMs) || message.createdAtMs > cursor)
              ) {
                unread += 1;
              }

            }
            unreadCounts.push(unread);
          } catch {
            unreadCounts.push(0);
          }
        }
        if (cancelled) return;
        const nextWithUnread = next
          .map((row, index) => ({
            ...row,
            displayName: displayNameForIdentity(row.key, row.displayName),
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

    const live=()=>void refresh();window.addEventListener("rd:inbox-update",live);
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => {
      cancelled = true;
      window.removeEventListener("rd:inbox-update",live);
      window.clearInterval(id);
    };
  }, [api, meKey, onUnreadCountChange, session.mode, session.sessionToken, session.userId, setLastError]);

  useEffect(() => {
    if (!openThreadRequest?.key) return;
    setSelectedPeerKey(normalizePeerKey(openThreadRequest.key));
    if (typeof onThreadRequestConsumed === "function") onThreadRequestConsumed();
  }, [onThreadRequestConsumed, openThreadRequest]);

  useEffect(() => {
    if (!selectedPeerKey) return;
    if (deletedKeys.has(selectedPeerKey)) {
      if (onCloseOverlay) {
        onCloseOverlay();
        return;
      }
      setSelectedPeerKey(null);
    }
  }, [deletedKeys, onCloseOverlay, selectedPeerKey]);

  useEffect(() => {
    const onTabSelect = (evt: Event): void => {
      const custom = evt as CustomEvent<{ tab?: TopTab }>;
      if (custom.detail?.tab !== "threads") return;
      setSelectedPeerKey(null);
    };
    window.addEventListener("rd:tab-select", onTabSelect as EventListener);
    return () => window.removeEventListener("rd:tab-select", onTabSelect as EventListener);
  }, []);

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
          if(!document.hidden) {
          void api.markChatRead(session.sessionToken, selectedChatKind, selectedPeerKey).catch(() => {});
          let maxIncoming = 0;
          for (const message of safeList) {
            if (message.fromKey === selectedPeerKey && Number.isFinite(message.createdAtMs) && message.createdAtMs > maxIncoming) {
              maxIncoming = message.createdAtMs;
            }
          }
          if (maxIncoming > 0) setChatReadCursor(selectedChatKind, selectedPeerKey, maxIncoming);
          setRows((prev) => {
            const next = prev.map((row) => (row.key === selectedPeerKey ? { ...row, unreadCount: 0 } : row));
            return threadRowsEqual(prev, next) ? prev : next;
          });
          }
        }
      } catch (e) {
        if (!cancelled) setLastError(normalizeErrorMessage(e));
      }
    };
    const live=()=>void load();window.addEventListener("rd:inbox-update",live);
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 1200);
    return () => {
      cancelled = true;
      window.removeEventListener("rd:inbox-update",live);
      window.clearInterval(id);
    };
  }, [api, selectedChatKind, selectedPeerKey, session.sessionToken, setLastError]);

  const client: ChatApiClient = useMemo(
    () => ({
      async sendMessage(chatKind, toKey, text, media) {
        const res = await api.sendChat(session.sessionToken, chatKind, toKey, text, media);
        const msg = (res as any)?.message as ChatMessage;
        setMessages((prev) => prev.some(m=>m.messageId===msg.messageId) ? prev : [...prev, msg].sort((a, b) => a.createdAtMs - b.createdAtMs));
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
    [api, session.sessionToken]
  );

  function togglePinThread(key: string): void {
    const next = new Set(pinnedKeys);
    if (next.has(key)) next.delete(key);
    else {
      if (next.size >= limits(session).pins) { if (session.freePlus === false) openPlus("chats"); else setLastError(`You can pin up to ${limits(session).pins} chats.`); return; }
      next.add(key);
    }
    void api.savePlusPreferences(session.sessionToken, { pinnedKeys: [...next] }).then(() => setPinnedKeys(next)).catch(e => setLastError(normalizeErrorMessage(e)));
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
    setSelectedKeys(new Set());
    setSelectMode(false);
  }

  const groupPanel = groupView ? <GroupConversations api={api} session={session} peerId={groupView.peerId}
    candidates={rows.filter(row => row.key.startsWith("user:")).map(row => ({ id: row.key.slice(5), label: row.displayName }))}
    onClose={() => setGroupView(null)} /> : null;

  if (groupOnly) return <>
    {session.userId ? <button type="button" className="rd-btn" onClick={() => setGroupView({})}>Group conversations</button> : null}
    {groupPanel}
  </>;

  function openConversation(row: (typeof rows)[number]): void {
    setSelectedPeerKey(row.key);
    setChatReadCursor(row.chatKind, row.key, Date.now());
    setRows((prev) => {
      const next = prev.map((item) => item.key === row.key ? { ...item, unreadCount: 0 } : item);
      return threadRowsEqual(prev, next) ? prev : next;
    });
  }

  if (selectedPeerKey) {
    const peerLabel = activeRow?.displayName ?? displayNameForPeerKey(selectedPeerKey);
    const displayName = displayNameForIdentity(selectedPeerKey, peerLabel);
    const thread = (
      <div className="rd-active-thread"
        style={{
          display: "grid",
          gap: 0,
          minHeight: isMobile ? "calc(100dvh - 150px)" : undefined,
          marginInline: 0,
          marginBlock: 0
        }}
      >
        <div className="rd-thread-header" style={{ position: "sticky", top: 0, zIndex: 46, background: "#17171b", borderBottom: "1px solid var(--line)", padding: "12px", display: "flex", alignItems: "center", gap: 12 }}>
          <button className="rd-btn" aria-label="Back to conversations" onClick={() => setSelectedPeerKey(null)}><Icon name="back" /></button>
          <button type="button" className="rd-thread-avatar rd-thread-avatar-mini" aria-label={`View ${displayName}’s profile`}
            onClick={() => onOpenProfile({ key: selectedPeerKey, displayName, chatKind: selectedChatKind, onMessage: () => {}, onError: setLastError })}>
            <img src={activeRow?.avatarUrl ?? avatarForKey(selectedPeerKey)} alt="" />
          </button>
          <strong>{displayName}</strong>
        </div>
        {session.userId && selectedPeerKey.startsWith("user:") && hasPlus(session) ? (
          <button type="button" className="rd-btn" onClick={() => setGroupView({ peerId: selectedPeerKey.slice(5) })}>Start group conversation</button>
        ) : null}
        {groupPanel}
        <ChatWindow key={selectedPeerKey}
          reviewedPhotos={googlePlayEdition && session.userId ? { api, session } : undefined}
          readReceipts={hasPlus(session)}
          chatKind={selectedChatKind}
          peerKey={selectedPeerKey}
          currentUserKey={meKey}
          messages={messages}
          client={client}
          title={peerLabel}
          peerSummary={{ displayName: peerLabel }}
          showHeader={false}
          edgeToEdge={true}
          fillHeight={isMobile}
        />
      </div>
    );
    const dialog = (
      <Sheet title={displayNameForIdentity(selectedPeerKey, peerLabel)} className="rd-thread-sheet"
        onClose={onCloseOverlay ?? (() => setSelectedPeerKey(null))}>
        {thread}
      </Sheet>
    );
    if (onCloseOverlay) return dialog;
    return (
      <MessageWorkspace rows={visibleRows} current={selectedPeerKey} onSelect={setSelectedPeerKey}>
        {isMobile ? thread : dialog}
      </MessageWorkspace>
    );
  }

  return (
    <div style={{ display: "grid", gap: 0, marginInline: 0, marginBlock: 0 }}>
      {!compact ? <>
      {session.userId ? <button type="button" className="rd-btn" onClick={() => setGroupView({})}>Group conversations</button> : null}
      {groupPanel}
      <div style={{ position: compact ? "sticky" : "static", top: 0, zIndex: 3, background: "var(--surface)", borderBottom: "1px solid rgba(255,122,136,0.24)", padding: "8px 10px" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "nowrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap" }}>
            <button type="button" style={{ ...(unreadOnly ? buttonPrimary(false) : buttonSecondary(false)), whiteSpace: "nowrap" }} onClick={() => setUnreadOnly((prev) => !prev)}>
              Unread
            </button>
            <button
              type="button"
              style={{ ...(selectMode ? buttonPrimary(false) : buttonSecondary(false)), whiteSpace: "nowrap" }}
              onClick={() => {
                setSelectMode((prev) => !prev);
                setSelectedKeys(new Set());
              }}
            >
              Select
            </button>
          </div>
          {selectMode ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap" }}>
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
      </> : null}
      {visibleRows.length === 0 ? (
        <div className="rd-empty-state"><span className="rd-empty-icon"><Icon name={mode === "pinned" ? "star" : "message"} /></span><h2>{mode === "pinned" ? "Keep your favorites close." : "Every connection starts with hello."}</h2><p>{mode === "pinned" ? "Pin a conversation to find it here." : "Your conversations will appear here once you start chatting."}</p></div>
      ) : (
        visibleRows.map((row) => {
          const displayName = displayNameForIdentity(row.key, row.displayName);
          const selected = selectMode && selectedKeys.has(row.key);

          return (
            <div key={row.key} className="rd-thread-list-row" data-selected={selected}>
              <button type="button" className="rd-thread-avatar" aria-label={`View ${displayName}’s profile`}
                onClick={() => onOpenProfile({ key: row.key, displayName, chatKind: row.chatKind, onMessage: () => openConversation(row), onError: setLastError })}>
                <img src={row.avatarUrl ?? avatarForKey(row.key)} alt="" />
              </button>
              <button type="button" className="rd-thread-list-conversation" aria-pressed={selectMode ? selected : undefined} onClick={() => {
                if (!selectMode) {
                  openConversation(row);
                  return;
                }
                setSelectedKeys((prev) => {
                  const next = new Set(prev);
                  if (next.has(row.key)) next.delete(row.key);
                  else next.add(row.key);
                  return next;
                });
              }}>
                <strong>{displayName}</strong>
                <span>{row.preview}</span>
                {row.unreadCount > 0 ? <span className="rd-thread-unread">{row.unreadCount > 99 ? "99+" : row.unreadCount}</span> : null}
              </button>
              <button type="button" className="rd-thread-pin" data-pinned={pinnedKeys.has(row.key)}
                onClick={() => togglePinThread(row.key)} aria-label={pinnedKeys.has(row.key) ? "Unpin thread" : "Pin thread"}>
                {pinnedKeys.has(row.key) ? "📌" : "•"}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

function GroupCoverPhoto({ api, token, postingId, mediaId, fallback, alt, style, preview = false }: {
  api: Api; token: string; postingId: string; mediaId?: string; fallback: string; alt: string; style?: React.CSSProperties; preview?: boolean;
}) {
  const [photo, setPhoto] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!mediaId) return;
    let canceled = false;
    let url: string | undefined;
    void api.memberPhoto(token, preview ? mediaId : postingId, preview ? "group-photo-preview" : "group-photo").then(blob => {
      if (canceled) return;
      url = URL.createObjectURL(blob);
      setPhoto({ id: mediaId, url });
    }).catch(() => {});
    return () => {
      canceled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, token, postingId, mediaId, preview]);
  return <img src={mediaId && photo?.id === mediaId ? photo.url : fallback} alt={alt} style={style} />;
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
  const [allAds, setAds] = useState<ReadonlyArray<PublicPosting>>([]);
  const classifiedsQuery = new URLSearchParams(window.location.search);
  const cityId = classifiedsQuery.get("city");
  const requestedCategory = classifiedsQuery.get("category");
  const city = googlePlayEdition || screen !== "ads" ? undefined : classifiedCities.find(entry => entry.id === cityId);
  const initialCategory = city && isClassifiedCategory(requestedCategory) ? requestedCategory : "";
  const [category, setCategory] = useState<string>(initialCategory);
  const [adCategory, setAdCategory] = useState<ClassifiedCategory | "">(initialCategory);
  const exampleMode = classifiedsQuery.get("example");
  const example = initialCategory && (exampleMode === "category" || (exampleMode === "overview" && initialCategory === "community"))
    ? classifiedExamples[exampleMode === "overview" ? "overview" : initialCategory] : undefined;
  const [adBody, setAdBody] = useState(() => example?.[2] ?? "");
  const ads = useMemo(() => allAds.filter(posting =>
    posting.cityId === city?.id && (!city || !category || posting.board === category)
  ), [allAds, city, category]);
  const [events, setEvents] = useState<ReadonlyArray<PublicPosting>>([]);
  const exampleLocation = city && classifiedCities.some(entry => entry.id !== city.id && entry.name === city.name)
    ? `${city.name}, ${city.region}` : city?.name;
  const exampleTitle = exampleLocation && example ? example[1].replace("{city}", exampleLocation) : "";
  const [adTitle, setAdTitle] = useState(() => exampleTitle);
  const needsExampleEdits = Boolean(example && (adTitle.trim() === exampleTitle || adBody.trim() === example[2]));
  const [eventTitle, setEventTitle] = useState<string>("");
  const [eventBody, setEventBody] = useState<string>("");
  const [eventGroupFormat, setEventGroupFormat] = useState<GroupFormat>("scheduled");
  const [eventRepeatCount, setEventRepeatCount] = useState(1);
  const [groupAction, setGroupAction] = useState<{ postingId: string; attendeeId?: string } | null>(null);
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [groupActionError, setGroupActionError] = useState("");
  const [eventGuestLimit, setEventGuestLimit] = useState("");
  const [eventDate, setEventDate] = useState<string>("");
  const [eventStartTime, setEventStartTime] = useState<string>("");
  const [eventEndTime, setEventEndTime] = useState<string>("");
  const [eventGroupDetails, setEventGroupDetails] = useState<string>("");
  const [eventLocationInstructions, setEventLocationInstructions] = useState<string>("");
  const [spots, setSpots] = useState<ReadonlyArray<CruisingSpot>>([]);
  const [spotName, setSpotName] = useState<string>("");
  const [spotAddress, setSpotAddress] = useState<string>("");
  const [spotDescription, setSpotDescription] = useState<string>("");
  const [eventPhotoFile, setEventPhotoFile] = useState<File | null>(null);
  const [spotPhotoFile, setSpotPhotoFile] = useState<File | null>(null);
  const [eventPhotoMediaId, setEventPhotoMediaId] = useState<string>("");
  const [approvedGroupPhotos, setApprovedGroupPhotos] = useState<string[]>([]);
  const [groupPhotoError, setGroupPhotoError] = useState("");
  const [spotPhotoMediaId, setSpotPhotoMediaId] = useState<string>("");
  const [mediaUrlById, setMediaUrlById] = useState<Record<string, string>>({});
  const [publicProfilesByUserId, setPublicProfilesByUserId] = useState<Record<string, PublicProfile>>({});
  const [uploadingKind, setUploadingKind] = useState<"event" | "spot" | null>(null);
  const [eventInvites, setEventInvites] = useState<ReadonlyArray<PublicPosting>>([]);
  const [inviteDeadlineByEventId, setInviteDeadlineByEventId] = useState<Record<string, string>>({});
  const [inviteTargetByEventId, setInviteTargetByEventId] = useState<Record<string, string>>({});
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [adThreadMessages, setAdThreadMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [adThreadLoading, setAdThreadLoading] = useState<boolean>(false);
  const [spotThreadMessages, setSpotThreadMessages] = useState<ReadonlyArray<ChatMessage>>([]);
  const [spotThreadLoading, setSpotThreadLoading] = useState<boolean>(false);
  const [createPanelOpen, setCreatePanelOpen] = useState<boolean>(!compact);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  useEffect(() => {
    if (!googlePlayEdition || !groupCreateOpen) return;
    let canceled = false;
    setGroupPhotoError("");
    void api.memberRequest<{ submissions: { id: string; status: string; destination: string }[] }>(session.sessionToken, "/media-review")
      .then(({ submissions }) => {
        if (canceled) return;
        const ids = submissions.filter(row => row.status === "approved" && row.destination === "group-photo").map(row => row.id);
        setApprovedGroupPhotos(ids);
        setEventPhotoMediaId(current => ids.includes(current) ? current : "");
      })
      .catch(error => { if (!canceled) setGroupPhotoError(normalizeErrorMessage(error)); });
    return () => { canceled = true; };
  }, [api, groupCreateOpen, session.sessionToken]);

  const [groupCreateError, setGroupCreateError] = useState<string | null>(null);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [boardPosting, setBoardPosting] = useState<boolean>(false);
  const [boardProfileUserId, setBoardProfileUserId] = useState<string | null>(null);
  const [presenceByKey, setPresenceByKey] = useState<Record<string, { lat: number; lng: number }>>({});
  const refreshSeqRef = useRef<number>(0);

  const canPostAds = session.ageVerified && session.userType !== "guest" && (Boolean(city) || hasPlus(session));
  const postingChatKind = session.mode === "cruise" || session.userType === "guest" ? "cruise" : "date";
  const canPostEvents = session.userType !== "guest";
  const canCreateSpots = true;
  const gridColumns = isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))";
  const myActorKey = actorKey(session);
  const selectedAd = ads.find(ad => ad.postingId === selectedAdId) ?? null;
  const selectedGroup = useMemo(() => events.find((event) => event.postingId === selectedGroupId) ?? null, [events, selectedGroupId]);
  const selectedSpot = useMemo(() => spots.find((spot) => spot.spotId === selectedSpotId) ?? null, [selectedSpotId, spots]);
  const selectedAdThreadKey = selectedAd?.authorUserId ? `user:${selectedAd.authorUserId}` : "";
  const selectedSpotThreadKey = selectedSpotId ? `spot:${selectedSpotId}` : "";
  const meKey = actorKey(session);
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
      return "Anon";
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
        googlePlayEdition ? Promise.resolve({ postings: [] }) : api.listPublicPostings("ad", session.sessionToken),
        api.listPublicPostings("event", session.sessionToken),
        googlePlayEdition ? Promise.resolve({ spots: [] }) : api.listCruisingSpots(session.sessionToken),
        session.userType === "guest" ? Promise.resolve({ postings: [] as ReadonlyArray<PublicPosting> }) : api.listEventInvites(session.sessionToken),
        api.getPublicProfiles()
      ]);
      if (requestSeq !== refreshSeqRef.current) return;
      // Public postings should render oldest -> newest so new posts land at the bottom.
      const now = Date.now();
      setAds([...adsRes.postings].sort((a, b) => a.createdAtMs - b.createdAtMs));
      setEvents(
        [...eventsRes.postings]
          .filter((row) => typeof row.eventStartAtMs !== "number" || row.eventStartAtMs > now)
          .sort((a, b) => (a.groupStartsAtMs ?? a.eventStartAtMs ?? a.createdAtMs) -
            (b.groupStartsAtMs ?? b.eventStartAtMs ?? b.createdAtMs))
      );
      setSpots(spotsRes.spots);
      setEventInvites(invitesRes.postings.filter(posting => !session.userId ||
        (!posting.acceptedUserIds?.includes(session.userId) && !posting.joinRequestUserIds?.includes(session.userId))));
      setPublicProfilesByUserId(
        profilesRes.profiles.reduce<Record<string, PublicProfile>>((acc, profile) => {
          acc[profile.userId] = profile;
          return acc;
        }, {})
      );
      await resolveMediaUrls([
        ...adsRes.postings.map((p) => p.photoMediaId ?? ""),
        ...(googlePlayEdition ? [] : eventsRes.postings.map((p) => p.photoMediaId ?? "")),
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
    setSelectedAdId((prev) => (prev && ads.some(item => item.postingId === prev) ? prev : ads[0]?.postingId ?? null));
  }, [ads, isMobile, screen]);

  useEffect(() => {
    if (isMobile || screen !== "groups") return;
    setSelectedGroupId((prev) => (prev && events.some((item) => item.postingId === prev) ? prev : events[0]?.postingId ?? null));
  }, [events, isMobile, screen]);

  useEffect(() => {
    if (isMobile || screen !== "cruise") return;
    setSelectedSpotId((prev) => (prev && spots.some((item) => item.spotId === prev) ? prev : spots[0]?.spotId ?? null));
  }, [isMobile, screen, spots]);

  async function submitGroup(): Promise<void> {
    if (groupSubmitting) return;
    setGroupCreateError(null);
    if (!canPostEvents) {
      setGroupCreateError("Anonymous users cannot create groups.");
      return;
    }
    const title = eventTitle;
    const body = eventBody;
    if (title.trim().length === 0) {
      setGroupCreateError("Title is required.");
      return;
    }
    if (body.trim().length === 0) {
      setGroupCreateError("Body is required.");
      return;
    }
    const photoMediaId = eventPhotoMediaId;
    const groupStartAtMs = combineEventDateTimeToEpochMs(eventDate, eventStartTime);
    const groupEndAtMs = combineEventDateTimeToEpochMs(eventDate, eventEndTime);
    let groupSchedule: GroupOccurrence[] | undefined;
    if (groupStartAtMs !== null && groupEndAtMs !== null) {
      groupSchedule = Array.from({ length: eventRepeatCount }, (_, index) => {
        const start = new Date(groupStartAtMs);
        const end = new Date(groupEndAtMs);
        start.setDate(start.getDate() + index * 7);
        end.setDate(end.getDate() + index * 7);
        return { startsAtMs: start.getTime(), endsAtMs: end.getTime() };
      });
    }
    if (groupStartAtMs === null) {
      setGroupCreateError("Group start date and time are required.");
      return;
    }
    if (groupEndAtMs === null) {
      setGroupCreateError("Group end date and time are required.");
      return;
    }
    if (typeof groupStartAtMs === "number" && typeof groupEndAtMs === "number" && groupEndAtMs <= groupStartAtMs) {
      setGroupCreateError("Group end time must be after the start time.");
      return;
    }
    if (typeof groupEndAtMs === "number" && groupEndAtMs <= Date.now()) {
      setGroupCreateError("Group end time must be in the future.");
      return;
    }
    if (!selfCoords) {
      setGroupCreateError("Current location is required to place the group.");
      return;
    }
    const guestLimit = Number(eventGuestLimit);
    if (!validGuestLimit(guestLimit)) {
      setGroupCreateError("Enter a positive whole-number guest limit.");
      return;
    }
    if (eventLocationInstructions.trim().length === 0) {
      setGroupCreateError("Location instructions are required.");
      return;
    }
    if (eventGroupDetails.trim().length === 0) {
      setGroupCreateError("Group details are required.");
      return;
    }
    setGroupSubmitting(true);
    try {
      const created = await api.createPublicPosting(session.sessionToken, {
        type: "event",
        title,
        body,
        photoMediaId: photoMediaId || undefined,
        lat: selfCoords?.lat,
        lng: selfCoords?.lng,
        eventStartAtMs: groupEndAtMs ?? undefined,
        groupSchedule,
        groupFormat: eventGroupFormat,
        guestLimit: guestLimit,
        locationInstructions: eventLocationInstructions.trim(),
        groupDetails: eventGroupDetails.trim()
      });
      setEvents(prev => [...prev, created.posting].sort((a, b) => a.createdAtMs - b.createdAtMs));
      setEventTitle("");
      setEventBody("");
      setEventGuestLimit("");
      setEventRepeatCount(1);
      setEventGroupFormat("scheduled");
      setEventDate("");
      setEventStartTime("");
      setEventEndTime("");
      setEventGroupDetails("");
      setEventLocationInstructions("");
      setEventPhotoFile(null);
      setEventPhotoMediaId("");
      setGroupCreateOpen(false);
      await refresh();
    } catch (e) {
      setGroupCreateError(normalizeErrorMessage(e));
    } finally {
      setGroupSubmitting(false);
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
      const deadline = inviteDeadlineByEventId[postingId];
      await api.inviteToEvent(session.sessionToken, {
        postingId, targetUserId, expiresAtMs: deadline ? new Date(deadline).getTime() : undefined
      });
      setInviteDeadlineByEventId(prev => ({ ...prev, [postingId]: "" }));
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

  function confirmGroupAction(postingId: string, attendeeId?: string): void {
    setGroupActionError("");
    setGroupAction({ postingId, attendeeId });
  }

  async function applyGroupAction(): Promise<void> {
    if (!groupAction || groupActionBusy) return;
    const { postingId, attendeeId } = groupAction;
    const route = `/public-postings/event/${encodeURIComponent(postingId)}`;
    setGroupActionBusy(true);
    setGroupActionError("");
    try {
      await api.memberRequest(session.sessionToken, attendeeId ? `${route}/attendees/${encodeURIComponent(attendeeId)}` : route, undefined, "DELETE");
      if (!attendeeId) {
        setEvents(previous => previous.filter(posting => posting.postingId !== postingId));
        setSelectedGroupId(null);
      }
      setGroupAction(null);
      await refresh();
    } catch (error) {
      setGroupActionError(normalizeErrorMessage(error));
    } finally {
      setGroupActionBusy(false);
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

  async function uploadGridPhoto(kind: "event" | "spot"): Promise<void> {
    const setUploadError = kind === "event" ? setGroupCreateError : setLastError;
    const file = kind === "event" ? eventPhotoFile : spotPhotoFile;
    if (!file) {
      setUploadError("Choose a photo before uploading.");
      return;
    }
    if (session.userType === "guest") {
      setUploadError("Guests cannot upload media.");
      return;
    }
    setUploadError(null);
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
      if (kind === "event") setEventPhotoMediaId(initiated.mediaId);
      if (kind === "spot") setSpotPhotoMediaId(initiated.mediaId);
    } catch (e) {
      setUploadError(normalizeErrorMessage(e));
    } finally {
      setUploadingKind(null);
    }
  }

  const adBoardRows = useMemo(() => {
    const now = Date.now();
    const recentAds = ads
      .filter(row => now - row.createdAtMs < adLifetimeMs(row.cityId))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    const grouped = new Map<
      string,
      {
        authorUserId: string;
        latestAtMs: number;
        bubbles: PublicPosting[];
      }
    >();
    for (const row of recentAds) {
      const existing = grouped.get(row.authorUserId);
      if (!existing) {
        grouped.set(row.authorUserId, {
          authorUserId: row.authorUserId,
          latestAtMs: row.createdAtMs,
          bubbles: [row]
        });
        continue;
      }
      existing.bubbles.push(row);
      existing.latestAtMs = Math.max(existing.latestAtMs, row.createdAtMs);
    }
    return Array.from(grouped.values()).sort((a, b) => a.latestAtMs - b.latestAtMs);
  }, [ads]);

  async function submitBoardAd(): Promise<void> {
    if (!canPostAds || needsExampleEdits || (city && !adCategory)) return;
    const title = adTitle.trim();
    if (!title) { setLastError("Enter a posting headline."); return; }
    setLastError(null);
    setBoardPosting(true);
    try {
      await api.createPublicPosting(session.sessionToken, {
        type: "ad",
        title,
        body: city ? adBody.trim() : "",
        board: city && adCategory ? adCategory : "general",
        cityId: city?.id
      });
      setAdTitle("");
      setAdBody("");
      if (city && category && category !== adCategory) setCategory(adCategory);
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
      if(!document.hidden) void api.markChatRead(session.sessionToken, "cruise", threadKey).catch(() => {});
    } catch (e) {
      setLastError(normalizeErrorMessage(e));
    }
  }

  async function loadAdThread(posting: PublicPosting): Promise<void> {
    const threadKey = `user:${posting.authorUserId}`;
    try {
      const res = await api.listChat(session.sessionToken, postingChatKind, threadKey);
      const list = Array.isArray((res as { messages?: unknown }).messages) ? ((res as { messages: ChatMessage[] }).messages ?? []) : [];
      setAdThreadMessages([...list].sort((a, b) => a.createdAtMs - b.createdAtMs));
      if(!document.hidden) void api.markChatRead(session.sessionToken, postingChatKind, threadKey).catch(() => {});
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

  const cityCategories = Object.entries(CLASSIFIED_CATEGORIES).map(([id, name]) => <option key={id} value={id}>{name}</option>);
  const adultPreviews = city && session.userType !== "guest" && session.ageVerified && classifiedsQuery.get("videos") === "1"
    ? <AdultClassifiedPreviews api={api} token={session.sessionToken} /> : null;

  const classifiedsHeading = (
    <div className="rd-classifieds-heading">
      {city && <h1>{city.name} classifieds</h1>}
      <a href="./?directory=1#classifieds">{city ? "Choose another city" : "City classifieds"}</a>
      {city && <label className="rd-field">
        <span className="rd-label">Browse by category</span>
        <select className="rd-input" value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {cityCategories}
        </select>
      </label>}
    </div>
  );

  const postingToolbar = (
    <form className={`rd-posting-toolbar${city ? " rd-city-posting-form" : ""}`} onSubmit={event => { event.preventDefault(); void submitBoardAd(); }}>
      {canPostAds ? <>
        {needsExampleEdits && <p className="rd-caption">Replace the fictional headline and details with your own before posting.</p>}
        <input className="rd-input" aria-label="Posting headline" placeholder="Headline" value={adTitle}
          required maxLength={120} disabled={boardPosting} onChange={event => setAdTitle(event.target.value)} />
        {city && <>
          <select className="rd-input" aria-label="Posting category" required value={adCategory} disabled={boardPosting}
            onChange={event => { const value = event.target.value; setAdCategory(isClassifiedCategory(value) ? value : ""); }}>
            <option value="">Choose a category</option>
            {cityCategories}
          </select>
          <textarea className="rd-input" aria-label="Posting details" placeholder="Details (optional)" maxLength={4000}
            value={adBody} disabled={boardPosting} onChange={event => setAdBody(event.target.value)} />
        </>}
        <button type="submit" className="rd-btn primary" disabled={boardPosting || needsExampleEdits || !adTitle.trim() || Boolean(city && !adCategory)}>
          {boardPosting ? "Posting…" : "Post"}
        </button>
      </> : !city && session.freePlus === false ? <button type="button" className="rd-btn" onClick={() => openPlus()}>Get Plus to post</button> : <p className="rd-caption">Sign in with a Badehaus X account to post.</p>}
    </form>
  );

  const groupsPanel = (): React.ReactElement => {
    const isUploading = uploadingKind === "event";

    return (
      <section className="rd-groups-surface" aria-label={googlePlayEdition ? "Group plans" : "Groups"}>
          {googlePlayEdition && <h1>Group plans</h1>}
          <div>
            {events.length === 0 ? (
              <div style={{ color: "#b9bec9", fontSize: 14 }}>No groups yet.</div>
            ) : (
              <div className="rd-group-list">
                {events.map((p) => {
                  const isHost = !!session.userId && session.userId === p.authorUserId;
                  const isInvited = !!session.userId && (p.invitedUserIds ?? []).includes(session.userId);
                  const isAttending = !!session.userId && (p.authorUserId === session.userId || (p.acceptedUserIds ?? []).includes(session.userId));
                  const hasRequested = !!session.userId && (p.joinRequestUserIds ?? []).includes(session.userId);
                  const deadline = session.userId ? p.inviteExpiresAtByUserId?.[session.userId] : undefined;
                  const full = groupIsFull(p);
                  const guestCount = p.attendeeCount ?? p.acceptedUserIds?.length ?? 0;
                  const canRequestJoin = session.userType !== "guest" && !!session.userId && !isHost && !isInvited && !isAttending && !hasRequested;
                  return (
                    <div
                      key={p.postingId}
                      className="rd-group-list-card"
                    >
                      <div className="rd-group-list-cover">
                        {googlePlayEdition ? <GroupCoverPhoto api={api} token={session.sessionToken} postingId={p.postingId}
                          mediaId={p.photoMediaId} fallback={avatarForKey(p.postingId)} alt="Group posting" /> : <img
                          src={p.photoMediaId ? (mediaUrlById[p.photoMediaId] ?? avatarForKey(p.postingId)) : avatarForKey(p.postingId)}
                          alt="Group posting"
                        />}
                      </div>
                      <div style={{ padding: 8, display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                        <div style={{ color: "#9fb6bf", fontSize: 12 }}>
                            {p.groupStartsAtMs ? <>Starts {formatEventDate(p.groupStartsAtMs)} at {formatEventTime(p.groupStartsAtMs)}</>
                              : <>Ends {formatEventDate(p.eventStartAtMs)} at {formatEventTime(p.eventStartAtMs)}</>}
                            {p.groupOccurrenceCount ? ` · ${p.groupOccurrence} of ${p.groupOccurrenceCount}` : ""}
                            {p.groupFormat === "open-house" ? " · Open House" : ""}
                          </div>
                        <div style={{ color: "#9fb6bf", fontSize: 12 }}>Host: {displayNameForUserId(p.authorUserId)}</div>
                        <div style={{ color: "#ced3dc", fontSize: 13, whiteSpace: "pre-wrap" }}>{p.body}</div>
                        <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                            <div style={{ color: "#9fb6bf", fontSize: 12 }}>
                              {p.guestLimit ? `${guestCount} of ${p.guestLimit} guest spots filled` : `${guestCount} guests attending`}{full ? " · Full" : ""}
                            </div>
                            {isHost ? (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                                <input
                                  value={inviteTargetByEventId[p.postingId] ?? ""}
                                  onChange={(e) => setInviteTargetByEventId((prev) => ({ ...prev, [p.postingId]: e.target.value }))}
                                  placeholder="Invite user id"
                                  aria-label="Invite user ID"
                                  style={fieldStyle()}
                                />
                                <button type="button" style={buttonSecondary(false)} onClick={() => void inviteToEvent(p.postingId)}>
                                  INVITE
                                </button>
                                <label className="rd-field" style={{ gridColumn: "1 / -1" }}>
                                  <span className="rd-label">Invitation deadline</span>
                                  <input type="datetime-local" value={inviteDeadlineByEventId[p.postingId] ?? ""}
                                    onChange={e => setInviteDeadlineByEventId(prev => ({ ...prev, [p.postingId]: e.target.value }))}
                                    style={fieldStyle()} />
                                  <small>Defaults to the group end time.</small>
                                </label>
                              </div>
                            ) : null}
                            {session.userType !== "guest" && isInvited && !isAttending && !hasRequested ? (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {deadline ? <small style={{ width: "100%" }}>Respond by {formatEventDate(deadline)} at {formatEventTime(deadline)}</small> : null}
                                <button type="button" style={buttonPrimary(false)} onClick={() => void respondToInvite(p.postingId, true)}>
                                  {full ? "JOIN WAITLIST" : "ACCEPT INVITE"}
                                </button>
                                <button type="button" style={buttonSecondary(false)} onClick={() => void respondToInvite(p.postingId, false)}>
                                  DECLINE
                                </button>
                              </div>
                            ) : null}
                            {canRequestJoin ? (
                              <button type="button" style={buttonSecondary(false)} onClick={() => void requestToJoin(p.postingId)}>
                                {full ? "JOIN WAITLIST" : "REQUEST TO JOIN"}
                              </button>
                            ) : null}
                            {hasRequested ? <div style={{ color: "#b9bec9", fontSize: 12 }}>
                              {full ? "You’re on the waitlist." : "Join request pending host approval."}
                              <button type="button" className="rd-btn" onClick={() => void respondToInvite(p.postingId, false)}>Withdraw request</button>
                            </div> : null}
                            {!isHost && isAttending ? <button type="button" className="rd-btn" onClick={() => void respondToInvite(p.postingId, false)}>Leave group</button> : null}
                            <button
                              type="button"
                              style={selectedGroupId === p.postingId ? buttonPrimary(false) : buttonSecondary(false)}
                              onClick={() => setSelectedGroupId((prev) => (prev === p.postingId ? null : p.postingId))}
                            >
                              {selectedGroupId === p.postingId ? "HIDE GROUP PROFILE" : "VIEW GROUP PROFILE"}
                            </button>
                          </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rd-group-create-footer">
            {canPostEvents ? <button type="button" className="rd-btn primary" aria-haspopup="dialog" onClick={() => {
              setGroupCreateError(null);
              setGroupCreateOpen(true);
            }}>Create group</button> : <p className="rd-caption">Create an account to host a group.</p>}
          </div>
          {groupCreateOpen && canPostEvents && <Sheet title="Create group" onClose={() => {
            if (!groupSubmitting) setGroupCreateOpen(false);
          }}>
            <form className="rd-group-create-form" onSubmit={event => {
              event.preventDefault();
              void submitGroup();
            }}>
              <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Groups title" style={fieldStyle()} aria-label="Groups title" disabled={!canPostEvents} />
              <textarea value={eventBody} onChange={(e) => setEventBody(e.target.value)} placeholder="Write group details" style={{ ...fieldStyle(), minHeight: 86, resize: "vertical" }} aria-label="Groups details" disabled={!canPostEvents} />
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="rd-label" style={{ margin: 0 }}>Date</label>
                  <input
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    type="date"
                    style={fieldStyle()}
                    aria-label="Group date"
                    disabled={!canPostEvents}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                  <label style={{ display: "grid", gap: 6, flex: 1, minWidth: isMobile ? "100%" : 0 }}>
                    <span className="rd-label" style={{ margin: 0 }}>Start Time</span>
                    <input
                      value={eventStartTime}
                      onChange={(e) => setEventStartTime(e.target.value)}
                      type="time"
                      style={fieldStyle()}
                      aria-label="Group start time"
                      disabled={!canPostEvents}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6, flex: 1, minWidth: isMobile ? "100%" : 0 }}>
                    <span className="rd-label" style={{ margin: 0 }}>End Time</span>
                    <input
                      value={eventEndTime}
                      onChange={(e) => setEventEndTime(e.target.value)}
                      type="time"
                      style={fieldStyle()}
                      aria-label="Group end time"
                      disabled={!canPostEvents}
                    />
                  </label>
                </div>
                <label className="rd-field">
                  <span className="rd-label">Group format</span>
                  <select className="rd-input" value={eventGroupFormat} disabled={!canPostEvents}
                    onChange={event => setEventGroupFormat(event.target.value === "open-house" ? "open-house" : "scheduled")}>
                    <option value="scheduled">Scheduled gathering</option>
                    <option value="open-house">Open House</option>
                  </select>
                </label>
                {eventGroupFormat === "open-house" ? <small>Approved attendees can drop in between the start and end times.</small> : null}
                <label className="rd-field">
                  <span className="rd-label">Repeat</span>
                  <select className="rd-input" value={eventRepeatCount} disabled={!canPostEvents}
                    onChange={event => setEventRepeatCount(Number(event.target.value))}>
                    <option value={1}>One time</option>
                    {Array.from({ length: MAX_GROUP_OCCURRENCES - 1 }, (_, index) => index + 2).map(count =>
                      <option key={count} value={count}>Weekly · {count} gatherings</option>)}
                  </select>
                </label>
                <label className="rd-field">
                  <span className="rd-label">Guest limit</span>
                  <input type="number" min="1" step="1" value={eventGuestLimit}
                    onChange={event => setEventGuestLimit(event.target.value)} style={fieldStyle()} disabled={!canPostEvents} />
                  <small>Enter the number of guests, excluding the host.</small>
                </label>
                <textarea
                  value={eventGroupDetails}
                  onChange={(e) => setEventGroupDetails(e.target.value)}
                  placeholder="Detailed group profile description"
                  style={{ ...fieldStyle(), minHeight: 74, resize: "vertical" }}
                  aria-label="Group details"
                  disabled={!canPostEvents}
                />
                <textarea
                  value={eventLocationInstructions}
                  onChange={(e) => setEventLocationInstructions(e.target.value)}
                  placeholder="Location instructions (shown only to attendees). Group stays fixed at creation location."
                  style={{ ...fieldStyle(), minHeight: 68, resize: "vertical" }}
                  aria-label="Location instructions"
                  disabled={!canPostEvents}
                />
              </div>
              {googlePlayEdition && <label className="rd-field"><span>Group photo</span>
                <select className="rd-input" value={eventPhotoMediaId} onChange={event => setEventPhotoMediaId(event.target.value)}>
                  <option value="">No photo</option>
                  {approvedGroupPhotos.map((id, index) => <option key={id} value={id}>Approved photo {index + 1}</option>)}
                </select>
                <small>{groupPhotoError || "Submit group photos for review in Settings → Profile."}</small>
              </label>}
              {googlePlayEdition && eventPhotoMediaId && <GroupCoverPhoto api={api} token={session.sessionToken}
                postingId="" mediaId={eventPhotoMediaId} fallback={avatarForKey(session.userId ?? "group")} alt="Selected group photo"
                style={{ width: "100%", maxWidth: 240, aspectRatio: "1 / 1", objectFit: "cover" }} preview />}
              {!googlePlayEdition && <div style={{ display: "grid", gap: 8 }}>
                <input className="rd-input" type="file" accept="image/*" onChange={(e) => setEventPhotoFile(e.target.files?.[0] ?? null)} disabled={!canPostEvents} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => void uploadGridPhoto("event")} style={canPostEvents ? buttonSecondary(isUploading) : buttonSecondary(true)} disabled={!canPostEvents || isUploading}>
                    {isUploading ? "UPLOADING..." : "UPLOAD PHOTO"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEventPhotoMediaId("");
                      setEventPhotoFile(null);
                    }}
                    style={buttonSecondary(false)}
                  >
                    CLEAR PHOTO
                  </button>
                </div>
                {eventPhotoMediaId ? (
                  <img
                    src={mediaUrlById[eventPhotoMediaId] ?? avatarForKey(eventPhotoMediaId)}
                    alt="Group photo preview"
                    style={{ width: "100%", maxWidth: 240, aspectRatio: "1 / 1", objectFit: "cover", border: "1px solid rgba(255,58,77,0.4)" }}
                  />
                ) : null}
                {!eventPhotoMediaId && eventPhotoFile ? <div style={{ color: "#b9bec9", fontSize: 12 }}>Photo selected. Upload to attach.</div> : null}
              </div>}
              {groupCreateError && <p className="rd-error" role="alert">{groupCreateError}</p>}
              <button type="submit" className="rd-btn primary" disabled={groupSubmitting || isUploading}>
                {groupSubmitting ? "Creating…" : "Create group"}
              </button>
            </form>
          </Sheet>}
      </section>
    );
  };

  const spotsPanel = selectedSpot ? (
    <div
      style={{
        display: "grid",
        gap: 0,
        minHeight: isMobile ? "calc(100dvh - 150px)" : undefined,
        marginInline: 0,
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
          readReceipts={hasPlus(session)}
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
                      style={{ width: "100%", height: "100%", borderRadius: 0, objectFit: "cover", border: "none" }}
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

  if (isMobile && screen === "ads") {
    const profileForBoardUser = boardProfileUserId ? publicProfilesByUserId[boardProfileUserId] ?? null : null;
    const boardUserKey = boardProfileUserId ? chatKeyFromProfileUserId(boardProfileUserId) : "";
    const boardUserPresence = boardUserKey ? presenceByKey[boardUserKey] : null;
    const boardDistance =
      selfCoords && boardUserPresence
        ? formatDistanceLabel(distanceMeters(selfCoords, boardUserPresence))
        : "-";

    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div className="rd-board-panel">
          {classifiedsHeading}
          {postingToolbar}
          <div className="rd-board-feed">
            {adBoardRows.length === 0 ? (
              <p className="rd-caption">No recent posts.</p>
            ) : (
              adBoardRows.map((row) => {
                const profile = publicProfilesByUserId[row.authorUserId];
                const actorKey = chatKeyFromProfileUserId(row.authorUserId);
                const posterName = displayNameForUserId(row.authorUserId);
                return (
                  <div key={row.authorUserId} style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 10, alignItems: "start" }}>
                    <button
                      type="button"
                      onClick={() => setBoardProfileUserId(row.authorUserId)}
                      style={{ border: 0, background: "transparent", padding: 0, width: 48, height: 48, borderRadius: "50%", overflow: "hidden", cursor: "pointer" }}
                      aria-label="Open poster profile"
                    >
                      <img
                        src={!googlePlayEdition && profile?.mainPhotoMediaId ? (mediaUrlById[profile.mainPhotoMediaId] ?? avatarForKey(actorKey)) : avatarForKey(actorKey)}
                        alt="Poster profile"
                        style={{ width: "100%", height: "100%", objectFit: "cover", border: "2px solid rgba(108,150,255,0.8)", borderRadius: "50%" }}
                      />
                    </button>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#c9b7bf", fontSize: 11, minWidth: 0 }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{posterName}</span>
                        <span style={{ whiteSpace: "nowrap", fontStyle: "italic", flexShrink: 0 }}>
                          {formatRelativeTime(row.latestAtMs)}
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
                          <strong>{bubble.title}</strong>
                          {isClassifiedCategory(bubble.board) && <div className="rd-caption">{CLASSIFIED_CATEGORIES[bubble.board]}</div>}
                          {bubble.availability ? <span className="rd-posting-availability">{POSTING_AVAILABILITY[bubble.availability]}</span> : null}
                          {bubble.body ? <div>{bubble.body}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        {adultPreviews}
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
                {!googlePlayEdition && <div>Position: {profileForBoardUser?.stats?.position ?? "-"}</div>}
                <ProfileDetailsView stats={profileForBoardUser?.stats} />
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
            {ads.length === 0 ? <p className="rd-caption">No posts yet.</p> : null}
            {ads.map((p) => (
              <button
                key={p.postingId}
                type="button"
                onClick={() => setSelectedAdId(p.postingId)}
                style={{ border: "1px solid rgba(255,58,77,0.35)", background: selectedAdId === p.postingId ? "rgba(255,32,48,0.08)" : "rgba(0,0,0,0.5)", padding: 0, color: "#fff", cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                  <img src={p.photoMediaId ? (mediaUrlById[p.photoMediaId] ?? avatarForUserId(p.authorUserId)) : avatarForUserId(p.authorUserId)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", border: "none" }} />
                </div>
                <div style={{ padding: 8, display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <div className="rd-posting-byline">
                    <img src={avatarForUserId(p.authorUserId)} alt="" />
                    <span>{displayNameForUserId(p.authorUserId)}</span>
                  </div>
                  {isClassifiedCategory(p.board) && <span className="rd-caption">{CLASSIFIED_CATEGORIES[p.board]}</span>}
                  {p.availability ? <span className="rd-posting-availability">{POSTING_AVAILABILITY[p.availability]}</span> : null}
                </div>
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="rd-board-panel">{classifiedsHeading}{postingToolbar}</div>
            {selectedAd ? (
              <div style={{ ...cardStyle(), display: "grid", gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedAd.title}</div>
                <div className="rd-posting-byline"><img src={avatarForUserId(selectedAd.authorUserId)} alt="" />{displayNameForUserId(selectedAd.authorUserId)}</div>
                {selectedAd.availability ? <span className="rd-posting-availability">{POSTING_AVAILABILITY[selectedAd.availability]}</span> : null}
                <div style={{ color: "#ced3dc", whiteSpace: "pre-wrap", fontSize: 14 }}>{selectedAd.body}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Ad favoriting is available from profile actions.")}>FAVORITE</button>
                  <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Ad blocking is available from profile actions.")}>BLOCK</button>
                  <button type="button" style={buttonSecondary(false)} onClick={() => setLastError("Thanks. Report logged for admin review.")}>REPORT</button>
                  <button type="button" style={buttonPrimary(false)} onClick={() => void loadAdThread(selectedAd)}>CHAT</button>
                </div>
                {adThreadLoading ? <div style={{ color: "#9fb6bf", fontSize: 13 }}>Loading chat...</div> : null}
                <ChatWindow
          readReceipts={hasPlus(session)}
                  chatKind={postingChatKind}
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
            {adultPreviews}
          </div>
        </div>
      );
    }
    if (screen === "cruise") return (
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
                <img src={spot.photoMediaId ? (mediaUrlById[spot.photoMediaId] ?? avatarForKey(spot.spotId)) : avatarForKey(spot.spotId)} alt="Cruising spot" style={{ width: "100%", height: "100%", objectFit: "cover", border: "none" }} />
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
    <div style={{ display: "grid", gap: 8, marginInline: 0 }}>
      {screen === "groups" ? groupsPanel() : null}
      {screen === "groups" && selectedGroup ? (
        <div style={{ border: "1px solid rgba(63,223,255,0.45)", background: "rgba(0,0,0,0.45)", padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedGroup.title}</div>
            {selectedGroup.groupFormat === "open-house" ? <p>Open House. Approved attendees can drop in during the listed hours.</p> : null}
            {selectedGroup.authorUserId === session.userId ? (
              <button type="button" className="rd-btn" onClick={() => confirmGroupAction(selectedGroup.postingId)}>Cancel gathering</button>
            ) : null}
            <div style={{ color: "#9fb6bf", fontSize: 13 }}>
              {selectedGroup.groupStartsAtMs ? <div>Starts {formatEventDate(selectedGroup.groupStartsAtMs)} at {formatEventTime(selectedGroup.groupStartsAtMs)}</div> : null}
              Ends {formatEventDate(selectedGroup.eventStartAtMs)} at {formatEventTime(selectedGroup.eventStartAtMs)}
            </div>
            <div style={{ color: "#9fb6bf", fontSize: 13 }}>Host: {displayNameForUserId(selectedGroup.authorUserId)}</div>
          </div>
          {googlePlayEdition ? <GroupCoverPhoto api={api} token={session.sessionToken} postingId={selectedGroup.postingId}
            mediaId={selectedGroup.photoMediaId} fallback={avatarForKey(selectedGroup.postingId)} alt="Group photo"
            style={{ width: "100%", maxHeight: 280, objectFit: "cover" }} /> : <img
            src={selectedGroup.photoMediaId ? (mediaUrlById[selectedGroup.photoMediaId] ?? avatarForKey(selectedGroup.postingId)) : avatarForKey(selectedGroup.postingId)}
            alt="Group photo"
            style={{ width: "100%", maxHeight: 280, objectFit: "cover", border: "1px solid rgba(63,223,255,0.55)" }}
          />}
          {googlePlayEdition && selectedGroup.photoMediaId && selectedGroup.authorUserId !== session.userId &&
            <ReportProfileMediaButton key={selectedGroup.photoMediaId} api={api} session={session}
              mediaId={selectedGroup.photoMediaId} video={false}
              reportPath={`/public-postings/event/${encodeURIComponent(selectedGroup.postingId)}/photo/report`} />}
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
          {userCanSeeLocationInstructions(selectedGroup) ? (
            <GroupDiscussion key={`${session.userId}:${selectedGroup.postingId}`} api={api} session={session}
              postingId={selectedGroup.postingId} displayNameForUserId={displayNameForUserId} />
          ) : null}
          {session.userId === selectedGroup.authorUserId && (selectedGroup.joinRequestUserIds?.length ?? 0) > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: "#9fb6bf" }}>{groupIsFull(selectedGroup) ? "Waitlist · Group is full" : "Pending join requests"}</div>
              {(selectedGroup.joinRequestUserIds ?? []).map((userId) => (
                <div key={userId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#d2d8e2", fontSize: 14 }}>{displayNameForUserId(userId)}</div>
                  <button type="button" disabled={groupIsFull(selectedGroup)} style={buttonPrimary(groupIsFull(selectedGroup))} onClick={() => void respondToJoinRequest(selectedGroup.postingId, userId, true)}>
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
                  {idx !== 0 && selectedGroup.authorUserId === session.userId ? (
                    <button type="button" className="rd-btn" aria-label={`Remove ${displayNameForUserId(userId)}`}
                      onClick={() => confirmGroupAction(selectedGroup.postingId, userId)}>Remove</button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {groupAction ? <Sheet title={groupAction.attendeeId ? "Remove attendee" : "Cancel gathering"}
        onClose={() => { if (!groupActionBusy) setGroupAction(null); }}>
        <p>{groupAction.attendeeId
          ? "This attendee will lose access to the private address and discussion. Their spot will open for another guest."
          : "This date will be removed and its private discussion will close. Other dates in the series will remain available."}</p>
        <div className="rd-row">
          <button type="button" className="rd-btn" disabled={groupActionBusy} onClick={() => setGroupAction(null)}>Go back</button>
          <button type="button" className="rd-btn primary" disabled={groupActionBusy} onClick={() => void applyGroupAction()}>
            {groupAction.attendeeId ? "Confirm removal" : "Confirm cancellation"}
          </button>
        </div>
        {groupActionError ? <p role="alert">{groupActionError}</p> : null}
      </Sheet> : null}
      {screen === "cruise" ? spotsPanel : null}
      {screen === "groups" && session.userType !== "guest" && eventInvites.length > 0 ? (
        <div style={{ border: "1px solid rgba(255,58,77,0.25)", display: "grid", gap: 8, padding: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>GROUP INVITES</div>
          {eventInvites.map((event) => (
            <div key={event.postingId} style={{ display: "grid", gap: 6, border: "1px solid rgba(255,58,77,0.4)", borderRadius: 10, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>{event.title}</div>
              <div style={{ color: "#b9bec9", fontSize: 13 }}>Host: {displayNameForUserId(event.authorUserId)}</div>
              {session.userId && event.inviteExpiresAtByUserId?.[session.userId] ? (
                <small>Respond by {formatEventDate(event.inviteExpiresAtByUserId[session.userId])} at {formatEventTime(event.inviteExpiresAtByUserId[session.userId])}</small>
              ) : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={buttonPrimary(false)} onClick={() => void respondToInvite(event.postingId, true)}>{groupIsFull(event) ? "JOIN WAITLIST" : "ACCEPT"}</button>
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
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 1)} aria-label="Rate 1 out of 5"><Icon name="star" />1</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 2)} aria-label="Rate 2 out of 5"><Icon name="star" />2</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 3)} aria-label="Rate 3 out of 5"><Icon name="star" />3</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 4)} aria-label="Rate 4 out of 5"><Icon name="star" />4</button>
                <button type="button" style={buttonSecondary(false)} onClick={() => void rate(s.submissionId, 5)} aria-label="Rate 5 out of 5"><Icon name="star" />5</button>
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
    member?: PublicMember;
    age: number;
    bio: string;
    stats?: ProfileDetails & {
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
  const myActorKey = actorKey(session);
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
      if(!document.hidden) void api.markChatRead(session.sessionToken, "date", threadKey).catch(() => {});
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
                <img src={avatarUrlByUserId[listing.userId] ?? avatarForKey(`user:${listing.userId}`)} alt={`${listing.displayName} profile`} style={{ width: "100%", height: "100%", objectFit: "cover", border: "none" }} />
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
              <div style={{ color: "#ff7a88", fontSize: 13 }}>{status}</div>
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
          readReceipts={hasPlus(session)}
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
          <div style={{ color: "#ff7a88", fontSize: 13 }}>{status}</div>
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
                  style={{ width: 72, height: 72, borderRadius: 6, objectFit: "cover", border: "1px solid rgba(255,122,136,0.9)" }}
                />
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{listing.title}</div>
                  <div style={{ color: "#ff7a88", fontSize: 13 }}>{listing.displayName}</div>
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
            {!googlePlayEdition && <div style={{ color: "#ced3dc", marginTop: 2 }}>Cock Size: {selectedProfile.stats?.cockSizeInches ?? "-"}</div>}
            {!googlePlayEdition && <div style={{ color: "#ced3dc", marginTop: 2 }}>Cut / Uncut: {selectedProfile.stats?.cutStatus ?? "-"}</div>}
            {!googlePlayEdition && <div style={{ color: "#ced3dc", marginTop: 2 }}>Position: {selectedProfile.stats?.position ?? "-"}</div>}
            <ProfileDetailsView stats={selectedProfile.stats} />
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
    lookingForMore: "",
    details: {}
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
    lookingForMore: parsedBio.lookingForMore,
    details: parseProfileDetails(profile.stats)
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
          background: "#0e0e10"
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

function SettingsProfile({ api, session, setLastError, section }: Readonly<{ api: Api; session: Session; setLastError(value: string | null): void; section: "profile" | "photos" }>): React.ReactElement {
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
        displayName: session.userType === "guest" ? "Anon" : draft.displayName,
        age: Math.trunc(ageNum),
        bio: mergedBio,
        stats: {
          ...parseProfileDetails(draft.details),
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
    <div className="rd-profile-settings-stack">
      {section === "photos" && status && <p className="rd-caption" role="status">{status}</p>}

      {section === "photos" && <section className="rd-card rd-settings-body">
        <div style={{ display: "grid", gap: 12 }}>
          <h2>Profile media</h2>
          <div style={{ color: "#b9bec9", fontSize: 14 }}>Upload and manage your photos and video.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,58,77,0.45)", background: "rgba(0,0,0,0.42)" }}>
              <StyledFilePicker
                label="Main Photo"
                accept="image/*"
                file={mainFile}
                inputRef={mainFileInputRef}
                disabled={saving}
                onSelect={setMainFile}
              />
              <button type="button" className="rd-btn primary" disabled={saving} onClick={() => void upload("photo_main", mainFile)}>
                Upload main photo
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
              <button type="button" className="rd-btn primary" disabled={saving} onClick={() => void upload("photo_gallery", galleryFile)}>
                Upload gallery photo
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
              <button type="button" className="rd-btn primary" disabled={saving} onClick={() => { if (!hasPlus(session)) { if (!session.userId) setLastError("Create an account to upload a profile video."); else openPlus("profile"); return; } void upload("video", videoFile); }}>
                {hasPlus(session) ? "Upload video" : session.freePlus === false ? "Unlock profile video with Plus" : "Create an account to upload video"}
              </button>
            </div>
          </div>
          <div style={{ color: "#b9bec9", fontSize: 13 }}>Gallery: {galleryIds.length} / {limits(session).gallery} photos</div>
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
      </section>}

      {section === "profile" && <section className="rd-card rd-settings-body">
        <div style={{ display: "grid", gap: 12 }}>
          <h2>About you</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="rd-label">Display Name</span>
              <input value={session.userType === "guest" ? "Anon" : draft.displayName} readOnly={session.userType === "guest"} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} style={fieldStyle()} />
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
      </section>}

      {section === "profile" && <section className="rd-card rd-settings-body">
        <div style={{ display: "grid", gap: 12 }}>
          <h2>Profile details</h2>
          <ProfileDetailsEditor value={draft.details} onChange={details => setDraft(d => ({ ...d, details }))} />
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
            {!googlePlayEdition && <><label style={{ display: "grid", gap: 6 }}>
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
            </label></>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={draft.discreetMode} onChange={(e) => setDraft((d) => ({ ...d, discreetMode: e.target.checked }))} />
              <span className="rd-label" style={{ margin: 0 }}>Discreet Mode</span>
            </label>
          </div>
          <div style={{ color: "#b9bec9", fontSize: 13 }}>Travel mode is controlled from the Discover map via the <Icon name="travel" /> picker.</div>
        </div>
      </section>}

      {section === "profile" && <MemberProfileLinks api={api} session={session} />}
      {section === "profile" && <section className="rd-card rd-settings-body">
        <div style={{ display: "grid", gap: 10 }}>
          {status && <p className="rd-caption" role="status">{status}</p>}
          {session.userType === "guest" ? (
            <div style={{ color: "#b9bec9", fontSize: 13 }}>
              Guest profile data is temporary and clears on logout.
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void saveProfile()} className="rd-btn primary" disabled={saving}>
              Save profile
            </button>
            <button type="button" onClick={() => void refreshProfile()} className="rd-btn" disabled={loading}>
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowMyProfile((v) => !v)}
              className="rd-btn"
              disabled={!profile}
            >
              {showMyProfile ? "Hide my profile" : "View my profile"}
            </button>
          </div>
        </div>
      </section>}
      {section === "profile" && showMyProfile && profile ? (
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
                {!googlePlayEdition && <div style={{ color: "#ced3dc", fontSize: 14 }}>Cock Size: {profile.stats.cockSizeInches ?? "-"}</div>}
                {!googlePlayEdition && <div style={{ color: "#ced3dc", fontSize: 14 }}>Cut / Uncut: {profile.stats.cutStatus ?? "-"}</div>}
                {!googlePlayEdition && <div style={{ color: "#ced3dc", fontSize: 14 }}>Position: {profile.stats.position ?? "-"}</div>}
                <ProfileDetailsView stats={profile.stats} />
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
  const [status, setStatus] = useState<string>("Loading settings...");
  const [blockedUsers, setBlockedUsers] = useState<ReadonlyArray<string>>([]);
  const [adminStatus, setAdminStatus] = useState<string>("");
  const [adminBusy, setAdminBusy] = useState<boolean>(false);
  const [adminUsers, setAdminUsers] = useState<ReadonlyArray<AdminUserSummary>>([]);
  const [adminSpots, setAdminSpots] = useState<ReadonlyArray<CruisingSpot>>([]);
  const [adminPostings, setAdminPostings] = useState<ReadonlyArray<PublicPosting>>([]);
  const [adminSubmissions, setAdminSubmissions] = useState<ReadonlyArray<Submission>>([]);
  const [adminCreateUserEmail, setAdminCreateUserEmail] = useState<string>("");
  const [adminCreateUserPassword, setAdminCreateUserPassword] = useState<string>("");
  const [adminCreateUserPhone, setAdminCreateUserPhone] = useState<string>("");
  const [adminCreateUserType, setAdminCreateUserType] = useState<"registered" | "subscriber">("registered");
  const [adminCreateUserTier, setAdminCreateUserTier] = useState<"free" | "premium">("free");
  const [adminCreateUserRole, setAdminCreateUserRole] = useState<"user" | "admin">("user");
  const [adminCreateProfileDisplayName, setAdminCreateProfileDisplayName] = useState<string>("");
  const [adminCreateProfileAge, setAdminCreateProfileAge] = useState<string>("");
  const [adminCreateProfileBio, setAdminCreateProfileBio] = useState<string>("");
  const [adminCreateProfileHeightInches, setAdminCreateProfileHeightInches] = useState<string>("");
  const [adminCreateProfileWeightLbs, setAdminCreateProfileWeightLbs] = useState<string>("");
  const [adminCreateProfileRace, setAdminCreateProfileRace] = useState<string>("");
  const [adminCreateProfileCockSizeInches, setAdminCreateProfileCockSizeInches] = useState<string>("");
  const [adminCreateProfileCutStatus, setAdminCreateProfileCutStatus] = useState<"" | ProfileCutStatus>("");
  const [adminCreateProfilePosition, setAdminCreateProfilePosition] = useState<"" | ProfilePosition>("");
  const [adminCreateProfileDiscreetMode, setAdminCreateProfileDiscreetMode] = useState<boolean>(false);
  const [adminCreateMainPhotoFile, setAdminCreateMainPhotoFile] = useState<File | null>(null);
  const [adminCreateGalleryPhotoFiles, setAdminCreateGalleryPhotoFiles] = useState<ReadonlyArray<File>>([]);
  const [adminCreateVideoFile, setAdminCreateVideoFile] = useState<File | null>(null);
  const [adminCreatedUserId, setAdminCreatedUserId] = useState<string | null>(null);
  const [adminPendingUserPlacement, setAdminPendingUserPlacement] = useState<{
    userId: string;
    displayName: string;
    position: { lat: number; lng: number };
  } | null>(null);

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
        googlePlayEdition ? Promise.resolve({ spots: [] }) : api.adminListCruisingSpots(session.sessionToken),
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
      await api.getMyProfile(session.sessionToken);
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

  async function adminCreateUserAndProfile(): Promise<void> {
    if (!adminCreateUserEmail.trim() || !adminCreateUserPassword.trim() || !adminCreateProfileDisplayName.trim()) {
      setAdminStatus("Email, password, and display name are required.");
      return;
    }
    
    // Get admin's current location
    if (!("geolocation" in navigator)) {
      setAdminStatus("Geolocation not available.");
      return;
    }
    
    setAdminBusy(true);
    setAdminStatus("Getting your location...");
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        });
      });
      
      const adminLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      
      // Create pending user state for placement
      setAdminPendingUserPlacement({
        userId: `pending-${Date.now()}`,
        displayName: adminCreateProfileDisplayName.trim(),
        position: adminLocation
      });
      
      setAdminStatus("Position the user on the map and confirm placement.");
    } catch (e) {
      setAdminStatus("Failed to get your location. Please check location permissions.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function adminConfirmUserPlacement(): Promise<void> {
    if (!adminPendingUserPlacement) return;
    
    setAdminBusy(true);
    setAdminStatus("Creating user and profile...");
    
    try {
      // Create the user
      const userResult = await api.adminCreateUser(session.sessionToken, {
        email: adminCreateUserEmail.trim(),
        password: adminCreateUserPassword.trim(),
        phoneE164: adminCreateUserPhone.trim() || undefined,
        userType: adminCreateUserType,
        tier: adminCreateUserTier,
        role: adminCreateUserRole
      });
      
      const userId = userResult.user.id;
      setAdminCreatedUserId(userId);
      
      // Upload photos if provided
      let mainPhotoMediaId: string | undefined;
      let galleryMediaIds: string[] = [];
      
      if (adminCreateMainPhotoFile) {
        try {
          const initiated = await api.initiateMediaUpload(session.sessionToken, {
            kind: "photo_main",
            mimeType: adminCreateMainPhotoFile.type || "image/jpeg",
            sizeBytes: adminCreateMainPhotoFile.size,
            targetUserId: userId
          });
          
          const handledLocally = await uploadToLocalSignedUrl(initiated.uploadUrl, adminCreateMainPhotoFile, adminCreateMainPhotoFile.type || "image/jpeg");
          if (!handledLocally) {
            const uploadRes = await fetch(initiated.uploadUrl, {
              method: "PUT",
              headers: { "content-type": adminCreateMainPhotoFile.type || "image/jpeg" },
              body: adminCreateMainPhotoFile
            });
            if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
          }
          
          await api.completeMediaUpload(session.sessionToken, initiated.mediaId);
          mainPhotoMediaId = initiated.mediaId;
        } catch (e) {
          console.warn("Failed to upload main photo:", e);
        }
      }
      
      // Upload gallery photos
      for (const file of adminCreateGalleryPhotoFiles) {
        try {
          const initiated = await api.initiateMediaUpload(session.sessionToken, {
            kind: "photo_gallery",
            mimeType: file.type || "image/jpeg",
            sizeBytes: file.size,
            targetUserId: userId
          });
          
          const handledLocally = await uploadToLocalSignedUrl(initiated.uploadUrl, file, file.type || "image/jpeg");
          if (!handledLocally) {
            const uploadRes = await fetch(initiated.uploadUrl, {
              method: "PUT",
              headers: { "content-type": file.type || "image/jpeg" },
              body: file
            });
            if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
          }
          
          await api.completeMediaUpload(session.sessionToken, initiated.mediaId);
          galleryMediaIds.push(initiated.mediaId);
        } catch (e) {
          console.warn("Failed to upload gallery photo:", e);
        }
      }
      
      // Create the profile with location
      const age = parseInt(adminCreateProfileAge.trim()) || 25;
      
      const profileData: any = {
        displayName: adminCreateProfileDisplayName.trim(),
        age,
        bio: adminCreateProfileBio.trim() || "",
        stats: {}
      };
      
      // Add physical stats
      if (adminCreateProfileHeightInches.trim()) {
        profileData.stats.heightInches = parseInt(adminCreateProfileHeightInches.trim());
      }
      if (adminCreateProfileWeightLbs.trim()) {
        profileData.stats.weightLbs = parseInt(adminCreateProfileWeightLbs.trim());
      }
      if (adminCreateProfileRace.trim()) {
        profileData.stats.race = adminCreateProfileRace.trim();
      }
      if (adminCreateProfileCockSizeInches.trim()) {
        profileData.stats.cockSizeInches = parseFloat(adminCreateProfileCockSizeInches.trim());
      }
      if (adminCreateProfileCutStatus) {
        profileData.stats.cutStatus = adminCreateProfileCutStatus;
      }
      if (adminCreateProfilePosition) {
        profileData.stats.position = adminCreateProfilePosition;
      }
      profileData.discreetMode = adminCreateProfileDiscreetMode;
      
      if (mainPhotoMediaId) {
        profileData.mainPhotoMediaId = mainPhotoMediaId;
      }
      
      if (galleryMediaIds.length > 0) {
        profileData.galleryMediaIds = galleryMediaIds;
      }
      
      // Set travel mode to the confirmed position
      profileData.travelMode = {
        enabled: true,
        lat: adminPendingUserPlacement.position.lat,
        lng: adminPendingUserPlacement.position.lng
      };
      
      await api.adminUpsertProfile(session.sessionToken, userId, profileData);
      
      // Reset form
      setAdminCreateUserEmail("");
      setAdminCreateUserPassword("");
      setAdminCreateUserPhone("");
      setAdminCreateUserType("registered");
      setAdminCreateUserTier("free");
      setAdminCreateUserRole("user");
      setAdminCreateProfileDisplayName("");
      setAdminCreateProfileAge("");
      setAdminCreateProfileBio("");
      setAdminCreateProfileHeightInches("");
      setAdminCreateProfileWeightLbs("");
      setAdminCreateProfileRace("");
      setAdminCreateProfileCockSizeInches("");
      setAdminCreateProfileCutStatus("");
      setAdminCreateProfilePosition("");
      setAdminCreateProfileDiscreetMode(false);
      setAdminCreateMainPhotoFile(null);
      setAdminCreateGalleryPhotoFiles([]);
      setAdminCreateVideoFile(null);
      setAdminPendingUserPlacement(null);
      
      await refreshAdmin();
      setAdminStatus(`User and profile created successfully. User ID: ${userId}`);
    } catch (e) {
      const msg = normalizeErrorMessage(e);
      setAdminStatus(msg);
      setLastError(msg);
    } finally {
      setAdminBusy(false);
    }
  }

  function adminCancelUserPlacement(): void {
    setAdminPendingUserPlacement(null);
    setAdminStatus("User creation cancelled.");
  }

  function adminUpdatePendingUserPosition(position: { lat: number; lng: number }): void {
    if (adminPendingUserPlacement) {
      setAdminPendingUserPlacement({
        ...adminPendingUserPlacement,
        position
      });
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle()}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>SETTINGS</div>
          <div style={{ color: "#b9bec9", fontSize: 14 }}>{status}</div>
          <div style={{ color: "#b9bec9", fontSize: 13 }}>Manage your session and account controls.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

            {!googlePlayEdition && <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>PENDING CRUISE SPOTS</div>
              {adminSpots.filter((spot) => spot.moderationStatus === "pending").slice(0, 10).map((spot) => (
                <div key={spot.spotId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ color: "#ced3dc", fontSize: 13 }}>{spot.name}</div>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSpot(spot.spotId, "approve")}>APPROVE</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSpot(spot.spotId, "reject")}>REJECT</button>
                  <button type="button" style={buttonSecondary(adminBusy)} disabled={adminBusy} onClick={() => void moderateSpot(spot.spotId, "delete")}>DELETE</button>
                </div>
              ))}
            </div>}

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

            <div style={{ display: "grid", gap: 6 }}>
              <CustomerImport api={api} session={session} />
              <div style={{ fontSize: 15, fontWeight: 700 }}>CREATE USER & PROFILE</div>
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Email</span>
                  <input
                    type="email"
                    value={adminCreateUserEmail}
                    onChange={(e) => setAdminCreateUserEmail(e.target.value)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    placeholder="user@example.com"
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Password</span>
                  <input
                    type="password"
                    value={adminCreateUserPassword}
                    onChange={(e) => setAdminCreateUserPassword(e.target.value)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    placeholder="password123"
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Phone (optional)</span>
                  <input
                    type="tel"
                    value={adminCreateUserPhone}
                    onChange={(e) => setAdminCreateUserPhone(e.target.value)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    placeholder="+15551234567"
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>User Type</span>
                    <select
                      value={adminCreateUserType}
                      onChange={(e) => setAdminCreateUserType(e.target.value as "registered" | "subscriber")}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    >
                      <option value="registered">Registered</option>
                      <option value="subscriber">Subscriber</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>Tier</span>
                    <select
                      value={adminCreateUserTier}
                      onChange={(e) => setAdminCreateUserTier(e.target.value as "free" | "premium")}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    >
                      <option value="free">Free</option>
                      <option value="premium">Premium</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Role</span>
                  <select
                    value={adminCreateUserRole}
                    onChange={(e) => setAdminCreateUserRole(e.target.value as "user" | "admin")}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Display Name</span>
                  <input
                    type="text"
                    value={adminCreateProfileDisplayName}
                    onChange={(e) => setAdminCreateProfileDisplayName(e.target.value)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    placeholder="John Doe"
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Age</span>
                  <input
                    type="number"
                    value={adminCreateProfileAge}
                    onChange={(e) => setAdminCreateProfileAge(e.target.value)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    placeholder="25"
                    min="18"
                    max="120"
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Bio (optional)</span>
                  <textarea
                    value={adminCreateProfileBio}
                    onChange={(e) => setAdminCreateProfileBio(e.target.value)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff", minHeight: 60 }}
                    placeholder="Tell us about yourself..."
                    maxLength={280}
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>Height (in)</span>
                    <input
                      type="number"
                      value={adminCreateProfileHeightInches}
                      onChange={(e) => setAdminCreateProfileHeightInches(e.target.value)}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                      placeholder="70"
                      min="48"
                      max="96"
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>Weight (lbs)</span>
                    <input
                      type="number"
                      value={adminCreateProfileWeightLbs}
                      onChange={(e) => setAdminCreateProfileWeightLbs(e.target.value)}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                      placeholder="180"
                      min="80"
                      max="400"
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>Race</span>
                    <input
                      type="text"
                      value={adminCreateProfileRace}
                      onChange={(e) => setAdminCreateProfileRace(e.target.value)}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                      placeholder="White"
                    />
                  </label>
                  {!googlePlayEdition && <><label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>Cock Size (in)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={adminCreateProfileCockSizeInches}
                      onChange={(e) => setAdminCreateProfileCockSizeInches(e.target.value)}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                      placeholder="7.5"
                      min="3"
                      max="12"
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>Cut / Uncut</span>
                    <select
                      value={adminCreateProfileCutStatus}
                      onChange={(e) => setAdminCreateProfileCutStatus(e.target.value as "" | ProfileCutStatus)}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    >
                      <option value="">Select</option>
                      <option value="cut">Cut</option>
                      <option value="uncut">Uncut</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, color: "#b9bec9" }}>Position</span>
                    <select
                      value={adminCreateProfilePosition}
                      onChange={(e) => setAdminCreateProfilePosition(e.target.value as "" | ProfilePosition)}
                      style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                    >
                      <option value="">Select</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                      <option value="side">Side</option>
                    </select>
                  </label></>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={adminCreateProfileDiscreetMode}
                      onChange={(e) => setAdminCreateProfileDiscreetMode(e.target.checked)}
                    />
                    <span style={{ fontSize: 13, color: "#b9bec9", margin: 0 }}>Discreet Mode</span>
                  </label>
                </div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Main Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAdminCreateMainPhotoFile(e.target.files?.[0] || null)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Gallery Photos</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setAdminCreateGalleryPhotoFiles(Array.from(e.target.files || []))}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "#b9bec9" }}>Video (optional)</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setAdminCreateVideoFile(e.target.files?.[0] || null)}
                    style={{ padding: 8, border: "1px solid #444", borderRadius: 4, background: "#2a2d32", color: "#fff" }}
                  />
                </label>
                <button
                  type="button"
                  style={buttonSecondary(adminBusy)}
                  disabled={adminBusy}
                  onClick={() => void adminCreateUserAndProfile()}
                >
                  CREATE USER & POSITION ON MAP
                </button>
              </div>
            </div>

            {adminPendingUserPlacement && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>POSITION USER ON MAP</div>
                <div style={{ color: "#b9bec9", fontSize: 13 }}>
                  Drag the marker to position the user, then confirm placement.
                </div>
                <div style={{ height: 400, border: "1px solid #444", borderRadius: 4, overflow: "hidden" }}>
                  <MapView
                    initialView={{
                      center: adminPendingUserPlacement.position,
                      zoom: 15
                    }}
                    markers={[{
                      id: adminPendingUserPlacement.userId,
                      position: adminPendingUserPlacement.position,
                      color: "#C00000",
                      draggable: true,
                      onDragEnd: adminUpdatePendingUserPosition
                    }]}
                    visible={true}
                    onMapClick={() => {}}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: 8 }}>
                  <button
                    type="button"
                    style={buttonPrimary(adminBusy)}
                    disabled={adminBusy}
                    onClick={() => void adminConfirmUserPlacement()}
                  >
                    {adminBusy ? "CREATING..." : "CONFIRM PLACEMENT & CREATE USER"}
                  </button>
                  <button
                    type="button"
                    style={buttonSecondary(adminBusy)}
                    disabled={adminBusy}
                    onClick={() => void adminCancelUserPlacement()}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile", icon: "grid" },
  { id: "photos", label: "Photos", icon: "photo" },
  { id: "privacy", label: "Privacy", icon: "shield" },
  { id: "plan", label: "Plan", icon: "plus" }
] as const;
type SettingsSection = typeof SETTINGS_SECTIONS[number]["id"];

export function Router({
  api,
  session,
  setSession,
  settings,
  activeTab,
  setActiveTab,
  discoverScreen,
  mapControls,
  discoverFilter,
  busy,
  setBusy,
  setLastError,
  onUnreadCountChange,
  hideModeCard,
  onLogout,
  onRegister,
  mediaReview
}: Readonly<{
  api: Api;
  session: Session;
  setSession(session: Session): void;
  settings: Settings;
  activeTab: TopTab;
  setActiveTab(tab: TopTab): void;
  discoverScreen: DiscoverScreen;
  mapControls?: React.ReactNode;
  discoverFilter: DiscoverFilter;
  busy: boolean;
  setBusy(value: boolean): void;
  setLastError(value: string | null): void;
  onUnreadCountChange?(count: number): void;
  hideModeCard?: boolean;
  onLogout?(): void;
  onRegister?(): void;
  mediaReview?: React.ReactNode;
}>): React.ReactElement {
  const isMobile = useIsMobile();
  const threadProfileOpener = useRef<((request: ThreadProfileRequest) => void) | null>(null);
  const openThreadProfile = (request: ThreadProfileRequest) => threadProfileOpener.current?.(request);
  const [exploreThreadKey, setExploreThreadKey] = useState<string | null>(null);
  const [externalOpenThreadRequest, setExternalOpenThreadRequest] = useState<{ key: string; nonce: number } | null>(null);
  const [rememberedThread, setRememberedThread] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile");
  useEffect(() => {
    function update(event: Event) {
      const section = (event as CustomEvent<unknown>).detail;
      if (section === "Private album") setSettingsSection("photos");
      else if (section === "membership" || section === "account") setSettingsSection("plan");
      else if (typeof section === "string" && SETTINGS_SECTIONS.some(item => item.id === section)) {
        setSettingsSection(section as SettingsSection);
      }
    }
    window.addEventListener("rd:settings-section", update);
    return () => window.removeEventListener("rd:settings-section", update);
  }, []);
  const [mobileInboxTab, setMobileInboxTab] = useState<MobileInboxTab>("threads");
  const [scopedErrors, setScopedErrors] = useState<Partial<Record<RouterErrorScope, string>>>({});
  const isMobileInboxOpen = isMobile && activeTab === "threads";
  const isMobileAdsOpen = isMobile && activeTab === "ads";
  const currentErrorScope: RouterErrorScope = isMobileAdsOpen
    ? "ads"
    : isMobileInboxOpen
      ? mobileInboxTab === "chat-grid"
        ? "discover"
        : mobileInboxTab === "spots"
          ? "cruise"
          : mobileInboxTab === "groups"
            ? "groups"
            : "threads"
      : activeTab;

  const makeScopedSetLastError = useCallback(
    (scope: RouterErrorScope) => (value: string | null): void => {
      const normalized = typeof value === "string" ? value.trim() : "";
      setScopedErrors((prev) => {
        if (!normalized) {
          if (!(scope in prev)) return prev;
          const next = { ...prev };
          delete next[scope];
          return next;
        }
        if (prev[scope] === normalized) return prev;
        return { ...prev, [scope]: normalized };
      });
      setLastError(value);
    },
    [setLastError]
  );

  const setDiscoverError = useMemo(() => makeScopedSetLastError("discover"), [makeScopedSetLastError]);
  const setThreadsError = useMemo(() => makeScopedSetLastError("threads"), [makeScopedSetLastError]);
  const setAdsError = useMemo(() => makeScopedSetLastError("ads"), [makeScopedSetLastError]);
  const setGroupsError = useMemo(() => makeScopedSetLastError("groups"), [makeScopedSetLastError]);
  const setCruiseError = useMemo(() => makeScopedSetLastError("cruise"), [makeScopedSetLastError]);
  const setProfileError = useMemo(() => makeScopedSetLastError("profile"), [makeScopedSetLastError]);
  const setSettingsError = useMemo(() => makeScopedSetLastError("settings"), [makeScopedSetLastError]);
  const setSubmissionsError = useMemo(() => makeScopedSetLastError("submissions"), [makeScopedSetLastError]);
  const setPromotedError = useMemo(() => makeScopedSetLastError("promoted"), [makeScopedSetLastError]);

  const unifiedSettingsSurface = (
    <section className="rd-settings-page rd-settings-hub" aria-label="Settings">
      <div className="rd-settings-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map(({ id, label, icon }, index) => (
          <button key={id} id={`settings-tab-${id}`} type="button" role="tab"
            aria-selected={settingsSection === id} aria-controls="settings-content"
            tabIndex={settingsSection === id ? 0 : -1} onClick={() => setSettingsSection(id)}
            onKeyDown={event => {
              const last = SETTINGS_SECTIONS.length - 1;
              const next = event.key === "Home" ? 0 : event.key === "End" ? last
                : event.key === "ArrowRight" ? (index + 1) % SETTINGS_SECTIONS.length
                : event.key === "ArrowLeft" ? (index + last) % SETTINGS_SECTIONS.length : null;
              if (next === null) return;
              event.preventDefault();
              const nextSection = SETTINGS_SECTIONS[next].id;
              setSettingsSection(nextSection);
              document.getElementById(`settings-tab-${nextSection}`)?.focus();
            }}>
            <Icon name={icon} active={settingsSection === id} />
            {label}
          </button>
        ))}
      </div>
      <div id="settings-content" role="tabpanel" aria-labelledby={`settings-tab-${settingsSection}`}
        className="rd-profile-settings-stack" tabIndex={0}>
        {(settingsSection === "profile" || (!googlePlayEdition && settingsSection === "photos")) &&
          <SettingsProfile section={settingsSection} api={api} session={session} setLastError={setProfileError} />}
        {settingsSection === "profile" && mediaReview}
        {settingsSection === "profile" && !googlePlayEdition && session.userId && (
          <button type="button" className="rd-btn" onClick={() => setActiveTab("adult-library")}>Manage adult video favorites</button>
        )}
        {settingsSection === "photos" && <>
          <PrivateAlbumsSettings api={api} session={session} />
          {!googlePlayEdition && <>
            <PhotoVerificationPanel api={api} session={session} />
            <PhotoReviewQueue api={api} session={session} />
          </>}
        </>}
        {settingsSection === "privacy" && <>
          {googlePlayEdition && session.userId && <a href={deletionPage} className="rd-btn">Delete account</a>}
          <MemberPrivacy api={api} session={session} />
          <PrivacySettings api={api} session={session} />
          <PrivacyBlockList api={api} session={session} />
          <NotificationSettings api={api} session={session} />
          <MarketingPreferences api={api} session={session} />
          <SafetyReportQueue api={api} session={session} />
          <SettingsPanel api={api} session={session} setLastError={setSettingsError} onLogout={onLogout} />
          <div className="rd-row">
            {googlePlayEdition && <a className="rd-btn" href="./legal/child-safety.html">Child safety standards</a>}
            <a className="rd-btn" href="./legal/">Policies</a>
            <a className="rd-btn" href="./thebackroom/">The Backroom</a>
            <a className="rd-btn" href="https://badehausx.com/store/">Store</a>
            <button type="button" className="rd-btn" onClick={() => setActiveTab("submissions")}>Submissions</button>
            {session.role === "admin" && <button type="button" className="rd-btn" onClick={() => setAnalyticsOpen(true)}>
              Activity dashboard
            </button>}
          </div>
          {analyticsOpen && session.role === "admin" &&
            <AdminAnalytics api={api} session={session} onClose={() => setAnalyticsOpen(false)} />}
        </>}
        {settingsSection === "plan" && <>
          {session.freePlus === false && <PlusMembershipCard active={hasPlus(session)} onOpen={() => openPlus()} />}
          <MembershipPrograms api={api} session={session} />
          <BillingSettings api={api} session={session} />
          {session.freePlus === false && <PromoCodeForm api={api} session={session} />}
          <GrowthDashboard api={api} session={session} />
          <AdminLaunchChecks api={api} session={session} />
        </>}
      </div>
    </section>
  );
  const scopedError = scopedErrors[currentErrorScope] ?? null;
  const inlineErrorBanner = scopedError ? (
    <div
      role="alert"
      aria-live="polite"
      style={{
        color: "#ffd8dc",
        background: "rgba(130, 10, 22, 0.38)",
        border: "1px solid rgba(255, 90, 104, 0.46)",
        borderRadius: 10,
        padding: "9px 11px",
        fontSize: 14,
        lineHeight: 1.35
      }}
    >
      {scopedError}
    </div>
  ) : null;

  if (googlePlayEdition && !session.userId && activeTab === "threads") {
    return <section className="rd-card rd-settings-body" aria-label="Inbox">
      <h1>Inbox</h1>
      <p>Create an account to send and receive messages.</p>
      <button type="button" className="rd-btn primary" onClick={onRegister}>Create an account</button>
    </section>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!hideModeCard ? null : null}
      {!isMobileInboxOpen && !isMobileAdsOpen && activeTab !== "discover" && inlineErrorBanner}

      <div className="rd-discover-container" style={{ display: activeTab === "discover" ? "block" : "none" }}>
        <CruiseSurface
          api={api}
          session={session}
          settings={settings}
          discoverFilter={discoverFilter}
          busy={busy}
          setBusy={setBusy}
          setLastError={setDiscoverError}
          isMobile={isMobile}
          mapControls={mapControls}
          discoverScreen={discoverScreen}
          threadProfileOpener={threadProfileOpener}
          onOpenThreadRequested={(key) => {
            if (googlePlayEdition && !session.userId) {
              setActiveTab("threads");
              return;
            }
            if (!isMobile) {
              setExploreThreadKey(normalizePeerKey(key));
              return;
            }
            setExternalOpenThreadRequest({ key: normalizePeerKey(key), nonce: Date.now() });
            setActiveTab("threads");
          }}
          onUnreadCountChange={onUnreadCountChange}
        />
      </div>
      {activeTab === "discover" && exploreThreadKey && !isMobile ? (
        <ThreadsPanel onOpenProfile={openThreadProfile} key={exploreThreadKey} initialPeerKey={exploreThreadKey}
          onCloseOverlay={() => setExploreThreadKey(null)}
          api={api} session={session} setLastError={setThreadsError} isMobile={false}
          onUnreadCountChange={onUnreadCountChange}
        />
      ) : null}
      {activeTab === "threads" && !isMobile ? (
        <ThreadsPanel onOpenProfile={openThreadProfile} initialPeerKey={rememberedThread} onActiveThreadChange={setRememberedThread}
          api={api}
          session={session}
          setLastError={setThreadsError}
          openThreadRequest={externalOpenThreadRequest}
          onThreadRequestConsumed={() => setExternalOpenThreadRequest(null)}
          isMobile={isMobile}
          onUnreadCountChange={onUnreadCountChange}
        />
      ) : null}
      {isMobileInboxOpen ? (
        <div className="rd-mobile-inbox"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            borderTop: "1px solid rgba(255, 95, 104, 0.48)",
            background: "#111113",
            boxShadow: "0 -14px 34px rgba(0,0,0,0.55)",
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            overflowX: "hidden"
          }}
        >
          <header className="rd-inbox-toolbar" aria-label="Inbox controls">
            <nav aria-label="Inbox views">
              {([
                ["threads", "Inbox Threads", "message"],
                ["pinned", "Pinned Chats", "star"],
                ["spots", "Cruising Spots", "map"],
                ["groups", "Groups", "groups"]
              ] as const).filter(([id]) => !googlePlayEdition || id !== "spots").map(([id, label, icon]) => (
                <button key={id} type="button" className="rd-btn rd-icon-only-btn" title={label}
                  aria-label={label} aria-pressed={mobileInboxTab === id} onClick={() => setMobileInboxTab(id)}>
                  <Icon name={icon} active={mobileInboxTab === id} />
                </button>
              ))}
            </nav>
            <button type="button" className="rd-btn rd-icon-only-btn" aria-label="Close inbox"
              onClick={() => setActiveTab("discover")}>✕</button>
          </header>
          <div style={{ overflowY: "auto", overscrollBehaviorY: "contain", minHeight: 0, padding: 8 }}>
            {inlineErrorBanner}
            {mobileInboxTab === "chat-grid" ? (
              <CruiseSurface
                api={api}
                session={session}
                settings={settings}
                discoverFilter={discoverFilter}
                busy={busy}
                setBusy={setBusy}
                setLastError={setDiscoverError}
                isMobile={isMobile}
                discoverScreen={"chat"}
                onOpenThreadRequested={(key) => {
                  setExternalOpenThreadRequest({ key: normalizePeerKey(key), nonce: Date.now() });
                  setMobileInboxTab("threads");
                }}
                onUnreadCountChange={onUnreadCountChange}
              />
            ) : null}
            {mobileInboxTab === "threads" ? (
              <ThreadsPanel onOpenProfile={openThreadProfile} initialPeerKey={rememberedThread} onActiveThreadChange={setRememberedThread}
                api={api}
                session={session}
                setLastError={setThreadsError}
                openThreadRequest={externalOpenThreadRequest}
                onThreadRequestConsumed={() => setExternalOpenThreadRequest(null)}
                isMobile={isMobile}
                onUnreadCountChange={onUnreadCountChange}
                compact={true}
              />
            ) : null}
            {mobileInboxTab === "pinned" ? (
              <ThreadsPanel onOpenProfile={openThreadProfile} initialPeerKey={rememberedThread} onActiveThreadChange={setRememberedThread}
                api={api}
                session={session}
                setLastError={setThreadsError}
                openThreadRequest={externalOpenThreadRequest}
                onThreadRequestConsumed={() => setExternalOpenThreadRequest(null)}
                isMobile={isMobile}
                onUnreadCountChange={onUnreadCountChange}
                mode="pinned"
                compact={true}
              />
            ) : null}
            {mobileInboxTab === "spots" ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="cruise" setLastError={setCruiseError} compact={true} /> : null}
            {mobileInboxTab === "groups" ? <>
              <ThreadsPanel onOpenProfile={openThreadProfile} api={api} session={session} setLastError={setThreadsError} isMobile={isMobile} groupOnly />
              <PublicPostings api={api} session={session} isMobile={isMobile} screen="groups" setLastError={setGroupsError} compact={true} />
            </> : null}
          </div>
        </div>
      ) : null}
      {isMobileAdsOpen ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            borderTop: "1px solid rgba(255, 95, 104, 0.48)",
            background: "#111113",
            boxShadow: "0 -14px 34px rgba(0,0,0,0.55)",
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            overflowX: "hidden"
          }}
        >
          <div style={{ gridRow: "1 / -1", overflowY: "auto", overscrollBehaviorY: "contain", minHeight: 0, padding: 8 }}>
            {inlineErrorBanner}
            <PublicPostings
              api={api}
              session={session}
              isMobile={isMobile}
              screen="ads"
              setLastError={setAdsError}
              compact={true}
              onOpenThreadRequested={(key) => {
                setExternalOpenThreadRequest({ key: normalizePeerKey(key), nonce: Date.now() });
                setActiveTab("threads");
              }}
            />
          </div>
        </div>
      ) : null}
      {activeTab === "ads" && !isMobile ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="ads" setLastError={setAdsError} /> : null}
      {activeTab === "live" ? <LivePanel key={session.sessionToken} api={api} session={session} /> : null}
      {activeTab === "groups" ? (
        <PublicPostings api={api} session={session} isMobile={isMobile} screen="groups" setLastError={setGroupsError} />
      ) : null}
      {activeTab === "cruise" ? <PublicPostings api={api} session={session} isMobile={isMobile} screen="cruise" setLastError={setCruiseError} /> : null}
      {activeTab === "profile" || activeTab === "settings" ? unifiedSettingsSurface : null}
      {!googlePlayEdition && activeTab === "private-inbox" && <PrivateInbox api={api} session={session} />}
      {!googlePlayEdition && activeTab === "adult-library" ? <AdultLibrary api={api} session={session} onRegister={onRegister} /> : null}
      {activeTab === "submissions" ? <SubmissionsPanel api={api} session={session} setLastError={setSubmissionsError} /> : null}
      {activeTab === "promoted" || activeTab === "md" ? <p role="status">This feature is unavailable. Open Explore or Inbox to continue.</p> : null}
    </div>
  );
}
