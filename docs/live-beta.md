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

1. Run LiveKit on a dedicated VM with a public IP. Use [the beta configuration](../deploy/livekit.beta.yaml) and supply the credentials through LiveKit’s `LIVEKIT_KEYS` secret. Keep automatic room creation disabled so expired or ended rooms cannot be reopened with previously issued credentials.
2. Terminate HTTPS and WSS on the streaming hostname and forward to LiveKit port 7880. Expose UDP 7882 and TCP 7881 on the media host. Keep the media hostname DNS-only in Cloudflare for this setup. Configure TURN/TLS and test it from restrictive mobile and Wi-Fi networks before inviting members.
3. On the app backend, set `LIVEKIT_URL` to the secure WebSocket URL and configure `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` using the same credentials. Run one app backend instance per dedicated LiveKit instance for this beta. A backend restart closes leftover Badehaus X rooms.
4. Set `LIVE_BETA_ENABLED=true` in the target environment. The flag defaults to off. The UI shows Live after the backend confirms that the provider is configured and reachable.

## Local verification

A local LiveKit instance and separate Chromium sessions verified camera publishing from a free-member fixture, remote playback, 10-viewer admission, blocking and viewer removal, reporting, administrator stop, and room closure after the host left while a viewer stayed connected.

## Hosted verification

- Verify that a free member can go live, an eligible viewer can watch on a different network, and the broadcaster appears with a Live now badge in People.
- Verify camera and microphone permissions, mobile playback, explicit end, closed tabs, and recovery from a short network interruption.
- Verify the room limit, that blocked accounts cannot discover or join a stream, and that a moderator can stop a broadcast and find a report in the safety queue.
- Confirm who monitors broadcasts and handles escalations before opening the beta to members.
