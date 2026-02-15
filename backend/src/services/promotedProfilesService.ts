export type ErrorCode =
  | "INVALID_SESSION"
  | "ANONYMOUS_FORBIDDEN"
  | "AGE_GATE_REQUIRED"
  | "INVALID_INPUT"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_EXPIRED";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultErr = Readonly<{ ok: false; error: ServiceError }>;
export type Result<T> = ResultOk<T> | ResultErr;

export type SessionLike = Readonly<{
  sessionToken: string;
  userType: "guest" | "registered" | "subscriber";
  userId?: string;
  ageVerified: boolean;
}>;

export type PromotedProfile = Readonly<{
  listingId: string;
  userId: string;
  title: string;
  body: string;
  displayName: string;
  createdAtMs: number;
}>;

export type PaymentSession = Readonly<{
  paymentToken: string;
  userId: string;
  amountCents: number;
  createdAtMs: number;
  expiresAtMs: number;
  status: "pending" | "paid" | "consumed";
}>;

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function requirePoster(session: SessionLike): Result<{ userId: string }> {
  if (
    typeof session !== "object" ||
    session === null ||
    typeof session.sessionToken !== "string" ||
    session.sessionToken.trim() === ""
  ) {
    return err("INVALID_SESSION", "Invalid session.");
  }
  if (session.userType === "guest") {
    return err("ANONYMOUS_FORBIDDEN", "Anonymous users cannot create promoted profiles.");
  }
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  const userId = asText(session.userId);
  if (!userId) return err("INVALID_SESSION", "Invalid session.");
  return ok({ userId });
}

export function createPromotedProfilesService(
  deps?: Readonly<{ nowMs?: () => number; idFactory?: () => string; feeCents?: number; paymentExpiryMs?: number }>
): Readonly<{
  startPayment(session: SessionLike): Result<PaymentSession>;
  confirmPayment(session: SessionLike, paymentToken: unknown): Result<PaymentSession>;
  createListing(
    session: SessionLike,
    input: Readonly<{ paymentToken: unknown; title: unknown; body: unknown; displayName: unknown }>
  ): Result<PromotedProfile>;
  listListings(): Result<ReadonlyArray<PromotedProfile>>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const feeCents = deps?.feeCents ?? 2000;
  const paymentExpiryMs = deps?.paymentExpiryMs ?? 15 * 60 * 1000;

  const payments = new Map<string, PaymentSession>();
  const listings: PromotedProfile[] = [];

  function loadPaymentForUser(userId: string, paymentToken: string): Result<PaymentSession> {
    const p = payments.get(paymentToken);
    if (!p) return err("PAYMENT_NOT_FOUND", "Payment session not found.");
    if (p.userId !== userId) return err("PAYMENT_NOT_FOUND", "Payment session not found.");
    if (nowMs() > p.expiresAtMs) return err("PAYMENT_EXPIRED", "Payment session expired.");
    return ok(p);
  }

  return {
    startPayment(session: SessionLike): Result<PaymentSession> {
      const auth = requirePoster(session);
      if (!auth.ok) return auth as Result<PaymentSession>;
      const paymentToken = `pay_${idFactory()}`;
      const createdAtMs = nowMs();
      const payment: PaymentSession = {
        paymentToken,
        userId: auth.value.userId,
        amountCents: feeCents,
        createdAtMs,
        expiresAtMs: createdAtMs + paymentExpiryMs,
        status: "pending"
      };
      payments.set(paymentToken, payment);
      return ok(payment);
    },

    confirmPayment(session: SessionLike, paymentToken: unknown): Result<PaymentSession> {
      const auth = requirePoster(session);
      if (!auth.ok) return auth as Result<PaymentSession>;
      const token = asText(paymentToken);
      if (!token) return err("INVALID_INPUT", "Payment token is required.");
      const loaded = loadPaymentForUser(auth.value.userId, token);
      if (!loaded.ok) return loaded as Result<PaymentSession>;
      const paid: PaymentSession = { ...loaded.value, status: "paid" };
      payments.set(token, paid);
      return ok(paid);
    },

    createListing(
      session: SessionLike,
      input: Readonly<{ paymentToken: unknown; title: unknown; body: unknown; displayName: unknown }>
    ): Result<PromotedProfile> {
      const auth = requirePoster(session);
      if (!auth.ok) return auth as Result<PromotedProfile>;
      const title = asText(input.title);
      const body = asText(input.body);
      const displayName = asText(input.displayName);
      const paymentToken = asText(input.paymentToken);
      if (!title || !body || !displayName || !paymentToken) {
        return err("INVALID_INPUT", "Payment token, title, body, and display name are required.");
      }
      if (title.length > 120) return err("INVALID_INPUT", "Title is too long.", { max: 120 });
      if (body.length > 2000) return err("INVALID_INPUT", "Body is too long.", { max: 2000 });
      const loaded = loadPaymentForUser(auth.value.userId, paymentToken);
      if (!loaded.ok) return loaded as Result<PromotedProfile>;
      if (loaded.value.status !== "paid") {
        return err("PAYMENT_REQUIRED", "A paid $20 posting fee is required before publishing.", { feeCents });
      }
      const consumed: PaymentSession = { ...loaded.value, status: "consumed" };
      payments.set(paymentToken, consumed);
      const listing: PromotedProfile = {
        listingId: `promo_${idFactory()}`,
        userId: auth.value.userId,
        title,
        body,
        displayName,
        createdAtMs: nowMs()
      };
      listings.push(listing);
      return ok(listing);
    },

    listListings(): Result<ReadonlyArray<PromotedProfile>> {
      return ok([...listings].sort((a, b) => b.createdAtMs - a.createdAtMs));
    }
  };
}
