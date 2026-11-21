import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type { GoogleIdentity } from "./authService";

const challengeLifetimeMs = 15 * 60 * 1000;

export function createGoogleSignIn(clientId: string) {
  const google = new OAuth2Client({ transporterOptions: { timeout: 5000 } });
  const challenges = new Map<string, number>();

  return {
    challenge() {
      const now = Date.now();
      for (const [nonce, expiresAt] of challenges) {
        if (expiresAt <= now) challenges.delete(nonce);
      }
      const nonce = randomUUID();
      challenges.set(nonce, now + challengeLifetimeMs);
      return { clientId, nonce };
    },
    async verify(credential: unknown, nonce: unknown): Promise<GoogleIdentity | null> {
      if (typeof credential !== "string" || typeof nonce !== "string" ||
        (challenges.get(nonce) ?? 0) <= Date.now()) return null;

      const ticket = await google.verifyIdToken({ idToken: credential, audience: clientId });
      const claims = ticket.getPayload();
      if (!claims || !("nonce" in claims) || claims.nonce !== nonce ||
        claims.email_verified !== true || typeof claims.email !== "string" ||
        typeof claims.sub !== "string" || !claims.sub ||
        (challenges.get(nonce) ?? 0) <= Date.now()) return null;

      // Google can verify current ownership for Gmail and managed Workspace addresses.
      const email = claims.email.toLowerCase();
      const domain = email.split("@")[1];
      if (!domain || (domain !== "gmail.com" && claims.hd?.toLowerCase() !== domain)) return null;
      challenges.delete(nonce);
      return { email, subject: claims.sub };
    }
  };
}
