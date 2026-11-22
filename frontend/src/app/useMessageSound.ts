import { useEffect } from "react";
import { NOTIFICATION_ENABLED } from "./NotificationSettings";
import { appScopeUrl } from "./pwaRuntime";

export function useMessageSound(recipient: string | null): void {
  useEffect(() => {
    if (!recipient || typeof AudioContext === "undefined") return;
    const controller = new AbortController();
    let context: AudioContext | undefined;
    let sound: Promise<AudioBuffer> | undefined;

    function unlockAudio() {
      try {
        context ??= new AudioContext();
        if (context.state !== "running") void context.resume().catch(() => {});
      } catch { /* Audio is optional. */ }
    }

    async function playMessageSound(event: Event) {
      const update = (event as CustomEvent<{
        type?: string;
        payload?: { message?: { fromKey?: string; toKey?: string } };
      }>).detail;
      const message = update?.payload?.message;
      if (update?.type !== "chat_message" || message?.toKey !== recipient ||
          message.fromKey === recipient || document.hidden || context?.state !== "running") return;

      const audio = context;
      try {
        if (localStorage.getItem(NOTIFICATION_ENABLED) !== "true") return;
        sound ??= fetch(new URL("assets/whippet-ting.m4a", appScopeUrl()), { signal: controller.signal })
          .then(response => {
            if (!response.ok) throw new Error("Message sound unavailable.");
            return response.arrayBuffer();
          })
          .then(bytes => audio.decodeAudioData(bytes))
          .catch(error => {
            sound = undefined;
            throw error;
          });
        const buffer = await sound;
        if (controller.signal.aborted || document.hidden || audio.state !== "running" ||
            localStorage.getItem(NOTIFICATION_ENABLED) !== "true") return;
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(audio.destination);
        source.start();
      } catch { /* Audio is optional. */ }
    }

    window.addEventListener("pointerup", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("rd:inbox-update", playMessageSound);
    return () => {
      controller.abort();
      window.removeEventListener("pointerup", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("rd:inbox-update", playMessageSound);
      void context?.close().catch(() => {});
    };
  }, [recipient]);
}
