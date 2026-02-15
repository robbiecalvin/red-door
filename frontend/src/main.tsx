import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./app/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource/monoton/400.css";
import "@fontsource/rajdhani/400.css";
import "@fontsource/rajdhani/600.css";

type ErrorBoundaryState = Readonly<{ error: Error | null }>;

class ErrorBoundary extends React.Component<Readonly<{ children: React.ReactNode }>, ErrorBoundaryState> {
  public constructor(props: Readonly<{ children: React.ReactNode }>) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100%",
            background: "#000000",
            color: "#FFFFFF",
            fontFamily: "var(--ui)",
            padding: 16,
            display: "grid",
            gap: 12
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, textAlign: "center" }}>DUALMODE</div>
          <div
            role="alert"
            aria-live="polite"
            style={{
              background: "#111111",
              border: "2px solid #C00000",
              borderRadius: 8,
              padding: 12,
              color: "#F22F2F",
              fontSize: 14,
              lineHeight: 1.4,
              whiteSpace: "pre-wrap"
            }}
          >
            {this.state.error.name}: {this.state.error.message}
            {"\n"}
            {this.state.error.stack ?? ""}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const el = document.getElementById("root");
if (!el) {
  throw new Error("Missing #root element.");
}

createRoot(el).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
