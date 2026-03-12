export const LAUNCH_TARGET_MS = Date.UTC(2026, 4, 1, 0, 0, 0);

export type CountdownParts = Readonly<{
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getCountdownParts(targetMs: number, nowMs: number): CountdownParts {
  const deltaMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(deltaMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return {
    days,
    hours,
    minutes,
    seconds,
    expired: deltaMs === 0
  };
}

export function normalizeMembershipCode(value: string): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function validateEarlyAccessSignup(name: string, email: string): string | null {
  const normalizedName = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (normalizedName.length < 2 || normalizedName.length > 80) {
    return "Enter your name using 2-80 characters.";
  }
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return "Enter a valid email address.";
  }
  return null;
}
