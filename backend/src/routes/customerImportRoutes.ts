import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { AuthService, Session } from "../services/authService";
import { createProfileService, validateAdminProfile, type ProfileUpdate } from "../services/profileService";
import { MemberError, updateMember } from "../services/memberService";
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

function mapCustomer(row: Record<string, string>, email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("Invalid email address.");
  if (row.phone_e164 && !/^\+[1-9]\d{7,14}$/.test(row.phone_e164)) throw invalid("Phone number must use E.164 format.");
  if (unsupported.some(key => hasRecords(row[key]))) throw invalid("Media, billing and history require a separate import.");
  if (row.account_status && row.account_status.toLowerCase() !== "active") throw invalid("Only active accounts can be imported.");
  if (row.source_plan_name && row.source_plan_name.toLowerCase() !== "free") throw invalid("Only free accounts can be imported.");

  const stats: Record<string, string | number> = {};
  for (const [column, key] of Object.entries(profileFields)) if (row[column]) stats[key] = row[column];
  for (const [column, key] of Object.entries(numberFields)) if (row[column]) stats[key] = Number(row[column]);
  const hideProfile = flag(row.hide_profile, true);
  const hideLocation = flag(row.hide_location, true);
  const incognito = flag(row.incognito, false);
  let profile: ProfileUpdate = {
    displayName: row.display_name, age: row.age ? Number(row.age) : undefined,
    bio: row.bio ?? "", stats, discreetMode: flag(row.discreet_mode, false),
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
  const prompts: unknown = JSON.parse(row.profile_prompts_json || "[]");
  const rawLinks: unknown = JSON.parse(row.profile_links_json || "[]");
  if (!Array.isArray(rawLinks)) throw invalid("Profile links must be a JSON array.");
  const links = Object.fromEntries(rawLinks.map(link => [link.platform, { url: link.url, visible: link.visible }]));
  const member = updateMember(undefined, {
    hideProfile, hideLocation, incognito, profileLinks: links,
    interests: (row.interests || "").split(";").map(item => item.trim()).filter(Boolean), prompts,
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
    const apply = req.params.action === "apply";
    if (!apply && req.params.action !== "preview") return res.sendStatus(404);
    if (typeof req.body?.csv !== "string") return res.status(400).json({ message: "Choose a CSV file." });
    if (apply && importing) return res.status(409).json({ message: "Another import is running." });
    if (apply) importing = true;

    try {
      const [rawHeaders, ...rows] = readCsv(req.body.csv);
      const headers = rawHeaders?.map(header => header.trim()) ?? [];
      if (!["email", "display_name", "age"].every(key => headers.includes(key)) || new Set(headers).size !== headers.length) {
        throw invalid("Include unique headers for email, display_name and age.");
      }
      if (rows.length > 1000) throw invalid("Import at most 1000 rows at once.");
      const existing = new Map(deps.auth.listUsers().map(user => [user.email.toLowerCase(), user.id]));
      const seenEmails = new Set<string>(), seenIds = new Set<string>();
      const results = [];
      for (const [index, cells] of rows.entries()) {
        const rowNumber = index + 2;
        if (!cells.some(value => value.trim())) continue;
        try {
          if (cells.length !== headers.length) throw invalid("The row does not match the header width.");
          const row = Object.fromEntries(headers.map((key, column) => [key, cells[column].trim()]));
          const email = row.email.toLowerCase();
          if (!email) throw invalid("Email is missing.");
          const input = mapCustomer(row, email);
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
          const marker = { sourceId: input.sourceId, completed: false, autoReplies: false, city: row.city || undefined, neighbourhood: row.neighbourhood || undefined };
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
