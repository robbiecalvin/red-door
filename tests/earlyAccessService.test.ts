import os from "node:os";
import path from "node:path";

import { createEarlyAccessService, normalizeMembershipCode } from "../backend/src/services/earlyAccessService";

function tempStorePath(): string {
  return path.join(os.tmpdir(), `reddoor-early-access-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe("earlyAccessService", () => {
  it("stores a new signup and returns a membership code", async () => {
    const svc = createEarlyAccessService({
      filePath: tempStorePath(),
      nowMs: () => 1_700_000_000_000,
      membershipCodeGenerator: () => "red-1234abcd"
    });

    const result = await svc.registerInterest("Robert Mitchell", "Robert@example.com");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toEqual({
      name: "Robert Mitchell",
      email: "robert@example.com",
      membershipCode: "RED-1234ABCD",
      createdAtMs: 1_700_000_000_000,
      existing: false
    });
  });

  it("returns the existing membership code for a repeat email signup", async () => {
    const svc = createEarlyAccessService({
      filePath: tempStorePath(),
      membershipCodeGenerator: () => "RED-ABCD1234"
    });

    const first = await svc.registerInterest("Robert Mitchell", "Robert@example.com");
    const second = await svc.registerInterest("Different Name", "robert@example.com");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.value.existing).toBe(true);
    expect(second.value.membershipCode).toBe("RED-ABCD1234");
    expect(second.value.name).toBe("Robert Mitchell");
  });

  it("validates a saved membership code", async () => {
    const svc = createEarlyAccessService({
      filePath: tempStorePath(),
      membershipCodeGenerator: () => "red-access01"
    });

    await svc.registerInterest("Robert Mitchell", "robert@example.com");
    const result = await svc.validateMembershipCode(" red-access01 ");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.membershipCode).toBe("RED-ACCESS01");
    expect(normalizeMembershipCode(result.value.membershipCode)).toBe("RED-ACCESS01");
  });
});
