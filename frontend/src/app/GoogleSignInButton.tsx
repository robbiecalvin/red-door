import React, { useEffect, useRef, useState } from "react";
import type { apiClient } from "./api";

export type GoogleCredential = Readonly<{ credential: string; nonce: string }>;

type GoogleIdentity = {
  initialize(options: {
    client_id: string;
    nonce: string;
    callback: (response: { credential?: string }) => void;
  }): void;
  renderButton(container: HTMLElement, options: {
    theme: "outline";
    size: "large";
    text: "signin_with" | "signup_with";
  }): void;
};

let scriptLoad: Promise<GoogleIdentity> | undefined;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  scriptLoad ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const failed = () => {
      script.remove();
      reject(new Error("Google sign-in is temporarily unavailable."));
    };
    script.onerror = failed;
    script.onload = () => {
      const identity = (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
      if (identity) resolve(identity);
      else failed();
    };
    document.head.append(script);
  }).catch(error => {
    scriptLoad = undefined;
    throw error;
  });
  return scriptLoad;
}

export function GoogleSignInButton({ api, register = false, disabled, onCredential }: {
  api: ReturnType<typeof apiClient>;
  register?: boolean;
  disabled: boolean;
  onCredential: (credential: GoogleCredential) => Promise<boolean> | boolean;
}): React.ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const action = useRef({ disabled, onCredential });
  action.current = { disabled, onCredential };
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"hidden" | "ready" | "failed">("hidden");

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let active = true;
    let submitted = false;

    async function renderButton() {
      const challenge = await api.getGoogleSignInChallenge().catch(() => null);
      if (!active || !challenge || !host) return;
      try {
        const google = await loadGoogleIdentity();
        if (!active) return;
        google.initialize({
          client_id: challenge.clientId,
          nonce: challenge.nonce,
          callback: ({ credential }) => {
            if (!active || submitted || action.current.disabled || !credential) return;
            submitted = true;
            void Promise.resolve(action.current.onCredential({ credential, nonce: challenge.nonce })).then(complete => {
              if (active && !complete) setAttempt(value => value + 1);
            });
          }
        });
        setStatus("ready");
        google.renderButton(host, { theme: "outline", size: "large", text: register ? "signup_with" : "signin_with" });
      } catch {
        if (active) setStatus("failed");
      }
    }

    void renderButton();
    return () => {
      active = false;
      host.replaceChildren();
    };
  }, [api, attempt, register]);

  return (
    <div style={{ marginBlock: status === "hidden" ? 0 : 12 }}>
      <div ref={container} hidden={status === "failed" || disabled} />
      {status === "failed" && <div role="status">
        <span>Google sign-in is temporarily unavailable. </span>
        <button type="button" className="rd-btn" disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Retry</button>
      </div>}
    </div>
  );
}
