const { randomUUID } = require("node:crypto");
const { AccessToken, RoomServiceClient } = require("livekit-server-sdk");
const WebSocket = require("ws");

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

function join(url, token) {
  return new Promise((resolve, reject) => {
    let socket;
    try {
      socket = new WebSocket(url, {
        headers: { Authorization: `Bearer ${token}` },
        handshakeTimeout: 5000,
        followRedirects: false
      });
    } catch {
      reject(new Error("Could not start the signaling check."));
      return;
    }
    socket.once("open", () => {
      socket.terminate();
      resolve(true);
    });
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      if ([401, 403, 404].includes(response.statusCode)) resolve(false);
      else reject(new Error(`Inconclusive signaling response (HTTP ${response.statusCode}).`));
      socket.terminate();
    });
    socket.on("error", () => reject(new Error("Could not reach LiveKit signaling.")));
  });
}

async function main() {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error("Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET before running this check.");
  }
  const url = new URL(LIVEKIT_URL);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "wss:" && !(local && url.protocol === "ws:")) {
    throw new Error("Use a secure WebSocket URL for a hosted LiveKit project.");
  }
  const provider = new RoomServiceClient(url.origin.replace(/^ws/, "http"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { requestTimeout: 5 });
  const signal = new URL("/rtc?protocol=15&auto_subscribe=0", url);
  let rejected = 0;

  for (const joinFirst of [true, false]) {
    const room = `badehaus-close-check-${randomUUID()}`;
    const label = joinFirst ? "Previously used token" : "Unused token issued before room closure";
    try {
      await provider.createRoom({ name: room, maxParticipants: 1, emptyTimeout: 20, departureTimeout: 5 });
      const ticket = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: "close-check", ttl: 30 });
      ticket.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: false, canPublishData: false });
      const token = await ticket.toJwt();
      if (joinFirst && !(await join(signal, token))) throw new Error("LiveKit rejected the initial join. The room closure check is inconclusive.");
      await provider.deleteRoom(room);
      if (await join(signal, token)) {
        console.error(`FAIL: ${label} was accepted after room closure.`);
      } else {
        console.log(`PASS: ${label} was rejected after room closure.`);
        rejected++;
      }
    } finally {
      if ((await provider.listRooms([room])).some(item => item.name === room)) await provider.deleteRoom(room);
    }
  }
  if (rejected < 2) throw new Error("Keep Live disabled until both room closure checks pass.");
}

main().catch(error => {
  // Avoid SDK transport errors that could include connection details.
  const safe = /^(Set LIVEKIT_|Use a secure|Could not (start|reach)|Inconclusive signaling|LiveKit rejected|Keep Live disabled)/;
  console.error(safe.test(error.message) ? error.message : "LiveKit API verification could not complete. Check the project URL, API key, secret, and network access.");
  process.exitCode = 1;
});
