import type { Express, Request, Response } from "express";
import { inspectBilling } from "./subscriptionService";

type Check = { status: "passed" | "needs_configuration" | "failed"; detail: string };
export function installLaunchReadiness(app: Express, deps: {
  admin(req: Request, res: Response): unknown;
  databasePing?: () => Promise<unknown>;
  verifyMail?: () => Promise<unknown>;
  mediaMode: "local" | "postgres" | "s3";
  persistenceHealthy(): boolean;
}) {
  app.get("/admin/launch/health", async (req, res) => {
    if (!deps.admin(req, res)) return;
    res.setHeader("Cache-Control", "no-store");
    const checks: Record<string, Check> = {};
    async function probe(name: string, run: (() => Promise<unknown>) | undefined, missing: string) {
      if (!run) { checks[name] = { status: "needs_configuration", detail: missing }; return; }
      try { await run(); checks[name] = { status: "passed", detail: "Connection verified." }; }
      catch { checks[name] = { status: "failed", detail: "Connection failed. Inspect the provider dashboard; credentials are not included here." }; }
    }
    await Promise.all([
      probe("database", deps.databasePing, "PostgreSQL is not configured; local state requires a persistent disk."),
      probe("smtp", deps.verifyMail, "SMTP is not configured. Password recovery cannot send email."),
    ]);
    const billing = await inspectBilling();
    checks.stripe = { status: billing.configuration.configured && billing.stripeConnection === "ok" && billing.priceValid ? "passed" : billing.stripeConnection === "error" ? "failed" : "needs_configuration", detail: billing.configuration.configured && billing.priceValid ? `CAD $7.99 monthly price verified (${billing.mode} mode).` : "Check the backend Stripe variables and the CAD $7.99 monthly price." };
    checks.storage = { status: process.env.REDDOOR_LOCAL_DATA_PERSISTENT === "true" ? "passed" : "needs_configuration", detail: "Public boards use local JSON even with PostgreSQL. REDDOOR_LOCAL_DATA_PERSISTENT records the operator's persistent-disk declaration, not a durability test." };
    const persistenceHealthy=deps.persistenceHealthy();
    checks.persistence = { status: persistenceHealthy ? "passed" : "failed", detail: persistenceHealthy ? "No tracked persistence failure." : "A persistence write failed; resolve it before launch." };
    return res.json({ checkedAt: new Date().toISOString(), automatedChecksPassed: Object.values(checks).every(c => c.status === "passed"), checks, billingMode: billing.mode ?? "unconfigured", mediaStorageMode: deps.mediaMode, manualVerificationRequired: ["Stripe-hosted checkout, signed webhook delivery, renewal and cancellation", "Delivery of recovery and verification emails to a controlled mailbox", "Backup restore drill and persistent disk/database configuration", "Physical iOS and Android device rehearsal"], launchApproved: false });
  });
}
