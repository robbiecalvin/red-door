export class ResendDeliveryError extends Error {
  constructor(readonly status: number) {
    super(`Resend rejected email (HTTP ${status}).`);
  }
}

type Message = { from?: string; to: string; subject: string; text: string; html?: string; headers?: Record<string, string> };

export function createResendEmail(apiKey: string, sender: string, request = fetch) {
  if (!apiKey || !sender) return null;
  return {
    async sendMail(message: Message) {
      const { from, to, ...content } = message;
      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...content, from: from?.trim() || sender, to: [to] }),
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new ResendDeliveryError(response.status);
      const result = await response.json() as { id?: string };
      if (typeof result.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(result.id)) throw new Error("Resend did not return a delivery identifier.");
      return { accepted: [to], messageId: result.id };
    }
  };
}
