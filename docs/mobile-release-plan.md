# iOS and Android delivery decision and runbook

Prepared November 16, 2026. Native packaging/submission is BLOCKED at the product
eligibility checkpoint. A wrapper does not change the product or its policy risks.
No native projects, signing material, purchases, submissions or store promises were made.

## Eligibility before packaging

The current product is cruise-first, has anonymous guest chat, adult-oriented profile
fields and location discovery, and permits sensitive/private imagery. Removing MD
is necessary for the standalone scope but does not remove these other risks.

The supplied brief cites Apple 1.1.4 (hookup/prostitution-related apps), 1.2 (pornographic
UGC/random or anonymous chat), 3.1 (digital purchases) and 4.2 (minimum functionality).
It also cites Google's sexual-content/compensated-sex restrictions and social/dating
child-safety obligations. These are material risks for this actual product. Current
Apple/Google policy pages were blocked by this environment's egress proxy; this is
not a fresh legal or store-eligibility determination.

Owner/product counsel/store specialist must review current rules and decide between:

- A substantively revised, compliant social product: change restricted functionality,
  imagery/profile fields/anonymous interactions as necessary, implement operational
  moderation and accurate marketing, then rerun the eligibility checkpoint.
- A web route, with optional PWA installability after separate implementation and
  testing. This avoids native submission, not applicable law or host/payment terms.

Do not conceal features from reviewers, use euphemisms to evade rules, or remotely
enable undisclosed functionality after approval. No MD referral/discovery/paid-chat
feature belongs in the native release. Stronger age assurance is an unresolved
legal/host/provider requirement; current numeric declarations are not independent
age or identity verification. Do not collect identity documents without a defined
privacy/security design and authorization.

## Toolchain and conditional implementation

The official npm registry returned @capacitor/cli 8.6.2, @capacitor/android 8.6.2,
and Node requirement >=22 during this task. Confirm all package versions together
before installation. Current Xcode/macOS, Android Studio/JDK/SDK, and target-platform
minimum versions require rechecking official Capacitor 8 documentation; the website
was blocked here. Do not assume an existing Mac supports the required Xcode.

After eligibility and an owner-confirmed reverse-domain app identifier:

```
npm install --save-exact @capacitor/core@8.6.2 @capacitor/android@8.6.2 @capacitor/ios@8.6.2
npm install --save-dev --save-exact @capacitor/cli@8.6.2
npx cap init
# Set webDir: 'dist', the approved appId/appName; omit a remote server.url.
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

These are conditional instructions, NOT executed or validated native commands.
Use a compatible current macOS/Xcode host for iOS; this Linux machine cannot produce
an iOS archive. Configure staging/production HTTPS API and WSS before building assets;
package dist into the app, rather than loading an arbitrary remote website. Native
apps still require the hosted backend and private media infrastructure.

Implement/test safe areas, keyboard/composer resize, Android back stack, session
expiry/logout, loading/offline/retry UX and universal/app links with verified domain
association. Store credentials in platform secure storage, not a long-lived plaintext
web-storage token. Add native notification registration and background delivery,
location and camera/photo integrations with purpose strings and denial paths. Prompt
only at the relevant action; never include exact location in logs or crash reports.
A browser notification implementation is not native background push.

## Purchases, deletion and safety prerequisites

Plus is a digital subscription. Recheck current StoreKit/Play Billing rules by
storefront/program; do not assume the web Stripe flow is allowed in native apps.
Implement required native purchases, server-side receipt/transaction verification,
restore purchases, account association, renewal/cancel/refund/expiry processing and
idempotency. Reconcile web/native entitlements with a clear source of truth and
avoid duplicate billing. Review any permitted external-purchase exception explicitly.
No native billing implementation has been attempted before eligibility is settled.

Before submission: in-app account deletion and a public deletion route as required,
privacy policy/support URLs, data-retention/deletion behaviour, truthful Apple privacy
and Google Data safety disclosures, community standards, reporting/blocking,
moderation response/escalation, child-safety processes and a responsible support
contact. Inventory SDK collection, precise location, media, messages and financial
metadata. Verify deletion across backups/retention rather than only deleting a UI row.

## Owner enrollment, signing and release

1. Visit https://developer.apple.com/programs/enroll/ and
   https://play.google.com/console/signup in an owner-controlled account. Recheck
   current fees, country/tax, identity/business verification and organization versus
   individual requirements. Fees are NOT VERIFIED here; no membership was purchased
   or agreement accepted. Record actual fees before budgeting.
2. Use the account-specific Play Console requirements for personal-account closed
   testing/production access; do not rely on remembered tester counts/durations.
3. Keep Android upload/signing keys, Apple certificates/profiles and store API keys
   in owner-controlled secure storage/CI secrets. Never commit or send them in chat.
4. Build an Android App Bundle with the approved SDK/JDK/Gradle setup; build an iOS
   archive on supported macOS/Xcode. Use separate staging app identifiers/backends.
5. Upload manually to internal Play testing and TestFlight with controlled users.
   Run actual iOS Safari/native and Android Chrome/native device rehearsals: entry,
   email verification/recovery, location allow/deny, media, rotation, keyboard, map,
   chat reconnect/retry, background/resume, notifications denied, blocking/reporting,
   account deletion and purchase/restore/cancel. Private sessions also need web tests.
6. Prepare truthful screenshots, descriptions, content/age ratings, privacy/support
   URLs and reviewer credentials/access to all submitted features. No real member
   should be contacted during rehearsal.
7. Owner submits for review, responds to specific policy findings, then authorizes
   staged release. Monitor crash-free sessions, startup/network failures and billing
   lifecycle errors; pause rollout and provide a tested hotfix/rollback when needed.

Actual phones, macOS/Xcode, developer accounts, app ID, signing and provider access
are unavailable. Device rehearsal, signing, native billing, uploads and submission
are NOT RUN/BLOCKED, not implied by Chromium viewport tests.

Official references requiring a current owner review:
https://capacitorjs.com/docs,
https://developer.apple.com/app-store/review/guidelines/,
https://support.google.com/googleplay/android-developer/answer/9878810,
https://support.google.com/googleplay/android-developer/answer/14747720,
https://developer.apple.com/support/compare-memberships/,
https://support.google.com/googleplay/android-developer/answer/6112435 .
