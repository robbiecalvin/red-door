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
