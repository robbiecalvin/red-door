export const PRIORITY_INVITATION_CODE = "PRIORITYX90";
export const FOUNDER_PRICE_CENTS = 499;
export const REFERRAL_INTRO_CENTS = 1499;
export const REFERRAL_RENEWAL_CENTS = 999;

export function threeMonthsAfter(startMs: number): number {
  const date = new Date(startMs);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

export const DEFAULT_PRIORITY_RADIUS_KM = 100;
export const PRIORITY_ACTIVITY_MS = 24 * 60 * 60 * 1000;

export function withinPriorityRadius(a: { lat: number; lng: number }, b: { lat: number; lng: number }, radiusKm: number) {
  const rad = Math.PI / 180;
  const hav = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(hav))) <= radiusKm;
}
