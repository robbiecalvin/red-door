import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { AuthService, Session, StoredUser } from "../services/authService";
import { createProfileService, validateAdminProfile, type Profile, type ProfileUpdate } from "../services/profileService";
import { MemberError, updateMember } from "../services/memberService";
import type { CustomerImportSettings, FacilitatedReplyRule, ScheduledCustomerLocation } from "../../../shared/plus";
import { DEFAULT_MEMBER } from "../../../shared/member";

const profileFields = {
  body_type: "bodyType", relationship_status: "relationshipStatus", looking_for: "lookingFor",
  cut_status: "cutStatus", race: "race", position: "position", tribe: "tribe", kinks: "kinks",
} as const;
const numberFields = { height_inches: "heightInches", weight_lbs: "weightLbs", cock_size_inches: "cockSizeInches" } as const;
const unsupported = ["media_json", "blocked_customer_ids", "favorite_customer_ids", "private_album_access_json",
  "conversations_json", "messages_json", "message_attachments_json", "groups_json", "group_memberships_json",
  "posts_and_plans_json", "rsvps_json", "billing_customer_id", "billing_subscription_id", "plus_expires_at", "priority_approved_at"];
const invalid = (message: string) => new MemberError("INVALID_IMPORT", message);

function readCsv(input: string): string[][] {
  const csv = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], offset = 0;
  const field = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\n|\r|$)/y;
  while (offset < csv.length) {
    field.lastIndex = offset;
    const match = field.exec(csv);
    if (!match || field.lastIndex === offset) throw invalid("The CSV contains a malformed quoted field.");
    offset = field.lastIndex;
    row.push(match[1]?.replace(/""/g, '"') ?? match[2]);
    if (match[3] !== ",") { rows.push(row); row = []; }
  }
  if (row.length) rows.push([...row, ""]);
  return rows;
}

const hasRecords = (value?: string) => Boolean(value && value !== "[]" && value !== "{}");
function flag(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  if (!/^(true|false)$/i.test(value)) throw invalid("Privacy values must be TRUE or FALSE.");
  return /^true$/i.test(value);
}

function photoLink(value?: string): string | undefined {
  if (!value) return;
  let url: URL;
  try { url = new URL(value); } catch { throw invalid("Photo links must be valid HTTPS URLs."); }
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 430) {
    throw invalid("Use an HTTPS photo URL at most 430 characters, with no embedded credentials.");
  }
  return url.href;
}

const namedAreas = new Map<string, { lat: number; lng: number }>([
  ["downtown vancouver", { lat: 49.282, lng: -123.120 }],
  ["mount pleasant", { lat: 49.262, lng: -123.101 }],
  ["west end", { lat: 49.286, lng: -123.134 }],
]);

function timeInMinutes(value: unknown, allowEndOfDay = false): number {
  if (allowEndOfDay && value === "24:00") return 1440;
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw invalid("Scheduled locations use 24-hour HH:MM times.");
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseScheduledLocations(json: string): ScheduledCustomerLocation[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value) || value.length > 12) throw invalid("Provide a JSON array of up to 12 scheduled locations.");
  const windows = value.map(entry => {
    if (!entry || typeof entry.area !== "string" || !entry.area.trim() || entry.area.trim().length > 80) {
      throw invalid("Each scheduled location needs an area name of up to 80 characters.");
    }
    const area = entry.area.trim();
    const startMinute = timeInMinutes(entry.start);
    const endMinute = timeInMinutes(entry.end, true);
    if (startMinute >= endMinute) throw invalid("End time must be later than start time. Split windows that cross midnight.");
    const point = entry.approx_latitude === undefined && entry.approx_longitude === undefined
      ? namedAreas.get(area.toLowerCase()) : { lat: entry.approx_latitude, lng: entry.approx_longitude };
    if (!point || typeof point.lat !== "number" || typeof point.lng !== "number" ||
        !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
      throw invalid("Supply valid approximate coordinates for each area without a built-in point.");
    }
    return { area, startMinute, endMinute, lat: point.lat, lng: point.lng };
  }).sort((left, right) => left.startMinute - right.startMinute);
  if (windows.some((window, index) => index > 0 && window.startMinute < windows[index - 1].endMinute)) {
    throw invalid("Scheduled location windows cannot overlap.");
  }
  return windows;
}

function spreadsheetSettings(row: Record<string, string>, current?: CustomerImportSettings) {
  let facilitatedReplies = current?.facilitatedReplies;
  if (row.facilitated_replies_json) {
    const rules: unknown = JSON.parse(row.facilitated_replies_json);
    if (!Array.isArray(rules) || rules.length > 20 || rules.some(rule =>
      !rule || typeof rule !== "object" || !Array.isArray(rule.triggers) || !Array.isArray(rule.replies) ||
      [rule.triggers, rule.replies].some(values => values.length < 1 || values.length > 12 ||
        values.some((value: unknown) => typeof value !== "string" || !value.trim() || value.length > 240))
    )) throw invalid("Facilitated replies must be a JSON array of up to 20 rules with triggers and replies.");
    facilitatedReplies = (rules as FacilitatedReplyRule[]).map(rule => ({
      triggers: rule.triggers.map(value => value.trim()), replies: rule.replies.map(value => value.trim()),
    }));
  }
  let onlineMinutesPerDay = current?.onlineMinutesPerDay;
  if (row.online_hours_per_day) {
    const hours = Number(row.online_hours_per_day);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) throw invalid("Online hours per day must be between 0 and 24.");
    onlineMinutesPerDay = Math.round(hours * 60);
  }
  const scheduledLocations = row.scheduled_locations_json
    ? parseScheduledLocations(row.scheduled_locations_json) : current?.scheduledLocations;
  const locationConsentAtMs = row.location_consent_at ? Date.parse(row.location_consent_at) : current?.locationConsentAtMs;
  if (scheduledLocations?.length && (onlineMinutesPerDay === undefined || !Number.isFinite(locationConsentAtMs))) {
    throw invalid("Scheduled locations require online_hours_per_day and a valid location_consent_at.");
  }
  return { facilitatedReplies, onlineMinutesPerDay, scheduledLocations, locationConsentAtMs: Number.isFinite(locationConsentAtMs) ? locationConsentAtMs : undefined,
    rightNowTrigger: flag(row.right_now_trigger, current?.rightNowTrigger ?? false),
  };
}

function mapCustomer(row: Record<string, string>, email: string, existing?: { profile: Profile; user: StoredUser }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("Invalid email address.");
  if (row.phone_e164 && !/^\+[1-9]\d{7,14}$/.test(row.phone_e164)) throw invalid("Phone number must use E.164 format.");
  if (unsupported.some(key => hasRecords(row[key]))) throw invalid("Media, billing and history require a separate import.");
  if (row.account_status && row.account_status.toLowerCase() !== "active") throw invalid("Only active accounts can be imported.");
  if (row.source_plan_name && row.source_plan_name.toLowerCase() !== "free") throw invalid("Only free accounts can be imported.");

  const stats: Record<string, unknown> = { ...existing?.profile.stats };
  for (const [column, key] of Object.entries(profileFields)) if (row[column]) stats[key] = row[column];
  for (const [column, key] of Object.entries(numberFields)) if (row[column]) stats[key] = Number(row[column]);
  const preferences = existing?.user.plusData?.member;
  const hideProfile = flag(row.hide_profile, preferences?.hideProfile ?? true);
  const hideLocation = flag(row.hide_location, preferences?.hideLocation ?? true);
  const incognito = flag(row.incognito, preferences?.incognito ?? false);
  let profile: ProfileUpdate = {
    displayName: row.display_name || existing?.profile.displayName,
    age: row.age ? Number(row.age) : existing?.profile.age,
    bio: row.bio || existing?.profile.bio || "", stats,
    discreetMode: flag(row.discreet_mode, existing?.profile.discreetMode ?? false),
  };
  const lat = Number(row.approx_latitude), lng = Number(row.approx_longitude);
  if (row.approx_latitude || row.approx_longitude) {
    if (!row.approx_latitude || !row.approx_longitude || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw invalid("Location requires valid latitude and longitude.");
    }
    if (!hideLocation && Number.isFinite(Date.parse(row.location_consent_at))) {
      profile = { ...profile, travelMode: { enabled: true, lat, lng } };
    }
  }
  const issue = validateAdminProfile(profile);
  if (issue) throw invalid(issue);
  const prompts: unknown = row.profile_prompts_json ? JSON.parse(row.profile_prompts_json) : preferences?.prompts ?? [];
  const rawLinks: unknown = JSON.parse(row.profile_links_json || "[]");
  if (!Array.isArray(rawLinks)) throw invalid("Profile links must be a JSON array.");
  const links = {
    ...Object.fromEntries(Object.keys(row.profile_links_json ? preferences?.profileLinks ?? {} : {}).map(key => [key, null])),
    ...Object.fromEntries(rawLinks.map(link => [link.platform, { url: link.url, visible: link.visible }])),
  };
  const member = updateMember(preferences, {
    hideProfile, hideLocation, incognito, profileLinks: links,
    interests: row.interests ? (row.interests === "[]" ? [] : row.interests.split(";").map(item => item.trim()).filter(Boolean)) : preferences?.interests ?? [], prompts,
  }, { tier: "free", userType: "registered" });
  const createdAtMs = row.account_created_at ? Date.parse(row.account_created_at) : undefined;
  if (createdAtMs !== undefined && !Number.isFinite(createdAtMs)) throw invalid("Invalid account creation date.");
  const sourceId = row.source_customer_id || email;
  return { sourceId, profile, member, createdAtMs };
}

export function installCustomerImportRoutes(app: Express, deps: {
  auth: AuthService;
  profiles: ReturnType<typeof createProfileService>;
  admin(req: Request, res: Response): Session | null;
  persist(): Promise<void>;
}): void {
  let importing = false;
  app.post("/admin/customer-import/:action", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!deps.admin(req, res)) return;
    const updatePhotos = req.params.action === "photos";
    const update = req.params.action === "update" || req.params.action === "update-preview";
    const apply = req.params.action === "apply" || req.params.action === "update" || updatePhotos;
    if (!apply && !update && req.params.action !== "preview") return res.sendStatus(404);
    if (typeof req.body?.csv !== "string") return res.status(400).json({ message: "Choose a CSV file." });
    if (apply && importing) return res.status(409).json({ message: "Another import is running." });
    if (apply) importing = true;

    try {
      const [rawHeaders, ...rows] = readCsv(req.body.csv);
      const headers = rawHeaders?.map(header => header.trim()) ?? [];
      const required = updatePhotos ? ["email", "auto_reply_photo_url"] : update ? [] : ["email", "display_name", "age"];
      if (!required.every(key => headers.includes(key)) || new Set(headers).size !== headers.length ||
          (update && !headers.some(key => key === "email" || key === "source_customer_id"))) {
        throw invalid(update ? "Include an email or source_customer_id column and use unique headers." :
          updatePhotos ? "Include email and auto_reply_photo_url headers." : "Include unique headers for email, display_name and age.");
      }
      if (rows.length > 1000) throw invalid("Import at most 1000 rows at once.");
      const existing = new Map(deps.auth.listUsers().map(user => [user.email.toLowerCase(), user.id]));
      const bySource = new Map<string, Set<string>>();
      if (update) for (const id of existing.values()) {
        const imported = deps.auth.getUser(id)?.plusData?.customerImport;
        if (!imported?.completed) continue;
        const ids = bySource.get(imported.sourceId) ?? new Set();
        ids.add(id);
        bySource.set(imported.sourceId, ids);
      }
      const seenEmails = new Set<string>(), seenIds = new Set<string>(), updatedIds = new Set<string>();
      const results = [];
      for (const [index, cells] of rows.entries()) {
        const rowNumber = index + 2;
        if (!cells.some(value => value.trim())) continue;
        try {
          if (cells.length !== headers.length) throw invalid("The row does not match the header width.");
          const row = Object.fromEntries(headers.map((key, column) => [key, cells[column].trim()]));
          const email = (row.email ?? "").toLowerCase();
          if (update) {
            const source = row.source_customer_id;
            if (!source && !email) throw invalid("Email or source customer ID is missing.");
            const sourceMatches = source ? bySource.get(source) : undefined;
            const emailId = email ? existing.get(email) : undefined;
            if (sourceMatches && sourceMatches.size > 1) throw invalid("Source customer ID is ambiguous.");
            const id = source ? sourceMatches?.values().next().value : emailId;
            if (source && email && id !== emailId) throw invalid("Email and source ID do not match the same account.");
            const user = id ? deps.auth.getUser(id) : undefined;
            const marker = user?.plusData?.customerImport;
            if (!user || !marker?.completed) {
              results.push({ row: rowNumber, status: "skipped", message: "No matching imported account." });
              continue;
            }
            if (updatedIds.has(user.id)) throw invalid("This account appears more than once in the file.");
            const previous = await deps.profiles.adminGetProfile(user.id);
            if (!previous.ok) throw invalid(previous.error.message);
            const input = mapCustomer(row, user.email, { profile: previous.value, user });
            const photoUrl = photoLink(row.auto_reply_photo_url);
            spreadsheetSettings(row, marker);
            updatedIds.add(user.id);
            if (!apply) {
              results.push({ row: rowNumber, status: "ready" });
              continue;
            }
            const written = await deps.profiles.adminUpsertProfile(user.id, input.profile);
            if (!written.ok) throw invalid(written.error.message);
            const current = deps.auth.getUser(user.id);
            if (!current?.plusData?.customerImport) throw new Error("Import account missing.");
            const member = mapCustomer(row, user.email, { profile: previous.value, user: current }).member;
            const changed = deps.auth.updatePlus(user.id, {
              ...(row.phone_e164 ? { phoneE164: row.phone_e164 } : {}),
              plusData: { ...current.plusData, member, customerImport: {
                ...current.plusData.customerImport, ...spreadsheetSettings(row, current.plusData.customerImport), city: row.city || current.plusData.customerImport.city,
                neighbourhood: row.neighbourhood || current.plusData.customerImport.neighbourhood,
                photoUrl: photoUrl ?? current.plusData.customerImport.photoUrl,
              } },
            });
            if (!changed.ok) throw invalid(changed.error.message);
            await deps.persist();
            results.push({ row: rowNumber, status: "updated" });
            continue;
          }
          if (!email) throw invalid("Email is missing.");
          if (updatePhotos) {
            if (!row.auto_reply_photo_url) continue;
            const id = existing.get(email);
            const user = id ? deps.auth.getUser(id) : undefined;
            const marker = user?.plusData?.customerImport;
            if (!user || !marker?.completed) throw invalid("No matching imported account.");
            const photoUrl = photoLink(row.auto_reply_photo_url);
            const changed = deps.auth.updatePlus(user.id, { plusData: { ...user.plusData, customerImport: { ...marker, photoUrl } } });
            if (!changed.ok) throw invalid(changed.error.message);
            await deps.persist();
            results.push({ row: rowNumber, status: "updated" });
            continue;
          }
          const photoUrl = photoLink(row.auto_reply_photo_url);
          const input = mapCustomer(row, email);
          const settings = spreadsheetSettings(row);
          if (seenEmails.has(email) || seenIds.has(input.sourceId)) throw invalid("Duplicate email or source ID in the file.");
          seenEmails.add(email);
          seenIds.add(input.sourceId);
          const id = existing.get(email);
          let user = id ? deps.auth.getUser(id) : undefined;
          const previous = user?.plusData?.customerImport;
          if (user && (!previous || previous.completed || previous.sourceId !== input.sourceId)) {
            results.push({ row: rowNumber, status: "skipped", message: "An account already exists." });
            continue;
          }
          if (!apply) {
            results.push({ row: rowNumber, status: "ready", message: row.source_customer_id ? undefined : "Email will serve as the source ID." });
            continue;
          }
          const marker = { sourceId: input.sourceId, completed: false, autoReplies: false, ...settings, city: row.city || undefined, neighbourhood: row.neighbourhood || undefined, photoUrl };
          if (!user) {
            const created = deps.auth.adminCreateUser(email, randomBytes(32).toString("base64url"), row.phone_e164 || null,
              "registered", "free", "user", { createdAtMs: input.createdAtMs, data: {
                customerImport: marker, member: { ...DEFAULT_MEMBER, hideProfile: true, hideLocation: true },
              } });
            if (!created.ok) throw invalid(created.error.message);
            user = created.value;
            existing.set(email, user.id);
            await deps.persist();
          }
          const written = await deps.profiles.adminUpsertProfile(user.id, input.profile);
          if (!written.ok) throw invalid(written.error.message);
          const current = deps.auth.getUser(user.id);
          if (!current) throw new Error("Import account missing.");
          const completed = deps.auth.updatePlus(current.id, { plusData: { ...current.plusData, member: input.member,
            customerImport: { ...marker, completed: true, autoReplies: req.body.autoReplies === true },
          } });
          if (!completed.ok) throw invalid(completed.error.message);
          await deps.persist();
          results.push({ row: rowNumber, status: "imported" });
        } catch (error) {
          results.push({ row: rowNumber, status: "error", message: error instanceof MemberError ? error.message :
            error instanceof SyntaxError ? "Invalid JSON in a profile field." : "Could not confirm this row was saved. Check server health and rerun the preview." });
        }
      }
      return res.json({ results });
    } catch (error) {
      return res.status(error instanceof MemberError ? 400 : 503).json({ message: error instanceof MemberError ? error.message : "Unable to read this import." });
    } finally {
      if (apply) importing = false;
    }
  });
}
