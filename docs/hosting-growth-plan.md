# Standalone hosting and growth

Prepared November 16, 2026, America/Vancouver. No service was purchased, created,
resized or migrated. Account plans, business eligibility and live costs are unknown.

## Current inventory and evidence

| Component | Source evidence | Account/runtime verification |
| --- | --- | --- |
| Frontend | GitHub Pages workflow; known URL https://robbiecalvin.github.io/red-door/ | Current request blocked by this environment's egress proxy (403 CONNECT) |
| Backend | Express/tsx, ws; known URL https://red-door-api.onrender.com | Plan, region, logs, disk and latency unknown; request blocked by egress |
| Database | pg; DATABASE_URL or NEON_DATABASE_URL | Neither variable injected; provider, backups and credentials not inspected |
| Media | Local objects by default; PG BYTEA if database configured; S3 if configured | Handoff said postgres, not independently rechecked |
| Email | Authenticated TLS SMTP; STARTTLS required when SMTP_SECURE=false | Local TLS fixture passes; external delivery blocked by missing configuration |
| Maps | OpenFreeMap dark, replaceable public HTTPS style URL | Official GitHub READMEs checked; tile host blocked here |
| Backups | scripts/backup.mjs, offline snapshot + hashes, private file modes | Local restart/isolated restore exercised; remote retention not configured |
| Domains | Existing Pages/Render URLs; PUBLIC_APP_URL and frontend build variables | badehausx.com DNS and HTTPS require production verification |

## Stage A: one always-on backend

Retain the architecture initially, subject to provider eligibility and owner budget.
Use separate staging and production accounts/resources/credentials. Do not assume
that the current Render service sleeps or is free; only provider settings/logs can
establish that. Always-on hosting removes a possible sleep delay, not every source
of latency.

`deploy/render.staging.yaml` is an undeployed, single-instance staging Blueprint.
It requests paid compute and a disk, so importing it can incur charges. Review
current plan/schema/region/terms and cost before creating it. Set auto-deploy off;
select the reviewed commit explicitly. Create an independent staging PostgreSQL
database, configure secure values in Render, and supply a staging frontend URL.
Never copy production user records for these rehearsals.

For the staging frontend, run:

```
npm ci
DUALMODE_API_BASE_PATH=https://YOUR-STAGING-API \
DUALMODE_WS_URL=wss://YOUR-STAGING-API/ws \
DUALMODE_PUBLIC_APP_URL=https://YOUR-STAGING-FRONTEND/ npm run build
```

The API value is the API origin without `/api` when using the backend directly.
Vite's local proxy strips `/api`. Set PUBLIC_APP_URL to the exact HTTPS frontend
origin/base path and CORS_ALLOWED_ORIGINS to its origin. Set port using the host's
injected PORT. Recovery links and Stripe returns derive from PUBLIC_APP_URL.
Use HTTPS/WSS everywhere hosted. `/health` is liveness only; authenticated
`/admin/launch/health` checks connections/configuration, not durable storage or
launch approval. Test websocket upgrade and reconnection through the host proxy.

Set staging STRIPE_SECRET_KEY to a test key, a matching test webhook secret and
a test-mode CAD 799 cents/month recurring price. The staging runtime rejects a
live Stripe key. Never switch production keys to conduct a test. Configure signed
webhooks at `/billing/webhook`, then use hosted sandbox checkout and test clocks.
The local fixture does not establish provider approval or real webhook delivery.

SMTP variables: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM.
Use a verified sender/domain, correct SPF/DKIM/DMARC and a controlled recipient.
SMTP_SECURE=true means implicit TLS; false means mandatory STARTTLS. Set
PUBLIC_APP_URL before sending recovery links. Never log codes, links or passwords.
The repository does not implement a production mail delivery queue; monitor failures.

## Durability and recovery

| Data | Without PostgreSQL | With PostgreSQL |
| --- | --- | --- |
| Accounts, Plus, verification/reset metadata | backend/.data/auth-users.json | auth_users; verification_security JSONB added non-destructively |
| Sessions | Process memory; login required after restart | auth_sessions |
| Profiles, media references | profiles.json / media.json | profiles / media_records |
| Chat/read state | chat.json | chat tables/read cursors |
| Community plans and retained disabled integration data | community.json | community_state JSONB |
| Favorites, blocks, reports, secured guest identities | Local durable state | community_state (settings.favorites, settings.securedGuests, blocks, reports) |
| Public postings, cruising spots | Local JSON | Still local JSON regardless of database |
| Media bytes | Local object directory | PG media_objects, or separately configured S3 bucket |
| Analytics | analytics.json | product_analytics |

Mount the entire `backend/.data` directory, not only auth/chat files. An environment
flag is only an operator assertion. Verify the host's actual disk mount, permissions,
size and application working directory, then create controlled records and media,
restart/redeploy, and re-read them. Keep one writer. Disk attachment does not make
in-memory aggregate snapshots safe across replicas. Private media must remain
private: signed short-lived access, authorization and revocation checks, no public CDN.
PostgreSQL TLS now validates certificates; install a private provider CA securely
if needed, rather than disabling verification.

Local backup drill (all paths are examples; never point restore at production):

```
# Stop only the isolated staging backend before a consistent snapshot.
node scripts/backup.mjs create --source /private/staging/backend/.data --backup /private/backups/unique-snapshot --offline
node scripts/backup.mjs verify --backup /private/backups/unique-snapshot
node scripts/backup.mjs restore-local --backup /private/backups/unique-snapshot --target /private/empty-restore/backend/.data
```

With DATABASE_URL set securely in the process, create includes pg_dump. Use a
compatible pg_dump version and `pg_restore --no-owner --no-acl` into a newly
created empty staging database. The CLI deliberately rejects restore-local for a
combined database snapshot; restore its local-data separately into an empty
private directory and verify hashes. If S3 is used, back up/version the bucket and
restore required objects as well; a database dump contains references, not S3 bytes.
Supply the original signing/encryption configuration securely for a restore, never
inside the archive manifest. Re-login after local-file restoration.

Actual off-host retention/encryption/permissions are NOT VERIFIED. Proposed policy,
requiring operator implementation: encrypted private storage; daily backups for
30 days plus weekly backups for 12 weeks; least-privilege backup/restore identities;
object versioning; access logs; monthly restore drills. Define RPO (initial target
24h) and RTO (initial target 4h) and measure them before promising them. The script
sets directories 0700 and copied files 0600 and verifies SHA-256, but does not encrypt
archives, schedule backups, implement retention or prove remote access controls.

## Monitoring, costs and host eligibility

Record API request/error/timeout rates and p50/p95 latency, websocket connection and
reconnect counts, event-loop/CPU/memory, database pool wait time/connections, disk
free bytes, backup age/restore result, SMTP failures and monthly media/map bandwidth.
Use aggregate metrics; exclude identities, message bodies, tokens and exact location.
Alert on sustained 5xx/timeouts, persistence errors, disk pressure and stale backups.

Current official pricing/terms pages were blocked by the egress proxy. No current
price quote or provider eligibility is claimed. Before purchase, obtain a dated
quote from https://render.com/pricing and the selected database/storage/mail hosts.
Fill this monthly budget worksheet; sum in one currency with tax/FX identified:

| Monthly item | Calculation | Verified price |
| --- | --- | --- |
| Always-on API | selected plan × one instance, plus staging usage | BLOCKED: provider quote needed |
| PostgreSQL | compute + durable GB + PITR/backup retention | BLOCKED |
| Disk | mounted GB × current GB-month rate | BLOCKED |
| Media | stored GB + GET/PUT requests + outbound GB | BLOCKED |
| CDN/static host | fixed plan + builds/bandwidth overage | BLOCKED |
| SMTP | verification/recovery emails × delivery rate | BLOCKED |
| Maps | OpenFreeMap public instance states free/unlimited use; no SLA inferred | $0 advertised; reassess needs and availability |
| Monitoring/backups | retention GB + requests/egress + service plan | BLOCKED |
| Domain | annual registration/renewal ÷ 12 | BLOCKED: ownership not assumed |

Set a spending alert and owner-approved cap after quotes. Do not equate registered
users with supported concurrent users. Forecast active sessions, message rate,
photos per member, average photo bytes and retention first. Revisit at measured load.

Compare staying on paid Render with Fly.io for an architecture-preserving Node/ws
alternative if measured cost, regional latency, capacity or acceptable-use restrictions
justify a move. Fly also needs separate durable database/media/backups and current
quotes. It does not fix multi-writer bugs. Neither provider's current eligibility
for this product has been established.

GitHub Pages versus Render Static Sites: verify commercial/product terms, UGC
restrictions, bandwidth/build quotas, routing, domains and CDN pricing directly.
Keep the existing static host only if suitable. Do not move merely for a new logo
or assume a paid plan permits all content. Review the actual standalone product,
moderation, adult UGC and anonymized chat with every selected host and payment provider.

Official references to recheck in an authorized browser:
https://render.com/docs/free, https://render.com/docs/disks,
https://render.com/docs/scaling, https://render.com/docs/websocket,
https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits,
https://fly.io/docs/about/pricing/ . These were not successfully fetched here.

## Stage B: prerequisites before adding replicas

The current architecture is NOT ready for horizontal scaling. Audit findings:

- Auth/session maps and PostgreSQL whole-state saves can overwrite other writers;
  saveState also deletes rows absent from a process snapshot.
- Chat service and persistence snapshots, presence, websocket recipients and fanout
  are process-local; one process cannot notify every connected peer on another.
- Blocks, favorites and safety snapshots require explicit invalidation and transactional
  updates; community repository transactions do not solve all other aggregates.
- Verification/recovery request limits are process-local except persisted code attempts;
  proxy trust and shared rate limiting need a defined deployment topology.
- Timers/expiry jobs and billing side effects must use distributed locks, durable jobs
  and idempotency; running them on every replica risks duplicate actions.
- Local public boards/spot files and attached disks block multiple writers.

Before a second replica: migrate each aggregate to concurrency-safe transactional
rows, replace delete-missing snapshot writes, share revocation/entitlement state,
use coordinated rate limits and durable queues, add cross-instance pub/sub for
presence/ws signals, and retain durable messages independently of pub/sub. Remove
attached-disk dependencies after a controlled migration. This is a separate staged
architecture project, not silently enabled by this launch patch.

Gate it on a two-instance staging test: identities pinned to different instances
exchange ordinary messages; block/revoke/Plus changes propagate; restarts/reconnects
and duplicate jobs preserve consistency. Then load-test controlled accounts with
realistic active sessions/media, reporting p50/p95, errors, throughput, memory and
pool pressure. No supported user count has been invented; this test was NOT RUN.

## Migration/cutover runbook

1. Record the measured reason, provider eligibility and dated price comparison.
2. Provision isolated staging with the exact reviewed commit and private credentials.
3. Restore a controlled database/media/local-data copy and validate counts/checksums,
   accounts, safety, private media, payment idempotency, recovery and websockets.
4. Before production cutover, take verified backups and agree on a write-freeze or
   explicit replication/checkpoint strategy; record final counts/object checksums.
5. Prepare TTL/DNS, TLS, frontend API/WSS/public URL, CORS, mail links, webhook
   destination/signing configuration and reconnect behaviour. Domain changes require
   ownership and owner authorization.
6. Specify cutover and rollback owners, write-freeze window, monitoring thresholds
   and decision deadline. Preserve the old database and media read-only.
7. Rollback requires reconciling writes accepted on the new system, then restoring
   the chosen authoritative data and configuration; DNS rollback alone loses writes.
8. Resume writes only after integrity checks. Retain evidence without personal data.

Owner actions: authorize costs, confirm provider terms, supply secure staging
bindings, verify disk/backups, approve domains and production cutover separately.
No production move is authorized or performed by this document.
