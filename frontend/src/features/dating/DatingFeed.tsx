import React, { useMemo, useState } from "react";

import type { DatingProfile, ServiceError } from "./dating.types";
import type { MatchEngine } from "./MatchEngine";
import placeholder1 from "../../assets/reddoor-placeholder-1.svg";
import placeholder2 from "../../assets/reddoor-placeholder-2.svg";
import placeholder3 from "../../assets/reddoor-placeholder-3.svg";

type UiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "match"; matchId?: string };

function formatDistance(profile: DatingProfile): string | null {
  if (!profile.distanceBucket) return null;
  return `Distance: ${profile.distanceBucket}`;
}

function placeholderForUser(userId: string): string {
  const sum = Array.from(userId).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pool = [placeholder1, placeholder2, placeholder3];
  return pool[Math.abs(sum) % pool.length];
}

export function DatingFeed({
  profiles,
  engine,
  favoriteUserIds,
  onToggleFavorite
}: Readonly<{
  profiles: ReadonlyArray<DatingProfile>;
  engine: MatchEngine;
  favoriteUserIds?: ReadonlySet<string>;
  onToggleFavorite?(userId: string): void;
}>): React.ReactElement {
  const [index, setIndex] = useState<number>(0);
  const [ui, setUi] = useState<UiState>({ kind: "idle" });

  const current = profiles[index] ?? null;
  const distance = useMemo(() => (current ? formatDistance(current) : null), [current]);

  async function swipe(direction: "like" | "pass"): Promise<void> {
    if (!current) return;
    setUi({ kind: "loading" });
    try {
      const result = await engine.swipe(current.id, direction);
      if (result.matchCreated) {
        setUi({ kind: "match", matchId: result.matchId });
        return;
      }
      setUi({ kind: "idle" });
      setIndex((i) => Math.min(profiles.length, i + 1));
    } catch (e) {
      const err = e as ServiceError;
      const message = typeof err?.message === "string" ? err.message : "Action rejected.";
      // Per docs/errors.md: display backend error messages verbatim.
      setUi({ kind: "error", message });
    }
  }

  return (
    <section
      aria-label="Dating feed"
      style={{
        background: "#000000",
        color: "#FFFFFF",
        fontFamily: "Montserrat, sans-serif",
        padding: 16,
        display: "grid",
        gap: 12,
        maxWidth: "90%",
        margin: "0 auto"
      }}
    >
      <header
        style={{
          display: "grid",
          gap: 4
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600 }}>DATE</div>
        <div style={{ fontSize: 14, color: "#AAAAAA" }}>Feed-based discovery. Realtime presence is disabled.</div>
      </header>

      {ui.kind === "error" ? (
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
            lineHeight: 1.4
          }}
        >
          {ui.message}
        </div>
      ) : null}

      {!current ? (
        <div
          style={{
            background: "#111111",
            border: "2px solid #C00000",
            borderRadius: 8,
            padding: 12,
            color: "#AAAAAA",
            fontSize: 14,
            lineHeight: 1.4
          }}
        >
          No more profiles.
        </div>
      ) : (
        <div
          style={{
            background: "#111111",
            border: "2px solid #C00000",
            borderRadius: 8,
            padding: 12,
            display: "grid",
            gap: 12
          }}
        >
          <div
            style={{
              background: "#222222",
              border: "2px solid #C00000",
              borderRadius: 8,
              aspectRatio: "1 / 1",
              display: "grid",
              alignContent: "end",
              padding: 12
            }}
            aria-label="Profile card"
          >
            <img
              src={placeholderForUser(current.id)}
              alt="Profile placeholder"
              style={{
                width: "100%",
                height: 220,
                objectFit: "cover",
                borderRadius: 10,
                marginBottom: 10,
                border: "1px solid rgba(255,255,255,0.1)"
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {current.displayName}
                {typeof current.age === "number" ? `, ${current.age}` : ""}
              </div>
              {onToggleFavorite ? (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(current.id)}
                  aria-label={favoriteUserIds?.has(current.id) ? "Unfavorite user" : "Favorite user"}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: favoriteUserIds?.has(current.id) ? "#4DA3FF" : "#8AA9D6",
                    fontSize: 24,
                    lineHeight: 1,
                    cursor: "pointer"
                  }}
                >
                  {favoriteUserIds?.has(current.id) ? "★" : "☆"}
                </button>
              ) : null}
            </div>
            {distance ? <div style={{ fontSize: 14, color: "#AAAAAA" }}>{distance}</div> : null}
            {current.race ? <div style={{ fontSize: 12, color: "#BFC7D8" }}>Race: {current.race}</div> : null}
            {typeof current.heightInches === "number" ? <div style={{ fontSize: 12, color: "#BFC7D8" }}>Height: {current.heightInches} in</div> : null}
            {typeof current.weightLbs === "number" ? <div style={{ fontSize: 12, color: "#BFC7D8" }}>Weight: {current.weightLbs} lbs</div> : null}
            {typeof current.cockSizeInches === "number" ? <div style={{ fontSize: 12, color: "#BFC7D8" }}>Cock Size: {current.cockSizeInches} in</div> : null}
            {current.cutStatus ? <div style={{ fontSize: 12, color: "#BFC7D8" }}>Cut Status: {current.cutStatus}</div> : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button
              type="button"
              onClick={() => void swipe("pass")}
              disabled={ui.kind === "loading"}
              style={{
                background: "transparent",
                border: "2px solid #C00000",
                color: "#C00000",
                padding: "10px 20px",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: ui.kind === "loading" ? "not-allowed" : "pointer"
              }}
              aria-label="Pass"
            >
              PASS
            </button>
            <button
              type="button"
              onClick={() => void swipe("like")}
              disabled={ui.kind === "loading"}
              style={{
                background: "#C00000",
                border: "2px solid #C00000",
                color: "#FFFFFF",
                padding: "10px 20px",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: ui.kind === "loading" ? "not-allowed" : "pointer"
              }}
              aria-label="Like"
            >
              LIKE
            </button>
          </div>

          {ui.kind === "match" ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                background: "#111111",
                border: "2px solid #C00000",
                borderRadius: 8,
                padding: 12,
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.4
              }}
            >
              MATCH CREATED{ui.matchId ? `: ${ui.matchId}` : ""}.
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
