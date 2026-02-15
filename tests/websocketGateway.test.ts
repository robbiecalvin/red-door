import http from "node:http";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";

import { createAuthService } from "../backend/src/services/authService";
import { createWebsocketGateway } from "../backend/src/realtime/websocketGateway";

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(e));
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.once("close", () => resolve());
  });
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once("message", (data) => {
      try {
        const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function createServer(): Promise<{
  url: string;
  wss: WebSocketServer;
  closeHttp(): Promise<void>;
}> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected address");
  const url = `ws://127.0.0.1:${address.port}`;
  const wss = new WebSocketServer({ server });
  return {
    url,
    wss,
    async closeHttp() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

describe("websocketGateway", () => {
  it("Given invalid gateway dependencies When createWebsocketGateway is called Then it throws deterministically", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();

    try {
      expect(() =>
        createWebsocketGateway({
          wss: server.wss,
          jwtSecret: "test_secret",
          authService,
          maxIncomingPayloadBytes: 0
        })
      ).toThrow("websocketGateway requires a positive maxIncomingPayloadBytes.");

      expect(() =>
        createWebsocketGateway({
          wss: server.wss,
          jwtSecret: "test_secret",
          authService,
          heartbeatTimeoutMs: 0
        })
      ).toThrow("websocketGateway requires a positive heartbeatTimeoutMs.");

      expect(() =>
        createWebsocketGateway({
          wss: server.wss,
          jwtSecret: "",
          authService
        })
      ).toThrow("websocketGateway requires a non-empty jwtSecret.");
    } finally {
      await server.closeHttp();
    }
  });

  it("Given a guest session token When a client sends an auth handshake Then the gateway responds with auth_ok", async () => {
    const now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const guest = authService.createGuestSession();
    if (!guest.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 5_000
    });
    const ws = new WebSocket(server.url);

    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("auth_ok");
      expect(msg.payload).toEqual({ userType: "guest", tier: "free", mode: "cruise" });
    } finally {
      ws.close();
      await waitForClose(ws);
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given a JWT When a client sends an auth handshake Then the gateway responds with auth_ok", async () => {
    const now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const issued = authService.issueJWT({
      id: "user_1",
      email: "user@example.com",
      userType: "registered",
      tier: "free"
    });
    if (!issued.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 5_000
    });
    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { jwt: issued.value } }));

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("auth_ok");
      // JWT does not carry mode; gateway starts at cruise (always legal).
      expect(msg.payload).toEqual({ userType: "registered", tier: "free", mode: "cruise" });
    } finally {
      ws.close();
      await waitForClose(ws);
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an invalid session token When a client sends an auth handshake Then the gateway rejects with INVALID_SESSION", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: "not-real" } }));

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload.code).toBe("INVALID_SESSION");
      expect(typeof msg.payload.message).toBe("string");

      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an authenticated client When it sends an unknown message type Then the gateway rejects and closes", async () => {
    const now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const guest = authService.createGuestSession();
    if (!guest.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));
      const authOk = (await waitForMessage(ws)) as any;
      expect(authOk.type).toBe("auth_ok");

      ws.send(JSON.stringify({ type: "nope", payload: {} }));
      const errMsg = (await waitForMessage(ws)) as any;
      expect(errMsg.type).toBe("error");
      expect(errMsg.payload).toEqual({
        code: "UNAUTHORIZED_ACTION",
        message: "Unknown message type.",
        context: { type: "nope" }
      });

      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an incoming message larger than 2kb When it is sent Then the gateway rejects and closes", async () => {
    const now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const guest = authService.createGuestSession();
    if (!guest.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 5_000,
      maxIncomingPayloadBytes: 2 * 1024
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));
      const authOk = (await waitForMessage(ws)) as any;
      expect(authOk.type).toBe("auth_ok");

      const oversized = "x".repeat(2 * 1024 + 10);
      ws.send(oversized);

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload.code).toBe("UNAUTHORIZED_ACTION");
      expect(msg.payload.message).toBe("Payload too large.");

      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an authenticated client When it fails to send heartbeats within the timeout Then the gateway closes the connection", async () => {
    let now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const guest = authService.createGuestSession();
    if (!guest.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 25
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));
      const authOk = (await waitForMessage(ws)) as any;
      expect(authOk.type).toBe("auth_ok");

      const msgPromise = waitForMessage(ws);
      const closePromise = waitForClose(ws);

      // Advance time past timeout and allow the gateway's timer to run.
      now += 100;
      await new Promise((r) => setTimeout(r, 50));

      const msg = (await msgPromise) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "INVALID_SESSION", message: "Heartbeat timeout." });

      await closePromise;
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given a client that sends a non-JSON message When it is received Then the gateway rejects with Invalid message envelope", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send("not json");
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid message envelope." });
      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an unauthenticated client When it sends a non-auth message Then the gateway rejects with Authentication required", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "heartbeat", payload: {} }));
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "INVALID_SESSION", message: "Authentication required." });
      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an auth message missing both sessionToken and jwt When it is received Then the gateway rejects with Missing credentials", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: {} }));
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "INVALID_SESSION", message: "Missing credentials." });
      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an auth message with an invalid payload shape When it is received Then the gateway rejects with Invalid auth payload", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: 123 } }));
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Invalid auth payload." });
      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an authenticated client When it sends auth again Then the gateway rejects with Already authenticated", async () => {
    const now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const guest = authService.createGuestSession();
    if (!guest.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));
      const authOk = (await waitForMessage(ws)) as any;
      expect(authOk.type).toBe("auth_ok");

      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "UNAUTHORIZED_ACTION", message: "Already authenticated." });
      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an authenticated client When it sends a heartbeat message Then the gateway responds with heartbeat_ok", async () => {
    const now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const guest = authService.createGuestSession();
    if (!guest.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));
      const authOk = (await waitForMessage(ws)) as any;
      expect(authOk.type).toBe("auth_ok");

      ws.send(JSON.stringify({ type: "heartbeat", payload: {} }));
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("heartbeat_ok");
      expect(msg.payload.nowMs).toBe(now);
    } finally {
      ws.close();
      await waitForClose(ws);
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an invalid JWT When a client sends an auth handshake Then the gateway rejects with INVALID_SESSION", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { jwt: "not.a.jwt" } }));
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "INVALID_SESSION", message: "Invalid credentials." });
      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given a structurally valid JWT missing required claims When a client sends an auth handshake Then the gateway rejects with INVALID_SESSION", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    const badJwt = jwt.sign({ userType: "registered", iat: Math.floor(Date.now() / 1000) }, "test_secret", {
      algorithm: "HS256",
      subject: "u_1"
    });

    const ws = new WebSocket(server.url);
    try {
      await waitForOpen(ws);
      ws.send(JSON.stringify({ type: "auth", payload: { jwt: badJwt } }));
      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe("error");
      expect(msg.payload).toEqual({ code: "INVALID_SESSION", message: "Invalid credentials." });
      await waitForClose(ws);
    } finally {
      ws.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an authenticated and an unauthenticated client When broadcast is called Then only the authenticated client receives the message", async () => {
    const now = 1_700_000_000_000;
    const authService = createAuthService({ jwtSecret: "test_secret", nowMs: () => now });
    const guest = authService.createGuestSession();
    if (!guest.ok) throw new Error("unreachable");

    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      nowMs: () => now,
      heartbeatTimeoutMs: 5_000
    });

    const authed = new WebSocket(server.url);
    const unauthed = new WebSocket(server.url);

    try {
      await Promise.all([waitForOpen(authed), waitForOpen(unauthed)]);

      authed.send(JSON.stringify({ type: "auth", payload: { sessionToken: guest.value.session.sessionToken } }));
      const authOk = (await waitForMessage(authed)) as any;
      expect(authOk.type).toBe("auth_ok");

      const recv = waitForMessage(authed);
      gateway.broadcast("notice", { text: "hi" });

      const msg = (await recv) as any;
      expect(msg).toEqual({ type: "notice", payload: { text: "hi" } });

      // Unauthenticated client should not receive broadcast; close it deterministically.
      unauthed.close();
      await waitForClose(unauthed);

      // Also cover readyState branch (closed sockets are skipped).
      authed.close();
      await waitForClose(authed);
      expect(() => gateway.broadcast("notice", { text: "hi" })).not.toThrow();
    } finally {
      authed.close();
      unauthed.close();
      await gateway.close();
      await server.closeHttp();
    }
  });

  it("Given an oversized broadcast payload When broadcast is called Then it throws deterministically", async () => {
    const authService = createAuthService({ jwtSecret: "test_secret" });
    const server = await createServer();
    const gateway = createWebsocketGateway({
      wss: server.wss,
      jwtSecret: "test_secret",
      authService,
      heartbeatTimeoutMs: 5_000
    });

    try {
      const payload = { text: "x".repeat(2 * 1024) };
      expect(() => gateway.broadcast("notice", payload)).toThrow("websocketGateway broadcast payload exceeds 2048 bytes.");
    } finally {
      await gateway.close();
      await server.closeHttp();
    }
  });
});
