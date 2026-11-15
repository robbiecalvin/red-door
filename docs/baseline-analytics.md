# Baseline activity measurement

The server records successful business operations and an optional product-usage baseline. No browser analytics endpoint accepts arbitrary client events, and no third-party analytics SDK is installed.

## Collection and consent

Anonymous aggregate counts record successful registrations, checkout creation, confirmed paid billing periods, failed payments and cancellation requests. Billing events are deduplicated by a keyed hash of the provider record/period, so webhook retries do not inflate totals. Stripe sandbox checkouts and paid periods have separate counters and never increment real paid-conversion flags. These counters are measurement data, not a financial ledger.

Individual activity is **off by default**. A registration checkbox or profile settings can opt in. For consenting users, account identifiers are HMAC-protected with a purpose-specific prefix and the server JWT secret. The raw user ID, email, session token, IP, user agent, message, photo, location, sexual preferences and saved-search contents are never stored in analytics.

Both people must opt in before a conversation relationship is measured. Only keyed hashes of the participants/pair, daily dates and a replied flag are kept. System group-invite messages are excluded. Activation means first **observed** profile completion/message/reply after enrollment; it is not a reconstruction of historical behavior. Guests and activity from before enrollment are excluded.

Daily activity and event deduplication records are retained for 35 days. Measurement records inactive for 35 days are removed. Opt-out immediately removes the participant record and associated conversation relationships; anonymous aggregate history remains. Cleanup runs daily and when summaries are read. Rotating JWT_SECRET changes the HMAC identity space, so it resets future continuity with older participant records.

Set `ANALYTICS_ENABLED=false` to stop collection. Failure to initialize the optional analytics store disables collection without blocking the app. A metric-write failure must not fail registration, message delivery or billing.

## Storage and administration

Local storage uses ignored `backend/.data/analytics.json`. PostgreSQL uses a `product_analytics` JSON state row. This mirrors the app's current single-backend-instance state model; it is not a distributed analytics system. Use one writer. Backups must follow the same retention/access policy.

`GET /admin/analytics` requires an administrator session and returns aggregate data only. The account menu exposes a mobile-friendly Activity dashboard. Existing users can opt in through settings. The browser-local demo offers privacy preferences but does not pretend to have server metrics.

The cohort table covers registrations in the last 35 days. Cohort is assigned at enrollment from the registration entitlement: free, launch offer, paid, or other complimentary Plus. Converting a free/launch participant to paid preserves their original cohort. Launch redemptions are not counted as paid conversions. Paid-period confirmation counts can include renewals; the cohort conversion flag is per opted-in participant.

Seven-day retention uses the registration day and activity on exactly the seventh UTC day. The denominator includes only users enrolled on their signup day whose day-seven date has arrived. It is shown as returned/eligible; a new cohort has no mature denominator yet. It should not be interpreted as whole-population retention because participation is optional. Daily buckets are UTC and are labeled as such in the dashboard.

## Regression coverage

- `analyticsService.test.ts`: consent exclusion, aggregate counts, milestones/replies, mature retention denominators, opt-out deletion, replay deduplication, persistence/retention, disabled collection.
- `apiSmoke.test.ts`: admin-only access, actual HTTP event hooks, signup cohort separation, billing replay and opt-out.
- Manual browser validation: optional-consent registration, persisted privacy switch, administrator dashboard on phone/desktop and no page-level JavaScript errors.
