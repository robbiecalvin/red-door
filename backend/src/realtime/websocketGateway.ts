import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import { WebSocketServer, type WebSocket } from "ws";

import type { Result, Session as AuthSession } from "../services/authService";

export type ErrorCode =
  // Error codes are binding strings (docs/errors.md). Keep this flexible so
  // downstream services can pass through their own codes without unsafe casts.
  string;

export type ServiceError = {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

export type MessageEnvelope = Readonly<{
  type: string;
  payload?: unknown;
}>;

export type AuthHandshakePayload = Readonly<{
  sessionToken?: string;
  jwt?: string;
}>;

export type AuthContext = Readonly<{
  userType: "guest" | "registered" | "subscriber";
  tier: "free" | "premium";
  mode: "cruise" | "date" | "hybrid";
  sessionToken?: string;
  userId?: string;
}>;

export type WebsocketGatewayDeps = Readonly<{
  wss: WebSocketServer;
  jwtSecret: string;
  authService: Readonly<{
    getSession(sessionToken: string): Result<AuthSession>;
  }>;

  maxIncomingPayloadBytes?: number;
  heartbeatTimeoutMs?: number;
  nowMs?: () => number;
}>;

export type WebsocketGateway = Readonly<{
  close(): Promise<void>;
  broadcast(type: string, payload: unknown): void;
}>;

const DEFAULT_MAX_INCOMING_PAYLOAD_BYTES = 2 * 1024;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 45_000;

function makeError(code: ErrorCode, message: string, context?: Record<string, unknown>): ServiceError {
  return context ? { code, message, context } : { code, message };
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function isEnvelope(value: unknown): value is MessageEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string";
}

function isAuthPayload(value: unknown): value is AuthHandshakePayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.sessionToken !== undefined && typeof v.sessionToken !== "string") return false;
  if (v.jwt !== undefined && typeof v.jwt !== "string") return false;
  return true;
}

function send(ws: WebSocket, type: string, payload: unknown): void {
  const message = JSON.stringify({ type, payload });
  ws.send(message);
}

function sendError(ws: WebSocket, error: ServiceError): void {
  send(ws, "error", error);
}

function closePolicy(ws: WebSocket): void {
  try {
    ws.close(1008, "Policy violation");
  } catch {
    // Ignore; ws may already be closed.
  }
}

function authenticateFromJwt(jwtSecret: string, token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    if (typeof decoded !== "object" || decoded === null) return null;
    const payload = decoded as Record<string, unknown>;
    const sub = typeof payload.sub === "string" ? payload.sub : undefined;
    const userType =
      payload.userType === "registered" || payload.userType === "subscriber" ? payload.userType : null;
    const tier = payload.tier === "free" || payload.tier === "premium" ? payload.tier : null;
    if (!sub || !userType || !tier) return null;

    // Mode is not derived from JWT; start as cruise (always legal) and let modeService govern transitions later.
    return { userId: sub, userType, tier, mode: "cruise" };
  } catch {
    return null;
  }
}

export function createWebsocketGateway(deps: WebsocketGatewayDeps): WebsocketGateway {
  const maxIncomingPayloadBytes = deps.maxIncomingPayloadBytes ?? DEFAULT_MAX_INCOMING_PAYLOAD_BYTES;
  const heartbeatTimeoutMs = deps.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
  const nowMs = deps.nowMs ?? (() => Date.now());

  if (!Number.isFinite(maxIncomingPayloadBytes) || maxIncomingPayloadBytes <= 0) {
    throw new Error("websocketGateway requires a positive maxIncomingPayloadBytes.");
  }
  if (!Number.isFinite(heartbeatTimeoutMs) || heartbeatTimeoutMs <= 0) {
    throw new Error("websocketGateway requires a positive heartbeatTimeoutMs.");
  }
  if (typeof deps.jwtSecret !== "string" || deps.jwtSecret.trim() === "") {
    throw new Error("websocketGateway requires a non-empty jwtSecret.");
  }

  const connections = new Set<WebSocket>();
  const authBySocket = new Map<WebSocket, AuthContext>();
  const lastHeartbeatBySocket = new Map<WebSocket, number>();

  function cleanup(ws: WebSocket): void {
    connections.delete(ws);
    authBySocket.delete(ws);
    lastHeartbeatBySocket.delete(ws);
  }

  function requireAuthenticated(ws: WebSocket): AuthContext | null {
    const auth = authBySocket.get(ws);
    return auth ?? null;
  }

  function handleAuth(ws: WebSocket, payload: unknown): void {
    if (!isAuthPayload(payload)) {
      sendError(ws, makeError("UNAUTHORIZED_ACTION", "Invalid auth payload."));
      closePolicy(ws);
      return;
    }

    const hasSessionToken = typeof payload.sessionToken === "string" && payload.sessionToken.trim() !== "";
    const hasJwt = typeof payload.jwt === "string" && payload.jwt.trim() !== "";

    if (!hasSessionToken && !hasJwt) {
      sendError(ws, makeError("INVALID_SESSION", "Missing credentials."));
      closePolicy(ws);
      return;
    }

    if (hasSessionToken) {
      const result = deps.authService.getSession(payload.sessionToken as string);
      if (!result.ok) {
        sendError(ws, result.error);
        closePolicy(ws);
        return;
      }
      const session = result.value;
      const auth: AuthContext = {
        sessionToken: session.sessionToken,
        userType: session.userType,
        tier: session.tier,
        mode: session.mode,
        userId: session.userId
      };
      authBySocket.set(ws, auth);
      lastHeartbeatBySocket.set(ws, nowMs());
      send(ws, "auth_ok", { userType: auth.userType, tier: auth.tier, mode: auth.mode });
      return;
    }

    const authFromJwt = authenticateFromJwt(deps.jwtSecret, payload.jwt as string);
    if (!authFromJwt) {
      sendError(ws, makeError("INVALID_SESSION", "Invalid credentials."));
      closePolicy(ws);
      return;
    }

    authBySocket.set(ws, authFromJwt);
    lastHeartbeatBySocket.set(ws, nowMs());
    send(ws, "auth_ok", { userType: authFromJwt.userType, tier: authFromJwt.tier, mode: authFromJwt.mode });
  }

  function handleEnvelope(ws: WebSocket, envelope: MessageEnvelope): void {
    if (envelope.type === "auth") {
      if (requireAuthenticated(ws)) {
        sendError(ws, makeError("UNAUTHORIZED_ACTION", "Already authenticated."));
        closePolicy(ws);
        return;
      }
      handleAuth(ws, envelope.payload);
      return;
    }

    const auth = requireAuthenticated(ws);
    if (!auth) {
      sendError(ws, makeError("INVALID_SESSION", "Authentication required."));
      closePolicy(ws);
      return;
    }

    if (envelope.type === "heartbeat") {
      lastHeartbeatBySocket.set(ws, nowMs());
      send(ws, "heartbeat_ok", { nowMs: nowMs() });
      return;
    }

    // Routing skeleton: only heartbeat is allowed until later steps add presence/chat/matching message types.
    sendError(ws, makeError("UNAUTHORIZED_ACTION", "Unknown message type.", { type: envelope.type }));
    closePolicy(ws);
  }

  deps.wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    connections.add(ws);

    ws.on("close", () => cleanup(ws));
    ws.on("error", () => cleanup(ws));

    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      if (buffer.byteLength > maxIncomingPayloadBytes) {
        sendError(ws, makeError("UNAUTHORIZED_ACTION", "Payload too large.", { maxBytes: maxIncomingPayloadBytes }));
        closePolicy(ws);
        return;
      }

      const text = buffer.toString("utf8");
      const parsed = safeJsonParse(text);
      if (!parsed.ok || !isEnvelope(parsed.value)) {
        sendError(ws, makeError("UNAUTHORIZED_ACTION", "Invalid message envelope."));
        closePolicy(ws);
        return;
      }

      handleEnvelope(ws, parsed.value);
    });
  });

  const heartbeatTimer = setInterval(() => {
    const now = nowMs();
    for (const ws of connections) {
      const auth = authBySocket.get(ws);
      if (!auth) continue;
      const last = lastHeartbeatBySocket.get(ws);
      if (typeof last !== "number") continue;
      if (now - last > heartbeatTimeoutMs) {
        sendError(ws, makeError("INVALID_SESSION", "Heartbeat timeout."));
        closePolicy(ws);
      }
    }
  }, Math.min(heartbeatTimeoutMs, 5_000));

  return {
    async close(): Promise<void> {
      clearInterval(heartbeatTimer);
      await new Promise<void>((resolve) => deps.wss.close(() => resolve()));
    },

    broadcast(type: string, payload: unknown): void {
      const message = JSON.stringify({ type, payload });
      const bytes = Buffer.byteLength(message, "utf8");
      if (bytes > DEFAULT_MAX_INCOMING_PAYLOAD_BYTES) {
        // Enforce the same 2kb budget on outgoing messages.
        throw new Error(`websocketGateway broadcast payload exceeds ${DEFAULT_MAX_INCOMING_PAYLOAD_BYTES} bytes.`);
      }

      for (const ws of connections) {
        if (ws.readyState !== ws.OPEN) continue;
        if (!authBySocket.has(ws)) continue;
        ws.send(message);
      }
    }
  };
}
