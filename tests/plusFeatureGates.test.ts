import { createChatService } from "../backend/src/services/chatService";
import { createFavoritesService } from "../backend/src/services/favoritesService";
import { createMediaService, type MediaRecord } from "../backend/src/services/mediaService";
import { createProfileService, type Profile } from "../backend/src/services/profileService";

const free = { sessionToken: "sender", userId: "sender", userType: "registered" as const, tier: "free" as const, ageVerified: true, mode: "cruise" as const };
const paid = { ...free, tier: "premium" as const };
// Acceptance: free messaging/read tracking continues, but read receipts and group invitations
// require Plus. Privacy and ownership apply to media regardless of plan.
describe("Plus feature enforcement", () => {
  it("Given free access When sending direct messages and reading Then keeps unread tracking but hides sender read receipts", () => {
    let now = 1000;
    const svc = createChatService({ nowMs: () => now });
    expect(svc.sendMessage(free, { chatKind: "cruise", toKey: "user:recipient", text: "Hello" }).ok).toBe(true);
    now += 100;
    expect(svc.markRead({ ...free, userId: "recipient", sessionToken: "recipient" }, "cruise", "user:sender").ok).toBe(true);
    const hidden = svc.listMessages(free, "cruise", "user:recipient"), visible = svc.listMessages(paid, "cruise", "user:recipient");
    if (!hidden.ok || !visible.ok) throw new Error("Unexpected chat failure");
    expect(hidden.value[0].readAtMs).toBeUndefined();
    expect(visible.value[0].readAtMs).toBe(1100);
    expect(svc.sendMessage(free, { chatKind: "cruise", toKey: "user:recipient", text: "GROUP_INVITE_REQUEST|id|user:sender|user:other" }).ok).toBe(false);
    expect(svc.sendMessage(paid, { chatKind: "cruise", toKey: "user:recipient", text: "GROUP_INVITE_REQUEST|id|user:sender|user:other" }).ok).toBe(true);
  });
  it("Given the free favorite limit When adding another favorite Then rejects while allowing removal and a Plus upgrade", () => {
    const svc = createFavoritesService();
    for (let n = 0; n < 20; n++) expect(svc.toggle(free, `person-${n}`).ok).toBe(true);
    expect(svc.toggle(free, "extra").ok).toBe(false);
    expect(svc.toggle(paid, "extra").ok).toBe(true);
    expect(svc.toggle(free, "person-1").ok).toBe(true);
  });
  it("Given free access When enabling travel Then rejects while retaining ordinary profile editing", async () => {
    let profile: Profile | null = null;
    const svc = createProfileService({ repo: { async getByUserId() { return profile; }, async listAll() { return profile ? [profile] : []; }, async upsert(next) { profile = next; } } });
    const input = { displayName: "Member", age: 25, bio: "Hi" };
    expect((await svc.upsertMe(free, input)).ok).toBe(true);
    expect((await svc.upsertMe(free, { ...input, travelMode: { enabled: true, lat: 49, lng: -123 } })).ok).toBe(false);
    expect((await svc.upsertMe(paid, { ...input, travelMode: { enabled: true, lat: 49, lng: -123 } })).ok).toBe(true);
  });
  it("Given private media When completed Then never attaches to public galleries or issues a public URL", async () => {
    let profile: Profile = { userId: free.userId, displayName: "Member", age: 25, bio: "", stats: {}, galleryMediaIds: [], updatedAtMs: 1 };
    const records = new Map<string, MediaRecord>();
    const svc = createMediaService({ bucket: "test", repo: { async createInitiated(m) { records.set(m.mediaId, m); }, async getById(id) { return records.get(id) ?? null; }, async markUploaded(id, time) { records.set(id, { ...records.get(id)!, uploadedAtMs: time }); } }, profileRepo: { async getByUserId() { return profile; }, async listAll() { return [profile]; }, async upsert(next) { profile = next; } }, storage: { async presignPutObject() { return "upload"; }, async presignGetObject() { return "download"; }, async headObject() { return { ok: true, sizeBytes: 10 }; } } });
    expect((await svc.initiateUpload(free, { kind: "video", mimeType: "video/mp4", sizeBytes: 10 })).ok).toBe(false);
    const upload = await svc.initiateUpload(free, { kind: "photo_private", mimeType: "image/png", sizeBytes: 10 });
    if (!upload.ok) throw new Error(upload.error.message);
    expect(upload.value.objectKey.startsWith("private-profiles/")).toBe(true);
    expect((await svc.completeUpload(free, upload.value.mediaId)).ok).toBe(true);
    expect(profile.galleryMediaIds).toHaveLength(0);
    expect((await svc.getPublicDownloadUrl(upload.value.mediaId)).ok).toBe(false);
    expect((await svc.completeUpload({ ...free, userId: "attacker" }, upload.value.mediaId)).ok).toBe(false);
  });
});
