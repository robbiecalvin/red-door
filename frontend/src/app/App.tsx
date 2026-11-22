import brandMark from "../assets/interface/brand.webp";
import { Backroom } from "./Backroom";
import { ReferralToolbar } from "./ReferralToolbar";
import type { RegistrationPolicy } from "../../../shared/registrationPolicy";
import { MARKETING_CONSENT_LABEL } from "../../../shared/marketing";
import { LiveContext, useLiveState } from "./liveState";
import { InstallApp } from "./Pwa";
import { AccountNotices } from "./BillingSettings";
import { actorKey } from "../../../shared/identity";
import { useLiveInbox } from "./useLiveInbox";
import { useMessageSound } from "./useMessageSound";
import { disablePush } from "./pushNotifications";
import { isPlusFeature, type PlusFeature } from "./PlusShowcase";
import { NOTIFICATION_ENABLED, NOTIFICATION_DISCREET, NotificationPrompt } from "./NotificationSettings";
import afterDark from "../assets/after-dark.png";
import { PasswordRecovery } from "./PasswordRecovery";
import { GoogleSignInButton, type GoogleCredential } from "./GoogleSignInButton";
import { AdminAnalytics } from "./AdminAnalytics";
import { PlusPanel } from "./PlusPanel";
import { LAUNCH_END_MS, hasPlus } from "../../../shared/plus";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiClient, type ServiceError, type Session } from "./api";
import { isVerificationRequiredError } from "./authUi";
import placeholderA from "../assets/reddoor-placeholder-1.webp";
import placeholderB from "../assets/reddoor-placeholder-2.webp";
import placeholderC from "../assets/reddoor-placeholder-3.webp";
import { Icon } from "./Icon";
import { RightNowControl } from "./MemberPanels";

type AuthView = "guest" | "register" | "login";
type TopTab = "live" | "discover" | "threads" | "ads" | "groups" | "cruise" | "profile" | "settings" | "submissions" | "promoted" | "md";
type DiscoverFilter = "all" | "online" | "favorites";
type DiscoverScreen = "map" | "chat";
type ProfilePosition = "" | "top" | "bottom" | "side";

type ProfileSetupDraft = Readonly<{
  displayName: string;
  age: string;
  bio: string;
  race: string;
  heightFeet: string;
  heightRemainder: string;
  weightLbs: string;
  position: ProfilePosition;
}>;

const SESSION_TOKEN_KEY = "reddoor_session_token";
const WINDOW_NAME_TOKEN_PREFIX = "rdst:";
const DEFAULT_SHARED_API_BASE = "https://red-door-api.onrender.com";
const TAB_SET: ReadonlySet<TopTab> = new Set(["discover", "threads", "ads", "groups", "live", "cruise", "profile", "settings", "submissions"]);
const DEFAULT_TAB: TopTab = "discover";
const FULL_PAGE_TAB_NAV = false;
const CHAT_READ_CURSOR_STORAGE_KEY = "reddoor:chat-read-cursors:v1";
const Router = React.lazy(async () => {
  const mod = await import("./Router");
  return { default: mod.Router };
});

type Settings = Readonly<{
  defaultCenterLat: number;
  defaultCenterLng: number;
}>;

declare const __DUALMODE_DEFAULT_CENTER_LAT__: string | undefined;
declare const __DUALMODE_DEFAULT_CENTER_LNG__: string | undefined;
declare const __DUALMODE_API_BASE_PATH__: string | undefined;

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
    // Storage may be blocked (privacy mode). Do not crash the UI.
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage may be blocked (privacy mode). Do not crash the UI.
  }
}

function safeSessionStorageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage may be blocked (privacy mode). Do not crash the UI.
  }
}

function safeSessionStorageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage may be blocked (privacy mode). Do not crash the UI.
  }
}

function tokenFromLocationSearch(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("st");
    const token = typeof raw === "string" ? raw.trim() : "";
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function tokenFromWindowName(): string | null {
  try {
    const raw = typeof window.name === "string" ? window.name : "";
    if (!raw.startsWith(WINDOW_NAME_TOKEN_PREFIX)) return null;
    const token = raw.slice(WINDOW_NAME_TOKEN_PREFIX.length).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function initialSessionToken(): string | null {
  const local = safeLocalStorageGet(SESSION_TOKEN_KEY);
  if (local) return local;
  const session = safeSessionStorageGet(SESSION_TOKEN_KEY);
  if (session) return session;
  const searchToken = tokenFromLocationSearch();
  if (searchToken) return searchToken;
  return tokenFromWindowName();
}

function loadSettingsFromEnv(): Settings {
  const fallbackLat = 40.7484;
  const fallbackLng = -73.9857;

  const defaultCenterLat = (() => {
    const raw = typeof __DUALMODE_DEFAULT_CENTER_LAT__ === "string" ? __DUALMODE_DEFAULT_CENTER_LAT__ : String(fallbackLat);
    const n = Number(raw);
    return Number.isFinite(n) && n >= -90 && n <= 90 ? n : fallbackLat;
  })();

  const defaultCenterLng = (() => {
    const raw = typeof __DUALMODE_DEFAULT_CENTER_LNG__ === "string" ? __DUALMODE_DEFAULT_CENTER_LNG__ : String(fallbackLng);
    const n = Number(raw);
    return Number.isFinite(n) && n >= -180 && n <= 180 ? n : fallbackLng;
  })();

  return { defaultCenterLat, defaultCenterLng };
}

function normalizeUiError(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    const msg = (e as { message: string }).message;
    if (msg.toLowerCase().includes("failed to fetch")) {
      return "Network error reaching the API. Check DUALMODE_API_BASE_PATH and backend CORS_ALLOWED_ORIGINS.";
    }
    return msg;
  }
  return fallback;
}

function requestLocationPermission(): void {
  if (!navigator.geolocation) return;
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        try {
          localStorage.setItem("reddoor_travel_center", JSON.stringify({ enabled: true, lat, lng }));
        } catch {
          // storage may be unavailable in strict privacy mode
        }
        window.dispatchEvent(new CustomEvent("rd:location-updated", { detail: { lat, lng } }));
      },
      () => {
        // deny/error is handled later by map presence fallbacks
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 }
    );
  } catch {
    // Some browser/security contexts can throw synchronously; auth flows must continue.
  }
}

function resolveApiBasePath(): string {
  const configured = typeof __DUALMODE_API_BASE_PATH__ === "string" ? __DUALMODE_API_BASE_PATH__.trim() : "";
  if (!configured || configured === "__disabled__") {
    return DEFAULT_SHARED_API_BASE;
  }
  const normalized = configured.toLowerCase();
  const isLocalModeConfig = normalized === "__local__" || normalized === "local" || normalized === "rdlocal";
  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";
  if (isLocalModeConfig && !isLocalHost) {
    return DEFAULT_SHARED_API_BASE;
  }
  return configured;
}

const AVATARS = [placeholderA, placeholderB, placeholderC] as const;

function avatarForSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATARS[Math.abs(h) % AVATARS.length];
}

function tabFromHash(): TopTab {
  const raw = window.location.hash.trim().replace(/^#\/?/, "").split("/")[0]?.toLowerCase() ?? "";
  if (raw === "discover-map" || raw === "discover-chat") return "discover";
  if (raw === "public" || raw === "events") return "groups";
  if (raw === "spots") return "cruise";
  return TAB_SET.has(raw as TopTab) ? (raw as TopTab) : DEFAULT_TAB;
}

function discoverScreenFromHash(): DiscoverScreen {
  const raw = window.location.hash.trim().replace(/^#\/?/, "").split("/")[0]?.toLowerCase() ?? "";
  if (raw === "discover-map") return "map";
  return "chat";
}

function tabFromPathname(): TopTab | null {
  const file = window.location.pathname.split("/").pop()?.toLowerCase() ?? "";
  if (!file || file === "index.html") return DEFAULT_TAB;
  const slug = file.endsWith(".html") ? file.slice(0, -".html".length) : file;
  if (slug === "public" || slug === "events") return "groups";
  if (slug === "spots") return "cruise";
  return TAB_SET.has(slug as TopTab) ? (slug as TopTab) : null;
}

function tabFromLocation(): TopTab {
  // Return links from Stripe land on the root document with a hash route.
  if (window.location.hash.startsWith("#/")) return tabFromHash();
  const fromPath = tabFromPathname();
  if (fromPath) return fromPath;
  return tabFromHash();
}

function hashForTab(tab: TopTab, discoverScreen: DiscoverScreen): string {
  if (tab !== "discover") return `#/${tab}`;
  return discoverScreen === "map" ? "#/discover-map" : "#/discover-chat";
}

function urlForTab(tab: TopTab, sessionToken?: string | null): string {
  const path = window.location.pathname;
  const slash = path.lastIndexOf("/");
  const baseDir = slash >= 0 ? path.slice(0, slash + 1) : "/";
  const fileName = tab === DEFAULT_TAB ? "index.html" : `${tab}.html`;
  const token = typeof sessionToken === "string" ? sessionToken.trim() : "";
  return token.length > 0 ? `${baseDir}${fileName}?st=${encodeURIComponent(token)}` : `${baseDir}${fileName}`;
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
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
  const map = readChatReadCursorMap();
  const value = map[chatReadCursorKey(chatKind, peerKey)];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function emptyProfileSetupDraft(): ProfileSetupDraft {
  return {
    displayName: "",
    age: "",
    bio: "",
    race: "",
    heightFeet: "",
    heightRemainder: "0",
    weightLbs: "",
    position: ""
  };
}

export function App(): React.ReactElement {
  const api = useMemo(() => apiClient(resolveApiBasePath()), []);

  const [settings] = useState<Settings>(() => loadSettingsFromEnv());

  const [sessionToken, setSessionToken] = useState<string | null>(() => initialSessionToken());
  const [session, setSession] = useState<Session | null>(null);
  const liveState = useLiveState(api, session);

  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const [authView, setAuthView] = useState<AuthView>("login");
  const [activeTab, setActiveTab] = useState<TopTab>(() => tabFromLocation());
  const [discoverScreen, setDiscoverScreen] = useState<DiscoverScreen>(() => discoverScreenFromHash());
  const [discoverFilter, setDiscoverFilter] = useState<DiscoverFilter>("all");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [googleRegistration, setGoogleRegistration] = useState<GoogleCredential | null>(null);
  const [phoneE164, setPhoneE164] = useState<string>("");
  const [registerDisplayName, setRegisterDisplayName] = useState<string>("");
  const [recoveryToken, setRecoveryToken] = useState(() => /^#reset=([a-f0-9]{64})$/i.exec(window.location.hash)?.[1] ?? "");
  const [recoveryOpen, setRecoveryOpen] = useState(() => /^#reset=([a-f0-9]{64})$/i.test(window.location.hash));
  useEffect(() => { if (recoveryToken && window.location.hash.startsWith("#reset=")) window.history.replaceState(null, "", window.location.pathname + window.location.search); }, [recoveryToken]);
  useEffect(() => {
    const receiveResetLink = () => { const token = /^#reset=([a-f0-9]{64})$/i.exec(window.location.hash)?.[1]; if (token) { setRecoveryToken(token); setRecoveryOpen(true); window.history.replaceState(null, "", window.location.pathname + window.location.search); } };
    window.addEventListener("hashchange", receiveResetLink);
    return () => window.removeEventListener("hashchange", receiveResetLink);
  }, []);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [policy, setPolicy] = useState<RegistrationPolicy | null>(null);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [policyRequest, setPolicyRequest] = useState(0);
  useEffect(() => {
    if (authView !== "register") return;
    let active = true;
    setPolicy(null);
    setAcceptedPolicy(false);
    void api.getRegistrationPolicy().then(result => {
      if (active) setPolicy(result);
    }).catch(() => { if (active) setPolicy({ status: "unavailable" }); });
    return () => { active = false; };
  }, [api, authView, policyRequest]);
  const canRegister = policy?.status === "disabled" || (policy?.status === "required" && acceptedPolicy);
  useEffect(() => {
    if (authView !== "register") setGoogleRegistration(null);
  }, [authView]);

  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const liveInboxStatus=useLiveInbox(session,resolveApiBasePath());
  useMessageSound(session?.ageVerified ? actorKey(session) : null);
  const [plusFeature, setPlusFeature] = useState<PlusFeature | undefined>();
  const [loginSequence,setLoginSequence]=useState(0);
  const [plusOpen, setPlusOpen] = useState(false);
  const [registerAge, setRegisterAge] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string>("");
  const [ageYears, setAgeYears] = useState<string>("");
  const [profileSetupDraft, setProfileSetupDraft] = useState<ProfileSetupDraft>(() => emptyProfileSetupDraft());
  const [profileSetupRequired, setProfileSetupRequired] = useState<boolean>(false);
  const [profileSetupChecking, setProfileSetupChecking] = useState<boolean>(false);
  const [topAvatarUrl, setTopAvatarUrl] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [topMenuOpen, setTopMenuOpen] = useState<boolean>(false);
  const unreadSyncInFlightRef = useRef<boolean>(false);

  const persistSessionToken = useCallback((token: string): void => {
    safeLocalStorageSet(SESSION_TOKEN_KEY, token);
    safeSessionStorageSet(SESSION_TOKEN_KEY, token);
    try {
      window.name = `${WINDOW_NAME_TOKEN_PREFIX}${token}`;
    } catch {
      // Some embedded environments can block writes; ignore.
    }
  }, []);

  const clearPersistedSessionToken = useCallback((): void => {
    safeLocalStorageRemove(SESSION_TOKEN_KEY);
    safeSessionStorageRemove(SESSION_TOKEN_KEY);
    try {
      if (window.name.startsWith(WINDOW_NAME_TOKEN_PREFIX)) {
        window.name = "";
      }
    } catch {
      // Ignore cleanup failures in constrained environments.
    }
  }, []);

  useEffect(() => {
    const fromQuery = tokenFromLocationSearch();
    if (fromQuery) persistSessionToken(fromQuery);
    if (window.location.search.includes("st=")) {
      const cleanUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, [persistSessionToken]);

  const refreshSession = useCallback(
    async (token: string): Promise<void> => {
      const res = await api.getSession(token);
      setSession(res.session);
    },
    [api]
  );

  useEffect(() => {
    if (!sessionToken) return;
    if (session?.sessionToken === sessionToken) return;
    setLastError(null);
    refreshSession(sessionToken)
      .catch((e) => {
        if (session) {
          setLastError(normalizeUiError(e, "Session refresh failed. Keeping current session."));
          return;
        }
        setLastError(normalizeUiError(e, "Session error."));
        clearPersistedSessionToken();
        setSessionToken(null);
        setSession(null);
      });
  }, [clearPersistedSessionToken, refreshSession, session, sessionToken]);

  useEffect(() => {
    if (!session) {
      setTopAvatarUrl(null);
      return;
    }
    const activeSession = session;
    let cancelled = false;
    async function refreshTopAvatar(): Promise<void> {
      try {
        const mine = await api.getMyProfile(activeSession.sessionToken);
        const mediaId = mine.profile.mainPhotoMediaId;
        if (!mediaId) {
          if (!cancelled) setTopAvatarUrl(null);
          return;
        }
        const media = await api.getPublicMediaUrl(mediaId);
        if (!cancelled) setTopAvatarUrl(media.downloadUrl);
      } catch {
        if (!cancelled) setTopAvatarUrl(null);
      }
    }

    const onProfileMediaUpdated = (evt: Event): void => {
      const detail = (evt as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && activeSession.userId && detail.userId !== activeSession.userId) return;
      void refreshTopAvatar();
    };

    void refreshTopAvatar();
    const id = window.setInterval(() => {
      void refreshTopAvatar();
    }, 10_000);
    window.addEventListener("rd:profile-media-updated", onProfileMediaUpdated as EventListener);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("rd:profile-media-updated", onProfileMediaUpdated as EventListener);
    };
  }, [api, session]);

  useEffect(() => {
    if (!session || session.ageVerified !== true) {
      setOnlineCount(0);
      return;
    }
    const activeSession = session;
    let cancelled = false;
    async function refreshOnlineCount(): Promise<void> {
      try {
        const res = await api.listActivePresence(activeSession.sessionToken);
        if (cancelled) return;
        const meKey = actorKey(activeSession);
        const list = Array.isArray(res.presence) ? res.presence : [];
        setOnlineCount(list.filter((p) => p.key !== meKey).length);
      } catch {
        if (!cancelled) setOnlineCount(0);
      }
    }
    void refreshOnlineCount();
    const id = window.setInterval(() => {
      void refreshOnlineCount();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, session]);

  useEffect(() => {
    if (!session || session.ageVerified !== true) {
      setUnreadChatCount(0);
      return;
    }
    let cancelled = false;
    const activeSession = session;
    const meKey = actorKey(activeSession);

    async function safeListThreads(chatKind: "cruise" | "date"): Promise<ReadonlyArray<Readonly<{ otherKey: string }>>> {
      if (activeSession.mode !== "hybrid" && activeSession.mode !== chatKind) return [];
      try {
        const res = await api.listChatThreads(activeSession.sessionToken, chatKind);
        return Array.isArray(res.threads) ? (res.threads as ReadonlyArray<Readonly<{ otherKey: string }>>) : [];
      } catch {
        return [];
      }
    }

    async function refreshUnreadCount(force=false): Promise<void> {
      if (cancelled || unreadSyncInFlightRef.current || (!force && document.hidden)) return;
      unreadSyncInFlightRef.current = true;
      try {
        const [cruiseThreads, dateThreads] = await Promise.all([safeListThreads("cruise"), safeListThreads("date")]);
        const pairs = new Map<string, { chatKind: "cruise" | "date"; otherKey: string }>();
        for (const row of cruiseThreads) {
          const otherKey = normalizePeerKey(String(row?.otherKey ?? ""));
          if (!otherKey || otherKey === meKey || otherKey.startsWith("spot:")) continue;
          pairs.set(`cruise:${otherKey}`, { chatKind: "cruise", otherKey });
        }
        for (const row of dateThreads) {
          const otherKey = normalizePeerKey(String(row?.otherKey ?? ""));
          if (!otherKey || otherKey === meKey || otherKey.startsWith("spot:")) continue;
          pairs.set(`date:${otherKey}`, { chatKind: "date", otherKey });
        }

        let unreadTotal = 0;
        for (const pair of pairs.values()) {
          if (cancelled) break;
          try {
            const res = await api.listChat(activeSession.sessionToken, pair.chatKind, pair.otherKey);
            const messages = ((res as { messages?: ReadonlyArray<{ fromKey?: string; toKey?: string; readAtMs?: number }> }).messages ?? []) as ReadonlyArray<{
              fromKey?: string;
              toKey?: string;
              readAtMs?: number;
              createdAtMs?: number;
            }>;
            const cursor = getChatReadCursor(pair.chatKind, pair.otherKey);
            for (const message of messages) {
              if (
                message.fromKey === pair.otherKey &&
                message.toKey === meKey &&
                typeof message.readAtMs !== "number" &&
                (!(typeof message.createdAtMs === "number" && Number.isFinite(message.createdAtMs)) || message.createdAtMs > cursor)
              ) {
                unreadTotal += 1;
              }
            }
          } catch {
            // Ignore per-thread errors and continue.
          }
        }
        if (!cancelled) {
          setUnreadChatCount((prev) => (prev === unreadTotal ? prev : unreadTotal));
        }
      } finally {
        unreadSyncInFlightRef.current = false;
      }
    }

    const live=()=>void refreshUnreadCount(true);window.addEventListener("rd:inbox-update",live);
    void refreshUnreadCount();
    const onVisibilityChange = (): void => {
      if (!document.hidden) void refreshUnreadCount();
    };
    const id = window.setInterval(() => {
      void refreshUnreadCount();
    }, 2500);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;window.removeEventListener("rd:inbox-update",live);
      unreadSyncInFlightRef.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [api, session]);

  function switchAuthView(view: AuthView): void {
    if (view === authView) return;
    setAuthView(view);
    setPendingVerificationEmail(null);
    setVerificationCode("");
    setAuthInfo("");
    setLastError(null);
  }

  function onLogout(): void {
    if(session?.userId)void disablePush(api,session).catch(()=>{});
    clearPersistedSessionToken();
    setSessionToken(null);
    setSession(null);
    setUnreadChatCount(0);
    setLastError(null);
    setAuthInfo("");
    setAuthView("login");
    setLoginEmail("");
    setLoginPassword("");
    setRegisterEmail("");
    setRegisterPassword("");
    setPendingVerificationEmail(null);
    setVerificationCode("");
    setProfileSetupRequired(false);
    setProfileSetupChecking(false);
    setProfileSetupDraft(emptyProfileSetupDraft());
  }

  async function createGuest(): Promise<void> {
    requestLocationPermission();
    setBusy(true);
    setLastError(null);
    setAuthInfo("");
    try {
      const res = await api.createGuest();
      persistSessionToken(res.session.sessionToken);
      setSessionToken(res.session.sessionToken);
      setSession(res.session);
    } catch (e) {
      setLastError(normalizeUiError(e, "Auth failed."));
    } finally {
      setBusy(false);
    }
  }

  async function autoVerifyAgeForRegisteredSession(nextSession: Session, preferredAge?: number): Promise<Session> {
    if (nextSession.userType === "guest" || nextSession.ageVerified === true) return nextSession;
    let ageCandidate = Number.isFinite(preferredAge) ? Number(preferredAge) : NaN;
    if (!Number.isFinite(ageCandidate) || !Number.isInteger(ageCandidate) || ageCandidate < 18 || ageCandidate > 120) {
      try {
        const me = await api.getMyProfile(nextSession.sessionToken);
        ageCandidate = Number(me.profile.age);
      } catch {
        return nextSession;
      }
    }
    if (!Number.isFinite(ageCandidate) || !Number.isInteger(ageCandidate) || ageCandidate < 18 || ageCandidate > 120) {
      return nextSession;
    }
    try {
      const verified = await api.verifyAge(nextSession.sessionToken, ageCandidate);
      return verified.session;
    } catch {
      return nextSession;
    }
  }

  async function submitRegister(): Promise<void> {
    if (busy || !canRegister) return;
    const policyAcceptance = policy?.status === "required" ? {
      accepted: true as const, termsVersion: policy.terms.version, privacyVersion: policy.privacy.version
    } : undefined;
    const normalizedDisplayName = registerDisplayName.trim();
    const registerAgeNumber = Number(registerAge);
    if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 32) {
      setLastError("Display name must be 2-32 characters.");
      return;
    }
    if (!Number.isFinite(registerAgeNumber) || !Number.isInteger(registerAgeNumber) || registerAgeNumber < 18 || registerAgeNumber > 120) {
      setLastError("Age must be an integer between 18 and 120.");
      return;
    }
    setBusy(true);
    setLastError(null);
    setAuthInfo("");
    const profile = { displayName: normalizedDisplayName, age: registerAgeNumber, stats: {}, promoCode, analyticsConsent, marketingConsent, policyAcceptance };
    try {
      const googleResult = googleRegistration
        ? await api.registerWithGoogle(googleRegistration.credential, googleRegistration.nonce, phoneE164, profile)
        : null;
      const registration = googleRegistration ? null : await api.register(registerEmail, registerPassword, phoneE164, profile);
      setMarketingConsent(false);
      setAcceptedPolicy(false);
      setProfileSetupDraft((prev) => ({
        ...prev,
        displayName: normalizedDisplayName,
        age: String(registerAgeNumber)
      }));
      if (googleResult) {
        setGoogleRegistration(null);
        await completeLogin(googleResult.session);
        return;
      }
      try {
        const loginRes = await api.login(registerEmail, registerPassword);
        await completeLogin(loginRes.session, registerAgeNumber);
        setPendingVerificationEmail(null);
        setVerificationCode("");
        setAuthInfo("");
      } catch (loginError) {
        const requiresVerification = isVerificationRequiredError(loginError);
        if (!requiresVerification) {
          throw loginError;
        }
        setPendingVerificationEmail(registerEmail.trim());
        setAuthView("register");
        setVerificationCode("");
        setAuthInfo((registration as { emailDeliveryAccepted?: boolean } | null)?.emailDeliveryAccepted === false
          ? "Your account was created, but the email provider could not send the code. Try Resend code after one minute."
          : "Check your email for a verification code. Codes expire; you can resend after one minute.");
      }
    } catch (e) {
      if (googleRegistration) setGoogleRegistration(null);
      if ((e as ServiceError)?.code === "REGISTRATION_POLICY_REQUIRED") setPolicyRequest(current => current + 1);
      setLastError(normalizeUiError(e, "Register failed."));
    } finally {
      setBusy(false);
    }
  }

  async function submitVerifyEmail(): Promise<void> {
    const targetEmail = pendingVerificationEmail?.trim();
    if (!targetEmail) {
      setLastError("Email is required.");
      return;
    }
    requestLocationPermission();
    setBusy(true);
    setLastError(null);
    setAuthInfo("");
    try {
      const res = await api.verifyEmail(targetEmail, verificationCode.trim());
      const ageFromRegister = Number(registerAge);
      const preferredAge = Number.isFinite(ageFromRegister) ? ageFromRegister : undefined;
      const nextSession = await autoVerifyAgeForRegisteredSession(res.session, preferredAge);
      persistSessionToken(res.session.sessionToken);
      setSessionToken(res.session.sessionToken);
      setSession(nextSession);
    } catch (e) {
      setLastError(normalizeUiError(e, "Email verification failed."));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerificationCode(): Promise<void> {
    const targetEmail = pendingVerificationEmail?.trim();
    if (!targetEmail) {
      setLastError("Email is required.");
      return;
    }
    setBusy(true);
    setLastError(null);
    setAuthInfo("");
    try {
      const res = await api.resendVerification(targetEmail);
      setPendingVerificationEmail(res.email);
      setAuthInfo("A new verification code was sent.");
    } catch (e) {
      setLastError(normalizeUiError(e, "Resend failed."));
    } finally {
      setBusy(false);
    }
  }

  async function completeLogin(signedInSession: Session, preferredAge?: number): Promise<void> {
    const nextSession = await autoVerifyAgeForRegisteredSession(signedInSession, preferredAge);
    persistSessionToken(signedInSession.sessionToken);
    setSessionToken(signedInSession.sessionToken);
    setSession(nextSession);
    setLoginSequence(n => n + 1);
  }

  async function submitLogin(google?: GoogleCredential): Promise<boolean> {
    if (busy) return false;
    requestLocationPermission();
    setBusy(true);
    setLastError(null);
    setAuthInfo("");
    try {
      const res = google ? await api.loginWithGoogle(google.credential, google.nonce) : await api.login(loginEmail, loginPassword);
      await completeLogin(res.session);
      return true;
    } catch (e) {
      const err = e as ServiceError;
      const msg = normalizeUiError(e, "Login failed.");
      const needsVerification = !google && isVerificationRequiredError(e);
      if (needsVerification) {
        const targetEmail = typeof err.context?.email === "string" ? err.context.email : loginEmail;
        setPendingVerificationEmail(targetEmail);
        setAuthView("login");
        setAuthInfo("Verify your email before login. Check your inbox or resend the code.");
        return false;
      }
      setLastError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitAgeGate(): Promise<void> {
    if (!session) return;
    setBusy(true);
    setLastError(null);
    try {
      const age = Number(ageYears);
      const res = await api.verifyAge(session.sessionToken, age);
      setSession(res.session);
    } catch (e) {
      setLastError(normalizeUiError(e, "Age declaration failed."));
    } finally {
      setBusy(false);
    }
  }

  async function submitProfileSetup(): Promise<void> {
    if (!session) return;
    if (session.userType === "guest") {
      setProfileSetupRequired(false);
      return;
    }
    const displayName = profileSetupDraft.displayName.trim();
    const ageNum = Number(profileSetupDraft.age);
    if (displayName.length < 2 || displayName.length > 32) {
      setLastError("Display name must be 2-32 characters.");
      return;
    }
    if (!Number.isFinite(ageNum) || !Number.isInteger(ageNum) || ageNum < 18 || ageNum > 120) {
      setLastError("Age must be an integer between 18 and 120.");
      return;
    }
    setBusy(true);
    setLastError(null);
    try {
      await api.upsertMyProfile(session.sessionToken, {
        displayName,
        age: ageNum,
        bio: profileSetupDraft.bio.trim(),
        stats: {
          race: profileSetupDraft.race.trim() || undefined,
          heightInches: profileSetupDraft.heightFeet ? Number(profileSetupDraft.heightFeet) * 12 + Number(profileSetupDraft.heightRemainder) : undefined,
          weightLbs: parseOptionalInt(profileSetupDraft.weightLbs),
          position: profileSetupDraft.position || undefined
        }
      });
      setProfileSetupRequired(false);
    } catch (e) {
      setLastError(normalizeUiError(e, "Profile setup failed."));
    } finally {
      setBusy(false);
    }
  }

  const [isMobile, setIsMobile] = useState<boolean>(() => window.matchMedia("(max-width: 900px)").matches);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 900px)");
    const onChange = () => setIsMobile(m.matches);
    onChange();
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  const isMapFullScreen = session?.ageVerified === true && activeTab === "discover" && discoverScreen === "map";

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== "function" && typeof nav.clearAppBadge !== "function") return;
    if (unreadChatCount > 0 && typeof nav.setAppBadge === "function") {
      void nav.setAppBadge(unreadChatCount).catch(() => {});
      return;
    }
    if (typeof nav.clearAppBadge === "function") {
      void nav.clearAppBadge().catch(() => {});
    }
  }, [unreadChatCount]);

  useEffect(() => {
    if (!session || session.userType === "guest" || session.ageVerified !== true) {
      setProfileSetupChecking(false);
      setProfileSetupRequired(false);
      return;
    }
    let cancelled = false;
    setProfileSetupChecking(true);
    api
      .getMyProfile(session.sessionToken)
      .then((res) => {
        if (cancelled) return;
        if (res.profile.displayName.trim().length >= 2 && Number.isInteger(res.profile.age) && res.profile.age >= 18 && res.profile.age <= 120) {
          setProfileSetupRequired(false);
          return;
        }
        setProfileSetupRequired(true);
      })
      .catch((e) => {
        if (cancelled) return;
        const err = e as ServiceError;
        if (err?.code === "PROFILE_NOT_FOUND") {
          setProfileSetupRequired(true);
          setProfileSetupDraft((prev) => ({
            ...prev,
            displayName: prev.displayName || registerDisplayName.trim(),
            age: prev.age || registerAge.trim() || ageYears.trim()
          }));
          return;
        }
        setLastError(normalizeUiError(e, "Unable to load profile status."));
        setProfileSetupRequired(false);
      })
      .finally(() => {
        if (!cancelled) setProfileSetupChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, ageYears, registerAge, registerDisplayName, session?.sessionToken, session?.ageVerified, session?.userType, session?.userId]);

  const setTabAndRoute = useCallback((tab: TopTab, nextDiscoverScreen?: DiscoverScreen): void => {
    if (FULL_PAGE_TAB_NAV) {
      const nextUrl = urlForTab(tab, sessionToken);
      const currentPath = window.location.pathname;
      const currentSlash = currentPath.lastIndexOf("/");
      const currentBase = currentSlash >= 0 ? currentPath.slice(0, currentSlash + 1) : "/";
      const currentFile = currentPath.slice(currentBase.length) || "index.html";
      const normalizedCurrentFile = currentFile.toLowerCase();
      const targetFile = tab === DEFAULT_TAB ? "index.html" : `${tab}.html`;
      if (normalizedCurrentFile !== targetFile.toLowerCase()) {
        window.location.assign(nextUrl);
        return;
      }
      setActiveTab(tab);
      window.dispatchEvent(new CustomEvent("rd:tab-select", { detail: { tab } }));
      return;
    }
    setActiveTab(tab);
    const discoverTarget = nextDiscoverScreen ?? discoverScreen;
    if (tab === "discover") setDiscoverScreen(discoverTarget);
    const nextHash = hashForTab(tab, discoverTarget);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
    window.dispatchEvent(new CustomEvent("rd:tab-select", { detail: { tab } }));
  }, [discoverScreen, sessionToken]);

  const openSelfProfilePreview = useCallback((): void => {
    setTabAndRoute("discover", "chat");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("rd:open-self-profile"));
    }, 0);
  }, [setTabAndRoute]);

  const previousUnread = useRef<number | null>(null);
  useEffect(() => {
    const previous = previousUnread.current;
    previousUnread.current = unreadChatCount;
    if (previous === null || unreadChatCount <= previous || !document.hidden || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try { if (localStorage.getItem(NOTIFICATION_ENABLED) !== "true") return;
      const discreet = localStorage.getItem(NOTIFICATION_DISCREET) !== "false";
      const notification = new Notification("Badehaus X", {body: discreet ? "You have a new message." : `${unreadChatCount} unread messages.`, tag:"reddoor-messages"});
      notification.onclick = () => { window.focus(); setTabAndRoute("threads"); notification.close(); };
    } catch { /* Browser notifications are optional. */ }
  }, [unreadChatCount, setTabAndRoute]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty("--rd-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      const editing = document.activeElement?.matches("input,textarea,[contenteditable=true]");
      document.documentElement.dataset.keyboardOpen = editing && window.innerHeight - (viewport?.height ?? window.innerHeight) > 120 ? "true" : "false";
    };
    update(); viewport?.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); document.documentElement.style.removeProperty("--rd-viewport-height"); };
  }, []);

  const toggleTopFilterPanel = useCallback((): void => {
    if (topMenuOpen) setTopMenuOpen(false);
    setTabAndRoute("discover", discoverScreen);
    window.dispatchEvent(new CustomEvent("rd:discover-control", { detail: { action: "open_filters" } }));
  }, [discoverScreen, setTabAndRoute, topMenuOpen]);

  useEffect(() => {
    if (FULL_PAGE_TAB_NAV) {
      setActiveTab(tabFromLocation());
      return;
    }
    if (!/\/thebackroom\/?$/.test(window.location.pathname) && !window.location.hash) window.history.replaceState(null, "", hashForTab(tabFromLocation(), "chat"));
    const onHashChange = (): void => {
      setActiveTab(tabFromHash());
      setDiscoverScreen(discoverScreenFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    setTopMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    const open = (event: Event) => { const feature = (event as CustomEvent<{feature?:unknown}>).detail?.feature; setPlusFeature(isPlusFeature(feature) ? feature : undefined); setPlusOpen(true); };
    window.addEventListener("rd:open-plus", open);
    return () => window.removeEventListener("rd:open-plus", open);
  }, []);
  useEffect(() => {
    if (!session) return;
    const refresh = () => { void api.getSession(session.sessionToken).then(r => setSession(r.session)).catch(e => { if (e?.code === "INVALID_SESSION" || e?.code === "SESSION_NOT_FOUND") onLogout(); }); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);window.addEventListener("rd:plus-changed",refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh);window.removeEventListener("rd:plus-changed",refresh); };
  }, [api, session?.sessionToken]);
  const topAvatar = topAvatarUrl ?? avatarForSeed(session?.userId ?? session?.sessionToken ?? "guest");
  const mobileFramedShell = isMobile && Boolean(session && session.ageVerified === true);
  const showBottomNav = Boolean(session && session.ageVerified === true && !profileSetupRequired && !profileSetupChecking);
  const desktopWideSession = Boolean(session && session.ageVerified === true && !isMobile);
  const [filtersActive, setFiltersActive] = useState(false);
  useEffect(() => {
    const update = (event: Event) => setFiltersActive((event as CustomEvent<{ keys: string[] | null }>).detail.keys !== null);
    window.addEventListener("rd:people-filter", update);
    return () => window.removeEventListener("rd:people-filter", update);
  }, []);
  if (/\/thebackroom\/?$/.test(window.location.pathname)) return <Backroom api={api} session={session} />;

  const showExploreShortcuts = showBottomNav && activeTab === "discover";
  const exploreControls = showExploreShortcuts && session ? <>
    <RightNowControl key={session.userId} api={api} session={session} />
    <button type="button" className="rd-btn rd-app-tool"
      onClick={toggleTopFilterPanel} aria-label="Open filter controls" title="Filters">
      <Icon name="filter" active={filtersActive} />
    </button>
  </> : null;
  const publicToolbarActions = (
    <>
      <InstallApp iconOnly />
      <a className="rd-btn rd-topbar-icon" href="./thebackroom/" aria-label="The Backroom" title="The Backroom">
        <Icon name="book" />
      </a>
      <a className="rd-btn rd-topbar-icon" href="https://badehausx.com/store/" aria-label="Store" title="Store">
        <Icon name="shopping-bag" />
      </a>
    </>
  );

  return (
    <div className={`rd-shell ${mobileFramedShell ? "mobile-framed" : ""} ${showBottomNav ? "has-bottom-nav rd-app-bars" : ""}`}>
      {recoveryOpen ? <PasswordRecovery api={api} token={recoveryToken} onClose={() => { setRecoveryOpen(false); setRecoveryToken(""); }} onComplete={() => { onLogout(); setRecoveryOpen(false); setRecoveryToken(""); setAuthView("login"); setAuthInfo("Password updated. Sign in with your new password."); }} /> : null}
      {analyticsOpen && session?.role === "admin" ? <AdminAnalytics api={api} session={session} onClose={() => setAnalyticsOpen(false)} /> : null}
      <AccountNotices api={api} session={session} ready={Boolean(session?.ageVerified && !profileSetupChecking && !profileSetupRequired && !plusOpen)} loginSequence={loginSequence}/>
      {plusOpen ? <PlusPanel api={api} session={session} feature={plusFeature} onClose={() => setPlusOpen(false)} onRegister={() => { setPlusOpen(false); onLogout(); setAuthView("register"); }} /> : null}
        <header className={`rd-topbar ${isMobile ? "mobile" : ""} ${desktopWideSession ? "rd-topbar-wide" : ""}`}>
          <div className="rd-topbar-inner">
            {session?.ageVerified === true ? (
              <div className="rd-app-toolbar">
                <div className="rd-app-toolbar-side">
                  <button type="button" className="rd-btn rd-app-tool" aria-label="Badehaus X Explore" title="Explore"
                    onClick={() => setTabAndRoute("discover", discoverScreen)}>
                    <img src={brandMark} className="rd-app-brand-mark" alt="" />
                  </button>
                  <InstallApp iconOnly />
                </div>
                <button type="button" className="rd-top-avatar rd-app-avatar" aria-label="Open my profile preview"
                  onClick={openSelfProfilePreview}>
                  <img src={topAvatar} alt="" className="rd-mobile-avatar-img" />
                  <span className="rd-mobile-avatar-dot" />
                </button>
                <div className="rd-app-toolbar-side rd-app-toolbar-end">
                  {session.userId && <button type="button" className="rd-btn rd-app-tool" aria-label="Live" title="Live"
                    aria-current={activeTab === "live" ? "page" : undefined} onClick={() => setTabAndRoute("live")}>
                    <Icon name="live" active={activeTab === "live" || liveState.broadcasts.some(room => room.live)} />
                  </button>}
                  <button type="button" className="rd-btn rd-app-tool" aria-label="Open account functions" title="Settings"
                    aria-expanded={topMenuOpen} onClick={() => setTopMenuOpen(open => !open)}>
                    <Icon name="settings" active={topMenuOpen || activeTab === "settings"} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="rd-brand rd-entry-brand">
                <img src={brandMark} className="rd-app-brand-mark" alt="" />
                <div className="rd-name">Badehaus X</div>
                {publicToolbarActions}
              </div>
            )}
          </div>
          {session?.userId && (
            <NotificationPrompt key={session.userId} api={api} session={session} ready={showBottomNav} />
          )}
        </header>
      {session && session.ageVerified === true && topMenuOpen ? (
        <div className="rd-top-collapse" role="dialog" aria-label="Account functions">
          <button type="button" className="rd-btn rd-icon-only-btn" onClick={toggleTopFilterPanel} aria-label="Open filter controls">
            <Icon name="filter" active={filtersActive} />
          </button>
          <button type="button" className="rd-btn rd-icon-only-btn" onClick={() => { setTopMenuOpen(false); setPlusFeature(undefined); setPlusOpen(true); }} aria-label="Open Badehaus X Plus">
            <Icon name={hasPlus(session) ? "check" : "plus"} />
          </button>
          <a className="rd-btn rd-icon-only-btn" href="./thebackroom/" aria-label="The Backroom"><Icon name="book" /></a>
          <a className="rd-btn rd-icon-only-btn" href="https://badehausx.com/store/" aria-label="Store"><Icon name="shopping-bag" /></a>
          <ReferralToolbar api={api} session={session} onOpen={() => {
            setTopMenuOpen(false);
            setTabAndRoute("settings");
            window.dispatchEvent(new CustomEvent("rd:settings-section", { detail: "plan" }));
          }} />

          {session.role === "admin" ? <button type="button" className="rd-btn rd-icon-only-btn" onClick={() => { setTopMenuOpen(false); setAnalyticsOpen(true); }} aria-label="Open activity dashboard"><Icon name="board" className="rd-ui-icon" /></button> : null}
          <button type="button" className="rd-btn rd-icon-only-btn" onClick={() => { setTopMenuOpen(false); openSelfProfilePreview(); }} aria-label="Open profile preview">
            <Icon name="user" className="rd-ui-icon" />
          </button>
          <button type="button" className="rd-btn rd-icon-only-btn" onClick={() => { setTopMenuOpen(false); setTabAndRoute("settings"); }} aria-label="Open settings">
            <Icon name="settings" className="rd-ui-icon" />
          </button>
          <button type="button" className="rd-btn rd-icon-only-btn" onClick={() => { setTopMenuOpen(false); setTabAndRoute("submissions"); }} aria-label="Open submissions">
            <Icon name="book" className="rd-ui-icon" />
          </button>
          <button type="button" className="rd-btn rd-icon-only-btn" onClick={() => { setTopMenuOpen(false); void onLogout(); }} aria-label="Log out">
            <Icon name="logout" className="rd-ui-icon" />
          </button>
        </div>
      ) : null}

      <main
        className={`rd-main ${isMobile ? "mobile" : ""} ${session ? "" : "rd-home-main"} ${isMapFullScreen ? "rd-main-full-map" : ""} ${showBottomNav ? "rd-main-with-bottom-nav" : ""} ${desktopWideSession ? "rd-main-desktop-wide" : ""}`}
      >
        <div className="rd-inbox-live-status" role="status" hidden={isMobile || activeTab!=="threads" || !session?.ageVerified}>{liveInboxStatus}</div>
        <div className="rd-grid">
          {!session ? (
            <>
              <section className="rd-card rd-auth-hero" aria-label="Authentication">
                <div className="rd-card-head">
                  <h1 className="rd-card-title">{authView === "login" ? "Log in" : authView === "register" ? "Create an account" : "Browse anonymously"}</h1>
                </div>

                <div className="rd-tabs" role="tablist" aria-label="Authentication tabs">
                  <button
                    type="button"
                    className={`rd-tab ${authView === "guest" ? "active" : ""}`}
                    onClick={() => switchAuthView("guest")}
                    disabled={busy}
                    aria-label="Anon login"
                    role="tab"
                    aria-selected={authView === "guest"}
                  >
                    Anon
                  </button>
                  <button
                    type="button"
                    className={`rd-tab ${authView === "register" ? "active" : ""}`}
                    onClick={() => switchAuthView("register")}
                    disabled={busy}
                    aria-label="Register"
                    role="tab"
                    aria-selected={authView === "register"}
                  >
                    Register
                  </button>
                  <button
                    type="button"
                    className={`rd-tab ${authView === "login" ? "active" : ""}`}
                    onClick={() => switchAuthView("login")}
                    disabled={busy}
                    aria-label="Login"
                    role="tab"
                    aria-selected={authView === "login"}
                  >
                    Login
                  </button>
                </div>

                <div className="rd-card-body">
                  {lastError ? (
                    <div
                      role="alert"
                      aria-live="polite"
                      style={{
                        color: "#ff848f",
                        background: "rgba(120, 8, 18, 0.35)",
                        border: "1px solid rgba(255, 90, 100, 0.5)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        marginBottom: 12
                      }}
                    >
                      {lastError}
                    </div>
                  ) : null}

                  {authInfo ? <div style={{ color: "#ff7a88", marginBottom: 12 }}>{authInfo}</div> : null}
                  {pendingVerificationEmail !== null ? (
                    <div style={{ color: "var(--muted)", marginBottom: 12 }}>
                      Check the email or phone associated with your account. Contact support if your code does not arrive.
                    </div>
                  ) : null}

                  {authView === "guest" ? (
                    <div className="rd-row">
                      <button type="button" className="rd-btn primary" onClick={() => void createGuest()} disabled={busy} aria-label="Create guest session">
                        Continue as a guest
                      </button>
                    </div>
                  ) : null}

                  <p className="rd-auth-note"><Icon name="shield" />For adults 18 and over. You choose what to share.</p>

                  {authView === "register" && (googleRegistration ? (
                    <div className="rd-row">
                      <span>Google account selected</span>
                      <button type="button" className="rd-btn" disabled={busy} onClick={() => setGoogleRegistration(null)}>Use email and password</button>
                    </div>
                  ) : <GoogleSignInButton key="google-register" api={api} register disabled={busy} onCredential={credential => {
                    setGoogleRegistration(credential);
                    setLastError(null);
                    setAuthInfo("");
                    return true;
                  }} />)}
                  {authView === "register" || authView === "login" ? (
                    <form
                      key={authView}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void (authView === "register" ? submitRegister() : submitLogin());
                      }}
                    >
                      {(!googleRegistration || authView === "login") && (
                        <>
                          <label className="rd-field">
                            <span className="rd-label">Email</span>
                            <input className="rd-input" value={authView === "register" ? registerEmail : loginEmail}
                              onChange={(e) => (authView === "register" ? setRegisterEmail : setLoginEmail)(e.target.value)}
                              type="email" autoComplete="username" autoCapitalize="none" aria-label="Email" />
                          </label>
                          <label className="rd-field">
                            <span className="rd-label">Password</span>
                            <input className="rd-input" value={authView === "register" ? registerPassword : loginPassword}
                              onChange={(e) => (authView === "register" ? setRegisterPassword : setLoginPassword)(e.target.value)}
                              type="password" autoComplete={authView === "register" ? "new-password" : "current-password"} aria-label="Password" />
                          </label>
                        </>
                      )}

                      {authView === "register" ? (
                        <label className="rd-field">
                          <span className="rd-label">Display Name</span>
                          <input className="rd-input" value={registerDisplayName} onChange={(e) => setRegisterDisplayName(e.target.value)} aria-label="Display name" />
                        </label>
                      ) : null}

                      {authView === "register" ? (
                        <label className="rd-field">
                          <span className="rd-label">Age</span>
                          <input
                            className="rd-input"
                            value={registerAge}
                            onChange={(e) => setRegisterAge(e.target.value)}
                            inputMode="numeric"
                            aria-label="Age"
                          />
                        </label>
                      ) : null}

                      {authView === "register" ? (
                        <label className="rd-field">
                          <span className="rd-label">Phone (E.164, optional)</span>
                          <input
                            className="rd-input"
                            value={phoneE164}
                            onChange={(e) => setPhoneE164(e.target.value)}
                            placeholder="+15555551234"
                            aria-label="Phone number"
                          />
                        </label>
                      ) : null}

                      {authView === "register" ? (
                        <label className="rd-field"><span className="rd-label">Promo code (optional)</span><input className="rd-input" value={promoCode} onChange={e => setPromoCode(e.target.value)} aria-label="Promo code" autoComplete="off" />{Date.now() < LAUNCH_END_MS ? <span className="rd-launch-offer">Launch and gift codes unlock complimentary Plus through December 31, 2026. Priority referral codes unlock a separate paid offer in Settings.</span> : null}</label>
                      ) : null}
                      {authView === "register" && policy?.status === "required" ? <label className="rd-field">
                        <span><input type="checkbox" checked={acceptedPolicy} required onChange={event => setAcceptedPolicy(event.target.checked)} /> I accept the{" "}
                          <a href={policy.terms.url} target="_blank" rel="noopener noreferrer">Terms of Service</a>{" "}and{" "}
                          <a href={policy.privacy.url} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                        </span>
                      </label> : null}
                      {authView === "register" && policy?.status === "unavailable" ? <div role="status">
                        <p>Registration information is temporarily unavailable.</p>
                        <button type="button" className="rd-btn" onClick={() => setPolicyRequest(current => current + 1)}>Retry</button>
                      </div> : null}
                      {authView === "register" ? <label className="rd-field"><span><input type="checkbox" checked={marketingConsent} onChange={event => setMarketingConsent(event.target.checked)} /> {MARKETING_CONSENT_LABEL}</span></label> : null}
                      {authView === "register" ? <label className="rd-field" style={{ fontSize: 12, color: "var(--muted)" }}><span><input type="checkbox" checked={analyticsConsent} onChange={e => setAnalyticsConsent(e.target.checked)} /> Help improve Badehaus X (optional)</span><span>Share activity counts using a protected account identifier. Daily activity is kept for 35 days; inactive measurement records are deleted after 35 days. No message content, photos, or location. Change this in settings anytime.</span></label> : null}
                      {authView === "register" && !googleRegistration ? (
                        <div style={{ color: "var(--muted)", marginBottom: 10, fontSize: 13 }}>
                          Use at least 10 characters with uppercase, lowercase, a number and a symbol.
                        </div>
                      ) : null}

                      <div className="rd-row">
                        <button type="submit" className="rd-btn primary" disabled={busy || (authView === "register" && !canRegister)} aria-label={authView === "register" ? "Register" : "Login"}>
                          {authView === "register" ? "Register" : "Login"}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {authView === "login" ? <>
                    <GoogleSignInButton key="google-login" api={api} disabled={busy} onCredential={submitLogin} />
                    <button type="button" className="rd-btn" onClick={() => { setRecoveryToken(""); setRecoveryOpen(true); }}>Forgot password?</button>
                  </> : null}
                  {pendingVerificationEmail !== null && (authView === "register" || authView === "login") ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitVerifyEmail();
                      }}
                    >
                      <label className="rd-field">
                        <span className="rd-label">Email</span>
                        <input
                          className="rd-input"
                          value={pendingVerificationEmail}
                          onChange={(e) => setPendingVerificationEmail(e.target.value)}
                          type="email" autoComplete="email" autoCapitalize="none" aria-label="Verification email"
                        />
                      </label>

                      <label className="rd-field">
                        <span className="rd-label">6-digit verification code</span>
                        <input
                          className="rd-input"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                          inputMode="numeric"
                          aria-label="Verification code"
                        />
                      </label>

                      <div className="rd-row">
                        <button type="submit" className="rd-btn primary" disabled={busy} aria-label="Verify email">
                          Verify Email
                        </button>
                        <button type="button" className="rd-btn" disabled={busy} onClick={() => void resendVerificationCode()} aria-label="Resend verification code">
                          Resend Code
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </section>

              <section className="rd-card rd-home-hero" aria-label="Welcome to Badehaus X">
                <div className="rd-card-body">
                  <img className="rd-afterdark-art" src={afterDark} alt="" aria-hidden="true" />
                  <h2>See who’s inside.</h2>
                  <p className="rd-home-copy">A space for gay men to explore, chat, and connect.</p>
                  <div className="rd-welcome-features"><span><Icon name="explore" />Explore nearby</span><span><Icon name="message" />Start a conversation</span><span><Icon name="shield" />Go at your pace</span></div>
                </div>
              </section>
            </>
          ) : null}

          {session && session.ageVerified !== true ? (
            <section className="rd-card" aria-label="Age gate"><p className="rd-caption">Adults 18+ only. This is your age declaration, not independent identity or age verification.</p>
              <div className="rd-card-head">
                <div className="rd-card-title">Before you step inside</div>
                <div className="rd-card-sub">18+ required</div>
              </div>
              <div className="rd-card-body">
                <div style={{ color: "var(--muted)", marginBottom: 12 }}>Badehaus X is for adults 18 and over. Confirm your age to continue.</div>
                {lastError ? (
                  <div className="rd-error" role="alert" aria-live="polite" style={{ marginBottom: 12, marginTop: 0 }}>
                    {lastError}
                  </div>
                ) : null}
                <label className="rd-field">
                  <span className="rd-label">Age (Years)</span>
                  <input className="rd-input" value={ageYears} onChange={(e) => setAgeYears(e.target.value)} aria-label="Age in years" />
                </label>
                <div className="rd-row">
                  <button type="button" className="rd-btn primary" onClick={() => void submitAgeGate()} disabled={busy} aria-label="Confirm age">
                    Confirm
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {session && session.ageVerified === true ? (
            session.userType !== "guest" && (profileSetupChecking || profileSetupRequired) ? (
              <section className="rd-card" aria-label="Complete your profile">
                <div className="rd-card-head">
                  <div className="rd-card-title">Complete Your Profile</div>
                  <div className="rd-card-sub">Display name and age are required</div>
                </div>
                <div className="rd-card-body">
                  {lastError ? (
                    <div className="rd-error" role="alert" aria-live="polite" style={{ marginBottom: 12, marginTop: 0 }}>
                      {lastError}
                    </div>
                  ) : null}
                  {profileSetupChecking ? (
                    <div style={{ color: "var(--muted)", marginBottom: 12 }}>Checking profile status...</div>
                  ) : (
                    <>
                      <div style={{ color: "var(--muted)", marginBottom: 12 }}>
                        New accounts must set a display name and age before entering the app.
                      </div>
                      <label className="rd-field">
                        <span className="rd-label">Display Name</span>
                        <input
                          className="rd-input"
                          value={profileSetupDraft.displayName}
                          onChange={(e) => setProfileSetupDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                          aria-label="Profile display name"
                        />
                      </label>
                      <label className="rd-field">
                        <span className="rd-label">Age</span>
                        <input
                          className="rd-input"
                          value={profileSetupDraft.age}
                          onChange={(e) => setProfileSetupDraft((prev) => ({ ...prev, age: e.target.value }))}
                          inputMode="numeric"
                          aria-label="Profile age"
                        />
                      </label>
                      <label className="rd-field">
                        <span className="rd-label">Bio (Optional)</span>
                        <textarea
                          className="rd-input"
                          value={profileSetupDraft.bio}
                          onChange={(e) => setProfileSetupDraft((prev) => ({ ...prev, bio: e.target.value }))}
                          aria-label="Profile bio"
                        />
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                        <label className="rd-field" style={{ marginBottom: 0 }}>
                          <span className="rd-label">Race (Optional)</span>
                          <select className="rd-input" value={profileSetupDraft.race} aria-label="Profile race"
                            onChange={e => setProfileSetupDraft(prev => ({ ...prev, race: e.target.value }))}>
                            <option value="">Select an option</option>
                            {["Black", "East Asian", "Indigenous", "Latino / Hispanic", "Middle Eastern / North African", "Pacific Islander", "South Asian", "Southeast Asian", "White", "Mixed / Multiracial", "Other", "Prefer not to say"].map(race =>
                              <option key={race}>{race}</option>)}
                          </select>
                        </label>
                        <fieldset className="rd-field" style={{ margin: 0, border: 0, padding: 0, minWidth: 0 }}>
                          <legend className="rd-label">Height (Optional)</legend>
                          <div style={{ display: "flex", gap: 8 }}>
                            <select className="rd-input" aria-label="Height in feet" value={profileSetupDraft.heightFeet}
                              onChange={e => setProfileSetupDraft(prev => ({ ...prev, heightFeet: e.target.value }))}>
                              <option value="">Feet</option>
                              {[3, 4, 5, 6, 7].map(feet => <option key={feet} value={feet}>{feet} ft</option>)}
                            </select>
                            <select className="rd-input" aria-label="Additional inches" disabled={!profileSetupDraft.heightFeet} value={profileSetupDraft.heightRemainder}
                              onChange={e => setProfileSetupDraft(prev => ({ ...prev, heightRemainder: e.target.value }))}>
                              {Array.from({ length: 13 }, (_, inches) => <option key={inches} value={inches}>{inches} in</option>)}
                            </select>
                          </div>
                        </fieldset>
                        <label className="rd-field" style={{ marginBottom: 0 }}>
                          <span className="rd-label">Weight in Lbs (Optional)</span>
                          <input
                            className="rd-input"
                            value={profileSetupDraft.weightLbs}
                            onChange={(e) => setProfileSetupDraft((prev) => ({ ...prev, weightLbs: e.target.value }))}
                            inputMode="numeric"
                            aria-label="Profile weight in pounds"
                          />
                        </label>
                        <label className="rd-field" style={{ marginBottom: 0 }}>
                          <span className="rd-label">Position (Optional)</span>
                          <select
                            className="rd-input"
                            value={profileSetupDraft.position}
                            onChange={(e) => setProfileSetupDraft((prev) => ({ ...prev, position: e.target.value as ProfilePosition }))}
                            aria-label="Profile position"
                          >
                            <option value="">Select</option>
                            <option value="top">Top</option>
                            <option value="bottom">Bottom</option>
                            <option value="side">Side</option>
                          </select>
                        </label>
                      </div>
                      <div className="rd-row">
                        <button type="button" className="rd-btn primary" onClick={() => void submitProfileSetup()} disabled={busy} aria-label="Save profile and continue">
                          Save and Continue
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </section>
            ) : (
            <Suspense fallback={<section className="rd-card"><div className="rd-card-body">Loading screen...</div></section>}>
              <LiveContext.Provider value={liveState}><Router
                api={api}
                session={session}
                setSession={setSession}
                settings={settings}
                activeTab={activeTab}
                setActiveTab={setTabAndRoute}
                mapControls={discoverScreen === "map" ? exploreControls : null}
                discoverScreen={discoverScreen}
                discoverFilter={discoverFilter}
                busy={busy}
                setBusy={setBusy}
                setLastError={setLastError}
                onUnreadCountChange={() => {}}
                onLogout={onLogout}
              /></LiveContext.Provider>
            </Suspense>
            )
          ) : null}
        </div>
      </main>

      {showBottomNav ? (
        <nav className="rd-app-dock" aria-label="Primary navigation">
          {discoverScreen !== "map" && exploreControls && <div className="rd-app-dock-context">{exploreControls}</div>}
          <button type="button" className="rd-btn rd-app-tool" aria-label="Explore" title="Explore"
            aria-current={activeTab === "discover" ? "page" : undefined}
            onClick={() => setTabAndRoute("discover", discoverScreen)}>
            <Icon name="explore" active={activeTab === "discover"} />
          </button>
          <button type="button" className="rd-btn rd-app-tool" aria-label="Inbox overlay" title="Inbox"
            aria-current={activeTab === "threads" ? "page" : undefined}
            onClick={() => activeTab === "threads" && isMobile ? setTabAndRoute("discover", "map") : setTabAndRoute("threads")}>
            <Icon name="message" active={activeTab === "threads"} />
            {unreadChatCount > 0 && <span className="rd-app-inbox-badge" aria-label={`${unreadChatCount} unread`}>
              {unreadChatCount > 99 ? "99+" : unreadChatCount}
            </span>}
          </button>
          <div className="rd-app-dock-views" aria-label="Explore views">
            <button type="button" className="rd-btn rd-app-tool" aria-label="People" title="People"
              aria-pressed={activeTab === "discover" && discoverScreen === "chat"}
              onClick={() => setTabAndRoute("discover", "chat")}>
              <Icon name="grid" active={activeTab === "discover" && discoverScreen === "chat"} />
            </button>
            <button type="button" className="rd-btn rd-app-tool" aria-label="Map" title="Map"
              aria-pressed={activeTab === "discover" && discoverScreen === "map"}
              onClick={() => setTabAndRoute("discover", "map")}>
              <Icon name="map" active={activeTab === "discover" && discoverScreen === "map"} />
            </button>
          </div>
          <button type="button" className="rd-btn rd-app-tool" aria-label="Groups" title="Groups"
            aria-current={activeTab === "groups" ? "page" : undefined} onClick={() => setTabAndRoute("groups")}>
            <Icon name="groups" active={activeTab === "groups"} />
          </button>
          <button type="button" className="rd-btn rd-app-tool" aria-label="Postings" title="Postings"
            aria-current={activeTab === "ads" ? "page" : undefined}
            onClick={() => activeTab === "ads" && isMobile ? setTabAndRoute("discover", "map") : setTabAndRoute("ads")}>
            <Icon name="postings" active={activeTab === "ads"} />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
