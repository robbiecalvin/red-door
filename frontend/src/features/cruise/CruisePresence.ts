import { useEffect, useMemo, useRef, useState } from "react";

import type { CruisePresenceKey, CruisePresenceState, CruisePresenceUpdate } from "./cruise.types";

export type WsEnvelope = Readonly<{
  type: string;
  payload?: unknown;
}>;

export type CruisePresenceOptions = Readonly<{
  wsUrl: string;
  sessionToken?: string;
  jwt?: string;
  disabled?: boolean;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresenceUpdate(payload: unknown): payload is CruisePresenceUpdate {
  if (!isObject(payload)) return false;
  if (typeof payload.key !== "string") return false;
  if (payload.userType !== "guest" && payload.userType !== "registered" && payload.userType !== "subscriber") {
    return false;
  }
  if (typeof payload.lat !== "number" || !Number.isFinite(payload.lat)) return false;
  if (typeof payload.lng !== "number" || !Number.isFinite(payload.lng)) return false;
  if (typeof payload.updatedAtMs !== "number" || !Number.isFinite(payload.updatedAtMs)) return false;
  if (payload.status !== undefined && typeof payload.status !== "string") return false;
  return true;
}

export function useCruisePresence(options: CruisePresenceOptions): Readonly<{
  state: CruisePresenceState;
  lastErrorMessage: string | null;
}> {
  const [byKey, setByKey] = useState<ReadonlyMap<CruisePresenceKey, CruisePresenceUpdate>>(() => new Map());
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (options.disabled === true) {
      setByKey(new Map());
      setLastErrorMessage(null);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }
    let stopped = false;
    let consecutiveFailures = 0;
    let heartbeat: number | null = null;

    const clearHeartbeat = (): void => {
      if (heartbeat !== null) {
        window.clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    const scheduleReconnect = (): void => {
      if (stopped) return;
      const delay = Math.min(8_000, 500 * 2 ** Math.min(consecutiveFailures, 4));
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    const connect = (): void => {
      if (stopped) return;
      const ws = new WebSocket(options.wsUrl);
      wsRef.current = ws;
      let didOpen = false;

      ws.onopen = () => {
        didOpen = true;
        consecutiveFailures = 0;
        setLastErrorMessage(null);
        const payload: Record<string, unknown> = {};
        if (options.sessionToken) payload.sessionToken = options.sessionToken;
        if (options.jwt) payload.jwt = options.jwt;
        ws.send(JSON.stringify({ type: "auth", payload }));

        heartbeat = window.setInterval(() => {
          if (ws.readyState !== ws.OPEN) return;
          ws.send(JSON.stringify({ type: "heartbeat", payload: {} }));
        }, 15_000);
      };

      ws.onmessage = (event) => {
        const parsed = (() => {
          try {
            return JSON.parse(String(event.data)) as WsEnvelope;
          } catch {
            return null;
          }
        })();

        if (!parsed || typeof parsed.type !== "string") {
          setLastErrorMessage("Invalid server message.");
          return;
        }

        if (parsed.type === "error" && isObject(parsed.payload) && typeof parsed.payload.message === "string") {
          // Per docs/errors.md + frontend authority: display verbatim.
          setLastErrorMessage(parsed.payload.message);
          return;
        }

        if (parsed.type === "presence_update") {
          const payload = parsed.payload;
          if (!isPresenceUpdate(payload)) {
            setLastErrorMessage("Invalid presence payload.");
            return;
          }

          setByKey((prev) => {
            const next = new Map(prev);
            next.set(payload.key, payload);
            return next;
          });
        }
      };

      ws.onerror = () => {
        // Some browsers emit onerror before onclose without details.
      };

      ws.onclose = (evt) => {
        clearHeartbeat();
        if (stopped) return;

        if (evt.code !== 1000) {
          consecutiveFailures += 1;
          const reason = typeof evt.reason === "string" && evt.reason.trim() !== "" ? ` Reason: ${evt.reason}` : "";
          if (consecutiveFailures >= 2 || didOpen) {
            const phase = didOpen ? "disconnected" : "failed to connect";
            setLastErrorMessage(`Realtime ${phase} (code ${evt.code}). Reconnecting...${reason}`);
          }
          scheduleReconnect();
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      clearHeartbeat();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close(1000, "Client cleanup");
      wsRef.current = null;
    };
  }, [options.disabled, options.jwt, options.sessionToken, options.wsUrl]);

  const state: CruisePresenceState = useMemo(() => ({ byKey }), [byKey]);

  return { state, lastErrorMessage };
}
