import type { PolicyDocument, RegistrationPolicy } from "../../../shared/registrationPolicy";

function document(url: string | undefined, version: string | undefined): PolicyDocument | undefined {
  if (!url || !version || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(version)) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return { url: parsed.href, version };
  } catch {}
}

export function registrationPolicy(env: NodeJS.ProcessEnv = process.env): RegistrationPolicy {
  if (env.REGISTRATION_POLICY_REQUIRED !== "true") return { status: "disabled" };
  const terms = document(env.REGISTRATION_TERMS_URL?.trim(), env.REGISTRATION_TERMS_VERSION?.trim());
  const privacy = document(env.REGISTRATION_PRIVACY_URL?.trim(), env.REGISTRATION_PRIVACY_VERSION?.trim());
  return terms && privacy ? { status: "required", terms, privacy } : { status: "unavailable" };
}
