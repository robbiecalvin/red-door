import crypto from "node:crypto";
import { PLUS_PRICE_CENTS, PLUS_CURRENCY } from "../../../shared/plus";

export function verifyStripeEvent(raw: Buffer, signature: string, secret: string, now = Date.now()): any {
  const parts = signature.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.slice(2) ?? "";
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error("Invalid webhook timestamp.");
  const expected = crypto.createHmac("sha256", secret).update(timestamp + ".").update(raw).digest();
  const valid = parts.filter(p => p.startsWith("v1=")).some(p => {
    const value = p.slice(3);
    if (!/^[a-f0-9]{64}$/i.test(value)) return false;
    return crypto.timingSafeEqual(expected, Buffer.from(value, "hex"));
  });
  if (!valid) throw new Error("Invalid webhook signature.");
  return JSON.parse(raw.toString("utf8"));
}

export async function stripeRequest(path: string, body?: URLSearchParams, idempotencyKey?: string): Promise<any> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Billing is not configured yet.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2024-06-20", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body, signal: AbortSignal.timeout(15000)
  });
  const result = await response.json() as any;
  if (!response.ok) {
    // Return fixed messages, never Stripe's raw response (which can contain customer data).
    const message = response.status === 401 ? "Stripe rejected the backend API key. Check the configured secret key."
      : response.status === 403 ? "Stripe denied this request. Check the API key permissions and account status."
      : response.status === 404 ? "Stripe could not find the configured billing resource. Check that the price and API key belong to the same account and test/live mode."
      : response.status === 429 ? "Stripe is temporarily busy. Please try again shortly."
      : "The billing provider could not complete this request. Please try again.";
    throw new Error(message);
  }
  return result;
}
export function assertPlusPrice(price: any, requireActive = true): void {
  if (!price || (requireActive && !price.active) || price.currency !== PLUS_CURRENCY || price.unit_amount !== PLUS_PRICE_CENTS || price.recurring?.interval !== "month" || price.recurring?.interval_count !== 1) {
    throw new Error("Configure an active CAD $7.99 monthly Stripe price.");
  }
}

export function signAlbumAccess(secret: string, owner: string, viewer: string, mediaId: string, expires: number): string {
  return crypto.createHmac("sha256", secret).update(JSON.stringify([owner, viewer, mediaId, expires])).digest("hex");
}
export function validAlbumAccess(secret: string, owner: string, viewer: string, mediaId: string, expires: number, signature: string, now = Date.now()): boolean {
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + 60_000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signAlbumAccess(secret, owner, viewer, mediaId, expires), "hex"));
}

const BILLING_VARIABLES = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PLUS_PRICE_ID", "PUBLIC_APP_URL"] as const;
export function billingConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const missing = BILLING_VARIABLES.filter(name => !env[name]?.trim());
  let publicUrlValid = false;
  try { publicUrlValid = new URL(env.PUBLIC_APP_URL?.trim() ?? "").protocol === "https:"; } catch { /* Invalid configuration. */ }
  return { configured: missing.length === 0 && publicUrlValid, missing, publicUrlValid };
}

export async function inspectBilling() {
  const configuration = billingConfiguration();
  const result: { configuration: ReturnType<typeof billingConfiguration>; stripeConnection: "unconfigured" | "ok" | "error"; priceValid: boolean; mode?: "live" | "test"; issue?: string } = {
    configuration, stripeConnection: "unconfigured", priceValid: false
  };
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_PLUS_PRICE_ID?.trim()) return result;
  try {
    const price = await stripeRequest(`prices/${encodeURIComponent(process.env.STRIPE_PLUS_PRICE_ID.trim())}`);
    result.stripeConnection = "ok";
    result.mode = price.livemode ? "live" : "test";
    try { assertPlusPrice(price); result.priceValid = true; }
    catch (e) { result.issue = (e as Error).message; }
  } catch (e) { result.stripeConnection = "error"; result.issue = (e as Error).message; }
  return result;
}
