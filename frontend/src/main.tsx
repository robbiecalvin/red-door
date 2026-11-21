import React from "react";
import { createRoot } from "react-dom/client";

import { PwaProvider } from "./app/Pwa";
import { App } from "./app/App";
import "./app/styles.css";
import "./app/refresh.css";
import "./app/polish.css";
import "./app/plus-experience.css";
import "./app/community.css";
import "./app/discovery-ui.css";
import "./features/map/map.css";
import "maplibre-gl/dist/maplibre-gl.css";

type ErrorBoundaryState = Readonly<{ error: Error | null }>;

class ErrorBoundary extends React.Component<Readonly<{ children: React.ReactNode }>, ErrorBoundaryState> {
  public constructor(props: Readonly<{ children: React.ReactNode }>) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  private reloadApp(): void {
    const url = new URL(window.location.href);
    url.searchParams.set("_reload", Date.now().toString());
    window.location.replace(url);
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
          <div style={{ fontSize: 24, fontWeight: 700, textAlign: "center" }}>Badehaus X</div>
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
            <p>Badehaus X couldn’t load. Reload to get the latest version.</p>
            <button type="button" className="rd-btn" onClick={this.reloadApp}>Reload Badehaus X</button>
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
      <PwaProvider><App /></PwaProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
