import { createContext, useEffect, useState } from "react";
import type { apiClient, Session } from "./api";

export type Broadcast = { id: string; hostId: string; label: string; live: boolean };
type LiveState = { enabled: boolean; broadcasts: Broadcast[] };
const disabled: LiveState = { enabled: false, broadcasts: [] };
export const LiveContext = createContext(disabled);

export function useLiveState(api: ReturnType<typeof apiClient>, session: Session | null) {
  const token = session?.userId && session.ageVerified ? session.sessionToken : "";
  const [result, setResult] = useState({ token: "", state: disabled });

  useEffect(() => {
    if (!token) return;
    let active = true;
    let timer: number;
    async function refresh() {
      try {
        const state = await api.memberRequest<LiveState>(token, "/live");
        if (!active) return;
        setResult({ token, state });
        if (state.enabled) timer = window.setTimeout(() => void refresh(), 5000);
      } catch {
        if (active) timer = window.setTimeout(() => void refresh(), 30_000);
      }
    }
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, token]);

  return token && result.token === token ? result.state : disabled;
}
