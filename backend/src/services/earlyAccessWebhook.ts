import type { EarlyAccessSignup } from "./earlyAccessService";

export type EarlyAccessWebhookPayload = Readonly<{
  name: string;
  email: string;
  membershipCode: string;
  createdAtMs: number;
  source: "red-door";
}>;

export type EarlyAccessWebhookDeps = Readonly<{
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

export type EarlyAccessWebhook = Readonly<{
  isEnabled(): boolean;
  notifySignup(signup: EarlyAccessSignup): Promise<void>;
}>;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Google Sheets webhook timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export function createEarlyAccessWebhook(
  webhookUrl: string | undefined,
  deps: EarlyAccessWebhookDeps = {}
): EarlyAccessWebhook {
  const normalizedUrl = typeof webhookUrl === "string" ? webhookUrl.trim() : "";
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 5_000;

  return {
    isEnabled(): boolean {
      return normalizedUrl.length > 0;
    },

    async notifySignup(signup: EarlyAccessSignup): Promise<void> {
      if (!normalizedUrl) return;
      const payload: EarlyAccessWebhookPayload = {
        name: signup.name,
        email: signup.email,
        membershipCode: signup.membershipCode,
        createdAtMs: signup.createdAtMs,
        source: "red-door"
      };
      const response = await withTimeout(
        fetchImpl(normalizedUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        }),
        timeoutMs
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Google Sheets webhook failed with ${response.status}${text ? `: ${text}` : ""}`);
      }
    }
  };
}
