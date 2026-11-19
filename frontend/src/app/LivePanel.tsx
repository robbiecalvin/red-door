import React, { useContext, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import type { apiClient, Session } from "./api";
import { LiveContext } from "./liveState";

type Api = ReturnType<typeof apiClient>;
type Ticket = { id: string; url: string; token: string; expiresAt: number };
type Connection = { id: string; host: boolean; room: Room };

export function LivePanel({ api, session }: { api: Api; session: Session }) {
  const { enabled, broadcasts } = useContext(LiveContext);
  const current = useRef<Connection | null>(null);
  const mounted = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<{ id: string; host: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reportId, setReportId] = useState("");
  const [reason, setReason] = useState("");
  const token = session.sessionToken;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const connection = current.current;
      current.current = null;
      if (!connection) return;
      void connection.room.disconnect().catch(() => {});
      if (connection.host) void api.memberRequest(token, `/live/${connection.id}`, undefined, "DELETE").catch(() => {});
    };
  }, [api, token]);

  async function connect(watchId?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    const host = !watchId;
    let ticket: Ticket | undefined;
    let room: Room | undefined;
    try {
      const { Room, RoomEvent, Track, VideoPresets } = await import("livekit-client");
      if (!mounted.current) return;
      ticket = await api.memberRequest<Ticket>(token, watchId ? `/live/${watchId}/watch` : "/live", {});
      if (!mounted.current) return;
      room = new Room({
        adaptiveStream: true,
        videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
        publishDefaults: { simulcast: false, videoEncoding: { maxBitrate: 500_000, maxFramerate: 24 } }
      });
      const id = ticket.id;
      current.current = { id, host, room };
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind === Track.Kind.Video && video.current) track.attach(video.current);
        if (track.kind === Track.Kind.Audio && audio.current) track.attach(audio.current);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => track.detach());
      room.on(RoomEvent.LocalTrackPublished, publication => {
        if (publication.source === Track.Source.Camera && video.current) publication.track?.attach(video.current);
      });
      room.on(RoomEvent.Reconnecting, () => { if (current.current?.room === room) setNotice("Reconnecting…"); });
      room.on(RoomEvent.Reconnected, () => { if (current.current?.room === room) setNotice(""); });
      room.on(RoomEvent.Disconnected, () => {
        if (current.current?.room !== room) return;
        current.current = null;
        setPlaying(null);
        setNotice("Broadcast ended or the connection was lost.");
        if (host) void api.memberRequest(token, `/live/${id}`, undefined, "DELETE").catch(() => {});
      });
      await room.connect(ticket.url, ticket.token);
      if (!mounted.current || current.current?.room !== room) return;
      if (host) await room.localParticipant.enableCameraAndMicrophone();
      if (mounted.current && current.current?.room === room) setPlaying({ id, host });
    } catch (cause) {
      if (current.current?.room === room) current.current = null;
      if (mounted.current) {
        const message = (cause as { message?: string } | null)?.message;
        setError(message || "Couldn’t connect to the broadcast.");
      }
    } finally {
      if (!mounted.current || current.current?.room !== room) {
        if (room) void room.disconnect().catch(() => {});
        if (host && ticket) void api.memberRequest(token, `/live/${ticket.id}`, undefined, "DELETE").catch(() => {});
      }
      if (mounted.current) setBusy(false);
    }
  }

  async function leave() {
    const connection = current.current;
    if (!connection) return;
    current.current = null;
    setPlaying(null);
    setNotice("");
    await connection.room.disconnect().catch(() => {});
    if (connection.host) {
      await api.memberRequest(token, `/live/${connection.id}`, undefined, "DELETE")
        .catch(() => setError("The camera is off. The server will clear the broadcast shortly."));
    }
  }

  return <section className="rd-card rd-live-panel">
    <h1>Live</h1>
    {enabled ? <>
      <div hidden={!playing} className="rd-live-video">
        <video ref={video} playsInline autoPlay muted />
        <audio ref={audio} autoPlay />
      </div>
      {playing ? <div className="rd-row">
        <button className="rd-btn" onClick={() => void leave()}>{playing.host ? "End broadcast" : "Stop watching"}</button>
        {!playing.host ? <>
          <button className="rd-btn" onClick={() => void current.current?.room.startAudio().catch(() => setError("Audio could not start."))}>Enable audio</button>
          <button className="rd-btn" onClick={() => { setReason(""); setReportId(playing.id); }}>Report broadcast</button>
        </> : null}
      </div> : <button className="rd-btn primary" disabled={busy} onClick={() => void connect()}>
        {busy ? "Connecting…" : "Start broadcast"}
      </button>}
      {reportId ? <form onSubmit={event => {
        event.preventDefault();
        const id = reportId;
        setBusy(true);
        setError("");
        void api.memberRequest(token, `/live/${id}/report`, { reason })
          .then(() => { setReportId(""); setNotice("Report sent for review."); })
          .catch(cause => setError(cause.message || "Couldn’t send the report."))
          .finally(() => setBusy(false));
      }}>
        <label className="rd-field"><span>Report reason</span><textarea className="rd-input" required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="rd-row"><button className="rd-btn primary" disabled={busy}>Send report</button><button type="button" className="rd-btn" onClick={() => setReportId("")}>Cancel</button></div>
      </form> : null}
      <h2>On now</h2>
      {broadcasts.length ? <ul className="rd-live-list">{broadcasts.map(item => <li key={item.id}>
        <strong>{item.label}</strong>
        {item.live && item.hostId !== session.userId ? <button className="rd-btn" disabled={busy || Boolean(playing)} onClick={() => void connect(item.id)}>Watch</button> : null}
        {session.role === "admin" ? <button className="rd-btn" onClick={() => {
          void api.memberRequest(token, `/admin/live/${item.id}`, undefined, "DELETE")
            .then(() => setNotice("Broadcast ended.")).catch(cause => setError(cause.message || "Couldn’t end the broadcast."));
        }}>End as admin</button> : null}
      </li>)}</ul> : <p>No broadcasts right now.</p>}
    </> : <p>Live is currently unavailable.</p>}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert" className="rd-error">{error}</p> : null}
  </section>;
}
