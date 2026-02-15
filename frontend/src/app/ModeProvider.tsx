import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Mode = "cruise" | "date" | "hybrid";

export type ServiceError = {
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

export type BackendModeState = Readonly<{
  mode: Mode;
  userType: "guest" | "registered" | "subscriber";
}>;

export type ModeApiClient = Readonly<{
  getCurrentMode(): Promise<BackendModeState>;
  setMode(mode: Mode): Promise<BackendModeState>;
}>;

type ModeContextValue = Readonly<{
  backendState: BackendModeState | null;
  lastError: ServiceError | null;
  refresh(): Promise<void>;
  requestModeChange(mode: Mode): Promise<void>;
}>;

const ModeContext = createContext<ModeContextValue | null>(null);

export function useMode(): ModeContextValue {
  const value = useContext(ModeContext);
  if (value === null) {
    throw new Error("useMode must be used within ModeProvider.");
  }
  return value;
}

export function ModeProvider({
  client,
  children
}: Readonly<{
  client: ModeApiClient;
  children: React.ReactNode;
}>): React.ReactElement {
  const [backendState, setBackendState] = useState<BackendModeState | null>(null);
  const [lastError, setLastError] = useState<ServiceError | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const state = await client.getCurrentMode();
      setBackendState(state);
      setLastError(null);
    } catch (err) {
      const error = err as ServiceError;
      setLastError(error);
      // Frontend is not allowed to infer a new mode; keep last known backendState.
      throw err;
    }
  }, [client]);

  const requestModeChange = useCallback(
    async (mode: Mode): Promise<void> => {
      try {
        const state = await client.setMode(mode);
        setBackendState(state);
        setLastError(null);
      } catch (err) {
        const error = err as ServiceError;
        setLastError(error);
        // Do not optimistically change UI state; backend is authoritative.
        throw err;
      }
    },
    [client]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: ModeContextValue = useMemo(
    () => ({
      backendState,
      lastError,
      refresh,
      requestModeChange
    }),
    [backendState, lastError, refresh, requestModeChange]
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
