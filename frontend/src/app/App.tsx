import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { apiClient, type ServiceError, type Session } from "./api";
import placeholderA from "../assets/reddoor-placeholder-1.svg";
import placeholderB from "../assets/reddoor-placeholder-2.svg";
import placeholderC from "../assets/reddoor-placeholder-3.svg";
import welcomeDoorImage from "../assets/appbackground.png";

type AuthView = "guest" | "register" | "login";
type TopTab = "discover" | "threads" | "ads" | "groups" | "cruise" | "profile" | "settings" | "submissions" | "promoted";
type DiscoverFilter = "all" | "online" | "favorites";
type DiscoverScreen = "map" | "chat";
type ProfilePosition = "" | "top" | "bottom" | "side";

type ProfileSetupDraft = Readonly<{
  displayName: string;
  age: string;
  bio: string;
  race: string;
  heightInches: string;
  weightLbs: string;
  position: ProfilePosition;
}>;

const SESSION_TOKEN_KEY = "reddoor_session_token";
const WINDOW_NAME_TOKEN_PREFIX = "rdst:";
const DEFAULT_SHARED_API_BASE = "https://red-door-api.onrender.com";
const TAB_SET: ReadonlySet<TopTab> = new Set(["discover", "threads", "ads", "groups", "cruise", "profile", "settings", "submissions", "promoted"]);
const DEFAULT_TAB: TopTab = "discover";
const FULL_PAGE_TAB_NAV = false;
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
}

function resolveApiBasePath(): string {
  const configured = typeof __DUALMODE_API_BASE_PATH__ === "string" ? __DUALMODE_API_BASE_PATH__.trim() : "";
  if (!configured || configured === "__disabled__") {
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

function emptyProfileSetupDraft(): ProfileSetupDraft {
  return {
    displayName: "",
    age: "",
    bio: "",
    race: "",
    heightInches: "",
    weightLbs: "",
    position: ""
  };
}

export function App(): React.ReactElement {
  const api = useMemo(() => apiClient(resolveApiBasePath()), []);

  const [settings] = useState<Settings>(() => loadSettingsFromEnv());

  const [sessionToken, setSessionToken] = useState<string | null>(() => initialSessionToken());
  const [session, setSession] = useState<Session | null>(null);

  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const [authView, setAuthView] = useState<AuthView>("guest");
  const [activeTab, setActiveTab] = useState<TopTab>(() => tabFromLocation());
  const [discoverScreen, setDiscoverScreen] = useState<DiscoverScreen>(() => discoverScreenFromHash());
  const [discoverFilter, setDiscoverFilter] = useState<DiscoverFilter>("all");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [phoneE164, setPhoneE164] = useState<string>("");
  const [registerDisplayName, setRegisterDisplayName] = useState<string>("");
  const [registerAge, setRegisterAge] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>("");
  const [authInfo, setAuthInfo] = useState<string>("");
  const [ageYears, setAgeYears] = useState<string>("");
  const [profileSetupDraft, setProfileSetupDraft] = useState<ProfileSetupDraft>(() => emptyProfileSetupDraft());
  const [profileSetupRequired, setProfileSetupRequired] = useState<boolean>(false);
  const [profileSetupChecking, setProfileSetupChecking] = useState<boolean>(false);
  const [topAvatarUrl, setTopAvatarUrl] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

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
    setBusy(true);
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
      })
      .finally(() => setBusy(false));
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
    void refreshTopAvatar();
    const id = window.setInterval(() => {
      void refreshTopAvatar();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
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
        const meKey = activeSession.userId ? `user:${activeSession.userId}` : `session:${activeSession.sessionToken}`;
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

  function onLogout(): void {
    clearPersistedSessionToken();
    setSessionToken(null);
    setSession(null);
    setLastError(null);
    setAuthInfo("");
    setAuthView("guest");
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

  async function submitRegister(): Promise<void> {
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
    try {
      await api.register(email, password, phoneE164, { displayName: normalizedDisplayName, age: registerAgeNumber, stats: {} });
      setProfileSetupDraft((prev) => ({
        ...prev,
        displayName: normalizedDisplayName,
        age: String(registerAgeNumber)
      }));
      try {
        const loginRes = await api.login(email, password);
        persistSessionToken(loginRes.session.sessionToken);
        setSessionToken(loginRes.session.sessionToken);
        setSession(loginRes.session);
        setPendingVerificationEmail("");
        setVerificationCode("");
        setAuthInfo("");
      } catch (loginError) {
        const err = loginError as ServiceError;
        const message = normalizeUiError(loginError, "Register failed.");
        const requiresVerification =
          err?.code === "EMAIL_VERIFICATION_REQUIRED" || message.toLowerCase().includes("verification required");
        if (!requiresVerification) {
          throw loginError;
        }
        setPendingVerificationEmail(email.trim());
        setAuthView("register");
        setVerificationCode("");
        setAuthInfo("Verification code sent to your phone. Enter the 6-digit code.");
      }
    } catch (e) {
      setLastError(normalizeUiError(e, "Register failed."));
    } finally {
      setBusy(false);
    }
  }

  async function submitVerifyEmail(): Promise<void> {
    requestLocationPermission();
    setBusy(true);
    setLastError(null);
    setAuthInfo("");
    try {
      const targetEmail = pendingVerificationEmail || email;
      const res = await api.verifyEmail(targetEmail, verificationCode.trim());
      persistSessionToken(res.session.sessionToken);
      setSessionToken(res.session.sessionToken);
      setSession(res.session);
    } catch (e) {
      setLastError(normalizeUiError(e, "Email verification failed."));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerificationCode(): Promise<void> {
    const targetEmail = pendingVerificationEmail || email;
    if (!targetEmail.trim()) {
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

  async function submitLogin(): Promise<void> {
    requestLocationPermission();
    setBusy(true);
    setLastError(null);
    setAuthInfo("");
    try {
      const res = await api.login(email, password);
      persistSessionToken(res.session.sessionToken);
      setSessionToken(res.session.sessionToken);
      setSession(res.session);
    } catch (e) {
      const err = e as ServiceError;
      const msg = normalizeUiError(e, "Login failed.");
      const needsVerification =
        err?.code === "EMAIL_VERIFICATION_REQUIRED" ||
        msg.toLowerCase().includes("email verification required");
      if (needsVerification) {
        const targetEmail = typeof err.context?.email === "string" ? err.context.email : email;
        setPendingVerificationEmail(targetEmail);
        setAuthView("login");
        setAuthInfo("Verify your phone before login. A fresh code was sent.");
        return;
      }
      setLastError(msg);
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
      setLastError(normalizeUiError(e, "Age verification failed."));
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
          heightInches: parseOptionalInt(profileSetupDraft.heightInches),
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
  const isDesktopFullMap = !isMobile && session?.ageVerified === true && activeTab === "discover" && discoverScreen === "map";

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
  }, [api, ageYears, registerAge, registerDisplayName, session]);

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

  const setDiscoverScreenAndRoute = useCallback((next: DiscoverScreen): void => {
    setDiscoverScreen(next);
    if (activeTab !== "discover") return;
    const nextHash = hashForTab("discover", next);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
  }, [activeTab]);

  useEffect(() => {
    if (FULL_PAGE_TAB_NAV) {
      setActiveTab(tabFromLocation());
      return;
    }
    if (!window.location.hash) window.history.replaceState(null, "", hashForTab(tabFromLocation(), "chat"));
    const onHashChange = (): void => {
      setActiveTab(tabFromHash());
      setDiscoverScreen(discoverScreenFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const topAvatar = topAvatarUrl ?? avatarForSeed(session?.userId ?? session?.sessionToken ?? "guest");
  const mobileFramedShell = isMobile && Boolean(session && session.ageVerified === true);
  const showBottomNav = Boolean(session && session.ageVerified === true && !profileSetupRequired && !profileSetupChecking);

  return (
    <div className={`rd-shell ${mobileFramedShell ? "mobile-framed" : ""} ${showBottomNav ? "has-bottom-nav" : ""}`}>
      {session ? (
        <header className={`rd-topbar ${isMobile ? "mobile" : ""}`}>
          <div className="rd-topbar-inner">
            {isMobile ? (
              <div style={{ display: "grid", gap: 10, width: "100%" }}>
                <div className="rd-mobile-titlebar">
                  <div className="rd-mobile-title-spacer" aria-hidden="true" />
                  <div className="rd-mobile-avatar-wrap">
                    <button
                      type="button"
                      className="rd-mobile-avatar"
                      aria-label="Open my profile"
                      onClick={() => setTabAndRoute("profile")}
                    >
                      <img src={topAvatar} alt="" className="rd-mobile-avatar-img" />
                      <span className="rd-mobile-avatar-dot" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rd-btn rd-mobile-corner-settings"
                    onClick={() => setTabAndRoute("settings")}
                    aria-label="Open settings"
                  >
                    Settings
                  </button>
                </div>
                {session.ageVerified === true ? (
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("groups")} aria-label="Groups">Groups</button>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("promoted")} aria-label="Promoted profiles">Promoted</button>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("submissions")} aria-label="Submissions">Submissions</button>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("promoted")} aria-label="Promoted profiles">Promoted</button>
                    <div className="rd-chip" aria-label="Online status">
                      <span className="rd-dot on" aria-hidden="true" />
                      <span>Online status: {onlineCount}</span>
                    </div>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("settings")} aria-label="Settings">Settings</button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {session.ageVerified === true ? (
                  <>
                    <div className="rd-brand" aria-label="Red Door">
                      <div className="rd-name">Red Door</div>
                    </div>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("groups")} aria-label="Groups">Groups</button>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("promoted")} aria-label="Promoted profiles">Promoted</button>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("submissions")} aria-label="Submissions">Submissions</button>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("promoted")} aria-label="Promoted profiles">Promoted</button>
                    <div className="rd-chip" aria-label="Online status">
                      <span className="rd-dot on" aria-hidden="true" />
                      <span>
                        Online status: {onlineCount}
                      </span>
                    </div>
                    <button type="button" className="rd-btn" onClick={() => setTabAndRoute("settings")} aria-label="Settings">Settings</button>
                    <div className="rd-spacer" />
                  </>
                ) : null}
              </>
            )}
          </div>
        </header>
      ) : null}

      <main className={`rd-main ${isMobile ? "mobile" : ""} ${session ? "" : "rd-home-main"} ${isDesktopFullMap ? "rd-main-full-map" : ""} ${showBottomNav ? "rd-main-with-bottom-nav" : ""}`}>
        <div className="rd-grid">
          {!session ? (
            <>
              <section className="rd-card rd-home-hero" aria-label="Welcome to Red Door">
                <div className="rd-card-body">
                  <div className="rd-home-image-wrap">
                    <img src={welcomeDoorImage} alt="Red Door welcome" className="rd-home-image" />
                  </div>
                  <div className="rd-home-title">Red Door</div>
                  <div className="rd-home-tagline">Welcome to the Red Door adult gay social network for men</div>
                  <div className="rd-home-copy">Anonymous cruising, instant chat, map discovery, and private profiles when you choose.</div>
                </div>
              </section>

              <section className={`rd-card ${isMobile ? "rd-auth-hero" : ""}`} aria-label="Authentication">
                <div className="rd-card-head">
                  <div className="rd-card-title">Access</div>
                  <div className="rd-card-sub">Cruise allows guests</div>
                </div>

                <div className="rd-tabs" role="tablist" aria-label="Authentication tabs">
                  <button
                    type="button"
                    className={`rd-tab ${authView === "guest" ? "active" : ""}`}
                    onClick={() => setAuthView("guest")}
                    disabled={busy}
                    aria-label="Anon login"
                    role="tab"
                    aria-selected={authView === "guest"}
                  >
                    Anon Login
                  </button>
                  <button
                    type="button"
                    className={`rd-tab ${authView === "register" ? "active" : ""}`}
                    onClick={() => setAuthView("register")}
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
                    onClick={() => setAuthView("login")}
                    disabled={busy}
                    aria-label="Login"
                    role="tab"
                    aria-selected={authView === "login"}
                  >
                    Login
                  </button>
                </div>

                <div className="rd-card-body">
                  <div style={{ color: "var(--muted)", marginBottom: 12 }}>
                    Cruise Mode supports anonymous sessions. Date and Hybrid require a registered identity.
                  </div>
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

                  {authInfo ? <div style={{ color: "#26d5ff", marginBottom: 12 }}>{authInfo}</div> : null}
                  {pendingVerificationEmail ? (
                    <div style={{ color: "var(--muted)", marginBottom: 12 }}>
                      SMS delivery may not be configured yet. Use the 6-digit code printed in the backend terminal.
                    </div>
                  ) : null}

                  {authView === "guest" ? (
                    <div className="rd-row">
                      <button type="button" className="rd-btn primary" onClick={() => void createGuest()} disabled={busy} aria-label="Create guest session">
                        Anon Login
                      </button>
                    </div>
                  ) : null}

                  {authView === "register" || authView === "login" ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void (authView === "register" ? submitRegister() : submitLogin());
                      }}
                    >
                      <label className="rd-field">
                        <span className="rd-label">Email</span>
                        <input className="rd-input" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
                      </label>

                      <label className="rd-field">
                        <span className="rd-label">Password</span>
                        <input className="rd-input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" aria-label="Password" />
                      </label>

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
                        <div style={{ color: "var(--muted)", marginBottom: 10, fontSize: 13 }}>
                          Password must be at least 6 characters for this web build.
                        </div>
                      ) : null}

                      <div className="rd-row">
                        <button type="submit" className="rd-btn primary" disabled={busy} aria-label={authView === "register" ? "Register" : "Login"}>
                          {authView === "register" ? "Register" : "Login"}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {pendingVerificationEmail && (authView === "register" || authView === "login") ? (
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
                          value={pendingVerificationEmail || email}
                          onChange={(e) => {
                            setPendingVerificationEmail(e.target.value);
                            setEmail(e.target.value);
                          }}
                          aria-label="Verification email"
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
            </>
          ) : null}

          {session && session.ageVerified !== true ? (
            <section className="rd-card" aria-label="Age gate">
              <div className="rd-card-head">
                <div className="rd-card-title">Age Gate</div>
                <div className="rd-card-sub">18+ required</div>
              </div>
              <div className="rd-card-body">
                <div style={{ color: "var(--muted)", marginBottom: 12 }}>The backend blocks Cruise/Date/Hybrid actions until age is verified.</div>
                <label className="rd-field">
                  <span className="rd-label">Age (Years)</span>
                  <input className="rd-input" value={ageYears} onChange={(e) => setAgeYears(e.target.value)} aria-label="Age in years" />
                </label>
                <div className="rd-row">
                  <button type="button" className="rd-btn primary" onClick={() => void submitAgeGate()} disabled={busy} aria-label="Verify age">
                    Verify
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
                          <input
                            className="rd-input"
                            value={profileSetupDraft.race}
                            onChange={(e) => setProfileSetupDraft((prev) => ({ ...prev, race: e.target.value }))}
                            aria-label="Profile race"
                          />
                        </label>
                        <label className="rd-field" style={{ marginBottom: 0 }}>
                          <span className="rd-label">Height in Inches (Optional)</span>
                          <input
                            className="rd-input"
                            value={profileSetupDraft.heightInches}
                            onChange={(e) => setProfileSetupDraft((prev) => ({ ...prev, heightInches: e.target.value }))}
                            inputMode="numeric"
                            aria-label="Profile height in inches"
                          />
                        </label>
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
              <Router
                api={api}
                session={session}
                setSession={setSession}
                settings={settings}
                activeTab={activeTab}
                setActiveTab={setTabAndRoute}
                discoverScreen={discoverScreen}
                onDiscoverScreenChange={setDiscoverScreenAndRoute}
                discoverFilter={discoverFilter}
                busy={busy}
                setBusy={setBusy}
                setLastError={setLastError}
                onUnreadCountChange={setUnreadChatCount}
                onLogout={onLogout}
              />
            </Suspense>
            )
          ) : null}
        </div>
      </main>

      {showBottomNav ? (
        <nav className="rd-mobile-nav" aria-label="Primary navigation">
          <button
            type="button"
            className={`rd-mobile-nav-btn ${activeTab === "discover" && discoverScreen === "map" ? "is-active" : ""}`}
            onClick={() => setTabAndRoute("discover", "map")}
            aria-label="Map"
          >
            Map
          </button>
          <button
            type="button"
            className={`rd-mobile-nav-btn ${activeTab === "discover" && discoverScreen === "chat" ? "is-active" : ""}`}
            onClick={() => setTabAndRoute("discover", "chat")}
            aria-label="Chat"
          >
            Chat
          </button>
          <button type="button" className={`rd-mobile-nav-btn ${activeTab === "threads" ? "is-active" : ""}`} onClick={() => setTabAndRoute("threads")} aria-label="Inbox">
            Inbox
            {unreadChatCount > 0 ? <span className="rd-mobile-nav-badge">{unreadChatCount > 99 ? "99+" : unreadChatCount}</span> : null}
          </button>
          <button type="button" className={`rd-mobile-nav-btn ${activeTab === "cruise" ? "is-active" : ""}`} onClick={() => setTabAndRoute("cruise")} aria-label="Cruise">
            Cruise
          </button>
          <button type="button" className={`rd-mobile-nav-btn ${activeTab === "ads" ? "is-active" : ""}`} onClick={() => setTabAndRoute("ads")} aria-label="Ads">
            Ads
          </button>
        </nav>
      ) : null}
    </div>
  );
}
