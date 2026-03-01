import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";

import express, { type Request, type Response } from "express";
import { WebSocketServer } from "ws";
import nodemailer from "nodemailer";

import { createAuthService, type AuthStateSnapshot, type Mode, type ServiceError as AuthError } from "./services/authService";
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
import { createWebsocketGateway, type ServiceError as WsError } from "./realtime/websocketGateway";
import { createInMemoryMediaRepository } from "./repositories/inMemoryMediaRepository";
import { createInMemoryProfileRepository } from "./repositories/inMemoryProfileRepository";
import { createPostgresAuthStateRepository } from "./repositories/postgresAuthStateRepository";
import { createPostgresChatStateRepository } from "./repositories/postgresChatStateRepository";
import { createPostgresMediaRepository } from "./repositories/postgresMediaRepository";
import { createPostgresProfileRepository } from "./repositories/postgresProfileRepository";
import { createPostgresPool, ensurePostgresSchema, resolvePostgresSettingsFromEnv } from "./repositories/postgresCore";
import { createLocalObjectStorage, type LocalObjectStorage } from "./services/storage/localObjectStorage";
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
  | PromotedProfilesError;

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
    console.log(`[RedDoor] Verification code for ${destination}: ${code}`);
  };

  const blockService = createBlockService();
  const reportService = createReportService();
  const favoritesService = createFavoritesService();
  const publicPostingsService = createPublicPostingsService();
  const submissionsService = createSubmissionsService();
  const cruisingSpotsService = createCruisingSpotsService();
  const promotedProfilesService = createPromotedProfilesService();

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
  let chatPersistQueue: Promise<void> = Promise.resolve();
  const queueAuthStateSave = (state: AuthStateSnapshot): void => {
    if (!authStateRepo) return;
    authPersistQueue = authPersistQueue
      .then(() => authStateRepo.saveState(state))
      .catch((e: unknown) => {
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

  const authService = createAuthService({
    jwtSecret,
    skipEmailVerification: true,
    onVerificationCodeIssued: verificationCodeSender,
    initialState: initialAuthState,
    onStateChanged: authStateRepo ? queueAuthStateSave : undefined
  });

  const profileRepo = postgresPool ? createPostgresProfileRepository(postgresPool) : createInMemoryProfileRepository();
  const profileService = createProfileService({ repo: profileRepo });

  const s3Bucket = process.env.S3_BUCKET ?? "";
  const s3Region = process.env.S3_REGION ?? "";
  const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID ?? "";
  const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "";
  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  const mediaRepo = postgresPool ? createPostgresMediaRepository(postgresPool) : createInMemoryMediaRepository();
  const mediaStorage =
    s3Bucket && s3Region && s3AccessKeyId && s3SecretAccessKey
      ? createS3ObjectStorage({
          region: s3Region,
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
          endpoint: typeof s3Endpoint === "string" && s3Endpoint.trim() ? s3Endpoint.trim() : undefined,
          forcePathStyle: s3ForcePathStyle
        })
      : createLocalObjectStorage();
  const mediaStorageMode: "s3" | "local" =
    s3Bucket && s3Region && s3AccessKeyId && s3SecretAccessKey ? "s3" : "local";

  const mediaService = createMediaService({
    repo: mediaRepo,
    profileRepo,
    storage: mediaStorage,
    bucket: s3Bucket || "local-dev-bucket"
  });

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
    cruiseRetentionHours: 24 * 365,
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

  const app = express();
  const allowedOrigins = parseAllowedOrigins(
    process.env.CORS_ALLOWED_ORIGINS ??
      "capacitor://localhost,http://localhost,http://127.0.0.1,ionic://localhost"
  );
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
  app.use(express.json({ limit: "8kb" }));

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
    const mimeTypeRaw = (req.query as any)?.mimeType;
    const mimeType = typeof mimeTypeRaw === "string" && mimeTypeRaw.trim() ? mimeTypeRaw.trim() : "application/octet-stream";
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
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
    const stored = localStorage.getObject(key);
    if (!stored) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Object not found." });
    }
    res.setHeader("content-type", stored.mimeType);
    return res.status(200).send(stored.data);
  };
  app.get("/storage/local/download/:encodedKey", handleLocalStorageDownload);
  app.get("/api/storage/local/download/:encodedKey", handleLocalStorageDownload);

  // Auth
  app.post("/auth/guest", (_req, res) => {
    const result = authService.createGuestSession();
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  app.post("/auth/register", (req, res) => {
    const email = (req.body as any)?.email;
    const password = (req.body as any)?.password;
    const phoneE164 = (req.body as any)?.phoneE164;
    const result = authService.register(email, password, phoneE164);
    if (!result.ok) return sendError(res, result.error);
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
    return res.status(200).json({ session: result.value });
  });

  // Profile
  app.get("/profile/me", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = await profileService.getMe(sessionResult.value);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profile: result.value });
  });

  app.get("/profile/public/:userId", async (req, res) => {
    const result = await profileService.getPublicByUserId((req.params as any)?.userId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profile: result.value });
  });

  app.get("/profile/public", async (_req, res) => {
    const result = await profileService.listPublicProfiles();
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ profiles: result.value });
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

  // Media (S3 presigned uploads)
  app.post("/profile/media/initiate", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = await mediaService.initiateUpload(sessionResult.value, {
      kind: (req.body as any)?.kind,
      mimeType: (req.body as any)?.mimeType,
      sizeBytes: (req.body as any)?.sizeBytes
    });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({
      ...result.value,
      uploadUrl: absolutizeStorageUrl(req, result.value.uploadUrl)
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
    const result = favoritesService.list(sessionResult.value);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ favorites: result.value });
  });

  app.post("/favorites/toggle", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = favoritesService.toggle(sessionResult.value, (req.body as any)?.targetUserId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json(result.value);
  });

  // Community postings (ads/events)
  app.get("/public-postings", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = token ? authService.getSession(token) : null;
    const viewer = sessionResult && sessionResult.ok ? sessionResult.value : undefined;
    const result = publicPostingsService.list((req.query as any)?.type, viewer);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ postings: result.value });
  });

  app.post("/public-postings", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = publicPostingsService.create(sessionResult.value, {
      type: (req.body as any)?.type,
      title: (req.body as any)?.title,
      body: (req.body as any)?.body,
      photoMediaId: (req.body as any)?.photoMediaId,
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
    const result = publicPostingsService.requestToJoinEvent(sessionResult.value, (req.body as any)?.postingId);
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
    const result = publicPostingsService.listEventInvites(sessionResult.value);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ postings: result.value });
  });

  // Cruising spots
  app.get("/cruise-spots", (_req, res) => {
    const result = cruisingSpotsService.list();
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
    const result = cruisingSpotsService.create(sessionResult.value, {
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
    const result = cruisingSpotsService.checkIn(sessionResult.value, (req.params as any)?.spotId);
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
    const result = cruisingSpotsService.recordAction(sessionResult.value, (req.params as any)?.spotId);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ action: result.value });
  });

  // Story submissions
  app.get("/submissions", (_req, res) => {
    const result = submissionsService.list();
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ submissions: result.value });
  });

  app.post("/submissions", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = submissionsService.create(sessionResult.value, (req.body as any)?.title, (req.body as any)?.body);
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

  // Promoted profiles (safe paid listings)
  app.get("/promoted-profiles", (_req, res) => {
    const result = promotedProfilesService.listListings();
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ listings: result.value, feeCents: 2000 });
  });

  app.post("/promoted-profiles/payment/start", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = promotedProfilesService.startPayment(sessionResult.value);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ payment: result.value });
  });

  app.post("/promoted-profiles/payment/confirm", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = promotedProfilesService.confirmPayment(sessionResult.value, (req.body as any)?.paymentToken);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ payment: result.value });
  });

  app.post("/promoted-profiles", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const result = promotedProfilesService.createListing(sessionResult.value, {
      paymentToken: (req.body as any)?.paymentToken,
      title: (req.body as any)?.title,
      body: (req.body as any)?.body,
      displayName: (req.body as any)?.displayName
    });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ listing: result.value });
  });

  // Session helper endpoint (debug-friendly; still enforces INVALID_SESSION deterministically).
  app.get("/session", (req, res) => {
    const token = getSessionToken(req);
    const result = authService.getSession(token ?? "");
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ session: result.value });
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
    return res.status(200).json({ session: result.value });
  });

  app.post("/mode", (req, res) => {
    const token = getSessionToken(req);
    const mode = getModeFromBody(req);
    if (!mode) return sendError(res, { code: "UNAUTHORIZED_ACTION", message: "Invalid mode." });
    const result = authService.setMode(token ?? "", mode);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ session: result.value });
  });

  const server = http.createServer(app);
  // Realtime gateway
  const wss = new WebSocketServer({ server });
  const gateway = createWebsocketGateway({
    wss,
    jwtSecret,
    authService
  });

  const presenceService = createPresenceService({
    broadcaster: {
      broadcast(type: string, payload: unknown): void {
        safeBroadcast(gateway.broadcast, type, payload);
      }
    }
  });

  // Presence
  app.post("/presence", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { lat, lng, status } = req.body as any;
    const result = presenceService.updatePresence(sessionResult.value, { lat, lng, status });
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ presence: result.value });
  });

  app.get("/presence/active", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const active = presenceService.listActivePresence();
    return res.status(200).json({ presence: active });
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
    const result = chatService.sendMessage(sessionResult.value, { chatKind, toKey, text, media });
    if (!result.ok) return sendError(res, result.error);
    safeBroadcast(gateway.broadcast, "chat_message", { message: result.value });
    return res.status(200).json({ message: result.value });
  });

  app.get("/chat/messages", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const chatKind = req.query.chatKind;
    const otherKey = req.query.otherKey;
    const result = chatService.listMessages(sessionResult.value, chatKind as any, otherKey as any);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ messages: result.value });
  });

  app.get("/chat/threads", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const chatKind = req.query.chatKind;
    const result = chatService.listThreads(sessionResult.value, chatKind as any);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ threads: result.value });
  });

  app.post("/chat/read", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { chatKind, otherKey } = req.body as any;
    const result = chatService.markRead(sessionResult.value, chatKind, otherKey);
    if (!result.ok) return sendError(res, result.error);
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
    const owner = sessionResult.value.userId ? `user-${sessionResult.value.userId}` : `session-${sessionResult.value.sessionToken}`;
    const objectKey = `chat/${owner}/${randomUUID()}.${ext}`;
    const uploadUrl = await mediaStorage.presignPutObject({
      bucket: s3Bucket || "local-dev-bucket",
      key: objectKey,
      mimeType,
      expiresInSeconds: 60 * 5
    });
    return res.status(200).json({ objectKey, uploadUrl: absolutizeStorageUrl(req, uploadUrl), mimeType, expiresInSeconds: 300 });
  });

  app.get("/chat/media/url", async (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    if (sessionResult.value.ageVerified !== true) {
      return sendError(res, { code: "AGE_GATE_REQUIRED", message: "You must be 18 or older to use Red Door.", context: { minimumAge: 18 } });
    }
    const objectKey = typeof req.query.objectKey === "string" ? req.query.objectKey.trim() : "";
    if (!objectKey) {
      return sendError(res, { code: "INVALID_INPUT", message: "objectKey is required." });
    }
    const downloadUrl = await mediaStorage.presignGetObject({
      bucket: s3Bucket || "local-dev-bucket",
      key: objectKey,
      expiresInSeconds: 60 * 10
    });
    return res.status(200).json({ objectKey, downloadUrl: absolutizeStorageUrl(req, downloadUrl), expiresInSeconds: 600 });
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
    const fromKey = sessionKeyFromSession(sessionResult.value);
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
  app.post("/block", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { targetKey } = req.body as any;
    const result = blockService.block(sessionResult.value, targetKey);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ block: result.value });
  });

  app.post("/unblock", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { targetKey } = req.body as any;
    const result = blockService.unblock(sessionResult.value, targetKey);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ ok: true });
  });

  app.get("/blocked", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const actorKey = sessionKeyFromSession(sessionResult.value);
    const blocked = blockService.listBlocked(actorKey);
    return res.status(200).json({ blocked });
  });

  // Reporting
  app.post("/report/user", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { targetKey, reason } = req.body as any;
    const result = reportService.reportUser(sessionResult.value, targetKey, reason);
    if (!result.ok) return sendError(res, result.error);
    return res.status(200).json({ report: result.value });
  });

  app.post("/report/message", (req, res) => {
    const token = getSessionToken(req);
    const sessionResult = authService.getSession(token ?? "");
    if (!sessionResult.ok) return sendError(res, sessionResult.error);
    const { messageId, reason, targetKey } = req.body as any;
    const result = reportService.reportMessage(sessionResult.value, messageId, reason, targetKey);
    if (!result.ok) return sendError(res, result.error);
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
    await Promise.allSettled([authPersistQueue, chatPersistQueue]);
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
