export type ServiceError = Readonly<{
  code: string;
  message: string;
  context?: Record<string, unknown>;
}>;

export type Session = Readonly<{
  sessionToken: string;
  userType: "guest" | "registered" | "subscriber";
  tier: "free" | "premium";
  mode: "cruise" | "date" | "hybrid";
  userId?: string;
  ageVerified: boolean;
  hybridOptIn: boolean;
  expiresAtMs: number;
}>;

export type VerifyEmailOrLoginResponse = Readonly<{
  user: { id: string; email: string; userType: "registered" | "subscriber"; tier: "free" | "premium" };
  jwt: string;
  session: Session;
}>;

export type RegisterResponse = Readonly<{
  email: string;
  verificationRequired: true;
}>;

export type GuestResponse = Readonly<{ session: Session }>;

export type DatingProfile = Readonly<{
  id: string;
  displayName: string;
  age?: number;
  race?: string;
  heightInches?: number;
  weightLbs?: number;
  cockSizeInches?: number;
  cutStatus?: "cut" | "uncut";
  distanceBucket?: "<500m" | "<1km" | "<5km" | ">5km";
}>;

export type FeedResponse = Readonly<{ profiles: ReadonlyArray<DatingProfile> }>;

export type SwipeResponse = Readonly<{
  matchCreated: boolean;
  match?: { matchId: string; userA: string; userB: string; createdAtMs: number };
}>;

export type ProfileCutStatus = "cut" | "uncut";
export type ProfilePosition = "top" | "bottom" | "side";

export type UserProfile = Readonly<{
  userId: string;
  displayName: string;
  age: number;
  bio: string;
  stats: Readonly<{
    heightInches?: number;
    race?: string;
    cockSizeInches?: number;
    cutStatus?: ProfileCutStatus;
    weightLbs?: number;
    position?: ProfilePosition;
  }>;
  discreetMode?: boolean;
  travelMode?: Readonly<{ enabled: boolean; lat?: number; lng?: number }>;
  mainPhotoMediaId?: string;
  galleryMediaIds: ReadonlyArray<string>;
  videoMediaId?: string;
  updatedAtMs: number;
}>;

export type PublicProfile = Readonly<{
  userId: string;
  displayName: string;
  age: number;
  bio: string;
  stats: Readonly<{
    heightInches?: number;
    race?: string;
    cockSizeInches?: number;
    cutStatus?: ProfileCutStatus;
    weightLbs?: number;
    position?: ProfilePosition;
  }>;
  discreetMode?: boolean;
  mainPhotoMediaId?: string;
  galleryMediaIds: ReadonlyArray<string>;
  videoMediaId?: string;
  updatedAtMs: number;
}>;

export type ProfileUpdatePayload = Readonly<{
  displayName: string;
  age: number;
  bio: string;
  stats: Readonly<{
    heightInches?: number;
    race?: string;
    cockSizeInches?: number;
    cutStatus?: ProfileCutStatus;
    weightLbs?: number;
    position?: ProfilePosition;
  }>;
  discreetMode?: boolean;
  travelMode?: Readonly<{ enabled: boolean; lat?: number; lng?: number }>;
}>;

export type MediaKind = "photo_main" | "photo_gallery" | "video";

export type InitiateMediaUploadResponse = Readonly<{
  mediaId: string;
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}>;

export type FavoriteToggleResponse = Readonly<{
  targetUserId: string;
  isFavorite: boolean;
  favorites: ReadonlyArray<string>;
}>;

export type PublicPosting = Readonly<{
  postingId: string;
  type: "ad" | "event";
  title: string;
  body: string;
  authorUserId: string;
  createdAtMs: number;
  invitedUserIds?: ReadonlyArray<string>;
  acceptedUserIds?: ReadonlyArray<string>;
}>;

export type CruisingSpot = Readonly<{
  spotId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  creatorUserId: string;
  createdAtMs: number;
  checkInCount: number;
  actionCount: number;
}>;

export type Submission = Readonly<{
  submissionId: string;
  authorUserId: string;
  title: string;
  body: string;
  viewCount: number;
  ratingCount: number;
  ratingSum: number;
  createdAtMs: number;
}>;

export type PromotedProfileListing = Readonly<{
  listingId: string;
  userId: string;
  title: string;
  body: string;
  displayName: string;
  createdAtMs: number;
}>;

async function readJsonOrThrow(res: Response): Promise<any> {
  const text = await res.text();
  const parsed = text.length ? JSON.parse(text) : null;
  if (res.ok) return parsed;
  // Backend errors are already in {code,message,context?}; surface verbatim.
  throw parsed as ServiceError;
}

type ChatKind = "cruise" | "date";

type LocalChatMessage = Readonly<{
  messageId: string;
  chatKind: ChatKind;
  fromKey: string;
  toKey: string;
  text: string;
  media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>;
  createdAtMs: number;
  deliveredAtMs?: number;
  readAtMs?: number;
}>;

type LocalPresence = Readonly<{
  key: string;
  userType: "guest" | "registered" | "subscriber";
  lat: number;
  lng: number;
  status?: string;
  updatedAtMs: number;
}>;

type LocalMediaRecord = Readonly<{
  mediaId: string;
  objectKey: string;
  ownerUserId: string;
  kind: MediaKind;
  mimeType: string;
  uploaded: boolean;
  dataUrl?: string;
  createdAtMs: number;
}>;

type LocalChatMediaRecord = Readonly<{
  objectKey: string;
  mimeType: string;
  dataUrl?: string;
  createdAtMs: number;
}>;

type LocalUser = Readonly<{
  id: string;
  email: string;
  password: string;
  phoneE164: string;
  verified: boolean;
  userType: "registered" | "subscriber";
  tier: "free" | "premium";
}>;

type LocalState = Readonly<{
  usersById: Record<string, LocalUser>;
  userIdByEmail: Record<string, string>;
  verificationCodesByEmail: Record<string, string>;
  sessionsByToken: Record<string, Session>;
  profilesByUserId: Record<string, UserProfile>;
  favoritesByUserId: Record<string, ReadonlyArray<string>>;
  blockedByActorKey: Record<string, ReadonlyArray<string>>;
  presenceByKey: Record<string, LocalPresence>;
  messages: ReadonlyArray<LocalChatMessage>;
  likes: Record<string, ReadonlyArray<string>>;
  reports: ReadonlyArray<Readonly<{ type: "user" | "message"; actorKey: string; targetKey?: string; messageId?: string; reason: string; createdAtMs: number }>>;
  mediaById: Record<string, LocalMediaRecord>;
  mediaIdByObjectKey: Record<string, string>;
  chatMediaByObjectKey: Record<string, LocalChatMediaRecord>;
  publicPostings: ReadonlyArray<PublicPosting>;
  cruisingSpots: ReadonlyArray<CruisingSpot>;
  spotCheckIns: ReadonlyArray<Readonly<{ spotId: string; actorKey: string; checkedInAtMs: number }>>;
  spotActions: ReadonlyArray<Readonly<{ spotId: string; actorKey: string; markedAtMs: number }>>;
  submissions: ReadonlyArray<Submission>;
  promotedProfiles: ReadonlyArray<PromotedProfileListing>;
  promotedPaymentsByToken: Record<string, Readonly<{ paymentToken: string; ownerUserId: string; amountCents: number; status: "started" | "confirmed"; expiresAtMs: number }>>;
}>;

const LOCAL_STATE_KEY = "reddoor_local_state_v1";
const LOCAL_UPLOAD_PREFIX = "rdlocal://";
// Full-page web navigation requires durable local state across reloads.
const LOCAL_PERSIST_ENABLED = true;

function isLocalApiMode(basePath: string): boolean {
  const trimmed = basePath.trim().toLowerCase();
  return trimmed === "__local__" || trimmed === "local" || trimmed === "rdlocal";
}

function nowMs(): number {
  return Date.now();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function randomId(prefix: string): string {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return `${prefix}-${globalCrypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

function defaultProfile(userId: string, displayName?: string): UserProfile {
  const ts = nowMs();
  return {
    userId,
    displayName: displayName || `User ${userId.slice(0, 4)}`,
    age: 21,
    bio: "Say hi.",
    stats: {},
    galleryMediaIds: [],
    updatedAtMs: ts
  };
}

function emptyLocalState(): LocalState {
  return {
    usersById: {},
    userIdByEmail: {},
    verificationCodesByEmail: {},
    sessionsByToken: {},
    profilesByUserId: {},
    favoritesByUserId: {},
    blockedByActorKey: {},
    presenceByKey: {},
    messages: [],
    likes: {},
    reports: [],
    mediaById: {},
    mediaIdByObjectKey: {},
    chatMediaByObjectKey: {},
    publicPostings: [],
    cruisingSpots: [],
    spotCheckIns: [],
    spotActions: [],
    submissions: [],
    promotedProfiles: [],
    promotedPaymentsByToken: {}
  };
}

function loadLocalState(): LocalState {
  if (!LOCAL_PERSIST_ENABLED) return emptyLocalState();
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) return emptyLocalState();
    const parsed = JSON.parse(raw) as LocalState;
    return { ...emptyLocalState(), ...parsed };
  } catch {
    return emptyLocalState();
  }
}

function saveLocalState(next: LocalState): void {
  if (!LOCAL_PERSIST_ENABLED) return;
  try {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; local mode degrades to in-memory for this session.
  }
}

let inMemoryFallbackState: LocalState | null = null;

function readState(): LocalState {
  if (inMemoryFallbackState) return inMemoryFallbackState;
  const state = loadLocalState();
  inMemoryFallbackState = state;
  return state;
}

function writeState(state: LocalState, persist = true): void {
  inMemoryFallbackState = state;
  if (!persist) return;
  saveLocalState(state);
}

function actorKeyForSession(session: Session): string {
  return session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
}

function requireSession(state: LocalState, sessionToken: string): Session {
  const session = state.sessionsByToken[sessionToken];
  if (!session) {
    throw { code: "SESSION_NOT_FOUND", message: "Session not found." } as ServiceError;
  }
  return session;
}

function requireUserSession(state: LocalState, sessionToken: string): Session {
  const session = requireSession(state, sessionToken);
  if (!session.userId) {
    throw { code: "AUTH_REQUIRED", message: "Registered account required." } as ServiceError;
  }
  return session;
}

function withUpdatedSession(state: LocalState, session: Session): LocalState {
  return {
    ...state,
    sessionsByToken: {
      ...state.sessionsByToken,
      [session.sessionToken]: session
    }
  };
}

function toPublicProfile(profile: UserProfile): PublicProfile {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    age: profile.age,
    bio: profile.bio,
    stats: profile.stats,
    discreetMode: profile.discreetMode,
    mainPhotoMediaId: profile.mainPhotoMediaId,
    galleryMediaIds: profile.galleryMediaIds,
    videoMediaId: profile.videoMediaId,
    updatedAtMs: profile.updatedAtMs
  };
}

function resolveMediaDataUrl(state: LocalState, mediaId: string): string {
  const record = state.mediaById[mediaId];
  if (!record || !record.dataUrl) {
    throw { code: "MEDIA_NOT_FOUND", message: "Media not found." } as ServiceError;
  }
  return record.dataUrl;
}

function toDistanceBucket(distanceMeters: number): DatingProfile["distanceBucket"] {
  if (distanceMeters < 500) return "<500m";
  if (distanceMeters < 1_000) return "<1km";
  if (distanceMeters < 5_000) return "<5km";
  return ">5km";
}

function distanceMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function normalizeChatPeerKey(raw: string): string {
  const key = raw.trim();
  if (!key) return key;
  if (key.startsWith("guest:")) return `session:${key.slice("guest:".length).trim()}`;
  if (key.startsWith("user:guest:")) return `session:${key.slice("user:guest:".length).trim()}`;
  return key;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });
}

export async function uploadToLocalSignedUrl(uploadUrl: string, file: Blob, mimeType: string): Promise<boolean> {
  if (!uploadUrl.startsWith(LOCAL_UPLOAD_PREFIX)) return false;
  const token = uploadUrl.slice(LOCAL_UPLOAD_PREFIX.length);
  const sep = token.indexOf("/");
  if (sep <= 0) {
    throw { code: "MEDIA_UPLOAD_INVALID", message: "Invalid local upload URL." } as ServiceError;
  }
  const scope = token.slice(0, sep);
  const key = token.slice(sep + 1);
  const dataUrl = await blobToDataUrl(new Blob([file], { type: mimeType || "application/octet-stream" }));
  const state = readState();
  if (scope === "chat") {
    const record = state.chatMediaByObjectKey[key];
    if (!record) throw { code: "MEDIA_UPLOAD_INVALID", message: "Unknown chat upload key." } as ServiceError;
    writeState({
      ...state,
      chatMediaByObjectKey: {
        ...state.chatMediaByObjectKey,
        [key]: { ...record, dataUrl }
      }
    });
    return true;
  }
  if (scope === "profile") {
    const mediaId = state.mediaIdByObjectKey[key];
    if (!mediaId) throw { code: "MEDIA_UPLOAD_INVALID", message: "Unknown profile upload key." } as ServiceError;
    const media = state.mediaById[mediaId];
    if (!media) throw { code: "MEDIA_NOT_FOUND", message: "Media upload target not found." } as ServiceError;
    writeState({
      ...state,
      mediaById: {
        ...state.mediaById,
        [mediaId]: { ...media, dataUrl, uploaded: true }
      }
    });
    return true;
  }
  throw { code: "MEDIA_UPLOAD_INVALID", message: "Unknown local upload scope." } as ServiceError;
}

function createLocalApiClient(): Readonly<{
  createGuest(): Promise<GuestResponse>;
  register(email: string, password: string, phoneE164: string): Promise<RegisterResponse>;
  verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse>;
  resendVerification(email: string): Promise<RegisterResponse>;
  login(email: string, password: string): Promise<VerifyEmailOrLoginResponse>;
  verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }>;
  getSession(sessionToken: string): Promise<{ session: Session }>;
  getMode(sessionToken: string): Promise<{ mode: Session["mode"] }>;
  setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }>;
  setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }>;
  updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any>;
  listActivePresence(sessionToken: string): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }>;
  getDatingFeed(sessionToken: string): Promise<FeedResponse>;
  swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse>;
  sendChat(
    sessionToken: string,
    chatKind: "cruise" | "date",
    toKey: string,
    text: string,
    media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
  ): Promise<any>;
  sendCallSignal(
    sessionToken: string,
    payload: Readonly<{
      toKey: string;
      callId: string;
      signalType: "offer" | "answer" | "ice" | "hangup";
      sdp?: string;
      candidate?: string;
    }>
  ): Promise<{ ok: true }>;
  listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any>;
  markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }>;
  initiateChatMediaUpload(
    sessionToken: string,
    payload: Readonly<{ mimeType: string; sizeBytes: number }>
  ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }>;
  getChatMediaUrl(sessionToken: string, objectKey: string): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }>;
  block(sessionToken: string, targetKey: string): Promise<any>;
  unblock(sessionToken: string, targetKey: string): Promise<any>;
  listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }>;
  reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any>;
  reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any>;
  getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }>;
  getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }>;
  getPublicProfile(userId: string): Promise<{ profile: PublicProfile }>;
  getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }>;
  upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }>;
  updateProfileMediaReferences(
    sessionToken: string,
    payload: Readonly<{
      galleryMediaIds?: ReadonlyArray<string>;
      mainPhotoMediaId?: string;
    }>
  ): Promise<{ profile: UserProfile }>;
  initiateMediaUpload(
    sessionToken: string,
    payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
  ): Promise<InitiateMediaUploadResponse>;
  completeMediaUpload(sessionToken: string, mediaId: string): Promise<{ media: unknown }>;
  getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }>;
  toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse>;
  listPublicPostings(type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  createPublicPosting(sessionToken: string, payload: Readonly<{ type: "ad" | "event"; title: string; body: string }>): Promise<{ posting: PublicPosting }>;
  inviteToEvent(
    sessionToken: string,
    payload: Readonly<{ postingId: string; targetUserId: string }>
  ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }>;
  respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }>;
  listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  listCruisingSpots(): Promise<{ spots: ReadonlyArray<CruisingSpot> }>;
  createCruisingSpot(sessionToken: string, payload: Readonly<{ name: string; address: string; description: string }>): Promise<{ spot: CruisingSpot }>;
  checkInCruisingSpot(sessionToken: string, spotId: string): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }>;
  markCruisingSpotAction(sessionToken: string, spotId: string): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }>;
  listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }>;
  listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }>;
  createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }>;
  recordSubmissionView(submissionId: string): Promise<{ submission: Submission }>;
  rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }>;
  listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }>;
  startPromotedPayment(sessionToken: string): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  confirmPromotedPayment(
    sessionToken: string,
    paymentToken: string
  ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  createPromotedProfile(
    sessionToken: string,
    payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
  ): Promise<{ listing: PromotedProfileListing }>;
  seedFakeUsers(count: number, centerLat?: number, centerLng?: number): Promise<{ seededCount: number; seeded: ReadonlyArray<{ key: string; displayName: string; age: number }> }>;
}> {
  const feeCents = 499;

  return {
    async createGuest(): Promise<GuestResponse> {
      const sessionToken = randomId("session");
      const session: Session = {
        sessionToken,
        userType: "guest",
        tier: "free",
        mode: "hybrid",
        ageVerified: false,
        hybridOptIn: true,
        expiresAtMs: nowMs() + 1000 * 60 * 60 * 24 * 14
      };
      const state = readState();
      writeState(withUpdatedSession(state, session));
      return { session: clone(session) };
    },
    async register(email: string, password: string, phoneE164: string): Promise<RegisterResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password || !phoneE164) {
        throw { code: "INVALID_INPUT", message: "Email, password, and phone are required." } as ServiceError;
      }
      const state = readState();
      if (state.userIdByEmail[normalizedEmail]) {
        throw { code: "EMAIL_IN_USE", message: "Email already registered." } as ServiceError;
      }
      const userId = randomId("user");
      const user: LocalUser = {
        id: userId,
        email: normalizedEmail,
        password,
        phoneE164,
        verified: true,
        userType: "registered",
        tier: "free"
      };
      writeState({
        ...state,
        usersById: { ...state.usersById, [userId]: user },
        userIdByEmail: { ...state.userIdByEmail, [normalizedEmail]: userId },
        profilesByUserId: {
          ...state.profilesByUserId,
          [userId]: defaultProfile(userId, normalizedEmail.split("@")[0] || undefined)
        }
      });
      return { email: normalizedEmail, verificationRequired: true };
    },
    async verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      const state = readState();
      const userId = state.userIdByEmail[normalizedEmail];
      if (!userId) {
        throw { code: "USER_NOT_FOUND", message: "Account not found." } as ServiceError;
      }
      const expectedCode = state.verificationCodesByEmail[normalizedEmail];
      if (expectedCode && expectedCode !== code.trim()) {
        throw { code: "CODE_INVALID", message: "Invalid verification code." } as ServiceError;
      }
      const user = state.usersById[userId];
      const verifiedUser: LocalUser = { ...user, verified: true };
      const sessionToken = randomId("session");
      const session: Session = {
        sessionToken,
        userType: verifiedUser.userType,
        tier: verifiedUser.tier,
        mode: "hybrid",
        userId,
        ageVerified: true,
        hybridOptIn: true,
        expiresAtMs: nowMs() + 1000 * 60 * 60 * 24 * 30
      };
      writeState({
        ...state,
        usersById: { ...state.usersById, [userId]: verifiedUser },
        sessionsByToken: { ...state.sessionsByToken, [sessionToken]: session }
      });
      return {
        user: { id: userId, email: normalizedEmail, userType: verifiedUser.userType, tier: verifiedUser.tier },
        jwt: `local-jwt-${sessionToken}`,
        session: clone(session)
      };
    },
    async resendVerification(email: string): Promise<RegisterResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      const state = readState();
      if (!state.userIdByEmail[normalizedEmail]) {
        throw { code: "USER_NOT_FOUND", message: "Account not found." } as ServiceError;
      }
      writeState({
        ...state,
        verificationCodesByEmail: {
          ...state.verificationCodesByEmail,
          [normalizedEmail]: "111111"
        }
      });
      return { email: normalizedEmail, verificationRequired: true };
    },
    async login(email: string, password: string): Promise<VerifyEmailOrLoginResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      const state = readState();
      const userId = state.userIdByEmail[normalizedEmail];
      if (!userId) throw { code: "USER_NOT_FOUND", message: "Invalid credentials." } as ServiceError;
      const user = state.usersById[userId];
      if (!user.verified) throw { code: "NOT_VERIFIED", message: "Verify your email first." } as ServiceError;
      if (user.password !== password) throw { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } as ServiceError;
      const sessionToken = randomId("session");
      const session: Session = {
        sessionToken,
        userType: user.userType,
        tier: user.tier,
        mode: "hybrid",
        userId,
        ageVerified: true,
        hybridOptIn: true,
        expiresAtMs: nowMs() + 1000 * 60 * 60 * 24 * 30
      };
      writeState({
        ...state,
        sessionsByToken: { ...state.sessionsByToken, [sessionToken]: session }
      });
      return {
        user: { id: userId, email: normalizedEmail, userType: user.userType, tier: user.tier },
        jwt: `local-jwt-${sessionToken}`,
        session: clone(session)
      };
    },
    async verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }> {
      if (!Number.isFinite(ageYears) || ageYears < 18) {
        throw { code: "AGE_REJECTED", message: "You must be at least 18." } as ServiceError;
      }
      const state = readState();
      const session = requireSession(state, sessionToken);
      const nextSession: Session = { ...session, ageVerified: true };
      writeState(withUpdatedSession(state, nextSession));
      return { session: clone(nextSession) };
    },
    async getSession(sessionToken: string): Promise<{ session: Session }> {
      const state = readState();
      return { session: clone(requireSession(state, sessionToken)) };
    },
    async getMode(sessionToken: string): Promise<{ mode: Session["mode"] }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      return { mode: session.mode };
    },
    async setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const nextMode = optIn ? "hybrid" : session.mode === "hybrid" ? "cruise" : session.mode;
      const nextSession: Session = { ...session, hybridOptIn: optIn, mode: nextMode };
      writeState(withUpdatedSession(state, nextSession));
      return { session: clone(nextSession) };
    },
    async setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const nextSession: Session = { ...session, mode };
      writeState(withUpdatedSession(state, nextSession));
      return { session: clone(nextSession) };
    },
    async updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any> {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw { code: "INVALID_INPUT", message: "Latitude/longitude are required." } as ServiceError;
      }
      const state = readState();
      const session = requireSession(state, sessionToken);
      const key = actorKeyForSession(session);
      const nextPresence: LocalPresence = {
        key,
        userType: session.userType,
        lat,
        lng,
        status,
        updatedAtMs: nowMs()
      };
      writeState(
        {
        ...state,
        presenceByKey: {
          ...state.presenceByKey,
          [key]: nextPresence
        }
      },
        false
      );
      return { ok: true, presence: clone(nextPresence) };
    },
    async listActivePresence(): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }> {
      const state = readState();
      return { presence: clone(Object.values(state.presenceByKey)) };
    },
    async getDatingFeed(sessionToken: string): Promise<FeedResponse> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const meKey = actorKeyForSession(session);
      const mePresence = state.presenceByKey[meKey];
      const profiles = Object.values(state.profilesByUserId)
        .filter((p) => p.userId !== session.userId)
        .map((p) => {
          let row: DatingProfile = {
            id: p.userId,
            displayName: p.displayName,
            age: p.age,
            race: p.stats.race,
            heightInches: p.stats.heightInches,
            weightLbs: p.stats.weightLbs,
            cockSizeInches: p.stats.cockSizeInches,
            cutStatus: p.stats.cutStatus
          };
          const peerPresence = state.presenceByKey[`user:${p.userId}`];
          if (mePresence && peerPresence) {
            row = {
              ...row,
              distanceBucket: toDistanceBucket(distanceMeters(mePresence.lat, mePresence.lng, peerPresence.lat, peerPresence.lng))
            };
          }
          return row;
        });
      return { profiles: clone(profiles) };
    },
    async swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const from = session.userId as string;
      const current = new Set(state.likes[from] ?? []);
      if (direction === "like") current.add(toUserId);
      else current.delete(toUserId);
      const likes = { ...state.likes, [from]: [...current] };
      writeState({ ...state, likes });
      const reciprocal = (likes[toUserId] ?? []).includes(from);
      return reciprocal
        ? { matchCreated: true, match: { matchId: randomId("match"), userA: from, userB: toUserId, createdAtMs: nowMs() } }
        : { matchCreated: false };
    },
    async sendChat(
      sessionToken: string,
      chatKind: "cruise" | "date",
      toKey: string,
      text: string,
      media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
    ): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const fromKey = actorKeyForSession(session);
      const normalizedToKey = normalizeChatPeerKey(toKey);
      const msg: LocalChatMessage = {
        messageId: randomId("msg"),
        chatKind,
        fromKey,
        toKey: normalizedToKey,
        text,
        media,
        createdAtMs: nowMs(),
        deliveredAtMs: nowMs()
      };
      writeState({ ...state, messages: [...state.messages, msg] });
      return { ok: true, message: clone(msg) };
    },
    async sendCallSignal(): Promise<{ ok: true }> {
      return { ok: true };
    },
    async listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const me = actorKeyForSession(session);
      const peer = normalizeChatPeerKey(otherKey);
      const messages = state.messages
        .filter((m) => m.chatKind === chatKind)
        .filter((m) => (m.fromKey === me && m.toKey === peer) || (m.fromKey === peer && m.toKey === me))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      return { messages: clone(messages) };
    },
    async markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const me = actorKeyForSession(session);
      const peer = normalizeChatPeerKey(otherKey);
      const ts = nowMs();
      const next = state.messages.map((m) => {
        if (m.chatKind !== chatKind) return m;
        if (m.fromKey === peer && m.toKey === me && !m.readAtMs) {
          return { ...m, readAtMs: ts };
        }
        return m;
      });
      writeState({ ...state, messages: next });
      return { readAtMs: ts };
    },
    async initiateChatMediaUpload(
      _sessionToken: string,
      payload: Readonly<{ mimeType: string; sizeBytes: number }>
    ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }> {
      if (!Number.isFinite(payload.sizeBytes) || payload.sizeBytes <= 0) {
        throw { code: "INVALID_INPUT", message: "File size must be greater than zero." } as ServiceError;
      }
      const state = readState();
      const objectKey = `chat/${randomId("media")}`;
      const record: LocalChatMediaRecord = {
        objectKey,
        mimeType: payload.mimeType || "application/octet-stream",
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        chatMediaByObjectKey: {
          ...state.chatMediaByObjectKey,
          [objectKey]: record
        }
      });
      return {
        objectKey,
        uploadUrl: `${LOCAL_UPLOAD_PREFIX}chat/${objectKey}`,
        mimeType: record.mimeType,
        expiresInSeconds: 60 * 10
      };
    },
    async getChatMediaUrl(_sessionToken: string, objectKey: string): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }> {
      const state = readState();
      const record = state.chatMediaByObjectKey[objectKey];
      if (!record || !record.dataUrl) {
        throw { code: "MEDIA_NOT_FOUND", message: "Chat media not found." } as ServiceError;
      }
      return { objectKey, downloadUrl: record.dataUrl, expiresInSeconds: 60 * 10 };
    },
    async block(sessionToken: string, targetKey: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      const blocked = new Set(state.blockedByActorKey[actor] ?? []);
      blocked.add(normalizeChatPeerKey(targetKey));
      writeState({
        ...state,
        blockedByActorKey: {
          ...state.blockedByActorKey,
          [actor]: [...blocked]
        }
      });
      return { blocked: [...blocked] };
    },
    async unblock(sessionToken: string, targetKey: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      const blocked = new Set(state.blockedByActorKey[actor] ?? []);
      blocked.delete(normalizeChatPeerKey(targetKey));
      writeState({
        ...state,
        blockedByActorKey: {
          ...state.blockedByActorKey,
          [actor]: [...blocked]
        }
      });
      return { blocked: [...blocked] };
    },
    async listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      return { blocked: clone(state.blockedByActorKey[actor] ?? []) };
    },
    async reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      writeState({
        ...state,
        reports: [...state.reports, { type: "user", actorKey: actor, targetKey: normalizeChatPeerKey(targetKey), reason, createdAtMs: nowMs() }]
      });
      return { ok: true };
    },
    async reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      writeState({
        ...state,
        reports: [...state.reports, { type: "message", actorKey: actor, messageId, targetKey: targetKey ? normalizeChatPeerKey(targetKey) : undefined, reason, createdAtMs: nowMs() }]
      });
      return { ok: true };
    },
    async getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const profile = state.profilesByUserId[userId] ?? defaultProfile(userId);
      if (!state.profilesByUserId[userId]) {
        writeState({
          ...state,
          profilesByUserId: {
            ...state.profilesByUserId,
            [userId]: profile
          }
        });
      }
      return { profile: clone(profile) };
    },
    async getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }> {
      const state = readState();
      return { profiles: clone(Object.values(state.profilesByUserId).map(toPublicProfile)) };
    },
    async getPublicProfile(userId: string): Promise<{ profile: PublicProfile }> {
      const state = readState();
      const profile = state.profilesByUserId[userId];
      if (!profile) throw { code: "PROFILE_NOT_FOUND", message: "Profile not found." } as ServiceError;
      return { profile: clone(toPublicProfile(profile)) };
    },
    async getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }> {
      const state = readState();
      return { downloadUrl: resolveMediaDataUrl(state, mediaId) };
    },
    async upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const previous = state.profilesByUserId[userId] ?? defaultProfile(userId);
      const next: UserProfile = {
        ...previous,
        displayName: payload.displayName.trim() || previous.displayName,
        age: payload.age,
        bio: payload.bio,
        stats: payload.stats ?? {},
        discreetMode: payload.discreetMode,
        travelMode: payload.travelMode,
        updatedAtMs: nowMs()
      };
      writeState({
        ...state,
        profilesByUserId: {
          ...state.profilesByUserId,
          [userId]: next
        }
      });
      return { profile: clone(next) };
    },
    async updateProfileMediaReferences(
      sessionToken: string,
      payload: Readonly<{
        galleryMediaIds?: ReadonlyArray<string>;
        mainPhotoMediaId?: string;
      }>
    ): Promise<{ profile: UserProfile }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const existing = state.profilesByUserId[userId] ?? defaultProfile(userId);
      const next: UserProfile = {
        ...existing,
        galleryMediaIds: payload.galleryMediaIds ? [...payload.galleryMediaIds] : existing.galleryMediaIds,
        mainPhotoMediaId: payload.mainPhotoMediaId !== undefined ? payload.mainPhotoMediaId : existing.mainPhotoMediaId,
        updatedAtMs: nowMs()
      };
      writeState({
        ...state,
        profilesByUserId: {
          ...state.profilesByUserId,
          [userId]: next
        }
      });
      return { profile: clone(next) };
    },
    async initiateMediaUpload(
      sessionToken: string,
      payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
    ): Promise<InitiateMediaUploadResponse> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const mediaId = randomId("media");
      const objectKey = `profile/${userId}/${mediaId}`;
      const rec: LocalMediaRecord = {
        mediaId,
        objectKey,
        ownerUserId: userId,
        kind: payload.kind,
        mimeType: payload.mimeType || "application/octet-stream",
        uploaded: false,
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        mediaById: {
          ...state.mediaById,
          [mediaId]: rec
        },
        mediaIdByObjectKey: {
          ...state.mediaIdByObjectKey,
          [objectKey]: mediaId
        }
      });
      return { mediaId, objectKey, uploadUrl: `${LOCAL_UPLOAD_PREFIX}profile/${objectKey}`, expiresInSeconds: 60 * 10 };
    },
    async completeMediaUpload(_sessionToken: string, mediaId: string): Promise<{ media: unknown }> {
      const state = readState();
      const media = state.mediaById[mediaId];
      if (!media || !media.uploaded || !media.dataUrl) {
        throw { code: "MEDIA_UPLOAD_INCOMPLETE", message: "Upload incomplete." } as ServiceError;
      }
      return { media: clone(media) };
    },
    async getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      return { favorites: clone(state.favoritesByUserId[session.userId as string] ?? []) };
    },
    async toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const owner = session.userId as string;
      const current = new Set(state.favoritesByUserId[owner] ?? []);
      let isFavorite = false;
      if (current.has(targetUserId)) {
        current.delete(targetUserId);
      } else {
        current.add(targetUserId);
        isFavorite = true;
      }
      const favorites = [...current];
      writeState({
        ...state,
        favoritesByUserId: {
          ...state.favoritesByUserId,
          [owner]: favorites
        }
      });
      return { targetUserId, isFavorite, favorites };
    },
    async listPublicPostings(type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const state = readState();
      const postings = type ? state.publicPostings.filter((p) => p.type === type) : state.publicPostings;
      return { postings: clone(postings) };
    },
    async createPublicPosting(
      sessionToken: string,
      payload: Readonly<{ type: "ad" | "event"; title: string; body: string }>
    ): Promise<{ posting: PublicPosting }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const posting: PublicPosting = {
        postingId: randomId("posting"),
        type: payload.type,
        title: payload.title.trim(),
        body: payload.body.trim(),
        authorUserId: session.userId as string,
        createdAtMs: nowMs(),
        invitedUserIds: [],
        acceptedUserIds: []
      };
      writeState({
        ...state,
        publicPostings: [...state.publicPostings, posting]
      });
      return { posting: clone(posting) };
    },
    async inviteToEvent(
      sessionToken: string,
      payload: Readonly<{ postingId: string; targetUserId: string }>
    ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const idx = state.publicPostings.findIndex((p) => p.postingId === payload.postingId && p.type === "event");
      if (idx < 0) throw { code: "EVENT_NOT_FOUND", message: "Event not found." } as ServiceError;
      const posting = state.publicPostings[idx];
      const invited = new Set(posting.invitedUserIds ?? []);
      invited.add(payload.targetUserId);
      const updated: PublicPosting = { ...posting, invitedUserIds: [...invited] };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { invite: { postingId: payload.postingId, invitedUserId: payload.targetUserId, invitedByUserId: session.userId as string, createdAtMs: nowMs() } };
    },
    async respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const idx = state.publicPostings.findIndex((p) => p.postingId === payload.postingId && p.type === "event");
      if (idx < 0) throw { code: "EVENT_NOT_FOUND", message: "Event not found." } as ServiceError;
      const posting = state.publicPostings[idx];
      const accepted = new Set(posting.acceptedUserIds ?? []);
      if (payload.accept) accepted.add(userId);
      else accepted.delete(userId);
      const updated: PublicPosting = { ...posting, acceptedUserIds: [...accepted] };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { posting: clone(updated) };
    },
    async listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const postings = state.publicPostings.filter((p) => p.type === "event" && (p.invitedUserIds ?? []).includes(userId));
      return { postings: clone(postings) };
    },
    async listCruisingSpots(): Promise<{ spots: ReadonlyArray<CruisingSpot> }> {
      const state = readState();
      return { spots: clone(state.cruisingSpots) };
    },
    async createCruisingSpot(sessionToken: string, payload: Readonly<{ name: string; address: string; description: string }>): Promise<{ spot: CruisingSpot }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actorKey = actorKeyForSession(session);
      const existingPresence = state.presenceByKey[actorKey];
      const spot: CruisingSpot = {
        spotId: randomId("spot"),
        name: payload.name.trim(),
        address: payload.address.trim(),
        lat: existingPresence?.lat ?? 0,
        lng: existingPresence?.lng ?? 0,
        description: payload.description.trim(),
        creatorUserId: session.userId ?? actorKey,
        createdAtMs: nowMs(),
        checkInCount: 0,
        actionCount: 0
      };
      writeState({
        ...state,
        cruisingSpots: [...state.cruisingSpots, spot]
      });
      return { spot: clone(spot) };
    },
    async checkInCruisingSpot(sessionToken: string, spotId: string): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actorKey = actorKeyForSession(session);
      const ts = nowMs();
      const checkIn = { spotId, actorKey, checkedInAtMs: ts };
      const checkIns = [...state.spotCheckIns, checkIn];
      const spots = state.cruisingSpots.map((spot) => (spot.spotId === spotId ? { ...spot, checkInCount: (spot.checkInCount ?? 0) + 1 } : spot));
      writeState({
        ...state,
        spotCheckIns: checkIns,
        cruisingSpots: spots
      });
      return { checkIn };
    },
    async markCruisingSpotAction(sessionToken: string, spotId: string): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actorKey = actorKeyForSession(session);
      const action = { spotId, actorKey, markedAtMs: nowMs() };
      const spots = state.cruisingSpots.map((spot) => (spot.spotId === spotId ? { ...spot, actionCount: (spot.actionCount ?? 0) + 1 } : spot));
      writeState({
        ...state,
        spotActions: [...state.spotActions, action],
        cruisingSpots: spots
      });
      return { action };
    },
    async listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }> {
      const state = readState();
      return { checkIns: clone(state.spotCheckIns.filter((x) => x.spotId === spotId)) };
    },
    async listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }> {
      const state = readState();
      return { submissions: clone(state.submissions) };
    },
    async createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const submission: Submission = {
        submissionId: randomId("submission"),
        authorUserId: session.userId ?? actorKeyForSession(session),
        title: payload.title.trim(),
        body: payload.body.trim(),
        viewCount: 0,
        ratingCount: 0,
        ratingSum: 0,
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        submissions: [...state.submissions, submission]
      });
      return { submission: clone(submission) };
    },
    async recordSubmissionView(submissionId: string): Promise<{ submission: Submission }> {
      const state = readState();
      const idx = state.submissions.findIndex((s) => s.submissionId === submissionId);
      if (idx < 0) throw { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } as ServiceError;
      const current = state.submissions[idx];
      const updated: Submission = { ...current, viewCount: current.viewCount + 1 };
      const next = [...state.submissions];
      next[idx] = updated;
      writeState({ ...state, submissions: next });
      return { submission: clone(updated) };
    },
    async rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }> {
      const state = readState();
      const idx = state.submissions.findIndex((s) => s.submissionId === submissionId);
      if (idx < 0) throw { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } as ServiceError;
      const bounded = Math.max(1, Math.min(5, Math.round(stars)));
      const current = state.submissions[idx];
      const updated: Submission = {
        ...current,
        ratingCount: current.ratingCount + 1,
        ratingSum: current.ratingSum + bounded
      };
      const next = [...state.submissions];
      next[idx] = updated;
      writeState({ ...state, submissions: next });
      return { submission: clone(updated) };
    },
    async listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }> {
      const state = readState();
      return { listings: clone(state.promotedProfiles), feeCents };
    },
    async startPromotedPayment(
      sessionToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const token = randomId("payment");
      const payment = {
        paymentToken: token,
        ownerUserId: session.userId as string,
        amountCents: feeCents,
        status: "started" as const,
        expiresAtMs: nowMs() + 1000 * 60 * 20
      };
      writeState({
        ...state,
        promotedPaymentsByToken: {
          ...state.promotedPaymentsByToken,
          [token]: payment
        }
      });
      return { payment: { paymentToken: token, amountCents: payment.amountCents, status: payment.status, expiresAtMs: payment.expiresAtMs } };
    },
    async confirmPromotedPayment(
      sessionToken: string,
      paymentToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const payment = state.promotedPaymentsByToken[paymentToken];
      if (!payment || payment.ownerUserId !== session.userId) {
        throw { code: "PAYMENT_NOT_FOUND", message: "Payment not found." } as ServiceError;
      }
      const updated = { ...payment, status: "confirmed" as const };
      writeState({
        ...state,
        promotedPaymentsByToken: {
          ...state.promotedPaymentsByToken,
          [paymentToken]: updated
        }
      });
      return { payment: { paymentToken, amountCents: updated.amountCents, status: updated.status, expiresAtMs: updated.expiresAtMs } };
    },
    async createPromotedProfile(
      sessionToken: string,
      payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
    ): Promise<{ listing: PromotedProfileListing }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const payment = state.promotedPaymentsByToken[payload.paymentToken];
      if (!payment || payment.ownerUserId !== session.userId || payment.status !== "confirmed") {
        throw { code: "PAYMENT_REQUIRED", message: "Confirm payment before creating a promoted profile." } as ServiceError;
      }
      const listing: PromotedProfileListing = {
        listingId: randomId("listing"),
        userId: session.userId as string,
        title: payload.title.trim(),
        body: payload.body.trim(),
        displayName: payload.displayName.trim(),
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        promotedProfiles: [...state.promotedProfiles, listing]
      });
      return { listing: clone(listing) };
    },
    async seedFakeUsers(
      count: number,
      centerLat?: number,
      centerLng?: number
    ): Promise<{ seededCount: number; seeded: ReadonlyArray<{ key: string; displayName: string; age: number }> }> {
      const state = readState();
      const c = Math.max(0, Math.min(100, Math.floor(count)));
      const seeded: Array<{ key: string; displayName: string; age: number }> = [];
      const nextUsersById = { ...state.usersById };
      const nextUserIdByEmail = { ...state.userIdByEmail };
      const nextProfilesByUserId = { ...state.profilesByUserId };
      const nextPresenceByKey = { ...state.presenceByKey };
      const baseLat = Number.isFinite(centerLat as number) ? (centerLat as number) : 40.7484;
      const baseLng = Number.isFinite(centerLng as number) ? (centerLng as number) : -73.9857;
      for (let i = 0; i < c; i += 1) {
        const id = randomId("seed");
        const name = `Explorer ${String(i + 1).padStart(2, "0")}`;
        const age = 22 + (i % 18);
        const email = `${id}@local.seed`;
        nextUsersById[id] = {
          id,
          email,
          password: "seed",
          phoneE164: "+10000000000",
          verified: true,
          userType: "registered",
          tier: "free"
        };
        nextUserIdByEmail[email] = id;
        nextProfilesByUserId[id] = {
          userId: id,
          displayName: name,
          age,
          bio: "Looking around.",
          stats: {},
          galleryMediaIds: [],
          updatedAtMs: nowMs()
        };
        const lat = baseLat + (Math.random() - 0.5) * 0.02;
        const lng = baseLng + (Math.random() - 0.5) * 0.02;
        nextPresenceByKey[`user:${id}`] = {
          key: `user:${id}`,
          userType: "registered",
          lat,
          lng,
          status: "online",
          updatedAtMs: nowMs()
        };
        seeded.push({ key: `user:${id}`, displayName: name, age });
      }
      writeState({
        ...state,
        usersById: nextUsersById,
        userIdByEmail: nextUserIdByEmail,
        profilesByUserId: nextProfilesByUserId,
        presenceByKey: nextPresenceByKey
      });
      return { seededCount: seeded.length, seeded };
    }
  };
}

export function apiClient(basePath = "/api"): Readonly<{
  createGuest(): Promise<GuestResponse>;
  register(email: string, password: string, phoneE164: string): Promise<RegisterResponse>;
  verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse>;
  resendVerification(email: string): Promise<RegisterResponse>;
  login(email: string, password: string): Promise<VerifyEmailOrLoginResponse>;
  verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }>;
  getSession(sessionToken: string): Promise<{ session: Session }>;
  getMode(sessionToken: string): Promise<{ mode: Session["mode"] }>;
  setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }>;
  setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }>;
  updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any>;
  listActivePresence(sessionToken: string): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }>;
  getDatingFeed(sessionToken: string): Promise<FeedResponse>;
  swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse>;
  sendChat(
    sessionToken: string,
    chatKind: "cruise" | "date",
    toKey: string,
    text: string,
    media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
  ): Promise<any>;
  sendCallSignal(
    sessionToken: string,
    payload: Readonly<{
      toKey: string;
      callId: string;
      signalType: "offer" | "answer" | "ice" | "hangup";
      sdp?: string;
      candidate?: string;
    }>
  ): Promise<{ ok: true }>;
  listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any>;
  markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }>;
  initiateChatMediaUpload(
    sessionToken: string,
    payload: Readonly<{ mimeType: string; sizeBytes: number }>
  ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }>;
  getChatMediaUrl(sessionToken: string, objectKey: string): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }>;
  block(sessionToken: string, targetKey: string): Promise<any>;
  unblock(sessionToken: string, targetKey: string): Promise<any>;
  listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }>;
  reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any>;
  reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any>;
  getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }>;
  getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }>;
  getPublicProfile(userId: string): Promise<{ profile: PublicProfile }>;
  getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }>;
  upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }>;
  updateProfileMediaReferences(
    sessionToken: string,
    payload: Readonly<{
      galleryMediaIds?: ReadonlyArray<string>;
      mainPhotoMediaId?: string;
    }>
  ): Promise<{ profile: UserProfile }>;
  initiateMediaUpload(
    sessionToken: string,
    payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
  ): Promise<InitiateMediaUploadResponse>;
  completeMediaUpload(sessionToken: string, mediaId: string): Promise<{ media: unknown }>;
  getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }>;
  toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse>;
  listPublicPostings(type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  createPublicPosting(sessionToken: string, payload: Readonly<{ type: "ad" | "event"; title: string; body: string }>): Promise<{ posting: PublicPosting }>;
  inviteToEvent(
    sessionToken: string,
    payload: Readonly<{ postingId: string; targetUserId: string }>
  ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }>;
  respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }>;
  listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  listCruisingSpots(): Promise<{ spots: ReadonlyArray<CruisingSpot> }>;
  createCruisingSpot(sessionToken: string, payload: Readonly<{ name: string; address: string; description: string }>): Promise<{ spot: CruisingSpot }>;
  checkInCruisingSpot(sessionToken: string, spotId: string): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }>;
  markCruisingSpotAction(sessionToken: string, spotId: string): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }>;
  listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }>;
  listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }>;
  createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }>;
  recordSubmissionView(submissionId: string): Promise<{ submission: Submission }>;
  rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }>;
  listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }>;
  startPromotedPayment(sessionToken: string): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  confirmPromotedPayment(
    sessionToken: string,
    paymentToken: string
  ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  createPromotedProfile(
    sessionToken: string,
    payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
  ): Promise<{ listing: PromotedProfileListing }>;
  seedFakeUsers(count: number, centerLat?: number, centerLng?: number): Promise<{ seededCount: number; seeded: ReadonlyArray<{ key: string; displayName: string; age: number }> }>;
}> {
  if (isLocalApiMode(basePath)) {
    return createLocalApiClient();
  }

  function headers(sessionToken?: string): HeadersInit {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (sessionToken) h["x-session-token"] = sessionToken;
    return h;
  }

  return {
    async createGuest(): Promise<GuestResponse> {
      const res = await fetch(`${basePath}/auth/guest`, { method: "POST" });
      return (await readJsonOrThrow(res)) as GuestResponse;
    },
    async register(email: string, password: string, phoneE164: string): Promise<RegisterResponse> {
      const res = await fetch(`${basePath}/auth/register`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password, phoneE164 })
      });
      return (await readJsonOrThrow(res)) as RegisterResponse;
    },
    async verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse> {
      const res = await fetch(`${basePath}/auth/verify-email`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, code })
      });
      return (await readJsonOrThrow(res)) as VerifyEmailOrLoginResponse;
    },
    async resendVerification(email: string): Promise<RegisterResponse> {
      const res = await fetch(`${basePath}/auth/resend-verification`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email })
      });
      return (await readJsonOrThrow(res)) as RegisterResponse;
    },
    async login(email: string, password: string): Promise<VerifyEmailOrLoginResponse> {
      const res = await fetch(`${basePath}/auth/login`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password })
      });
      return (await readJsonOrThrow(res)) as VerifyEmailOrLoginResponse;
    },
    async verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/auth/verify-age`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ sessionToken, ageYears })
      });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async getSession(sessionToken: string): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/session`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async getMode(sessionToken: string): Promise<{ mode: Session["mode"] }> {
      const res = await fetch(`${basePath}/mode`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { mode: Session["mode"] };
    },
    async setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/mode/hybrid-opt-in`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ optIn })
      });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/mode`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ mode })
      });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any> {
      const res = await fetch(`${basePath}/presence`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ lat, lng, status })
      });
      return readJsonOrThrow(res);
    },
    async listActivePresence(
      sessionToken: string
    ): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }> {
      const res = await fetch(`${basePath}/presence/active`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as {
        presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }>;
      };
    },
    async getDatingFeed(sessionToken: string): Promise<FeedResponse> {
      const res = await fetch(`${basePath}/dating/feed`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as FeedResponse;
    },
    async swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse> {
      const res = await fetch(`${basePath}/matching/swipe`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ toUserId, direction })
      });
      return (await readJsonOrThrow(res)) as SwipeResponse;
    },
    async sendChat(
      sessionToken: string,
      chatKind: "cruise" | "date",
      toKey: string,
      text: string,
      media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
    ): Promise<any> {
      const res = await fetch(`${basePath}/chat/send`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ chatKind, toKey, text, media })
      });
      return readJsonOrThrow(res);
    },
    async sendCallSignal(
      sessionToken: string,
      payload: Readonly<{
        toKey: string;
        callId: string;
        signalType: "offer" | "answer" | "ice" | "hangup";
        sdp?: string;
        candidate?: string;
      }>
    ): Promise<{ ok: true }> {
      const res = await fetch(`${basePath}/call/signal`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { ok: true };
    },
    async listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any> {
      const url = new URL(`${basePath}/chat/messages`, window.location.origin);
      url.searchParams.set("chatKind", chatKind);
      url.searchParams.set("otherKey", otherKey);
      const res = await fetch(url.toString(), { method: "GET", headers: headers(sessionToken) });
      return readJsonOrThrow(res);
    },
    async markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }> {
      const res = await fetch(`${basePath}/chat/read`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ chatKind, otherKey })
      });
      return (await readJsonOrThrow(res)) as { readAtMs: number };
    },
    async initiateChatMediaUpload(
      sessionToken: string,
      payload: Readonly<{ mimeType: string; sizeBytes: number }>
    ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }> {
      const res = await fetch(`${basePath}/chat/media/initiate`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number };
    },
    async getChatMediaUrl(
      sessionToken: string,
      objectKey: string
    ): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }> {
      const url = new URL(`${basePath}/chat/media/url`, window.location.origin);
      url.searchParams.set("objectKey", objectKey);
      const res = await fetch(url.toString(), { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { objectKey: string; downloadUrl: string; expiresInSeconds: number };
    },
    async block(sessionToken: string, targetKey: string): Promise<any> {
      const res = await fetch(`${basePath}/block`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetKey })
      });
      return readJsonOrThrow(res);
    },
    async unblock(sessionToken: string, targetKey: string): Promise<any> {
      const res = await fetch(`${basePath}/unblock`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetKey })
      });
      return readJsonOrThrow(res);
    },
    async listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }> {
      const res = await fetch(`${basePath}/blocked`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { blocked: ReadonlyArray<string> };
    },
    async reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any> {
      const res = await fetch(`${basePath}/report/user`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetKey, reason })
      });
      return readJsonOrThrow(res);
    },
    async reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any> {
      const res = await fetch(`${basePath}/report/message`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ messageId, reason, targetKey })
      });
      return readJsonOrThrow(res);
    },
    async getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }> {
      const res = await fetch(`${basePath}/profile/me`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { profile: UserProfile };
    },
    async getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }> {
      const res = await fetch(`${basePath}/profile/public`, {
        method: "GET",
        headers: headers()
      });
      return (await readJsonOrThrow(res)) as { profiles: ReadonlyArray<PublicProfile> };
    },
    async getPublicProfile(userId: string): Promise<{ profile: PublicProfile }> {
      const res = await fetch(`${basePath}/profile/public/${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: headers()
      });
      return (await readJsonOrThrow(res)) as { profile: PublicProfile };
    },
    async getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }> {
      const res = await fetch(`${basePath}/media/public/${encodeURIComponent(mediaId)}/url`, {
        method: "GET",
        headers: headers()
      });
      return (await readJsonOrThrow(res)) as { downloadUrl: string };
    },
    async upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }> {
      const res = await fetch(`${basePath}/profile/me`, {
        method: "PUT",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { profile: UserProfile };
    },
    async updateProfileMediaReferences(
      sessionToken: string,
      payload: Readonly<{
        galleryMediaIds?: ReadonlyArray<string>;
        mainPhotoMediaId?: string;
      }>
    ): Promise<{ profile: UserProfile }> {
      const res = await fetch(`${basePath}/profile/media/references`, {
        method: "PUT",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { profile: UserProfile };
    },
    async initiateMediaUpload(
      sessionToken: string,
      payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
    ): Promise<InitiateMediaUploadResponse> {
      const res = await fetch(`${basePath}/profile/media/initiate`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as InitiateMediaUploadResponse;
    },
    async completeMediaUpload(sessionToken: string, mediaId: string): Promise<{ media: unknown }> {
      const res = await fetch(`${basePath}/profile/media/complete`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ mediaId })
      });
      return (await readJsonOrThrow(res)) as { media: unknown };
    },
    async getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }> {
      const res = await fetch(`${basePath}/favorites`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { favorites: ReadonlyArray<string> };
    },
    async toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse> {
      const res = await fetch(`${basePath}/favorites/toggle`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetUserId })
      });
      return (await readJsonOrThrow(res)) as FavoriteToggleResponse;
    },
    async listPublicPostings(type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const url = new URL(`${basePath}/public-postings`, window.location.origin);
      if (type) url.searchParams.set("type", type);
      const res = await fetch(url.toString(), { method: "GET" });
      return (await readJsonOrThrow(res)) as { postings: ReadonlyArray<PublicPosting> };
    },
    async createPublicPosting(
      sessionToken: string,
      payload: Readonly<{ type: "ad" | "event"; title: string; body: string }>
    ): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/public-postings`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async inviteToEvent(
      sessionToken: string,
      payload: Readonly<{ postingId: string; targetUserId: string }>
    ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }> {
      const res = await fetch(`${basePath}/public-postings/event/invite`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as {
        invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number };
      };
    },
    async respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/public-postings/event/respond`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const res = await fetch(`${basePath}/public-postings/event/invites`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { postings: ReadonlyArray<PublicPosting> };
    },
    async listCruisingSpots(): Promise<{ spots: ReadonlyArray<CruisingSpot> }> {
      const res = await fetch(`${basePath}/cruise-spots`, { method: "GET" });
      return (await readJsonOrThrow(res)) as { spots: ReadonlyArray<CruisingSpot> };
    },
    async createCruisingSpot(sessionToken: string, payload: Readonly<{ name: string; address: string; description: string }>): Promise<{ spot: CruisingSpot }> {
      const res = await fetch(`${basePath}/cruise-spots`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { spot: CruisingSpot };
    },
    async checkInCruisingSpot(
      sessionToken: string,
      spotId: string
    ): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }> {
      const res = await fetch(`${basePath}/cruise-spots/${encodeURIComponent(spotId)}/check-in`, {
        method: "POST",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } };
    },
    async markCruisingSpotAction(
      sessionToken: string,
      spotId: string
    ): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }> {
      const res = await fetch(`${basePath}/cruise-spots/${encodeURIComponent(spotId)}/action`, {
        method: "POST",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { action: { spotId: string; actorKey: string; markedAtMs: number } };
    },
    async listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }> {
      const res = await fetch(`${basePath}/cruise-spots/${encodeURIComponent(spotId)}/check-ins`, {
        method: "GET"
      });
      return (await readJsonOrThrow(res)) as { checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> };
    },
    async listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }> {
      const res = await fetch(`${basePath}/submissions`, { method: "GET" });
      return (await readJsonOrThrow(res)) as { submissions: ReadonlyArray<Submission> };
    },
    async createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/submissions`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async recordSubmissionView(submissionId: string): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/submissions/view`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ submissionId })
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/submissions/rate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ submissionId, stars })
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }> {
      const res = await fetch(`${basePath}/promoted-profiles`, { method: "GET" });
      return (await readJsonOrThrow(res)) as { listings: ReadonlyArray<PromotedProfileListing>; feeCents: number };
    },
    async startPromotedPayment(
      sessionToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const res = await fetch(`${basePath}/promoted-profiles/payment/start`, {
        method: "POST",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } };
    },
    async confirmPromotedPayment(
      sessionToken: string,
      paymentToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const res = await fetch(`${basePath}/promoted-profiles/payment/confirm`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ paymentToken })
      });
      return (await readJsonOrThrow(res)) as { payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } };
    },
    async createPromotedProfile(
      sessionToken: string,
      payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
    ): Promise<{ listing: PromotedProfileListing }> {
      const res = await fetch(`${basePath}/promoted-profiles`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { listing: PromotedProfileListing };
    },
    async seedFakeUsers(
      count: number,
      centerLat?: number,
      centerLng?: number
    ): Promise<{ seededCount: number; seeded: ReadonlyArray<{ key: string; displayName: string; age: number }> }> {
      const body: Record<string, unknown> = { count };
      if (typeof centerLat === "number" && Number.isFinite(centerLat)) body.centerLat = centerLat;
      if (typeof centerLng === "number" && Number.isFinite(centerLng)) body.centerLng = centerLng;
      const res = await fetch(`${basePath}/dev/seed-fake-users`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body)
      });
      return (await readJsonOrThrow(res)) as {
        seededCount: number;
        seeded: ReadonlyArray<{ key: string; displayName: string; age: number }>;
      };
    }
  };
}
