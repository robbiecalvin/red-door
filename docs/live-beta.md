# Badehaus X Live beta

Eligible registered members can broadcast from the Live tab on either a free or Plus account. A room can have one broadcaster and up to ten viewers. The API permits five concurrent broadcasts and limits each to 30 minutes. The bundled client targets 360p video at up to 500 kbps. The LiveKit node configuration sets a 5 MB/s admission threshold. Provision and monitor network capacity separately.

LiveKit relays camera and microphone tracks directly to viewers. This setup runs without an Egress service or recording. Viewers can still capture their screens. A broadcaster who loses the camera connection is removed after roughly 45 seconds plus the server polling interval. Moderator stop closes the media room. Reports send the broadcaster, broadcast ID, and viewer’s reason to the safety queue and contain no recording.

## LiveKit Cloud

Set `LIVEKIT_URL` to the project's secure WebSocket URL. Save `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in the Render backend environment. Keep `LIVE_BETA_ENABLED=false` while verifying the project.

For Render services without Shell access, set `LIVEKIT_CHECK_ON_STARTUP=true` in Environment and redeploy the backend version that includes the check. Look for `[LiveKit check]` in Logs. Remove the startup-check variable after collecting the result so it does not rerun on restarts.

Alternatively, from a backend shell with the credentials already set, run:

```sh
node scripts/check-livekit-room-close.cjs
```

The check uses disposable rooms and prints only its result. Both a previously used token and an unused token issued before closure must be rejected after the room is deleted. If either token is accepted, keep streaming disabled and confirm with LiveKit whether the project can prevent automatic room creation. A passing result lets you proceed with the hosted browser checks below.

## Self-hosted LiveKit

1. Use a dedicated Linux VM with Docker Compose and a public IP. In Cloudflare, add a DNS-only A record for `live.badehausx.com` pointing to the VM. Allow incoming TCP 80 and 443 for HTTPS, TCP 7881 and UDP 7882 for media, and restrict SSH to your administrative access. LiveKit’s HTTP API binds to loopback and Caddy exposes it through HTTPS and WSS.
2. On that VM, copy the repo’s `deploy` directory and create `deploy/.env.livekit` with file permissions `0600`. Set `LIVEKIT_HOST=live.badehausx.com` and fresh random values for `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Generate them locally on the VM with `openssl rand -hex 16` and `openssl rand -hex 32`, respectively. Start the services from the repo root.

   ```sh
   docker compose --env-file deploy/.env.livekit -f deploy/livekit.compose.yaml up -d
   ```

3. In Render, set `LIVEKIT_URL=wss://live.badehausx.com` and enter the same key and secret. Keep `LIVE_BETA_ENABLED=false` and set `LIVEKIT_CHECK_ON_STARTUP=true`. Redeploy and check the service logs for both room-close checks. Keep automatic room creation disabled.
4. After both checks pass, enable Live for the hosted rehearsal. Configure TURN/TLS and verify playback on restrictive mobile and Wi-Fi networks before inviting members. Run one app backend instance per dedicated LiveKit instance for this beta. A backend restart closes leftover Badehaus X rooms.

## Local verification

A local LiveKit instance and separate Chromium sessions verified camera publishing from a free-member fixture, remote playback, 10-viewer admission, blocking and viewer removal, reporting, administrator stop, and room closure after the host left while a viewer stayed connected.

## Hosted verification

- Verify that a free member can go live, an eligible viewer can watch on a different network, and the broadcaster appears with a Live now badge in People.
- Verify camera and microphone permissions, mobile playback, explicit end, closed tabs, and recovery from a short network interruption.
- Verify the room limit, that blocked accounts cannot discover or join a stream, and that a moderator can stop a broadcast and find a report in the safety queue.
- Confirm who monitors broadcasts and handles escalations before opening the beta to members.
