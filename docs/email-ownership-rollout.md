# Email ownership and age declarations

New standalone registrations require strong passwords and email delivery configuration.
A missing SMTP configuration returns a safe 503 rather than creating an account that
cannot verify ownership. Phone remains optional; owning a phone number is not proof
of owning an email address. Codes go to email even if a phone number was supplied.

Ordinary users cannot log in or receive a usable session until the email code succeeds.
The server does not enable the legacy skipEmailVerification service option. Registered
HTTP and websocket/JWT authorization resolve authoritative user status. Consequently
unverified users cannot message, upload or use paid membership. Guest entry remains
separate, with the adult declaration and existing guest limitations.

Codes expire after 15 minutes. Five guesses lock the current 15-minute attempt window;
resending does not clear it. Resend has a one-minute cooldown and login does not
rotate a recently sent code. Hashes, expiry, send time, attempt count/window and
successful ownership timestamp survive file and PostgreSQL restarts. A non-destructive
verification_security JSONB column is added by startup schema migration. Successful
verification removes the code; replays fail. Plaintext codes do not enter reports.

## Existing records: unknown provenance is not a proven failure

Older email_verified=true records may have come from automatic registration, real
verification or privileged creation. Do not reset their status or revoke all users.
New successful code verification records emailOwnershipVerifiedAtMs; absence means
unknown evidence, not proof of maliciousness. The rollout preserves these accounts.
An operator can count the unknown cohort without exporting email addresses:

```
SELECT COUNT(*) AS ownership_evidence_unknown
FROM auth_users
WHERE email_verified = true
  AND verification_security->>'emailOwnershipVerifiedAtMs' IS NULL;
```

For JSON mode, count verified records without that property using a private offline
script; do not print identifiers or copy production files into this workspace.

Compatible next rollout: introduce an authenticated voluntary re-verification request
that sends to the existing email without downgrading the account while pending;
accept its single-use expiring code on an authenticated confirmation endpoint, record
the evidence, then gradually require proof for new sensitive account changes or new
billing enrollment. Define an appeal/recovery path and notice period first. Do not
allow an unauthenticated resend to reset an established account's verified status.
This voluntary legacy flow is PLANNED, not implemented or silently enforced here.
Administrator promotion still requires a real verification code for claimed emails;
securely provisioned historical administrators require separate provenance review.

## Age mechanism and release decisions

Registration rejects missing/non-integer/out-of-range/under-18 declarations on the
server. Guest and restored registered sessions without an age declaration see the
age gate; server service boundaries retain their restrictions. Valid declared ages
are integers 18–120. Existing profiles may supply the user's previous declaration;
this is not independent age assurance. Stronger assurance remains an unresolved
legal, hosting and payment-provider decision. No documents or new identity vendor
were introduced. Physical-device and hosted boundary rehearsals remain required.

## Mail/recovery operations

Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM and a correct
HTTPS PUBLIC_APP_URL securely on staging. Use an approved sender and controlled
external inbox. See hosting-growth-plan.md for DNS authentication and staging.
Recovery returns the same safe response for known/unknown eligible requests and
has per-account throttling; auth endpoints also have a bounded per-socket-address
window. Configure a trusted reverse-proxy topology before production rate-limit tuning;
forwarded headers are not blindly trusted. No external inbox delivery was verified.

Local TLS SMTP tests exercise actual application mail, code verification, recovery
links, single-use reset, password change and session revocation. The integration
smoke suite checks both HTTP and websocket/JWT revocation. Those local fixtures are
not evidence that a hosted message reached an external inbox. Monitor asynchronous
SMTP failures; a successful HTTP request is not proof of delivery.

Reproduce the isolated frontend/mail flow with:

```
node --import tsx scripts/check-registration-browser.ts
```

It creates temporary backend/Vite ports and a local TLS SMTP fixture, checks invalid
and valid codes through the real registration UI, and cleans up its processes/data.
This command passed; it does not send to an external inbox.

## Terms of Service and Privacy Policy

Publish the approved Terms of Service and Privacy Policy at version-specific HTTPS URLs. Set `REGISTRATION_TERMS_URL`, `REGISTRATION_TERMS_VERSION`, `REGISTRATION_PRIVACY_URL`, and `REGISTRATION_PRIVACY_VERSION` on the backend, then set `REGISTRATION_POLICY_REQUIRED=true`. Version identifiers can contain letters, digits, periods, underscores, and hyphens. Set a new version when the text changes.

The registration form fetches the published policy configuration and displays the document links and an unchecked acceptance box. The backend checks both versions and stores them with a server timestamp on the new account. Marketing consent remains optional. Existing accounts can continue to sign in. If enforcement is enabled with invalid or missing configuration, new signup is temporarily unavailable.

The local registration browser fixture covers unchecked, absent, stale, and valid acceptance and finishes email verification against an isolated SMTP fixture. For hosted verification, use a test account and an external inbox you control. Verify that both document links open, signup requires acceptance, the message arrives, the code opens the signed-in app, and the same credentials work after signing out. Also exercise password recovery and check the browser against both supported domains. Record results without including codes or passwords.

## Render free web services

Use the Resend HTTPS API where outbound SMTP ports are blocked. Verify the sending domain in Resend, then add `RESEND_API_KEY` (a sending key) and `RESEND_FROM` (an address on the verified domain) to the backend's Render environment. When both are present, the server prefers Resend; existing SMTP deployments can continue to use their SMTP configuration. A real external-inbox signup is the delivery check for HTTPS email.
