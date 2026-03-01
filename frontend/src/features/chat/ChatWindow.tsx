import React, { useEffect, useMemo, useRef, useState } from "react";

import type { ChatKind, ChatMediaAttachment, ChatMessage, ServiceError } from "./chat.types";

const FIRE_SIGNAL_TEXT = "FIRE_SIGNAL|1";

export type ChatApiClient = Readonly<{
  sendMessage(chatKind: ChatKind, toKey: string, text: string, media?: ChatMediaAttachment): Promise<ChatMessage>;
  initiateMediaUpload(mimeType: string, sizeBytes: number): Promise<{ objectKey: string; uploadUrl: string }>;
  uploadToSignedUrl(uploadUrl: string, file: Blob, mimeType: string): Promise<void>;
  getMediaUrl(objectKey: string): Promise<string>;
}>;

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseLocationPayload(text: string): { lat: number; lng: number; link: string } | null {
  if (!text.startsWith("LOCATION|")) return null;
  const [, latRaw, lngRaw] = text.split("|");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, link: `https://maps.google.com/?q=${lat},${lng}` };
}

function displayMessageText(text: string): string {
  return text.trim() === FIRE_SIGNAL_TEXT ? "🔥 I'm into you" : text;
}

function fallbackAuthorLabel(actorKey: string): string {
  const trimmed = actorKey.trim();
  if (trimmed.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    return id ? `User ${id.slice(0, 8)}` : "User";
  }
  if (trimmed.startsWith("session:")) {
    const id = trimmed.slice("session:".length).trim();
    return id ? `Guest ${id.slice(0, 6)}` : "Guest";
  }
  if (trimmed.startsWith("spot:")) {
    return "Spot";
  }
  return trimmed || "Member";
}

export function ChatWindow({
  chatKind,
  peerKey,
  currentUserKey,
  messages,
  client,
  title,
  peerSummary,
  thirdParty,
  edgeToEdge,
  showHeader,
  fillHeight,
  presentation,
  authorLabelForKey
}: Readonly<{
  chatKind: ChatKind;
  peerKey: string;
  currentUserKey: string;
  messages: ReadonlyArray<ChatMessage>;
  client: ChatApiClient;
  title: string;
  peerSummary?: Readonly<{ displayName: string; avatarUrl?: string }>;
  thirdParty?: Readonly<{
    candidates: ReadonlyArray<{ key: string; label: string }>;
    selectedKey: string;
    onSelect(key: string): void;
    onAdd(): void;
    disabled?: boolean;
  }>;
  edgeToEdge?: boolean;
  showHeader?: boolean;
  fillHeight?: boolean;
  presentation?: "chat" | "board";
  authorLabelForKey?: (actorKey: string) => string;
}>): React.ReactElement {
  const [draft, setDraft] = useState<string>("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [mediaUrlsByKey, setMediaUrlsByKey] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<boolean>(false);
  const [actionsOpen, setActionsOpen] = useState<boolean>(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const isEdgeToEdge = edgeToEdge === true;
  const headerVisible = showHeader !== false;
  const fixedComposer = isEdgeToEdge && fillHeight === true;
  const boardMode = presentation === "board";

  const sorted = useMemo(() => [...messages].sort((a, b) => a.createdAtMs - b.createdAtMs), [messages]);
  const mediaObjectKeys = useMemo(
    () =>
      Array.from(
        new Set(
          sorted
            .map((m) => m.media?.objectKey)
            .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        )
      ),
    [sorted]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadMissingMediaUrls(): Promise<void> {
      for (const key of mediaObjectKeys) {
        if (cancelled) return;
        if (mediaUrlsByKey[key]) continue;
        try {
          const url = await client.getMediaUrl(key);
          if (cancelled) return;
          setMediaUrlsByKey((prev) => ({ ...prev, [key]: url }));
        } catch {
          // Keep message visible even if media URL resolution fails.
        }
      }
    }
    void loadMissingMediaUrls();
    return () => {
      cancelled = true;
    };
  }, [client, mediaObjectKeys, mediaUrlsByKey]);

  async function onSend(media?: ChatMediaAttachment): Promise<void> {
    const text = draft.trim();
    if (text.length === 0 && !media) return;
    setSending(true);
    setLastError(null);
    try {
      await client.sendMessage(chatKind, peerKey, text, media);
      setDraft("");
    } catch (e) {
      const err = e as ServiceError;
      setLastError(typeof err?.message === "string" ? err.message : "Message rejected.");
    } finally {
      setSending(false);
    }
  }

  async function sendSelectedFile(file: File): Promise<void> {
    setSending(true);
    setLastError(null);
    try {
      const init = await client.initiateMediaUpload(file.type || "application/octet-stream", file.size);
      await client.uploadToSignedUrl(init.uploadUrl, file, file.type || "application/octet-stream");
      const kind: ChatMediaAttachment["kind"] = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "audio";
      const media: ChatMediaAttachment = {
        kind,
        objectKey: init.objectKey,
        mimeType: file.type || "application/octet-stream"
      };
      await onSend(media);
    } catch (e) {
      const err = e as ServiceError;
      setLastError(typeof err?.message === "string" ? err.message : "Upload rejected.");
      setSending(false);
    }
  }

  async function onAttachFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      setLastError("Only image, video, or audio files are supported.");
      return;
    }
    await sendSelectedFile(file);
  }

  async function toggleVoiceRecording(): Promise<void> {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setLastError("Microphone is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (evt: BlobEvent) => {
        if (evt.data.size > 0) recordChunksRef.current.push(evt.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: recorder.mimeType || "audio/webm" });
        void sendSelectedFile(file);
        for (const track of stream.getTracks()) track.stop();
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (e) {
      const err = e as ServiceError;
      setLastError(typeof err?.message === "string" ? err.message : "Unable to record voice.");
      setRecording(false);
    }
  }

  async function sendLocation(): Promise<void> {
    if (!navigator.geolocation) {
      setLastError("Geolocation is not available in this browser.");
      return;
    }
    setSending(true);
    setLastError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 });
      });
      const lat = Number(pos.coords.latitude.toFixed(5));
      const lng = Number(pos.coords.longitude.toFixed(5));
      const text = `LOCATION|${lat}|${lng}`;
      await client.sendMessage(chatKind, peerKey, text);
    } catch (e) {
      const err = e as ServiceError;
      setLastError(typeof err?.message === "string" ? err.message : "Unable to send location.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-label="Chat"
      style={{
        background: isEdgeToEdge ? "transparent" : "#000000",
        color: "#FFFFFF",
        fontFamily: "Montserrat, sans-serif",
        padding: isEdgeToEdge ? 0 : 16,
        display: "grid",
        gap: isEdgeToEdge ? 0 : 12,
        gridTemplateRows: headerVisible ? "auto auto 1fr auto" : "1fr auto",
        minHeight: fillHeight ? "calc(100dvh - 196px)" : undefined
      }}
    >
      {headerVisible ? (
        <header
          style={{
            height: 56,
            display: "grid",
            alignItems: "center",
            background: "#000000"
          }}
        >
          <div style={{ textAlign: "center", fontSize: 20, fontWeight: 600 }}>{title}</div>
          {peerSummary ? (
            <div
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "#b7d8e0",
                fontSize: 13
              }}
            >
              <span>Chat with:</span>
              {peerSummary.avatarUrl ? (
                <img
                  src={peerSummary.avatarUrl}
                  alt={`${peerSummary.displayName} avatar`}
                  style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(38,213,255,0.8)" }}
                />
              ) : (
                <span
                  aria-hidden
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "1px solid rgba(38,213,255,0.8)",
                    background: "rgba(255,255,255,0.08)"
                  }}
                />
              )}
              <span style={{ color: "#fff", fontWeight: 600 }}>{peerSummary.displayName}</span>
            </div>
          ) : null}
          <div style={{ textAlign: "center", fontSize: 12, color: "#AAAAAA" }}>
            {chatKind === "cruise" ? "CRUISE CHAT (EPHEMERAL)" : "DATE CHAT (PERSISTENT)"}
          </div>
        </header>
      ) : null}

      {lastError ? (
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
          {lastError}
        </div>
      ) : null}

      <div
        aria-label="Messages"
        style={{
          background: isEdgeToEdge ? "#09090b" : "#111111",
          border: isEdgeToEdge ? "none" : "2px solid #C00000",
          borderRadius: isEdgeToEdge ? 0 : 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: isEdgeToEdge ? 0 : 320,
          paddingBottom: fixedComposer ? 148 : 12,
          overflowY: "auto"
        }}
      >
        {sorted.length === 0 ? (
          <div style={{ color: "#AAAAAA", fontSize: 14, lineHeight: 1.4 }}>{boardMode ? "No posts yet." : "No messages."}</div>
        ) : (
          sorted.map((m) => {
            const mine = m.fromKey === currentUserKey;
            const bubbleBg = boardMode ? "rgba(22,22,28,0.96)" : mine ? "#C00000" : "#444444";
            const rowAlign: React.CSSProperties = boardMode ? { alignItems: "stretch" } : mine ? { alignItems: "flex-end" } : { alignItems: "flex-start" };
            const author = authorLabelForKey ? authorLabelForKey(m.fromKey) : fallbackAuthorLabel(m.fromKey);
            return (
              <div key={m.messageId} style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", ...rowAlign }}>
                {boardMode ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: "#cfd4de", fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: "#ffffff" }}>{author}</span>
                    <span>{new Date(m.createdAtMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                ) : null}
                {(() => {
                  const location = parseLocationPayload(m.text ?? "");
                  if (!location) return null;
                  return (
                    <a
                      href={location.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "grid",
                        gap: 6,
                        textDecoration: "none",
                        color: "#fff",
                        background: bubbleBg,
                        borderRadius: boardMode ? 12 : 14,
                        border: boardMode ? "1px solid rgba(255,255,255,0.08)" : "none",
                        padding: 8,
                        width: "auto",
                        maxWidth: boardMode ? "100%" : "80%"
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#d8ecff" }}>Shared location</div>
                      <iframe
                        title="Google Maps location preview"
                        src={`https://www.google.com/maps?q=${location.lat},${location.lng}&z=14&output=embed`}
                        style={{ width: "100%", height: 140, border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10 }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <div style={{ fontSize: 12, color: "#3fdfff" }}>Open in Google Maps</div>
                    </a>
                  );
                })()}
                <div
                  style={{
                    background: bubbleBg,
                    color: "#FFFFFF",
                    borderRadius: boardMode ? 12 : 18,
                    border: boardMode ? "1px solid rgba(255,255,255,0.08)" : "none",
                    padding: boardMode ? "10px 12px" : "8px 12px",
                    width: "auto",
                    maxWidth: boardMode ? "100%" : "80%",
                    fontSize: boardMode ? 15 : 16,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word"
                  }}
                >
                  {m.text && !parseLocationPayload(m.text) ? <div style={{ marginBottom: m.media ? 8 : 0 }}>{displayMessageText(m.text)}</div> : null}
                  {m.media ? (
                    <div>
                      {m.media.kind === "image" ? (
                        <img
                          src={mediaUrlsByKey[m.media.objectKey]}
                          alt="Shared"
                          style={{ width: "100%", maxWidth: 260, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)" }}
                        />
                      ) : null}
                      {m.media.kind === "video" ? (
                        <video
                          controls
                          playsInline
                          src={mediaUrlsByKey[m.media.objectKey]}
                          style={{ width: "100%", maxWidth: 320, borderRadius: 10, background: "#000" }}
                        />
                      ) : null}
                      {m.media.kind === "audio" ? (
                        <audio controls src={mediaUrlsByKey[m.media.objectKey]} style={{ width: "100%", maxWidth: 260 }} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {!boardMode ? <div style={{ fontSize: 10, color: "#AAAAAA" }}>{formatTime(m.createdAtMs)}</div> : null}
                {mine && !boardMode ? (
                  <div style={{ fontSize: 10, color: "#6fdcff" }}>
                    {typeof m.readAtMs === "number" ? "Read" : typeof m.deliveredAtMs === "number" ? "Delivered" : ""}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
        aria-label="Message input"
        style={{
          background: isEdgeToEdge ? "linear-gradient(180deg, rgba(96,0,12,0.96), rgba(58,0,8,0.98))" : "#111111",
          border: isEdgeToEdge ? "none" : "2px solid #C00000",
          borderRadius: isEdgeToEdge ? 0 : 8,
          padding: 12,
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 12,
          alignItems: "start",
          position: fixedComposer ? "fixed" : "static",
          left: fixedComposer ? 0 : undefined,
          right: fixedComposer ? 0 : undefined,
          bottom: fixedComposer ? "calc(env(safe-area-inset-bottom, 0px) + 66px)" : undefined,
          zIndex: fixedComposer ? 45 : undefined
        }}
      >
        <label style={{ display: "grid" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message"
            disabled={sending}
            style={{
              width: "100%",
              background: "#111111",
              color: "#FFFFFF",
              border: "2px solid #444444",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 16,
              lineHeight: 1.4,
              outline: "none"
            }}
            aria-label={boardMode ? "Write a post" : "Message text"}
          />
        </label>
        <div style={{ position: "relative" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            disabled={sending}
            onChange={(e) => void onAttachFile(e)}
            style={{ display: "none" }}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={sending}
            onChange={(e) => void onAttachFile(e)}
            style={{ display: "none" }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            disabled={sending}
            onChange={(e) => void onAttachFile(e)}
            style={{ display: "none" }}
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => setActionsOpen((v) => !v)}
            style={{
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "8px 10px",
              display: "grid",
              placeItems: "center",
              cursor: sending ? "not-allowed" : "pointer",
              color: "#3fdfff",
              fontWeight: 700,
              height: 44,
              minWidth: 44
            }}
            aria-label="More actions"
          >
            +
          </button>
          {actionsOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: fixedComposer ? undefined : 48,
                bottom: fixedComposer ? 48 : undefined,
                zIndex: 5,
                minWidth: 220,
                display: "grid",
                gap: 8,
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(255,58,77,0.5)",
                background: "rgba(10,11,16,0.98)"
              }}
            >
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setActionsOpen(false);
                  photoInputRef.current?.click();
                }}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#3fdfff",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                Take Photo
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setActionsOpen(false);
                  videoInputRef.current?.click();
                }}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#3fdfff",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                Record Video
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setActionsOpen(false);
                  fileInputRef.current?.click();
                }}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#3fdfff",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                Choose Media
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setActionsOpen(false);
                  void toggleVoiceRecording();
                }}
                style={{
                  background: recording ? "#ff2136" : "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                {recording ? "Stop Voice" : "Record Voice"}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setActionsOpen(false);
                  void sendLocation();
                }}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#3fdfff",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                Send Location
              </button>
              {thirdParty ? (
                <div style={{ display: "grid", gap: 8, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8 }}>
                  <select
                    value={thirdParty.selectedKey}
                    onChange={(e) => thirdParty.onSelect(e.target.value)}
                    disabled={thirdParty.disabled || thirdParty.candidates.length === 0}
                    style={{
                      background: "#0b0d12",
                      color: "#fff",
                      border: "1px solid rgba(255,58,77,0.62)",
                      borderRadius: 10,
                      padding: "8px 10px"
                    }}
                    aria-label="Add previous contact to group"
                  >
                    {thirdParty.candidates.length === 0 ? <option value="">No previous contacts</option> : null}
                    {thirdParty.candidates.map((candidate) => (
                      <option key={candidate.key} value={candidate.key}>
                        {candidate.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      thirdParty.onAdd();
                      setActionsOpen(false);
                    }}
                    disabled={thirdParty.disabled || thirdParty.candidates.length === 0 || !thirdParty.selectedKey}
                    style={{
                      background: "rgba(0,0,0,0.6)",
                      color: "#3fdfff",
                      border: "1px solid rgba(255,58,77,0.62)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontWeight: 700
                    }}
                  >
                    Add Third User
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={sending}
          style={{
            background: sending ? "#333333" : "#C00000",
            color: sending ? "#777777" : "#FFFFFF",
            border: "2px solid #C00000",
            borderRadius: 8,
            padding: "10px 20px",
            fontSize: 16,
            fontWeight: 600,
            cursor: sending ? "not-allowed" : "pointer",
            height: 44
          }}
          aria-label={boardMode ? "Post message" : "Send message"}
        >
          {boardMode ? "POST" : "SEND"}
        </button>
      </form>
    </section>
  );
}
