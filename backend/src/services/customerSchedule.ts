import type { ScheduledCustomerLocation } from "../../../shared/plus";
import { createHash } from "node:crypto";

const zone = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function localTime(now: number) {
  const { year, month, day, hour, minute } = Object.fromEntries(zone.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${year}-${month}-${day}`, minute: Number(hour) * 60 + Number(minute) };
}

export function customerScheduledLocation(locations: ScheduledCustomerLocation[] | undefined, now = Date.now()) {
  if (!locations?.length) return;
  const { minute } = localTime(now);
  return locations.find(window => window.startMinute <= minute && minute < window.endMinute);
}

export function customerScheduleWindow(userId: string, minutes: number, now: number) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
  const { date, minute: localMinute } = localTime(now);
  const seed = createHash("sha256").update(`${userId}:${date}`).digest();
  const weights = [seed[0] + 80, seed[1] + 80, seed[2] + 80];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const lengths = weights.map(weight => Math.min(480, Math.floor(minutes * weight / totalWeight)));
  for (let i = 0, left = minutes - lengths.reduce((a, b) => a + b, 0); left > 0; i = (i + 1) % lengths.length) {
    if (lengths[i] < 480) { lengths[i]++; left--; }
  }
  return lengths.map((length, index) => {
    const start = index * 480 + seed.readUInt16BE(3 + index * 2) % (481 - length);
    return { start, end: start + length };
  }).find(window => localMinute >= window.start && localMinute < window.end);
}

export function isCustomerScheduledOnline(userId: string, minutes: number | undefined, now = Date.now()): boolean {
  return minutes === undefined || customerScheduleWindow(userId, minutes, now) !== undefined;
}
