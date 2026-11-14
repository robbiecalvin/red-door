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
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Billing is not configured yet.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2024-06-20", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body, signal: AbortSignal.timeout(15000)
  });
  const result = await response.json() as any;
  if (!response.ok) throw new Error("The billing provider could not complete this request. Please try again.");
  return result;
}
export function assertPlusPrice(price: any): void {
  if (!price?.active || price.currency !== PLUS_CURRENCY || price.unit_amount !== PLUS_PRICE_CENTS || price.recurring?.interval !== "month" || price.recurring?.interval_count !== 1) {
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
