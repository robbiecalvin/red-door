# Badehaus X Plus

Plus costs **CAD $7.99 per month**, using Stripe-hosted Checkout and the customer billing portal. The frontend never receives Stripe secret keys. A browser return from Checkout does not grant privileges: a signed Stripe webhook retrieves canonical subscription state and validates the configured CAD 799-cent monthly price before updating the account.

## Free launch access

Set `FREE_PLUS_ENABLED=true` on the backend to grant Plus features to all registered members without an expiry date or promo code. Account and age requirements still apply. Free access pauses new paid Checkout and deferred enrollment. Disable the flag to restore access based on each account's original entitlements.

Existing subscriptions and schedules remain in Stripe and can still renew. Review them in Stripe before announcing free access to all members. Members with an existing billing account can still manage their Stripe subscription through Settings.

## Features and limits

| Capability | Free registered account | Plus |
| --- | --- | --- |
| Basic discovery, direct messaging, unread counts | Included | Included |
| Blocking, reporting, discreet mode, essential location privacy | Included | Included |
| Travel picker | Locked | Included |
| Advanced discovery filters and saved searches | Locked | Included; up to 10 saved searches |
| Favorites | 20 | 100 |
| Pinned chats | 3 | 50 |
| Public gallery photos | 3 | 12 |
| Profile video | Locked | Included |
| Private album photos | 3 | 20 |
| Private album sharing and revocation | Included | Included |
| Sender-visible read receipts | Locked; unread tracking remains functional | Included |
| Existing three-person chat invitation/acceptance flow | Locked | Included |

The existing group-chat flow adds a third previously messaged contact after an invitation is accepted. It is not an arbitrary-size group-room system. Both starting and accepting group invitations require Plus. Normal direct messages remain free. Cruise message expiry, age gates, blocking and consent continue to apply. There is no paid message-retention extension. The public Ads board contains member posts and is not an advertising placement; it remains available. No advertising network is currently installed.

Plus is available from the badge next to the Badehaus X brand. The panel contains subscription status, checkout, billing management, private photo uploads, sharing/revocation and an album viewer. Advanced discovery filters include save/apply/delete controls. Existing favorites, pin controls and media uploads enforce the new limits.

## Launch offer

New registrations can enter **THEREDDOORLAUNCH** in the main-page registration form. Codes are trimmed and case-insensitive. Valid redemption grants complimentary Plus until **January 1, 2027 at 00:00 America/Vancouver** (2027-01-01T07:00:00Z), exclusively. This means all of December 31, 2026 is included. Codes cannot be redeemed at or after that instant. The end is fixed, not one year from signup. Invalid/expired codes reject registration before creating the account. Duplicate registration never extends an existing grant.

The grant is persisted with the account in JSON storage or PostgreSQL and survives signing out and server restarts. Registered sessions derive their tier from the account and expiry on every server lookup. The UI refreshes session status periodically and on focus. No card is collected for the offer; it does not create a Stripe subscription or automatically charge the user when it ends. There is no fake "paid invoice" for complimentary access.

## Stripe activation

On the **backend hosting service** (currently the Render API deployment), configure:

- `STRIPE_SECRET_KEY`: the backend's Stripe API key; use test credentials for validation first.
- `STRIPE_WEBHOOK_SECRET`: the signing secret for this specific webhook endpoint, used locally by HMAC verification.
- `STRIPE_PLUS_PRICE_ID`: active recurring CAD price, exactly 799 cents, interval month, interval count 1.
- `PUBLIC_APP_URL`: the HTTPS frontend URL, including the trailing slash where appropriate.

Enable Stripe's customer portal with subscription cancellation. Configure webhook `https://<backend-host>/billing/webhook`, subscribing to `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, and `customer.subscription.deleted`. The integration pins Stripe API version `2024-06-20` and retrieves current subscription state for each relevant event. Only a subscription with `active` status and the configured price grants paid access through `current_period_end`. Cancellation stops renewal while retaining already paid or complimentary time. Replayed/old events cannot add another month: the canonical period boundary is used. Failed persistence returns an error so Stripe retries.

Do not expose secrets through frontend build variables, Git, or chat. Cloud-task environment settings and the deployed backend's environment settings are separate; configuring one does not configure the other. Redeploy/restart the backend after configuration. GitHub Pages publishes the frontend only.

Test in Stripe test mode: successful checkout and webhook delivery; session refresh shows Plus; portal cancellation; renewal and failed-payment events; replayed webhook; expired/tampered signature; invalid price/currency; and no access from merely visiting the success URL. Live charging and test-mode end-to-end checkout require the merchant account credentials and were not performed during implementation. Purchases stay unavailable when configuration is missing.

## Private media

Private photos use a separate `photo_private` media kind and `private-profiles/` object namespace. Completion does not attach them to public profiles. Public media URL routes and raw local/PostgreSQL download routes deny access to these objects. Album URLs expire within 60 seconds and are signed over owner, viewer, photo and expiry. The authenticated album endpoint checks sharing permission and global blocks. Local/PostgreSQL image requests recheck sharing on every request. S3 uses a short-lived signed redirect after the same checks, so revocation can take up to 60 seconds for already issued S3 URLs. Downloaded copies cannot be recalled. Shared users do not need Plus merely to view a permitted album.

## Validation

- Unit tests map the offer deadline, persisted grants, free/Plus entitlements, receipt visibility, group invitation gates, favorites, travel, private media ownership, webhook signatures, price validation and album-link tampering to the requirements above.
- Real backend smoke checks exercise promotion registration, account access, saved searches, free pin/group restrictions, photo upload/public denial/shared access/revocation, and rejection of unconfigured checkout.
- Browser checks exercise main-page registration with the launch code, active Plus, saved-search save/apply and layouts at 320, 390, 768 and 1440 pixels.

The browser-local API is a development/demo mode stored on the same device. It mirrors feature gates but is not a production authentication or billing authority. Production must use the backend API.

## When Subscribe appears to do nothing

Checkout stays disabled until the registered, age-verified account has loaded backend status and the backend reports complete billing configuration. The Plus panel now shows a reason and a Refresh payment status control. Existing complimentary/paid Plus access intentionally prevents another subscription purchase.

An administrator can open Plus → Check Stripe connection. This makes a read-only request to `/admin/billing/health`, reports missing variable names (never values), validates the public HTTPS URL, reads the configured Stripe price, checks CAD 799 cents monthly, and identifies test/live mode. It does not start Checkout or charge a card. Only administrators may access the endpoint. A successful check does not prove webhook signing/delivery; verify those in Stripe separately. API keys and price IDs must belong to the same Stripe account and mode.

## Reliability batch update

Run `npm run test:smoke` for the isolated HTTP/payment-contract suite. Stripe responses are supplied by a localhost fixture loaded only by the test subprocess; the production app has no mock-provider flag. These checks do not replace a real Stripe test-mode purchase and delivery test.

Paid access now requires the canonical subscription's expanded latest invoice to be paid. Open invoices and explicit failed-payment events do not extend access. Existing subscriptions may renew an archived price; new purchases still require an active price. Add `invoice.payment_failed` to the Stripe webhook subscriptions to record failed-payment diagnostics/metrics. See [the execution roadmap](execution-roadmap.md) for the remaining live-release gate and later phases.
