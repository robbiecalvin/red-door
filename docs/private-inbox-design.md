# Private inbox for Badehaus X

## Product experience

Give members two clearly labeled destinations, **Inbox** and **Instant Chat**. Instant Chat continues to support fast conversations using the existing chat flow and its current unread indicators. Inbox is for longer, subject-based private messages. Neither surface moves messages or unread state into the other. The existing in-chat Direct channel and Cruise/Date rules stay in place. Private Inbox gets its own storage and routes.

From a profile, offer **Send private message** and the existing chat action. Private messages open a compose sheet with a recipient, required subject, and plain-text body. The sender can save a draft, discard it, or send. Drafts are private to the author and sync across devices. Sending or replying keeps the subject and conversation together. On desktop, use a list and reading pane. On mobile, open the conversation on a separate screen with a Back action.

- **Inbox** shows incoming or two-way threads, with filters for unread and archived conversations.
- **Sent** shows threads where the member sent a message. The same conversation can appear in Inbox and Sent.
- **Drafts** includes new messages and unfinished replies. Show the last saved time and whether changes are still pending.
- **Requests** holds first messages from people the recipient hasn’t accepted for private inbox communication. Recipients can accept, decline, block, or report. A sender can withdraw an unanswered request and cannot send follow-ups while it is pending.
- **Archive** and **Delete from my inbox** affect only the current member’s view. They do not recall a delivered message from the recipient.

## Eligibility and safety

V1 is one-to-one, text-only, and available to signed-in accounts that have completed the 18+ declaration. Allow a recipient to choose whether they accept new private-message requests from any eligible member, existing conversations only, or nobody. Default to the requests folder. Recipients can accept a request and reply in one action. Apply blocks, bans, account deletion, and the recipient’s privacy setting on every delivery, including retries.

Rate-limit new requests per sender and per recipient pair. Show aggregate unread counts in notifications without the subject or message text. Keep safety reports on the existing reporting path with a reference to the message and a protected evidence snapshot. Confirm the meaning of deletion in the interface and support removal of account data through the existing account-erasure workflow.

## Data and delivery

Use PostgreSQL tables for inbox threads, participants, messages, and drafts. Keep participant-level state for read position, archive, deletion, and request status. Store creation timestamps and use stable IDs. Store display names in the existing profile system and resolve them separately from online discovery presence.

A send transaction validates account and recipient eligibility, checks blocks and request state, and inserts the message under a sender-scoped idempotency key. It updates the conversation and unread state in the same transaction. A retry returns the original message. Draft updates use a revision number so an older device cannot silently overwrite a newer draft.

Retain delivered messages for 120 days from sending, consistent with the new private-chat retention window. Prune expired records in batches. Maintain safety-report evidence according to the separate reporting retention policy. Never cache message bodies or drafts in the service worker. Keep subjects and bodies out of logs and analytics.

## API shape

| Operation | Route |
|---|---|
| List inbox threads, sent, archived, or requests | `GET /inbox/threads?folder=…&cursor=…` |
| Read one thread and its paginated messages | `GET /inbox/threads/:id` |
| Start a thread or send a first-message request | `POST /inbox/threads` |
| Reply in an existing thread | `POST /inbox/threads/:id/messages` |
| Mark read, archive, hide, or respond to a request | `PATCH /inbox/threads/:id/participant` |
| List, save, or discard drafts | `GET /inbox/drafts`, `PUT /inbox/drafts/:id`, `DELETE /inbox/drafts/:id` |

Authenticate every route, enforce participant access by default, and return private, non-cacheable responses. Use the realtime gateway only to signal a refresh or updated unread count. Delivery and history are available over HTTP when realtime is disconnected.

## Release sequence

1. Implement the PostgreSQL schema, access rules, request handling, and read-only list/detail API.
2. Add compose, draft recovery, reply, folder views, and the profile action behind a release flag.
3. Connect unread counts, discreet notifications, moderation, account erasure, and retention. Test cross-account access, blocked delivery, duplicate sends, concurrent drafts, offline recipients, and expired messages.
4. Verify the new inbox side by side with existing Instant Chat before enabling it for members.

## Initial implementation

The initial web implementation includes the toolbar entry, profile compose link, folders, first-message drafts, requests and preferences, participant-scoped conversation access, and 120-day retention. It uses the existing transactional community repository, backed by PostgreSQL in production. The draft’s dedicated tables, saved reply drafts, and background unread notifications are follow-up work. The release has not been deployed.
