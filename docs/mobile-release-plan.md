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

## Google Play edition groundwork

Set `DUALMODE_EDITION=google-play` on both the backend and the production frontend
build. Provide separate `DUALMODE_API_BASE_PATH` (HTTPS) and `DUALMODE_WS_URL` (WSS)
endpoints when building. Run the Play backend with its own database or local
storage and its own secrets. The build writes to `dist-google-play/`. The
default web workflow continues to publish `dist/`.

The Play edition omits sexual profile fields and controls. Its backend omits
those fields when reading legacy profiles and strips them from member and
admin profile updates. The Play discovery screen includes an interest filter and links to scheduled
group plans. The Play API rejects Right Now updates, place chat, Cruise spots,
and classified posting creation. Guests can browse people and group plans.
Messaging requires registered accounts on both ends, and the Play backend
omits guest presence from discovery. The Play edition serves reviewed profile
and group media, along with reviewed private album and direct-chat photos.
Chat video, voice attachments, calls, and Live remain paused. Text moderation and child-safety operations still need work before
submission.

## Private media review

Play Settings → Profile includes intake and submission status for profile and
gallery photos, profile videos, album photos, group photos, and chat photos,
video, and audio. Admins can preview, approve, reject, or remove submissions.
Decisions are recorded in the community repository. Review files use the
private storage prefix. Moderator previews
require admin access. Approved public profile media is served through the Play
API, which checks the current decision and profile visibility on each download.

Install FFmpeg and FFprobe on the Play backend before using intake. The encoder
needs JPEG, H.264, and AAC support. The service re-encodes media without embedded
metadata, accepts up to 20 MiB per upload, and caps audio and video at 60 seconds.
Operate the worker with patched binaries and restricted OS privileges.

Approved profile photos, gallery photos, and profile videos publish through
the Play profile flow. A pending or rejected replacement leaves the current
photo or video visible. Removal revokes the delivery URL. Members can report
the exact profile file, and moderators can preview or remove it from Safety
reports. Approved group photos can be selected when creating a plan. Delivery
requires an age-confirmed session that can view the group. Owners can add
approved photos to private albums and grant or revoke access. Direct chat can
send approved photos to registered participants. Album and chat downloads
require the matching authorized session. Exact-file reporting and moderator
removal cover profile, group, private album, and chat photos. Retention
controls are described below. Child-safety operations remain pending. Live streams and calls need separate real-time controls.

## Play media retention

The Play review store uses these proposed defaults.

| File state | Cleanup eligibility |
| --- | --- |
| Interrupted upload | 1 day after intake started |
| Awaiting moderation | 30 days after submission |
| Rejected, removed, or withdrawn | 30 days after the latest review or use |
| Approved and no longer referenced | 90 days after the latest review or use |
| Approved and referenced | Keep while referenced by a current profile, an album, an active group, or a retained chat |
| Held evidence or unresolved media report | Keep until an authorized moderator releases the hold with a recorded reason |

Members can withdraw pending or approved uploads in Settings → Profile.
Withdrawal removes delivery access immediately. Retention then determines when
the backend deletes the stored file. Previously opened copies on a viewer's
device are outside the server's control.

Moderators can find the exact media reference in Media review or Safety reports.
Use the retention controls in Settings → Profile to preview eligibility, place
a hold, or record a release. Reports create evidence holds, and prior reports
also protect their files. Release only after the case and any required
preservation period are resolved. A later report puts the file back on hold.

Automatic deletion is off by default. Before enabling it on the isolated Play
backend, review the defaults, run the admin eligibility preview, and verify
storage and backup settings. Set `PLAY_MEDIA_RETENTION_ENABLED=true` on the
designated Play worker to run cleanup hourly. An authenticated admin can also
POST to `/admin/media-review/retention` to run a batch of up to 100 files.
Check the returned eligible, deleted, and failed counts. Failures are retried.
The worker records deletion progress and keeps metadata tombstones so old
profile replacements and reported file references resolve consistently.

Verify the live storage provider separately. For S3 buckets with versioning,
an ordinary delete can leave older versions. Set a noncurrent-version
lifecycle that respects evidence holds, and check provider backups and
replicas for their own expiration. Restore into isolation and reconcile the
latest holds and deletion records before exposing restored media. Audit
legacy storage objects without review records before deleting them. Configure
backup expiration and publish the final retention periods in the app privacy
policy before store submission. Account-wide deletion and child-safety
reporting have separate requirements below.

## Account deletion

Host the Play build's public `/?account-deletion=1` page and use its HTTPS URL
in Play Console. The in-app link is under Settings → Privacy. Members can ask
for a single-use code through their verified account email, then type DELETE
on the public page to confirm. Transactional email must be configured.

Confirmation records a durable job. The worker locks the account and revokes
sessions before removing profile, presence, submissions, matching, chats,
group content and membership, favorites, blocks, participant analytics,
album grants, and unheld review files. The worker retries incomplete jobs.
Moderators retain report evidence and the existing media hold rules. Aggregate
metrics and operational audit records are retained. Staff accounts stay outside
the self-service flow.

Check pending jobs through the authenticated /admin/account-deletion endpoint.
Accounts with active or unverified billing remain queued until the subscription
or schedule has been reconciled. Payment-provider records, backup expiry,
and historical imported or third-party records need an operator process before
making a production account-erasure commitment. Test the hosted page and email
delivery with a disposable account before supplying its URL to the store.

## Child safety operations

Host `/legal/child-safety.html` and provide its public HTTPS URL in Play Console.
The Play report controls distinguish suspected underage accounts from suspected
child sexual abuse or exploitation. Exploitation reports on approved files
restrict delivery and retain the reported file. Verified conversation
participants can report individual messages. Flagged messages are masked on
subsequent reads while their original text remains in the restricted report.

Configure `CHILD_SAFETY_REVIEWER_EMAILS` on the isolated Play backend as a
comma-separated list of verified admin email addresses. In Settings → Privacy
→ Safety reports, designated reviewers can switch to Child safety reports.
Only designated reviewers can open evidence linked to child-safety reports.
A file restricted for exploitation is also unavailable through ordinary
moderator previews. Reviewer authorization is checked by the server.

Before launch, assign and train a primary contact and backup, keep the Google
Play contact details current, and set coverage for the priority queue. Rehearse
the workflow with harmless fixtures. Review underage concerns promptly and
restrict the account when warranted. For suspected exploitation, minimize
access to evidence, record decisions in the authorized case process, and
coordinate required reports to the appropriate authority. In Canada, consult
Cybertip.ca and confirm applicable provider reporting and preservation duties.
Contact emergency services if someone is in immediate danger. Use the
authorized reporting process without forwarding or making unnecessary copies
of evidence. Retention holds must remain until the authorized reviewer clears
the case and any applicable preservation period.

Escalation to an authority is a staff action. The app does not send evidence
externally. Production contact details, staffing, and a live rehearsal remain
required before Play submission.

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
