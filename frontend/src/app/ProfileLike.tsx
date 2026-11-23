import React, { useEffect, useState } from "react";
import type { apiClient } from "./api";
import eggplant from "../assets/interface/eggplant.webp";
import selected from "../assets/interface/eggplantsselected.webp";

export function ProfileLike({ api, token, userId, own }: {
  api: ReturnType<typeof apiClient>; token: string; userId: string; own: boolean;
}) {
  type State = { count: number; liked: boolean };
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const route = `/profile/${encodeURIComponent(userId)}/likes`;
  useEffect(() => {
    let active = true;
    setState(null);
    setError(false);
    void api.memberRequest<State>(token, route).then(next => {
      if (active) setState(next);
    }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [api, token, route]);
  if (!state) return error ? <span className="rd-caption">Likes unavailable</span> : null;
  const text = `${state.count} profile ${state.count === 1 ? "like" : "likes"}`;
  if (own) return <p className="rd-profile-like"><img src={eggplant} alt="" /> {text}</p>;
  return <div>
    <button type="button" className="rd-btn rd-profile-like" aria-pressed={state.liked}
      aria-label={`${state.liked ? "Unlike" : "Like"} profile, ${text}`} disabled={busy} onClick={async () => {
        setBusy(true);
        setError(false);
        try { setState(await api.memberRequest<State>(token, route, { liked: !state.liked }, "PUT")); }
        catch { setError(true); }
        finally { setBusy(false); }
      }}>
      <img src={state.liked ? selected : eggplant} alt="" /> <span>{state.count}</span>
    </button>
    {error && <span role="status" className="rd-caption">Couldn’t update like.</span>}
  </div>;
}
