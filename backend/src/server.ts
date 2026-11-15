import { installMdBridge } from "./services/mdBridge";
import { scheduleParameters } from "./services/renewalEnrollment";
import { createCommunityRepository } from "./repositories/communityRepository";
import { createPushService } from "./services/pushService";
import { installMemberRoutes } from "./routes/memberRoutes";
import { publicMember, hidesDiscovery, hidesPresence } from "./services/memberService";
import { createAnalyticsService } from "./services/analyticsService";
import { analyticsRepository } from "./repositories/analyticsRepository";
import { type AnalyticsCohort } from "../../shared/analytics";
import { LAUNCH_END_MS, launchGrant, promoCode, PROVIDER_LAUNCH_CODE } from "../../shared/plus";
import { hasPlus, limits, type PlusData, type SavedSearch } from "../../shared/plus";
import { stripeRequest, verifyStripeEvent, assertPlusPrice, signAlbumAccess, validAlbumAccess, billingConfiguration, inspectBilling } from "./services/subscriptionService";
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";

import express, { type Request, type Response } from "express";
import { WebSocketServer } from "ws";
import nodemailer from "nodemailer";

import { createAuthService, type AuthService, type AuthStateSnapshot, type Mode, type ServiceError as AuthError, type Session as AuthSession } from "./services/authService";
import { createBlockService } from "./services/blockService";
import { createChatService, type ChatPersistenceState, type ServiceError as ChatError } from "./services/chatService";
import { createMatchingService, type ServiceError as MatchingError } from "./services/matchingService";
import { createPresenceService, type ServiceError as PresenceError } from "./services/presenceService";
import { createDatingFeedService } from "./services/datingFeedService";
import { createFavoritesService, type ServiceError as FavoritesError } from "./services/favoritesService";
import { createMediaService, type ServiceError as MediaError } from "./services/mediaService";
import { createProfileService, type ServiceError as ProfileError } from "./services/profileService";
import { createPublicPostingsService, type ServiceError as PublicPostingsError } from "./services/publicPostingsService";
import { createReportService } from "./services/reportService";
import { createSubmissionsService, type ServiceError as SubmissionsError } from "./services/submissionsService";
import { createCruisingSpotsService, type ServiceError as CruisingSpotsError } from "./services/cruisingSpotsService";
import { createPromotedProfilesService, type ServiceError as PromotedProfilesError } from "./services/promotedProfilesService";
import { createEarlyAccessService, type ServiceError as EarlyAccessError } from "./services/earlyAccessService";
import { createEarlyAccessWebhook } from "./services/earlyAccessWebhook";
import { createWebsocketGateway, type ServiceError as WsError } from "./realtime/websocketGateway";
import { createInMemoryMediaRepository } from "./repositories/inMemoryMediaRepository";
import { createInMemoryProfileRepository } from "./repositories/inMemoryProfileRepository";
import { createPostgresAuthStateRepository } from "./repositories/postgresAuthStateRepository";
import { createPostgresChatStateRepository } from "./repositories/postgresChatStateRepository";
import { createPostgresMediaRepository } from "./repositories/postgresMediaRepository";
import { createPostgresProfileRepository } from "./repositories/postgresProfileRepository";
import { createPostgresPool, ensurePostgresSchema, resolvePostgresSettingsFromEnv } from "./repositories/postgresCore";
import { createLocalObjectStorage, type LocalObjectStorage } from "./services/storage/localObjectStorage";
import { createPostgresObjectStorage, type PostgresObjectStorage } from "./services/storage/postgresObjectStorage";
import { createS3ObjectStorage } from "./services/storage/s3ObjectStorage";

type AnyServiceError =
  | AuthError
  | ChatError
  | MatchingError
  | PresenceError
  | WsError
  | ProfileError
  | MediaError
  | FavoritesError
  | PublicPostingsError
  | SubmissionsError
  | CruisingSpotsError
  | PromotedProfilesError
  | EarlyAccessError;

function sendError(res: Response, error: AnyServiceError): void {
  const code = error.code;
  const status =
    code === "INVALID_SESSION"
      ? 401
      : code === "PROFILE_NOT_FOUND"
        ? 404
      : code === "PROFILE_HIDDEN"
        ? 403
      : code === "AGE_GATE_REQUIRED"
        ? 403
      : code === "ANONYMOUS_FORBIDDEN"
        ? 403
      : code === "PRESENCE_NOT_ALLOWED"
        ? 403
      : code === "MATCHING_NOT_ALLOWED"
        ? 403
      : code === "USER_BLOCKED"
        ? 403
      : code === "RATE_LIMITED"
        ? 429
      : code === "CHAT_EXPIRED"
        ? 410
      : code === "MEDIA_TOO_LARGE"
        ? 413
      : code === "MEDIA_TYPE_NOT_ALLOWED"
        ? 415
      : code === "MEDIA_UPLOAD_INCOMPLETE"
        ? 409
      : code === "EMAIL_VERIFICATION_REQUIRED"
        ? 403
      : code === "INVALID_VERIFICATION_CODE"
        ? 400
      : code === "USER_BANNED"
        ? 403
      : code === "USER_NOT_FOUND"
        ? 404
      : code === "INVALID_INPUT"
        ? 400
      : code === "SUBMISSION_NOT_FOUND"
        ? 404
      : code === "RATING_OUT_OF_RANGE"
        ? 400
      : code === "POSTING_TYPE_NOT_ALLOWED"
        ? 400
      : code === "POSTING_NOT_FOUND"
        ? 404
      : code === "SPOT_NOT_FOUND"
        ? 404
      : code === "PAYMENT_NOT_FOUND"
        ? 404
      : code === "PAYMENT_EXPIRED"
        ? 410
      : code === "PAYMENT_REQUIRED"
        ? 402
      : code === "MEMBERSHIP_CODE_NOT_FOUND"
        ? 404
      : code === "STORAGE_ERROR"
        ? 502
      : 400;
  res.status(status).json(error);
}

function getSessionToken(req: Request): string | null {
  const token = req.header("x-session-token");
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed === "" ? null : trimmed;
}

function parseAdminEmails(raw: string | undefined): ReadonlyArray<string> {
  const fromEnv = typeof raw === "string" ? raw.split(",").map((v) => v.trim().toLowerCase()).filter((v) => v.length > 0) : [];
  const merged = new Set<string>([...fromEnv, "admin@robbiecalvin.com"]);
  return Array.from(merged.values());
}

function getModeFromBody(req: Request): Mode | null {
  const mode = (req.body as any)?.mode;
  return mode === "cruise" || mode === "date" || mode === "hybrid" ? mode : null;
}

function requestOrigin(req: Request): string | null {
  const xfProtoRaw = req.header("x-forwarded-proto");
  const xfHostRaw = req.header("x-forwarded-host");
  const proto = (typeof xfProtoRaw === "string" && xfProtoRaw.trim() ? xfProtoRaw.split(",")[0].trim() : req.protocol || "http").replace(/:$/, "");
  const host = typeof xfHostRaw === "string" && xfHostRaw.trim() ? xfHostRaw.split(",")[0].trim() : req.get("host");
  if (!host || !host.trim()) return null;
  return `${proto}://${host.trim()}`;
}

function absolutizeStorageUrl(req: Request, url: string): string {
  if (!url.startsWith("/")) return url;
  const origin = requestOrigin(req);
  return origin ? `${origin}${url}` : url;
}

type AllowedOrigins = Readonly<{
  exact: ReadonlySet<string>;
  allowAny: boolean;
  wildcardSuffixes: ReadonlyArray<string>;
}>;

function parseAllowedOrigins(raw: string): AllowedOrigins {
  const exact = new Set<string>();
  const wildcardSuffixes: string[] = [];
  let allowAny = false;
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  for (const value of values) {
    if (value === "*") {
      allowAny = true;
      continue;
    }
    const protoSplit = value.indexOf("://");
    const wildcardIndex = value.indexOf("*.");
    if (protoSplit > 0 && wildcardIndex === protoSplit + 3) {
      const suffix = value.slice(wildcardIndex + 1).trim().toLowerCase();
      if (suffix.length > 2 && suffix.startsWith(".")) {
        wildcardSuffixes.push(suffix);
        continue;
      }
    }
    exact.add(value);
  }
  return { exact, allowAny, wildcardSuffixes };
}

function isOriginAllowed(origin: string, allowed: AllowedOrigins): boolean {
  if (allowed.allowAny) return true;
  if (allowed.exact.has(origin)) return true;
  let host = "";
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  for (const suffix of allowed.wildcardSuffixes) {
    if (host.endsWith(suffix) && host !== suffix.slice(1)) {
      return true;
    }
  }
  return false;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/ogg") return "ogg";
  return "bin";
}

function sessionKeyFromSession(session: Readonly<{ userId?: string; sessionToken: string }>): string {
  if (typeof session.userId === "string" && session.userId.trim() !== "") {
    return `user:${session.userId}`;
  }
  return `session:${session.sessionToken}`;
}

function safeBroadcast(
  broadcastFn: (type: string, payload: unknown) => void,
  type: string,
  payload: unknown
): void {
  try {
    broadcastFn(type, payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[RedDoor] Realtime broadcast failed for "${type}": ${message}`);
  }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = address.trim();
  if (!query) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "user-agent": "RedDoor/1.0 (local-dev)"
      }
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(json) ? json[0] : null;
    if (!first) return null;
    const lat = typeof first.lat === "string" ? Number(first.lat) : NaN;
    const lng = typeof first.lon === "string" ? Number(first.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const port = (() => {
    const raw = process.env.PORT ?? "3000";
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 3000;
  })();

  const jwtSecret = process.env.JWT_SECRET;
  if (typeof jwtSecret !== "string" || jwtSecret.trim() === "") {
    throw new Error("Missing JWT_SECRET environment variable.");
  }
  const requireDatabase = process.env.REQUIRE_DATABASE === "true";

  const smtpHost = process.env.SMTP_HOST ?? "";
  const smtpPortRaw = Number(process.env.SMTP_PORT ?? "");
  const smtpUser = process.env.SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? "";
  const smtpFrom = process.env.SMTP_FROM ?? "";
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpConfigured =
    smtpHost.trim() !== "" &&
    Number.isFinite(smtpPortRaw) &&
    smtpPortRaw > 0 &&
    smtpUser.trim() !== "" &&
    smtpPass.trim() !== "" &&
    smtpFrom.trim() !== "";
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const twilioFromNumber = process.env.TWILIO_FROM_NUMBER ?? "";
  const smsConfigured = twilioAccountSid.trim() !== "" && twilioAuthToken.trim() !== "" && twilioFromNumber.trim() !== "";

  const emailSender = smtpConfigured
    ? nodemailer.createTransport({
        host: smtpHost.trim(),
        port: smtpPortRaw,
        secure: smtpSecure,
        requireTLS: !smtpSecure,
        auth: {
          user: smtpUser.trim(),
          pass: smtpPass
        }
      })
    : null;

  const verificationCodeSender = (
    destination: string,
    code: string,
    channel: "sms" | "email",
    user: { email: string; phoneE164: string | null }
  ): void => {
    if (channel === "sms" && smsConfigured) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioAccountSid)}/Messages.json`;
      const body = new URLSearchParams({
        To: destination,
        From: twilioFromNumber.trim(),
        Body: `Your Red Door verification code is ${code}. It expires in 15 minutes.`
      });
      const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
      void fetch(url, {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      })
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Twilio ${res.status}: ${text}`);
          }
          console.log(`[RedDoor] Verification SMS sent to ${destination}`);
        })
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          console.error(`[RedDoor] Failed to send verification SMS to ${destination}: ${message}`);
        });
      return;
    }
    if (channel === "sms" && !smsConfigured) {
      console.warn("[RedDoor] SMS not configured. Falling back to email/console.");
    }
    if (emailSender && user.email.trim() !== "") {
      const subject = "Red Door verification code";
      const text = `Your Red Door verification code is ${code}. It expires in 15 minutes.`;
      const html = `<p>Your <strong>Red Door</strong> verification code is:</p><p style=\"font-size:24px;font-weight:700;letter-spacing:2px;\">${code}</p><p>This code expires in 15 minutes.</p>`;
      void emailSender
        .sendMail({
          from: smtpFrom.trim(),
          to: user.email,
          subject,
          text,
          html
        })
        .then(() => {
          console.log(`[RedDoor] Verification email sent to ${user.email}`);
        })
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          console.error(`[RedDoor] Failed to send verification email to ${user.email}: ${message}`);
        });
      return;
    }
    console.warn("[RedDoor] Verification delivery is not configured; no code was sent.");
  };

  const favoritesService = createFavoritesService();
  const publicPostingsService = createPublicPostingsService({
    persistenceFilePath: path.resolve(process.cwd(), "backend/.data/public-postings.json")
  });
  const submissionsService = createSubmissionsService();
  const cruisingSpotsService = createCruisingSpotsService({
    persistenceFilePath: path.resolve(process.cwd(), "backend/.data/cruise-spots.json")
  });
  const promotedProfilesService = createPromotedProfilesService();
  const earlyAccessService = createEarlyAccessService();
  const earlyAccessWebhook = createEarlyAccessWebhook(process.env.GOOGLE_SHEETS_WEBHOOK_URL);

  const postgresSettings = resolvePostgresSettingsFromEnv();
  if (requireDatabase && !postgresSettings) {
    throw new Error("REQUIRE_DATABASE=true but no PostgreSQL URL was found. Set DATABASE_URL or NEON_DATABASE_URL.");
  }
  const postgresPool = postgresSettings ? createPostgresPool(postgresSettings) : null;
  const authStateRepo = postgresPool ? createPostgresAuthStateRepository(postgresPool) : null;
  const chatStateRepo = postgresPool ? createPostgresChatStateRepository(postgresPool) : null;
  let initialAuthState: AuthStateSnapshot | undefined;
  let initialChatState: ChatPersistenceState | undefined;
  let authPersistQueue: Promise<void> = Promise.resolve();
  let authPersistenceError: unknown = null;
  let chatPersistQueue: Promise<void> = Promise.resolve();
  const queueAuthStateSave = (state: AuthStateSnapshot): void => {
    if (!authStateRepo) return;
    authPersistQueue = authPersistQueue
      .then(async () => { await authStateRepo.saveState(state); authPersistenceError = null; })
      .catch((e: unknown) => {
        authPersistenceError = e;
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[RedDoor] Failed to persist auth state: ${message}`);
      });
  };
  const queueChatStateSave = (state: ChatPersistenceState): void => {
    if (!chatStateRepo) return;
    chatPersistQueue = chatPersistQueue
      .then(() => chatStateRepo.saveState(state))
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[RedDoor] Failed to persist chat state: ${message}`);
      });
  };
  if (postgresPool) {
    await ensurePostgresSchema(postgresPool);
    initialAuthState = authStateRepo ? await authStateRepo.loadState() : undefined;
    initialChatState = chatStateRepo ? await chatStateRepo.loadState() : undefined;
    console.log(`[RedDoor] Persistence mode: PostgreSQL (${postgresSettings?.sourceEnvKey})`);
  } else {
    console.log("[RedDoor] Persistence mode: local file storage");
  }

  const rawAuthService = createAuthService({
    jwtSecret,
    skipEmailVerification: true,
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
    onVerificationCodeIssued: verificationCodeSender,
    initialState: initialAuthState,
    onStateChanged: authStateRepo ? queueAuthStateSave : undefined
  });

  const publicGuestId=(token:string)=>createHmac("sha256",jwtSecret!).update(`guest-public-v2:${token}`).digest("hex");
  let securedGuests=new Map<string,number>();
  let guestPersistQueue:Promise<unknown>=Promise.resolve(),guestPersistError:unknown=null;
  let persistGuests=()=>{};
  const authService:AuthService={...rawAuthService,
    getSession(token){const result=rawAuthService.getSession(token);if(result.ok && result.value.userType==="guest" && !securedGuests.has(publicGuestId(token)))return {ok:false,error:{code:"INVALID_SESSION",message:"Start a fresh guest session to continue."}};return result;},
    createGuestSession(){const result=rawAuthService.createGuestSession();if(result.ok){securedGuests.set(publicGuestId(result.value.session.sessionToken),result.value.session.expiresAtMs);persistGuests();}return result;}
  };
  const domainSession=(session:AuthSession):AuthSession=>session.userType==="guest"?{...session,sessionToken:publicGuestId(session.sessionToken)}:session;
  const clientSession=(session:AuthSession)=>({...session,publicKey:sessionKeyFromSession(domainSession(session))});
  const profileRepo = postgresPool ? createPostgresProfileRepository(postgresPool) : createInMemoryProfileRepository();
  const profileService = createProfileService({ repo: profileRepo });
  const bannedUserIds = (): ReadonlySet<string> =>
    new Set(authService.listUsers().filter((user) => typeof user.bannedAtMs === "number").map((user) => user.id));

  const s3Bucket = process.env.S3_BUCKET ?? "";
  const s3Region = process.env.S3_REGION ?? "";
  const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
  const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  const mediaRepo = postgresPool ? createPostgresMediaRepository(postgresPool) : createInMemoryMediaRepository();
  const postgresObjectStorage = postgresPool ? createPostgresObjectStorage(postgresPool) : null;
  const mediaStorage =
    s3Bucket && s3Region && s3AccessKeyId && s3SecretAccessKey
      ? createS3ObjectStorage({
          region: s3Region,
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
          endpoint: typeof s3Endpoint === "string" && s3Endpoint.trim() ? s3Endpoint.trim() : undefined,
          forcePathStyle: s3ForcePathStyle
        })
      : postgresObjectStorage
        ? postgresObjectStorage
        : createLocalObjectStorage();
  const mediaStorageMode: "s3" | "postgres" | "local" = s3Bucket && s3Region && s3AccessKeyId && s3SecretAccessKey ? "s3" : postgresObjectStorage ? "postgres" : "local";

  const mediaService = createMediaService({
    repo: mediaRepo,
    profileRepo,
    storage: mediaStorage,
    bucket: s3Bucket || "local-dev-bucket"
  });

  const communityRepository = await createCommunityRepository(postgresPool);
  securedGuests=new Map(Object.entries(await communityRepository.setting<Record<string,number>>("securedGuests",()=>({}))).filter(([,expires])=>expires>Date.now()));
  persistGuests=()=>{for(const [id,expires] of securedGuests)if(expires<=Date.now())securedGuests.delete(id);const snapshot=Object.fromEntries(securedGuests);guestPersistQueue=communityRepository.update(s=>{s.settings.securedGuests=snapshot;}).then(()=>{guestPersistError=null;}).catch(e=>{guestPersistError=e;});};
  const initialSafety=await communityRepository.safety();
  let safetyPersistence:Promise<unknown>=Promise.resolve(),safetyPersistenceError:unknown=null;
  const blockService=createBlockService({initialBlocks:initialSafety.blocks,onStateChanged:blocks=>{safetyPersistence=communityRepository.update(s=>{s.blocks=blocks;}).then(()=>{safetyPersistenceError=null;}).catch(e=>{safetyPersistenceError=e;});}});
  const reportService=createReportService({initialReports:initialSafety.reports,onStateChanged:reports=>{safetyPersistence=communityRepository.update(s=>{s.reports=reports;}).then(()=>{safetyPersistenceError=null;}).catch(e=>{safetyPersistenceError=e;});}});
  const pushService = await createPushService(communityRepository, authService, process.env.PUBLIC_APP_URL ?? "");
  const enrichProfile = <T extends {userId:string;mainPhotoMediaId?:string}>(profile:T) => {const user=authService.getUser(profile.userId);return {...profile,member:publicMember(user?.plusData?.member,user?.plusData?.photoVerification,profile.mainPhotoMediaId)};};
  const hiddenPresence = (key:string) => {if(!key.startsWith("user:"))return false;const user=authService.getUser(key.slice(5));return Boolean(user && (user.bannedAtMs || hidesPresence(user.plusData?.member,user)));};
  const matchingService = createMatchingService({
    blockChecker: {
      isBlocked(fromKey: string, toKey: string): boolean {
        return blockService.isBlocked(fromKey, toKey);
      }
    }
  });

  const datingFeedService = createDatingFeedService({
    userDirectory: {
      listRegisteredUserIds(): ReadonlyArray<string> {
        return authService.listRegisteredUserIds();
      }
    },
    profileDirectory: {
      async getByUserId(userId: string) {
        return profileRepo.getByUserId(userId);
      }
    }
  });

  const chatService = createChatService({
    cruiseRetentionHours: 72,
    maxHistoryDays: 365,
    persistenceFilePath: postgresPool ? undefined : path.resolve(process.cwd(), "backend/.data/chat.json"),
    initialState: initialChatState,
    onStateChanged: chatStateRepo ? queueChatStateSave : undefined,
    blockChecker: {
      isBlocked(fromKey: string, toKey: string): boolean {
        return blockService.isBlocked(fromKey, toKey);
      }
    },
    matchChecker: {
      isMatched(userA: string, userB: string): boolean {
        return matchingService.isMatched(userA, userB);
      }
    }
  });

  const metricsRepo = postgresPool ? analyticsRepository(postgresPool) : null;
  let metricsQueue: Promise<void> = Promise.resolve();
  let metricsWriteError: unknown = null;
  let metrics: ReturnType<typeof createAnalyticsService>;
  try { metrics = createAnalyticsService({ secret: jwtSecret, enabled: process.env.ANALYTICS_ENABLED !== "false", initialState: metricsRepo ? await metricsRepo.load() : undefined, filePath: metricsRepo ? undefined : path.resolve(process.cwd(), "backend/.data/analytics.json"), onChange: metricsRepo ? state => { metricsQueue = metricsQueue.then(async () => { await metricsRepo.save(state); metricsWriteError = null; }).catch((error: unknown) => { metricsWriteError = error; console.error("[RedDoor] Analytics persistence failed."); }); } : undefined }); }
  catch { console.error("[RedDoor] Analytics initialization failed; collection is disabled."); metrics = createAnalyticsService({ secret: jwtSecret, enabled: false }); }
  const recordMetric = (action: () => void) => { try { action(); metricsWriteError = null; } catch (error) { metricsWriteError = error; console.error("[RedDoor] Analytics unavailable; application request continues."); } };
  chatService.purgeExpired();
  const chatCleanupTimer = setInterval(() => { try { chatService.purgeExpired(); } catch { console.error("[RedDoor] Chat retention cleanup failed."); } }, 3600000);
  chatCleanupTimer.unref();
  const metricsCleanupTimer = setInterval(() => recordMetric(() => metrics.cleanup()), 86400000);
  metricsCleanupTimer.unref();
  function cohortFor(user: NonNullable<ReturnType<typeof authService.getUser>>): AnalyticsCohort {
    if (user.plusData?.stripeSubscriptionId && hasPlus(user)) return user.plusData.stripeLivemode === true ? "paid" : "other_plus";
    if (user.plusExpiresAtMs === LAUNCH_END_MS) return "launch";
    return hasPlus(user) ? "other_plus" : "free";
  }
  const app = express();
  let publicAppOrigin="";try{const configured=new URL(process.env.PUBLIC_APP_URL ?? "");if(configured.protocol==="https:")publicAppOrigin=configured.origin;}catch{}
  const allowedOrigins=parseAllowedOrigins([process.env.CORS_ALLOWED_ORIGINS ?? "capacitor://localhost,http://localhost,http://127.0.0.1,ionic://localhost",publicAppOrigin].filter(Boolean).join(","));

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const originHeader = req.headers.origin;
    const origin = typeof originHeader === "string" ? originHeader.trim() : "";
    if (origin !== "" && isOriginAllowed(origin, allowedOrigins)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Session-Token");
    }
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });
  async function finishRenewalSetup(checkoutId:string){
    const checkout=await stripeRequest(`checkout/sessions/${encodeURIComponent(checkoutId)}`);
    if(checkout.mode!=="setup" || checkout.status!=="complete" || checkout.metadata?.flow!=="launch-renewal")throw new Error("Invalid renewal setup.");
    const user=authService.getUser(checkout.metadata?.userId);if(user && user.plusData?.stripeCheckoutSessionId!==checkout.id)return;
    if(!user || user.bannedAtMs || user.plusData?.stripeCustomerId!==checkout.customer || !(user.plusData?.redeemedPromoCodes?.length || user.plusExpiresAtMs===LAUNCH_END_MS))throw new Error("Invalid renewal account.");
    const setup=await stripeRequest(`setup_intents/${encodeURIComponent(typeof checkout.setup_intent==="string"?checkout.setup_intent:checkout.setup_intent?.id)}`);
    if(user.plusData?.stripeProcessedSetupIds?.includes(setup.id))return;
    const method=typeof setup.payment_method==="string"?setup.payment_method:setup.payment_method?.id;
    if(setup.status!=="succeeded" || setup.customer!==checkout.customer || setup.metadata?.userId!==user.id || !method)throw new Error("Payment setup is not complete.");
    await stripeRequest(`customers/${encodeURIComponent(checkout.customer)}`,new URLSearchParams({"invoice_settings[default_payment_method]":method}));
    const current=authService.getUser(user.id)!;
    if(Date.now()<LAUNCH_END_MS){
      const scheduled=await stripeRequest("subscription_schedules",scheduleParameters(user.id,checkout.customer,method,process.env.STRIPE_PLUS_PRICE_ID!),`reddoor-renewal:${setup.id}`);
      authService.updatePlus(user.id,{plusData:{...authService.getUser(user.id)!.plusData,stripePaymentMethodSaved:true,stripeAutoRenew:true,stripeNextBillingAtMs:LAUNCH_END_MS,stripeScheduleId:scheduled.id,stripeScheduleStatus:scheduled.status,stripeProcessedSetupIds:[...(current.plusData?.stripeProcessedSetupIds ?? []),setup.id]}});
    }else{
      const subscription=await stripeRequest("subscriptions",new URLSearchParams({customer:checkout.customer,default_payment_method:method,"items[0][price]":process.env.STRIPE_PLUS_PRICE_ID!,"metadata[userId]":user.id,"metadata[renewalConsent]":"stripe-hosted-setup",payment_behavior:"default_incomplete"}),`reddoor-renewal:${setup.id}`);
      authService.updatePlus(user.id,{plusData:{...authService.getUser(user.id)!.plusData,stripePaymentMethodSaved:true,stripeAutoRenew:["active","trialing"].includes(subscription.status),stripeSubscriptionId:subscription.id,stripeSubscriptionStatus:subscription.status,stripeProcessedSetupIds:[...(current.plusData?.stripeProcessedSetupIds ?? []),setup.id]}});
    }
    await authPersistQueue;if(authPersistenceError)throw new Error("Renewal persistence failed.");
  }
  app.post("/billing/webhook", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) return res.status(503).json({ message: "Billing is not configured." });
    let event: any;
    try { event = verifyStripeEvent(req.body, String(req.headers["stripe-signature"] ?? ""), process.env.STRIPE_WEBHOOK_SECRET.trim()); }
    catch { return res.status(400).json({ message: "Invalid webhook signature." }); }
    if (!["checkout.session.completed", "invoice.paid", "customer.subscription.updated", "customer.subscription.created", "customer.subscription.deleted", "invoice.payment_failed", "customer.updated", "subscription_schedule.updated", "subscription_schedule.canceled", "subscription_schedule.released", "subscription_schedule.aborted", "subscription_schedule.completed"].includes(event.type)) return res.json({ received: true });
    try {
      const object = event.data.object;
      if(event.type==="checkout.session.completed" && object.mode==="setup"){await finishRenewalSetup(object.id);return res.json({received:true});}
      if(object.object==="subscription_schedule"){
        const schedule=await stripeRequest(`subscription_schedules/${encodeURIComponent(object.id)}`),user=authService.getUser(schedule.metadata?.userId);
        if(!user || user.plusData?.stripeScheduleId!==schedule.id)return res.status(400).json({message:"Unknown renewal schedule."});
        const subscriptionId=typeof schedule.subscription==="string"?schedule.subscription:schedule.subscription?.id;
        authService.updatePlus(user.id,{plusData:{...user.plusData,stripeScheduleStatus:schedule.status,stripeAutoRenew:schedule.status==="released"?user.plusData?.stripeAutoRenew===true:!["canceled","aborted"].includes(schedule.status)&&user.plusData?.stripePaymentMethodSaved===true,...(subscriptionId?{stripeSubscriptionId:subscriptionId}:{} )}});
        await authPersistQueue;if(authPersistenceError)throw new Error("Renewal persistence failed.");return res.json({received:true});
      }

      if(object.object==="customer"){
        const owner=authService.snapshotState().users.find(u=>u.plusData?.stripeCustomerId===object.id);
        if(owner && !owner.plusData?.stripeSubscriptionId){const customer=await stripeRequest(`customers/${encodeURIComponent(object.id)}`),saved=Boolean(!customer.deleted&&customer.invoice_settings?.default_payment_method),current=authService.getUser(owner.id)!;authService.updatePlus(owner.id,{plusData:{...current.plusData,stripePaymentMethodSaved:saved,stripeAutoRenew:saved&&Boolean(current.plusData?.stripeScheduleId)&&!["canceled","aborted","completed"].includes(current.plusData?.stripeScheduleStatus ?? "")}});await authPersistQueue;if(authPersistenceError)throw new Error("Persistence failed.");return res.json({received:true});}
      }
      const subscriptionId = object.object === "subscription" ? object.id : object.object === "customer" ? authService.snapshotState().users.find(u=>u.plusData?.stripeCustomerId===object.id)?.plusData?.stripeSubscriptionId : object.subscription ?? object.parent?.subscription_details?.subscription;
      if (typeof subscriptionId !== "string") return res.json({ received: true });
      // Retrieve canonical current state: replays and out-of-order events cannot extend access.
      const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price&expand[]=latest_invoice&expand[]=customer`);
      const userId = subscription.metadata?.userId;
      const user = typeof userId === "string" ? authService.getUser(userId) : undefined;
      if (!user) return res.status(400).json({ message: "Unknown subscription account." });
      const price = subscription.items?.data?.[0]?.price;
      assertPlusPrice(price, false);
      if (price.id !== process.env.STRIPE_PLUS_PRICE_ID?.trim()) return res.status(400).json({ message: "Unexpected subscription price." });
      const method=subscription.default_payment_method || (typeof subscription.customer==="object"?subscription.customer.invoice_settings?.default_payment_method:null);
      const plusData = { ...user.plusData, stripeCustomerId: typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id, stripeSubscriptionId: subscription.id, stripeLivemode: price.livemode === true, stripePaymentMethodSaved:Boolean(method), stripeAutoRenew:Boolean(method && ["active","trialing"].includes(subscription.status) && !subscription.cancel_at_period_end),stripeNextBillingAtMs:Number(subscription.trial_end ?? subscription.current_period_end)*1000,stripeSubscriptionStatus:String(subscription.status) };
      const periodEnd = Number(subscription.current_period_end) * 1000;
      const paidInvoice = subscription.latest_invoice?.paid === true && subscription.latest_invoice?.status === "paid";
      const grantPaidPeriod = subscription.status === "active" && paidInvoice && event.type !== "invoice.payment_failed" && Number.isFinite(periodEnd);
      if (grantPaidPeriod) {
        authService.updatePlus(userId, { tier: "premium", plusExpiresAtMs: Math.max(user.plusExpiresAtMs ?? 0, periodEnd), plusData });
      } else {
        // Cancellation stops renewal; already paid or complimentary time remains available.
        authService.updatePlus(userId, { plusData });
      }
      await authPersistQueue;
      if (authPersistenceError) throw new Error("Subscription persistence failed.");
      if (grantPaidPeriod && periodEnd > Date.now()) recordMetric(() => metrics.billing(price.livemode === true ? "subscription_activated" : "test_paid_period_confirmed", `${subscription.id}:${periodEnd}`, user.id));
      if (event.type === "invoice.payment_failed") recordMetric(() => { if (price.livemode === true) metrics.billing("payment_failed", event.id); });
      if (subscription.status === "canceled" || subscription.cancel_at_period_end === true) recordMetric(() => { if (price.livemode === true) metrics.billing("subscription_canceled", subscription.id); });
      return res.json({ received: true });
    } catch { return res.status(502).json({ message: "Unable to synchronize subscription. Retry webhook delivery." }); }
  });
  app.use(express.json({ limit: "8kb", verify:(req,_res,buffer)=>{(req as Request & {rawBody?:Buffer}).rawBody=Buffer.from(buffer);} }));
  app.use((req, _res, next) => {
    const token = getSessionToken(req);
    if (token) {
      const session = authService.getSession(token);
      if (session.ok && session.value.userId && authService.getUser(session.value.userId)?.plusData?.analyticsConsent === true) recordMetric(() => metrics.activity(session.value.userId!));
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/config", (_req, res) => {
    res.status(200).json({
      mediaStorageConfigured: true,
      mediaStorageMode,
      emailDeliveryConfigured: smtpConfigured,
      smsDeliveryConfigured: smsConfigured
    });
  });

  const uploadTickets = new Map<string, { key: string; mimeType: string; sizeBytes: number; expires: number }>();
  function secureUploadUrl(url: string, key: string, mimeType: string, sizeBytes: number) {
    if (mediaStorageMode === "s3") return url;
    for (const [id, ticket] of uploadTickets) if (ticket.expires <= Date.now()) uploadTickets.delete(id);
    const token = randomUUID();
    uploadTickets.set(token, { key, mimeType, sizeBytes, expires: Date.now() + 300000 });
    return `${url}${url.includes("?") ? "&" : "?"}uploadToken=${token}`;
  }
  function takeUploadTicket(req: Request, key: string) {
    const token = typeof req.query.uploadToken === "string" ? req.query.uploadToken : "";
    const ticket = uploadTickets.get(token);
    if (!ticket || ticket.key !== key || ticket.expires <= Date.now()) return null;
    uploadTickets.delete(token);
    return ticket;
  }
  const handleLocalStorageUpload = (req: Request, res: Response): Response => {
    if (mediaStorageMode !== "local") {
      return res.status(404).json({ code: "NOT_FOUND", message: "Local storage endpoint is disabled." });
    }
    const localStorage = mediaStorage as LocalObjectStorage;
    const encodedKey = (req.params as any)?.encodedKey;
    if (typeof encodedKey !== "string" || encodedKey.trim() === "") {
      return res.status(400).json({ code: "INVALID_INPUT", message: "Missing object key." });
    }
    const key = decodeURIComponent(encodedKey);
    const ticket = takeUploadTicket(req, key);
    if (!ticket) return res.status(403).json({ message: "Upload authorization has expired or is invalid." });
    const mimeTypeRaw = ticket.mimeType;
    const mimeType = typeof mimeTypeRaw === "string" && mimeTypeRaw.trim() ? mimeTypeRaw.trim() : "application/octet-stream";
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: "Send the file with its declared Content-Type." });
    const body = req.body;
    if (body.length > ticket.sizeBytes) return res.status(413).json({ message: "Upload exceeds the declared size." });
    localStorage.putObject(key, body, mimeType);
    return res.status(200).end();
  };
  app.put("/storage/local/upload/:encodedKey", express.raw({ type: "*/*", limit: "120mb" }), handleLocalStorageUpload);
  app.put("/api/storage/local/upload/:encodedKey", express.raw({ type: "*/*", limit: "120mb" }), handleLocalStorageUpload);

  const handleLocalStorageDownload = (req: Request, res: Response): Response => {
    if (mediaStorageMode !== "local") {
      return res.status(404).json({ code: "NOT_FOUND", message: "Local storage endpoint is disabled." });
    }
    const localStorage = mediaStorage as LocalObjectStorage;
    const encodedKey = (req.params as any)?.encodedKey;
    if (typeof encodedKey !== "string" || encodedKey.trim() === "") {
      return res.status(400).json({ code: "INVALID_INPUT", message: "Missing object key." });
    }
    const key = decodeURIComponent(encodedKey);
    if (key.startsWith("private-profiles/") || key.startsWith("chat/")) return res.status(403).end();
    const stored = localStorage.getObject(key);
    if (!stored) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Object not found." });
    }
    res.setHeader("content-type", stored.mimeType);
    return res.status(200).send(stored.data);
  };
  app.get("/storage/local/download/:encodedKey", handleLocalStorageDownload);
  app.get("/api/storage/local/download/:encodedKey", handleLocalStorageDownload);

  const handlePostgresStorageUpload = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (mediaStorageMode !== "postgres") {
        return res.status(404).json({ code: "NOT_FOUND", message: "PostgreSQL storage endpoint is disabled." });
      }
      const pgStorage = mediaStorage as PostgresObjectStorage;
      const encodedKey = (req.params as any)?.encodedKey;
      if (typeof encodedKey !== "string" || encodedKey.trim() === "") {
        return res.status(400).json({ code: "INVALID_INPUT", message: "Missing object key." });
      }
      const key = decodeURIComponent(encodedKey);
    const ticket = takeUploadTicket(req, key);
    if (!ticket) return res.status(403).json({ message: "Upload authorization has expired or is invalid." });
      const mimeTypeRaw = ticket.mimeType;
      const mimeType = typeof mimeTypeRaw === "string" && mimeTypeRaw.trim() ? mimeTypeRaw.trim() : "application/octet-stream";
      if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: "Send the file with its declared Content-Type." });
    const body = req.body;
    if (body.length > ticket.sizeBytes) return res.status(413).json({ message: "Upload exceeds the declared size." });
      await pgStorage.putObject(key, body, mimeType);
      return res.status(200).end();
    } catch {
      return res.status(502).json({ code: "STORAGE_ERROR", message: "Failed to store object." });
    }
  };
  app.put("/storage/postgres/upload/:encodedKey", express.raw({ type: "*/*", limit: "120mb" }), (req, res) => {
    void handlePostgresStorageUpload(req, res);
  });
  app.put("/api/storage/postgres/upload/:encodedKey", express.raw({ type: "*/*", limit: "120mb" }), (req, res) => {
    void handlePostgresStorageUpload(req, res);
  });

  const handlePostgresStorageDownload = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (mediaStorageMode !== "postgres") {
        return res.status(404).json({ code: "NOT_FOUND", message: "PostgreSQL storage endpoint is disabled." });
      }
      const pgStorage = mediaStorage as PostgresObjectStorage;
      const encodedKey = (req.params as any)?.encodedKey;
      if (typeof encodedKey !== "string" || encodedKey.trim() === "") {
        return res.status(400).json({ code: "INVALID_INPUT", message: "Missing object key." });
      }
      const key = decodeURIComponent(encodedKey);
    if (key.startsWith("private-profiles/") || key.startsWith("chat/")) return res.status(403).end();
      const stored = await pgStorage.getObject(key);
      if (!stored) {
        return res.status(404).json({ code: "NOT_FOUND", message: "Object not found." });
      }
      res.setHeader("content-type", stored.mimeType);
      return res.status(200).send(stored.data);
    } catch {
      return res.status(502).json({ code: "STORAGE_ERROR", message: "Failed to load object." });
    }
  };
  app.get("/storage/postgres/download/:encodedKey", (req, res) => {
    void handlePostgresStorageDownload(req, res);
  });
  app.get("/api/storage/postgres/download/:encodedKey", (req, res) => {
    void handlePostgresStorageDownload(req, res);
  });

  function requireAdminSession(req: Request, res: Response): AuthSession | null {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) {
      sendError(res, sessionResult.error);
      return null;
    }
    if (sessionResult.value.role !== "admin") {
      res.status(403).json({ code: "FORBIDDEN", message: "Admin access required." });
      return null;
    }
    return sessionResult.value;
  }

  function plusUser(req: express.Request, res: express.Response) {
    const session = authService.getSession(getSessionToken(req) ?? "");
    if (!session.ok) { sendError(res, session.error); return null; }
    if (!session.value.userId || session.value.userType === "guest" || !session.value.ageVerified) {
      res.status(403).json({ code: "UNAUTHORIZED_ACTION", message: "Register and verify your age to use this feature." }); return null;
    }
    const user = authService.getUser(session.value.userId);
    return user ? { user, session: session.value } : null;
  }
  const premiumError = (res: express.Response) => res.status(402).json({ code: "PLUS_REQUIRED", message: "This feature is included with Red Door Plus (CAD $7.99/month)." });

  app.get("/admin/billing/health", async (req, res) => {
    if (!requireAdminSession(req, res)) return;
    res.setHeader("Cache-Control", "no-store");
    const diagnostic = await inspectBilling();
    return res.json(diagnostic);
  });
  app.get("/admin/safety-reports",(req,res)=>{if(!requireAdminSession(req,res))return;res.setHeader("Cache-Control","no-store");return res.json({reports:reportService.listReports().slice(-200).reverse()});});
  app.get("/admin/analytics", (req, res) => {
    if (!requireAdminSession(req, res)) return;
    res.setHeader("Cache-Control", "no-store");
    return res.json(metrics.summary());
  });
  app.get("/account/privacy", (req, res) => {
    const actor = plusUser(req, res); if (!actor) return;
    return res.json({ analyticsConsent: actor.user.plusData?.analyticsConsent === true });
  });
  app.put("/account/privacy", async (req, res) => {
    const actor = plusUser(req, res); if (!actor) return;
    if (typeof req.body.analyticsConsent !== "boolean") return res.status(400).json({ message: "Choose whether to share usage statistics." });
    const consent = req.body.analyticsConsent;
    authService.updatePlus(actor.user.id, { plusData: { ...actor.user.plusData, analyticsConsent: consent } });
    await authPersistQueue;
    if (authPersistenceError) return res.status(503).json({ message: "Unable to save privacy preference." });
    recordMetric(() => metrics.consent(actor.user.id, consent, cohortFor(actor.user), actor.user.createdAtMs));
    await metricsQueue;
    if (metricsWriteError) return res.status(503).json({ message: "Privacy preference saved, but measurement cleanup could not finish. Please retry." });
    return res.json({ analyticsConsent: consent });
  });
  app.get("/plus", (req, res) => {
    const actor = plusUser(req, res); if (!actor) return;
    const data = actor.user.plusData ?? {};
    return res.json({ active: hasPlus(actor.session), expiresAtMs: actor.user.plusExpiresAtMs, limits: limits(actor.session), savedSearches: data.savedSearches ?? [], pinnedKeys: data.pinnedKeys ?? [], privateMediaIds: data.privateMediaIds ?? [], albumSharedWith: data.albumSharedWith ?? [], billingConfigured: billingConfiguration().configured, hasBillingAccount: Boolean(data.stripeCustomerId), hasPaymentMethod:data.stripePaymentMethodSaved===true, autoRenew:data.stripeAutoRenew===true,nextBillingAtMs:data.stripeNextBillingAtMs,redeemedPromoCodes:data.redeemedPromoCodes ?? [],providerTutorialPending:data.providerTutorialPending===true,renewalScheduled:Boolean(data.stripeScheduleId && !["canceled","aborted","completed","released"].includes(data.stripeScheduleStatus ?? "")),subscriptionStatus:data.stripeSubscriptionStatus });
  });
  app.post("/plus/redeem",async(req,res)=>{const actor=plusUser(req,res);if(!actor)return;
    try {const code=promoCode(req.body?.code),expires=launchGrant(code)!;const user=authService.getUser(actor.user.id)!;if(user.plusData?.redeemedPromoCodes?.includes(code))return res.status(409).json({message:"You already used this promo code."});
      const permanent=hasPlus(user)&&user.plusExpiresAtMs===undefined;
      authService.updatePlus(user.id,{tier:"premium",...(permanent?{}:{plusExpiresAtMs:Math.max(user.plusExpiresAtMs ?? 0,expires)}),plusData:{...user.plusData,redeemedPromoCodes:[...(user.plusData?.redeemedPromoCodes ?? []),code],providerTutorialPending:code===PROVIDER_LAUNCH_CODE || user.plusData?.providerTutorialPending===true}});
      await authPersistQueue;if(authPersistenceError)return res.status(503).json({message:"Unable to save this promotion. Please retry."});return res.json({ok:true,providerTutorial:code===PROVIDER_LAUNCH_CODE,expiresAtMs:expires});
    }catch(e){return res.status(400).json({message:(e as Error).message});}
  });
  app.post("/plus/tutorial/dismiss",async(req,res)=>{const actor=plusUser(req,res);if(!actor)return;authService.updatePlus(actor.user.id,{plusData:{...actor.user.plusData,providerTutorialPending:false}});await authPersistQueue;if(authPersistenceError)return res.status(503).json({message:"Unable to save this preference."});return res.json({ok:true});});
  app.put("/plus/preferences", async (req, res) => {
    const actor = plusUser(req, res); if (!actor) return;
    const data: PlusData = { ...actor.user.plusData };
    if (req.body.savedSearches !== undefined) {
      if (!hasPlus(actor.session)) return premiumError(res);
      const searches = req.body.savedSearches;
      if (!Array.isArray(searches) || searches.length > 10 || searches.some((x: any) => typeof x?.name !== "string" || x.name.length > 60 || !x.name.trim() || !x.filters || typeof x.filters !== "object" || Array.isArray(x.filters) || Object.entries(x.filters).some(([k,v]) => k.length > 40 || !(typeof v === "boolean" || typeof v === "string" && v.length <= 100)))) return res.status(400).json({ message: "Invalid saved searches (maximum 10)." });
      data.savedSearches = searches as SavedSearch[];
    }
    for (const key of ["pinnedKeys", "privateMediaIds", "albumSharedWith"] as const) {
      if (req.body[key] === undefined) continue;
      const values = req.body[key];
      const max = key === "pinnedKeys" ? limits(actor.session).pins : key === "privateMediaIds" ? limits(actor.session).privateAlbum : 100;
      if (!Array.isArray(values) || values.length > max || values.some((x: any) => typeof x !== "string" || !x.trim() || x.length > 200)) return res.status(400).json({ code: "PLUS_REQUIRED", message: `Limit for ${key}: ${max}.` });
      if (key === "privateMediaIds") for (const id of values) {
        const media = await mediaRepo.getById(id);
        if (!media || media.userId !== actor.user.id || media.kind !== "photo_private" || !media.uploadedAtMs) return res.status(403).json({ message: "Invalid private album media." });
      }
      data[key] = [...new Set(values)] as string[];
    }
    authService.updatePlus(actor.user.id, { plusData: data });
    await authPersistQueue;
    if (authPersistenceError) return res.status(503).json({ message: "Unable to save preferences. Please retry." });
    return res.json({ ok: true });
  });
  app.get("/plus/albums/:userId", async (req, res) => {
    const actor = plusUser(req, res); if (!actor) return;
    const owner = authService.getUser(req.params.userId);
    const blocked = blockService.isBlocked(`user:${actor.user.id}`, `user:${req.params.userId}`);
    if (!owner || blocked || (owner.id !== actor.user.id && !owner.plusData?.albumSharedWith?.includes(actor.user.id))) return res.status(403).json({ message: "This album has not been shared with you." });
    const mediaIds = owner.plusData?.privateMediaIds ?? [];
    const photos = [];
    for (const id of mediaIds) {
      const media = await mediaRepo.getById(id);
      if (!media || media.kind !== "photo_private" || media.userId !== owner.id) continue;
      const expires = Date.now() + 60_000;
      const signature = signAlbumAccess(jwtSecret!, owner.id, actor.user.id, id, expires);
      const url = `/plus/albums/${encodeURIComponent(owner.id)}/photos/${encodeURIComponent(id)}?viewer=${encodeURIComponent(actor.user.id)}&expires=${expires}&signature=${signature}`;
      photos.push({ mediaId: id, downloadUrl: absolutizeStorageUrl(req, url) });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.json({ photos, expiresInSeconds: 60 });
  });
  app.get("/plus/albums/:userId/photos/:mediaId", async (req, res) => {
    const owner = authService.getUser(req.params.userId);
    const viewer = typeof req.query.viewer === "string" ? req.query.viewer : "";
    const user = authService.getUser(viewer);
    const expires = Number(req.query.expires);
    const signature = String(req.query.signature ?? "");
    if (!owner || !user || !user.ageVerified || user.bannedAtMs || owner.bannedAtMs || !validAlbumAccess(jwtSecret!, owner.id, viewer, req.params.mediaId, expires, signature) || blockService.isBlocked(`user:${owner.id}`, `user:${viewer}`) || (owner.id !== viewer && !owner.plusData?.albumSharedWith?.includes(viewer)) || !owner.plusData?.privateMediaIds?.includes(req.params.mediaId)) return res.status(403).end();
    const media = await mediaRepo.getById(req.params.mediaId);
    if (!media || media.kind !== "photo_private" || media.userId !== owner.id) return res.status(404).end();
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    if (mediaStorageMode === "s3") {
      const url = await mediaStorage.presignGetObject({ bucket: s3Bucket, key: media.objectKey, expiresInSeconds: Math.max(1, Math.floor((expires - Date.now()) / 1000)) });
      return res.redirect(url);
    }
    const object = mediaStorageMode === "local" ? (mediaStorage as LocalObjectStorage).getObject(media.objectKey) : await (mediaStorage as PostgresObjectStorage).getObject(media.objectKey);
    if (!object) return res.status(404).end();
    res.setHeader("Content-Type", object.mimeType); return res.send(object.data);
  });
  const checkoutHandler:express.RequestHandler = async (req,res) => {
    const actor = plusUser(req, res); if (!actor) return;
    try {
      const deferred=req.path==="/billing/enroll";
      const complimentary=actor.user.plusExpiresAtMs===LAUNCH_END_MS && hasPlus(actor.session);
      if(deferred && (req.body?.acceptRenewal!==true || !complimentary))return res.status(400).json({message:"Monthly renewal enrollment requires your explicit consent and active launch access."});
      if(hasPlus(actor.session) && !deferred)return res.status(409).json({message:"You already have Plus. Use billing enrollment to keep it after complimentary access ends."});
      const appUrl = process.env.PUBLIC_APP_URL?.trim();
      const priceId = process.env.STRIPE_PLUS_PRICE_ID?.trim();
      if (!billingConfiguration().configured || !appUrl || !priceId) return res.status(503).json({ message: "Subscriptions are not available for purchase yet." });
      if (!/^https:\/\//.test(appUrl)) throw new Error("Configure a secure public app URL.");
      if(deferred && actor.user.plusData?.stripeScheduleId){const schedule=await stripeRequest(`subscription_schedules/${encodeURIComponent(actor.user.plusData.stripeScheduleId)}`);if(!["canceled","aborted","completed","released"].includes(schedule.status))return res.status(409).json({message:"Your renewal is already scheduled. Manage billing or cancel that schedule first."});}
      if (actor.user.plusData?.stripeSubscriptionId) {
        const existing = await stripeRequest(`subscriptions/${encodeURIComponent(actor.user.plusData.stripeSubscriptionId)}`);
        if (!["canceled", "incomplete_expired"].includes(existing.status)) return res.status(409).json({ message: "Manage your existing subscription before starting another." });
      }
      const priorCheckoutId = actor.user.plusData?.stripeCheckoutSessionId;
      if (priorCheckoutId) {
        const prior = await stripeRequest(`checkout/sessions/${encodeURIComponent(priorCheckoutId)}`);
        if (prior.status === "open") return res.json({ url: prior.url });
        if (prior.status === "complete" && !actor.user.plusData?.stripeSubscriptionId && !actor.user.plusData?.stripeScheduleId) return res.status(409).json({ message: "Payment is being confirmed. Refresh your subscription status shortly." });
      }
      const price = await stripeRequest(`prices/${encodeURIComponent(priceId)}`); assertPlusPrice(price);
      if(deferred){
        let customer=actor.user.plusData?.stripeCustomerId;
        if(!customer){const created=await stripeRequest("customers",new URLSearchParams({email:actor.user.email,"metadata[userId]":actor.user.id}),`reddoor-customer:${actor.user.id}`);customer=created.id;authService.updatePlus(actor.user.id,{plusData:{...authService.getUser(actor.user.id)!.plusData,stripeCustomerId:customer}});await authPersistQueue;if(authPersistenceError)throw new Error("Unable to save customer.");}
        const setupParams=new URLSearchParams({mode:"setup",customer:customer!,currency:"cad",client_reference_id:actor.user.id,"metadata[userId]":actor.user.id,"metadata[flow]":"launch-renewal","setup_intent_data[metadata][userId]":actor.user.id,success_url:appUrl+"?billing=success",cancel_url:appUrl+"?billing=cancelled","custom_text[submit][message]":"Save your payment method and enroll in Red Door Plus: CAD $7.99 monthly starting January 1, 2027 (Pacific time), until you cancel. No charge today."});
        const checkout=await stripeRequest("checkout/sessions",setupParams,`reddoor-enroll:${actor.user.id}:${priorCheckoutId ?? "initial"}`);
        authService.updatePlus(actor.user.id,{plusData:{...authService.getUser(actor.user.id)!.plusData,stripeCheckoutSessionId:checkout.id}});await authPersistQueue;if(authPersistenceError)throw new Error("Unable to save checkout.");return res.json({url:checkout.url});
      }
      const params = new URLSearchParams({ mode: "subscription", "line_items[0][price]": priceId, "line_items[0][quantity]": "1", "subscription_data[metadata][userId]": actor.user.id, client_reference_id: actor.user.id, success_url: appUrl + "?billing=success", cancel_url: appUrl + "?billing=cancelled" });
      params.set("payment_method_collection","always");
      params.set("subscription_data[metadata][renewalConsent]","stripe-hosted-checkout");

      if (actor.user.plusData?.stripeCustomerId) params.set("customer", actor.user.plusData.stripeCustomerId);
      else params.set("customer_email", actor.user.email);
      const checkout = await stripeRequest("checkout/sessions", params, `reddoor-plus:${actor.user.id}:${deferred?"renewal":"paid"}:${priorCheckoutId ?? "initial"}`);
      const latestUser = authService.getUser(actor.user.id)!;
      authService.updatePlus(actor.user.id, { plusData: { ...latestUser.plusData, stripeCheckoutSessionId: checkout.id } });
      await authPersistQueue;
      if (authPersistenceError) return res.status(503).json({ message: "Unable to save checkout. Please retry." });
      recordMetric(() => metrics.billing(price.livemode === true ? "checkout_started" : "test_checkout_started", checkout.id));
      return res.json({ url: checkout.url });
    } catch (e) { return res.status(502).json({ message: (e as Error).message }); }
  };
  app.post("/billing/checkout",checkoutHandler);
  app.post("/billing/enroll",checkoutHandler);
  app.post("/billing/enrollment/cancel",async(req,res)=>{const actor=plusUser(req,res);if(!actor)return;const id=actor.user.plusData?.stripeScheduleId;if(!id)return res.status(400).json({message:"No scheduled renewal."});try{await stripeRequest(`subscription_schedules/${encodeURIComponent(id)}/cancel`,new URLSearchParams());authService.updatePlus(actor.user.id,{plusData:{...authService.getUser(actor.user.id)!.plusData,stripeAutoRenew:false,stripeScheduleStatus:"canceled"}});await authPersistQueue;if(authPersistenceError)throw new Error("Unable to save cancellation.");return res.json({ok:true});}catch{return res.status(502).json({message:"Unable to cancel the scheduled renewal. Please retry."});}});
  app.post("/billing/portal", async (req, res) => {
    const actor = plusUser(req, res); if (!actor) return;
    const customer = actor.user.plusData?.stripeCustomerId;
    if (!customer || !process.env.PUBLIC_APP_URL) return res.status(400).json({ message: "No billing account is attached to this profile." });
    try { const portal = await stripeRequest("billing_portal/sessions", new URLSearchParams({ customer, return_url: process.env.PUBLIC_APP_URL.trim() })); return res.json({ url: portal.url }); }
    catch (e) { return res.status(502).json({ message: (e as Error).message }); }
  });

  // Auth
  app.post("/auth/guest", async (_req, res) => {
    const result = authService.createGuestSession();
    if (!result.ok) return sendError(res, result.error);
    await guestPersistQueue;if(guestPersistError)return res.status(503).json({message:"Unable to create a guest session. Please retry."});
    return res.status(200).json({...result.value,session:clientSession(result.value.session)});
  });

  app.post("/auth/register", (req, res) => {
    const email = (req.body as any)?.email;
    const password = (req.body as any)?.password;
    const phoneE164 = (req.body as any)?.phoneE164;
    const result = authService.register(email, password, phoneE164, (req.body as any)?.promoCode, req.body?.analyticsConsent === true);
    if (!result.ok) return sendError(res, result.error);
    const created = authService.listUsers().find(user => user.email === result.value.email);
    const user = created ? authService.getUser(created.id) : undefined;
    if (user) recordMetric(() => metrics.registration(user.id, cohortFor(user), user.plusData?.analyticsConsent === true));
    return res.status(200).json(result.value);
  });

  app.post("/auth/verify-email", (req, res) => {
    const email = (req.body as any)?.email;
    const code = (req.body as any)?.code;
    const result = authService.verifyEmail(email, code);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.post("/auth/resend-verification", (req, res) => {
    const email = (req.body as any)?.email;
    const result = authService.resendVerificationCode(email);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.post("/auth/password-reset/request", (req, res) => {
    let resetBase: URL;
    try { resetBase = new URL(process.env.PUBLIC_APP_URL?.trim() ?? ""); if (resetBase.protocol !== "https:") throw new Error("HTTPS required"); }
    catch { return res.status(503).json({ message: "Account recovery is unavailable. Please contact support." }); }
    if (!emailSender) return res.status(503).json({ message: "Account recovery is unavailable. Please contact support." });
    const reset = authService.requestPasswordReset(req.body?.email);
    if (reset) {
      resetBase.hash = `reset=${reset.token}`;
      void authPersistQueue.then(() => {
        if (authPersistenceError) throw new Error("Persistence unavailable");
        return emailSender.sendMail({ from: smtpFrom, to: reset.email, subject: "Reset your Red Door password", text: `Reset your password using this link: ${resetBase.toString()}\n\nIt expires in 15 minutes and can be used once. If you did not request this, ignore this email.` });
      }).catch(() => console.error("[RedDoor] Password recovery delivery failed."));
    }
    return res.json({ message: "If an eligible account exists, a reset link will be sent. Check your email." });
  });
  app.post("/auth/password-reset/confirm", async (req, res) => {
    const result = authService.resetPassword(req.body?.token, req.body?.password);
    if (!result.ok) return sendError(res, result.error);
    await authPersistQueue;
    if (authPersistenceError) return res.status(503).json({ message: "Unable to save your password. Please retry." });
    return res.json({ ok: true });
  });
  app.post("/auth/login", (req, res) => {
    const email = (req.body as any)?.email;
    const password = (req.body as any)?.password;
    const result = authService.login(email, password);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.post("/auth/verify-age", (req, res) => {
    const sessionToken = (req.body as any)?.sessionToken ?? getSessionToken(req);
    const ageYears = (req.body as any)?.ageYears;
    const result = authService.verifyAge(sessionToken, ageYears);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ session: clientSession(result.value) });
  });

  app.post("/early-access/signup", async (req, res) => {
    const result = await earlyAccessService.registerInterest((req.body as any)?.name, (req.body as any)?.email);
    if (!result.ok) return sendError(res, result.error);
    if (earlyAccessWebhook.isEnabled() && result.value.existing !== true) {
      try {
        await earlyAccessWebhook.notifySignup(result.value);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[RedDoor] Failed to sync early access signup to Google Sheets: ${message}`);
      }
    }
    return res.status(200).json({ signup: result.value });
  });

  app.post("/early-access/validate", async (req, res) => {
    const result = await earlyAccessService.validateMembershipCode((req.body as any)?.membershipCode);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ valid: true, signup: result.value });
  });

  // Profile
  app.get("/profile/me", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = await profileService.getMe(sessionResult.value);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profile: enrichProfile(result.value) });
  });

  app.get("/profile/public/:userId", async (req, res) => {
    const userId = String((req.params as any)?.userId ?? "").trim();
    if (bannedUserIds().has(userId)) {
      return sendError(res, { code: "PROFILE_NOT_FOUND", message: "Profile not found." });
    }
    const target=authService.getUser(userId), viewer=authService.getSession(getSessionToken(req) ?? "");
    if(target && hidesDiscovery(target.plusData?.member,target) && !(viewer.ok && (viewer.value.userId===userId || (["cruise","date"] as const).some(kind=>{const r=chatService.listThreads(domainSession(viewer.value),kind);return r.ok && r.value.some(t=>t.otherKey===`user:${userId}`);})))) return res.status(404).json({code:"PROFILE_NOT_FOUND",message:"Profile not found."});
    if(viewer.ok && blockService.isBlocked(sessionKeyFromSession(domainSession(viewer.value)),`user:${userId}`))return res.status(404).json({code:"PROFILE_NOT_FOUND",message:"Profile not found."});
    const result = await profileService.getPublicByUserId(userId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profile: enrichProfile(result.value) });
  });

  app.get("/profile/public", async (_req, res) => {
    const result = await profileService.listPublicProfiles();
    if (!result.ok) return sendError(res, result.error);
    const banned = bannedUserIds();
    return res.status(200).json({ profiles: result.value.filter((profile) => {const user=authService.getUser(profile.userId);return !banned.has(profile.userId) && !(user && hidesDiscovery(user.plusData?.member,user));}).map(enrichProfile) });
  });

  app.put("/profile/me", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);

    const result = await profileService.upsertMe(sessionResult.value, {
      displayName: (req.body as any)?.displayName,
      age: (req.body as any)?.age,
      bio: (req.body as any)?.bio,
      stats: (req.body as any)?.stats,
      discreetMode: (req.body as any)?.discreetMode,
      travelMode: (req.body as any)?.travelMode
    });
    if (!result.ok) return sendError(res, result.error);
    if (authService.getUser(result.value.userId)?.plusData?.analyticsConsent === true) recordMetric(() => metrics.profileCompleted(result.value.userId));
    return res.status(200).json({ profile: result.value });
  });

  app.put("/profile/media/references", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = await profileService.updateMediaReferences(sessionResult.value, {
      galleryMediaIds: (req.body as any)?.galleryMediaIds,
      mainPhotoMediaId: (req.body as any)?.mainPhotoMediaId
    });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profile: result.value });
  });

  // Admin profile management
  app.get("/admin/profiles/:userId", async (req, res) => {
    if (!requireAdminSession(req, res)) return;
    const result = await profileService.adminGetProfile((req.params as any)?.userId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profile: result.value });
  });

  app.put("/admin/profiles/:userId", async (req, res) => {
    if (!requireAdminSession(req, res)) return;
    const result = await profileService.adminUpsertProfile((req.params as any)?.userId, req.body as any);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profile: result.value });
  });

  // Media (S3 presigned uploads)
  app.post("/profile/media/initiate", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = await mediaService.initiateUpload(sessionResult.value, {
      kind: (req.body as any)?.kind,
      mimeType: (req.body as any)?.mimeType,
      sizeBytes: (req.body as any)?.sizeBytes,
      targetUserId: (req.body as any)?.targetUserId
    });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({
      ...result.value,
      uploadUrl: absolutizeStorageUrl(req, secureUploadUrl(result.value.uploadUrl, result.value.objectKey, req.body.mimeType, req.body.sizeBytes))
    });
  });

  app.post("/profile/media/complete", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = await mediaService.completeUpload(sessionResult.value, (req.body as any)?.mediaId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.get("/media/public/:mediaId/url", async (req, res) => {
    const mediaId = (req.params as any)?.mediaId;
    const result = await mediaService.getPublicDownloadUrl(typeof mediaId === "string" ? mediaId : "");
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({
      ...result.value,
      downloadUrl: absolutizeStorageUrl(req, result.value.downloadUrl)
    });
  });

  // Favorites
  app.get("/favorites", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = favoritesService.list(domainSession(sessionResult.value));
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ favorites: result.value });
  });

  app.post("/favorites/toggle", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = favoritesService.toggle(domainSession(sessionResult.value), (req.body as any)?.targetUserId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  // Community postings (ads/events)
  app.get("/public-postings", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = token ? authService.getSession(token) : null;
    const viewer = sessionResult && sessionResult.ok ? domainSession(sessionResult.value) : undefined;
    const result = publicPostingsService.list((req.query as any)?.type, viewer);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ postings: result.value });
  });

  app.post("/public-postings", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = publicPostingsService.create(domainSession(sessionResult.value), {
      type: (req.body as any)?.type,
      title: (req.body as any)?.title,
      body: (req.body as any)?.body,
      photoMediaId: (req.body as any)?.photoMediaId,
      lat: (req.body as any)?.lat,
      lng: (req.body as any)?.lng,
      eventStartAtMs: (req.body as any)?.eventStartAtMs,
      locationInstructions: (req.body as any)?.locationInstructions,
      groupDetails: (req.body as any)?.groupDetails
    });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ posting: result.value });
  });

  app.post("/public-postings/event/invite", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = publicPostingsService.inviteToEvent(
      sessionResult.value,
      (req.body as any)?.postingId,
      (req.body as any)?.targetUserId
    );
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ invite: result.value });
  });

  app.post("/public-postings/event/respond", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = publicPostingsService.respondToEventInvite(
      sessionResult.value,
      (req.body as any)?.postingId,
      (req.body as any)?.accept
    );
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ posting: result.value });
  });

  app.post("/public-postings/event/request-join", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = publicPostingsService.requestToJoinEvent(domainSession(sessionResult.value), (req.body as any)?.postingId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ posting: result.value });
  });

  app.post("/public-postings/event/respond-request", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = publicPostingsService.respondToEventJoinRequest(
      sessionResult.value,
      (req.body as any)?.postingId,
      (req.body as any)?.targetUserId,
      (req.body as any)?.accept
    );
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ posting: result.value });
  });

  app.get("/public-postings/event/invites", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = publicPostingsService.listEventInvites(domainSession(sessionResult.value));
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ postings: result.value });
  });

  // Cruising spots
  app.get("/cruise-spots", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = token ? authService.getSession(token) : null;
    const viewer = sessionResult && sessionResult.ok ? domainSession(sessionResult.value) : undefined;
    const result = cruisingSpotsService.list(viewer);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ spots: result.value });
  });

  app.post("/cruise-spots", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const address = typeof (req.body as any)?.address === "string" ? (req.body as any).address : "";
    const geocoded = await geocodeAddress(address);
    const bodyLat = Number((req.body as any)?.lat);
    const bodyLng = Number((req.body as any)?.lng);
    const fallbackLatRaw = Number(process.env.DUALMODE_DEFAULT_CENTER_LAT ?? "40.7484");
    const fallbackLngRaw = Number(process.env.DUALMODE_DEFAULT_CENTER_LNG ?? "-73.9857");
    const fallbackLat = Number.isFinite(fallbackLatRaw) ? fallbackLatRaw : 40.7484;
    const fallbackLng = Number.isFinite(fallbackLngRaw) ? fallbackLngRaw : -73.9857;
    const lat = geocoded?.lat ?? (Number.isFinite(bodyLat) ? bodyLat : fallbackLat);
    const lng = geocoded?.lng ?? (Number.isFinite(bodyLng) ? bodyLng : fallbackLng);
    const result = cruisingSpotsService.create(domainSession(sessionResult.value), {
      name: (req.body as any)?.name,
      description: (req.body as any)?.description,
      address,
      photoMediaId: (req.body as any)?.photoMediaId,
      lat,
      lng
    });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ spot: result.value });
  });

  app.post("/cruise-spots/:spotId/check-in", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = cruisingSpotsService.checkIn(domainSession(sessionResult.value), (req.params as any)?.spotId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ checkIn: result.value });
  });

  app.get("/cruise-spots/:spotId/check-ins", (req, res) => {
    const result = cruisingSpotsService.listCheckIns((req.params as any)?.spotId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ checkIns: result.value });
  });

  app.post("/cruise-spots/:spotId/action", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = cruisingSpotsService.recordAction(domainSession(sessionResult.value), (req.params as any)?.spotId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ action: result.value });
  });

  // Story submissions
  app.get("/submissions", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = token ? authService.getSession(token) : null;
    const viewer = sessionResult && sessionResult.ok ? domainSession(sessionResult.value) : undefined;
    const result = submissionsService.list(viewer);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submissions: result.value });
  });

  app.post("/submissions", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = submissionsService.create(domainSession(sessionResult.value), (req.body as any)?.title, (req.body as any)?.body);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submission: result.value });
  });

  app.post("/submissions/view", (req, res) => {
    const result = submissionsService.recordView((req.body as any)?.submissionId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submission: result.value });
  });

  app.post("/submissions/rate", (req, res) => {
    const result = submissionsService.rate((req.body as any)?.submissionId, (req.body as any)?.stars);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submission: result.value });
  });

  // Admin moderation and enforcement
  app.get("/admin/users", (req, res) => {
    if (!requireAdminSession(req, res)) return;
    return res.status(200).json({ users: authService.listUsers() });
  });

  app.post("/admin/users/:userId/ban", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const targetUserId = (req.params as any)?.userId;
    const result = authService.banUser(targetUserId, (req.body as any)?.reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ user: result.value });
  });

  app.post("/admin/users/:userId/unban", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const targetUserId = (req.params as any)?.userId;
    const result = authService.unbanUser(targetUserId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ user: result.value });
  });

  app.post("/admin/users/create", (req, res) => {
    if (!requireAdminSession(req, res)) return;
    const email = (req.body as any)?.email;
    const password = (req.body as any)?.password;
    const phoneE164 = (req.body as any)?.phoneE164;
    const userType = (req.body as any)?.userType;
    const tier = (req.body as any)?.tier;
    const role = (req.body as any)?.role;
    const result = authService.adminCreateUser(email, password, phoneE164, userType, tier, role);
    if (!result.ok) return sendError(res, result.error);
    return res.status(201).json({ user: result.value });
  });

  app.get("/admin/cruise-spots", (req, res) => {
    if (!requireAdminSession(req, res)) return;
    const result = cruisingSpotsService.listAll();
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ spots: result.value });
  });

  app.post("/admin/cruise-spots/:spotId/approve", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = cruisingSpotsService.approve(adminSessionResult, (req.params as any)?.spotId, (req.body as any)?.reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ spot: result.value });
  });

  app.post("/admin/cruise-spots/:spotId/reject", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = cruisingSpotsService.reject(adminSessionResult, (req.params as any)?.spotId, (req.body as any)?.reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ spot: result.value });
  });

  app.delete("/admin/cruise-spots/:spotId", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = cruisingSpotsService.remove((req.params as any)?.spotId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.get("/admin/public-postings", (req, res) => {
    if (!requireAdminSession(req, res)) return;
    const result = publicPostingsService.listAll((req.query as any)?.type);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ postings: result.value });
  });

  app.post("/admin/public-postings/:postingId/approve", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = publicPostingsService.approve(adminSessionResult, (req.params as any)?.postingId, (req.body as any)?.reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ posting: result.value });
  });

  app.post("/admin/public-postings/:postingId/reject", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = publicPostingsService.reject(adminSessionResult, (req.params as any)?.postingId, (req.body as any)?.reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ posting: result.value });
  });

  app.delete("/admin/public-postings/:postingId", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = publicPostingsService.remove((req.params as any)?.postingId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.get("/admin/submissions", (req, res) => {
    if (!requireAdminSession(req, res)) return;
    const result = submissionsService.listAll();
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submissions: result.value });
  });

  app.post("/admin/submissions/:submissionId/approve", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = submissionsService.approve(adminSessionResult, (req.params as any)?.submissionId, (req.body as any)?.reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submission: result.value });
  });

  app.post("/admin/submissions/:submissionId/reject", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = submissionsService.reject(adminSessionResult, (req.params as any)?.submissionId, (req.body as any)?.reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submission: result.value });
  });

  app.delete("/admin/submissions/:submissionId", (req, res) => {
    const adminSessionResult = requireAdminSession(req, res);
    if (!adminSessionResult) return;
    const result = submissionsService.remove((req.params as any)?.submissionId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.get("/admin/db/health", async (req, res) => {
    if (!requireAdminSession(req, res)) return;
    if (!postgresPool) {
      return res.status(200).json({
        persistenceMode: "local",
        databaseConfigured: false,
        healthy: true,
        details: {
          message: "PostgreSQL is not configured. Backend is running with local file persistence."
        }
      });
    }

    try {
      const [pingRes, usersCountRes, sessionsCountRes] = await Promise.all([
        postgresPool.query("SELECT NOW()::text AS now_utc"),
        postgresPool.query("SELECT COUNT(*)::bigint AS count FROM auth_users"),
        postgresPool.query("SELECT COUNT(*)::bigint AS count FROM auth_sessions")
      ]);

      const nowUtc = String((pingRes.rows[0] as Record<string, unknown>)?.now_utc ?? "");
      const usersCount = Number((usersCountRes.rows[0] as Record<string, unknown>)?.count ?? 0);
      const sessionsCount = Number((sessionsCountRes.rows[0] as Record<string, unknown>)?.count ?? 0);

      return res.status(200).json({
        persistenceMode: "postgres",
        databaseConfigured: true,
        healthy: true,
        details: {
          sourceEnvKey: postgresSettings?.sourceEnvKey ?? "unknown",
          nowUtc,
          authUsersCount: Number.isFinite(usersCount) ? usersCount : 0,
          authSessionsCount: Number.isFinite(sessionsCount) ? sessionsCount : 0
        }
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return res.status(503).json({
        persistenceMode: "postgres",
        databaseConfigured: true,
        healthy: false,
        details: {
          sourceEnvKey: postgresSettings?.sourceEnvKey ?? "unknown",
          error: message
        }
      });
    }
  });

  // Promoted profiles (safe paid listings)
  app.get("/promoted-profiles", (_req, res) => {
    const result = promotedProfilesService.listListings();
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ listings: result.value, feeCents: 2000 });
  });

  app.post("/promoted-profiles/payment/start",(_req,res)=>res.status(410).json({message:"Promoted profiles have retired. Visit MD in Red Door Plus."}));

  app.post("/promoted-profiles/payment/confirm",(_req,res)=>res.status(410).json({message:"Promoted profiles have retired. Visit MD in Red Door Plus."}));

  app.post("/promoted-profiles",(_req,res)=>res.status(410).json({message:"Promoted profiles have retired. Visit MD in Red Door Plus."}));

  // Session helper endpoint (debug-friendly; still enforces INVALID_SESSION deterministically).
  app.get("/session", (req, res) => {
    const token = getSessionToken(req);
    const result = authService.getSession(token ?? "");
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ session: clientSession(result.value) });
  });

  // Mode
  app.get("/mode", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    return res.status(200).json({ mode: sessionResult.value.mode });
  });

  app.post("/mode/hybrid-opt-in", (req, res) => {
    const token = getSessionToken(req);
    const optIn = (req.body as any)?.optIn;
    const result = authService.setHybridOptIn(token ?? "", optIn === true);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ session: clientSession(result.value) });
  });

  app.post("/mode", (req, res) => {
    const token = getSessionToken(req);
    const mode = getModeFromBody(req);
    if (!mode) return sendError(res, { code: "UNAUTHORIZED_ACTION", message: "Invalid mode." });
    const result = authService.setMode(token ?? "", mode);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ session: clientSession(result.value) });
  });

  const server = http.createServer(app);
  // Realtime gateway
  const wss = new WebSocketServer({ server });
  const gateway = createWebsocketGateway({
    wss,
    jwtSecret,
    authService,
    publicBroadcastPayload(type,payload){if(type==="md_message"){const {memberIds,...visible}=payload as {memberIds:unknown;[key:string]:unknown};return visible;}return payload;},
    authorizeBroadcast(auth, type, payload) {
      if (!auth.ageVerified) return false;
      const actor = auth.userId ? `user:${auth.userId}` : `session:${publicGuestId(auth.sessionToken ?? "")}`;
      const data = payload as any;
      if(type==="md_message")return Boolean(auth.userId && data?.memberIds?.includes(auth.userId) && hasPlus(authService.getUser(auth.userId) ?? {userType:"guest"}));
      if (type === "chat_message") {
        const message = data?.message;
        if (!message || blockService.isBlocked(message.fromKey, message.toKey)) return false;
        return message.fromKey === actor || message.toKey === actor || (typeof message.toKey === "string" && message.toKey.startsWith("spot:") && !blockService.isBlocked(actor, message.fromKey));
      }
      if (type === "call_signal") return Boolean(data && (data.fromKey === actor || data.toKey === actor) && !blockService.isBlocked(data.fromKey, data.toKey));
      if (type === "presence_update") return typeof data?.key === "string" && auth.mode !== "date" && !hiddenPresence(data.key) && !blockService.isBlocked(actor, data.key);
      if(type === "presence_removed")return typeof data?.key==="string" && auth.mode!=="date";
      if(type === "chat_read")return Boolean(data && (data.actorKey===actor || data.otherKey===actor) && !blockService.isBlocked(data.actorKey,data.otherKey));
      return false;
    }
  });

  const presenceService = createPresenceService({
    broadcaster: {
      broadcast(type: string, payload: unknown): void {
        if(!hiddenPresence((payload as {key:string}).key))safeBroadcast(gateway.broadcast, type, payload);
      }
    }
  });

  installMdBridge(app,{auth:authService,repository:communityRepository,member:plusUser,persist:async()=>{await authPersistQueue;if(authPersistenceError)throw new Error("Persistence unavailable");},blocked:(a,b)=>blockService.isBlocked(a,b),secret:process.env.MD_SHARED_SECRET?.trim() ?? "",keySecret:jwtSecret,appUrl:process.env.PUBLIC_APP_URL?.trim() || "https://thereddoor.app",notify:id=>pushService.notify(id,"md"),broadcast:(type,payload)=>safeBroadcast(gateway.broadcast,type,payload)});
  installMemberRoutes(app,{
    auth:authService,profiles:profileRepo,media:mediaRepo,storage:mediaStorage,bucket:s3Bucket || "local-dev-bucket",repository:communityRepository,
    privacyChanged:(key,hideProfile)=>safeBroadcast(gateway.broadcast,"presence_removed",{key,hideProfile}),
    member:plusUser,admin:requireAdminSession,blocked:(a,b)=>blockService.isBlocked(a,b),
    persist:async()=>{await authPersistQueue;if(authPersistenceError)throw new Error("Persistence unavailable");},push:pushService,
    privatePhoto:async(media)=>{if(mediaStorageMode==="s3"){const url=await mediaStorage.presignGetObject({bucket:s3Bucket,key:media.objectKey,expiresInSeconds:30});const response=await fetch(url);if(!response.ok)return null;return {data:Buffer.from(await response.arrayBuffer()),mimeType:media.mimeType};}return mediaStorageMode==="local"?(mediaStorage as LocalObjectStorage).getObject(media.objectKey):await (mediaStorage as PostgresObjectStorage).getObject(media.objectKey);}
  });
  // Presence
  app.post("/presence", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { lat, lng, status } = req.body as any;
    const result = presenceService.updatePresence(domainSession(sessionResult.value), { lat, lng, status });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ presence: result.value });
  });

  app.get("/presence/active", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const banned = bannedUserIds();
    const viewerKey=sessionKeyFromSession(domainSession(sessionResult.value));
    
    // Get active presence
    const activePresence = presenceService.listActivePresence().filter((row) => {
      if(hiddenPresence(row.key) || blockService.isBlocked(viewerKey,row.key))return false;
      if (!row.key.startsWith("user:")) return true;
      const userId = row.key.slice("user:".length).trim();
      return !banned.has(userId);
    });
    
    // Get users with travel mode enabled
    const allProfiles = await profileRepo.listAll();
    const travelModeUsers = allProfiles.filter((profile) => {
      return profile.travelMode?.enabled === true && 
             profile.travelMode.lat !== undefined && 
             profile.travelMode.lng !== undefined &&
             !banned.has(profile.userId) && !hiddenPresence(`user:${profile.userId}`) && !blockService.isBlocked(viewerKey,`user:${profile.userId}`);
    }).map((profile) => ({
      key: `user:${profile.userId}`,
      userType: "registered" as const,
      userId: profile.userId,
      lat: profile.travelMode!.lat!,
      lng: profile.travelMode!.lng!,
      status: "Travel mode",
      updatedAtMs: profile.updatedAtMs
    }));
    
    // Combine and deduplicate (active presence takes precedence)
    const presenceMap = new Map<string, typeof activePresence[0]>();
    
    // Add travel mode users first
    for (const user of travelModeUsers) {
      presenceMap.set(user.key, user);
    }
    
    // Add active presence (overwrites travel mode users if they have active presence)
    for (const presence of activePresence) {
      presenceMap.set(presence.key, presence);
    }
    
    return res.status(200).json({ presence: Array.from(presenceMap.values()) });
  });

  // Matching
  app.post("/matching/swipe", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { toUserId, direction } = req.body as any;
    const result = matchingService.recordSwipe(sessionResult.value, toUserId, direction);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.get("/matching/matches", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const userId = sessionResult.value.userId;
    if (typeof userId !== "string" || userId.trim() === "") {
      return sendError(res, { code: "INVALID_SESSION", message: "Invalid session." });
    }
    const result = matchingService.listMatches(userId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ matches: result.value });
  });

  // Dating feed
  app.get("/dating/feed", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const limitRaw = req.query.limit;
    const limit = limitRaw === undefined ? 50 : Number(limitRaw);
    const result = await datingFeedService.getFeed(sessionResult.value, limit);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profiles: result.value });
  });

  // Chat
  app.post("/chat/send", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { chatKind, toKey, text, media } = req.body as any;
    if (media && (typeof media.objectKey !== "string" || !media.objectKey.startsWith(`chat/${sessionResult.value.userId ? `user-${sessionResult.value.userId}` : `session-${publicGuestId(sessionResult.value.sessionToken)}`}/`))) return sendError(res, { code: "UNAUTHORIZED_ACTION", message: "Chat attachments must be uploaded by the sender." });
    const result = chatService.sendMessage(domainSession(sessionResult.value), { chatKind, toKey, text, media });
    if (!result.ok) return sendError(res, result.error);
    if (sessionResult.value.userId && typeof toKey === "string" && toKey.startsWith("user:") && authService.getUser(sessionResult.value.userId)?.plusData?.analyticsConsent === true && authService.getUser(toKey.slice(5))?.plusData?.analyticsConsent === true && !/^GROUP_INVITE_/.test(text ?? "")) recordMetric(() => metrics.message(sessionResult.value.userId!, toKey.slice(5)));
    safeBroadcast(gateway.broadcast, "chat_message", { message: result.value });
    if(typeof toKey==="string" && toKey.startsWith("user:") && !/^GROUP_INVITE_/.test(text ?? ""))void pushService.notify(toKey.slice(5)).catch(()=>{});
    return res.status(200).json({ message: result.value });
  });

  app.get("/chat/messages", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const chatKind = req.query.chatKind;
    const otherKey = req.query.otherKey;
    const result = chatService.listMessages(domainSession(sessionResult.value), chatKind as any, otherKey as any);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ messages: result.value });
  });

  app.get("/chat/threads", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const chatKind = req.query.chatKind;
    const result = chatService.listThreads(domainSession(sessionResult.value), chatKind as any);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ threads: result.value });
  });

  app.post("/chat/read", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { chatKind, otherKey } = req.body as any;
    const actorKey=sessionKeyFromSession(domainSession(sessionResult.value));
    const before=chatService.listMessages(domainSession(sessionResult.value),chatKind,otherKey);
    const changed=before.ok && before.value.some(m=>m.toKey===actorKey && m.readAtMs===undefined);
    const result = chatService.markRead(domainSession(sessionResult.value), chatKind, otherKey);
    if (!result.ok) return sendError(res, result.error);
    if(changed)safeBroadcast(gateway.broadcast,"chat_read",{actorKey:sessionKeyFromSession(domainSession(sessionResult.value)),otherKey,chatKind});
    return res.status(200).json(result.value);
  });

  app.post("/chat/media/initiate", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    if (sessionResult.value.ageVerified !== true) {
      return sendError(res, { code: "AGE_GATE_REQUIRED", message: "You must be 18 or older to use Red Door.", context: { minimumAge: 18 } });
    }

    const mimeType = typeof (req.body as any)?.mimeType === "string" ? String((req.body as any).mimeType).trim() : "";
    const sizeBytesRaw = Number((req.body as any)?.sizeBytes);
    if (!mimeType) {
      return sendError(res, { code: "INVALID_INPUT", message: "mimeType is required." });
    }
    if (!Number.isFinite(sizeBytesRaw) || sizeBytesRaw <= 0) {
      return sendError(res, { code: "INVALID_INPUT", message: "sizeBytes must be a positive number." });
    }

    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/webm",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg"
    ]);
    if (!allowed.has(mimeType)) {
      return sendError(res, { code: "MEDIA_TYPE_NOT_ALLOWED", message: "Media type is not allowed.", context: { mimeType } });
    }

    const maxSizeBytes =
      mimeType.startsWith("image/") ? 12 * 1024 * 1024 : mimeType.startsWith("video/") ? 80 * 1024 * 1024 : 20 * 1024 * 1024;
    if (sizeBytesRaw > maxSizeBytes) {
      return sendError(res, { code: "MEDIA_TOO_LARGE", message: "Media is too large.", context: { maxSizeBytes } });
    }

    const ext = extensionForMimeType(mimeType);
    const owner = sessionResult.value.userId ? `user-${sessionResult.value.userId}` : `session-${publicGuestId(sessionResult.value.sessionToken)}`;
    const objectKey = `chat/${owner}/${randomUUID()}.${ext}`;
    const uploadUrl = await mediaStorage.presignPutObject({
      bucket: s3Bucket || "local-dev-bucket",
      key: objectKey,
      mimeType,
      expiresInSeconds: 60 * 5
    });
    return res.status(200).json({ objectKey, uploadUrl: absolutizeStorageUrl(req, secureUploadUrl(uploadUrl, objectKey, mimeType, sizeBytesRaw)), mimeType, expiresInSeconds: 300 });
  });

  const chatDownloadTickets = new Map<string, { key: string; sessionToken: string; expires: number }>();
  function mayReadChatMedia(session: AuthSession, key: string) {
    if (!key.startsWith("chat/")) return false;
    const actor = sessionKeyFromSession(domainSession(session));
    const messages = chatService.snapshotState().threads.flatMap(thread => thread.messages);
    for (const message of messages) {
      if (message.media?.objectKey !== key || blockService.isBlocked(message.fromKey, message.toKey)) continue;
      const peer = message.fromKey === actor ? message.toKey : message.fromKey;
      const visible = chatService.listMessages(domainSession(session), message.chatKind, peer);
      if (visible.ok && visible.value.some(row => row.media?.objectKey === key)) return true;
    }
    return false;
  }
  app.get("/chat/media/url", async (req, res) => {
    const session = authService.getSession(getSessionToken(req) ?? "");
    if (!session.ok) return sendError(res, session.error);
    if (session.value.ageVerified !== true) return sendError(res, { code: "AGE_GATE_REQUIRED", message: "You must be 18 or older to use Red Door." });
    const key = typeof req.query.objectKey === "string" ? req.query.objectKey : "";
    if (!mayReadChatMedia(session.value, key)) return sendError(res, { code: "UNAUTHORIZED_ACTION", message: "Chat media is not available in your active conversations." });
    for (const [id, ticket] of chatDownloadTickets) if (ticket.expires <= Date.now()) chatDownloadTickets.delete(id);
    const ticket = randomUUID(); chatDownloadTickets.set(ticket, { key, sessionToken: session.value.sessionToken, expires: Date.now() + 60000 });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ objectKey: key, downloadUrl: absolutizeStorageUrl(req, `/chat/media/download/${ticket}`), expiresInSeconds: 60 });
  });
  app.get("/chat/media/download/:ticket", async (req, res) => {
    const ticket = chatDownloadTickets.get(req.params.ticket);
    if (!ticket || ticket.expires <= Date.now()) return res.status(403).end();
    const session = authService.getSession(ticket.sessionToken);
    if (!session.ok || !mayReadChatMedia(session.value, ticket.key)) return res.status(403).end();
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
    if (mediaStorageMode === "s3") return res.redirect(await mediaStorage.presignGetObject({ bucket: s3Bucket, key: ticket.key, expiresInSeconds: Math.max(1, Math.floor((ticket.expires - Date.now()) / 1000)) }));
    const object = mediaStorageMode === "local" ? (mediaStorage as LocalObjectStorage).getObject(ticket.key) : await (mediaStorage as PostgresObjectStorage).getObject(ticket.key);
    if (!object) return res.status(404).end();
    res.setHeader("Content-Type", object.mimeType); return res.send(object.data);
  });

  app.post("/call/signal", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    if (sessionResult.value.ageVerified !== true) {
      return sendError(res, { code: "AGE_GATE_REQUIRED", message: "You must be 18 or older to use Red Door.", context: { minimumAge: 18 } });
    }

    const toKey = typeof (req.body as any)?.toKey === "string" ? String((req.body as any).toKey).trim() : "";
    const callId = typeof (req.body as any)?.callId === "string" ? String((req.body as any).callId).trim() : "";
    const signalType = typeof (req.body as any)?.signalType === "string" ? String((req.body as any).signalType).trim() : "";
    const sdp = typeof (req.body as any)?.sdp === "string" ? String((req.body as any).sdp) : undefined;
    const candidate = typeof (req.body as any)?.candidate === "string" ? String((req.body as any).candidate) : undefined;
    const fromKey = sessionKeyFromSession(domainSession(sessionResult.value));
    const allowedSignal = signalType === "offer" || signalType === "answer" || signalType === "ice" || signalType === "hangup";

    if (!toKey || !callId || !allowedSignal) {
      return sendError(res, { code: "INVALID_INPUT", message: "Invalid call signal payload." });
    }
    if (toKey === fromKey) {
      return sendError(res, { code: "UNAUTHORIZED_ACTION", message: "Invalid recipient." });
    }
    if ((signalType === "offer" || signalType === "answer") && (!sdp || sdp.length > 32_000)) {
      return sendError(res, { code: "INVALID_INPUT", message: "Invalid SDP payload." });
    }
    if (signalType === "ice" && (!candidate || candidate.length > 4_000)) {
      return sendError(res, { code: "INVALID_INPUT", message: "Invalid ICE payload." });
    }

    const payload = {
      callId,
      signalType,
      fromKey,
      toKey,
      sdp,
      candidate,
      createdAtMs: Date.now()
    };
    const bytes = Buffer.byteLength(JSON.stringify({ type: "call_signal", payload }), "utf8");
    if (bytes > 1900) {
      return sendError(res, {
        code: "INVALID_INPUT",
        message: "Call signaling payload too large.",
        context: { maxBytes: 1900 }
      });
    }
    safeBroadcast(gateway.broadcast, "call_signal", payload);
    return res.status(200).json({ ok: true });
  });

  // Blocking
  app.post("/block", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { targetKey } = req.body as any;
    const result = blockService.block(domainSession(sessionResult.value), targetKey);
    if (!result.ok) return sendError(res, result.error);
    await safetyPersistence;if(safetyPersistenceError)return res.status(503).json({message:"Unable to persist safety settings. Please retry."});
    return res.status(200).json({ block: result.value });
  });

  app.post("/unblock", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { targetKey } = req.body as any;
    const result = blockService.unblock(domainSession(sessionResult.value), targetKey);
    if (!result.ok) return sendError(res, result.error);
    await safetyPersistence;if(safetyPersistenceError)return res.status(503).json({message:"Unable to persist safety settings. Please retry."});
    return res.status(200).json({ ok: true });
  });

  app.get("/blocked", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const actorKey = sessionKeyFromSession(domainSession(sessionResult.value));
    const blocked = blockService.listBlocked(actorKey);
    return res.status(200).json({ blocked });
  });

  // Reporting
  app.post("/report/user", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { targetKey, reason } = req.body as any;
    const result = reportService.reportUser(domainSession(sessionResult.value), targetKey, reason);
    if (!result.ok) return sendError(res, result.error);
    await safetyPersistence;if(safetyPersistenceError)return res.status(503).json({message:"Unable to persist safety settings. Please retry."});
    return res.status(200).json({ report: result.value });
  });

  app.post("/report/message", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { messageId, reason, targetKey } = req.body as any;
    const result = reportService.reportMessage(domainSession(sessionResult.value), messageId, reason, targetKey);
    if (!result.ok) return sendError(res, result.error);
    await safetyPersistence;if(safetyPersistenceError)return res.status(503).json({message:"Unable to persist safety settings. Please retry."});
    return res.status(200).json({ report: result.value });
  });

  // Final error boundary.
  app.use((_err: unknown, _req: Request, res: Response, _next: unknown) => {
    const message = _err instanceof Error ? _err.message : "Internal error.";
    res.status(500).json({ code: "UNAUTHORIZED_ACTION", message });
  });

  server.listen(port, () => {
    console.log(`Red Door backend listening on http://localhost:${port}`);
  });

  const shutdown = async (): Promise<void> => {
    clearInterval(metricsCleanupTimer);
    clearInterval(chatCleanupTimer);
    await Promise.allSettled([authPersistQueue, chatPersistQueue, metricsQueue]);
    if (postgresPool) {
      await postgresPool.end();
    }
  };

  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

void main();
