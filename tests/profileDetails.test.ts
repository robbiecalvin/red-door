import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PROFILE_DETAIL_FIELDS, parseProfileDetails } from "../shared/profileDetails";
import { createProfileService } from "../backend/src/services/profileService";
import { createInMemoryProfileRepository } from "../backend/src/repositories/inMemoryProfileRepository";

// Acceptance: optional self-reported data, exact choices, semicolon lists,
// valid calendar dates, persistence, clearing, and existing age/owner restrictions.
describe("Optional self-reported profile details", () => {
  const details = { lookingFor: "friends; cuddle times", relationshipStatus: "single", hivStatus: "undetectable", lastStiCheck: "2024-02-29", prep: "yes", kinks: "Bondage; Blindfolds; Wax Play", tribe: "Otter; Bear", bodyType: "Average" };
  it("Given blank health fields When normalized Then leaves them unanswered", () => {
    expect(parseProfileDetails({})).toEqual({});
    expect(parseProfileDetails({ hivStatus: "", prep: "", lastStiCheck: "" })).toEqual({});
  });
  it("Given listed options When selected Then accepts every option and normalizes semicolons", () => {
    for (const field of PROFILE_DETAIL_FIELDS) {
      if (!("options" in field)) continue;
      for (const option of field.options) expect(parseProfileDetails({ [field.key]: option })).toEqual({ [field.key]: option });
    }
    expect(parseProfileDetails({ ...details, kinks: "Bondage;Blindfolds; Wax Play;Bondage" })).toEqual(details);
  });
  it.each([
    ["hivStatus", "unknown"], ["prep", false], ["relationshipStatus", "single; married"],
    ["bodyType", "other"], ["lookingFor", "friends; invalid"], ["tribe", "Bear, Otter"],
    ["kinks", ["Bondage"]], ["lastStiCheck", "2025-02-29"], ["lastStiCheck", "2026-13-01"],
    ["lastStiCheck", "2026-01-32"], ["lastStiCheck", "01/01/2026"]
  ])("Given invalid %s When saved Then rejects the value", (key, value) => {
    expect(() => parseProfileDetails({ [key]: value })).toThrow();
  });
  it("Given a registered owner When saving and restarting Then preserves all fields and allows clearing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "profile-details-"));
    try {
      const storeFilePath = path.join(root, "profiles.json");
      const session = { userType: "registered" as const, userId: "owner", ageVerified: true };
      const input = { displayName: "Test Owner", age: 28, bio: "", stats: details };
      const service = createProfileService({ repo: createInMemoryProfileRepository({ storeFilePath }) });
      const saved = await service.upsertMe(session, input);
      expect(saved.ok).toBe(true);
      const restarted = createProfileService({ repo: createInMemoryProfileRepository({ storeFilePath }) });
      const read = await restarted.getMe(session);
      if (!read.ok) throw Error(read.error.message);
      expect(parseProfileDetails(read.value.stats)).toEqual(details);
      const cleared = await restarted.upsertMe(session, { ...input, stats: {} });
      if (!cleared.ok) throw Error(cleared.error.message);
      expect(parseProfileDetails(cleared.value.stats)).toEqual({});
      const invalid = await service.upsertMe(session, { ...input, stats: { prep: "maybe" } });
      expect(invalid).toEqual({ ok: false, error: { code: "INVALID_INPUT", message: "PrEP contains an invalid selection." } });
      const underage = await service.upsertMe({ ...session, ageVerified: false }, input);
      expect(underage).toMatchObject({ ok: false, error: { code: "AGE_GATE_REQUIRED" } });
      const other = await restarted.getMe({ ...session, userId: "someone-else" });
      expect(other).toMatchObject({ ok: false, error: { code: "PROFILE_NOT_FOUND" } });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
