import { describe, it, expect } from "vitest";
import { canPublish, type ClaimForGate } from "@/lib/content/publish-gate";

describe("canPublish", () => {
  it("blocks publish while any claim is unresolved (non-owner)", () => {
    const claims: ClaimForGate[] = [{ status: "unresolved" }, { status: "resolved" }];
    const result = canPublish(claims, "editor", false);
    expect(result.canPublish).toBe(false);
    if (!result.canPublish) {
      expect(result.reason).toMatch(/unresolved/i);
    }
  });

  it("blocks a non-owner from publishing via override even if they attempt one", () => {
    const claims: ClaimForGate[] = [{ status: "unresolved" }];
    // A non-owner cannot use the override path at all, regardless of
    // whether overrideRecorded is (incorrectly) true — the actorRole gate
    // takes precedence.
    const result = canPublish(claims, "admin", true);
    expect(result.canPublish).toBe(false);
    if (!result.canPublish) {
      expect(result.reason).toBeTruthy();
    }
  });

  it("unblocks once every claim is resolved", () => {
    const claims: ClaimForGate[] = [{ status: "resolved" }, { status: "resolved" }];
    const result = canPublish(claims, "editor", false);
    expect(result.canPublish).toBe(true);
  });

  it("unblocks via a recorded owner override", () => {
    const claims: ClaimForGate[] = [{ status: "overridden" }, { status: "resolved" }];
    const result = canPublish(claims, "owner", true);
    expect(result.canPublish).toBe(true);
  });

  it("blocks an owner's override attempt if it was not actually recorded", () => {
    const claims: ClaimForGate[] = [{ status: "unresolved" }];
    const result = canPublish(claims, "owner", false);
    expect(result.canPublish).toBe(false);
  });

  it("allows publish with zero claims at all", () => {
    expect(canPublish([], "editor", false).canPublish).toBe(true);
    expect(canPublish([], "viewer", false).canPublish).toBe(true);
  });

  it("blocks for every non-owner role (viewer, editor, admin) when claims are unresolved", () => {
    const claims: ClaimForGate[] = [{ status: "unresolved" }];
    for (const role of ["viewer", "editor", "admin"] as const) {
      expect(canPublish(claims, role, true).canPublish).toBe(false);
    }
  });

  it("unblocks for owner with a recorded override even when ALL claims are unresolved", () => {
    const claims: ClaimForGate[] = [{ status: "unresolved" }, { status: "unresolved" }];
    const result = canPublish(claims, "owner", true);
    expect(result.canPublish).toBe(true);
  });
});
