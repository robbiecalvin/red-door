import React, { useState } from "react";
export const NOTIFICATION_ENABLED = "reddoor:notifications:enabled";
export const NOTIFICATION_DISCREET = "reddoor:notifications:discreet";
function read(key: string, fallback: boolean) { try { const value = localStorage.getItem(key); return value === null ? fallback : value === "true"; } catch { return fallback; } }
export function NotificationSettings(): React.ReactElement {
  const [enabled, setEnabled] = useState(() => read(NOTIFICATION_ENABLED, false));
  const [discreet, setDiscreet] = useState(() => read(NOTIFICATION_DISCREET, true));
  const [message, setMessage] = useState("");
  const supported = typeof Notification !== "undefined";
  function save(key: string, value: boolean) { try { localStorage.setItem(key, String(value)); window.dispatchEvent(new Event("rd:notification-preference")); } catch { setMessage("Your browser could not save this preference."); } }
  async function enable() {
    if (!supported) return;
    try { const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "granted") { setEnabled(true); save(NOTIFICATION_ENABLED, true); setMessage("Notifications enabled for this browser."); }
      else setMessage("Notifications are blocked. You can change this in your browser’s site settings.");
    } catch { setMessage("Notifications aren’t available in this browser."); }
  }
  return <section className="rd-card"><div className="rd-card-body rd-settings-body"><h2>Stay in the loop</h2><p className="rd-muted">Get a discreet notification when new messages arrive while Red Door is open in a background tab.</p>{supported ? <button className="rd-btn" onClick={() => { if (enabled) { setEnabled(false); save(NOTIFICATION_ENABLED, false); } else void enable(); }}>{enabled ? "Turn off browser notifications" : "Enable browser notifications"}</button> : <p>This browser doesn’t support notifications.</p>}<label className="rd-setting-toggle"><span><strong>Discreet previews</strong><small>Show a generic message instead of unread counts.</small></span><input type="checkbox" checked={discreet} onChange={e => { setDiscreet(e.target.checked); save(NOTIFICATION_DISCREET, e.target.checked); }} /></label><p className="rd-caption">This preference applies to this browser. Notifications when the app is closed are not available yet.</p>{message ? <p role="status">{message}</p> : null}</div></section>;
}
