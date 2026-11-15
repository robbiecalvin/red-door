# MD bridge and launch billing deployment

Red Door's code is ready for staging. Actual MD interoperability and live renewal charges require the configuration below; local fixtures do not prove production account/payment connectivity.

## Keep current URLs until the domains are ready

After purchasing `thereddoor.app`, point its DNS at the existing frontend host, configure that host's custom domain and HTTPS, and verify ownership. For GitHub Pages, set the repository Actions variable `RED_DOOR_PUBLIC_APP_URL` to `https://thereddoor.app/`; the build updates canonical/social URLs and creates `dist/CNAME`. Update the backend `PUBLIC_APP_URL` to the same URL and keep any old frontend origin in `CORS_ALLOWED_ORIGINS` during migration. Existing API/WebSocket host variables stay pointed at the backend, not the static website. Existing browser sessions are origin-specific, so members will sign in again on the new domain.

Keep the defaults on the current URL until DNS and HTTPS are ready. Configure MD's website as `https://meetdiscreet.ca`; its API can have a separate hostname/base.

## Connect both backends

Follow [the versioned integration contract](md-integration-contract.md). Both backend operators must agree on the endpoint/schema/signature contract and configure the same high-entropy `MD_SHARED_SECRET` privately. Set Red Door's `MD_API_BASE_URL`, `MD_SITE_URL`, and any additional photo hostnames in `MD_MEDIA_ALLOWED_HOSTS`. Never publish the shared service secret or copy it into frontend variables. Red Door account linking keys can be generated before configuring the bridge; they are stored only as keyed hashes using Red Door's JWT secret. Rotating that JWT secret also invalidates those linking keys.

The MD environment owns its checkbox, green live control, provider ownership/adult/payment checks, $11.99 provider subscriptions, account/follow requirements, friendly-code generation, canonical code redemption endpoint, and revocation delivery. Red Door supplies the directory, handoff, code verification client, and message storage/relay. Until MD implements its side, Red Door shows an unavailable/empty state and grants no fabricated providers or paid access.

Use PostgreSQL for durable hosted storage (`DATABASE_URL`, optionally `REQUIRE_DATABASE=true`); local-file fallback requires a persistent disk. Account keys/promo ledgers/billing references live with auth users. MD links, receipts, messages, nonce replay protection, and handoff tickets live in the existing community repository. Run a single backend instance with the current JSON aggregate repository; horizontally scaling requires transactional concurrency changes. Protect storage backups. MD message retention is 72 hours and cleanup runs when bridge state changes.

## Stripe setup

Configure backend-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLUS_PRICE_ID`, and `PUBLIC_APP_URL`. The price must be active, recurring monthly, **CAD 799 cents**. Use Stripe test keys/prices first. Enable the Customer Portal's payment-method and subscription cancellation controls. Stripe holds payment details; Red Door stores only Stripe identifiers and status flags.

Point the Stripe webhook at the backend's `/billing/webhook`, with these events:

- `checkout.session.completed`
- `invoice.paid`, `invoice.payment_failed`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `customer.updated`
- `subscription_schedule.updated`, `subscription_schedule.canceled`, `subscription_schedule.released`, `subscription_schedule.aborted`, `subscription_schedule.completed`

During complimentary launch access, `/billing/enroll` requires explicit recurring-charge consent and opens Stripe Checkout in **setup mode**. Only a verified successful SetupIntent triggers a Subscription Schedule, starting `2027-01-01T07:00:00Z` (midnight America/Vancouver under current timezone rules). No subscription payment is taken today. After its first monthly phase, the schedule releases into an ordinary monthly subscription. Canceling the scheduled renewal before it starts preserves complimentary access. If setup confirmation is delayed past the boundary, it creates a subscription immediately and access still waits for a confirmed paid invoice.

Ordinary `/billing/checkout` creates a monthly paid subscription from checkout. Webhooks retrieve canonical Stripe state; a success URL never grants access. Payments requiring authentication or declined payments can fail, so the scheduled time is an attempted charge, not a guarantee that everyone is charged simultaneously. Expired free grants stop granting Plus automatically; billing reminders explain how to reactivate. No card saving or charge is inferred from simply redeeming a promo code.

`REDDOORLAUNCH` and `REDDOORUNLOCKED` have unlimited global redemptions, once per code per account. Both end at the same fixed launch boundary, even if redeemed late. The provider code also queues the dismissible MD tutorial. Legacy `THEREDDOORLAUNCH` remains accepted through the same boundary. Redemption never shortens an already longer paid entitlement.

## Verification before launch

Use separate test accounts and test-mode Stripe. Verify the complete hosted Setup checkout → saved payment → schedule → cancellation flow, and use a test clock to exercise the January invoice/renewal and failure path. Verify webhook delivery and retries in the Stripe dashboard. Then exercise MD linking, key rotation, nearby discovery, handoff, MD signup/follow/payment, friendly-code redemption, bidirectional messages, expiry/refund revocation and blocking with the other environment. The repository tests simulate these APIs; they do not make live charges.
