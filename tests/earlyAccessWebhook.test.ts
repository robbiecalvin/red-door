import { createEarlyAccessWebhook } from "../backend/src/services/earlyAccessWebhook";

describe("earlyAccessWebhook", () => {
  it("posts the expected payload to the configured webhook", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => ""
    })) as unknown as typeof fetch;

    const webhook = createEarlyAccessWebhook("https://script.google.com/macros/s/test/exec", {
      fetchImpl,
      timeoutMs: 100
    });

    await webhook.notifySignup({
      name: "Robert Mitchell",
      email: "robert@example.com",
      membershipCode: "RED-1234ABCD",
      createdAtMs: 1_700_000_000_000
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://script.google.com/macros/s/test/exec",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Robert Mitchell",
          email: "robert@example.com",
          membershipCode: "RED-1234ABCD",
          createdAtMs: 1_700_000_000_000,
          source: "red-door"
        })
      })
    );
  });

  it("does nothing when the webhook URL is not configured", async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const webhook = createEarlyAccessWebhook("", { fetchImpl });

    await webhook.notifySignup({
      name: "Robert Mitchell",
      email: "robert@example.com",
      membershipCode: "RED-1234ABCD",
      createdAtMs: 1_700_000_000_000
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
